/**
 * Jobs query helpers + types.
 *
 * Phase F1 #2 ships read-only access. All hooks here are
 * SELECT-only; F1 #4+ will add `useJobMutations` (or similar) when
 * mobile job creation lands.
 *
 * The Job row type derives from the PowerSync AppSchema so it stays
 * in sync with `lib/db/schema.ts` automatically. If you add a column
 * there, this type updates with no extra work — and TypeScript will
 * surface call sites that need updating.
 */
import { useQuery } from '@powersync/react';
import { useEffect, useMemo } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { logError } from './log';

export type Job = AppDatabase['jobs'];

export interface UseJobsResult {
  jobs: Job[];
  isLoading: boolean;
  error: Error | undefined;
}

/**
 * List active (non-archived) jobs sorted by recently-touched. Pulls
 * from the local SQLite mirror — works offline; reflects any sync
 * updates within milliseconds of arrival.
 *
 * Phase F1 #2 returns up to 200 rows unfiltered. Search + stage
 * filter wire up in F1 polish; pinned-favorites in F1 #3 alongside
 * the user-pin column.
 */
export function useJobs(): UseJobsResult {
  // PowerSync's useQuery: parameterised SQL against the local DB.
  // SQLite has no boolean type — `is_archived` is stored as 0/1
  // INTEGER per the schema.ts column declaration.
  const { data, isLoading, error } = useQuery<Job>(
    `SELECT *
     FROM jobs
     WHERE COALESCE(is_archived, 0) = 0
     ORDER BY COALESCE(updated_at, created_at, '') DESC
     LIMIT 200`
  );

  useEffect(() => {
    if (error) logError('jobs.useJobs', 'query failed', error);
  }, [error]);

  return {
    jobs: data ?? [],
    isLoading,
    error: error ?? undefined,
  };
}

/**
 * Fetch a single job by id. Used by the job-detail screen (F1 #3).
 * Returns `null` (not undefined) when the row genuinely doesn't
 * exist; `undefined` only while the first query is in flight.
 */
export function useJob(id: string | null | undefined): {
  job: Job | null | undefined;
  isLoading: boolean;
} {
  const queryParams = useMemo(() => (id ? [id] : []), [id]);
  const { data, isLoading, error } = useQuery<Job>(
    `SELECT * FROM jobs WHERE id = ? LIMIT 1`,
    queryParams
  );

  useEffect(() => {
    if (error) logError('jobs.useJob', 'query failed', error, { id });
  }, [error, id]);

  if (!id) return { job: null, isLoading: false };
  if (isLoading) return { job: undefined, isLoading: true };
  return { job: data?.[0] ?? null, isLoading: false };
}

// ── Today's-captures rollup (Batch II) ──────────────────────────────────────

export interface JobTodayRollup {
  /** Local YYYY-MM-DD bound the rollup is scoped to (the user's
   *  device-local "today"). UI surfaces this so a 6 AM cold-start
   *  shows the right day even if the user crossed midnight in
   *  airplane mode. */
  localDate: string;
  /** Data points the *current user* created on this job today. */
  pointsToday: number;
  /** Counts of media types the current user captured today. */
  photosToday: number;
  videosToday: number;
  voiceToday: number;
  /** Notes the current user added to this job today (point-attached
   *  + job-level combined). is_current=1 only — archived notes
   *  don't count. */
  notesToday: number;
  /** Files the current user attached to this job today. */
  filesToday: number;
  /** Receipts the current user logged on this job today. Excludes
   *  soft-deleted (Batch CC) and rejected rows. Total in cents. */
  receiptsToday: number;
  receiptsTotalCents: number;
  /** Minutes the current user has logged on this job today. Sums
   *  closed entries' duration_minutes + the open entry's
   *  (now - started_at) at query time. */
  minutesToday: number;
  /** True when ANY clock-in for this job is still open. Drives the
   *  "🟢 On the clock" badge on the rollup card. */
  isClockedIn: boolean;
}

const EMPTY_ROLLUP_BASE = {
  pointsToday: 0,
  photosToday: 0,
  videosToday: 0,
  voiceToday: 0,
  notesToday: 0,
  filesToday: 0,
  receiptsToday: 0,
  receiptsTotalCents: 0,
  minutesToday: 0,
  isClockedIn: false,
};

/** Local-midnight ISO string for the device's current day. The
 *  in-SQL filter is `>= localMidnightIso` which gives us a sliding
 *  24h window anchored to the user's clock — no UTC skew issues
 *  for surveyors near midnight. */
function localMidnightIso(): { iso: string; date: string } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { iso: d.toISOString(), date: `${yyyy}-${mm}-${dd}` };
}

/**
 * Reactive "what have I captured on this job today?" summary.
 * Powers the Batch II rollup card on `(tabs)/jobs/[id]/index.tsx`.
 *
 * Reads run against PowerSync's local SQLite — fully offline,
 * reactive to every capture the surveyor makes. The single SQL
 * query joins seven aggregations in one round-trip so the card
 * doesn't flicker piecewise as each sub-query lands.
 *
 * Per-user scope: every count filters by `created_by =
 * :userId` (or `user_id` for receipts) so two crew members on
 * the same job each see their own day. The job is the
 * shared context; the captures aren't.
 */
export function useJobTodayRollup(
  jobId: string | null | undefined
): { rollup: JobTodayRollup; isLoading: boolean } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const userEmail = session?.user.email ?? null;

  const window = useMemo(() => localMidnightIso(), []);

  const queryParams = useMemo(() => {
    if (!jobId || !userId || !userEmail) return [];
    // Order matches the SQL placeholders below — keep in sync.
    return [
      jobId, userId, window.iso, // points
      jobId, userId, window.iso, // photos
      jobId, userId, window.iso, // videos
      jobId, userId, window.iso, // voice
      jobId, userId, window.iso, // notes (uses user_email via subquery)
      jobId, userId, window.iso, // files
      jobId, userId, window.iso, // receipts count
      jobId, userId, window.iso, // receipts total
      jobId, userEmail, window.iso, // closed time
      jobId, userEmail, window.iso, // open count
      jobId, userEmail, window.iso, // open started_at
    ];
  }, [jobId, userId, userEmail, window.iso]);

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM field_data_points
        WHERE job_id = ? AND created_by = ? AND COALESCE(created_at,'') >= ?
      ) AS points_today,
      (SELECT COUNT(*) FROM field_media
        WHERE job_id = ? AND created_by = ?
          AND COALESCE(created_at,'') >= ?
          AND media_type = 'photo'
      ) AS photos_today,
      (SELECT COUNT(*) FROM field_media
        WHERE job_id = ? AND created_by = ?
          AND COALESCE(created_at,'') >= ?
          AND media_type = 'video'
      ) AS videos_today,
      (SELECT COUNT(*) FROM field_media
        WHERE job_id = ? AND created_by = ?
          AND COALESCE(created_at,'') >= ?
          AND media_type = 'voice'
      ) AS voice_today,
      (SELECT COUNT(*) FROM fieldbook_notes
        WHERE job_id = ? AND user_email = (
          SELECT email FROM registered_users WHERE id = ? LIMIT 1
        )
          AND COALESCE(created_at,'') >= ?
          AND COALESCE(is_current, 1) = 1
      ) AS notes_today,
      (SELECT COUNT(*) FROM job_files
        WHERE job_id = ? AND created_by = ?
          AND COALESCE(created_at,'') >= ?
      ) AS files_today,
      (SELECT COUNT(*) FROM receipts
        WHERE job_id = ? AND user_id = ?
          AND COALESCE(created_at,'') >= ?
          AND deleted_at IS NULL
          AND COALESCE(status,'pending') != 'rejected'
      ) AS receipts_today,
      (SELECT COALESCE(SUM(total_cents),0) FROM receipts
        WHERE job_id = ? AND user_id = ?
          AND COALESCE(created_at,'') >= ?
          AND deleted_at IS NULL
          AND COALESCE(status,'pending') != 'rejected'
      ) AS receipts_total_cents,
      (SELECT COALESCE(SUM(duration_minutes),0) FROM job_time_entries
        WHERE job_id = ? AND user_email = ?
          AND COALESCE(started_at,'') >= ?
          AND ended_at IS NOT NULL
      ) AS closed_minutes,
      (SELECT COUNT(*) FROM job_time_entries
        WHERE job_id = ? AND user_email = ?
          AND COALESCE(started_at,'') >= ?
          AND ended_at IS NULL
      ) AS open_count,
      (SELECT MIN(started_at) FROM job_time_entries
        WHERE job_id = ? AND user_email = ?
          AND COALESCE(started_at,'') >= ?
          AND ended_at IS NULL
      ) AS open_started_at
  `;

  const { data, isLoading, error } = useQuery<{
    points_today: number;
    photos_today: number;
    videos_today: number;
    voice_today: number;
    notes_today: number;
    files_today: number;
    receipts_today: number;
    receipts_total_cents: number;
    closed_minutes: number;
    open_count: number;
    open_started_at: string | null;
  }>(sql, queryParams);

  // The notes sub-query joins through registered_users on the device;
  // the join works under PowerSync's local replica because that table
  // is part of the sync rules. If a surveyor has zero registered_users
  // rows replicated yet (cold start, first sync still landing), the
  // count returns 0 — we accept that brief mismatch rather than block
  // the card.

  useEffect(() => {
    if (error) {
      logError('jobs.useJobTodayRollup', 'query failed', error, {
        job_id: jobId ?? null,
      });
    }
  }, [error, jobId]);

  const row = data?.[0];
  const rollup: JobTodayRollup = useMemo(() => {
    if (!row) {
      return { localDate: window.date, ...EMPTY_ROLLUP_BASE };
    }
    return {
      localDate: window.date,
      pointsToday: row.points_today ?? 0,
      photosToday: row.photos_today ?? 0,
      videosToday: row.videos_today ?? 0,
      voiceToday: row.voice_today ?? 0,
      notesToday: row.notes_today ?? 0,
      filesToday: row.files_today ?? 0,
      receiptsToday: row.receipts_today ?? 0,
      receiptsTotalCents: row.receipts_total_cents ?? 0,
      // Closed minutes are exact. An open entry contributes
      // `(now − started_at)` so the rollup is live-accurate even
      // mid-shift. The MIN(started_at) sub-query above gives us
      // the earliest open clock-in for this job today (multiple
      // opens shouldn't happen but we'd rather err high than
      // double-count).
      minutesToday:
        (row.closed_minutes ?? 0) +
        (row.open_count > 0 && row.open_started_at
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - Date.parse(row.open_started_at)) / 60_000
              )
            )
          : 0),
      isClockedIn: (row.open_count ?? 0) > 0,
    };
  }, [row, window.date, window.iso]);

  return {
    rollup,
    isLoading: !!jobId && !!userId && isLoading && !data,
  };
}
