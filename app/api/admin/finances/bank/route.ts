// app/api/admin/finances/bank/route.ts
//
// G3 / Phase 2.3b — bank reconciliation list + import.
//
//   GET  /api/admin/finances/bank   → unmatched bank_transactions + suggested
//                                     matches (payouts / expenses / payments)
//   POST /api/admin/finances/bank   → import a PNC CSV ({ csv }); parse + dedupe-insert
//
// The parsing + matching math is pure (lib/payments/bank-reconcile.ts); this
// route does the DB I/O + candidate fetch.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  parsePncCsv,
  importFingerprint,
  bestMatches,
  type ReconCandidate,
} from '@/lib/payments/bank-reconcile';

function shiftIso(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: txnData, error } = await supabaseAdmin
    .from('bank_transactions')
    .select('id, posted_at, amount_cents, direction, description, status')
    .eq('status', 'unmatched')
    .order('posted_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const txns = (txnData ?? []) as Array<{
    id: string; posted_at: string; amount_cents: number; direction: string; description: string | null; status: string;
  }>;
  if (txns.length === 0) return NextResponse.json({ transactions: [] });

  const sortedDates = txns.map((t) => t.posted_at).sort();
  const lo = shiftIso(sortedDates[0], -7);
  const hi = shiftIso(sortedDates[sortedDates.length - 1], 7);

  const [payouts, expenses, payments] = await Promise.all([
    supabaseAdmin
      .from('payout_batch_items')
      .select('id, total_cents, paid_at, user_name, user_email')
      .eq('status', 'paid')
      .gte('paid_at', lo)
      .lte('paid_at', hi),
    supabaseAdmin
      .from('receipts')
      .select('id, total_cents, transaction_at, vendor_name')
      .in('status', ['approved', 'exported'])
      .is('deleted_at', null)
      .gte('transaction_at', lo)
      .lte('transaction_at', hi),
    supabaseAdmin
      .from('payments')
      .select('id, amount_cents, cleared_at, payer_email')
      .eq('status', 'succeeded')
      .gte('cleared_at', lo)
      .lte('cleared_at', hi),
  ]);

  const candidates: ReconCandidate[] = [
    ...((payouts.data ?? []) as Array<{ id: string; total_cents: number | null; paid_at: string | null; user_name: string | null; user_email: string | null }>)
      .filter((r) => r.paid_at)
      .map((r) => ({ kind: 'payout' as const, id: r.id, amount_cents: r.total_cents ?? 0, at: r.paid_at as string, label: r.user_name ?? r.user_email ?? 'Payout' })),
    ...((expenses.data ?? []) as Array<{ id: string; total_cents: number | null; transaction_at: string | null; vendor_name: string | null }>)
      .filter((r) => r.transaction_at)
      .map((r) => ({ kind: 'expense' as const, id: r.id, amount_cents: r.total_cents ?? 0, at: r.transaction_at as string, label: r.vendor_name ?? 'Receipt' })),
    ...((payments.data ?? []) as Array<{ id: string; amount_cents: number | null; cleared_at: string | null; payer_email: string | null }>)
      .filter((r) => r.cleared_at)
      .map((r) => ({ kind: 'payment' as const, id: r.id, amount_cents: r.amount_cents ?? 0, at: r.cleared_at as string, label: r.payer_email ?? 'Customer payment' })),
  ];

  const transactions = txns.map((t) => ({
    ...t,
    suggestions: bestMatches(
      { posted_at: t.posted_at, amount_cents: t.amount_cents, description: t.description ?? '' },
      candidates,
    ).slice(0, 3),
  }));

  return NextResponse.json({ transactions });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { csv?: unknown };
  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv.trim()) return NextResponse.json({ error: 'No CSV provided.' }, { status: 400 });

  const rows = parsePncCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No transactions found — check the CSV has Date + Amount columns.' }, { status: 422 });
  }

  // Build insert rows + fingerprints; dedupe within the batch.
  const seenInBatch = new Set<string>();
  const toInsert = rows
    .map((r) => ({
      posted_at: r.posted_at,
      amount_cents: r.amount_cents,
      direction: r.amount_cents < 0 ? 'debit' : 'credit',
      description: r.description,
      source: 'pnc_csv',
      status: 'unmatched',
      import_fingerprint: importFingerprint(r),
    }))
    .filter((r) => (seenInBatch.has(r.import_fingerprint) ? false : (seenInBatch.add(r.import_fingerprint), true)));

  // Skip rows already in the DB (fingerprint match).
  const { data: existing } = await supabaseAdmin
    .from('bank_transactions')
    .select('import_fingerprint')
    .in('import_fingerprint', toInsert.map((r) => r.import_fingerprint));
  const known = new Set(((existing ?? []) as Array<{ import_fingerprint: string | null }>).map((e) => e.import_fingerprint));
  const fresh = toInsert.filter((r) => !known.has(r.import_fingerprint));

  let imported = 0;
  if (fresh.length > 0) {
    const { data, error } = await supabaseAdmin.from('bank_transactions').insert(fresh).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    imported = data?.length ?? 0;
  }

  return NextResponse.json({ parsed: rows.length, imported, skipped: rows.length - imported });
});
