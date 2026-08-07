// __tests__/finances/compare-periods.test.ts
//
// Owner ask: *"super robust summaries and results and comparisons… exactly how much we are spending
// month to month."* A total for July answers nothing on its own — $840 is alarming or excellent
// entirely depending on June.
//
// Three things here are easy to get wrong in ways that look fine on screen: a zero baseline, the
// length of the comparison window, and which direction of a change counts as good news.

import { describe, it, expect } from 'vitest';
import {
  compareMetric,
  comparePeriods,
  perUnit,
  previousWindow,
  type PeriodTotals,
} from '@/lib/finances/compare-periods';

const totals = (o: Partial<PeriodTotals> = {}): PeriodTotals => ({
  revenue_cents: 0, payouts_cents: 0, expenses_cents: 0, ad_spend_cents: 0,
  net_cents: 0, leads: 0, jobs_won: 0, ...o,
});

describe('a single metric, period over period', () => {
  it('reports growth as a signed delta and a fraction', () => {
    const m = compareMetric(12_500, 10_000, true);
    expect(m.delta).toBe(2_500);
    expect(m.pct).toBeCloseTo(0.25);
  });

  it('reports a decline with a negative delta', () => {
    const m = compareMetric(8_000, 10_000);
    expect(m.delta).toBe(-2_000);
    expect(m.pct).toBeCloseTo(-0.2);
  });

  it('returns null rather than Infinity against a zero baseline', () => {
    // A jump from nothing to something is not a percentage, it is a beginning. Infinity renders as
    // "∞%" and dividing anyway gives NaN — both look like bugs to whoever is reading the screen.
    const m = compareMetric(5_000, 0);
    expect(m.pct).toBeNull();
    expect(m.delta).toBe(5_000);
  });

  it('survives NaN inputs rather than propagating them into a total', () => {
    expect(compareMetric(Number.NaN, 100).current).toBe(0);
    expect(compareMetric(100, Number.NaN).previous).toBe(0);
  });
});

describe('per-unit costs', () => {
  it('divides cents by units', () => {
    expect(perUnit(50_000, 10)).toBe(5_000);
  });

  it('returns null on a zero denominator rather than 0', () => {
    // 0 would render as "$0.00 per lead", which reads as "leads are free" — the opposite of the truth
    // when the real situation is money spent and no leads at all.
    expect(perUnit(50_000, 0)).toBeNull();
    expect(perUnit(50_000, -3)).toBeNull();
  });
});

describe('a whole period against the one before', () => {
  it('compares every stream', () => {
    const c = comparePeriods(
      totals({ revenue_cents: 500_000, ad_spend_cents: 84_000, leads: 14, jobs_won: 3, net_cents: 416_000 }),
      totals({ revenue_cents: 400_000, ad_spend_cents: 60_000, leads: 10, jobs_won: 2, net_cents: 340_000 }),
    );
    expect(c.revenue.delta).toBe(100_000);
    expect(c.ad_spend.delta).toBe(24_000);
    expect(c.leads.delta).toBe(4);
    expect(c.cost_per_job!.current).toBe(28_000);   // $840 / 3 jobs
    expect(c.cost_per_job!.previous).toBe(30_000);  // $600 / 2 jobs
    expect(c.cost_per_job!.delta).toBe(-2_000);     // cheaper per job despite spending more
  });

  it('does not call rising ad spend bad news', () => {
    // Spending more is good if cost per job held. Marking it "bad" paints a successful scale-up red,
    // which is how a dashboard teaches somebody to stop advertising.
    const c = comparePeriods(totals({ ad_spend_cents: 200_000 }), totals({ ad_spend_cents: 50_000 }));
    expect(c.ad_spend.higherIsBetter).toBeNull();
    expect(c.revenue.higherIsBetter).toBe(true);
    expect(c.cost_per_job).toBeNull(); // no jobs either period
  });

  it('marks a rising cost per job as bad news', () => {
    const c = comparePeriods(
      totals({ ad_spend_cents: 100_000, jobs_won: 2 }),
      totals({ ad_spend_cents: 100_000, jobs_won: 4 }),
    );
    expect(c.cost_per_job!.higherIsBetter).toBe(false);
    expect(c.cost_per_job!.delta).toBeGreaterThan(0);
  });

  it('omits a per-unit comparison when either period has no denominator', () => {
    // Comparing against a period with no leads would invent a baseline of 0 and report an infinite
    // rise in costs that never happened.
    const c = comparePeriods(totals({ ad_spend_cents: 50_000, leads: 5 }), totals({ leads: 0 }));
    expect(c.cost_per_lead).toBeNull();
  });
});

describe('choosing the comparison window', () => {
  it('compares a whole month against the whole previous month', () => {
    // Calendar-aware, not "the 31 days before". Otherwise February always looks like a collapse and a
    // 31-day month always looks like growth.
    expect(previousWindow('2026-07-01', '2026-07-31')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('handles the January boundary', () => {
    expect(previousWindow('2026-01-01', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('handles February in a leap year', () => {
    expect(previousWindow('2028-03-01', '2028-03-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('falls back to an equal-length span for an arbitrary range', () => {
    // 7 days ending the day before the range starts.
    expect(previousWindow('2026-07-08', '2026-07-14')).toEqual({ from: '2026-07-01', to: '2026-07-07' });
  });

  it('handles a single day', () => {
    expect(previousWindow('2026-07-15', '2026-07-15')).toEqual({ from: '2026-07-14', to: '2026-07-14' });
  });
});
