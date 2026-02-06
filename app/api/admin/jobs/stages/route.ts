// app/api/admin/jobs/stages/route.ts — Stage transitions
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const STAGE_ORDER = ['quote', 'research', 'fieldwork', 'drawing', 'legal', 'delivery', 'completed'];
const STAGE_DATE_MAP: Record<string, string> = {
  research: 'date_accepted',
  fieldwork: 'date_started',
  drawing: 'date_fieldwork_complete',
  legal: 'date_drawing_complete',
  delivery: 'date_legal_complete',
  completed: 'date_delivered',
};

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, to_stage, notes } = await req.json();
  if (!job_id || !to_stage) return NextResponse.json({ error: 'job_id and to_stage required' }, { status: 400 });

  // Get current job
  const { data: job } = await supabaseAdmin.from('jobs').select('stage').eq('id', job_id).single();
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
  await supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action: 'job_stage_changed',
    entity_type: 'job',
    entity_id: job_id,
    details: { from: job.stage, to: to_stage },
  }).catch(() => {});

  return NextResponse.json({ success: true, from_stage: job.stage, to_stage });
}
