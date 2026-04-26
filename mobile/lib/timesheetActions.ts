/**
 * Week-scoped timesheet helpers — F1 #9 submit-for-approval.
 *
 *   - thisWeekRange()         : returns Mon-Sun bounds (ISO 8601 week)
 *                               of the current device-local week
 *   - useThisWeekTotal()      : sum of duration_minutes across the
 *                               7-day window (live)
 *   - useSubmitWeek()         : action that flips every 'open'
 *                               daily_time_logs row in the week to
 *                               'submitted' with submitted_at = now
 *
 * Per plan §5.8.6 we submit per-week (not per-day) because that's
 * how Henry's bookkeeper processes payroll. Sub-day submission lands
 * later if surveyors ask for it.
 */
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback, useEffect, useMemo } from 'react';

import { useAuth } from './auth';
import { logError, logInfo } from './log';

export interface WeekRange {
  /** YYYY-MM-DD (local) — Monday. */
  from: string;
  /** YYYY-MM-DD (local) — Sunday. */
  to: string;
}

/**
 * Mon-Sun ISO-week bounds for "today" in the device's local
 * timezone. Date.getDay returns 0 for Sunday, 1 for Monday, ...
 * — convert to 0-indexed-from-Monday so subtraction lands on Mon.
 */
export function thisWeekRange(): WeekRange {
  const now = new Date();
  const dayOfWeek0Sun = now.getDay();
  const offsetFromMon = (dayOfWeek0Sun + 6) % 7; // Mon=0, Sun=6

  const monday = new Date(now);
  monday.setDate(now.getDate() - offsetFromMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    from: localISODate(monday),
    to: localISODate(sunday),
  };
}

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns this week's total minutes across all the user's
 * job_time_entries (Mon-Sun, local). Re-runs whenever entries or
 * daily logs change.
 */
export function useThisWeekTotal(): { totalMinutes: number; isLoading: boolean } {
  const { session } = useAuth();
  const userEmail = session?.user.email ?? null;
  const range = useMemo(() => thisWeekRange(), []);

  const { data, isLoading, error } = useQuery<{ total: number | null }>(
    `SELECT COALESCE(SUM(jte.duration_minutes), 0) AS total
     FROM job_time_entries AS jte
     LEFT JOIN daily_time_logs AS dtl ON dtl.id = jte.daily_time_log_id
     WHERE jte.user_email = ?
       AND dtl.log_date BETWEEN ? AND ?`,
    userEmail ? [userEmail, range.from, range.to] : []
  );

  useEffect(() => {
    if (error) {
      logError('timesheet.useThisWeekTotal', 'query failed', error, {
        from: range.from,
        to: range.to,
      });
    }
  }, [error, range.from, range.to]);

  if (!userEmail) return { totalMinutes: 0, isLoading: false };
  return {
    totalMinutes: data?.[0]?.total ?? 0,
    isLoading,
  };
}

export interface SubmitWeekResult {
  /** Number of daily_time_logs flipped from 'open' to 'submitted'. */
  flipped: number;
  /** True if there were no open entries to submit (idempotent retry). */
  alreadySubmitted: boolean;
  /** True if there's an open job_time_entry blocking submission. */
  hasOpenEntry: boolean;
}

/**
 * Submit the current week. Flips every 'open' daily_time_logs row
 * within Mon-Sun to 'submitted' with submitted_at = now. Refuses
 * if any job_time_entry in the window is still open (clock out
 * first).
 *
 * Idempotent: re-submitting after a successful submit returns
 * { flipped: 0, alreadySubmitted: true }.
 */
export function useSubmitWeek(): () => Promise<SubmitWeekResult> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(async () => {
    const userEmail = session?.user.email;
    if (!userEmail) {
      const err = new Error('Not signed in.');
      logError('timesheet.submitWeek', 'no session', err);
      throw err;
    }

    const range = thisWeekRange();
    logInfo('timesheet.submitWeek', 'attempt', {
      from: range.from,
      to: range.to,
    });

    try {
      // Refuse if any entry in the window is still open. The user
      // must clock out first — otherwise the timesheet they're
      // submitting has an undefined-duration row.
      const open = await db.getOptional<{ id: string }>(
        `SELECT jte.id
         FROM job_time_entries AS jte
         LEFT JOIN daily_time_logs AS dtl ON dtl.id = jte.daily_time_log_id
         WHERE jte.user_email = ?
           AND jte.ended_at IS NULL
           AND dtl.log_date BETWEEN ? AND ?
         LIMIT 1`,
        [userEmail, range.from, range.to]
      );
      if (open) {
        logInfo('timesheet.submitWeek', 'blocked: open entry exists');
        return { flipped: 0, alreadySubmitted: false, hasOpenEntry: true };
      }

      // Find all 'open' daily logs in the window. If none, surface
      // alreadySubmitted=true so the UI shows the right message.
      const rows = await db.getAll<{ id: string }>(
        `SELECT id FROM daily_time_logs
         WHERE user_email = ?
           AND log_date BETWEEN ? AND ?
           AND COALESCE(status, 'open') = 'open'`,
        [userEmail, range.from, range.to]
      );

      if (rows.length === 0) {
        logInfo('timesheet.submitWeek', 'nothing to submit', {
          already_submitted: true,
        });
        return { flipped: 0, alreadySubmitted: true, hasOpenEntry: false };
      }

      const nowIso = new Date().toISOString();
      // Flip them. PowerSync's CRUD queue will replay each UPDATE
      // server-side; we don't worry about a transactional batch here
      // because PowerSync's queue is FIFO per row and individual
      // failures retry.
      for (const row of rows) {
        await db.execute(
          `UPDATE daily_time_logs
           SET status = 'submitted',
               submitted_at = ?,
               updated_at = ?
           WHERE id = ?`,
          [nowIso, nowIso, row.id]
        );
      }

      logInfo('timesheet.submitWeek', 'success', {
        flipped: rows.length,
      });
      return { flipped: rows.length, alreadySubmitted: false, hasOpenEntry: false };
    } catch (err) {
      logError('timesheet.submitWeek', 'unexpected failure', err, {
        from: range.from,
        to: range.to,
      });
      throw err;
    }
  }, [db, session]);
}
