// app/api/admin/payouts/route.ts
//
// Employee-payout ledger CRUD. List + record per-employee compensation
// outflows by rail (Venmo / CashApp / Stripe / Check / Cash / etc.).
//
// Phase R-13 of OWNER_REPORTS.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { PAYOUT_METHODS, type PayoutMethod } from '@/lib/payouts/methods';
import { readPayouts } from '@/lib/payroll/payout-ledger';
import { notify } from '@/lib/notifications';
import { buildPayoutNotification } from '@/lib/notifications/payout';

export const runtime = 'nodejs';

// The one vocabulary. This list used to live here and included `stripe`, which no rail can send —
// so a payment could be recorded through a channel that does not exist. See lib/payouts/methods.ts.
const VALID_METHODS = PAYOUT_METHODS;
type Method = PayoutMethod;

interface PayoutRow {
  id: string;
  userEmail: string;
  amountCents: number;
  method: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
  createdAt: string;
}

async function resolveAdminOrg(email: string): Promise<string | null> {
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', email)
    .maybeSingle();
  if (!user?.default_org_id) return null;
  const { data: m } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', email)
    .maybeSingle();
  if (!m || m.role !== 'admin') return null;
  return user.default_org_id;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = await resolveAdminOrg(session.user.email);
  if (!orgId) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  const url = new URL(req.url);
  const fromIso = url.searchParams.get('from');
  const toIso = url.searchParams.get('to');
  const employee = url.searchParams.get('employee');
  const method = url.searchParams.get('method');

  // ── ONE LEDGER (C-16, 2026-08-04) ───────────────────────────────────────────────────────
  //
  // This route used to read and write `employee_payouts`: twelve columns, no batch, no status,
  // no failure handling, and nothing else in the platform wrote to it. Meanwhile the ACH export,
  // the tax report, the finance overview and the per-employee payout tab all read
  // `payout_batch_items`. Two records of "we paid this person", sharing no rows.
  //
  // `payout_batch_items` won because it is the one that can express what actually happens: a
  // batch, an approval, a dispatch, a per-item status, an external reference, a failure reason,
  // a void. See `lib/payroll/payout-ledger.ts`.
  const { payouts: ledgerRows, error } = await readPayouts({
    orgId,
    from: fromIso,
    to: toIso,
    userEmail: employee ?? undefined,
  });

  if (error) {
    console.error('[payouts] list failed', error);
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 });
  }

  // Method is filtered here rather than in the query: it lives on the item, but so does every
  // other filter, and keeping one of them in SQL and the rest in memory is how a filter quietly
  // stops applying.
  const data = method ? ledgerRows.filter((r) => r.method === method) : ledgerRows;

  const payouts: PayoutRow[] = data.map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    amountCents: r.amount_cents,
    // A ledger row always carries an amount and a person; the rest can legitimately be absent on a
    // payment that has not gone out yet, so they default rather than being asserted non-null.
    method: r.method ?? 'unknown',
    reference: r.reference,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    notes: r.notes,
    paidAt: r.paid_at ?? '',
    // `created_by` lives on the batch, not the item — the ledger does not carry it per payment.
    createdBy: '',
    createdAt: r.created_at ?? '',
  }));

  // Aggregate totals by method (the boss wants this for reconciliation).
  const byMethod: Record<string, number> = {};
  let totalCents = 0;
  for (const p of payouts) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
    totalCents += p.amountCents;
  }

  return NextResponse.json({ payouts, totalCents, byMethod });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = await resolveAdminOrg(session.user.email);
  if (!orgId) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  let body: {
    userEmail?: string;
    amountCents?: number;
    method?: string;
    reference?: string;
    periodStart?: string;
    periodEnd?: string;
    notes?: string;
    paidAt?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userEmail = body.userEmail?.trim().toLowerCase();
  if (!userEmail) return NextResponse.json({ error: 'userEmail required' }, { status: 400 });

  const amountCents = Math.round(body.amountCents ?? 0);
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: 'amountCents must be > 0' }, { status: 400 });
  }

  const method = body.method as Method | undefined;
  if (!method || !VALID_METHODS.includes(method)) {
    return NextResponse.json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` }, { status: 400 });
  }

  // A one-off payout is recorded as a batch of one, so it lands in the same ledger as everything
  // else. Writing it anywhere else is what produced two records of the same event: a payment made
  // here would have been invisible to the ACH export, the tax report and the finance overview.
  const paidAt = body.paidAt || new Date().toISOString();

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('payout_batches')
    .insert({
      org_id: orgId,
      label: body.notes?.trim() || 'One-off payout',
      kind: 'manual',
      week_start: body.periodStart || null,
      week_end: body.periodEnd || null,
      // Already paid — this route records a payment that happened, it does not schedule one.
      status: 'completed',
      total_cents: amountCents,
      created_by: session.user.email,
      approved_by: session.user.email,
      approved_at: paidAt,
      completed_at: paidAt,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    console.error('[payouts] batch insert failed', batchError);
    return NextResponse.json({ error: 'Failed to record payout' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('payout_batch_items')
    .insert({
      org_id: orgId,
      batch_id: batch.id,
      user_email: userEmail,
      total_cents: amountCents,
      method,
      external_ref: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      status: 'paid',
      paid_at: paidAt,
    })
    .select('id, total_cents, method, user_email, paid_at')
    .single();

  if (error || !data) {
    console.error('[payouts] insert failed', error);
    // The batch is already in. Left as an empty completed batch it would show a total with no
    // items behind it, so it is removed rather than left to puzzle somebody reading the ledger.
    await supabaseAdmin.from('payout_batches').delete().eq('id', batch.id);
    return NextResponse.json({ error: 'Failed to record payout' }, { status: 500 });
  }

  await supabaseAdmin.from('audit_log').insert({
    org_id: orgId,
    customer_email: session.user.email,
    action: 'PAYOUT_RECORDED',
    severity: 'info',
    metadata: { payout_id: data.id, user_email: userEmail, amount_cents: amountCents, method },
  });

  // notifications-completeness-pass Slice 2 — the employee gets a bell
  // notification so the payout shows up next to their other pay-related
  // events (raises, hours decisions). Link to /admin/my-pay.
  const notice = buildPayoutNotification({
    user_email: userEmail,
    amount_cents: amountCents,
    method,
    paid_at: data.paid_at,
  });
  if (notice) await notify(notice);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
