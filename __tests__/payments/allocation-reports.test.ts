// __tests__/payments/allocation-reports.test.ts
//
// Phase-2 Slice 10 (data layer) source-lock for
// lib/payments/allocation-reports.ts.

import { describe, it, expect } from 'vitest';
import {
  revenueByPeriod,
  rollupAllocationsByCategory,
  type AllocationLedgerRow,
} from '@/lib/payments/allocation-reports';
import type { AllocationCategoryInput } from '@/lib/payments/allocation-engine';

interface FullCat extends AllocationCategoryInput {
  label: string;
  color: string | null;
}

const cat = (overrides: Partial<FullCat> = {}): FullCat => ({
  id: 'c-default',
  category_key: 'default',
  label: 'Default',
  color: '#000000',
  target_percent: 0,
  is_active: true,
  sort_order: 100,
  ...overrides,
});

const row = (overrides: Partial<AllocationLedgerRow> = {}): AllocationLedgerRow => ({
  id: 'r-default',
  payment_id: 'p-default',
  category_id: 'c-default',
  amount_cents: 1000,
  allocated_at: '2026-06-21T12:00:00Z',
  ...overrides,
});

describe('rollupAllocationsByCategory — happy path', () => {
  const categories: FullCat[] = [
    cat({ id: 'eq', category_key: 'equipment_supplies', label: 'Equipment',  target_percent: 30, sort_order: 10 }),
    cat({ id: 'sal', category_key: 'employee_salaries', label: 'Salaries',   target_percent: 50, sort_order: 20 }),
    cat({ id: 'sav', category_key: 'savings',           label: 'Savings',    target_percent: 20, sort_order: 30 }),
  ];

  const ledger: AllocationLedgerRow[] = [
    row({ id: '1', category_id: 'eq',  amount_cents: 30000, allocated_at: '2026-06-21T12:00:00Z' }),
    row({ id: '2', category_id: 'sal', amount_cents: 50000, allocated_at: '2026-06-21T12:00:00Z' }),
    row({ id: '3', category_id: 'sav', amount_cents: 20000, allocated_at: '2026-06-21T12:00:00Z' }),
  ];

  it('returns one row per active category, sorted by sort_order', () => {
    const report = rollupAllocationsByCategory(categories, ledger);
    expect(report.rows.map((r) => r.category_key)).toEqual([
      'equipment_supplies',
      'employee_salaries',
      'savings',
    ]);
  });

  it('sums actual_cents per category', () => {
    const report = rollupAllocationsByCategory(categories, ledger);
    expect(report.rows[0]!.actual_cents).toBe(30000);
    expect(report.rows[1]!.actual_cents).toBe(50000);
    expect(report.rows[2]!.actual_cents).toBe(20000);
  });

  it('reports zero variance when actual exactly matches target', () => {
    const report = rollupAllocationsByCategory(categories, ledger);
    for (const r of report.rows) {
      expect(r.variance_cents).toBe(0);
      expect(r.variance_percent).toBe(0);
    }
  });

  it('reports total_revenue_cents + total_percent + total_target_cents', () => {
    const report = rollupAllocationsByCategory(categories, ledger);
    expect(report.total_revenue_cents).toBe(100000);
    expect(report.total_percent).toBe(100);
    expect(report.total_target_cents).toBe(100000);
  });
});

describe('rollupAllocationsByCategory — variance reporting', () => {
  const categories: FullCat[] = [
    cat({ id: 'a', category_key: 'savings',   label: 'Savings',   target_percent: 50, sort_order: 10 }),
    cat({ id: 'b', category_key: 'investing', label: 'Investing', target_percent: 50, sort_order: 20 }),
  ];

  it('flags an under-target category with negative variance', () => {
    // $1000 revenue, savings only got $400 (under target $500).
    const report = rollupAllocationsByCategory(categories, [
      row({ category_id: 'a', amount_cents: 40000 }),
      row({ category_id: 'b', amount_cents: 60000 }),
    ]);
    expect(report.rows[0]!.variance_cents).toBe(-10000);
    expect(report.rows[0]!.variance_percent).toBe(-20);
  });

  it('flags an over-target category with positive variance', () => {
    const report = rollupAllocationsByCategory(categories, [
      row({ category_id: 'a', amount_cents: 60000 }),
      row({ category_id: 'b', amount_cents: 40000 }),
    ]);
    expect(report.rows[0]!.variance_cents).toBe(10000);
    expect(report.rows[0]!.variance_percent).toBe(20);
  });

  it('reports null variance_percent when target is 0', () => {
    const zeroCats: FullCat[] = [
      cat({ id: 'a', category_key: 'unset', label: 'Unset', target_percent: 0, sort_order: 10 }),
    ];
    const report = rollupAllocationsByCategory(zeroCats, [
      row({ category_id: 'a', amount_cents: 5000 }),
    ]);
    expect(report.rows[0]!.variance_percent).toBeNull();
    expect(report.rows[0]!.variance_cents).toBe(5000);
  });

  it('computes share_of_actual as a fraction of total revenue', () => {
    const report = rollupAllocationsByCategory(categories, [
      row({ category_id: 'a', amount_cents: 75000 }),
      row({ category_id: 'b', amount_cents: 25000 }),
    ]);
    expect(report.rows[0]!.share_of_actual).toBeCloseTo(0.75, 5);
    expect(report.rows[1]!.share_of_actual).toBeCloseTo(0.25, 5);
  });

  it('share_of_actual is 0 when there is no revenue', () => {
    const report = rollupAllocationsByCategory(categories, []);
    for (const r of report.rows) expect(r.share_of_actual).toBe(0);
  });
});

describe('rollupAllocationsByCategory — date window filtering', () => {
  const categories: FullCat[] = [
    cat({ id: 'a', category_key: 'savings', label: 'Savings', target_percent: 100, sort_order: 10 }),
  ];

  const ledger: AllocationLedgerRow[] = [
    row({ id: '1', category_id: 'a', amount_cents: 1000, allocated_at: '2026-06-01T00:00:00Z' }),
    row({ id: '2', category_id: 'a', amount_cents: 2000, allocated_at: '2026-06-15T00:00:00Z' }),
    row({ id: '3', category_id: 'a', amount_cents: 3000, allocated_at: '2026-07-01T00:00:00Z' }),
  ];

  it('keeps rows inside the window', () => {
    const report = rollupAllocationsByCategory(categories, ledger, {
      from: '2026-06-10T00:00:00Z',
      to:   '2026-06-30T00:00:00Z',
    });
    expect(report.total_revenue_cents).toBe(2000);
    expect(report.rows[0]!.row_count).toBe(1);
  });

  it('drops rows before the window', () => {
    const report = rollupAllocationsByCategory(categories, ledger, {
      from: '2026-06-30T00:00:00Z',
    });
    expect(report.total_revenue_cents).toBe(3000);
  });

  it('drops rows with unparseable timestamps', () => {
    const bad = [...ledger, row({ id: 'x', category_id: 'a', amount_cents: 9999, allocated_at: 'not-a-date' })];
    const report = rollupAllocationsByCategory(categories, bad);
    expect(report.total_revenue_cents).toBe(6000);  // only the 3 valid rows
  });

  it('returns window: { start, end } in the result', () => {
    const report = rollupAllocationsByCategory(categories, ledger, {
      from: '2026-06-01T00:00:00Z',
      to:   '2026-06-30T00:00:00Z',
    });
    expect(report.window.start).toBe('2026-06-01T00:00:00Z');
    expect(report.window.end).toBe('2026-06-30T00:00:00Z');
  });
});

describe('rollupAllocationsByCategory — inactive category handling', () => {
  const categories: FullCat[] = [
    cat({ id: 'a', category_key: 'active',   label: 'Active',   target_percent: 100, is_active: true,  sort_order: 10 }),
    cat({ id: 'b', category_key: 'archived', label: 'Archived', target_percent: 0,   is_active: false, sort_order: 20 }),
  ];

  it('omits inactive categories by default', () => {
    const report = rollupAllocationsByCategory(categories, []);
    expect(report.rows.map((r) => r.category_key)).toEqual(['active']);
  });

  it('includes inactive categories when include_inactive=true (for historical reports)', () => {
    const report = rollupAllocationsByCategory(categories, [
      row({ category_id: 'b', amount_cents: 5000 }),
    ], { include_inactive: true });
    expect(report.rows.map((r) => r.category_key)).toEqual(['active', 'archived']);
    expect(report.rows[1]!.actual_cents).toBe(5000);
  });
});

describe('revenueByPeriod', () => {
  const ledger: AllocationLedgerRow[] = [
    row({ id: '1', amount_cents: 100, allocated_at: '2026-06-21T08:00:00Z' }),  // Sunday
    row({ id: '2', amount_cents: 200, allocated_at: '2026-06-21T20:00:00Z' }),  // same Sunday
    row({ id: '3', amount_cents: 300, allocated_at: '2026-06-22T10:00:00Z' }),  // Monday → new ISO week
    row({ id: '4', amount_cents: 400, allocated_at: '2026-07-01T00:00:00Z' }),  // new month
    row({ id: '5', amount_cents: 500, allocated_at: '2027-01-01T00:00:00Z' }),  // new year
  ];

  it('buckets by day with 1 row + sum per bucket', () => {
    const days = revenueByPeriod(ledger, 'day');
    expect(days).toHaveLength(4);
    expect(days[0]).toMatchObject({ period_key: '2026-06-21', total_cents: 300, row_count: 2 });
    expect(days[1]).toMatchObject({ period_key: '2026-06-22', total_cents: 300, row_count: 1 });
    expect(days[2]).toMatchObject({ period_key: '2026-07-01', total_cents: 400, row_count: 1 });
    expect(days[3]).toMatchObject({ period_key: '2027-01-01', total_cents: 500, row_count: 1 });
  });

  it('buckets by ISO week (Monday-start)', () => {
    const weeks = revenueByPeriod(ledger, 'week');
    // The Sunday 2026-06-21 falls into the week starting 2026-06-15
    // (the prior Monday). Monday 2026-06-22 starts a new week.
    const keys = weeks.map((w) => w.period_key);
    expect(keys[0]).toBe('2026-06-15');
    expect(keys).toContain('2026-06-22');
  });

  it('buckets by month', () => {
    const months = revenueByPeriod(ledger, 'month');
    expect(months.map((m) => m.period_key)).toEqual(['2026-06', '2026-07', '2027-01']);
    expect(months[0]!.total_cents).toBe(600);
  });

  it('buckets by year', () => {
    const years = revenueByPeriod(ledger, 'year');
    expect(years.map((y) => y.period_key)).toEqual(['2026', '2027']);
    expect(years[0]!.total_cents).toBe(1000);
    expect(years[1]!.total_cents).toBe(500);
  });

  it('respects the from/to window', () => {
    const days = revenueByPeriod(ledger, 'day', {
      from: '2026-06-22T00:00:00Z',
      to:   '2026-07-01T23:59:59Z',
    });
    expect(days.map((d) => d.period_key)).toEqual(['2026-06-22', '2026-07-01']);
  });

  it('drops rows with unparseable timestamps', () => {
    const bad = [...ledger, row({ id: 'x', amount_cents: 9999, allocated_at: 'not-a-date' })];
    const months = revenueByPeriod(bad, 'month');
    expect(months.reduce((s, m) => s + m.total_cents, 0)).toBe(1500);
  });

  it('returns empty array on empty ledger', () => {
    expect(revenueByPeriod([], 'day')).toEqual([]);
  });
});
