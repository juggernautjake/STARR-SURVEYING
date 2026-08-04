// lib/payroll/advance-recovery.ts
//
// TAKING AN ADVANCE BACK OUT OF A PAYCHEQUE (pay consolidation C-17, 2026-08-04)
// ═════════════════════════════════════════════════════════════════════════════
//
// *"Please make sure the week history and pay advances are totally built out and functional too."*
//
// Advances could be requested, approved, denied and cancelled. What they could not do was come back
// — no repaid amount, no instalments, no link to the stub that recovered them. An approved advance
// was money out with nothing expecting it back.
//
// This is the pure half: given what somebody is owed this period and what they still owe the firm,
// decide how much to take. Kept out of the route so the awkward cases have tests rather than being
// discovered in somebody's wages.
//
// ── THE RULES, AND WHY EACH ONE EXISTS ──────────────────────────────────────────────────────────
//
//   • **Never take more than the net pay.** A recovery that exceeds what is owed produces a negative
//     cheque, which is not a thing. Whatever cannot be taken this period stays outstanding and comes
//     out of the next one.
//   • **Never take somebody's whole cheque**, even to recover a debt they agreed to. A person who
//     works a full period and receives $0.00 has been left with nothing to live on, and the next
//     thing that happens is another advance request. A floor protects a share of net pay; the
//     default keeps 25%.
//   • **Oldest first.** With several advances outstanding, the earliest is cleared first, so a debt
//     cannot sit indefinitely behind newer ones.
//   • **Instalments are a cap, not a target.** `repay_per_period` limits what a period takes; it
//     never forces a payment larger than what is actually outstanding.
//   • **Only advances actually paid out.** Approving is a decision; paying is an event. Recovering
//     against an approved-but-unpaid advance would take back money never handed over. That filter
//     lives in the `pay_advances_outstanding` view, and this module trusts it.

/** One outstanding advance, from `pay_advances_outstanding`. */
export interface OutstandingAdvance {
  id: string;
  outstanding: number;
  /** Per-period cap. Null recovers the whole outstanding balance in one go. */
  repay_per_period: number | null;
  /** Used to clear the oldest debt first. */
  paid_at: string | null;
  reason?: string | null;
}

export interface RecoveryInput {
  advances: OutstandingAdvance[];
  /** Net pay before any advance is recovered. */
  netPay: number;
  /**
   * The share of net pay that must survive recovery, 0–1. Default 0.25.
   *
   * Not a legal figure — US federal garnishment rules protect considerably more, and a voluntary
   * advance repayment is a different instrument from a garnishment. It is a floor chosen so that a
   * full period of work never produces an empty cheque. Raise it, do not remove it.
   */
  protectedShare?: number;
}

export interface Recovery {
  advanceId: string;
  amount: number;
}

export interface RecoveryPlan {
  recoveries: Recovery[];
  /** Total coming out of this cheque. */
  totalRecovered: number;
  /** Net pay after recovery. Never below the protected floor, never negative. */
  netAfterRecovery: number;
  /** Still owed once this period is done. */
  remainingOutstanding: number;
  /** The line for the stub — states what was taken and what is left. */
  note: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DEFAULT_PROTECTED_SHARE = 0.25;

/**
 * Decide what this paycheque takes back.
 *
 * Returns an empty plan rather than throwing when there is nothing to recover or nothing to recover
 * it from — a person with no advances and a person with a $0 cheque both have the same answer, and
 * neither is an error.
 */
export function planAdvanceRecovery(input: RecoveryInput): RecoveryPlan {
  const netPay = Number(input.netPay);
  const share = Number.isFinite(input.protectedShare as number)
    ? Math.min(1, Math.max(0, input.protectedShare as number))
    : DEFAULT_PROTECTED_SHARE;

  const owed = (input.advances ?? [])
    .map((a) => ({ ...a, outstanding: round2(Number(a.outstanding)) }))
    .filter((a) => Number.isFinite(a.outstanding) && a.outstanding > 0)
    // Oldest first. An advance with no `paid_at` sorts last: it should not be here at all (the view
    // filters to paid ones), and putting an unknown date first would jump a queue on no evidence.
    .sort((a, b) => {
      if (!a.paid_at) return 1;
      if (!b.paid_at) return -1;
      return a.paid_at.localeCompare(b.paid_at);
    });

  const totalOutstanding = round2(owed.reduce((sum, a) => sum + a.outstanding, 0));

  if (owed.length === 0 || !Number.isFinite(netPay) || netPay <= 0) {
    return {
      recoveries: [],
      totalRecovered: 0,
      netAfterRecovery: Number.isFinite(netPay) ? round2(Math.max(0, netPay)) : 0,
      remainingOutstanding: totalOutstanding,
      // Said out loud rather than left silent: a cheque with nothing taken, against a debt that is
      // still owed, is worth explaining before somebody assumes it was written off.
      note: totalOutstanding > 0
        ? `$${totalOutstanding.toFixed(2)} advance still outstanding — nothing recovered this period.`
        : null,
    };
  }

  const available = round2(netPay * (1 - share));
  let budget = available;
  const recoveries: Recovery[] = [];

  for (const advance of owed) {
    if (budget <= 0) break;
    const cap = Number.isFinite(advance.repay_per_period as number) && (advance.repay_per_period as number) > 0
      ? Number(advance.repay_per_period)
      : advance.outstanding;
    const amount = round2(Math.min(advance.outstanding, cap, budget));
    if (amount <= 0) continue;
    recoveries.push({ advanceId: advance.id, amount });
    budget = round2(budget - amount);
  }

  const totalRecovered = round2(recoveries.reduce((sum, r) => sum + r.amount, 0));
  const remainingOutstanding = round2(totalOutstanding - totalRecovered);

  const parts = [`$${totalRecovered.toFixed(2)} recovered against a pay advance`];
  if (remainingOutstanding > 0) parts.push(`$${remainingOutstanding.toFixed(2)} still outstanding`);

  return {
    recoveries,
    totalRecovered,
    netAfterRecovery: round2(netPay - totalRecovered),
    remainingOutstanding,
    note: totalRecovered > 0 ? `${parts.join('; ')}.` : null,
  };
}
