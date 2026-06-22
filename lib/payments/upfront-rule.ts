// lib/payments/upfront-rule.ts
//
// S2 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — the upfront/deposit rule.
//
// Owner intent: a customer must pay AT LEAST the upfront amount we set (which
// can be $0) on their first payment, and may pay UP TO — but never more than —
// the invoice total. Once the upfront is satisfied, any positive amount up to
// the remaining balance is accepted.
//
// Two pure functions, both unit-tested:
//   - resolveDepositAmountCents — turn a deposit rule (none/percent/fixed) into
//     a concrete cents amount at invoice-create time (stored on the row so the
//     customer-facing math never has to recompute it).
//   - decideUpfrontAcceptance — given an invoice's deposit + prior payments,
//     decide whether a proposed payment amount is allowed, and expose the
//     min/max the UI should clamp to.

import { formatDollars } from './live';

export type DepositType = 'none' | 'percent' | 'fixed';

export interface ResolveDepositInput {
  deposit_type: DepositType;
  /** percent → a percentage 0–100; fixed → a dollar amount (NUMERIC). */
  deposit_value: number | null | undefined;
  total_cents: number;
}

/** Concrete upfront amount in cents, always clamped to [0, total_cents].
 *  `none` → 0. `percent` → total × value%. `fixed` → value dollars → cents. */
export function resolveDepositAmountCents(input: ResolveDepositInput): number {
  const total = Math.max(0, Math.round(input.total_cents || 0));
  const value = typeof input.deposit_value === 'number' && Number.isFinite(input.deposit_value)
    ? input.deposit_value
    : 0;

  let cents: number;
  switch (input.deposit_type) {
    case 'percent':
      cents = Math.round((total * clamp(value, 0, 100)) / 100);
      break;
    case 'fixed':
      cents = Math.round(Math.max(0, value) * 100);
      break;
    case 'none':
    default:
      cents = 0;
      break;
  }
  return clamp(cents, 0, total);
}

export type UpfrontReason =
  | 'ok'
  | 'non_positive'
  | 'below_upfront'
  | 'above_balance'
  | 'already_paid';

export interface UpfrontDecision {
  accepted: boolean;
  reason: UpfrontReason;
  /** Smallest amount this payment may be (cents). */
  min_cents: number;
  /** Largest amount this payment may be (cents) = remaining balance. */
  max_cents: number;
  /** Customer-facing explanation; '' when accepted. */
  message: string;
}

export interface UpfrontDecisionInput {
  /** Resolved upfront requirement for the whole invoice (cents). */
  deposit_amount_cents: number;
  /** Sum of already-succeeded payments (cents). */
  prior_paid_cents: number;
  /** The amount the customer is trying to pay now (cents). */
  intended_amount_cents: number;
  /** Invoice total (cents). */
  total_cents: number;
}

/** Decide whether `intended_amount_cents` is an allowed payment.
 *
 *  - Remaining balance = total − prior_paid; payments may never exceed it.
 *  - While prior_paid < upfront, the payment must bring the cumulative paid to
 *    at least the upfront (i.e. ≥ upfront − prior_paid) — "can't pay less than
 *    the upfront initially".
 *  - Once the upfront is met, any positive amount ≤ remaining is fine.
 */
export function decideUpfrontAcceptance(input: UpfrontDecisionInput): UpfrontDecision {
  const total = Math.max(0, Math.round(input.total_cents || 0));
  const priorPaid = Math.max(0, Math.round(input.prior_paid_cents || 0));
  const upfront = clamp(Math.round(input.deposit_amount_cents || 0), 0, total);
  const intended = Math.round(input.intended_amount_cents || 0);

  const remaining = Math.max(0, total - priorPaid);
  // Required minimum: clear the outstanding portion of the upfront if it
  // hasn't been met yet; otherwise any positive cent.
  const upfrontOutstanding = Math.max(0, upfront - priorPaid);
  const minCents = remaining === 0 ? 0 : Math.max(1, upfrontOutstanding);
  const maxCents = remaining;

  if (remaining <= 0) {
    return { accepted: false, reason: 'already_paid', min_cents: 0, max_cents: 0,
      message: 'This invoice is already paid in full.' };
  }
  if (intended <= 0) {
    return { accepted: false, reason: 'non_positive', min_cents: minCents, max_cents: maxCents,
      message: 'Enter a payment amount greater than $0.' };
  }
  if (intended > maxCents) {
    return { accepted: false, reason: 'above_balance', min_cents: minCents, max_cents: maxCents,
      message: `You can't pay more than the remaining balance of ${formatDollars(maxCents)}.` };
  }
  if (intended < minCents) {
    return { accepted: false, reason: 'below_upfront', min_cents: minCents, max_cents: maxCents,
      message: `Your first payment must be at least ${formatDollars(minCents)} (the required upfront amount).` };
  }
  return { accepted: true, reason: 'ok', min_cents: minCents, max_cents: maxCents, message: '' };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
