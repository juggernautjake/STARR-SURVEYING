// worker/src/__tests__/closure-tolerance.test.ts
//
// Unit tests for the shared closure-tolerance classifier.

import { describe, it, expect } from 'vitest';
import {
  classifyClosure,
  mergeThresholds,
  formatRatio,
  DEFAULT_CLOSURE_THRESHOLDS,
  MIN_ACCEPTABLE_FLOOR_RATIO,
} from '../lib/closure-tolerance.js';

describe('classifyClosure — tier boundaries', () => {
  it('classifies 1:20,000 (urban-grade) as excellent', () => {
    const r = classifyClosure(20_000, 1);
    expect(r.tier).toBe('excellent');
    expect(r.passes).toBe(true);
    expect(r.warnNote).toBeNull();
  });

  it('classifies exactly 1:10,000 as excellent (inclusive boundary)', () => {
    const r = classifyClosure(10_000, 1);
    expect(r.tier).toBe('excellent');
  });

  it('classifies 1:7,500 (rural Class B) as acceptable with a warn note', () => {
    const r = classifyClosure(7_500, 1);
    expect(r.tier).toBe('acceptable');
    expect(r.passes).toBe(true);
    expect(r.requiresReview).toBe(false);
    expect(r.warnNote).toContain('1:7,500');
  });

  it('classifies exactly 1:5,000 as acceptable (inclusive boundary)', () => {
    const r = classifyClosure(5_000, 1);
    expect(r.tier).toBe('acceptable');
  });

  it('classifies 1:3,000 as marginal (soft fail; reviewer required)', () => {
    const r = classifyClosure(3_000, 1);
    expect(r.tier).toBe('marginal');
    expect(r.passes).toBe(false);
    expect(r.requiresReview).toBe(true);
    expect(r.blocksReport).toBe(false);
  });

  it('classifies 1:1,000 as poor (hard fail; blocks report)', () => {
    const r = classifyClosure(1_000, 1);
    expect(r.tier).toBe('poor');
    expect(r.passes).toBe(false);
    expect(r.blocksReport).toBe(true);
  });
});

describe('classifyClosure — degenerate inputs', () => {
  it('treats zero error as the best possible closure (excellent, infinite ratio)', () => {
    const r = classifyClosure(5_000, 0);
    expect(r.tier).toBe('excellent');
    expect(r.ratio).toBe(Infinity);
    expect(r.ratioLabel).toBe('1:∞');
  });

  it('treats zero perimeter as poor with an explanatory note', () => {
    const r = classifyClosure(0, 1);
    expect(r.tier).toBe('poor');
    expect(r.passes).toBe(false);
    expect(r.blocksReport).toBe(true);
    expect(r.warnNote).toContain('Perimeter is zero');
  });

  it('treats negative perimeter as poor', () => {
    const r = classifyClosure(-10, 1);
    expect(r.tier).toBe('poor');
  });
});

describe('mergeThresholds — county overrides + safety clamps', () => {
  it('returns defaults when no overrides given', () => {
    expect(mergeThresholds({})).toEqual(DEFAULT_CLOSURE_THRESHOLDS);
  });

  it('applies a county override that loosens within sane bounds', () => {
    const merged = mergeThresholds({ acceptable: 4_000 });
    expect(merged.acceptable).toBe(4_000);
    // marginal default (2_500) is still below the new acceptable
    expect(merged.marginal).toBe(DEFAULT_CLOSURE_THRESHOLDS.marginal);
  });

  it('clamps marginal below the absolute floor', () => {
    const merged = mergeThresholds({ marginal: 1_000 });
    expect(merged.marginal).toBe(MIN_ACCEPTABLE_FLOOR_RATIO);
  });

  it('raises acceptable to match marginal if a county tries to invert them', () => {
    const merged = mergeThresholds({ marginal: 8_000, acceptable: 5_000 });
    expect(merged.marginal).toBe(8_000);
    expect(merged.acceptable).toBe(8_000);   // raised to match
    expect(merged.excellent).toBeGreaterThanOrEqual(8_000);
  });
});

describe('formatRatio', () => {
  it('formats finite ratios with thousands separator', () => {
    expect(formatRatio(12_345)).toBe('1:12,345');
  });

  it('formats infinity', () => {
    expect(formatRatio(Infinity)).toBe('1:∞');
  });

  it('formats non-positive as n/a', () => {
    expect(formatRatio(0)).toBe('n/a');
    expect(formatRatio(-5)).toBe('n/a');
  });
});
