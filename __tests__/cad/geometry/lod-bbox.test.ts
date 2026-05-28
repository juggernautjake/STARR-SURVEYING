// __tests__/cad/geometry/lod-bbox.test.ts
//
// Three pure helpers underpin the CAD viewport-culling pipeline:
//   * isEmptyBBox — drop features that don't have concrete geometry yet
//   * bboxesOverlap — feature-vs-viewport rejection test (the hot path)
//   * expandBBox — pre-pad the viewport so features just off-screen
//     stay rendered through small pans without popping
//
// Bugs here either drop visible features (rendering hole) or keep
// every feature in the scene (frame-rate cliff), both very visible
// to the user. Pinning the math.

import { describe, it, expect } from 'vitest';
import {
  isEmptyBBox,
  bboxesOverlap,
  expandBBox,
  type BoundingBox,
} from '@/lib/cad/geometry/lod';

const bbox = (minX: number, minY: number, maxX: number, maxY: number): BoundingBox => ({
  minX, minY, maxX, maxY,
});

describe('isEmptyBBox', () => {
  it('returns false for a valid non-degenerate bbox', () => {
    expect(isEmptyBBox(bbox(0, 0, 10, 10))).toBe(false);
  });

  it('returns true when min > max on x (inverted)', () => {
    expect(isEmptyBBox(bbox(10, 0, 5, 10))).toBe(true);
  });

  it('returns true when min > max on y (inverted)', () => {
    expect(isEmptyBBox(bbox(0, 10, 10, 5))).toBe(true);
  });

  it('returns true for the canonical "initial" infinity bbox', () => {
    expect(isEmptyBBox({
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    })).toBe(true);
  });

  it('returns true if any edge is NaN', () => {
    expect(isEmptyBBox({ minX: NaN, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
    expect(isEmptyBBox({ minX: 0, minY: 0, maxX: NaN, maxY: 10 })).toBe(true);
  });

  it('returns false for a single-point degenerate bbox (min == max)', () => {
    // A point feature has minX === maxX === x. Should NOT count as empty.
    expect(isEmptyBBox(bbox(5, 5, 5, 5))).toBe(false);
  });
});

describe('bboxesOverlap', () => {
  it('returns true for overlapping rectangles', () => {
    expect(bboxesOverlap(bbox(0, 0, 10, 10), bbox(5, 5, 15, 15))).toBe(true);
  });

  it('returns true when one contains the other', () => {
    expect(bboxesOverlap(bbox(0, 0, 100, 100), bbox(40, 40, 60, 60))).toBe(true);
  });

  it('returns false when one is fully to the left', () => {
    expect(bboxesOverlap(bbox(0, 0, 10, 10), bbox(20, 0, 30, 10))).toBe(false);
  });

  it('returns false when one is fully above', () => {
    expect(bboxesOverlap(bbox(0, 0, 10, 10), bbox(0, 20, 10, 30))).toBe(false);
  });

  it('treats edge-touching as overlap (inclusive)', () => {
    // a.maxX = 10 = b.minX → touching. The `<` predicate makes touching
    // count as overlap, which is the conservative call (don't cull
    // features whose edge sits on the viewport boundary).
    expect(bboxesOverlap(bbox(0, 0, 10, 10), bbox(10, 0, 20, 10))).toBe(true);
  });

  it('returns false when either bbox is empty', () => {
    expect(bboxesOverlap(bbox(0, 0, 10, 10), bbox(20, 0, 5, 10))).toBe(false);
    expect(bboxesOverlap(bbox(20, 0, 5, 10), bbox(0, 0, 10, 10))).toBe(false);
  });
});

describe('expandBBox', () => {
  it('grows the bbox by the configured fraction on each side', () => {
    // 100×100 bbox + 5% → grows by 5 on each side.
    const out = expandBBox(bbox(0, 0, 100, 100), 0.05);
    expect(out).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 105 });
  });

  it('grows asymmetrically when the bbox is non-square', () => {
    // 100×50 + 10% → ±10 on x, ±5 on y.
    const out = expandBBox(bbox(0, 0, 100, 50), 0.1);
    expect(out).toEqual({ minX: -10, minY: -5, maxX: 110, maxY: 55 });
  });

  it('returns the bbox unchanged when fraction is 0', () => {
    const in_ = bbox(10, 20, 30, 40);
    expect(expandBBox(in_, 0)).toBe(in_);
  });

  it('returns the bbox unchanged when fraction is negative (defensive)', () => {
    const in_ = bbox(10, 20, 30, 40);
    expect(expandBBox(in_, -0.1)).toBe(in_);
  });

  it('returns the bbox unchanged when input is empty', () => {
    const empty = bbox(10, 0, 5, 10);
    expect(expandBBox(empty, 0.05)).toBe(empty);
  });
});
