// __tests__/payroll/payment-statement.test.ts
//
// The plan's S9b said "move stub generation onto the batch path". Reading both engines showed that
// would produce a document that MISSTATES WAGES: the legacy run withholds flat estimated percentages
// and pays net, while the payout batch withholds nothing and pays gross. Porting the first onto the
// second prints "Federal Tax −$120.00" and a net figure on a document an employee is entitled to,
// while the payment they received was the gross amount.
//
// So these tests pin the opposite property: the statement says what happened and invents nothing.
import { describe, it, expect } from 'vitest';
import { buildPaymentStatement, summarisePayment } from '@/lib/payroll/payment-statement';

describe('an ordinary payment', () => {
  const s = buildPaymentStatement({ total_cents: 100_000, status: 'paid', method: 'ach', paid_at: '2026-08-12T10:00:00Z' });

  it('states earned and paid, and they agree when nothing was held back', () => {
    expect(s.earnedCents).toBe(100_000);
    expect(s.paidCents).toBe(100_000);
    expect(s.recoveredCents).toBe(0);
  });

  it('shows no repayment line when there was no advance', () => {
    expect(s.lines.some((l) => /advance/i.test(l.label))).toBe(false);
  });

  it('reads as paid rather than pending', () => {
    expect(s.isPaid).toBe(true);
    expect(s.lines.some((l) => l.label === 'Paid to you')).toBe(true);
  });
});

describe('it never invents a tax figure', () => {
  const s = buildPaymentStatement({ total_cents: 100_000, status: 'paid' });

  it('has no withholding lines at all', () => {
    // The legacy engine's 12% / 6.2% / 1.45% are estimates its own comments disclaim. On a wage
    // statement an estimate is a wrong number wearing a document's authority.
    const labels = s.lines.map((l) => l.label.toLowerCase()).join(' ');
    for (const word of ['federal', 'state tax', 'social security', 'medicare', 'withheld']) {
      expect(labels, `a statement must not carry a ${word} line`).not.toContain(word);
    }
  });

  it('says out loud that nothing was withheld', () => {
    // Silence would invite the reader to assume tax was taken — and they would discover otherwise
    // from a tax bill.
    expect(s.taxNote).toMatch(/no tax has been withheld/i);
    expect(s.taxNote).toMatch(/W-2|1099/);
  });

  it('the paid figure equals the earned figure — there is no hidden net', () => {
    expect(s.paidCents).toBe(s.earnedCents);
  });
});

describe('a payment that repaid an advance', () => {
  const s = buildPaymentStatement({ total_cents: 100_000, recovered_cents: 20_000, status: 'paid' });

  it('shows all three figures and they reconcile', () => {
    expect(s.earnedCents).toBe(100_000);
    expect(s.recoveredCents).toBe(20_000);
    expect(s.paidCents).toBe(80_000);
    expect(s.earnedCents - s.recoveredCents).toBe(s.paidCents);
  });

  it('shows the repayment as a negative line, so the arithmetic is visible', () => {
    const line = s.lines.find((l) => /advance/i.test(l.label))!;
    expect(line.amountCents).toBe(-20_000);
  });

  it('calls it a repayment, never a deduction', () => {
    // An advance is money already handed over. Calling it a deduction implies it was taken from
    // earnings the person never received — which is the reading that starts an argument.
    const line = s.lines.find((l) => /advance/i.test(l.label))!;
    expect(line.label).toMatch(/repaid/i);
    expect(line.note).toMatch(/not a deduction/i);
    expect(s.taxNote).toMatch(/not a tax deduction/i);
  });
});

describe('money that has not actually moved', () => {
  it('says "to be paid" while the payout is only prepared', () => {
    const s = buildPaymentStatement({ total_cents: 50_000, status: 'pending' });
    expect(s.isPaid).toBe(false);
    expect(s.lines.some((l) => l.label === 'To be paid to you')).toBe(true);
  });

  it('explains that an `account` payment has not left the firm', () => {
    // The one method where "paid" does not mean the money moved — it moved the obligation from
    // "we owe you for hours" to "we hold this for you".
    const s = buildPaymentStatement({ total_cents: 50_000, status: 'paid', method: 'account' });
    const line = s.lines.find((l) => /paid to you/i.test(l.label))!;
    expect(line.note).toMatch(/leaves when you withdraw/i);
  });
});

describe('the one-line summary', () => {
  it('names the amount and the date for a settled payment', () => {
    const line = summarisePayment({ total_cents: 100_000, status: 'paid', paid_at: '2026-08-12T10:00:00Z' });
    expect(line).toContain('$1000.00');
    expect(line).toContain('2026-08-12');
  });

  it('does not claim a prepared payout has been sent', () => {
    const line = summarisePayment({ total_cents: 100_000, status: 'pending' });
    expect(line).toMatch(/not yet sent/i);
    expect(line).not.toMatch(/\bpaid on\b/);
  });

  it('explains a smaller figure rather than leaving it unexplained', () => {
    // Somebody expecting $1,000 who sees $800 needs the reason on the same line as the number.
    const line = summarisePayment({ total_cents: 100_000, recovered_cents: 20_000, status: 'paid' });
    expect(line).toContain('$800.00');
    expect(line).toContain('$1000.00');
    expect(line).toMatch(/pay advance/i);
  });
});

describe('bad data', () => {
  it('never reports a negative payment', () => {
    const s = buildPaymentStatement({ total_cents: 5_000, recovered_cents: 9_000 });
    expect(s.paidCents).toBe(0);
  });

  it('survives missing figures without printing NaN', () => {
    const s = buildPaymentStatement({});
    expect(s.earnedCents).toBe(0);
    expect(s.paidCents).toBe(0);
    expect(summarisePayment({})).not.toContain('NaN');
  });
});
