/**
 * Clock-in / clock-out core.
 *
 * Per the F1 #1 schema reconciliation, time tracking lives in TWO
 * tables:
 *
 *   daily_time_logs  : one row per (user_email, log_date). Holds
 *                      pay-rate snapshot, total_minutes, status.
 *   job_time_entries : per-job duration slice. Mobile creates one
 *                      row on clock-in, updates it on clock-out.
 *
 * Clock-in flow:
 *   1. Ensure today's daily_time_logs row exists (find-or-create).
 *   2. Best-effort GPS fix (lib/location.ts).
 *   3. INSERT a job_time_entries row with started_at = now,
 *      ended_at = NULL, clock_in_lat/lon = the fix.
 *
 * Clock-out flow:
 *   1. Find the open entry for the current user (ended_at IS NULL).
 *   2. Best-effort GPS fix.
 *   3. UPDATE that row with ended_at + clock_out_lat/lon +
 *      duration_minutes.
 *
 * "Open" is defined as ended_at IS NULL. There should be at most
 * ONE open entry per user at any time — clock-in throws if one
 * already exists; the UI prevents calling clock-in twice in a row
 * via useActiveTimeEntry, but the throw is the safety net.
 *
 * All writes go through PowerSync's local SQLite via db.execute();
 * the upload queue replays them against Supabase when sync is
 * configured. Works fully offline today.
 */
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { getCurrentPosition, type GpsFailureReason } from './location';
import { logError, logInfo, logWarn } from './log';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  writeBoundaryPing,
} from './locationTracker';
import { durationMinutesBetween, todayLocalISODate } from './timeFormat';
import {
  cancelStillWorkingPrompts,
  scheduleStillWorkingPrompts,
} from './timePrompts';
import { randomUUID } from './uuid';

export type EntryType = 'on_site' | 'travel' | 'office' | 'overhead';

/**
 * Human label for an entry-type column. Co-located with the
 * `EntryType` union so adding a new variant forces an update here
 * (and `default:` keeps unknown server-side values rendering safely).
 */
export function entryTypeLabel(type: EntryType | string | null | undefined): string {
  switch (type) {
    case 'on_site':
      return 'On site';
    case 'travel':
      return 'Travel';
    case 'office':
      return 'Office';
    case 'overhead':
      return 'Overhead';
    default:
      return 'Time entry';
  }
}

export type JobTimeEntry = AppDatabase['job_time_entries'];

export interface ActiveEntry {
  entry: JobTimeEntry;
  /** Recomputed every 30 s so the UI's duration counter stays fresh. */
  elapsedMs: number;
  /** Linked job name when entry.job_id is set; null for office/travel/overhead. */
  jobName: string | null;
}

const TICK_MS = 30_000;

/**
 * Subscribe to "the user's currently-open clock-in entry." Returns
 * `null` when the user is clocked out, the entry + elapsed time
 * when clocked in. The smallest unit the UI shows is "1m", so
 * ticking faster than 30s just burns battery.
 */
export function useActiveTimeEntry(): {
  active: ActiveEntry | null;
  isLoading: boolean;
} {
  const { session } = useAuth();
  const userEmail = session?.user.email ?? null;

  const queryParams = useMemo(
    () => (userEmail ? [userEmail] : []),
    [userEmail]
  );

  // LEFT JOIN so entries with NULL job_id (office/travel/overhead)
  // still come back; the joined name is null in those cases.
  const { data, isLoading, error } = useQuery<JobTimeEntry & { _job_name: string | null }>(
    `SELECT j.*, jobs.name AS _job_name
     FROM job_time_entries AS j
     LEFT JOIN jobs ON jobs.id = j.job_id
     WHERE j.user_email = ?
       AND j.ended_at IS NULL
     ORDER BY j.started_at DESC
     LIMIT 1`,
    queryParams
  );

  useEffect(() => {
    if (error) logError('timeTracking.useActiveTimeEntry', 'query failed', error);
  }, [error]);

  const entry = data?.[0] ?? null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!entry?.started_at) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [entry?.started_at]);

  return useMemo(() => {
    if (!userEmail) return { active: null, isLoading: false };
    if (isLoading) return { active: null, isLoading: true };
    if (!entry) return { active: null, isLoading: false };

    // Strip the JOIN-only field so consumers see a clean JobTimeEntry.
    const { _job_name, ...rest } = entry;
    const cleanEntry = rest as JobTimeEntry;
    const elapsedMs = cleanEntry.started_at
      ? Math.max(0, now - Date.parse(cleanEntry.started_at))
      : 0;

    return {
      active: {
        entry: cleanEntry,
        elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
        jobName: _job_name,
      },
      isLoading: false,
    };
  }, [entry, isLoading, now, userEmail]);
}

/**
 * Clock-in action factory. Returned function is stable across
 * renders so consumers can pass it to onPress without re-binding.
 *
 * Throws if an entry is already open for this user — the UI should
 * prevent that, but we want loud failure if it ever slips past the
 * UI guard.
 */
export interface ClockInResult {
  /** True when phone GPS landed at clock-in time. False on permission
   *  denial / timeout / hardware fault. */
  hasGps: boolean;
  /** Why GPS failed when hasGps is false; null when hasGps is true.
   *  Drives the screen's user-facing prompt. */
  gpsReason: GpsFailureReason | null;
}

export function useClockIn(): (params: {
  jobId: string | null;
  entryType: EntryType;
}) => Promise<ClockInResult> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ jobId, entryType }) => {
      const userEmail = session?.user.email;
      const userId = session?.user.id;
      if (!userEmail || !userId) {
        const err = new Error('Cannot clock in: no signed-in session.');
        logError('timeTracking.clockIn', 'no session', err);
        throw err;
      }

      const today = todayLocalISODate();
      logInfo('timeTracking.clockIn', 'attempt', {
        job_id: jobId,
        entry_type: entryType,
        log_date: today,
      });

      try {
        // 1. Reject duplicate clock-ins. getOptional returns null when
        //    no open entry exists; db.get would throw, breaking the
        //    happy path.
        const open = await db.getOptional<{ id: string }>(
          `SELECT id FROM job_time_entries
           WHERE user_email = ? AND ended_at IS NULL
           LIMIT 1`,
          [userEmail]
        );
        if (open) {
          const err = new Error('Already clocked in. Clock out first.');
          logInfo('timeTracking.clockIn', 'rejected: already clocked in', {
            existing_entry_id: open.id,
          });
          throw err;
        }

        // 2. Run find-or-create-daily-log AND the GPS fix in parallel.
        //    GPS acquisition can take up to ~8s; the SQLite round-trip
        //    is sub-ms — running them sequentially would stall every
        //    clock-in by the full GPS window.
        const [dailyLog, fix] = await Promise.all([
          ensureDailyLog(db, userEmail, today),
          getCurrentPosition(),
        ]);
        const pos = fix.pos;
        if (!pos) {
          logInfo('timeTracking.clockIn', 'no GPS fix (clock-in proceeds)', {
            reason: fix.reason,
          });
        }

        // 3. Insert the open job_time_entries row.
        const entryId = randomUUID();
        const nowIso = new Date().toISOString();
        await db.execute(
          `INSERT INTO job_time_entries (
             id, daily_time_log_id, job_id, user_email, entry_type,
             started_at, clock_in_lat, clock_in_lon,
             created_at, updated_at, client_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entryId,
            dailyLog.id,
            jobId, // null is fine for office / travel / overhead
            userEmail,
            entryType,
            nowIso,
            pos?.latitude ?? null,
            pos?.longitude ?? null,
            nowIso,
            nowIso,
            entryId,
          ]
        );

        logInfo('timeTracking.clockIn', 'success', {
          entry_id: entryId,
          daily_time_log_id: dailyLog.id,
          job_id: jobId,
          entry_type: entryType,
          has_gps: !!pos,
        });

        // 4a. Write a single 'clock_in' boundary ping into
        //     location_pings. This always runs, even when background
        //     tracking is denied — it guarantees at least the
        //     start-of-shift coordinate lands in the new pings table.
        //     Skip when no GPS fix is available.
        if (pos) {
          try {
            await writeBoundaryPing({
              ctx: { entryId, userId, userEmail },
              lat: pos.latitude,
              lon: pos.longitude,
              accuracy_m: pos.accuracy,
              altitude_m: pos.altitude,
              capturedAt: pos.capturedAt,
              source: 'clock_in',
            });
          } catch (err) {
            // Boundary write failure is logged inside writeBoundaryPing;
            // catching here is defensive — the clock-in itself succeeded.
            logWarn('timeTracking.clockIn', 'boundary ping threw', err, {
              entry_id: entryId,
            });
          }
        }

        // 4b. Start background tracking. Best-effort — permission
        //     denial is non-fatal; the clock-in stays open and the
        //     UI's "Tracking" badge will reflect the disabled state.
        try {
          const tracking = await startBackgroundTracking({
            entryId,
            userId,
            userEmail,
          });
          logInfo('timeTracking.clockIn', 'background tracking', {
            entry_id: entryId,
            ok: tracking.ok,
            has_background_permission: tracking.hasBackgroundPermission,
            tier: tracking.tier,
          });
        } catch (err) {
          logWarn(
            'timeTracking.clockIn',
            'startBackgroundTracking failed (clock-in still ok)',
            err,
            { entry_id: entryId }
          );
        }

        // 5. Schedule "still working?" reminders. Fire-and-forget;
        //    permission denial silently degrades. Notification scheduling
        //    must NOT block clock-in completion — surface as an awaited
        //    call so any logged warnings are tied to this clock-in, but
        //    never throw past this point.
        try {
          await scheduleStillWorkingPrompts(entryId, nowIso);
        } catch (err) {
          logWarn(
            'timeTracking.clockIn',
            'schedule still-working prompts failed',
            err,
            { entry_id: entryId }
          );
        }

        return { hasGps: !!pos, gpsReason: fix.reason };
      } catch (err) {
        // Re-throw the "Already clocked in" / "no session" cases without
        // double-logging — they're already logged above. Anything else
        // is unexpected (DB failure, GPS hardware fault that escaped
        // the location helper, etc.) and gets a high-severity capture.
        if (
          err instanceof Error &&
          (err.message.startsWith('Already clocked in') ||
            err.message.startsWith('Cannot clock in'))
        ) {
          throw err;
        }
        logError('timeTracking.clockIn', 'unexpected failure', err, {
          job_id: jobId,
          entry_type: entryType,
        });
        throw err;
      }
    },
    [db, session]
  );
}

/**
 * Clock-out action. Closes the user's open entry. No-op (returns
 * false) if no open entry exists — the UI shouldn't call this in
 * that state, but again, defensive.
 */
export interface ClockOutResult {
  /** True when the clock-out flipped an open entry to closed. False
   *  on no-session or no-open-entry no-ops. */
  ok: boolean;
  /** Total elapsed minutes between started_at and clock-out. null
   *  for no-op cases. */
  durationMinutes: number | null;
  /** True when phone GPS landed at clock-out time. False on
   *  permission denial / timeout / hardware fault — and on no-op. */
  hasGps: boolean;
  /** Why GPS failed when hasGps is false; null on success or no-op. */
  gpsReason: GpsFailureReason | null;
}

export function useClockOut(): () => Promise<ClockOutResult> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(async () => {
    const userEmail = session?.user.email;
    const userId = session?.user.id;
    if (!userEmail || !userId) {
      logInfo('timeTracking.clockOut', 'no session — no-op');
      return { ok: false, durationMinutes: null, hasGps: false, gpsReason: null };
    }

    try {
      const open = await db.getOptional<{ id: string; started_at: string | null }>(
        `SELECT id, started_at FROM job_time_entries
         WHERE user_email = ? AND ended_at IS NULL
         LIMIT 1`,
        [userEmail]
      );
      if (!open || !open.started_at) {
        logInfo('timeTracking.clockOut', 'no open entry — no-op');
        return { ok: false, durationMinutes: null, hasGps: false, gpsReason: null };
      }

      logInfo('timeTracking.clockOut', 'attempt', {
        entry_id: open.id,
        started_at: open.started_at,
      });

      const nowIso = new Date().toISOString();
      const durationMin = durationMinutesBetween(open.started_at, nowIso);

      const fix = await getCurrentPosition();
      const pos = fix.pos;
      if (!pos) {
        logInfo('timeTracking.clockOut', 'no GPS fix (clock-out proceeds)', {
          reason: fix.reason,
        });
      }

      await db.execute(
        `UPDATE job_time_entries
         SET ended_at = ?,
             clock_out_lat = ?,
             clock_out_lon = ?,
             duration_minutes = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          nowIso,
          pos?.latitude ?? null,
          pos?.longitude ?? null,
          durationMin,
          nowIso,
          open.id,
        ]
      );

      logInfo('timeTracking.clockOut', 'success', {
        entry_id: open.id,
        duration_minutes: durationMin,
        has_gps: !!pos,
        gps_reason: fix.reason,
      });

      // Write the closing boundary ping BEFORE stopping the tracker
      // so the final coordinate carries the entry id. Best-effort.
      if (pos) {
        try {
          await writeBoundaryPing({
            ctx: { entryId: open.id, userId, userEmail },
            lat: pos.latitude,
            lon: pos.longitude,
            accuracy_m: pos.accuracy,
            altitude_m: pos.altitude,
            capturedAt: pos.capturedAt,
            source: 'clock_out',
          });
        } catch (err) {
          logWarn('timeTracking.clockOut', 'boundary ping threw', err, {
            entry_id: open.id,
          });
        }
      }

      // Stop the background tracker. Idempotent + always runs (even
      // when GPS at clock-out failed) so a denied / failed start
      // doesn't leak a running task.
      try {
        await stopBackgroundTracking();
      } catch (err) {
        logWarn(
          'timeTracking.clockOut',
          'stopBackgroundTracking threw',
          err,
          { entry_id: open.id }
        );
      }

      // Cancel any scheduled "still working?" prompts for this entry.
      // Idempotent — safe to call when permission was denied at
      // clock-in time and nothing was actually scheduled.
      try {
        await cancelStillWorkingPrompts(open.id);
      } catch (err) {
        logWarn(
          'timeTracking.clockOut',
          'cancel still-working prompts failed',
          err,
          { entry_id: open.id }
        );
      }

      return {
        ok: true,
        durationMinutes: durationMin,
        hasGps: !!pos,
        gpsReason: fix.reason,
      };
    } catch (err) {
      logError('timeTracking.clockOut', 'unexpected failure', err);
      throw err;
    }
  }, [db, session]);
}

async function ensureDailyLog(
  db: ReturnType<typeof usePowerSync>,
  userEmail: string,
  logDate: string
): Promise<{ id: string }> {
  const existing = await db.getOptional<{ id: string }>(
    `SELECT id FROM daily_time_logs
     WHERE user_email = ? AND log_date = ?
     LIMIT 1`,
    [userEmail, logDate]
  );
  if (existing) return existing;

  const dailyId = randomUUID();
  const nowIso = new Date().toISOString();
  await db.execute(
    `INSERT INTO daily_time_logs
       (id, user_email, log_date, status, created_at, updated_at, client_id)
     VALUES (?, ?, ?, 'open', ?, ?, ?)`,
    [dailyId, userEmail, logDate, nowIso, nowIso, dailyId]
  );
  logInfo('timeTracking.ensureDailyLog', 'created', {
    daily_time_log_id: dailyId,
    log_date: logDate,
  });
  return { id: dailyId };
}
