// app/api/admin/jobs/conversation/route.ts — find-or-create the
// messaging conversation for a job. JOB_WORKSPACE_BUILDOUT slice F.
//
// Conversations carry a `metadata` jsonb, so we scope one to a job
// via metadata.job_id without a schema change. GET returns the job's
// conversation id, creating it (titled "Job <number> — <name>", with
// the job team as participants) on first use.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, dbErrorResponse } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  // Already have one?
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('conversations')
    .select('id, title')
    .eq('metadata->>job_id', jobId)
    .limit(1)
    .maybeSingle();
  if (findErr) return dbErrorResponse(findErr, 'find the job conversation');
  if (existing) return NextResponse.json({ conversation_id: existing.id, created: false });

  // Build the participant set from the job + its team.
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('name, job_number, lead_rpls_email')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) return dbErrorResponse(jobErr, 'load the job');
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const { data: team } = await supabaseAdmin
    .from('job_team')
    .select('user_email')
    .eq('job_id', jobId)
    .is('removed_at', null);

  const emails = new Set<string>([session.user.email]);
  if (job.lead_rpls_email) emails.add(job.lead_rpls_email);
  for (const t of team ?? []) if (t.user_email) emails.add(t.user_email);

  const { data: conversation, error: convErr } = await supabaseAdmin
    .from('conversations')
    .insert({
      title: `Job ${job.job_number} — ${job.name}`,
      type: 'group',
      created_by: session.user.email,
      metadata: { job_id: jobId },
    })
    .select('id')
    .single();
  if (convErr) return dbErrorResponse(convErr, 'create the job conversation');

  const { error: partErr } = await supabaseAdmin
    .from('conversation_participants')
    .insert(
      [...emails].map((email) => ({
        conversation_id: conversation.id,
        user_email: email,
        role: email === session.user.email ? 'owner' : 'member',
      })),
    );
  if (partErr) return dbErrorResponse(partErr, 'add conversation participants');

  return NextResponse.json({ conversation_id: conversation.id, created: true });
}, { routeName: 'jobs/conversation', exposeErrors: true });
