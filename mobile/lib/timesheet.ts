/**
 * Timesheet read model.
 *
 * useTimesheet(daysBack) returns recent job_time_entries for the
 * current user, JOINed against jobs (for display name) and
 * daily_time_logs (for the canonical log_date), grouped by day with
 * per-day totals.
 *
 * The grouping happens in JS rather than SQL because PowerSync's
 * SQLite has limited window-function support and the row count is
 * small enough (<200 rows for 14 days at typical clock-in cadence)
 * that JS grouping is faster than a window query anyway.
 *
 * Days with no entries are omitted from the result. Plan §5.8.6 says
 * "today / this week" navigation; this hook returns the raw grouped
 * data and the screen decides how to slice.
 */
import { useQuery } from '@powersync/react';
import { useMemo } from 'react';

import { useAuth } from './auth';
import { todayLocalISODate } from './timeFormat';

export interface TimesheetEntry {
  id: string;
  jobId: string | null;
  jobName: string | null;
  entryType: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Sourced from job_time_entries.duration_minutes; null when open. */
  durationMinutes: number | null;
}

export type DailyLogStatus =
  | 'open'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'locked'
  | string; // future-tolerant — unknown values render as the literal

export interface TimesheetDay {
  /** ISO local date (YYYY-MM-DD). */
  date: string;
  /** Sum of duration_minutes for closed entries on this day. */
  totalMinutes: number;
  entries: TimesheetEntry[];
  /** True when at least one entry on this day is still open. */
  hasOpenEntry: boolean;
  /**
   * Status from daily_time_logs.status. Drives the day-header chip
   * and gates editing — mobile blocks edits to entries on a non-'open'
   * day (admin must edit server-side).
   */
  status: DailyLogStatus | null;
  /** daily_time_logs.id for the day; needed by submit-week action. */
  dailyTimeLogId: string | null;
}

interface RawRow {
  id: string;
  job_id: string | null;
  _job_name: string | null;
  entry_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  _log_date: string | null;
  _log_status: string | null;
  _log_id: string | null;
}

export function useTimesheet(daysBack: number = 14): {
  days: TimesheetDay[];
  isLoading: boolean;
} {
  const { session } = useAuth();
  const userEmail = session?.user.email ?? null;

  const since = useMemo(() => isoDateMinusDays(todayLocalISODate(), daysBack), [daysBack]);

  const { data, isLoading } = useQuery<RawRow>(
    `SELECT
       jte.id              AS id,
       jte.job_id          AS job_id,
       jobs.name           AS _job_name,
       jte.entry_type      AS entry_type,
       jte.started_at      AS started_at,
       jte.ended_at        AS ended_at,
       jte.duration_minutes AS duration_minutes,
       dtl.log_date        AS _log_date,
       dtl.status          AS _log_status,
       dtl.id              AS _log_id
     FROM job_time_entries AS jte
     LEFT JOIN daily_time_logs AS dtl ON dtl.id = jte.daily_time_log_id
     LEFT JOIN jobs ON jobs.id = jte.job_id
     WHERE jte.user_email = ?
       AND COALESCE(dtl.log_date, '') >= ?
     ORDER BY COALESCE(dtl.log_date, '') DESC,
              COALESCE(jte.started_at, '') DESC`,
    userEmail ? [userEmail, since] : []
  );

  const days = useMemo<TimesheetDay[]>(() => {
    if (!data || data.length === 0) return [];

    // Bucket by log_date. Rows with NULL log_date (broken sync,
    // shouldn't normally happen) are bucketed under "" so they're
    // visible-but-tagged rather than silently dropped.
    interface Bucket {
      entries: TimesheetEntry[];
      status: string | null;
      logId: string | null;
    }
    const buckets = new Map<string, Bucket>();
    for (const row of data) {
      const date = row._log_date ?? '';
      const bucket = buckets.get(date) ?? {
        entries: [],
        status: row._log_status,
        logId: row._log_id,
      };
      bucket.entries.push({
        id: row.id,
        jobId: row.job_id,
        jobName: row._job_name,
        entryType: row.entry_type,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationMinutes: row.duration_minutes,
      });
      // status / logId should be identical across rows for the same
      // log_date; but if a stale duplicate joins, prefer the first.
      if (!bucket.status) bucket.status = row._log_status;
      if (!bucket.logId) bucket.logId = row._log_id;
      buckets.set(date, bucket);
    }

    return Array.from(buckets.entries())
      .map(([date, b]) => {
        const totalMinutes = b.entries.reduce(
          (sum, e) => sum + (e.durationMinutes ?? 0),
          0
        );
        const hasOpenEntry = b.entries.some((e) => !e.endedAt);
        return {
          date,
          totalMinutes,
          entries: b.entries,
          hasOpenEntry,
          status: (b.status as DailyLogStatus | null) ?? null,
          dailyTimeLogId: b.logId,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  return {
    days,
    isLoading: !!userEmail && isLoading,
  };
}

/**
 * Subtract `n` calendar days from a YYYY-MM-DD string. Wraps Date so
 * we don't deal with timezone surprises — Date arithmetic on UTC
 * midnight is stable.
 */
function isoDateMinusDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const t = Date.UTC(y, m - 1, d) - n * 24 * 60 * 60 * 1000;
  const out = new Date(t);
  const yyyy = out.getUTCFullYear();
  const mm = String(out.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(out.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
