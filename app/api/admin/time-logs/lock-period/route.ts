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
import { snapshotPeriod, type SnapshotEntry } from '@/lib/hours/period-snapshot';

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

  // ── WHAT THE PERIOD HELD WHEN IT WAS CLOSED ───────────────────────────────────────────────────
  //
  // A closed period keeps moving: admins are exempt from locks by design, hours get adjusted, pay
  // decisions get revised, and the office can add whole days on somebody's behalf. Re-totalling the
  // week later answers "what does it hold now" — and there is no way to recover what it held when a
  // person decided it was finished, which is the figure a payment was made against.
  //
  // Taken here, at the instant of the close, because that is the only moment it is available.
  let snapshot: Record<string, number> = {};
  try {
    const { data: entries } = await supabaseAdmin
      .from('daily_time_logs')
      .select('id, user_email, hours, adjusted_hours, status, total_pay')
      .gte('log_date', period_start)
      .lte('log_date', period_end);

    const rows = (entries ?? []) as Array<{ id: string } & SnapshotEntry>;
    // Pay decisions outrank the rules' figure — the same COALESCE the `time_log_pay` view applies.
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const { data: decisions } = await supabaseAdmin
        .from('time_log_pay_decisions')
        .select('time_log_id, total_pay')
        .in('time_log_id', ids);
      const byLog = new Map(
        ((decisions ?? []) as Array<{ time_log_id: string; total_pay: number | null }>)
          .map((d) => [d.time_log_id, d]),
      );
      for (const r of rows) {
        const d = byLog.get(r.id);
        if (d) r.pay_decision = { total_pay: d.total_pay };
      }
    }
    snapshot = snapshotPeriod(rows) as unknown as Record<string, number>;
  } catch (err) {
    // Best-effort. A snapshot that cannot be taken must not stop the period being locked — the lock
    // is the thing with teeth, and refusing it over a reporting figure would be the wrong trade.
    // The columns stay NULL, which reads as "closed before this was recorded" and never as a zero.
    console.error('[lock-period] could not snapshot the period:', err instanceof Error ? err.message : String(err));
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
        ...snapshot,
      },
      { onConflict: 'period_start,period_end' },
    )
    .select()
    .single();

  if (error) {
    // Seed 587 adds the snapshot columns. If a deploy runs ahead of the seed, the lock itself is far
    // too important to lose over four reporting columns — so retry without them.
    if (/closed_(hours|pay_cents|entry_count|people)/i.test(error.message)) {
      const { data: retry, error: retryErr } = await supabaseAdmin
        .from('pay_period_locks')
        .upsert(
          {
            period_start, period_end,
            locked_by: session.user.email,
            locked_at: new Date().toISOString(),
            note: note ?? null,
          },
          { onConflict: 'period_start,period_end' },
        )
        .select()
        .single();
      if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
      return NextResponse.json({ lock: retry, snapshotUnavailable: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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
