// app/api/admin/research/requests/route.ts — the intake queue (plan R28).
//
// POST — queue a research request. Deduplicated: a run is 20–30 minutes of a machine plus real money
//        in paid pages, so two requests for one property must not both run.
// GET  — the queue, leading with what is stuck.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  queueSummary,
  validateRequest,
  type RequestRow,
  type ResearchRequestInput,
} from '@/lib/research/intake';
// How deep the queue is and whether it is still a queue (research plan R29).
import { backlogStatus } from '@/worker/src/infra/queue-worker';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status');
  let query = supabaseAdmin
    .from('research_requests')
    .select('*')
    .order('queued_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  // A failed read is not an empty queue — a screen showing "nothing waiting" while five requests sit
  // there is worse than one showing an error.
  if (error) {
    return NextResponse.json(
      { error: 'The request queue could not be read. This is not the same as it being empty.' },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as RequestRow[];
  const unnotified = rows.filter(
    (r) => (r.status === 'complete' || r.status === 'failed') && !(r as RequestRow & { notified_at?: string }).notified_at,
  ).length;

  // The visible backlog (plan R29). A queue whose depth nobody can see stretches to days without
  // anybody noticing, and the first symptom is a customer asking where their survey is.
  const maxConcurrent = Number(process.env.WORKER_MAX_CONCURRENT_PIPELINES) || 3;
  const backlog = backlogStatus(
    rows.filter((r) => r.status === 'queued').length,
    rows.filter((r) => r.status === 'running').length,
    maxConcurrent,
  );

  return NextResponse.json(
    { requests: rows, summary: queueSummary(rows, unnotified), backlog },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/requests' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as ResearchRequestInput;
  const check = validateRequest(body);
  // The guard is at the door: an unattended run cannot ask a person what they meant.
  if (!check.ok || !check.normalised) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  const n = check.normalised;

  const { data, error } = await supabaseAdmin
    .from('research_requests')
    .insert({
      address: n.address,
      county: n.county,
      state: n.state,
      parcel_id: body.parcelId ?? null,
      owner_name: body.ownerName ?? null,
      dedupe_key: n.dedupeKey,
      source: body.source ?? 'api',
      job_id: body.jobId ?? null,
      requested_by: session.user.email,
      notify_email: body.notifyEmail ?? session.user.email,
      status: 'queued',
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = the partial unique index on active requests. This is the guard working, not a fault:
    // somebody asked twice, and the second ask must not start a second 25-minute run.
    if ((error as { code?: string }).code === '23505') {
      const { data: existing } = await supabaseAdmin
        .from('research_requests')
        .select('*')
        .eq('dedupe_key', n.dedupeKey)
        .in('status', ['queued', 'running'])
        .limit(1)
        .single();
      return NextResponse.json(
        {
          duplicate: true,
          request: existing,
          message: 'This property is already queued or running. A second run was not started.',
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: `Could not queue the request: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}, { routeName: 'research/requests-create' });
