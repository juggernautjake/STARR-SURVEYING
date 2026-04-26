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
import { useEffect } from 'react';

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
  const { data, isLoading, error } = useQuery<Job>(
    `SELECT * FROM jobs WHERE id = ? LIMIT 1`,
    id ? [id] : []
  );

  useEffect(() => {
    if (error) logError('jobs.useJob', 'query failed', error, { id });
  }, [error, id]);

  if (!id) return { job: null, isLoading: false };
  if (isLoading) return { job: undefined, isLoading: true };
  return { job: data?.[0] ?? null, isLoading: false };
}
