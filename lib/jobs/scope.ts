// lib/jobs/scope.ts
//
// drawings-collaboration Slice 0 — shared "users on / overseeing this
// job" helper. Every job-scoped notification (drawing assigned, drawing
// note, drawing due, job stage change, etc.) targets the same cohort:
// the active members of `job_team`. Optionally excludes the actor (the
// admin who triggered the event) so they don't ping themselves.
//
// Split into:
//   - `resolveJobScope(teamRows, excludeActor?)` — pure, unit-testable.
//   - `usersForJobScope(jobId, supabase, excludeActor?)` — async
//     wrapper around the supabase query. Tested at the integration
//     layer via the routes that call it.
//
// The pure half is what most callers test against; the I/O wrapper is
// a thin one-query shim around it.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface JobTeamRow {
  user_email: string | null;
}

/** Distinct, lowercased, non-empty emails from the job_team rows,
 *  optionally excluding `actorEmail` so the triggering admin doesn't
 *  ping themselves. Preserves first-seen order. */
export function resolveJobScope(
  teamRows: readonly JobTeamRow[],
  actorEmail?: string | null,
): string[] {
  const actor = actorEmail?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of teamRows) {
    const email = row.user_email?.trim().toLowerCase();
    if (!email) continue;
    if (email === actor) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Fetch the active job_team rows for `jobId` and return the resolved
 *  scope. Returns [] on a query failure rather than throwing — the
 *  worst that should happen on a notification fan-out is "no one gets
 *  notified", not "the whole request fails". */
export async function usersForJobScope(
  jobId: string,
  supabase: SupabaseClient,
  actorEmail?: string | null,
): Promise<string[]> {
  if (!jobId) return [];
  const { data, error } = await supabase
    .from('job_team')
    .select('user_email')
    .eq('job_id', jobId)
    .is('removed_at', null);
  if (error || !data) return [];
  return resolveJobScope(data as JobTeamRow[], actorEmail);
}
