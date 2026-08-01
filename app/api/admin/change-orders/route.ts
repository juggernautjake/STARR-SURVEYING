// app/api/admin/change-orders/route.ts — how surveying jobs lose money (audit §3, Phase 2 item 11).
//
// §3: *"No change orders. Scope creep is how surveying jobs lose money; there is no way to record
// 'customer added 3 acres on 7/14 at $X.'"*
//
//   GET ?jobId=…  → the job's change orders, in number order.
//   POST          → raise one. body: { job_id, description, amount_cents?, days_added? }
//   PATCH         → send / approve / decline / void. body: { id, action, … }
//
// A change order can be NEGATIVE — scope gets reduced too — which is why `amount_cents` is signed
// rather than needing a second "credit" concept for the same event.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { mintProposalToken, hashIp } from '@/lib/proposals/proposals';

const COLS = 'id, job_id, number, description, amount_cents, days_added, status, requested_at, requested_by, decided_at, approved_by_name, approved_by_email, decline_reason, public_token, notes';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId');
  let q = supabaseAdmin.from('change_orders').select(COLS).order('number', { ascending: true }).limit(200);
  if (jobId) q = q.eq('job_id', jobId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changeOrders: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id ?? '');
  const description = String(body.description ?? '').trim();
  if (!jobId || !description) {
    // The description is the whole record. "CO #2, $800" a year later is a number nobody can defend.
    return NextResponse.json({ error: 'job_id and a description of what changed are required.' }, { status: 400 });
  }

  const { data: prior } = await supabaseAdmin.from('change_orders').select('number').eq('job_id', jobId).order('number', { ascending: false }).limit(1);
  const number = (((prior ?? [])[0] as { number: number } | undefined)?.number ?? 0) + 1;

  const amount = Number(body.amount_cents ?? 0);
  const days = Number(body.days_added ?? 0);

  const { data, error } = await supabaseAdmin
    .from('change_orders')
    .insert({
      job_id: jobId,
      number,
      description,
      amount_cents: Number.isFinite(amount) ? Math.round(amount) : 0,
      // Scope creep costs time as well as money and usually only one of them gets recorded.
      days_added: Number.isFinite(days) ? Math.round(days) : 0,
      status: 'draft',
      requested_by: session.user.email,
      notes: body.notes ?? null,
    })
    .select(COLS)
    .single();

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json({ error: 'Someone raised a change order at the same moment. Reload and try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ changeOrder: data });
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
    const { data: current } = await supabaseAdmin.from('change_orders').select('public_token, status').eq('id', id).maybeSingle();
    const row = current as { public_token: string | null; status: string } | null;
    if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (row.status === 'approved') return NextResponse.json({ error: 'That change order is already approved.' }, { status: 409 });
    // Reused on a re-send, for the same reason proposals reuse theirs: rotating it breaks the link in
    // the email the customer already has.
    const token = row.public_token ?? mintProposalToken();
    const { data, error } = await supabaseAdmin.from('change_orders').update({ status: 'sent', public_token: token, updated_at: now }).eq('id', id).select(COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changeOrder: data, url: `/change-order/${token}` });
  }

  if (action === 'approve') {
    // An in-office approval — the customer said yes on the phone. Recorded with WHO said so, because
    // "the customer approved it" with no name attached is not something anyone can stand behind when
    // the invoice is disputed.
    const who = String(body.approved_by_name ?? '').trim();
    if (!who) return NextResponse.json({ error: 'Who approved it? An approval with no name attached cannot be defended when the invoice is queried.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('change_orders')
      .update({
        status: 'approved',
        decided_at: now,
        approved_by_name: who,
        approved_by_email: String(body.approved_by_email ?? '').trim() || null,
        approval_ip_hash: hashIp(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null),
        public_token: null,
        updated_at: now,
      })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changeOrder: data });
  }

  if (action === 'decline' || action === 'void') {
    const { data, error } = await supabaseAdmin
      .from('change_orders')
      .update({
        status: action === 'decline' ? 'declined' : 'void',
        decided_at: now,
        decline_reason: String(body.decline_reason ?? '').trim() || null,
        public_token: null,
        updated_at: now,
      })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changeOrder: data });
  }

  return NextResponse.json({ error: "action must be 'send', 'approve', 'decline' or 'void'." }, { status: 400 });
});
