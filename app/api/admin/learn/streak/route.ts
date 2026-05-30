// app/api/admin/learn/streak/route.ts
//
// hub-widget-excellence-13 — minimal streak endpoint backing the
// streak-counter hub widget (which fetched this previously-missing route
// + always rendered empty). Computes the caller's current + longest
// consecutive-day streak from their activity dates, per `?kind=`:
//   study   → lesson completions (user_progress)
//   quiz    → quiz attempts (quiz_attempts)
//   clockin → logged days (daily_time_logs)
//
// GET /api/admin/learn/streak?kind=study|quiz|clockin
//   → { current_days, longest_days }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { computeStreak } from '@/lib/learn/streak';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const kind = req.nextUrl.searchParams.get('kind') ?? 'study';

  let dates: string[] = [];
  if (kind === 'clockin') {
    const { data } = await supabaseAdmin
      .from('daily_time_logs').select('log_date').eq('user_email', email).limit(2000);
    dates = ((data ?? []) as Array<{ log_date: string | null }>).map((r) => r.log_date ?? '').filter(Boolean);
  } else if (kind === 'quiz') {
    const { data } = await supabaseAdmin
      .from('quiz_attempts').select('completed_at, created_at').eq('user_email', email).limit(2000);
    dates = ((data ?? []) as Array<{ completed_at: string | null; created_at: string | null }>)
      .map((r) => r.completed_at ?? r.created_at ?? '').filter(Boolean);
  } else {
    const { data } = await supabaseAdmin
      .from('user_progress').select('created_at').eq('user_email', email).limit(2000);
    dates = ((data ?? []) as Array<{ created_at: string | null }>).map((r) => r.created_at ?? '').filter(Boolean);
  }

  return NextResponse.json(computeStreak(dates));
}, { routeName: 'admin/learn/streak' });
