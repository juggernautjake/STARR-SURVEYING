// app/api/admin/jobs/activity/route.ts — unified job activity feed
// JOB_WORKSPACE_BUILDOUT slice E.
//
// Merges two sources into one chronological timeline for a job:
//   - activity_log rows (entity_type='job', entity_id=<job>): file/
//     photo uploads, team changes, drawings saved, job created, etc.
//   - job_stages_history rows: stage transitions with notes.
// Returns newest-first, normalized to { type, label, actor, at, detail }.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, dbErrorResponse } from '@/lib/apiErrorHandler';

interface ActivityItem {
  type: string;
  label: string;
  actor: string;
  at: string;
  detail?: string;
}

const ACTION_LABELS: Record<string, string> = {
  job_created: 'Job created',
  job_file_uploaded: 'File uploaded',
  job_photo_uploaded: 'Photo uploaded',
  job_team_added: 'Team member added',
  job_stage_changed: 'Stage changed',
  cad_drawing_saved: 'CAD drawing saved',
};

function summarizeDetails(action: string, details: unknown): string | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const d = details as Record<string, unknown>;
  if (action === 'job_file_uploaded' || action === 'job_photo_uploaded') {
    return d.file_name ? String(d.file_name) : undefined;
  }
  if (action === 'job_team_added') {
    return [d.added_email, d.role].filter(Boolean).join(' · ') || undefined;
  }
  if (action === 'job_stage_changed') {
    return d.from && d.to ? `${d.from} → ${d.to}` : undefined;
  }
  if (action === 'cad_drawing_saved') {
    return d.name ? String(d.name) : undefined;
  }
  if (action === 'job_created') {
    return d.job_number ? `#${d.job_number}` : undefined;
  }
  return undefined;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');

  // hub-widget-excellence-10 — cross-job recent feed for the
  // job-activity-feed hub widget. When no job_id is given, merge the
  // most-recent job activity across every job (joined with the job
  // name) instead of erroring.
  if (!jobId) {
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 30));
    const [logRes, stageRes] = await Promise.all([
      supabaseAdmin
        .from('activity_log')
        .select('id, user_email, action, details, entity_id, created_at')
        .eq('entity_type', 'job')
        .order('created_at', { ascending: false })
        .limit(limit * 3),
      supabaseAdmin
        .from('job_stages_history')
        .select('id, job_id, from_stage, to_stage, changed_by, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(limit * 3),
    ]);
    if (logRes.error) return dbErrorResponse(logRes.error, 'load the activity log');
    if (stageRes.error) return dbErrorResponse(stageRes.error, 'load stage history');

    // Resolve job names for every referenced job in one round-trip.
    const ids = new Set<string>();
    for (const r of logRes.data ?? []) if (r.entity_id) ids.add(String(r.entity_id));
    for (const r of stageRes.data ?? []) if (r.job_id) ids.add(String(r.job_id));
    const jobMap = new Map<string, { name?: string | null; job_number?: string | null }>();
    if (ids.size > 0) {
      const { data: jobRows } = await supabaseAdmin
        .from('jobs').select('id, name, job_number').in('id', [...ids]);
      for (const j of jobRows ?? []) jobMap.set(String(j.id), { name: j.name, job_number: j.job_number });
    }

    const feed: Array<ActivityItem & { id: string; job_id: string | null; job_name: string | null; job_number: string | null }> = [];
    for (const row of logRes.data ?? []) {
      const action = String(row.action ?? '');
      if (action === 'job_stage_changed') continue; // richer copy lives in stage history
      const job = row.entity_id ? jobMap.get(String(row.entity_id)) : undefined;
      feed.push({
        id: `log-${row.id}`,
        type: action,
        label: ACTION_LABELS[action] ?? action.replace(/_/g, ' '),
        actor: String(row.user_email ?? 'system'),
        at: String(row.created_at),
        detail: summarizeDetails(action, row.details),
        job_id: row.entity_id ? String(row.entity_id) : null,
        job_name: job?.name ?? null,
        job_number: job?.job_number ?? null,
      });
    }
    for (const row of stageRes.data ?? []) {
      const job = row.job_id ? jobMap.get(String(row.job_id)) : undefined;
      feed.push({
        id: `stage-${row.id}`,
        type: 'job_stage_changed',
        label: 'Stage changed',
        actor: String(row.changed_by ?? 'system'),
        at: String(row.created_at),
        detail: [
          row.from_stage ? `${row.from_stage} → ${row.to_stage}` : `Set to ${row.to_stage}`,
          row.notes || null,
        ].filter(Boolean).join(' · '),
        job_id: row.job_id ? String(row.job_id) : null,
        job_name: job?.name ?? null,
        job_number: job?.job_number ?? null,
      });
    }
    feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return NextResponse.json({ activity: feed.slice(0, limit) });
  }

  const [logRes, stageRes] = await Promise.all([
    supabaseAdmin
      .from('activity_log')
      .select('user_email, action, details, created_at')
      .eq('entity_type', 'job')
      .eq('entity_id', jobId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('job_stages_history')
      .select('from_stage, to_stage, changed_by, notes, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (logRes.error) return dbErrorResponse(logRes.error, 'load the activity log');
  if (stageRes.error) return dbErrorResponse(stageRes.error, 'load stage history');

  const items: ActivityItem[] = [];

  for (const row of logRes.data ?? []) {
    const action = String(row.action ?? '');
    // Stage changes also live in job_stages_history with richer data —
    // skip the activity_log copy to avoid duplicates.
    if (action === 'job_stage_changed') continue;
    items.push({
      type: action,
      label: ACTION_LABELS[action] ?? action.replace(/_/g, ' '),
      actor: String(row.user_email ?? 'system'),
      at: String(row.created_at),
      detail: summarizeDetails(action, row.details),
    });
  }

  for (const row of stageRes.data ?? []) {
    items.push({
      type: 'job_stage_changed',
      label: 'Stage changed',
      actor: String(row.changed_by ?? 'system'),
      at: String(row.created_at),
      detail: [
        row.from_stage ? `${row.from_stage} → ${row.to_stage}` : `Set to ${row.to_stage}`,
        row.notes || null,
      ].filter(Boolean).join(' · '),
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json({ activity: items });
}, { routeName: 'jobs/activity', exposeErrors: true });
