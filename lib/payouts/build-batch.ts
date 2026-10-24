// lib/payouts/build-batch.ts — turn what is owed into a payout batch: who, how much, how, and any fee.
//
// ONE builder for both ways a batch starts — the boss pressing "Pay what is owed"
// (app/api/admin/payroll/pay-owed) and the Friday schedule (app/api/cron/payout-prepare). They had
// drifted into two copies of the same logic; now the preview, the button and the schedule all produce
// identical lines (2026-10-11).
//
// Every line is resolved here, once, by lib/payouts/routing.ts: the method the firm will actually use
// for that person (their choice → the firm default → the firm fallback), its handle, and any fee. A line
// that cannot be paid stays in the batch with its reason, so the approver sees it; Commit holds it and
// pays everyone else.
//
// It does not move money. It writes a `draft` batch; Commit (lib/payouts/commit.ts) sends it.

import { supabaseAdmin } from '@/lib/supabase';
import { loadOwed, type OwedRow } from '@/lib/payroll/owed-loader';
import { planAdvanceRecovery, type OutstandingAdvance } from '@/lib/payroll/advance-recovery';
import { disbursedCents, totalRecoveredCents, totalFeeCents } from '@/lib/payroll/disbursement';
import { loadPolicy, loadPeople } from './server';
import { resolvePayout, type PayoutPolicy } from './routing';
import type { PayoutMethod } from './methods';
import type { Rail } from './rails';

/** Nobody is paid a fraction of a cent, and a zero line is not a payment. */
const MIN_PAYABLE_CENTS = 1;

export interface PlannedLine {
  user_email: string;
  user_name: string | null;
  /** What this line SETTLES — the full approved balance. See lib/payroll/disbursement.ts. */
  total_cents: number;
  recovered_cents: number;
  recoveries: Array<{ advanceId: string; amount: number }>;
  method: PayoutMethod | null;
  method_handle: string | null;
  fee_cents: number;
  fee_note: string | null;
  source: 'preferred' | 'default' | 'fallback' | 'none';
  rail: Rail;
  /** Blocking — this line will be held at Commit until fixed. */
  problems: string[];
  notes: string[];
}

export interface BatchPlan {
  lines: PlannedLine[];
  skipped: Array<{ user_email: string; reason: string }>;
  policy: PayoutPolicy;
  totalCents: number;
  disbursedCents: number;
  recoveredCents: number;
  feeCents: number;
  /** People whose line cannot be paid yet. */
  blocked: Array<{ user_email: string; problems: string[] }>;
}

async function loadAdvances(emails: string[]): Promise<Map<string, OutstandingAdvance[]>> {
  const out = new Map<string, OutstandingAdvance[]>();
  if (emails.length === 0) return out;
  // The VIEW: advances actually PAID OUT. Recovering an approved-but-unpaid advance takes back money
  // never handed over.
  const { data } = await supabaseAdmin
    .from('pay_advances_outstanding')
    .select('id, user_email, outstanding, repay_per_period, paid_at')
    .in('user_email', emails);
  for (const a of (data ?? []) as Array<OutstandingAdvance & { user_email: string }>) {
    const list = out.get(a.user_email) ?? [];
    list.push(a);
    out.set(a.user_email, list);
  }
  return out;
}

/** What a batch would contain right now. Reads only. */
export async function planOwedBatch(only: string[] = []): Promise<{ plan?: BatchPlan; error?: string }> {
  const { rows, error } = await loadOwed();
  // Refused, not partial: a batch built from a balance we could not fully read pays wrong amounts.
  if (error) return { error };
  const scoped: OwedRow[] = only.length ? rows.filter((r) => only.includes(r.user_email)) : rows;
  const emails = scoped.map((r) => r.user_email);
  const [{ policy }, advancesByEmail] = await Promise.all([loadPolicy(), loadAdvances(emails)]);
  const people = await loadPeople(emails, policy);

  const lines: PlannedLine[] = [];
  const skipped: BatchPlan['skipped'] = [];
  for (const row of scoped) {
    if (row.owedCents < 0) {
      skipped.push({ user_email: row.user_email, reason: `Overpaid by $${(-row.owedCents / 100).toFixed(2)} — needs a look, not a payment.` });
      continue;
    }
    if (row.owedCents < MIN_PAYABLE_CENTS) {
      skipped.push({
        user_email: row.user_email,
        reason: row.inFlightCents > 0
          ? `Nothing further owed — $${(row.inFlightCents / 100).toFixed(2)} is already in a payout that has not gone out.`
          : 'Fully paid up on approved hours.',
      });
      continue;
    }
    // Advance recovery: `planAdvanceRecovery` works in DOLLARS, this path in CENTS — converted at the
    // boundary so the one implementation of the rules (including the floor) is kept.
    const advances = advancesByEmail.get(row.user_email) ?? [];
    const rec = advances.length ? planAdvanceRecovery({ advances, netPay: row.owedCents / 100 }) : null;
    const recoveredCents = rec ? Math.round(rec.totalRecovered * 100) : 0;

    const person = people.get(row.user_email)!;
    const r = resolvePayout(person, policy, row.owedCents - recoveredCents);
    lines.push({
      user_email: row.user_email,
      user_name: row.user_name,
      total_cents: row.owedCents,
      recovered_cents: recoveredCents,
      recoveries: rec ? rec.recoveries.map((x) => ({ advanceId: x.advanceId, amount: x.amount })) : [],
      method: r.method,
      method_handle: r.handle,
      fee_cents: r.feeCents,
      fee_note: r.feeNote,
      source: r.source,
      rail: r.rail,
      problems: r.problems,
      notes: r.notes,
    });
  }
  return {
    plan: {
      lines,
      skipped,
      policy,
      totalCents: lines.reduce((s, l) => s + l.total_cents, 0),
      disbursedCents: lines.reduce((s, l) => s + disbursedCents(l), 0),
      recoveredCents: totalRecoveredCents(lines),
      feeCents: totalFeeCents(lines),
      blocked: lines.filter((l) => l.problems.length).map((l) => ({ user_email: l.user_email, problems: l.problems })),
    },
  };
}

export interface CreatedBatch { batch: { id: string; label: string; status: string; total_cents: number }; plan: BatchPlan; itemIdByEmail: Map<string, string> }

/** Write the draft batch, its lines and the advance-repayment rows. */
export async function createOwedBatch(args: { only?: string[]; label: string; notes: string | null; createdBy: string; repaymentNote: string }): Promise<{ created?: CreatedBatch; error?: string; status?: number; skipped?: BatchPlan['skipped'] }> {
  const { plan, error } = await planOwedBatch(args.only ?? []);
  if (error || !plan) return { error: `No payout was created — ${error}`, status: 500 };
  if (plan.lines.length === 0) {
    return {
      error: plan.skipped.length ? 'Nobody has a positive balance to pay right now.' : 'No approved, unpaid hours were found.',
      status: 409,
      skipped: plan.skipped,
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const { data: batch, error: batchError } = await supabaseAdmin
    .from('payout_batches')
    .insert({ label: args.label, kind: 'hours', status: 'draft', total_cents: plan.totalCents, notes: args.notes, created_by: args.createdBy })
    .select('id, label, status, total_cents')
    .single();
  if (batchError || !batch) return { error: batchError?.message ?? 'Could not create the payout', status: 500 };

  const { data: inserted, error: itemError } = await supabaseAdmin
    .from('payout_batch_items')
    .insert(plan.lines.map((l) => ({
      batch_id: batch.id,
      user_email: l.user_email,
      user_name: l.user_name,
      hours_cents: l.total_cents,
      total_cents: l.total_cents,
      // Withheld FROM the total, never netted into it (seed 588 / lib/payroll/disbursement.ts).
      recovered_cents: l.recovered_cents,
      fee_cents: l.fee_cents,
      fee_note: l.fee_note,
      method: l.method,
      method_handle: l.method_handle,
      status: 'pending',
      notes: [`Approved hours owed as at ${today}`, ...l.notes, ...l.problems].join(' · ').slice(0, 1000),
    })))
    .select('id, user_email');
  if (itemError) {
    // Remove the header rather than leave a batch committing money against nobody.
    await supabaseAdmin.from('payout_batches').delete().eq('id', batch.id);
    return { error: itemError.message, status: 500 };
  }

  const itemIdByEmail = new Map(((inserted ?? []) as Array<{ id: string; user_email: string }>).map((i) => [i.user_email, i.id]));
  const repayments = plan.lines.flatMap((l) => {
    const itemId = itemIdByEmail.get(l.user_email);
    return itemId ? l.recoveries.map((r) => ({ advance_id: r.advanceId, payout_batch_item_id: itemId, pay_stub_id: null, user_email: l.user_email, amount: r.amount, note: args.repaymentNote })) : [];
  });
  if (repayments.length) {
    const { error: repayError } = await supabaseAdmin.from('pay_advance_repayments').insert(repayments);
    if (repayError) console.error('[payouts/build-batch] advance repayments could not be recorded:', repayError.message);
  }
  return { created: { batch: batch as CreatedBatch['batch'], plan, itemIdByEmail } };
}
