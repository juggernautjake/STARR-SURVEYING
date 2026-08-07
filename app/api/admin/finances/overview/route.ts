// app/api/admin/finances/overview/route.ts
//
// G2 / Phase 2.2b of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — the unified
// "money in vs money out" (P&L / cash-flow) endpoint.
//
//   GET /api/admin/finances/overview?from=YYYY-MM-DD&to=YYYY-MM-DD[&granularity=day|week|month|year]
//
// FOUR streams (cash-flow truth — money that actually moved):
//   revenue  = payments.status='succeeded'           (cleared_at)
//   payouts  = payout_batch_items.status='paid'       (paid_at)
//   expenses = receipts.status in (approved,exported) (transaction_at), not deleted
//   ad spend = ad_spend_daily                         (spend_date)      ← added 2026-08-07
//
// The math lives in lib/payments/finance-overview.ts (pure, unit-tested); this
// route just maps rows → MoneyEvent[] and returns the summary + per-period rows.
//
// ── WHY ADVERTISING IS ITS OWN STREAM ──────────────────────────────────────────────────────────
//
// It was absent entirely until 2026-08-07, so the P&L excluded what is plausibly the largest
// controllable expense in the business. Folding it into `expenses` would have been the one-line fix
// and would have defeated the owner's actual request — "ad spend control" needs the number visible on
// its own, not blended into fuel and equipment receipts.
//
// ── TWO THINGS THIS RESPONSE SAYS ABOUT ITS OWN NUMBERS ────────────────────────────────────────
//
//   `manual_share`         — what fraction was typed off an invoice rather than imported from the API.
//                            An estimate presented with the authority of a measurement is worse than
//                            no number, because it gets acted on with confidence.
//   `suspected_duplicates` — receipts that look like the Google Ads card charge. Advertising can reach
//                            the books twice (API import + photographed receipt) and both numbers are
//                            individually correct. Surfaced, never silently dropped.

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
import { microsToCents } from '@/lib/integrations/google-ads/spend';
import { looksLikeAdVendor, type ReceiptLike } from '@/lib/finances/ad-spend-reconcile';
import { findDuplicateExpenses, duplicateRiskTotal } from '@/lib/finances/duplicate-expenses';

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

  const [payRes, payoutRes, recRes, adRes] = await Promise.all([
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
      // `id` and `vendor_name` are for the duplicate check below, not the totals.
      .select('id, vendor_name, total_cents, transaction_at')
      .in('status', ['approved', 'exported'])
      .is('deleted_at', null)
      .gte('transaction_at', fromTs)
      .lte('transaction_at', toTs),
    // `spend_date` is a DATE, not a timestamp, so it is compared against bare YYYY-MM-DD. Handing it
    // the `T00:00:00Z` strings used above would exclude the first day of every range.
    supabaseAdmin
      .from('ad_spend_daily')
      .select('spend_date, cost_micros, source, platform')
      .gte('spend_date', from)
      .lte('spend_date', to),
  ]);

  const firstError = payRes.error || payoutRes.error || recRes.error || adRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const payRows = (payRes.data ?? []) as Array<{ amount_cents: number | null; cleared_at: string | null }>;
  const payoutRows = (payoutRes.data ?? []) as Array<{ total_cents: number | null; paid_at: string | null }>;
  const recRows = (recRes.data ?? []) as Array<{
    id: string; vendor_name: string | null; total_cents: number | null; transaction_at: string | null;
  }>;
  const adRows = (adRes.data ?? []) as Array<{
    spend_date: string | null; cost_micros: number | string | null; source: string | null; platform: string | null;
  }>;

  const revenue: MoneyEvent[] = payRows
    .filter((r) => Boolean(r.cleared_at))
    .map((r) => ({ amount_cents: r.amount_cents ?? 0, at: r.cleared_at as string }));
  const payouts: MoneyEvent[] = payoutRows
    .filter((r) => Boolean(r.paid_at))
    .map((r) => ({ amount_cents: r.total_cents ?? 0, at: r.paid_at as string }));
  const expenses: MoneyEvent[] = recRows
    .filter((r) => Boolean(r.transaction_at))
    .map((r) => ({ amount_cents: r.total_cents ?? 0, at: r.transaction_at as string }));

  // `cost_micros` arrives as an int64, which PostgREST hands back as a string past 2^53. Number() it
  // before the micros→cents floor rather than after, so a large month cannot become NaN mid-sum.
  const adSpend: MoneyEvent[] = adRows
    .filter((r) => Boolean(r.spend_date))
    .map((r) => ({
      amount_cents: microsToCents(Number(r.cost_micros ?? 0)),
      // Midday UTC, not midnight. A date bucketed at 00:00:00Z lands in the previous day for anyone
      // west of Greenwich, which for a Texas business means every month's spend starts a day early.
      at: `${r.spend_date as string}T12:00:00Z`,
    }));

  // What share was typed off an invoice rather than imported. Reported so the UI can say so.
  const adTotalMicros = adRows.reduce((s, r) => s + Math.max(0, Number(r.cost_micros ?? 0)), 0);
  const manualMicros = adRows
    .filter((r) => r.source !== 'api')
    .reduce((s, r) => s + Math.max(0, Number(r.cost_micros ?? 0)), 0);
  const manualShare = adTotalMicros > 0 ? manualMicros / adTotalMicros : 0;

  const receiptsForCheck: ReceiptLike[] = recRows
    .filter((r) => Boolean(r.transaction_at))
    .map((r) => ({
      id: r.id,
      vendor_name: r.vendor_name,
      total_cents: r.total_cents ?? 0,
      transaction_at: r.transaction_at as string,
    }));
  const adSpendCents = microsToCents(adTotalMicros);
  // The GENERAL detector, the same one the nightly alert uses (`lib/ai/proactive.ts`). It was the
  // advertising-only guard until 2026-08-07, which meant the page and the notification could disagree
  // about what a duplicate is — and the commonest duplicate in this business has nothing to do with
  // ads, it is the same fuel receipt photographed twice.
  //
  // The page shows BOTH confidences; the alert pushes only the high ones. Something you look at
  // deliberately can afford a maybe. Something that arrives on a phone at 7am cannot.
  const duplicates = findDuplicateExpenses(receiptsForCheck, {
    adSpendCents,
    isAdVendor: looksLikeAdVendor,
  });

  return NextResponse.json({
    from,
    to,
    granularity,
    summary: summarizeFinances(revenue, payouts, expenses, adSpend),
    by_period: financesByPeriod(revenue, payouts, expenses, adSpend, granularity, {
      from: fromTs,
      to: toTs,
    }),
    ad_spend: {
      cents: adSpendCents,
      manual_share: manualShare,
      platforms: [...new Set(adRows.map((r) => r.platform).filter(Boolean))],
      suspected_duplicates: duplicates,
      suspected_duplicate_cents: duplicateRiskTotal(duplicates),
    },
  });
});
