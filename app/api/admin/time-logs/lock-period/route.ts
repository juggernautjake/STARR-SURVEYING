// app/api/admin/time-logs/lock-period/route.ts
//
// Admin pay-period locking (slice H6 of the hours-correction plan).
//   GET    ?from=&to=                     → locks overlapping the range
//   POST   { period_start, period_end }   → lock a period (upsert)
//   DELETE ?period_start=&period_end=     → unlock a period
//
// A locked period freezes employee edits/deletes for its dates; the
// enforcement lives in the time-logs route via lib/hours/period-lock.ts.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { locksOverlapping } from '@/lib/hours/period-lock';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const locks = await locksOverlapping(from, to);
  return NextResponse.json({ locks });
}, { routeName: 'time-logs/lock-period/GET' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { period_start, period_end, note } = body as {
    period_start?: string;
    period_end?: string;
    note?: string;
  };
  if (!period_start || !period_end) {
    return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 });
  }
  if (period_end < period_start) {
    return NextResponse.json({ error: 'period_end must be on or after period_start' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('pay_period_locks')
    .upsert(
      {
        period_start,
        period_end,
        locked_by: session.user.email,
        locked_at: new Date().toISOString(),
        note: note ?? null,
      },
      { onConflict: 'period_start,period_end' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lock: data });
}, { routeName: 'time-logs/lock-period/POST' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const ps = searchParams.get('period_start');
  const pe = searchParams.get('period_end');
  if (!ps || !pe) return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('pay_period_locks')
    .delete()
    .eq('period_start', ps)
    .eq('period_end', pe);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'time-logs/lock-period/DELETE' });
