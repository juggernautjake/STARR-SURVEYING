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

// ── READING A LOCK IS NOT AN ADMIN ACTION ────────────────────────────────────────────────────────
//
// This GET was admin-only, and the effect was that the people a lock actually CONSTRAINS could not
// ask about it. An employee whose week had been locked saw the ordinary "Log Hours" form, filled in
// a day, pressed submit, and got a 423 — the first they knew of it was a failed save, after typing.
//
// A locked period is a fact about the calendar, not a secret: the employee is the party subject to
// it, and telling them before they type is the entire point. Writing a lock stays admin-only below.
//
// `note` is withheld from non-admins. It is free text an admin wrote for other admins ("holding this
// until the Henderson invoice clears") and is the one field here that could carry something not
// meant for the person being locked out.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const locks = await locksOverlapping(from, to);
  if (isAdmin(session.user.roles)) return NextResponse.json({ locks });

  // `locked_by` is kept: "ask Michael" is more use to somebody than "this is locked".
  return NextResponse.json({
    locks: locks.map(({ note: _note, ...rest }) => rest),
  });
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
