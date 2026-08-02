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

// The row shape, the bucket order and the labels live in lib/finance/ar-aging.ts. A route file may
// export ONLY its handlers and a fixed set of config keys — anything else fails the production build
// with "Property 'BUCKETS' is incompatible with index signature", which is what `npm run build` said
// about this file. tsc never sees it: the constraint is Next's, applied to generated route types.
import { BUCKETS, BUCKET_LABEL, type AgingBucket, type AgingRow } from '@/lib/finance/ar-aging';

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
