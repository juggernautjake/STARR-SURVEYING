// lib/notifications/receipt-decision.ts
//
// Slice 2c of hub-widget-excellence-03-notifications. Pure payload
// builder for the "your receipt was approved/rejected" notification.
// Dependency-free + unit-testable; the receipts routes map the payload
// through `notify`.

export interface ReceiptRow {
  submitted_by?: string | null;
  vendor?: string | null;
  total?: number | string | null;
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
  const user_email = receipt.submitted_by?.trim();
  if (!user_email) return null;

  const approved = decision === 'approved';
  const statusTitle = approved ? 'Approved' : 'Rejected';
  const icon = approved ? '✅' : '❌';
  const amount = formatAmount(receipt.total);
  const vendor = receipt.vendor?.trim();

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

/** "$42.50", or '' when the total is missing/unparseable. */
function formatAmount(total: number | string | null | undefined): string {
  if (total == null) return '';
  const n = typeof total === 'number' ? total : Number(total);
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(2)}`;
}
