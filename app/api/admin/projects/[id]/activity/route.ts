// app/api/admin/projects/[id]/activity/route.ts — everything that has happened on a project.
//
//   GET /api/admin/projects/<id>/activity → { activity: [{ type, label, actor, at, detail, fields, job_id, job_name, job_number }] }
//
// Owner, 2026-10-11: *"All file additions and changes for each project and job should be tracked
// and logged."* The change log (`record_changes`, seeds/676) carries `project_id` on every row —
// the project's own edits and documents and everything on its jobs — so this is one query, joined
// to job names so a line can say which job it happened on. Project events from `activity_log` that
// predate the change log are folded in so the history does not start on the day it was built.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { dbErrorResponse } from '@/lib/apiErrorHandler';
import { changeView, isCoveredByChangeLog, type RecordChange } from '@/lib/activity/record-activity';
import { changesForProject, CHANGE_LOG_STARTED_AT } from '@/lib/activity/record-activity-server';

const LEGACY_LABELS: Record<string, string> = {
  project_created: 'Project added',
  project_updated: 'Project updated',
  project_deleted: 'Project deleted',
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Through the org-scoped client: another firm's project is a 404, not an empty history.
  const { data: project, error } = await supabaseAdmin
    .from('projects').select('id').eq('id', params.id).maybeSingle();
  if (error) return dbErrorResponse(error, 'load the project');
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const [changes, legacy]: [RecordChange[], { data: unknown[] | null }] = await Promise.all([
    changesForProject(params.id),
    supabaseAdmin
      .from('activity_log')
      .select('id, user_email, action_type, metadata, created_at')
      .eq('entity_type', 'project')
      .eq('entity_id', params.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const jobIds = [...new Set(changes.map((c) => c.job_id).filter((x): x is string => Boolean(x)))];
  const jobs = new Map<string, { name: string | null; job_number: string | null }>();
  if (jobIds.length > 0) {
    const { data } = await supabaseAdmin.from('jobs').select('id, name, job_number').in('id', jobIds);
    for (const j of (data ?? []) as Array<{ id: string; name: string | null; job_number: string | null }>) jobs.set(j.id, j);
  }

  const activity = changes.map((row) => {
    const v = changeView(row);
    const job = row.job_id ? jobs.get(row.job_id) : undefined;
    return { ...v, job_name: job?.name ?? null, job_number: job?.job_number ?? null };
  });

  for (const row of (legacy.data ?? []) as Array<{ id: string; user_email: string | null; action_type: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
    const action = String(row.action_type ?? '');
    if (isCoveredByChangeLog(action, row.created_at, CHANGE_LOG_STARTED_AT)) continue;
    const fields = Array.isArray(row.metadata?.fields) ? (row.metadata!.fields as string[]) : [];
    activity.push({
      id: `log-${row.id}`,
      type: action,
      label: LEGACY_LABELS[action] ?? action.replace(/_/g, ' '),
      detail: fields.length > 0 ? `Changed: ${fields.join(', ').replace(/_/g, ' ')}` : undefined,
      fields: [],
      actor: String(row.user_email ?? 'system'),
      at: row.created_at,
      job_id: null,
      job_name: null,
      job_number: null,
    });
  }

  activity.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ activity });
}
