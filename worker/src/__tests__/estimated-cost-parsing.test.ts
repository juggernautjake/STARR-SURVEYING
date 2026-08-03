// A budget guard that read "$6-12" as $612.
//
// PurchaseRecommender writes its estimates as ranges — `$${estCost}-${estCost * 2}` and `'$4-8'`.
// The budget check stripped every non-digit and parsed the remainder, which glued the two ends of
// the range together:
//
//     "$6-12"  -> 612        "$4-8"  -> 48        "$12-24" -> 1224
//
// Against the default $25 budget every recommendation was then unaffordable, so Phase 9 bought
// nothing and logged "Budget exceeded — skipping <instrument>". That is the dangerous part: the
// failure wore the costume of a deliberate spending limit. Nothing looked broken, the report was
// internally consistent, and the only symptom was a research run that never bought the document it
// had just finished arguing was the highest-ROI purchase available.

import { describe, it, expect } from 'vitest';
import { parseEstimatedCost } from '../services/document-purchase-orchestrator.js';

describe('a cost range is two numbers, not one long one', () => {
  it('does not concatenate the ends of a range', () => {
    expect(parseEstimatedCost('$6-12')).not.toBe(612);
    expect(parseEstimatedCost('$4-8')).not.toBe(48);
    expect(parseEstimatedCost('$12-24')).not.toBe(1224);
  });

  it('takes the high end, because this guards a spend that has not happened yet', () => {
    expect(parseEstimatedCost('$6-12')).toBe(12);
    expect(parseEstimatedCost('$4-8')).toBe(8);
    expect(parseEstimatedCost('$12-24')).toBe(24);
  });

  it('reads a single figure unchanged', () => {
    expect(parseEstimatedCost('$3')).toBe(3);
    expect(parseEstimatedCost('$1.50')).toBe(1.5);
  });

  it('handles decimals on both ends', () => {
    // The old reading turned this into 1.503.
    expect(parseEstimatedCost('$1.50-3.00')).toBe(3);
  });

  it('falls back only when there is no number at all', () => {
    expect(parseEstimatedCost('unknown')).toBe(5);
    expect(parseEstimatedCost('')).toBe(5);
    expect(parseEstimatedCost(undefined)).toBe(5);
    expect(parseEstimatedCost('unknown', 0)).toBe(0);
  });

  it('leaves every recommender estimate inside a normal budget', () => {
    // The real strings PurchaseRecommender emits. If any of these exceeds a $25 budget the whole
    // phase silently buys nothing, which is how this went unnoticed.
    for (const estimate of ['$4-8', '$6-12', '$8-16', '$10-20']) {
      expect(parseEstimatedCost(estimate), estimate).toBeLessThanOrEqual(25);
    }
  });
});
