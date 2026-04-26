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
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { getCurrentPositionOrNull } from './location';
import { logError, logInfo, logWarn } from './log';
import { elapsedSince, todayLocalISODate } from './timeFormat';
import {
  cancelStillWorkingPrompts,
  scheduleStillWorkingPrompts,
} from './timePrompts';
import { randomUUID } from './uuid';

export type EntryType = 'on_site' | 'travel' | 'office' | 'overhead';

export type JobTimeEntry = AppDatabase['job_time_entries'];

export interface ActiveEntry {
  entry: JobTimeEntry;
  /** Computed at hook-render time; ticks live via the local timer. */
  elapsedMs: number;
  /** Linked job name when entry.job_id is set; null for office/travel/overhead. */
  jobName: string | null;
}

/**
 * Subscribe to "the user's currently-open clock-in entry." Returns
 * `null` when the user is clocked out, the entry + elapsed time
 * when clocked in. The `elapsedMs` value re-computes every 30
 * seconds so the UI's duration counter stays fresh without
 * thrashing renders.
 */
export function useActiveTimeEntry(): {
  active: ActiveEntry | null;
  isLoading: boolean;
} {
  const { session } = useAuth();
  const userEmail = session?.user.email ?? null;

  // The live SQL — re-runs whenever job_time_entries OR jobs changes.
  // LEFT JOIN so entries with NULL job_id (office/travel/overhead) still
  // come back; the joined name is null in those cases.
  const { data, isLoading, error } = useQuery<JobTimeEntry & { _job_name: string | null }>(
    `SELECT j.*, jobs.name AS _job_name
     FROM job_time_entries AS j
     LEFT JOIN jobs ON jobs.id = j.job_id
     WHERE j.user_email = ?
       AND j.ended_at IS NULL
     ORDER BY j.started_at DESC
     LIMIT 1`,
    userEmail ? [userEmail] : []
  );

  useEffect(() => {
    if (error) logError('timeTracking.useActiveTimeEntry', 'query failed', error);
  }, [error]);

  const entry = data?.[0] ?? null;

  // Tick the elapsed counter every 30s. We don't tick more often
  // because the smallest unit shown in the UI is "1m"; tighter
  // intervals just burn battery.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!entry?.started_at) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [entry?.started_at]);

  if (!userEmail) return { active: null, isLoading: false };
  if (isLoading) return { active: null, isLoading: true };
  if (!entry) return { active: null, isLoading: false };

  // Reference `tick` so React's deps tracker doesn't optimize the
  // re-render away. (elapsedSince reads Date.now(), so the value
  // freshens automatically — we just need to trigger a re-render.)
  void tick;

  // Strip the JOIN-only field so consumers see a clean JobTimeEntry.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _job_name, ...rest } = entry;
  const cleanEntry = rest as JobTimeEntry;

  return {
    active: {
      entry: cleanEntry,
      elapsedMs: cleanEntry.started_at ? elapsedSince(cleanEntry.started_at) : 0,
      jobName: entry._job_name,
    },
    isLoading: false,
  };
}

/**
 * Clock-in action factory. Returned function is stable across
 * renders so consumers can pass it to onPress without re-binding.
 *
 * Throws if an entry is already open for this user — the UI should
 * prevent that, but we want loud failure if it ever slips past the
 * UI guard.
 */
export function useClockIn(): (params: {
  jobId: string | null;
  entryType: EntryType;
}) => Promise<void> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ jobId, entryType }) => {
      const userEmail = session?.user.email;
      if (!userEmail) {
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

        // 2. Find-or-create today's daily log.
        let dailyLog = await db.getOptional<{ id: string }>(
          `SELECT id FROM daily_time_logs
           WHERE user_email = ? AND log_date = ?
           LIMIT 1`,
          [userEmail, today]
        );
        if (!dailyLog) {
          const dailyId = randomUUID();
          const nowIso = new Date().toISOString();
          await db.execute(
            `INSERT INTO daily_time_logs
               (id, user_email, log_date, status, created_at, updated_at, client_id)
             VALUES (?, ?, ?, 'open', ?, ?, ?)`,
            [dailyId, userEmail, today, nowIso, nowIso, dailyId]
          );
          dailyLog = { id: dailyId };
          logInfo('timeTracking.clockIn', 'created daily_time_logs', {
            daily_time_log_id: dailyId,
            log_date: today,
          });
        }

        // 3. Best-effort GPS fix. Don't block clock-in on it.
        const pos = await getCurrentPositionOrNull();
        if (!pos) {
          logInfo('timeTracking.clockIn', 'no GPS fix (clock-in proceeds)');
        }

        // 4. Insert the open job_time_entries row.
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
export function useClockOut(): () => Promise<boolean> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(async () => {
    const userEmail = session?.user.email;
    if (!userEmail) {
      logInfo('timeTracking.clockOut', 'no session — no-op');
      return false;
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
        return false;
      }

      logInfo('timeTracking.clockOut', 'attempt', {
        entry_id: open.id,
        started_at: open.started_at,
      });

      const nowIso = new Date().toISOString();
      const startMs = Date.parse(open.started_at);
      const durationMin = Number.isFinite(startMs)
        ? Math.max(0, Math.round((Date.now() - startMs) / 60000))
        : null;

      const pos = await getCurrentPositionOrNull();
      if (!pos) {
        logInfo('timeTracking.clockOut', 'no GPS fix (clock-out proceeds)');
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
      });

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

      return true;
    } catch (err) {
      logError('timeTracking.clockOut', 'unexpected failure', err);
      throw err;
    }
  }, [db, session]);
}
