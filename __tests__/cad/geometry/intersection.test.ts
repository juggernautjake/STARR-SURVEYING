// Phase 8 §11.6 Slice 3 — line × circle / line × arc helpers.
//
// Covers the discriminant cases (miss / tangent / two-point),
// the angular-span filter for arcs, and a couple of numerical
// edge cases (vertical lines, tiny tangent gap).

import { describe, it, expect } from 'vitest';
import {
  lineCircleIntersections,
  lineArcIntersections,
  isAngleInArc,
} from '@/lib/cad/geometry/intersection';
import type { ArcGeometry } from '@/lib/cad/types';

function close(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

describe('lineCircleIntersections', () => {
  it('returns two points for a chord across a unit circle', () => {
    const hits = lineCircleIntersections({ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }, 1);
    expect(hits).toHaveLength(2);
    // Sorted by t along a→b → entry at x=-1, exit at x=+1.
    expect(close(hits[0].x, -1)).toBe(true);
    expect(close(hits[0].y, 0)).toBe(true);
    expect(close(hits[1].x, 1)).toBe(true);
    expect(close(hits[1].y, 0)).toBe(true);
  });

  it('returns no points when the line misses the circle', () => {
    const hits = lineCircleIntersections({ x: -2, y: 5 }, { x: 2, y: 5 }, { x: 0, y: 0 }, 1);
    expect(hits).toHaveLength(0);
  });

  it('returns one point for a tangent line', () => {
    // Horizontal line y = 1 touches the unit circle at (0, 1).
    const hits = lineCircleIntersections({ x: -3, y: 1 }, { x: 3, y: 1 }, { x: 0, y: 0 }, 1);
    expect(hits).toHaveLength(1);
    expect(close(hits[0].x, 0)).toBe(true);
    expect(close(hits[0].y, 1)).toBe(true);
  });

  it('handles vertical lines (denominator-free case)', () => {
    // Vertical line x = 0.5 cuts the unit circle.
    const hits = lineCircleIntersections({ x: 0.5, y: -2 }, { x: 0.5, y: 2 }, { x: 0, y: 0 }, 1);
    expect(hits).toHaveLength(2);
    // y values are ±√(1 - 0.25) = ±√0.75.
    const ys = hits.map((p) => p.y).sort((a, b) => a - b);
    expect(close(ys[0], -Math.sqrt(0.75))).toBe(true);
    expect(close(ys[1], Math.sqrt(0.75))).toBe(true);
    expect(hits.every((p) => close(p.x, 0.5))).toBe(true);
  });

  it('returns empty for a degenerate line (a === b)', () => {
    expect(lineCircleIntersections({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 }, 1)).toEqual([]);
  });

  it('handles off-center circles', () => {
    // Circle at (10, 10) radius 2, line through (8, 10) → (12, 10) cuts it at x=8 and x=12.
    const hits = lineCircleIntersections({ x: 8, y: 10 }, { x: 12, y: 10 }, { x: 10, y: 10 }, 2);
    expect(hits).toHaveLength(2);
    const xs = hits.map((p) => p.x).sort((a, b) => a - b);
    expect(close(xs[0], 8)).toBe(true);
    expect(close(xs[1], 12)).toBe(true);
  });
});

describe('lineArcIntersections', () => {
  // Top half of unit circle (CCW from east to west, i.e. 0 → π).
  const topArc: ArcGeometry = {
    center: { x: 0, y: 0 },
    radius: 1,
    startAngle: 0,
    endAngle: Math.PI,
    anticlockwise: true,
  };

  it('returns intersection on the swept side only', () => {
    // y = 0.5 cuts the full circle twice; both x = ±√0.75 land on the
    // upper half so both are kept.
    const hits = lineArcIntersections({ x: -2, y: 0.5 }, { x: 2, y: 0.5 }, topArc);
    expect(hits).toHaveLength(2);
    expect(hits.every((p) => p.y > 0)).toBe(true);
  });

  it('drops intersection points outside the arc sweep', () => {
    // y = -0.5 cuts the full circle at two points, both below x-axis →
    // neither is on the top arc → empty.
    const hits = lineArcIntersections({ x: -2, y: -0.5 }, { x: 2, y: -0.5 }, topArc);
    expect(hits).toHaveLength(0);
  });

  it('keeps endpoints exactly at the arc boundary (y = 0)', () => {
    // The chord y = 0 itself runs through both endpoints (-1, 0) and
    // (1, 0). Both are at angles π and 0 — boundaries of the top arc —
    // so both must qualify.
    const hits = lineArcIntersections({ x: -2, y: 0 }, { x: 2, y: 0 }, topArc);
    expect(hits).toHaveLength(2);
  });

  it('returns one point for a chord that only crosses inside the sweep', () => {
    // CW arc from 0 (east) sweeping down to -π/2 (south); just the
    // bottom-right quarter. A horizontal line y = -0.5 cuts the full
    // circle at x = ±√0.75; only +√0.75 lands in the sweep.
    const bottomRight: ArcGeometry = {
      center: { x: 0, y: 0 },
      radius: 1,
      startAngle: 0,
      endAngle: -Math.PI / 2,
      anticlockwise: false,
    };
    const hits = lineArcIntersections({ x: -2, y: -0.5 }, { x: 2, y: -0.5 }, bottomRight);
    expect(hits).toHaveLength(1);
    expect(hits[0].x).toBeGreaterThan(0);
    expect(close(hits[0].y, -0.5)).toBe(true);
  });

  it('returns empty when the line misses the underlying circle', () => {
    const hits = lineArcIntersections({ x: -2, y: 5 }, { x: 2, y: 5 }, topArc);
    expect(hits).toHaveLength(0);
  });
});

describe('isAngleInArc', () => {
  const topArc: ArcGeometry = {
    center: { x: 0, y: 0 },
    radius: 1,
    startAngle: 0,
    endAngle: Math.PI,
    anticlockwise: true,
  };

  it('accepts angles strictly inside the CCW sweep', () => {
    expect(isAngleInArc(Math.PI / 2, topArc)).toBe(true);
    expect(isAngleInArc(Math.PI / 4, topArc)).toBe(true);
  });

  it('rejects angles outside the CCW sweep', () => {
    expect(isAngleInArc(-Math.PI / 2, topArc)).toBe(false);
    expect(isAngleInArc(Math.PI + 0.1, topArc)).toBe(false);
  });

  it('accepts the arc boundary angles', () => {
    expect(isAngleInArc(0, topArc)).toBe(true);
    expect(isAngleInArc(Math.PI, topArc)).toBe(true);
  });
});
