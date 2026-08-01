// app/api/public/proposal/[token]/route.ts — a customer reads and accepts a proposal.
//
//   GET  → the customer-facing proposal + the firm sending it.
//   POST → accept it. body: { signed_name, signed_email?, signature_image? }
//
// Public by token. No session, so every guard here is about the token and the state of the row.
//
// ── ACCEPTANCE CREATES A JOB, AND THAT IS THE POINT ─────────────────────────────────────────────
//
// §3 calls the proposal *"the front door of every job"* and D3 names the spine: lead → job → invoice
// → paid. An acceptance that only flips a status leaves somebody to notice and retype the job, which
// is where the front door leaks. So accepting writes: the evidence row, the quote status, the lead
// status, and the job — in that order, worst-case-first.
//
// ── ORDERING IS THE WHOLE RELIABILITY STORY ─────────────────────────────────────────────────────
//
// There is no transaction across these writes (PostgREST has no multi-statement transaction), so the
// order is chosen so that every partial failure is recoverable and none of them loses the customer's
// consent:
//
//   1. `quote_acceptances` — the evidence. If everything after this fails, the firm still knows the
//      customer accepted, and the unique index means a retry cannot double-record it.
//   2. the job. If this fails, an admin sees an accepted proposal with no job and can create it.
//   3. quote + lead status. Cosmetic by comparison, and derivable from 1 if it never lands.
//
// The reverse order — status first — would produce an "accepted" proposal with no evidence of who
// accepted it, which is the one state that cannot be reconstructed.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseUnscoped } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { customerFacingProposal, hashIp, jobFromAcceptedProposal, proposalViewState, type Proposal } from '@/lib/proposals/proposals';

// The UNSCOPED client on purpose: a customer has no session and therefore no tenant scope, so the
// scoped client would filter every row away. The token IS the authorisation — 256 bits of it — and
// each read is addressed by that token, so there is nothing to enumerate.
const db = supabaseUnscoped;

const QUOTE_COLS = 'id, lead_id, version, amount_cents, status, scope_of_work, scope_notes, terms, line_items, valid_until, public_token, sent_at, decided_at, quoted_at';

async function loadByToken(token: string) {
  const { data, error } = await db.from('lead_quotes').select(QUOTE_COLS).eq('public_token', token).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Proposal | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
  if (!token) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const proposal = await loadByToken(token);
  // Same 404 for "no such token" and "revoked token". Distinguishing them tells someone probing which
  // guesses were close.
  if (!proposal) return NextResponse.json({ error: 'This proposal link is not valid.' }, { status: 404 });

  const [{ data: acceptance }, { data: lead }] = await Promise.all([
    db.from('quote_acceptances').select('accepted_at, signed_name, quote_version').eq('quote_id', proposal.id).maybeSingle(),
    db.from('leads').select('id, name, company, property_address, city, state, survey_type, org_id').eq('id', proposal.lead_id).maybeSingle(),
  ]);

  const leadRow = lead as { org_id: string | null; name: string | null; company: string | null; property_address: string | null; city: string | null; state: string | null; survey_type: string | null } | null;
  const firm = await getTenantProfile(leadRow?.org_id);
  const state = proposalViewState(proposal, !!acceptance);

  return NextResponse.json({
    state,
    // The allow-list projection. `scope_notes` — the internal "we can go lower if they push" field —
    // is not in it, and cannot be added by accident because the projection names what IS included.
    proposal: customerFacingProposal(proposal),
    property: leadRow
      ? { address: leadRow.property_address, city: leadRow.city, state: leadRow.state, survey_type: leadRow.survey_type }
      : null,
    customer: leadRow ? { name: leadRow.name, company: leadRow.company } : null,
    firm: { name: firm.name, phone: firm.phone, phoneE164: firm.phoneE164, email: firm.contactEmail, addressLine1: firm.addressLine1, addressLine2: firm.addressLine2, logoUrl: firm.logoUrl },
    acceptance: acceptance ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
  const body = await req.json().catch(() => ({}));
  const signedName = String(body.signed_name ?? '').trim();
  if (!signedName) {
    return NextResponse.json({ error: 'Please type your full name to accept.' }, { status: 400 });
  }

  const proposal = await loadByToken(token);
  if (!proposal) return NextResponse.json({ error: 'This proposal link is not valid.' }, { status: 404 });

  const { data: existing } = await db.from('quote_acceptances').select('id, accepted_at').eq('quote_id', proposal.id).maybeSingle();
  const state = proposalViewState(proposal, !!existing);
  if (state !== 'acceptable') {
    // Each refusal gets its own sentence: a customer who already accepted, one whose quote was
    // revised and one whose quote expired need three different next steps, and only one is "call us".
    const message: Record<string, string> = {
      already_accepted: 'This proposal has already been accepted — thank you. We will be in touch about scheduling.',
      declined: 'This proposal was marked declined. Please contact us if that was not intended.',
      superseded: 'This proposal has been replaced by a newer version. Please use the most recent link we sent you.',
      expired: 'This proposal has expired. Please contact us and we will send an updated one.',
      not_sent: 'This proposal is not ready yet.',
    };
    return NextResponse.json({ error: message[state] ?? 'This proposal cannot be accepted.', state }, { status: 409 });
  }

  const { data: lead } = await db
    .from('leads')
    .select('id, org_id, name, email, phone, company, property_address, city, state, survey_type, estimated_acreage, customer_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  const leadRow = lead as Parameters<typeof jobFromAcceptedProposal>[0]['lead'] & { org_id: string | null } | null;

  const acceptedAt = new Date().toISOString();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  // ── 1. The evidence, first ──
  const { data: acceptance, error: acceptErr } = await db
    .from('quote_acceptances')
    .insert({
      org_id: leadRow?.org_id ?? null,
      quote_id: proposal.id,
      // The version and amount are COPIED, not referenced. The evidence must say what was on screen
      // when they clicked, not what the row says a year later.
      quote_version: proposal.version,
      amount_cents: proposal.amount_cents,
      scope_snapshot: proposal.scope_of_work,
      line_items_snapshot: proposal.line_items,
      signed_name: signedName,
      signed_email: String(body.signed_email ?? '').trim() || null,
      signature_image: typeof body.signature_image === 'string' && body.signature_image.startsWith('data:image/') ? body.signature_image : null,
      accepted_at: acceptedAt,
      ip_hash: hashIp(ip),
      user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
    })
    .select('id, accepted_at')
    .single();

  if (acceptErr) {
    // The unique index fired: they double-clicked, or the first response was lost. Already accepted
    // is a success from the customer's side, and saying otherwise makes them try again.
    if (/duplicate key|unique/i.test(acceptErr.message)) {
      return NextResponse.json({ ok: true, alreadyAccepted: true, message: 'This proposal was already accepted — thank you.' });
    }
    return NextResponse.json({ error: `Could not record your acceptance: ${acceptErr.message}` }, { status: 500 });
  }

  // ── 2. The job ──
  let jobId: string | null = null;
  let jobError: string | null = null;
  if (leadRow) {
    const { data: job, error } = await db
      .from('jobs')
      .insert({ ...jobFromAcceptedProposal({ lead: leadRow, proposal, acceptedAt }), org_id: leadRow.org_id })
      .select('id, job_number')
      .single();
    if (error) jobError = error.message; else jobId = (job as { id: string }).id;
  }

  // ── 3. Statuses ──
  await db.from('lead_quotes').update({ status: 'accepted', decided_at: acceptedAt, updated_at: acceptedAt }).eq('id', proposal.id);
  if (leadRow) {
    await db.from('leads').update({ status: 'won', converted_job_id: jobId, updated_at: acceptedAt }).eq('id', leadRow.id);
  }

  return NextResponse.json({
    ok: true,
    acceptance,
    job_id: jobId,
    // Surfaced rather than swallowed. An accepted proposal with no job is a recoverable state, and
    // the only way anyone finds out is if it says so.
    warning: jobError ? `Your acceptance was recorded, but the job could not be created automatically (${jobError}). We will set it up manually.` : null,
  });
});
