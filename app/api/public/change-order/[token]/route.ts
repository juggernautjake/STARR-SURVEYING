// app/api/public/change-order/[token]/route.ts — the customer approves a change (Phase 2 item 11).
//
//   GET  → the change order, the job it belongs to, and the firm.
//   POST → approve or decline. body: { decision: 'approve'|'decline', name, email?, reason? }
//
// §3: *"Scope creep is how surveying jobs lose money; there is no way to record 'customer added 3
// acres on 7/14 at $X.'"* Recording it internally is half the job — the half that still leaves the
// firm arguing about it at invoice time. This is the other half: the customer's own yes, with a name
// and a timestamp on it.
//
// Same evidence rules as a proposal acceptance (seed 523): a name is the signature, the decision is
// recorded once, and a second click on an already-decided order is a success rather than an error.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseUnscoped } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { hashIp } from '@/lib/proposals/proposals';

const db = supabaseUnscoped;
const COLS = 'id, job_id, org_id, number, description, amount_cents, days_added, status, requested_at, decided_at, approved_by_name, decline_reason';

async function load(token: string) {
  const { data, error } = await db.from('change_orders').select(COLS).eq('public_token', token).maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string; job_id: string; org_id: string | null; number: number; description: string;
    amount_cents: number; days_added: number; status: string; requested_at: string;
    decided_at: string | null; approved_by_name: string | null; decline_reason: string | null;
  } | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
  const co = token ? await load(token) : null;
  if (!co) return NextResponse.json({ error: 'This change order link is not valid.' }, { status: 404 });

  const { data: job } = await db.from('jobs').select('job_number, name, address, city, state').eq('id', co.job_id).maybeSingle();
  const firm = await getTenantProfile(co.org_id);

  return NextResponse.json({
    changeOrder: {
      number: co.number, description: co.description, amount_cents: co.amount_cents,
      days_added: co.days_added, status: co.status, requested_at: co.requested_at,
      decided_at: co.decided_at, approved_by_name: co.approved_by_name,
    },
    job: job ?? null,
    firm: { name: firm.name, phone: firm.phone, phoneE164: firm.phoneE164, email: firm.contactEmail },
    // Only a `sent` order is decidable. A draft whose token leaked, and one already decided, are
    // both read-only — and each says so differently.
    decidable: co.status === 'sent',
  }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
  const body = await req.json().catch(() => ({}));
  const decision = String(body.decision ?? '');
  const name = String(body.name ?? '').trim();

  if (decision !== 'approve' && decision !== 'decline') {
    return NextResponse.json({ error: "decision must be 'approve' or 'decline'." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'Please type your full name.' }, { status: 400 });

  const co = token ? await load(token) : null;
  if (!co) return NextResponse.json({ error: 'This change order link is not valid.' }, { status: 404 });

  if (co.status !== 'sent') {
    // Already decided is a SUCCESS from the customer's side — they double-clicked, or came back to
    // the link later. Reporting an error makes them try again or call.
    const already = co.status === 'approved' || co.status === 'declined';
    return NextResponse.json(
      already
        ? { ok: true, alreadyDecided: true, status: co.status, message: `This change was already ${co.status}${co.approved_by_name ? ` by ${co.approved_by_name}` : ''}.` }
        : { error: 'This change order is not ready for a decision yet.' },
      { status: already ? 200 : 409 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from('change_orders')
    .update({
      status: decision === 'approve' ? 'approved' : 'declined',
      decided_at: now,
      approved_by_name: name,
      approved_by_email: String(body.email ?? '').trim() || null,
      approval_ip_hash: hashIp(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null),
      decline_reason: decision === 'decline' ? String(body.reason ?? '').trim() || null : null,
      // The link stops working once decided, so a forwarded email cannot be used to reverse it.
      public_token: null,
      updated_at: now,
    })
    .eq('id', co.id)
    // Guarded on the status we read: two people clicking at once cannot both decide it.
    .eq('status', 'sent');

  if (error) return NextResponse.json({ error: `Could not record your decision: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, status: decision === 'approve' ? 'approved' : 'declined' });
});
