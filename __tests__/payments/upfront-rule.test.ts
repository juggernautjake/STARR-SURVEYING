// __tests__/payments/upfront-rule.test.ts
//
// Phase-2 Slice 0 source-lock for lib/payments/upfront-rule.ts.
//
// Every assertion below traces back to a line in the user's directive
// (2026-06-21). Keeping them in one file so a future rewrite has to
// update them deliberately.

import { describe, it, expect } from 'vitest';
import {
  decideUpfrontAcceptance,
  isUpfrontPaid,
  resolveDepositAmountCents,
  type InvoiceForUpfrontRule,
} from '@/lib/payments/upfront-rule';

const invoice = (overrides: Partial<InvoiceForUpfrontRule> = {}): InvoiceForUpfrontRule => ({
  deposit_type: 'none',
  deposit_amount_cents: 0,
  total_cents: 100000,        // $1,000
  prior_paid_cents: 0,
  ...overrides,
});

describe('decideUpfrontAcceptance — no upfront required', () => {
  it('accepts any positive amount up to the balance', () => {
    const d = decideUpfrontAcceptance(invoice(), 12345);
    expect(d.accepted).toBe(true);
    if (d.accepted) {
      expect(d.reason).toBe('no_upfront');
      expect(d.effective_amount_cents).toBe(12345);
    }
  });

  it('accepts a full-balance payment', () => {
    const d = decideUpfrontAcceptance(invoice(), 100000);
    expect(d.accepted).toBe(true);
  });

  it('rejects a zero amount', () => {
    const d = decideUpfrontAcceptance(invoice(), 0);
    expect(d.accepted).toBe(false);
    if (!d.accepted) {
      expect(d.reason).toBe('amount_invalid');
      expect(d.message).toMatch(/greater than \$0\.00/);
    }
  });

  it('rejects a negative amount', () => {
    expect(decideUpfrontAcceptance(invoice(), -100).accepted).toBe(false);
  });

  it('rejects NaN / Infinity', () => {
    expect(decideUpfrontAcceptance(invoice(), Number.NaN).accepted).toBe(false);
    expect(decideUpfrontAcceptance(invoice(), Number.POSITIVE_INFINITY).accepted).toBe(false);
  });

  it('rejects payments greater than the remaining balance', () => {
    const d = decideUpfrontAcceptance(invoice({ prior_paid_cents: 60000 }), 50000);
    expect(d.accepted).toBe(false);
    if (!d.accepted) {
      expect(d.reason).toBe('over_balance');
      expect(d.remaining_balance_cents).toBe(40000);
      expect(d.message).toMatch(/\$400\.00/);
    }
  });

  it('rejects payments against a fully-paid invoice', () => {
    const d = decideUpfrontAcceptance(invoice({ prior_paid_cents: 100000 }), 100);
    expect(d.accepted).toBe(false);
    if (!d.accepted) {
      expect(d.reason).toBe('invoice_paid');
      expect(d.remaining_balance_cents).toBe(0);
    }
  });
});

describe('decideUpfrontAcceptance — upfront required, not yet satisfied', () => {
  const baseDeposit = () => invoice({
    deposit_type: 'percent',
    deposit_amount_cents: 25000,  // 25% of $1,000
  });

  it('REJECTS the first payment when it does not cover the full upfront', () => {
    // The exact user spec: "if they make a payment initially that is
    // less than the upfront cost, then it should notify them and tell
    // them that they will need to pay the rest of upfront cost"
    const d = decideUpfrontAcceptance(baseDeposit(), 10000);  // $100, upfront is $250
    expect(d.accepted).toBe(false);
    if (!d.accepted) {
      expect(d.reason).toBe('below_upfront');
      expect(d.required_minimum_cents).toBe(25000);
      expect(d.message).toMatch(/upfront amount of \$250\.00/);
      expect(d.message).toMatch(/at least \$250\.00/);
    }
  });

  it('ACCEPTS the first payment when it exactly equals the upfront', () => {
    const d = decideUpfrontAcceptance(baseDeposit(), 25000);
    expect(d.accepted).toBe(true);
    if (d.accepted) expect(d.reason).toBe('covers_upfront');
  });

  it('ACCEPTS the first payment when it exceeds the upfront', () => {
    const d = decideUpfrontAcceptance(baseDeposit(), 50000);
    expect(d.accepted).toBe(true);
  });

  it('ACCEPTS the full balance in one shot when upfront < total', () => {
    const d = decideUpfrontAcceptance(baseDeposit(), 100000);
    expect(d.accepted).toBe(true);
  });

  it('REJECTS even after a smaller prior payment if the cumulative total still falls short of upfront', () => {
    // Backstop on the user spec: "we shouldn't accept any money for
    // the job until they pay the full upfront cost or more." Some
    // small partial pre-payment from a prior attempt doesn't unlock
    // the route — the customer still has to bring the total over the
    // upfront threshold in a single payment.
    const d = decideUpfrontAcceptance(
      baseDeposit(),
      // Pretend they already pledged $100 (recorded but not cleared
      // yet). The new payment must cover the REMAINING upfront in one
      // shot.
      // upfront 25000 - prior 10000 = 15000 needed; only $50 tried.
      5000,
    );
    expect(d.accepted).toBe(false);  // 5000 < 25000 even before partial credit
  });

  it('clearly tells the user the remaining upfront when there is partial credit', () => {
    const d = decideUpfrontAcceptance(
      { ...baseDeposit(), prior_paid_cents: 10000 },  // $100 partial
      10000,                                           // tries $100 again
    );
    expect(d.accepted).toBe(false);
    if (!d.accepted) {
      expect(d.required_minimum_cents).toBe(15000);
      expect(d.message).toMatch(/paid \$100\.00 so far/);
      expect(d.message).toMatch(/at least \$150\.00 now/);
    }
  });
});

describe('decideUpfrontAcceptance — upfront already satisfied', () => {
  const paidUpfront = () => invoice({
    deposit_type: 'percent',
    deposit_amount_cents: 25000,
    prior_paid_cents: 25000,  // upfront already paid in full
  });

  it('accepts any positive payment up to the remaining balance', () => {
    const d = decideUpfrontAcceptance(paidUpfront(), 5000);
    expect(d.accepted).toBe(true);
    if (d.accepted) expect(d.reason).toBe('upfront_satisfied');
  });

  it('accepts a $0.01 micropayment once upfront is cleared', () => {
    const d = decideUpfrontAcceptance(paidUpfront(), 1);
    expect(d.accepted).toBe(true);
  });

  it('still rejects an over-balance payment after upfront is cleared', () => {
    const d = decideUpfrontAcceptance(paidUpfront(), 999_999);
    expect(d.accepted).toBe(false);
    if (!d.accepted) expect(d.reason).toBe('over_balance');
  });
});

describe('decideUpfrontAcceptance — fixed (non-percent) deposit', () => {
  it('applies the same rules with a fixed deposit_amount_cents', () => {
    const inv = invoice({
      deposit_type: 'fixed',
      deposit_amount_cents: 50000,   // $500 fixed deposit
      total_cents: 200000,           // $2,000 total
    });
    expect(decideUpfrontAcceptance(inv, 49999).accepted).toBe(false);
    expect(decideUpfrontAcceptance(inv, 50000).accepted).toBe(true);
    expect(decideUpfrontAcceptance(inv, 200000).accepted).toBe(true);
  });
});

describe('resolveDepositAmountCents', () => {
  it('returns 0 for deposit_type=none regardless of value', () => {
    expect(resolveDepositAmountCents('none', 25, 100000)).toBe(0);
    expect(resolveDepositAmountCents('none', 0, 100000)).toBe(0);
  });

  it('computes percent against the total in cents', () => {
    expect(resolveDepositAmountCents('percent', 25, 100000)).toBe(25000);
    expect(resolveDepositAmountCents('percent', 33.33, 99900)).toBe(33297);  // rounded
  });

  it('clamps percent into [0, 100]', () => {
    expect(resolveDepositAmountCents('percent', 150, 100000)).toBe(100000);
    expect(resolveDepositAmountCents('percent', -5, 100000)).toBe(0);
  });

  it('treats fixed deposit_value as dollars and converts to cents', () => {
    expect(resolveDepositAmountCents('fixed', 500, 200000)).toBe(50000);
    expect(resolveDepositAmountCents('fixed', 2.50, 100000)).toBe(250);
  });

  it('caps a fixed deposit at the invoice total', () => {
    expect(resolveDepositAmountCents('fixed', 9999, 100000)).toBe(100000);
  });

  it('rejects NaN / negative / non-finite inputs as 0', () => {
    expect(resolveDepositAmountCents('percent', Number.NaN, 100000)).toBe(0);
    expect(resolveDepositAmountCents('fixed', -5, 100000)).toBe(0);
    expect(resolveDepositAmountCents('percent', 50, -1)).toBe(0);
  });
});

describe('isUpfrontPaid', () => {
  it('is true when deposit_type=none', () => {
    expect(isUpfrontPaid(invoice({ deposit_type: 'none' }))).toBe(true);
  });

  it('is true when deposit_amount_cents=0 even on percent / fixed types', () => {
    expect(isUpfrontPaid(invoice({ deposit_type: 'percent', deposit_amount_cents: 0 }))).toBe(true);
  });

  it('is false when prior_paid_cents is below the deposit', () => {
    expect(isUpfrontPaid(invoice({
      deposit_type: 'percent',
      deposit_amount_cents: 25000,
      prior_paid_cents: 24999,
    }))).toBe(false);
  });

  it('is true the moment prior_paid_cents reaches the deposit', () => {
    expect(isUpfrontPaid(invoice({
      deposit_type: 'percent',
      deposit_amount_cents: 25000,
      prior_paid_cents: 25000,
    }))).toBe(true);
  });

  it('is true when prior_paid_cents exceeds the deposit', () => {
    expect(isUpfrontPaid(invoice({
      deposit_type: 'fixed',
      deposit_amount_cents: 25000,
      prior_paid_cents: 30000,
    }))).toBe(true);
  });
});
