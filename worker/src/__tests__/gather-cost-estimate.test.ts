import { describe, it, expect } from 'vitest';
import {
  estimateItemCostUsd,
  assessGatherCost,
  TEXASFILE_USD_PER_PAGE,
} from '../research/gather-cost-estimate.js';

// Plan GATHER_AND_REVIEW_SPLIT B2.2 — estimate the TexasFile cost before buying and warn if it
// exceeds the budget, so the user can proceed within the cap (priority order) or raise it. Pin the
// per-item estimate and the assessment (over-budget + how many items fit).

describe('estimateItemCostUsd', () => {
  it('prices a paid item by typical pages x $1/page', () => {
    expect(TEXASFILE_USD_PER_PAGE).toBe(1);
    expect(estimateItemCostUsd('plat', 'recent', true)).toBe(2);
    expect(estimateItemCostUsd('deed', 'recent', true)).toBe(4);
    expect(estimateItemCostUsd('deed', 'all', true)).toBe(16);
  });

  it('a free map/GIS capture costs $0', () => {
    expect(estimateItemCostUsd('map', 'single', false)).toBe(0);
    expect(estimateItemCostUsd('map', 'single', true)).toBe(0); // map has no pages either way
  });
});

describe('assessGatherCost', () => {
  it('is within budget when the estimate fits', () => {
    const a = assessGatherCost([2, 4], 10); // $6 of $10
    expect(a.overBudget).toBe(false);
    expect(a.estimateUsd).toBe(6);
    expect(a.overageUsd).toBe(0);
    expect(a.coverableCount).toBe(2);
    expect(a.totalCount).toBe(2);
  });

  it('flags over-budget and reports the overage', () => {
    const a = assessGatherCost([4, 4, 16], 10); // $24 of $10
    expect(a.overBudget).toBe(true);
    expect(a.estimateUsd).toBe(24);
    expect(a.overageUsd).toBe(14);
  });

  it('counts how many items fit in priority order within the budget', () => {
    const a = assessGatherCost([4, 4, 16], 10); // 4+4 fit ($8), the $16 does not
    expect(a.coverableCount).toBe(2);
  });

  it('ignores zero-cost (free) items and handles an empty list', () => {
    expect(assessGatherCost([0, 0], 10).estimateUsd).toBe(0);
    expect(assessGatherCost([], 10).overBudget).toBe(false);
  });
});
