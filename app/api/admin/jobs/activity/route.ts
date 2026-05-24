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
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

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
