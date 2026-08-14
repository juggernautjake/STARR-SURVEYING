// app/api/admin/jobs/stages/route.ts — Stage transitions
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { isStageTransition } from '@/lib/notifications/job-stage';
import { notifyJobEvent } from '@/lib/notifications/job-event';

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

  // Get current job
  const { data: job } = await supabaseAdmin.from('jobs').select('stage, job_number').eq('id', job_id).single();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Update job stage and corresponding date
  const updateFields: Record<string, unknown> = {
    stage: to_stage,
    stage_changed_at: new Date().toISOString(),
  };
  if (STAGE_DATE_MAP[to_stage]) {
    updateFields[STAGE_DATE_MAP[to_stage]] = new Date().toISOString();
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

  // ── N3 (2026-08-14): moved onto the one notifier ────────────────────────────────────────────
  //
  // This was the ONLY job mutation in the product that told anybody anything, and it resolved its
  // own recipients from `job_team` — which meant it notified people who had been REMOVED from the
  // job (`removed_at`) and people who had DECLINED it (`declined_at`), because the local resolver
  // never learned about either column. `jobRecipients` inside `notifyJobEvent` knows about both,
  // and includes the lead RPLS whether or not anybody remembered to add them to the crew list.
  //
  // `isStageTransition` stays: a no-op "set to the same stage" must not notify, and that guard is
  // about this route's semantics rather than about who hears.
  if (isStageTransition(job.stage as string, to_stage)) {
    await notifyJobEvent(job_id, {
      kind: 'stage_changed',
      title: `${job.stage} → ${to_stage}`,
      body: notes ? String(notes) : undefined,
      escalation: 'high',
    }, session.user.email);
  }

  return NextResponse.json({ success: true, from_stage: job.stage, to_stage });
}, { routeName: 'jobs/stages' });
