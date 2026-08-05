// __tests__/payroll/owed.test.ts
//
// "How much is owed since the last payout." The interesting cases are the ones a date-window
// implementation gets wrong.

import { describe, it, expect } from 'vitest';
import { computeOwed, type ApprovedEntry } from '@/lib/payroll/owed';

const entry = (over: Partial<ApprovedEntry> = {}): ApprovedEntry => ({
  id: 'e1',
  logDate: '2026-08-03',
  hours: 8,
  payDollars: 200,
  ...over,
});

describe('computeOwed — the balance', () => {
  it('is everything approved minus everything paid', () => {
    const o = computeOwed({
      approved: [entry({ payDollars: 200 }), entry({ id: 'e2', payDollars: 150 })],
      paidCents: [20_000],
    });
    expect(o.earnedCents).toBe(35_000);
    expect(o.paidCents).toBe(20_000);
    expect(o.owedCents).toBe(15_000);
  });

  it('pays a late-logged entry that predates the last payout', () => {
    // THE CASE A DATE WINDOW LOSES. Somebody forgets Thursday and logs it the week after; the entry
    // is dated before a payout that has already gone out. A window drops it and says nothing.
    const o = computeOwed({
      approved: [
        entry({ id: 'paid-for', logDate: '2026-07-01', payDollars: 200 }),
        entry({ id: 'late', logDate: '2026-07-02', payDollars: 160 }),
      ],
      paidCents: [20_000],
      lastPayoutAt: '2026-07-15T00:00:00Z',
    });
    expect(o.owedCents).toBe(16_000);
  });

  it('counts nothing twice when the same amount is earned and paid repeatedly', () => {
    const o = computeOwed({
      approved: [entry({ payDollars: 100 }), entry({ id: 'e2', payDollars: 100 })],
      paidCents: [10_000, 10_000],
    });
    expect(o.owedCents).toBe(0);
  });

  it('reports an overpayment rather than clamping it to zero', () => {
    // Clamping hides the one case that needs a human — an advance recorded as a payout, or a
    // correction that went the wrong way.
    const o = computeOwed({ approved: [entry({ payDollars: 100 })], paidCents: [25_000] });
    expect(o.owedCents).toBe(-15_000);
    expect(o.statement).toMatch(/Overpaid by \$150\.00/);
    expect(o.statement).toMatch(/needs a look/);
  });
});

describe('computeOwed — dollars in, cents out', () => {
  it('converts dollars to cents exactly once', () => {
    // Hours carry dollars, payouts carry cents. Mixing them is a 100x error in whichever direction
    // nobody checks.
    const o = computeOwed({ approved: [entry({ payDollars: 190 })], paidCents: [] });
    expect(o.earnedCents).toBe(19_000);
    expect(o.owedCents).toBe(19_000);
  });

  it('rounds fractional cents rather than accumulating float dust', () => {
    const o = computeOwed({
      approved: [entry({ payDollars: 33.333 }), entry({ id: 'e2', payDollars: 33.333 })],
      paidCents: [],
    });
    expect(o.earnedCents).toBe(6_666);   // 3333 + 3333
  });
});

describe('computeOwed — hours nobody has priced', () => {
  it('keeps them out of the money but not out of sight', () => {
    const o = computeOwed({
      approved: [entry({ payDollars: 200 }), entry({ id: 'e2', hours: 6, payDollars: null })],
      paidCents: [],
    });
    expect(o.owedCents).toBe(20_000);
    expect(o.undecidedHours).toBe(6);
    expect(o.statement).toMatch(/6h are approved but not yet priced/);
    expect(o.statement).toMatch(/not in that total/);
  });

  it('counts a decision’s partially-undecided hours too', () => {
    // The approver priced 6 of 8 hours and left 2 open.
    const o = computeOwed({
      approved: [entry({ hours: 8, payDollars: 150, undecidedHours: 2 })],
      paidCents: [],
    });
    expect(o.owedCents).toBe(15_000);
    expect(o.undecidedHours).toBe(2);
  });

  it('does not double-count an entry that is both unpriced and marked undecided', () => {
    const o = computeOwed({
      approved: [entry({ hours: 8, payDollars: null, undecidedHours: 8 })],
      paidCents: [],
    });
    expect(o.undecidedHours).toBe(8);
  });
});

describe('computeOwed — the sentence', () => {
  it('names the last payout date when there was one', () => {
    const o = computeOwed({
      approved: [entry({ payDollars: 200 })],
      paidCents: [],
      lastPayoutAt: '2026-07-15T12:00:00Z',
    });
    expect(o.statement).toContain('since the last payout on 2026-07-15');
  });

  it('does not imply a payout that never happened', () => {
    // "since your last payout" when there has never been one is a small lie that makes somebody
    // hunt for a payment they never received.
    const o = computeOwed({ approved: [entry({ payDollars: 200 })], paidCents: [] });
    expect(o.statement).toMatch(/no payout has been made/i);
    expect(o.statement).not.toMatch(/since the last payout/);
  });

  it('distinguishes "paid up" from "nothing approved"', () => {
    expect(computeOwed({ approved: [], paidCents: [] }).statement).toMatch(/Nothing approved yet/);
    expect(
      computeOwed({ approved: [entry({ payDollars: 100 })], paidCents: [10_000] }).statement,
    ).toMatch(/Fully paid up/);
  });
});

describe('computeOwed — bad input', () => {
  it('ignores entries with no usable hours', () => {
    const o = computeOwed({
      approved: [entry(), entry({ id: 'z', hours: 0 }), entry({ id: 'n', hours: -3 })],
      paidCents: [],
    });
    expect(o.entryCount).toBe(1);
  });

  it('survives a NaN payout amount without producing a NaN balance', () => {
    const o = computeOwed({ approved: [entry({ payDollars: 100 })], paidCents: [Number.NaN, 5_000] });
    expect(o.paidCents).toBe(5_000);
    expect(o.owedCents).toBe(5_000);
  });

  it('reports the oldest unpaid date so the label has something true to point at', () => {
    const o = computeOwed({
      approved: [entry({ logDate: '2026-08-03' }), entry({ id: 'old', logDate: '2026-06-01' })],
      paidCents: [],
    });
    expect(o.oldestUnpaidDate).toBe('2026-06-01');
  });
});
