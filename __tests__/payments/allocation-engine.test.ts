// __tests__/payments/allocation-engine.test.ts
//
// Phase-2 Slice 8 source-lock for lib/payments/allocation-engine.ts.
//
// Critical invariants:
//   1. SUM of allocated amounts ALWAYS equals the input (when valid).
//      The ledger has to balance.
//   2. The rounding remainder lands on the LAST active category by
//      sort_order — not the first — so pennies go to "Owner's Draw"
//      / "Healthcare" / etc., not "Equipment & Supplies".
//   3. Inactive or zero-percent categories never appear in the output.
//   4. Percentages summing to ≠ 100 trigger valid=false so the route
//      handler refuses to write the rows.

import { describe, it, expect } from 'vitest';
import {
  allocatePayment,
  type AllocationCategoryInput,
} from '@/lib/payments/allocation-engine';

const cat = (overrides: Partial<AllocationCategoryInput> = {}): AllocationCategoryInput => ({
  id: 'cat-default',
  category_key: 'default',
  target_percent: 0,
  is_active: true,
  sort_order: 100,
  ...overrides,
});

describe('allocatePayment — happy path (sums to 100%)', () => {
  it('splits a clean $1000 across two 50/50 categories with no remainder', () => {
    const result = allocatePayment(100000, [
      cat({ id: 'a', category_key: 'savings',     target_percent: 50, sort_order: 10 }),
      cat({ id: 'b', category_key: 'investing',   target_percent: 50, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.allocated_cents).toBe(100000);
    expect(result.unallocated_cents).toBe(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ category_id: 'a', category_key: 'savings',   amount_cents: 50000 });
    expect(result.rows[1]).toEqual({ category_id: 'b', category_key: 'investing', amount_cents: 50000 });
  });

  it('pushes the rounding remainder onto the LAST active category by sort_order', () => {
    // $123.45 (12345¢) split 33/33/34 → 4070/4072/4203 with the last
    // category eating the +3¢ remainder.
    const result = allocatePayment(12345, [
      cat({ id: 'a', category_key: 'equip',  target_percent: 33, sort_order: 10 }),
      cat({ id: 'b', category_key: 'travel', target_percent: 33, sort_order: 20 }),
      cat({ id: 'c', category_key: 'salary', target_percent: 34, sort_order: 30 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.allocated_cents).toBe(12345);
    expect(result.rows[0]!.amount_cents).toBe(Math.floor(12345 * 33 / 100));   // 4073
    expect(result.rows[1]!.amount_cents).toBe(Math.floor(12345 * 33 / 100));   // 4073
    expect(result.rows[2]!.amount_cents).toBe(12345 - 4073 - 4073);            // last absorbs
    expect(result.rows[2]!.category_key).toBe('salary');
  });

  it('handles a complex multi-category split with rounding', () => {
    // 100¢ across 5 categories with mixed percentages summing to 100
    const result = allocatePayment(100, [
      cat({ id: '1', category_key: 'a', target_percent: 17.5, sort_order: 10 }),
      cat({ id: '2', category_key: 'b', target_percent: 17.5, sort_order: 20 }),
      cat({ id: '3', category_key: 'c', target_percent: 20,   sort_order: 30 }),
      cat({ id: '4', category_key: 'd', target_percent: 20,   sort_order: 40 }),
      cat({ id: '5', category_key: 'e', target_percent: 25,   sort_order: 50 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.allocated_cents).toBe(100);
    // Sum exactly matches input
    expect(result.rows.reduce((s, r) => s + r.amount_cents, 0)).toBe(100);
  });

  it('handles a 100%-single-category split with no rounding', () => {
    const result = allocatePayment(99999, [
      cat({ id: 'sole', category_key: 'savings', target_percent: 100, sort_order: 10 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.amount_cents).toBe(99999);
  });
});

describe('allocatePayment — filters out inactive / zero-percent categories', () => {
  const cats: AllocationCategoryInput[] = [
    cat({ id: 'a', category_key: 'savings',   target_percent: 60, is_active: true,  sort_order: 10 }),
    cat({ id: 'b', category_key: 'investing', target_percent: 40, is_active: true,  sort_order: 20 }),
    cat({ id: 'c', category_key: 'archived',  target_percent: 99, is_active: false, sort_order: 30 }),
    cat({ id: 'd', category_key: 'zero',      target_percent: 0,  is_active: true,  sort_order: 40 }),
  ];

  it('inactive categories never appear in the output', () => {
    const result = allocatePayment(100000, cats);
    expect(result.rows.find((r) => r.category_key === 'archived')).toBeUndefined();
  });

  it('zero-percent active categories never appear in the output', () => {
    const result = allocatePayment(100000, cats);
    expect(result.rows.find((r) => r.category_key === 'zero')).toBeUndefined();
  });

  it('total_percent reflects ONLY active + non-zero categories', () => {
    const result = allocatePayment(100000, cats);
    expect(result.total_percent).toBe(100);
    expect(result.valid).toBe(true);
  });
});

describe('allocatePayment — input validation', () => {
  const cats = [
    cat({ id: 'a', category_key: 'savings',   target_percent: 50, sort_order: 10 }),
    cat({ id: 'b', category_key: 'investing', target_percent: 50, sort_order: 20 }),
  ];

  it('rejects zero / negative amounts', () => {
    expect(allocatePayment(0, cats).valid).toBe(false);
    expect(allocatePayment(-100, cats).valid).toBe(false);
  });

  it('rejects NaN + Infinity', () => {
    expect(allocatePayment(Number.NaN, cats).valid).toBe(false);
    expect(allocatePayment(Number.POSITIVE_INFINITY, cats).valid).toBe(false);
  });

  it('floors fractional cents', () => {
    const result = allocatePayment(100.7, cats);
    expect(result.valid).toBe(true);
    expect(result.allocated_cents).toBe(100);  // floored
  });
});

describe('allocatePayment — config errors (percentages ≠ 100)', () => {
  it('reports unallocated when percentages sum to LESS than 100', () => {
    const result = allocatePayment(100000, [
      cat({ id: 'a', category_key: 'savings',   target_percent: 40, sort_order: 10 }),
      cat({ id: 'b', category_key: 'investing', target_percent: 30, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.total_percent).toBe(70);
    expect(result.unallocated_cents).toBeGreaterThan(0);
    expect(result.rationale).toMatch(/70%/);
    expect(result.rationale).toMatch(/need 100%/);
  });

  it('reports invalid when percentages sum to MORE than 100', () => {
    const result = allocatePayment(100000, [
      cat({ id: 'a', category_key: 'savings',   target_percent: 80, sort_order: 10 }),
      cat({ id: 'b', category_key: 'investing', target_percent: 80, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.total_percent).toBe(160);
    expect(result.rationale).toMatch(/160%/);
  });

  it('returns empty rows when there are no active categories', () => {
    const result = allocatePayment(100000, [
      cat({ id: 'a', category_key: 'archived', target_percent: 100, is_active: false }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.rows).toHaveLength(0);
    expect(result.unallocated_cents).toBe(100000);
    expect(result.rationale).toMatch(/no active categories/);
  });
});

describe('allocatePayment — the books-balance invariant', () => {
  it('SUM(amount_cents) === input amount for every valid allocation', () => {
    // Sweep across a bunch of amounts + category distributions
    const distributions: Array<{ percents: number[]; }> = [
      { percents: [100] },
      { percents: [50, 50] },
      { percents: [33, 33, 34] },
      { percents: [10, 20, 30, 40] },
      { percents: [12.5, 12.5, 25, 25, 25] },
      { percents: [1, 99] },
      { percents: [99.9, 0.1] },
    ];
    const amounts = [1, 100, 99, 12345, 99999, 1000000, 7777];
    for (const { percents } of distributions) {
      const cats = percents.map((p, i) => cat({
        id: `c${i}`,
        category_key: `c${i}`,
        target_percent: p,
        sort_order: (i + 1) * 10,
      }));
      for (const amount of amounts) {
        const result = allocatePayment(amount, cats);
        if (!result.valid) continue;
        const total = result.rows.reduce((s, r) => s + r.amount_cents, 0);
        expect(total).toBe(amount);
      }
    }
  });
});
