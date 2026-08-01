// app/api/admin/ar-aging/route.ts — who owes money, and for how long (audit §3, Phase 2 item 11).
//
// §3: *"No AR / collections view. Invoices exist; 'who owes me money and for how long' (aging report)
// does not appear in the finance code."*
//
// GET → { rows, totals } from the `ar_aging` view (seed 523), bucketed from the DUE date.
import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus' | 'no_terms';

export interface AgingRow {
  id: string;
  invoice_number: string;
  job_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  issued_at: string | null;
  due_at: string | null;
  status: string;
  days_overdue: number | null;
  bucket: AgingBucket;
}

/** Order matters: an accountant reads left to right, worst on the right. */
export const BUCKETS: AgingBucket[] = ['current', '1_30', '31_60', '61_90', '90_plus', 'no_terms'];

export const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': '90+ days',
  // Not a bucket so much as a warning: an invoice with no due date can never be overdue, so it will
  // never appear in a collections list and never be chased. Surfaced rather than hidden among
  // "current", which is where it would otherwise sit forever.
  no_terms: 'No due date set',
};

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('ar_aging')
    .select('id, invoice_number, job_id, customer_name, customer_email, total_cents, paid_cents, balance_cents, issued_at, due_at, status, days_overdue, bucket')
    .order('days_overdue', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: `Could not read receivables: ${error.message}` }, { status: 500 });

  const rows = (data ?? []) as AgingRow[];
  const totals: Record<AgingBucket, { count: number; cents: number }> = {
    current: { count: 0, cents: 0 }, '1_30': { count: 0, cents: 0 }, '31_60': { count: 0, cents: 0 },
    '61_90': { count: 0, cents: 0 }, '90_plus': { count: 0, cents: 0 }, no_terms: { count: 0, cents: 0 },
  };
  for (const r of rows) {
    const b = totals[r.bucket] ?? totals.no_terms;
    b.count++;
    b.cents += r.balance_cents;
  }

  const outstandingCents = rows.reduce((a, r) => a + r.balance_cents, 0);
  // Everything past due, which is the number somebody actually acts on — "outstanding" includes
  // invoices that are simply not due yet and reads as a crisis when it is not.
  const overdueCents = rows.filter((r) => (r.days_overdue ?? 0) > 0).reduce((a, r) => a + r.balance_cents, 0);

  return NextResponse.json(
    { rows, totals, outstandingCents, overdueCents, buckets: BUCKETS, labels: BUCKET_LABEL },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
