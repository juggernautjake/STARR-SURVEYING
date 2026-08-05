// app/api/admin/payroll/owed/route.ts
//
// WHAT EACH PERSON IS OWED RIGHT NOW
// ══════════════════════════════════
//
// *"This will all be calculated to show how much is owed since the last payout to that employee."*
//
//   GET                  — every employee with a balance (admin only)
//   GET ?email=<email>   — one person; an employee may ask about themselves
//
// The arithmetic is `lib/payroll/owed.ts` and is a **running balance**, not a date window: every
// approved hour minus every payout. A window loses late-logged entries — somebody who forgets
// Thursday and logs it next week produces a row dated before a payout that already went out, and a
// date filter drops it silently. See that file for the full reasoning.
//
// Approved hours only. Pending hours are not owed; they are proposed.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { computeOwed, type ApprovedEntry, type OwedSummary } from '@/lib/payroll/owed';
import { readPayouts, isCommittedPayout, isSettledPayout } from '@/lib/payroll/payout-ledger';

interface LogRow {
  id: string;
  user_email: string;
  log_date: string;
  hours: number;
  adjusted_hours: number | null;
  total_pay: number | null;
}

interface DecisionRow {
  time_log_id: string;
  total_pay: number;
  undecided_hours: number;
}

export interface OwedRow extends OwedSummary {
  user_email: string;
  user_name: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = new URL(req.url).searchParams.get('email');
  const admin = isAdmin(session.user.roles);

  // A person may always ask what they are owed. Anyone else's balance is an admin question.
  if (!admin && email && email.toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeTo = admin ? email : session.user.email;

  let logQuery = supabaseAdmin
    .from('daily_time_logs')
    .select('id, user_email, log_date, hours, adjusted_hours, total_pay')
    .eq('status', 'approved')
    .order('log_date');
  if (scopeTo) logQuery = logQuery.eq('user_email', scopeTo);

  const { data: logRows, error: logError } = await logQuery;
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });
  const logs = (logRows ?? []) as LogRow[];

  // The approver's decisions, where they exist. These OUTRANK the resolved figure on the log — a
  // balance built from the pre-decision amounts would owe people numbers that were overridden.
  let decisions: DecisionRow[] = [];
  if (logs.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('time_log_pay_decisions')
      .select('time_log_id, total_pay, undecided_hours')
      .in('time_log_id', logs.map((l) => l.id));
    // Refused, not skipped. A balance that silently ignores decisions is a wrong number presented
    // as a right one, and it is the number somebody gets paid.
    if (error) {
      return NextResponse.json(
        { error: `Could not read pay decisions, so no balance was calculated: ${error.message}` },
        { status: 500 },
      );
    }
    decisions = (data ?? []) as DecisionRow[];
  }
  const decisionByLog = new Map(decisions.map((d) => [d.time_log_id, d]));

  const { payouts, error: payoutError } = await readPayouts({
    userEmail: scopeTo ?? undefined,
    limit: 5000,
  });
  if (payoutError) {
    return NextResponse.json(
      { error: `Could not read the payout ledger, so no balance was calculated: ${payoutError}` },
      { status: 500 },
    );
  }

  // Group both sides by person.
  const byPerson = new Map<
    string,
    { entries: ApprovedEntry[]; paidCents: number[]; settledCents: number; lastPayoutAt: string | null }
  >();
  const bucket = (who: string) => {
    const existing = byPerson.get(who);
    if (existing) return existing;
    const fresh = { entries: [] as ApprovedEntry[], paidCents: [] as number[], settledCents: 0, lastPayoutAt: null as string | null };
    byPerson.set(who, fresh);
    return fresh;
  };

  for (const log of logs) {
    const decision = decisionByLog.get(log.id);
    bucket(log.user_email).entries.push({
      id: log.id,
      logDate: log.log_date,
      hours: log.adjusted_hours != null ? Number(log.adjusted_hours) : Number(log.hours),
      payDollars: decision ? Number(decision.total_pay) : (log.total_pay === null ? null : Number(log.total_pay)),
      undecidedHours: decision ? Number(decision.undecided_hours) : 0,
    });
  }

  for (const payout of payouts) {
    // A voided batch is money that never left; a failed item is a payment the bank rejected.
    // Neither is committed, and counting either would permanently under-owe somebody.
    if (!isCommittedPayout(payout)) continue;

    const b = bucket(payout.user_email);
    const cents = Number(payout.amount_cents) || 0;
    b.paidCents.push(cents);

    // Settled is narrower than committed. A DRAFT batch commits the money — paying those hours
    // again would be a double payment — but nothing has reached the person yet, and telling them
    // they are paid up would be false.
    if (isSettledPayout(payout)) {
      b.settledCents += cents;
      // Latest `paid_at` wins. A pending payout has none and must not become the "last payout"
      // date — it would tell somebody they were paid on a day nothing left the bank.
      if (payout.paid_at && (!b.lastPayoutAt || payout.paid_at > b.lastPayoutAt)) b.lastPayoutAt = payout.paid_at;
    }
  }

  const { data: nameRows } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, user_name');
  const nameByEmail = new Map(
    ((nameRows ?? []) as { user_email: string; user_name: string | null }[]).map((r) => [r.user_email, r.user_name]),
  );

  const rows: OwedRow[] = [...byPerson.entries()].map(([user_email, data]) => ({
    user_email,
    user_name: nameByEmail.get(user_email) ?? null,
    ...computeOwed({ approved: data.entries, paidCents: data.paidCents, settledCents: data.settledCents, lastPayoutAt: data.lastPayoutAt }),
  }));

  // Biggest balance first — that is the order somebody paying people works in.
  rows.sort((a, b) => b.owedCents - a.owedCents);

  return NextResponse.json({
    owed: rows,
    totalOwedCents: rows.reduce((sum, r) => sum + Math.max(0, r.owedCents), 0),
    // Counted separately: an overpayment is not a negative debt to net off against what other
    // people are owed. Netting them would make a firm-wide total that pays nobody correctly.
    overpaid: rows.filter((r) => r.owedCents < 0).map((r) => ({ user_email: r.user_email, byCents: -r.owedCents })),
  });
}, { routeName: 'payroll/owed' });
