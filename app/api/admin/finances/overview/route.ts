// app/api/admin/finances/overview/route.ts
//
// G2 / Phase 2.2b of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — the unified
// "money in vs money out" (P&L / cash-flow) endpoint.
//
//   GET /api/admin/finances/overview?from=YYYY-MM-DD&to=YYYY-MM-DD[&granularity=day|week|month|year]
//
// Three streams (cash-flow truth — money that actually moved):
//   revenue  = payments.status='succeeded'           (cleared_at)
//   payouts  = payout_batch_items.status='paid'       (paid_at)
//   expenses = receipts.status in (approved,exported) (transaction_at), not deleted
//
// The math lives in lib/payments/finance-overview.ts (pure, unit-tested); this
// route just maps rows → MoneyEvent[] and returns the summary + per-period rows.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  summarizeFinances,
  financesByPeriod,
  type MoneyEvent,
  type Granularity,
} from '@/lib/payments/finance-overview';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GRANULARITIES = new Set<Granularity>(['day', 'week', 'month', 'year']);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const granRaw = (url.searchParams.get('granularity') ?? 'month') as Granularity;
  const granularity: Granularity = GRANULARITIES.has(granRaw) ? granRaw : 'month';

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: 'from + to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to.' }, { status: 400 });
  }

  const fromTs = `${from}T00:00:00Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const [payRes, payoutRes, recRes] = await Promise.all([
    supabaseAdmin
      .from('payments')
      .select('amount_cents, cleared_at')
      .eq('status', 'succeeded')
      .gte('cleared_at', fromTs)
      .lte('cleared_at', toTs),
    supabaseAdmin
      .from('payout_batch_items')
      .select('total_cents, paid_at')
      .eq('status', 'paid')
      .gte('paid_at', fromTs)
      .lte('paid_at', toTs),
    supabaseAdmin
      .from('receipts')
      .select('total_cents, transaction_at')
      .in('status', ['approved', 'exported'])
      .is('deleted_at', null)
      .gte('transaction_at', fromTs)
      .lte('transaction_at', toTs),
  ]);

  const firstError = payRes.error || payoutRes.error || recRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const payRows = (payRes.data ?? []) as Array<{ amount_cents: number | null; cleared_at: string | null }>;
  const payoutRows = (payoutRes.data ?? []) as Array<{ total_cents: number | null; paid_at: string | null }>;
  const recRows = (recRes.data ?? []) as Array<{ total_cents: number | null; transaction_at: string | null }>;

  const revenue: MoneyEvent[] = payRows
    .filter((r) => Boolean(r.cleared_at))
    .map((r) => ({ amount_cents: r.amount_cents ?? 0, at: r.cleared_at as string }));
  const payouts: MoneyEvent[] = payoutRows
    .filter((r) => Boolean(r.paid_at))
    .map((r) => ({ amount_cents: r.total_cents ?? 0, at: r.paid_at as string }));
  const expenses: MoneyEvent[] = recRows
    .filter((r) => Boolean(r.transaction_at))
    .map((r) => ({ amount_cents: r.total_cents ?? 0, at: r.transaction_at as string }));

  return NextResponse.json({
    from,
    to,
    granularity,
    summary: summarizeFinances(revenue, payouts, expenses),
    by_period: financesByPeriod(revenue, payouts, expenses, granularity, { from: fromTs, to: toTs }),
  });
});
