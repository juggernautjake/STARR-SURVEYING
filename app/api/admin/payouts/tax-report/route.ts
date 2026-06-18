// app/api/admin/payouts/tax-report/route.ts
//
// P16 of payment-infrastructure-2026-06-18.md — payout tax export.
//
//   GET  /api/admin/payouts/tax-report?from=YYYY-MM-DD&to=YYYY-MM-DD
//                                     [&format=json|csv]
//
// Pulls every `paid` payout_batch_items row in the date range
// (filter on `paid_at`), aggregates per employee, returns JSON for
// the on-page table OR CSV for download.
//
// Authoritative source: payout_batch_items.status = 'paid'. The
// audit truth — a row marked paid is one the office confirmed
// cleared (Venmo logged, ACH bounced check off, cash handed out).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  aggregateForTaxReport,
  buildTaxCsv,
  describeRange,
  totalsAcrossRows,
  type PaidItemForTax,
} from '@/lib/payouts/tax-report';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json({ error: 'from + to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to.' }, { status: 400 });
  }

  // paid_at is the audit-truth timestamp. Inclusive on both ends —
  // the office picks "2026-01-01 → 2026-12-31" and gets the whole
  // calendar year.
  const fromTs = `${from}T00:00:00Z`;
  const toTs = `${to}T23:59:59.999Z`;
  const { data, error } = await supabaseAdmin
    .from('payout_batch_items')
    .select('user_email, user_name, method, total_cents, paid_at')
    .eq('status', 'paid')
    .gte('paid_at', fromTs)
    .lte('paid_at', toTs)
    .order('paid_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []) as PaidItemForTax[];
  const rows = aggregateForTaxReport(items);
  const totals = totalsAcrossRows(rows);
  const rangeLabel = describeRange(from, to);

  if (format === 'csv') {
    const csv = buildTaxCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payouts_tax_${rangeLabel.replace(/[^A-Za-z0-9_-]/g, '_')}.csv"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  }

  return NextResponse.json({
    from,
    to,
    range_label: rangeLabel,
    employees: rows,
    totals,
  });
});
