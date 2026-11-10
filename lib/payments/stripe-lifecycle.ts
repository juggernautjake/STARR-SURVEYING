// lib/payments/stripe-lifecycle.ts — what a Stripe event does to a payment and its invoice. Pure.
//
// Owner, 2026-11-10: "set up online payments for customers to pay online with card … however it
// makes the most sense." The webhook (app/api/webhooks/stripe/route.ts) reads Stripe's events and
// asks these functions what to write; tested in __tests__/admin/stripe-lifecycle.test.ts.
//
// The invoice's status is always worked out again from ALL of its payments, never nudged from the
// last one: events arrive out of order, are retried, and a refund or chargeback can land weeks after
// the payment it reverses.

export interface PaymentLike {
  amount_cents?: number | null;
  status?: string | null;
  refunded_cents?: number | null;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Money the business has and keeps: succeeded payments, less anything refunded on them. */
export function netPaidCents(payments: ReadonlyArray<PaymentLike>): number {
  return payments
    .filter((p) => p.status === 'succeeded')
    .reduce((acc, p) => acc + Math.max(0, n(p.amount_cents) - n(p.refunded_cents)), 0);
}

/** Money on its way: bank payments still clearing. Not paid yet, but not owed again either. */
export function pendingCents(payments: ReadonlyArray<PaymentLike>): number {
  return payments.filter((p) => p.status === 'pending').reduce((acc, p) => acc + n(p.amount_cents), 0);
}

/** What the customer can still be asked to pay now: the total, less what is paid and what is clearing. */
export function payableBalanceCents(totalCents: number, payments: ReadonlyArray<PaymentLike>): number {
  return Math.max(0, n(totalCents) - netPaidCents(payments) - pendingCents(payments));
}

export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'voided' | 'overdue' | 'refunded';

/**
 * An invoice's status from its payments. Draft and voided are the office's decisions and are left
 * alone. Otherwise: paid in full → paid; some → partial; none, after money had come and gone back
 * (a refund) → refunded; none, after a payment that failed or was charged back → back to issued (or
 * overdue, if it was).
 */
export function invoiceStatusFromPayments(args: {
  totalCents: number;
  currentStatus: string;
  payments: ReadonlyArray<PaymentLike>;
}): InvoiceStatus {
  const current = args.currentStatus as InvoiceStatus;
  if (current === 'draft' || current === 'voided') return current;
  const total = Math.max(0, n(args.totalCents));
  const net = netPaidCents(args.payments);
  if (total > 0 && net >= total) return 'paid';
  if (net > 0) return 'partial';
  const refunded = args.payments.some((p) => p.status === 'refunded' || n(p.refunded_cents) > 0);
  if (refunded) return 'refunded';
  return current === 'overdue' ? 'overdue' : 'issued';
}

/** A charge's refund state → the payment's: what has been given back, and whether that is all of it. */
export function refundState(amountCents: number, amountRefundedCents: number): { refunded_cents: number; status: 'succeeded' | 'refunded' } {
  const refunded = Math.max(0, Math.min(n(amountCents), n(amountRefundedCents)));
  return { refunded_cents: refunded, status: refunded >= n(amountCents) && refunded > 0 ? 'refunded' : 'succeeded' };
}

/**
 * A dispute's status → the payment's. While it is open, or once lost, the money is not the
 * business's (`disputed`). Won — or an early-warning inquiry that closed without a chargeback — and
 * the payment counts again.
 */
export function paymentStatusForDispute(disputeStatus: string): 'succeeded' | 'disputed' {
  return disputeStatus === 'won' || disputeStatus === 'warning_closed' ? 'succeeded' : 'disputed';
}

/** Money fields on a Stripe object, read defensively. */
export function stripeCents(obj: Record<string, unknown>, key: string): number {
  return n(obj[key]);
}

/** The PaymentIntent id an event's object belongs to (an intent itself, a charge, or a dispute). */
export function intentIdOf(obj: Record<string, unknown>): string | null {
  if (typeof obj.object === 'string' && obj.object === 'payment_intent') return typeof obj.id === 'string' ? obj.id : null;
  const pi = obj.payment_intent;
  if (typeof pi === 'string' && pi) return pi;
  if (pi && typeof pi === 'object' && typeof (pi as { id?: unknown }).id === 'string') return (pi as { id: string }).id;
  return null;
}
