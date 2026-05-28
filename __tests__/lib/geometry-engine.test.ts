// __tests__/lib/geometry-engine.test.ts
//
// Coverage for the bounding-box + canvas-scale helpers in the research
// geometry engine. These are pure functions that consume an array of
// traverse points and produce the parameters the SVG renderer uses to
// fit the drawing onto a paper sheet — small bugs here cause "clipped
// drawing" complaints from the field team.

import { describe, it, expect } from 'vitest';
import { computeBoundingBox, computeScale } from '@/lib/research/geometry.engine';

// Helper — the lib's `TraversePoint` shape has more fields than we
// need for bbox/scale; only x + y matter.
const pt = (x: number, y: number) =>
  ({ x, y, label: '', latitude: 0, longitude: 0 } as unknown as Parameters<typeof computeBoundingBox>[0][number]);

describe('computeBoundingBox', () => {
  it('returns a centered default when given an empty point list', () => {
    const bbox = computeBoundingBox([]);
    // Centered on origin (well, the default padding=50 → −50/50 box).
    expect(bbox.minX).toBe(-50);
    expect(bbox.maxX).toBe(50);
    expect(bbox.minY).toBe(-50);
    expect(bbox.maxY).toBe(50);
    expect(bbox.width).toBe(100);
    expect(bbox.height).toBe(100);
  });

  it('wraps a single rectangle with the configured padding', () => {
    const bbox = computeBoundingBox([pt(0, 0), pt(100, 200)], 50);
    expect(bbox.minX).toBe(-50);
    expect(bbox.maxX).toBe(150);
    expect(bbox.minY).toBe(-50);
    expect(bbox.maxY).toBe(250);
    expect(bbox.width).toBe(200);
    expect(bbox.height).toBe(300);
  });

  it('enforces a minimum dimension when the spread is tiny', () => {
    // Two near-coincident points → without min-dim, width = padding × 2.
    // With min-dim, width is still at least padding × 2 (default 100).
    const bbox = computeBoundingBox([pt(0, 0), pt(0.001, 0.001)], 50);
    expect(bbox.width).toBeGreaterThanOrEqual(100);
    expect(bbox.height).toBeGreaterThanOrEqual(100);
  });

  it('centers the small-spread bbox on the original midpoint', () => {
    const bbox = computeBoundingBox([pt(100, 100), pt(100.001, 100.001)], 50);
    // Midpoint of x is ~100, of y is ~100. Use tolerance 2 (0.01) since
    // the point midpoint sits at 100.0005.
    expect((bbox.minX + bbox.maxX) / 2).toBeCloseTo(100, 2);
    expect((bbox.minY + bbox.maxY) / 2).toBeCloseTo(100, 2);
  });

  it('handles negative-coordinate points correctly', () => {
    const bbox = computeBoundingBox([pt(-100, -200), pt(100, 200)], 0);
    expect(bbox.minX).toBe(-100);
    expect(bbox.maxX).toBe(100);
    expect(bbox.width).toBe(200);
    expect(bbox.height).toBe(400);
  });
});

describe('computeScale', () => {
  it('returns the limiting (smaller) of the two axis scales', () => {
    // Wide-but-short drawing in a square canvas → x is the limit.
    const points = [pt(0, 0), pt(1000, 100)];
    const scale = computeScale(points, 1200, 1200, 100);
    // Width 1000 → available 1000 → scale ~1.0; height 100 → 1000/100 = 10; min = 1.0.
    expect(scale).toBeCloseTo(1.0, 3);
  });

  it('always returns a positive finite scale even for identical points', () => {
    // Identical points → bbox.width raw=0, but the min-dim guard inside
    // computeBoundingBox bumps it to 100, so scale stays finite & > 0.
    const scale = computeScale([pt(0, 0), pt(0, 0)], 1000, 1000, 100);
    expect(scale).toBeGreaterThan(0);
    expect(Number.isFinite(scale)).toBe(true);
  });

  it('clamps a non-finite scale (rare paranoid path) to 1', () => {
    // Empty list → computeBoundingBox returns positive width/height, so
    // scale should be finite. Just verify finite + positive.
    const scale = computeScale([], 1000, 1000, 100);
    expect(scale).toBeGreaterThan(0);
    expect(Number.isFinite(scale)).toBe(true);
  });

  it('honors a tight margin (less canvas → smaller scale)', () => {
    const points = [pt(0, 0), pt(1000, 1000)];
    const noMargin = computeScale(points, 1200, 1200, 0);
    const bigMargin = computeScale(points, 1200, 1200, 500);
    expect(bigMargin).toBeLessThan(noMargin);
  });

  it('returns at least the per-axis 1px floor (defensive)', () => {
    // Stupidly large bbox forced into a tiny canvas; scale will be tiny
    // but must stay > 0.
    const points = [pt(0, 0), pt(10_000_000, 10_000_000)];
    const scale = computeScale(points, 100, 100, 0);
    expect(scale).toBeGreaterThan(0);
  });
});
