// lib/payroll/owed-loader.ts
//
// LOADING WHAT EVERYONE IS OWED, ONCE
// ═══════════════════════════════════
//
// `owed.ts` is the arithmetic. This is the read that feeds it — extracted the moment a second
// caller appeared, rather than after.
//
// The reason is the whole theme of this codebase: the pay formula reached FOUR independent
// implementations before anybody noticed, and "what is this person owed" is exactly the kind of
// question that grows a second, slightly-different answer. The balance shown on the approval queue
// and the balance a payout batch is built from must be the same number, or the firm pays an amount
// nobody was shown.

import { supabaseAdmin } from '@/lib/supabase';
import { computeOwed, type ApprovedEntry, type OwedSummary } from './owed';
import { readPayouts, isCommittedPayout, isSettledPayout } from './payout-ledger';

export interface OwedRow extends OwedSummary {
  user_email: string;
  user_name: string | null;
}

export interface LoadOwedResult {
  rows: OwedRow[];
  /** Named rather than thrown: the caller decides whether a partial answer is usable. */
  error: string | null;
}

interface LogRow {
  id: string;
  user_email: string;
  log_date: string;
  hours: number;
  adjusted_hours: number | null;
  total_pay: number | null;
}

/**
 * What every person (or one person) is owed right now.
 *
 * Approved hours only — pending hours are proposed, not owed. Errors are RETURNED rather than
 * swallowed: a balance built without the pay decisions, or without the payout ledger, is a wrong
 * number presented as a right one, and it is the number somebody gets paid.
 */
export async function loadOwed(scopeToEmail?: string | null): Promise<LoadOwedResult> {
  let logQuery = supabaseAdmin
    .from('daily_time_logs')
    .select('id, user_email, log_date, hours, adjusted_hours, total_pay')
    .eq('status', 'approved')
    .order('log_date');
  if (scopeToEmail) logQuery = logQuery.eq('user_email', scopeToEmail);

  const { data: logRows, error: logError } = await logQuery;
  if (logError) return { rows: [], error: logError.message };
  const logs = (logRows ?? []) as LogRow[];

  // The approver's decisions OUTRANK the figure resolved at submission. A balance built from the
  // pre-decision amounts would owe people numbers that were explicitly overridden.
  const decisionByLog = new Map<string, { total_pay: number; undecided_hours: number }>();
  if (logs.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('time_log_pay_decisions')
      .select('time_log_id, total_pay, undecided_hours')
      .in('time_log_id', logs.map((l) => l.id));
    if (error) return { rows: [], error: `pay decisions could not be read: ${error.message}` };
    for (const d of (data ?? []) as { time_log_id: string; total_pay: number; undecided_hours: number }[]) {
      decisionByLog.set(d.time_log_id, d);
    }
  }

  const { payouts, error: payoutError, truncated } = await readPayouts({
    userEmail: scopeToEmail ?? undefined,
    limit: 5000,
  });
  if (payoutError) return { rows: [], error: `the payout ledger could not be read: ${payoutError}` };
  // ── A PARTIAL LEDGER IS NOT A BALANCE ────────────────────────────────────────────────────────
  //
  // `owed` is approved earnings MINUS everything already paid. Reading only part of the payout side
  // makes every balance too high — by exactly the payments that fell outside the page — and the
  // next batch built from those balances pays hours that were already paid.
  //
  // Refused rather than returned partial, matching what the batch builder does with a bad read:
  // *"Building a batch from a balance we could not fully read pays wrong amounts, and a payout is
  // much harder to take back than to not make."*
  if (truncated) {
    return {
      rows: [],
      error: 'the payout ledger is larger than one page, so balances could not be computed safely — '
        + 'raise the read limit before paying anybody from this figure',
    };
  }

  const byPerson = new Map<
    string,
    { entries: ApprovedEntry[]; paidCents: number[]; settledCents: number; lastPayoutAt: string | null }
  >();
  const bucket = (who: string) => {
    const existing = byPerson.get(who);
    if (existing) return existing;
    const fresh = {
      entries: [] as ApprovedEntry[],
      paidCents: [] as number[],
      settledCents: 0,
      lastPayoutAt: null as string | null,
    };
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

    // Settled is narrower than committed: a DRAFT batch commits the money — paying those hours
    // again would be a double payment — but nothing has reached the person yet.
    if (isSettledPayout(payout)) {
      b.settledCents += cents;
      if (payout.paid_at && (!b.lastPayoutAt || payout.paid_at > b.lastPayoutAt)) b.lastPayoutAt = payout.paid_at;
    }
  }

  const { data: nameRows } = await supabaseAdmin.from('employee_profiles').select('user_email, user_name');
  const nameByEmail = new Map(
    ((nameRows ?? []) as { user_email: string; user_name: string | null }[]).map((r) => [r.user_email, r.user_name]),
  );

  const rows: OwedRow[] = [...byPerson.entries()].map(([user_email, data]) => ({
    user_email,
    user_name: nameByEmail.get(user_email) ?? null,
    ...computeOwed({
      approved: data.entries,
      paidCents: data.paidCents,
      settledCents: data.settledCents,
      lastPayoutAt: data.lastPayoutAt,
    }),
  }));

  // Biggest balance first — the order somebody paying people works in.
  rows.sort((a, b) => b.owedCents - a.owedCents);
  return { rows, error: null };
}
