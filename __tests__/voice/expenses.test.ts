// __tests__/voice/expenses.test.ts
//
// Every number here ends up on a tax return. The tests are written around the specific ways a
// first-year sole proprietor gets one wrong: overstating a deduction, counting unpaid invoices as
// income, and recomputing a prior year at today's mileage rate.

import { describe, expect, it } from 'vitest';

import {
  businessShareCents,
  computeProfitAndLoss,
  currentYearDeductionCents,
  mileageDeductionCents,
  mileageRateFor,
  summarizeExpenses,
  type ExpenseLike,
} from '@/lib/voice/expenses';

const expense = (over: Partial<ExpenseLike> = {}): ExpenseLike => ({
  amountCents: 10000,
  businessPct: 100,
  ...over,
});

describe('businessShareCents', () => {
  it('applies an integer percentage without holding a float', () => {
    // $1,499.99 laptop at 60% business use.
    expect(businessShareCents({ amountCents: 149999, businessPct: 60 })).toBe(89999);
  });

  it('clamps a percentage outside 0–100', () => {
    expect(businessShareCents(expense({ businessPct: 150 }))).toBe(10000);
    expect(businessShareCents(expense({ businessPct: -20 }))).toBe(0);
  });

  it('defaults to the whole amount when no percentage is given', () => {
    expect(businessShareCents({ amountCents: 10000 } as ExpenseLike)).toBe(10000);
  });
});

describe('currentYearDeductionCents', () => {
  it('deducts an ordinary expense in full at its business share', () => {
    expect(currentYearDeductionCents(expense({ amountCents: 20000, businessPct: 50 })).cents).toBe(10000);
  });

  it('deducts NOTHING this year for a capital purchase, and says why', () => {
    // Returning the full amount for a $900 microphone overstates the year's deduction by the entire
    // purchase — the exact error that produces an amended return.
    const out = currentYearDeductionCents(expense({ amountCents: 90000, isCapital: true }));
    expect(out.cents).toBe(0);
    expect(out.note).toMatch(/depreciation|over time|§179/i);
  });
});

describe('summarizeExpenses', () => {
  const list = [
    expense({ amountCents: 20000, businessPct: 100, category: 'equipment' }),
    expense({ amountCents: 90000, businessPct: 100, category: 'equipment', isCapital: true }),
    expense({ amountCents: 12000, businessPct: 50, category: 'home_office' }),
  ];

  it('separates what is deductible now from what is merely spent', () => {
    const s = summarizeExpenses(list);
    expect(s.totalCents).toBe(122000);
    expect(s.businessCents).toBe(20000 + 90000 + 6000);
    // The capital item is business spend but not a deduction this year.
    expect(s.deductibleNowCents).toBe(26000);
    expect(s.capitalCents).toBe(90000);
  });

  it('counts every expense exactly once', () => {
    expect(summarizeExpenses(list).count).toBe(3);
    expect(summarizeExpenses(list).byCategory.reduce((n, c) => n + c.count, 0)).toBe(3);
  });

  it('returns zeroes rather than NaN for an empty year', () => {
    const s = summarizeExpenses([]);
    expect(s.totalCents).toBe(0);
    expect(s.businessCents).toBe(0);
    expect(s.byCategory).toEqual([]);
  });
});

describe('computeProfitAndLoss', () => {
  it('counts CASH RECEIVED as income and reports invoiced money separately', () => {
    // A freelancer who counts unpaid invoices as income spends money that has not arrived.
    const pl = computeProfitAndLoss({
      paymentsReceivedCents: 500000,
      invoicedOutstandingCents: 300000,
      expenses: [],
    });
    expect(pl.incomeCents).toBe(500000);
    expect(pl.outstandingCents).toBe(300000);
    expect(pl.netCents).toBe(500000);
  });

  it('sets aside 30% by default', () => {
    const pl = computeProfitAndLoss({ paymentsReceivedCents: 500000, invoicedOutstandingCents: 0, expenses: [] });
    expect(pl.setAsideRatePct).toBe(30);
    expect(pl.estimatedTaxSetAsideCents).toBe(150000);
  });

  it('never tells him to set aside money on a loss', () => {
    // A negative set-aside renders as an instruction to withdraw money.
    const pl = computeProfitAndLoss({
      paymentsReceivedCents: 10000,
      invoicedOutstandingCents: 0,
      expenses: [expense({ amountCents: 90000 })],
    });
    expect(pl.netCents).toBeLessThan(0);
    expect(pl.estimatedTaxSetAsideCents).toBe(0);
  });

  it('clamps an absurd set-aside rate', () => {
    const pl = computeProfitAndLoss({
      paymentsReceivedCents: 100000,
      invoicedOutstandingCents: 0,
      expenses: [],
      setAsideRatePct: 200,
    });
    expect(pl.setAsideRatePct).toBe(60);
  });
});

describe('mileage', () => {
  it('uses the rate for the year the trip happened', () => {
    // Recomputing history at the current rate silently rewrites a filed return's numbers.
    expect(mileageRateFor(2025).centsPerMile).not.toBe(mileageRateFor(2026).centsPerMile);
    expect(mileageRateFor(2025).isEstimate).toBe(false);
  });

  it('flags a year it does not know rather than pretending to be authoritative', () => {
    const r = mileageRateFor(2099);
    expect(r.isEstimate).toBe(true);
    expect(r.centsPerMile).toBeGreaterThan(0);
  });

  it('converts miles to cents at that year\'s rate', () => {
    expect(mileageDeductionCents(100, 2026)).toBe(7200);
    expect(mileageDeductionCents(0, 2026)).toBe(0);
  });

  it('treats negative or unparseable mileage as zero', () => {
    expect(mileageDeductionCents(-40, 2026)).toBe(0);
    expect(mileageDeductionCents(NaN, 2026)).toBe(0);
  });
});
