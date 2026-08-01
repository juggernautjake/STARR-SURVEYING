// app/api/admin/proposals/route.ts — compose and send a proposal (audit §3, Phase 2 item 9).
//
//   GET ?leadId=…  → the lead's proposal versions, newest first.
//   POST           → create the next version. body: { lead_id, amount_cents, scope_of_work, line_items?, terms?, valid_until?, template_id? }
//   PATCH          → send it (mints the public token) or mark it declined. body: { id, action: 'send'|'decline', decline_reason? }
//
// ── A REVISION IS A NEW VERSION, NEVER AN EDIT ──────────────────────────────────────────────────
//
// Seed 505's rule, and this route enforces it: POST always appends. There is deliberately no "edit
// the amount" path, because the moment a customer says "can you do it for less?", the original figure
// is what tells the firm its discount rate and why it loses.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { mintProposalToken, normaliseLineItem, sumLineItems, type ProposalLineItem } from '@/lib/proposals/proposals';

const COLS = 'id, lead_id, version, amount_cents, status, scope_of_work, scope_notes, terms, line_items, valid_until, public_token, sent_at, decided_at, quoted_at, decline_reason';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const leadId = new URL(req.url).searchParams.get('leadId');
  if (!leadId) return NextResponse.json({ error: 'leadId is required.' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('lead_quotes').select(COLS).eq('lead_id', leadId).order('version', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const leadId = String(body.lead_id ?? '');
  if (!leadId) return NextResponse.json({ error: 'lead_id is required.' }, { status: 400 });

  // Optionally start from a template. Its fields are a starting point; anything supplied overrides.
  type Template = { scope_of_work: string; terms: string | null; line_items: ProposalLineItem[] };
  let template: Template | null = null;
  if (body.template_id) {
    const { data } = await supabaseAdmin.from('proposal_templates').select('scope_of_work, terms, line_items').eq('id', String(body.template_id)).maybeSingle();
    template = (data as unknown as Template | null) ?? null;
  }

  const rawItems = Array.isArray(body.line_items) ? body.line_items : template?.line_items ?? [];
  const lineItems = rawItems.map(normaliseLineItem);

  // The total: whatever was supplied, else the sum of the lines. `amount_cents` stays the authority —
  // seed 523's comment — because the total is what was agreed and the lines are how it was explained.
  const supplied = Number(body.amount_cents);
  const amountCents = Number.isFinite(supplied) && supplied >= 0 ? Math.round(supplied) : sumLineItems(lineItems);
  if (amountCents <= 0 && lineItems.length === 0) {
    return NextResponse.json({ error: 'A proposal needs an amount or at least one line item.' }, { status: 400 });
  }

  // Next version. Read-then-write races on `(lead_id, version)`, which is UNIQUE — so a collision is
  // caught by the database rather than producing two "version 2"s, exactly as seed 505 intends.
  const { data: latest } = await supabaseAdmin.from('lead_quotes').select('id, version').eq('lead_id', leadId).order('version', { ascending: false }).limit(1);
  const previous = (latest ?? [])[0] as { id: string; version: number } | undefined;
  const version = (previous?.version ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('lead_quotes')
    .insert({
      lead_id: leadId,
      version,
      amount_cents: amountCents,
      status: 'draft',
      scope_of_work: body.scope_of_work ?? template?.scope_of_work ?? null,
      scope_notes: body.scope_notes ?? null,
      terms: body.terms ?? template?.terms ?? null,
      line_items: lineItems,
      valid_until: body.valid_until || null,
      quoted_by: session.user.email,
    })
    .select(COLS)
    .single();

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json({ error: 'Someone else created a version at the same moment. Reload and try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The previous version is superseded, not deleted. Only after the new one exists — the reverse
  // order would leave a lead with nothing current if the insert failed.
  if (previous) {
    await supabaseAdmin.from('lead_quotes').update({ status: 'superseded', updated_at: new Date().toISOString() }).eq('id', previous.id).in('status', ['draft', 'sent']);
    // The superseded version's link stops working, so a customer holding an old email cannot accept
    // a price that has been withdrawn.
    await supabaseAdmin.from('lead_quotes').update({ public_token: null }).eq('id', previous.id);
  }

  return NextResponse.json({ proposal: data });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const action = String(body.action ?? '');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const now = new Date().toISOString();

  if (action === 'send') {
    const { data: current } = await supabaseAdmin.from('lead_quotes').select('public_token, status').eq('id', id).maybeSingle();
    const row = current as { public_token: string | null; status: string } | null;
    if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (row.status === 'accepted') return NextResponse.json({ error: 'This proposal has already been accepted.' }, { status: 409 });

    // The token is minted once and reused on a re-send. Rotating it would break the link in the
    // email the customer already has, which is the most common reason to press Send again.
    const token = row.public_token ?? mintProposalToken();
    const { data, error } = await supabaseAdmin
      .from('lead_quotes')
      .update({ status: 'sent', sent_at: now, public_token: token, updated_at: now })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposal: data, url: `/proposal/${token}` });
  }

  if (action === 'decline') {
    const { data, error } = await supabaseAdmin
      .from('lead_quotes')
      .update({
        status: 'declined',
        decided_at: now,
        // Seed 505: this is the "why we lose" report, and it only exists if it is captured now.
        decline_reason: String(body.decline_reason ?? '').trim() || null,
        public_token: null,
        updated_at: now,
      })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposal: data });
  }

  return NextResponse.json({ error: "action must be 'send' or 'decline'." }, { status: 400 });
});
