// lib/payroll/pay-decision.ts
//
// WHAT THE APPROVER DECIDED (owner request, 2026-08-04)
// ════════════════════════════════════════════════════
//
// *"Whenever hours come in, the boss should be able to see what that employee's base pay is
// automatically, and should have a reference for all of the other activities' pay levels too in
// case they want to apply those pay rates for different parts of the day… They can submit that
// they worked 8 hours, but the boss might choose to pay the rate for drawing for 2 hours and the
// field work rate for 6 hours, or he might want to just give them the base pay for the whole time,
// or he will pay them some unique amount."*
//
// The pure half. Validation and totalling live here so the same rules apply whether a decision
// arrives from the approval screen, a bulk action, or a later payroll correction — and so the
// awkward cases have tests instead of being discovered in somebody's wages.
//
// The awkward cases, all of which this rejects rather than silently reconciling:
//
//   • **Blocks that do not add up to the hours worked.** Paying 6 hours of an 8-hour day is a
//     decision somebody might mean, but it is far more often a typo. It is refused with both
//     numbers named, so the approver either fixes it or says the missing hours are undecided —
//     explicitly, by putting them in a block with no rate.
//   • **A negative or absurd rate.** $-5/hr and $5,000/hr are both almost certainly a slip.
//   • **An empty decision.** Approving with no blocks at all would write a $0 payout that looks
//     deliberate. There is no shape of "I decided nothing" — that state is *not having decided*.
//
// What it deliberately allows, because the owner is the authority on pay:
//   • Any rate at all, high or low. Nothing here second-guesses the number a person typed.
//   • $0.00 for a block, as long as somebody typed it. Unpaid time is a real outcome.
//   • A total that differs from what the rules computed at submission. That difference is the
//     entire point of an approval step.

import { totalHourBlocks, type ResolvedRate, type RateSource } from './resolve-rate';

/** One stretch of a day, priced one way. Mirrors an element of `time_log_pay_decisions.blocks`. */
export interface PayBlock {
  hours: number;
  /** The activity this stretch is being paid as, or null when it is base pay / a flat amount. */
  work_type: string | null;
  /** The rate for this stretch. **Null means deliberately undecided** — it pays nothing yet. */
  rate: number | null;
  source: RateSource;
  label: string;
  explanation: string;
}

export interface PayDecisionInput {
  blocks: PayBlock[];
  /** The hours the employee submitted (adjusted hours, when the approver has changed them). */
  submittedHours: number;
  payoutNote?: string | null;
}

export interface PayDecisionTotals {
  blocks: PayBlock[];
  totalHours: number;
  totalPay: number;
  undecidedHours: number;
  blendedRate: number | null;
  payoutNote: string | null;
}

export type PayDecisionResult =
  | { ok: true; decision: PayDecisionTotals }
  | { ok: false; error: string };

/** A rate above this is refused as a slip. Well clear of anything a survey firm pays by the hour. */
const IMPLAUSIBLE_RATE = 1000;

/** Hours are compared to the nearest cent-equivalent, so 0.25-hour increments never fail on float noise. */
const HOURS_EPSILON = 0.01;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Validate and total an approver's decision.
 *
 * Returns a refusal with a sentence naming what is wrong, rather than throwing — every caller here
 * is an HTTP handler that needs to hand that sentence to a person.
 */
export function buildPayDecision(input: PayDecisionInput): PayDecisionResult {
  const blocks = input.blocks ?? [];

  if (blocks.length === 0) {
    return { ok: false, error: 'A payout needs at least one block of hours. To leave it undecided, do not save a decision.' };
  }

  const clean: PayBlock[] = [];
  for (const [index, block] of blocks.entries()) {
    const hours = Number(block.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return { ok: false, error: `Block ${index + 1} has no hours on it. Remove it or give it a positive number of hours.` };
    }

    let rate: number | null = null;
    if (block.rate !== null && block.rate !== undefined) {
      rate = Number(block.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        return { ok: false, error: `Block ${index + 1} has a rate of ${block.rate}. A rate cannot be negative.` };
      }
      if (rate > IMPLAUSIBLE_RATE) {
        return { ok: false, error: `Block ${index + 1} is set to $${rate}/hr. That is almost certainly a typo.` };
      }
      rate = round2(rate);
    }

    clean.push({
      hours: round2(hours),
      work_type: block.work_type ?? null,
      rate,
      source: block.source,
      label: block.label,
      explanation: block.explanation,
    });
  }

  const blockHours = round2(clean.reduce((sum, b) => sum + b.hours, 0));
  const submitted = round2(Number(input.submittedHours));

  if (Number.isFinite(submitted) && Math.abs(blockHours - submitted) > HOURS_EPSILON) {
    return {
      ok: false,
      error: `The blocks add up to ${blockHours} hours but the entry is for ${submitted}. Adjust the split, or change the hours on the entry first if that is what you mean.`,
    };
  }

  // `totalHourBlocks` is the same summer the rate menu uses, so a decision and a preview of that
  // decision cannot disagree about the money.
  const totals = totalHourBlocks(
    clean.map((b) => ({ hours: b.hours, resolved: { rate: b.rate } as ResolvedRate })),
  );

  const note = typeof input.payoutNote === 'string' ? input.payoutNote.trim() : '';

  return {
    ok: true,
    decision: {
      blocks: clean,
      totalHours: blockHours,
      totalPay: totals.amount,
      undecidedHours: totals.unsetHours,
      blendedRate: totals.blendedRate,
      payoutNote: note === '' ? null : note,
    },
  };
}

/**
 * The default decision for an entry nobody has touched: pay it exactly as the rules resolved it.
 *
 * This is what the approval screen opens with. Starting from the computed answer rather than a
 * blank form means the common case — "yes, that's right" — is one click, and the approver only
 * types when they disagree.
 */
export function defaultDecisionBlocks(
  hours: number,
  resolved: ResolvedRate,
  label: string,
  workType: string | null,
): PayBlock[] {
  return [{
    hours: round2(hours),
    work_type: workType,
    rate: resolved.rate,
    source: resolved.source,
    label,
    explanation: resolved.explanation,
  }];
}

/**
 * Describe a decision against what the rules had computed, for the line the employee reads.
 *
 * Silence when they agree. When they differ, the difference is stated in both directions — an
 * unexplained change to somebody's pay is what generates the dispute an approval step exists to
 * prevent.
 */
export function describeDecision(decision: PayDecisionTotals, resolvedTotal: number | null): string | null {
  if (resolvedTotal === null) {
    return `Paid $${decision.totalPay.toFixed(2)} — no rate had been set for these hours.`;
  }
  const difference = round2(decision.totalPay - resolvedTotal);
  if (Math.abs(difference) < 0.005) return null;
  return difference > 0
    ? `Paid $${decision.totalPay.toFixed(2)} — $${difference.toFixed(2)} more than the standard rates for these hours.`
    : `Paid $${decision.totalPay.toFixed(2)} — $${Math.abs(difference).toFixed(2)} less than the standard rates for these hours.`;
}
