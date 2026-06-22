// __tests__/admin/payment-upfront-rule.test.ts
//
// S2 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — pure-logic lock on the
// upfront/deposit rule. Owner intent: pay ≥ upfront (which may be $0) on the
// first payment, and ≤ the total, never more.

import { describe, it, expect } from 'vitest';
import {
  resolveDepositAmountCents,
  decideUpfrontAcceptance,
} from '@/lib/payments/upfront-rule';

const TOTAL = 100_000; // $1,000.00

describe('resolveDepositAmountCents', () => {
  it('none → 0 regardless of value', () => {
    expect(resolveDepositAmountCents({ deposit_type: 'none', deposit_value: 50, total_cents: TOTAL })).toBe(0);
  });
  it('percent → total × value%', () => {
    expect(resolveDepositAmountCents({ deposit_type: 'percent', deposit_value: 25, total_cents: TOTAL })).toBe(25_000);
    expect(resolveDepositAmountCents({ deposit_type: 'percent', deposit_value: 33.5, total_cents: TOTAL })).toBe(33_500);
  });
  it('fixed → dollars converted to cents', () => {
    expect(resolveDepositAmountCents({ deposit_type: 'fixed', deposit_value: 500, total_cents: TOTAL })).toBe(50_000);
    expect(resolveDepositAmountCents({ deposit_type: 'fixed', deposit_value: 250.75, total_cents: TOTAL })).toBe(25_075);
  });
  it('clamps to [0, total]', () => {
    expect(resolveDepositAmountCents({ deposit_type: 'percent', deposit_value: 150, total_cents: TOTAL })).toBe(TOTAL);
    expect(resolveDepositAmountCents({ deposit_type: 'fixed', deposit_value: 9999, total_cents: TOTAL })).toBe(TOTAL);
    expect(resolveDepositAmountCents({ deposit_type: 'percent', deposit_value: -10, total_cents: TOTAL })).toBe(0);
  });
  it('null / missing value → 0', () => {
    expect(resolveDepositAmountCents({ deposit_type: 'percent', deposit_value: null, total_cents: TOTAL })).toBe(0);
    expect(resolveDepositAmountCents({ deposit_type: 'fixed', deposit_value: undefined, total_cents: TOTAL })).toBe(0);
  });
});

describe('decideUpfrontAcceptance', () => {
  it('no upfront: any positive amount up to balance is accepted', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 0, prior_paid_cents: 0, intended_amount_cents: 5_000, total_cents: TOTAL });
    expect(d.accepted).toBe(true);
    expect(d.min_cents).toBe(1);
    expect(d.max_cents).toBe(TOTAL);
  });

  it('first payment below the upfront is rejected', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 25_000, prior_paid_cents: 0, intended_amount_cents: 10_000, total_cents: TOTAL });
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('below_upfront');
    expect(d.min_cents).toBe(25_000);
    expect(d.message).toContain('$250.00');
  });

  it('first payment exactly equal to the upfront is accepted', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 25_000, prior_paid_cents: 0, intended_amount_cents: 25_000, total_cents: TOTAL });
    expect(d.accepted).toBe(true);
  });

  it('paying the full total upfront is accepted', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 25_000, prior_paid_cents: 0, intended_amount_cents: TOTAL, total_cents: TOTAL });
    expect(d.accepted).toBe(true);
  });

  it('cannot pay more than the remaining balance', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 0, prior_paid_cents: 0, intended_amount_cents: 120_000, total_cents: TOTAL });
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('above_balance');
    expect(d.max_cents).toBe(TOTAL);
  });

  it('once the upfront is met, any positive amount up to balance is fine', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 25_000, prior_paid_cents: 25_000, intended_amount_cents: 1_000, total_cents: TOTAL });
    expect(d.accepted).toBe(true);
    expect(d.min_cents).toBe(1);
    expect(d.max_cents).toBe(75_000);
  });

  it('rejects a zero / negative amount', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 0, prior_paid_cents: 0, intended_amount_cents: 0, total_cents: TOTAL });
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('non_positive');
  });

  it('rejects payment on an already-paid invoice', () => {
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 25_000, prior_paid_cents: TOTAL, intended_amount_cents: 5_000, total_cents: TOTAL });
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('already_paid');
    expect(d.max_cents).toBe(0);
  });

  it('a partial payment that has not yet met the upfront still requires the remainder of the upfront', () => {
    // prior 10k toward a 25k upfront → next must be ≥ 15k
    const d = decideUpfrontAcceptance({ deposit_amount_cents: 25_000, prior_paid_cents: 10_000, intended_amount_cents: 5_000, total_cents: TOTAL });
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('below_upfront');
    expect(d.min_cents).toBe(15_000);
  });
});
