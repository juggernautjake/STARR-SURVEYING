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
import { localISODate } from './timeFormat';

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

/**
 * Returns this week's total minutes across all the user's
 * job_time_entries (Mon-Sun, local). Recomputes the week each render
 * — keeping the app open across midnight Sunday→Monday must roll the
 * window forward without a remount.
 */
export function useThisWeekTotal(): { totalMinutes: number; isLoading: boolean } {
  const { session } = useAuth();
  const userEmail = session?.user.email ?? null;
  const range = thisWeekRange();
  const queryParams = useMemo(
    () => (userEmail ? [userEmail, range.from, range.to] : []),
    [userEmail, range.from, range.to]
  );

  const { data, isLoading, error } = useQuery<{ total: number | null }>(
    `SELECT COALESCE(SUM(jte.duration_minutes), 0) AS total
     FROM job_time_entries AS jte
     LEFT JOIN daily_time_logs AS dtl ON dtl.id = jte.daily_time_log_id
     WHERE jte.user_email = ?
       AND dtl.log_date BETWEEN ? AND ?`,
    queryParams
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

      const nowIso = new Date().toISOString();
      // Flip every 'open' day in the window in one statement. PowerSync
      // emits one CRUD op per matched row server-side; this just saves
      // round-trips through the local SQLite layer. SQLite's UPDATE
      // returns `changes` via the result envelope on every adapter we
      // care about — we surface it as `flipped`.
      const result = await db.execute(
        `UPDATE daily_time_logs
         SET status = 'submitted',
             submitted_at = ?,
             updated_at = ?
         WHERE user_email = ?
           AND log_date BETWEEN ? AND ?
           AND COALESCE(status, 'open') = 'open'`,
        [nowIso, nowIso, userEmail, range.from, range.to]
      );

      const flipped = result?.rowsAffected ?? 0;
      if (flipped === 0) {
        logInfo('timesheet.submitWeek', 'nothing to submit', {
          already_submitted: true,
        });
        return { flipped: 0, alreadySubmitted: true, hasOpenEntry: false };
      }

      logInfo('timesheet.submitWeek', 'success', { flipped });
      return { flipped, alreadySubmitted: false, hasOpenEntry: false };
    } catch (err) {
      logError('timesheet.submitWeek', 'unexpected failure', err, {
        from: range.from,
        to: range.to,
      });
      throw err;
    }
  }, [db, session]);
}
