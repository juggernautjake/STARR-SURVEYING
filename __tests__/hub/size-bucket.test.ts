// __tests__/hub/size-bucket.test.ts
//
// Coverage for the sizeBucket() mapping. Every supported (w, h) combo
// listed in the widget-grid spec lands in its expected bucket, and the
// edge cases (zero, negative, fractional) clamp safely. Slice 209
// rebalanced thresholds for the 8×8 square-cell grid.

import { describe, it, expect } from 'vitest';
import {
  sizeBucket,
  bucketIsLarger,
  ALL_BUCKETS,
  type SizeBucket,
} from '@/lib/hub/size-bucket';

describe('sizeBucket — documented thresholds (8×8 grid)', () => {
  const expectations: { w: number; h: number; expected: SizeBucket }[] = [
    { w: 1, h: 1, expected: 'tiny' },     // area 1 — single square
    { w: 2, h: 1, expected: 'tiny' },     // area 2
    { w: 2, h: 2, expected: 'small' },    // area 4
    { w: 3, h: 2, expected: 'small' },    // area 6
    { w: 4, h: 2, expected: 'medium' },   // area 8
    { w: 3, h: 3, expected: 'medium' },   // area 9
    { w: 4, h: 3, expected: 'medium' },   // area 12
    { w: 4, h: 4, expected: 'large' },    // area 16
    { w: 6, h: 3, expected: 'large' },    // area 18
    { w: 5, h: 4, expected: 'large' },    // area 20
    { w: 8, h: 3, expected: 'xlarge' },   // area 24
    { w: 6, h: 4, expected: 'xlarge' },   // area 24
    { w: 8, h: 8, expected: 'xlarge' },   // area 64 — full canvas
  ];

  for (const { w, h, expected } of expectations) {
    it(`${w}×${h} → ${expected}`, () => {
      expect(sizeBucket(w, h)).toBe(expected);
    });
  }
});

describe('sizeBucket — boundaries', () => {
  it('area = 2 is the upper bound of tiny', () => {
    expect(sizeBucket(2, 1)).toBe('tiny');
    expect(sizeBucket(3, 1)).not.toBe('tiny');
  });

  it('area = 6 is the upper bound of small', () => {
    expect(sizeBucket(3, 2)).toBe('small');
    expect(sizeBucket(6, 1)).toBe('small');
    expect(sizeBucket(7, 1)).not.toBe('small');
  });

  it('area = 12 is the upper bound of medium', () => {
    expect(sizeBucket(4, 3)).toBe('medium');
    expect(sizeBucket(6, 2)).toBe('medium');
    expect(sizeBucket(13, 1)).not.toBe('medium');
  });

  it('area = 20 is the upper bound of large', () => {
    expect(sizeBucket(4, 4)).toBe('large');
    expect(sizeBucket(5, 4)).toBe('large');
    expect(sizeBucket(7, 3)).toBe('xlarge');
  });

  it('area > 20 is xlarge', () => {
    expect(sizeBucket(8, 3)).toBe('xlarge');
    expect(sizeBucket(100, 100)).toBe('xlarge');
  });
});

describe('sizeBucket — clamps non-positive inputs to 1', () => {
  it('zero w treated as 1', () => {
    expect(sizeBucket(0, 2)).toBe(sizeBucket(1, 2));
  });

  it('negative h treated as 1', () => {
    expect(sizeBucket(3, -5)).toBe(sizeBucket(3, 1));
  });

  it('fractional values are floored', () => {
    expect(sizeBucket(3.9, 1)).toBe(sizeBucket(3, 1));
  });
});

describe('bucketIsLarger', () => {
  it('returns true when first is strictly larger than second', () => {
    expect(bucketIsLarger('medium', 'small')).toBe(true);
    expect(bucketIsLarger('xlarge', 'tiny')).toBe(true);
  });

  it('returns false when equal', () => {
    expect(bucketIsLarger('medium', 'medium')).toBe(false);
  });

  it('returns false when first is smaller', () => {
    expect(bucketIsLarger('small', 'medium')).toBe(false);
  });
});

describe('ALL_BUCKETS ascending order', () => {
  it('lists the 5 buckets in size order', () => {
    expect([...ALL_BUCKETS]).toEqual(['tiny', 'small', 'medium', 'large', 'xlarge']);
  });
});
