// __tests__/notifications/receipt-decision.test.ts
//
// Slice 2c of hub-widget-excellence-03-notifications. Locks the pure
// receipt-decision notification builder.

import { describe, it, expect } from 'vitest';
import {
  buildReceiptDecisionNotification,
  type ReceiptRow,
} from '@/lib/notifications/receipt-decision';

const RECEIPT: ReceiptRow = {
  submitted_by: 'a@x.com',
  vendor: 'Home Depot',
  total: 42.5,
};

describe('buildReceiptDecisionNotification', () => {
  it('builds an approval notice with amount + vendor', () => {
    const n = buildReceiptDecisionNotification(RECEIPT, 'approved')!;
    expect(n).toMatchObject({
      user_email: 'a@x.com',
      type: 'approval',
      icon: '✅',
      link: '/admin/receipts',
      source_type: 'receipt_decision',
    });
    expect(n.title).toContain('Approved');
    expect(n.body).toBe('Your $42.50 receipt from Home Depot was approved.');
  });

  it('builds a rejection notice with the reason appended', () => {
    const n = buildReceiptDecisionNotification(
      { ...RECEIPT, rejected_reason: 'Missing itemized total' },
      'rejected',
    )!;
    expect(n.icon).toBe('❌');
    expect(n.title).toContain('Rejected');
    expect(n.body).toContain('was rejected.');
    expect(n.body).toContain('Reason: Missing itemized total');
  });

  it('omits the amount/vendor gracefully when missing', () => {
    const n = buildReceiptDecisionNotification(
      { submitted_by: 'a@x.com', vendor: null, total: null },
      'approved',
    )!;
    expect(n.body).toBe('Your receipt was approved.');
  });

  it('coerces a string total to a formatted amount', () => {
    const n = buildReceiptDecisionNotification(
      { submitted_by: 'a@x.com', vendor: 'Lowe', total: '19.9' },
      'approved',
    )!;
    expect(n.body).toContain('$19.90');
  });

  it('returns null when there is no submitter', () => {
    expect(buildReceiptDecisionNotification({ ...RECEIPT, submitted_by: null }, 'approved')).toBeNull();
    expect(buildReceiptDecisionNotification({ ...RECEIPT, submitted_by: ' ' }, 'rejected')).toBeNull();
  });
});
