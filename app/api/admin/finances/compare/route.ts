// app/api/admin/finances/compare/route.ts
//
//   GET /api/admin/finances/compare?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Owner ask, 2026-08-07: *"exactly how much we are spending month to month"* — which is a comparison,
// not a total. $840 of advertising in July is alarming or excellent depending entirely on June, and a
// page that shows only the total makes the reader do the arithmetic from memory.
//
// Returns the requested window against the one immediately before it, all four money streams plus
// leads, won jobs, and the two per-unit costs. ONE payload on purpose: cost per job is money divided
// by marketing, and splitting them across two endpoints is how two screens end up disagreeing.
//
// ── THE COMPARISON WINDOW IS CALENDAR-AWARE ─────────────────────────────────────────────────────
//
// A whole month compares against the whole previous month, not "the 31 days before". Otherwise
// February always looks like a collapse and a 31-day month always looks like growth — an artefact of
// the calendar presented as a trend. `previousWindow` handles it; see its tests.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { microsToCents } from '@/lib/integrations/google-ads/spend';
import { disbursedCents } from '@/lib/payroll/disbursement';
import {
  comparePeriods,
  previousWindow,
  type PeriodTotals,
} from '@/lib/finances/compare-periods';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything one window needs, in one round of queries. */
async function totalsFor(from: string, to: string): Promise<PeriodTotals> {
  const fromTs = `${from}T00:00:00Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const [payRes, payoutRes, recRes, adRes, leadRes, jobRes] = await Promise.all([
    supabaseAdmin.from('payments').select('amount_cents')
      .eq('status', 'succeeded').gte('cleared_at', fromTs).lte('cleared_at', toTs),
    // `recovered_cents` too: what left the bank is total − recovered. Counting the settled figure
    // overstates payouts for any month containing an advance repayment, and understates `net_cents`
    // by the same amount — in the month-to-month comparison the owner reads.
    supabaseAdmin.from('payout_batch_items').select('total_cents, recovered_cents')
      .eq('status', 'paid').gte('paid_at', fromTs).lte('paid_at', toTs),
    supabaseAdmin.from('receipts').select('total_cents')
      .in('status', ['approved', 'exported']).is('deleted_at', null)
      .gte('transaction_at', fromTs).lte('transaction_at', toTs),
    // `spend_date` is a DATE — compared against bare YYYY-MM-DD, or the first day of every range is lost.
    supabaseAdmin.from('ad_spend_daily').select('cost_micros')
      .gte('spend_date', from).lte('spend_date', to),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true })
      .gte('created_at', fromTs).lte('created_at', toTs),
    supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).gte('created_at', fromTs).lte('created_at', toTs),
  ]);

  const sum = (rows: unknown, field: string): number =>
    ((rows ?? []) as Array<Record<string, number | null>>)
      .reduce((s, r) => s + Math.max(0, Math.round(Number(r[field] ?? 0))), 0);

  const revenue_cents = sum(payRes.data, 'amount_cents');
  const payouts_cents = ((payoutRes.data ?? []) as Array<{ total_cents: number | null; recovered_cents: number | null }>)
    .reduce((s, r) => s + disbursedCents(r), 0);
  const expenses_cents = sum(recRes.data, 'total_cents');
  // Micros → cents at the one documented boundary, on the TOTAL rather than per row: flooring each row
  // separately loses up to a cent per day, which across a year is a visible drift against the invoice.
  const adMicros = ((adRes.data ?? []) as Array<{ cost_micros: number | string | null }>)
    .reduce((s, r) => s + Math.max(0, Number(r.cost_micros ?? 0)), 0);
  const ad_spend_cents = microsToCents(adMicros);

  return {
    revenue_cents,
    payouts_cents,
    expenses_cents,
    ad_spend_cents,
    net_cents: revenue_cents - payouts_cents - expenses_cents - ad_spend_cents,
    leads: leadRes.count ?? 0,
    jobs_won: jobRes.count ?? 0,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: 'from + to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to.' }, { status: 400 });
  }

  const prev = previousWindow(from, to);
  const [current, previous] = await Promise.all([totalsFor(from, to), totalsFor(prev.from, prev.to)]);

  return NextResponse.json({
    current_window: { from, to },
    previous_window: prev,
    current,
    previous,
    comparison: comparePeriods(current, previous),
  });
}, { routeName: 'admin/finances/compare#get' });
