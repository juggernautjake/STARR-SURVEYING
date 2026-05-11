// Phase 8 §11.6 Slice 3 — line × circle / line × arc helpers.
//
// Covers the discriminant cases (miss / tangent / two-point),
// the angular-span filter for arcs, and a couple of numerical
// edge cases (vertical lines, tiny tangent gap).

import { describe, it, expect } from 'vitest';
import {
  lineCircleIntersections,
  lineArcIntersections,
  circleCircleIntersections,
  arcArcIntersections,
  arcCircleIntersections,
  rayLineIntersection,
  rayCircleIntersections,
  rayArcIntersections,
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

describe('circleCircleIntersections', () => {
  it('returns two points for partially-overlapping circles', () => {
    // Two unit circles whose centers are 1.5 apart → two hits.
    const hits = circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 1.5, y: 0 }, 1);
    expect(hits).toHaveLength(2);
    // By symmetry x = 0.75 for both; y = ±√(1 − 0.5625).
    const ys = hits.map((p) => p.y).sort((a, b) => a - b);
    expect(hits.every((p) => close(p.x, 0.75))).toBe(true);
    expect(close(ys[0], -Math.sqrt(1 - 0.5625))).toBe(true);
    expect(close(ys[1], Math.sqrt(1 - 0.5625))).toBe(true);
  });

  it('returns one point for externally tangent circles', () => {
    // Circles touching at (1, 0).
    const hits = circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1);
    expect(hits).toHaveLength(1);
    expect(close(hits[0].x, 1)).toBe(true);
    expect(close(hits[0].y, 0)).toBe(true);
  });

  it('returns one point for internally tangent circles', () => {
    // Outer radius 2, inner radius 1 touching at (1, 0).
    const hits = circleCircleIntersections({ x: 0, y: 0 }, 2, { x: 1, y: 0 }, 1);
    expect(hits).toHaveLength(1);
    expect(close(hits[0].x, 2)).toBe(true);
    expect(close(hits[0].y, 0)).toBe(true);
  });

  it('returns empty for far-apart circles', () => {
    expect(
      circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1),
    ).toHaveLength(0);
  });

  it('returns empty for nested non-touching circles', () => {
    expect(
      circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 0, y: 0.5 }, 1),
    ).toHaveLength(0);
  });

  it('returns empty for coincident circles', () => {
    // Same center + same radius → infinitely many hits; we
    // return [] so callers don't choke on an undefined list.
    expect(
      circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 0, y: 0 }, 1),
    ).toHaveLength(0);
  });

  it('returns empty for concentric different-radius circles', () => {
    expect(
      circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 0, y: 0 }, 2),
    ).toHaveLength(0);
  });

  it('returns hits ordered deterministically around c1', () => {
    const hits = circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 1.5, y: 0 }, 1);
    expect(hits).toHaveLength(2);
    const a0 = Math.atan2(hits[0].y, hits[0].x);
    const a1 = Math.atan2(hits[1].y, hits[1].x);
    expect(a0).toBeLessThanOrEqual(a1);
  });
});

describe('arcCircleIntersections', () => {
  // Top half of unit circle.
  const topArc: ArcGeometry = {
    center: { x: 0, y: 0 },
    radius: 1,
    startAngle: 0,
    endAngle: Math.PI,
    anticlockwise: true,
  };

  it('drops hits outside the arc sweep', () => {
    // Two hits exist for the underlying circle-circle (one above
    // x-axis, one below). The bottom one is outside the top arc.
    const hits = arcCircleIntersections(topArc, { x: 1.5, y: 0 }, 1);
    expect(hits).toHaveLength(1);
    expect(hits[0].y).toBeGreaterThan(0);
  });

  it('returns empty when the underlying circles miss', () => {
    expect(arcCircleIntersections(topArc, { x: 5, y: 0 }, 1)).toHaveLength(0);
  });

  it('keeps both hits when both sit inside the sweep', () => {
    // Top arc + a circle centered at (0, 1.5) radius 1 →
    // both circle-circle hits land at y = 0.75 (positive).
    const hits = arcCircleIntersections(topArc, { x: 0, y: 1.5 }, 1);
    expect(hits).toHaveLength(2);
    expect(hits.every((p) => p.y > 0)).toBe(true);
  });
});

describe('arcArcIntersections', () => {
  const topArc: ArcGeometry = {
    center: { x: 0, y: 0 },
    radius: 1,
    startAngle: 0,
    endAngle: Math.PI,
    anticlockwise: true,
  };
  const bottomArc: ArcGeometry = {
    center: { x: 1.5, y: 0 },
    radius: 1,
    startAngle: -Math.PI,
    endAngle: 0,
    anticlockwise: false,
  };
  // A right-half arc at (0,0): angle ∈ [-π/2, π/2] CCW.
  const rightHalfA: ArcGeometry = {
    center: { x: 0, y: 0 },
    radius: 1,
    startAngle: -Math.PI / 2,
    endAngle: Math.PI / 2,
    anticlockwise: true,
  };
  // A left-half arc at (1.5,0): angle ∈ [π/2, 3π/2] CCW.
  const leftHalfB: ArcGeometry = {
    center: { x: 1.5, y: 0 },
    radius: 1,
    startAngle: Math.PI / 2,
    endAngle: (3 * Math.PI) / 2,
    anticlockwise: true,
  };

  it('drops hits outside either arc sweep', () => {
    // Top arc 1 vs bottom arc 2 — circles cross at y = ±√0.4375
    // (≈ ±0.661). topArc keeps only y ≥ 0, bottomArc keeps only
    // y ≤ 0, so the intersection of allowed sweeps is empty.
    expect(arcArcIntersections(topArc, bottomArc)).toHaveLength(0);
  });

  it('keeps both hits when each lies inside both sweeps', () => {
    // Right-half of A (covers ±41° around east) and left-half
    // of B (covers ±41° around west from B's perspective)
    // → both circle-circle hits at (0.75, ±0.66) survive.
    const hits = arcArcIntersections(rightHalfA, leftHalfB);
    expect(hits).toHaveLength(2);
    const ys = hits.map((p) => p.y).sort((a, b) => a - b);
    expect(close(ys[0], -Math.sqrt(1 - 0.5625))).toBe(true);
    expect(close(ys[1], Math.sqrt(1 - 0.5625))).toBe(true);
  });

  it('returns empty when the underlying circles miss', () => {
    const far: ArcGeometry = {
      center: { x: 10, y: 0 },
      radius: 1,
      startAngle: 0,
      endAngle: Math.PI,
      anticlockwise: true,
    };
    expect(arcArcIntersections(topArc, far)).toHaveLength(0);
  });
});

describe('rayLineIntersection', () => {
  it('finds the intersection in front of the ray', () => {
    // Ray from origin shooting east (azimuth 90°). Line is a
    // vertical segment at x = 5.
    const hit = rayLineIntersection({ x: 0, y: 0 }, 90, { x: 5, y: -2 }, { x: 5, y: 2 });
    expect(hit).not.toBeNull();
    expect(close(hit!.x, 5)).toBe(true);
    expect(close(hit!.y, 0)).toBe(true);
  });

  it('returns null when the intersection is behind the ray origin', () => {
    // Ray shooting east; line at x = -5 (behind).
    const hit = rayLineIntersection({ x: 0, y: 0 }, 90, { x: -5, y: -2 }, { x: -5, y: 2 });
    expect(hit).toBeNull();
  });

  it('returns null for a parallel line', () => {
    // Ray shooting north (azimuth 0°); horizontal line at y = 5
    // → wait that's perpendicular. Use a line parallel to north:
    // a vertical line through x = 5 has direction (0,1), same as
    // a north-bound ray → parallel.
    const hit = rayLineIntersection({ x: 0, y: 0 }, 0, { x: 5, y: 0 }, { x: 5, y: 10 });
    expect(hit).toBeNull();
  });

  it('respects survey azimuth (N = 0, CW)', () => {
    // Ray shooting due south (azimuth 180°); line at y = -5.
    const hit = rayLineIntersection({ x: 0, y: 0 }, 180, { x: -5, y: -5 }, { x: 5, y: -5 });
    expect(hit).not.toBeNull();
    expect(close(hit!.x, 0)).toBe(true);
    expect(close(hit!.y, -5)).toBe(true);
  });
});

describe('rayCircleIntersections', () => {
  it('orders hits by distance along the ray', () => {
    // Ray east through unit circle at (5, 0) radius 1 → entry
    // at x = 4, exit at x = 6.
    const hits = rayCircleIntersections({ x: 0, y: 0 }, 90, { x: 5, y: 0 }, 1);
    expect(hits).toHaveLength(2);
    expect(close(hits[0].x, 4)).toBe(true);
    expect(close(hits[1].x, 6)).toBe(true);
  });

  it('drops hits behind the ray', () => {
    // Ray east; circle around origin radius 2 → infinite line
    // crosses at x = ±2; only x = +2 is in front of the ray.
    const hits = rayCircleIntersections({ x: 0, y: 0 }, 90, { x: 0, y: 0 }, 2);
    expect(hits).toHaveLength(1);
    expect(close(hits[0].x, 2)).toBe(true);
  });

  it('returns empty when the line misses the circle', () => {
    expect(rayCircleIntersections({ x: 0, y: 0 }, 90, { x: 5, y: 10 }, 1)).toHaveLength(0);
  });
});

describe('rayArcIntersections', () => {
  const topArc: ArcGeometry = {
    center: { x: 5, y: 0 },
    radius: 1,
    startAngle: 0,
    endAngle: Math.PI,
    anticlockwise: true,
  };

  it('keeps only hits within the arc sweep', () => {
    // Ray east through the underlying circle at (5, 0) crosses
    // at (4, 0) and (6, 0); both lie at angle 0 / π → arc
    // boundary. Both qualify; ordered nearest first.
    const hits = rayArcIntersections({ x: 0, y: 0 }, 90, topArc);
    expect(hits).toHaveLength(2);
    expect(close(hits[0].x, 4)).toBe(true);
    expect(close(hits[1].x, 6)).toBe(true);
  });

  it('drops hits outside the arc sweep', () => {
    // Ray shooting SE (azimuth 135°) skims the bottom of the
    // top-arc — circle hits exist below x-axis, all outside
    // [0, π] sweep → empty.
    const hits = rayArcIntersections({ x: 0, y: -10 }, 0, topArc);
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
