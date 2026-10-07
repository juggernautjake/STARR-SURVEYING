// app/api/admin/receipts/spending — spending by kind of item, over any period.
//
// GET ?period=day|week|month|quarter|half|year&from=YYYY-MM-DD&to=YYYY-MM-DD[&category=meals][&user=email]
//
// Owner, 2026-10-07: "daily, weekly, monthly, quarterly, bi-yearly, and yearly analysis of and
// filtering by type of item that was purchased." The arithmetic is lib/receipts/spending.ts; this
// reads the receipts in range and their line items. Admin only, like the rest of the books.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { buildSpendReport, PERIODS, type Period, type SpendItem, type SpendReceipt } from '@/lib/receipts/spending';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const period = (PERIODS.some((p) => p.id === sp.get('period')) ? sp.get('period') : 'month') as Period;
  const to = DATE.test(sp.get('to') ?? '') ? sp.get('to')! : new Date().toISOString().slice(0, 10);
  const from = DATE.test(sp.get('from') ?? '') ? sp.get('from')! : new Date(Date.parse(`${to}T12:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const category = sp.get('category') || null;
  const user = sp.get('user') || null;

  // A day's edges in Central time: widen by a day either side and let the bucketing (which is in
  // Central time) decide; receipts outside the asked range are then dropped below.
  let q = supabaseAdmin.from('receipts')
    .select('id, transaction_at, total_cents, category, status, superseded_by_receipt_id, vendor_name, user_id')
    .is('deleted_at', null)
    .gte('transaction_at', `${from}T00:00:00-06:00`)
    .lte('transaction_at', `${to}T23:59:59-05:00`)
    .limit(10000);
  if (user) q = q.eq('user_id', user);
  const { data: receipts, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = ((receipts ?? []) as Array<{ id: string }>).map((r) => r.id);
  const items: SpendItem[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabaseAdmin.from('receipt_line_items')
      .select('receipt_id, description, amount_cents, category')
      .in('receipt_id', ids.slice(i, i + 300))
      .is('removed_at', null);
    items.push(...((data ?? []) as SpendItem[]));
  }

  const report = buildSpendReport((receipts ?? []) as SpendReceipt[], items, { period, category });
  return NextResponse.json({ range: { from, to }, category, ...report });
}, { routeName: 'admin/receipts/spending' });
