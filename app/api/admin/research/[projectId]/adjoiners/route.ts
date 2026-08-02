// app/api/admin/research/[projectId]/adjoiners/route.ts — the neighbours (plan R31–R33).
//
// GET  — the register, ranked by how likely each neighbour is to help.
// POST — `{ action: 'deepen' | 'decline', adjoinerId }`. Deepening queues a full R28 research
//        request for that parcel and links it back, so the subject property's page can show where it
//        got to.
//
// The shallow pass already happens inside the pipeline. What was missing is everything that makes it
// usable: a row per neighbour, survey recency, and a way for a reviewer to say "that one — go
// properly".

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  rankAdjoiners,
  summariseAdjoiners,
  type AdjoinerRow,
} from '@/lib/research/adjoiner-register';
import { dedupeKey, validateRequest } from '@/lib/research/intake';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_adjoiners')
    .select('*')
    .eq('research_project_id', projectId);

  // A failed read is not "no neighbours" — and "no neighbours" is itself a gap in the research
  // rather than a finding about the property, so neither may be rendered as a clean empty list.
  if (error) {
    return NextResponse.json(
      { error: 'The neighbour register could not be read. This is not the same as there being none.' },
      { status: 500 },
    );
  }

  const ranked = rankAdjoiners((data ?? []) as AdjoinerRow[], new Date());
  return NextResponse.json(
    { adjoiners: ranked, summary: summariseAdjoiners(ranked) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/adjoiners' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'deepen' | 'decline';
    adjoinerId?: string;
  };
  if (!body.adjoinerId) return NextResponse.json({ error: 'adjoinerId is required' }, { status: 400 });

  const { data: adjoiner } = await supabaseAdmin
    .from('research_adjoiners').select('*')
    .eq('id', body.adjoinerId).eq('research_project_id', projectId).single();
  if (!adjoiner) return NextResponse.json({ error: 'Neighbour not found for this project' }, { status: 404 });

  const row = adjoiner as AdjoinerRow;

  if (body.action === 'decline') {
    // Recorded rather than removed: "we looked and decided not to" is a different state from "we
    // never considered it", and only one of them means somebody made a judgement.
    await supabaseAdmin.from('research_adjoiners')
      .update({ depth: 'declined', requested_by: session.user.email, requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', body.adjoinerId);
    return NextResponse.json({ ok: true, depth: 'declined' });
  }

  if (row.depth === 'requested' || row.depth === 'researched') {
    return NextResponse.json(
      { error: `This neighbour is already ${row.depth}. A second run would cost the same and find the same thing.` },
      { status: 409 },
    );
  }

  // The subject's county is the neighbour's county — they share a boundary. Taking it from the
  // subject rather than guessing avoids sending a run at the wrong clerk.
  const { data: project } = await supabaseAdmin
    .from('research_projects').select('county, state').eq('id', projectId).single();
  const county = (project as { county?: string } | null)?.county ?? '';
  const state = (project as { state?: string } | null)?.state ?? 'TX';

  // A neighbour with no address and no parcel id cannot be researched — the run would have nothing
  // to search on. Said plainly rather than queued and failed 25 minutes later.
  const address = row.situs_address || (row.parcel_id ? `Parcel ${row.parcel_id}` : '');
  const check = validateRequest({ address, county, state });
  if (!check.ok) {
    return NextResponse.json(
      {
        error:
          `This neighbour cannot be researched yet: ${check.error} ` +
          'Add a situs address or a parcel id for it first — a run with nothing to search on fails slowly.',
      },
      { status: 400 },
    );
  }

  const { data: request, error: reqErr } = await supabaseAdmin
    .from('research_requests')
    .insert({
      address: check.normalised!.address,
      county: check.normalised!.county,
      state: check.normalised!.state,
      parcel_id: row.parcel_id,
      owner_name: row.owner_name,
      dedupe_key: dedupeKey(check.normalised!.address, county, state),
      source: 'manual',
      requested_by: session.user.email,
      notify_email: session.user.email,
      status: 'queued',
    })
    .select('id')
    .single();

  // 23505 is R28's active-request guard: somebody already queued this parcel, possibly from another
  // property that also adjoins it. Linking to the existing request is right — running it twice is
  // not.
  let requestId: string | null = (request as { id?: string } | null)?.id ?? null;
  if (reqErr && (reqErr as { code?: string }).code === '23505') {
    const { data: existing } = await supabaseAdmin
      .from('research_requests').select('id')
      .eq('dedupe_key', dedupeKey(check.normalised!.address, county, state))
      .in('status', ['queued', 'running']).limit(1).single();
    requestId = (existing as { id?: string } | null)?.id ?? null;
  } else if (reqErr) {
    return NextResponse.json({ error: `Could not queue the neighbour research: ${reqErr.message}` }, { status: 500 });
  }

  await supabaseAdmin.from('research_adjoiners')
    .update({
      depth: 'requested',
      deep_request_id: requestId,
      requested_by: session.user.email,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.adjoinerId);

  return NextResponse.json({ ok: true, depth: 'requested', requestId, alreadyQueued: !!reqErr });
}, { routeName: 'research/adjoiners-deepen' });
