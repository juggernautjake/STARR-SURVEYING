// lib/notifications/receipt-decision.ts
//
// Slice 2c of hub-widget-excellence-03-notifications. Pure payload
// builder for the "your receipt was approved/rejected" notification.
// Dependency-free + unit-testable; the receipts routes map the payload
// through `notify`.

/**
 * A receipt, in the shape the `receipts` table ACTUALLY has.
 *
 * ── WHY THESE FIELD NAMES CHANGED (2026-08-12) ──────────────────────────────────────────────────
 *
 * This interface used to read `submitted_by`, `vendor` and `total`. **None of those columns exist.**
 * The real ones are `user_id` (an `auth.users` UUID, not an email), `vendor_name` and `total_cents`.
 *
 * Both callers cast their query result to this type, so TypeScript was satisfied and every field
 * arrived `undefined` at runtime — and because `buildReceiptDecisionNotification` returns null on a
 * missing submitter, **every receipt approval and rejection silently notified nobody**. A crew member
 * whose receipt was rejected with a reason was never told, and there was no error to notice.
 *
 * The same phantom columns in a `.select()` on the bulk route were worse: PostgREST renders it as
 * `UPDATE … RETURNING`, so the unknown column was a parse error and bulk approval never worked at
 * all.
 *
 * `user_email` is resolved by the caller (`lib/receipts/submitter.ts`) because the row carries a
 * UUID and a notification needs an address. Keeping that resolution outside this module is what lets
 * it stay dependency-free and unit-testable.
 */
export interface ReceiptRow {
  /** Resolved from `receipts.user_id` by the caller — see the note above. */
  user_email?: string | null;
  vendor_name?: string | null;
  /** Cents, as stored. Converted for display here so no caller has to remember the unit. */
  total_cents?: number | string | null;
  rejected_reason?: string | null;
}

export type ReceiptDecision = 'approved' | 'rejected';

export interface ReceiptDecisionNotification {
  user_email: string;
  type: 'approval';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'receipt_decision';
}

/**
 * Build the approve/reject notification for a receipt, addressed to the
 * submitter (`submitted_by`). Returns null when there's no submitter.
 * Includes the amount + vendor, and the rejection reason when rejected.
 */
export function buildReceiptDecisionNotification(
  receipt: ReceiptRow,
  decision: ReceiptDecision,
): ReceiptDecisionNotification | null {
  const user_email = receipt.user_email?.trim();
  if (!user_email) return null;

  const approved = decision === 'approved';
  const statusTitle = approved ? 'Approved' : 'Rejected';
  const icon = approved ? '✅' : '❌';
  const amount = formatAmount(receipt.total_cents);
  const vendor = receipt.vendor_name?.trim();

  // "Your $42.50 receipt from Home Depot" / "Your receipt"
  const subject = [
    'Your',
    amount,
    'receipt',
    vendor ? `from ${vendor}` : null,
  ].filter(Boolean).join(' ');

  let body = `${subject} was ${approved ? 'approved' : 'rejected'}.`;
  if (!approved && receipt.rejected_reason?.trim()) {
    body += ` Reason: ${receipt.rejected_reason.trim()}`;
  }

  return {
    user_email,
    type: 'approval',
    title: `${icon} Receipt ${statusTitle}`,
    body,
    icon,
    link: '/admin/receipts',
    source_type: 'receipt_decision',
  };
}

/**
 * "$42.50" from CENTS, or '' when the total is missing or unparseable.
 *
 * The column is `total_cents`. The previous version took dollars, so had it ever received a real
 * value it would have announced a $42.50 receipt as "$4250.00" — a 100× error in a message sent to
 * the person who spent the money.
 */
function formatAmount(totalCents: number | string | null | undefined): string {
  if (totalCents == null) return '';
  const n = typeof totalCents === 'number' ? totalCents : Number(totalCents);
  if (!Number.isFinite(n)) return '';
  return `$${(n / 100).toFixed(2)}`;
}
