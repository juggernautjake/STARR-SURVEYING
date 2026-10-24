// lib/activity/record-activity-server.ts — reads of the activity stamps and the change log, and the
// one write the app makes itself (a view). Everything else is written by the triggers in seeds/676.
// The pure half — ordering and wording — is `record-activity.ts`.

import { supabaseAdmin } from '@/lib/supabase';
import { fireAndForget } from '@/lib/apiErrorHandler';
import type { ActivityStamp, RecordChange } from './record-activity';

/** When seeds/676 was applied to the live database: `activity_log` rows of the kinds the change log
 *  records are duplicates from this instant on. */
export const CHANGE_LOG_STARTED_AT = '2026-10-11T23:40:09Z';

const STAMP_COLS = 'last_modified_at, last_modified_by, last_viewed_at, last_viewed_by, last_activity_at';

/** The activity stamps for a set of jobs, keyed by job id. Missing rows simply are not in the map. */
export async function jobActivityFor(ids: string[]): Promise<Map<string, ActivityStamp>> {
  return stampsFor('job_activity', 'job_id', ids);
}

/** The activity stamps for a set of projects, keyed by project id. */
export async function projectActivityFor(ids: string[]): Promise<Map<string, ActivityStamp>> {
  return stampsFor('project_activity', 'project_id', ids);
}

async function stampsFor(table: string, key: string, ids: string[]): Promise<Map<string, ActivityStamp>> {
  const out = new Map<string, ActivityStamp>();
  if (ids.length === 0) return out;
  // `in()` goes on the URL; chunk so a long list cannot outgrow it.
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin.from(table).select(`${key}, ${STAMP_COLS}`).in(key, ids.slice(i, i + 150));
    for (const r of (data ?? []) as unknown as Array<ActivityStamp & Record<string, string>>) out.set(String(r[key]), r);
  }
  return out;
}

/** Somebody opened a job: stamp the job, and its project, as viewed by them. Advisory — a list
 *  order is never worth failing a page open over. */
export async function markJobViewed(jobId: string, projectId: string | null, email: string): Promise<void> {
  const now = new Date().toISOString();
  await fireAndForget(supabaseAdmin.from('job_activity').upsert(
    { job_id: jobId, last_viewed_at: now, last_viewed_by: email },
    { onConflict: 'job_id' },
  ));
  if (projectId) await markProjectViewed(projectId, email, now);
}

export async function markProjectViewed(projectId: string, email: string, now = new Date().toISOString()): Promise<void> {
  await fireAndForget(supabaseAdmin.from('project_activity').upsert(
    { project_id: projectId, last_viewed_at: now, last_viewed_by: email },
    { onConflict: 'project_id' },
  ));
}

const CHANGE_COLS = 'id, created_at, project_id, job_id, subject, subject_id, action, actor, changes, label';

/** A job's change log, newest first. */
export async function changesForJob(jobId: string, limit = 300): Promise<RecordChange[]> {
  const { data } = await supabaseAdmin
    .from('record_changes').select(CHANGE_COLS)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as RecordChange[];
}

/** A project's change log — the project itself, its own documents, and everything on its jobs. */
export async function changesForProject(projectId: string, limit = 300): Promise<RecordChange[]> {
  const { data } = await supabaseAdmin
    .from('record_changes').select(CHANGE_COLS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as RecordChange[];
}
