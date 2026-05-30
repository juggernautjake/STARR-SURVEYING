// app/api/admin/reports/route.ts
//
// hub-widget-excellence-11 — minimal reports endpoint backing the
// monthly-revenue hub widget (which fetched this previously-missing
// route + always rendered empty). Revenue = non-refund `job_payments`
// (money clients paid) summed for the current period-to-date vs the
// full previous period.
//
// GET /api/admin/reports?metric=monthly-revenue&period=month|quarter|year
//   → { revenue_mtd, revenue_last_month, goal, period }
//
// Admin only (financial data). Pure period math lives in
// lib/reports/revenue-periods.ts.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { periodWindows, sumRevenue, type RevenuePeriod } from '@/lib/reports/revenue-periods';

const PERIODS: ReadonlyArray<RevenuePeriod> = ['month', 'quarter', 'year'];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const metric = searchParams.get('metric') ?? 'monthly-revenue';
  if (metric !== 'monthly-revenue') {
    return NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 });
  }
  const periodParam = searchParams.get('period');
  const period: RevenuePeriod = PERIODS.includes(periodParam as RevenuePeriod)
    ? (periodParam as RevenuePeriod)
    : 'month';

  const { current, previous } = periodWindows(period, Date.now());

  const [curRes, prevRes] = await Promise.all([
    supabaseAdmin
      .from('job_payments')
      .select('amount, payment_type, paid_at')
      .gte('paid_at', current.from)
      .lt('paid_at', current.to),
    supabaseAdmin
      .from('job_payments')
      .select('amount, payment_type, paid_at')
      .gte('paid_at', previous.from)
      .lt('paid_at', previous.to),
  ]);
  if (curRes.error) return NextResponse.json({ error: curRes.error.message }, { status: 500 });
  if (prevRes.error) return NextResponse.json({ error: prevRes.error.message }, { status: 500 });

  return NextResponse.json({
    period,
    revenue_mtd: sumRevenue(curRes.data ?? []),
    revenue_last_month: sumRevenue(prevRes.data ?? []),
    goal: null,
  });
}, { routeName: 'admin/reports' });
