// app/api/admin/jobs/stages/route.ts — Stage transitions
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { notifyJobStageUpdate } from '@/lib/notifications';
import { resolveStageRecipients, isStageTransition } from '@/lib/notifications/job-stage';

const STAGE_ORDER = ['quote', 'research', 'fieldwork', 'drawing', 'legal', 'delivery', 'completed'];
const STAGE_DATE_MAP: Record<string, string> = {
  research: 'date_accepted',
  fieldwork: 'date_started',
  drawing: 'date_fieldwork_complete',
  legal: 'date_drawing_complete',
  delivery: 'date_legal_complete',
  completed: 'date_delivered',
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_stages_history')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data || [], stages: STAGE_ORDER });
}, { routeName: 'jobs/stages' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, to_stage, notes } = await req.json();
  if (!job_id || !to_stage) return NextResponse.json({ error: 'job_id and to_stage required' }, { status: 400 });

  if (!STAGE_ORDER.includes(to_stage) && to_stage !== 'cancelled' && to_stage !== 'on_hold') {
    return NextResponse.json({ error: `Unknown stage: ${to_stage}` }, { status: 400 });
  }

  // Get current job. The milestone date is read too — see below.
  const dateCol = STAGE_DATE_MAP[to_stage];
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select(`stage, job_number${dateCol ? `, ${dateCol}` : ''}`)
    .eq('id', job_id)
    .single();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // ── MOVING IS ALLOWED IN BOTH DIRECTIONS, BUT A MILESTONE IS STAMPED ONCE ────────────────────
  //
  // Nothing here has ever restricted the direction of a transition, and it still does not — the
  // owner needs to put a job back to research when the deed work turns out to be wrong (2026-08-19).
  //
  // What DID need fixing is the date. `STAGE_DATE_MAP` stamps a milestone column on arrival, so
  // moving back to `research` overwrote `date_accepted` with today — silently rewriting when the
  // job was accepted, a figure that feeds reporting and the customer's paperwork. A milestone
  // records when a thing FIRST happened; revisiting a stage is not it happening again. So the date
  // is only written when it is not already set.
  const updateFields: Record<string, unknown> = {
    stage: to_stage,
    stage_changed_at: new Date().toISOString(),
  };
  if (dateCol && !(job as Record<string, unknown>)[dateCol]) {
    updateFields[dateCol] = new Date().toISOString();
  }

  const { error: updateError } = await supabaseAdmin
    .from('jobs')
    .update(updateFields)
    .eq('id', job_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Log stage transition
  await supabaseAdmin.from('job_stages_history').insert({
    job_id,
    from_stage: job.stage,
    to_stage,
    changed_by: session.user.email,
    notes,
  });

  // Log activity
  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'job_stage_changed',
    entity_type: 'job',
    entity_id: job_id,
    metadata: { from: job.stage, to: to_stage },
  }));

  // hub-widget-excellence-03 Slice 2d — notify the job's crew when the
  // stage genuinely changes (skip no-op "set to same stage"). Recipients
  // are the job_team emails minus the actor. Best-effort.
  if (isStageTransition(job.stage as string, to_stage)) {
    try {
      const { data: team } = await supabaseAdmin
        .from('job_team')
        .select('user_email')
        .eq('job_id', job_id);
      const teamRows = (team ?? []) as Array<{ user_email: string | null }>;
      const recipients = resolveStageRecipients(
        teamRows.map((t) => t.user_email),
        session.user.email,
      );
      if (recipients.length > 0) {
        await notifyJobStageUpdate(
          recipients,
          (job.job_number as string) ?? String(job_id),
          job_id,
          job.stage as string,
          to_stage,
        );
      }
    } catch { /* ignore notification failures */ }
  }

  return NextResponse.json({ success: true, from_stage: job.stage, to_stage });
}, { routeName: 'jobs/stages' });
