// app/api/admin/jobs/team/route.ts — Team member management
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { notifyJobEvent } from '@/lib/notifications/job-event';
import { notifyJobAssignment, notify } from '@/lib/notifications';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_team')
    .select('*')
    .eq('job_id', jobId)
    .is('removed_at', null)
    .order('assigned_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data || [] });
}, { routeName: 'jobs/team' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, user_email, user_name, role, notes } = await req.json();
  if (!job_id || !user_email || !role) {
    return NextResponse.json({ error: 'job_id, user_email, and role required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('job_team')
    .insert({ job_id, user_email, user_name, role, notes })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action: 'job_team_added',
    entity_type: 'job',
    entity_id: job_id,
    details: { added_email: user_email, role },
  }));

  // ── N3 (2026-08-14) — two notifications, on purpose ─────────────────────────────────────────
  //
  // The person being added needs "you are on this job" with a link to it; the rest of the crew
  // needs "somebody joined". Sending only the second leaves the new member finding out from a
  // colleague, and sending only the first leaves a crew who does not know who is turning up.
  //
  // The order matters: `notifyJobEvent` reads `job_team`, so the row above is already there and the
  // new member is in the recipient list by the time it runs. They are excluded explicitly rather
  // than by being passed as the actor — passing them as the actor silences the wrong person and
  // lets the admin who did this notify themselves about their own click.
  const { data: job } = await supabaseAdmin
    .from('jobs').select('job_number, name').eq('id', job_id).maybeSingle();
  const jobRow = job as { job_number: string | null; name: string | null } | null;
  await notifyJobAssignment(
    user_email, jobRow?.job_number ?? '', jobRow?.name ?? 'a job', job_id,
  );
  await notifyJobEvent(job_id, {
    kind: 'team_changed',
    title: `${user_name || user_email} joined the crew as ${role}`,
  }, session.user.email, [user_email]);

  return NextResponse.json({ member: data }, { status: 201 });
}, { routeName: 'jobs/team' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, role, notes } = await req.json();
  if (!id) return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });

  // The old row, for the "from → to" the notification needs. Read before the update, because after
  // it the previous role is gone and "changed to crew lead" without saying from what is a message
  // that makes people open the job to find out nothing happened.
  const { data: before } = await supabaseAdmin
    .from('job_team').select('job_id, user_email, user_name, role').eq('id', id).maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('job_team')
    .update({ role, notes })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // N3 — only when the ROLE moved. Editing the notes on a team row is bookkeeping, and a crew that
  // hears about it stops reading the ones where somebody became the crew lead.
  const prev = before as { job_id: string; user_email: string; user_name: string | null; role: string } | null;
  if (prev && role && role !== prev.role) {
    await notifyJobEvent(prev.job_id, {
      kind: 'team_changed',
      title: `${prev.user_name || prev.user_email} is now ${role} (was ${prev.role})`,
    }, session.user.email);
  }

  return NextResponse.json({ member: data });
}, { routeName: 'jobs/team' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });

  // Same reason as PUT: after the update this row is `removed_at`-stamped and `jobRecipients` drops
  // it, so who was removed has to be read first.
  const { data: before } = await supabaseAdmin
    .from('job_team').select('job_id, user_email, user_name, role').eq('id', id).maybeSingle();

  const { error } = await supabaseAdmin
    .from('job_team')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // N3 — the removed person is told directly; the crew is told by `notifyJobEvent`, which no longer
  // counts them as being on the job. Telling somebody they are off a job is not optional politeness:
  // the alternative is a crew member driving to a site on Monday.
  const prev = before as { job_id: string; user_email: string; user_name: string | null; role: string } | null;
  if (prev) {
    const { data: job } = await supabaseAdmin
      .from('jobs').select('job_number, name').eq('id', prev.job_id).maybeSingle();
    const jobRow = job as { job_number: string | null; name: string | null } | null;
    await notify({
      user_email: prev.user_email,
      type: 'job_team_changed',
      title: `Taken off ${jobRow?.job_number ? `${jobRow.job_number} · ` : ''}${jobRow?.name ?? 'a job'}`,
      body: 'You are no longer on this job’s crew.',
      link: '/admin/jobs',
      source_type: 'job',
      source_id: prev.job_id,
    });
    await notifyJobEvent(prev.job_id, {
      kind: 'team_changed',
      title: `${prev.user_name || prev.user_email} came off the crew`,
    }, session.user.email);
  }

  return NextResponse.json({ success: true });
}, { routeName: 'jobs/team' });
