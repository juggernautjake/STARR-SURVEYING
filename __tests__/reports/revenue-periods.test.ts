// __tests__/reports/revenue-periods.test.ts
//
// hub-widget-excellence-11 — locks the pure period-window + revenue-sum
// helpers behind the new /api/admin/reports?metric=monthly-revenue
// endpoint (which makes the previously-broken monthly-revenue widget
// actually render data).

import { describe, it, expect } from 'vitest';
import { periodWindows, sumRevenue } from '@/lib/reports/revenue-periods';

const NOW = Date.UTC(2026, 4, 20, 15, 0, 0); // 2026-05-20T15:00Z

describe('periodWindows', () => {
  it('month: current = month-start→now, previous = full prior month', () => {
    const w = periodWindows('month', NOW);
    expect(w.current.from).toBe('2026-05-01T00:00:00.000Z');
    expect(w.current.to).toBe('2026-05-20T15:00:00.000Z');
    expect(w.previous.from).toBe('2026-04-01T00:00:00.000Z');
    expect(w.previous.to).toBe('2026-05-01T00:00:00.000Z');
  });

  it('quarter: current = quarter-start→now, previous = full prior quarter', () => {
    const w = periodWindows('quarter', NOW); // May → Q2 (Apr-Jun)
    expect(w.current.from).toBe('2026-04-01T00:00:00.000Z');
    expect(w.previous.from).toBe('2026-01-01T00:00:00.000Z');
    expect(w.previous.to).toBe('2026-04-01T00:00:00.000Z');
  });

  it('quarter Q1 rolls the previous quarter into the prior year', () => {
    const w = periodWindows('quarter', Date.UTC(2026, 1, 10)); // Feb → Q1
    expect(w.current.from).toBe('2026-01-01T00:00:00.000Z');
    expect(w.previous.from).toBe('2025-10-01T00:00:00.000Z');
    expect(w.previous.to).toBe('2026-01-01T00:00:00.000Z');
  });

  it('year: current = Jan 1→now, previous = the whole prior year', () => {
    const w = periodWindows('year', NOW);
    expect(w.current.from).toBe('2026-01-01T00:00:00.000Z');
    expect(w.previous.from).toBe('2025-01-01T00:00:00.000Z');
    expect(w.previous.to).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('sumRevenue', () => {
  it('sums non-refund payment amounts', () => {
    expect(sumRevenue([
      { amount: 1000, payment_type: 'payment' },
      { amount: 500, payment_type: 'deposit' },
      { amount: 200, payment_type: 'refund' }, // excluded
    ])).toBe(1500);
  });

  it('tolerates missing/non-numeric amounts', () => {
    expect(sumRevenue([
      { amount: null, payment_type: 'payment' },
      { amount: 250 },
      {},
    ])).toBe(250);
  });

  it('is 0 for no payments', () => {
    expect(sumRevenue([])).toBe(0);
  });
});
