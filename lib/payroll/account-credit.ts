// lib/payroll/account-credit.ts
//
// EMPLOYEE MONEY ACCOUNTS
// ═══════════════════════
//
// *"We need to be able to have money accounts for the employees, and they can move money to their
// connected bank account or card."*
//
// H-11 of HOURS_TO_PAYOUT_2026-08-05. The account machinery already existed —
// `employee_profiles.available_balance`, `balance_transactions`, `withdrawal_requests`, and a
// request flow that checks the balance and refuses without a linked bank. What was missing was the
// only thing that matters: **nothing ever credited it.**
//
// `available_balance` was written by exactly one path — completing an old `payroll_runs` run. Pay
// now flows through payout batches, which never touched it. So the account existed, the withdrawal
// screen worked, and the balance was permanently $0.00. An account nobody can put money into is a
// table, not a feature.
//
// ── THE `account` PAYOUT METHOD ─────────────────────────────────────────────────────────────────
//
// The missing link is a way to say "pay this into their account rather than out the door". That is
// a payout METHOD, which makes it one concept rather than a parallel system:
//
//   venmo / check / cash / ach   — money leaves the firm and reaches the person.
//   account                      — money is credited to the person's balance. **It has not left the
//                                  firm.** They draw it out later, and that withdrawal is the
//                                  moment it goes.
//
// This is why `account` carries `sendsItself: false` like everything else, and why marking it paid
// is honest: the obligation genuinely moved from "we owe you for hours" to "we hold this for you".
// Both are debts; only the shape changed.
//
// ── DOUBLE-CREDITING IS THE RISK ────────────────────────────────────────────────────────────────
//
// The mark-paid route can be called more than once — the office updates an external reference on a
// row that is already paid, or flips a status back and forth. Crediting on every call would inflate
// somebody's balance by the amount of the payout each time, and nothing in the account would look
// wrong: the number would just be too big.
//
// So a credit is keyed to the payout item. `alreadyCredited` is checked before writing, and the
// ledger row carries `reference_id = <item id>` so the check has something to find.

/** One row of `balance_transactions`, as this module needs it. */
export interface BalanceTransaction {
  reference_type: string | null;
  reference_id: string | null;
  amount: number;
}

/**
 * Has this payout item already been credited to the account?
 *
 * Keyed on the ITEM, not the batch: a batch pays several people, and a per-batch key would credit
 * the first person and consider everybody else done.
 */
export function alreadyCredited(existing: readonly BalanceTransaction[], payoutItemId: string): boolean {
  return existing.some((t) => t.reference_type === 'payout_batch_item' && t.reference_id === payoutItemId);
}

export interface CreditPlan {
  /** Whether to write anything at all. */
  credit: boolean;
  amountDollars: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  /** Why nothing is being written, when `credit` is false. For the caller's log, not for silence. */
  reason: string | null;
}

/**
 * Decide whether a paid payout item credits somebody's account, and by how much.
 *
 * Pure: the caller does the reads and the writes. That keeps the interesting cases — wrong method,
 * already credited, nonsense amount — testable without a database, which is where a money bug is
 * cheapest to find.
 */
export function planAccountCredit(input: {
  method: string | null;
  amountCents: number;
  payoutItemId: string;
  currentBalanceDollars: number;
  existingTransactions: readonly BalanceTransaction[];
  batchLabel?: string | null;
}): CreditPlan {
  const none = (reason: string): CreditPlan => ({
    credit: false,
    amountDollars: 0,
    balanceBefore: input.currentBalanceDollars,
    balanceAfter: input.currentBalanceDollars,
    description: '',
    reason,
  });

  // Only the `account` method credits a balance. Everything else genuinely left the firm — crediting
  // an account for money already handed over in cash would pay somebody twice.
  if (input.method !== 'account') return none('Not an account payout — the money went out, not in.');

  if (alreadyCredited(input.existingTransactions, input.payoutItemId)) {
    // The mark-paid route can be called repeatedly. Without this, a balance inflates by the payout
    // amount each time and nothing about the number looks wrong.
    return none('Already credited for this payout.');
  }

  const cents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(cents) || cents <= 0) return none('No positive amount to credit.');

  const amountDollars = Math.round((cents / 100) * 100) / 100;
  const before = Number.isFinite(input.currentBalanceDollars) ? input.currentBalanceDollars : 0;

  return {
    credit: true,
    amountDollars,
    balanceBefore: before,
    balanceAfter: Math.round((before + amountDollars) * 100) / 100,
    description: input.batchLabel
      ? `Approved hours credited to your account — ${input.batchLabel}`
      : 'Approved hours credited to your account',
    reason: null,
  };
}
