// __tests__/cad/geometry/point.test.ts
//
// Coverage for `lib/cad/geometry/point.ts` — the foundational 2D point
// math that the snap engine, the curve fitter, the hit-test path, and
// most drawing tools call into. These functions had no test coverage
// even though they're on the hot path of every interaction.

import { describe, it, expect } from 'vitest';
import {
  distance,
  midpoint,
  angle,
  pointAtDistanceAngle,
  pointToSegmentDistance,
  closestPointOnSegment,
  pointInPolygon,
} from '@/lib/cad/geometry/point';

const pt = (x: number, y: number) => ({ x, y });

describe('distance', () => {
  it('returns 0 for coincident points', () => {
    expect(distance(pt(5, 5), pt(5, 5))).toBe(0);
  });

  it('handles the canonical 3-4-5 triangle', () => {
    expect(distance(pt(0, 0), pt(3, 4))).toBe(5);
  });

  it('is symmetric', () => {
    expect(distance(pt(1, 2), pt(4, 6))).toBe(distance(pt(4, 6), pt(1, 2)));
  });
});

describe('midpoint', () => {
  it('averages x and y', () => {
    expect(midpoint(pt(0, 0), pt(10, 20))).toEqual({ x: 5, y: 10 });
  });

  it('handles negative coordinates', () => {
    expect(midpoint(pt(-4, -8), pt(4, 8))).toEqual({ x: 0, y: 0 });
  });
});

describe('angle (radians, atan2 from east, CCW)', () => {
  it('returns 0 for a horizontal-east vector', () => {
    expect(angle(pt(0, 0), pt(1, 0))).toBe(0);
  });

  it('returns π/2 for a vertical-north vector', () => {
    expect(angle(pt(0, 0), pt(0, 1))).toBeCloseTo(Math.PI / 2, 10);
  });

  it('returns π for a horizontal-west vector', () => {
    expect(angle(pt(0, 0), pt(-1, 0))).toBeCloseTo(Math.PI, 10);
  });

  it('returns -π/2 for a vertical-south vector', () => {
    expect(angle(pt(0, 0), pt(0, -1))).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe('pointAtDistanceAngle', () => {
  it('extends 10 units due-east', () => {
    const p = pointAtDistanceAngle(pt(0, 0), 10, 0);
    expect(p.x).toBeCloseTo(10, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });

  it('extends 10 units due-north', () => {
    const p = pointAtDistanceAngle(pt(0, 0), 10, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(10, 10);
  });

  it('roundtrips with `angle()` + `distance()`', () => {
    const origin = pt(5, 7);
    const target = pt(15, 12);
    const d = distance(origin, target);
    const a = angle(origin, target);
    const back = pointAtDistanceAngle(origin, d, a);
    expect(back.x).toBeCloseTo(target.x, 10);
    expect(back.y).toBeCloseTo(target.y, 10);
  });
});

describe('pointToSegmentDistance', () => {
  it('returns the perpendicular distance when foot lies inside the segment', () => {
    // (5, 5) → segment (0,0)→(10,0) → perpendicular distance 5.
    expect(pointToSegmentDistance(pt(5, 5), pt(0, 0), pt(10, 0))).toBe(5);
  });

  it('clamps to the nearer endpoint when foot is past A', () => {
    // (-5, 0) is left of (0,0)→(10,0). Closest endpoint is A=(0,0).
    expect(pointToSegmentDistance(pt(-5, 0), pt(0, 0), pt(10, 0))).toBe(5);
  });

  it('clamps to the nearer endpoint when foot is past B', () => {
    // (15, 3) is right of B=(10,0). Closest is B, distance sqrt(25+9)=sqrt(34).
    expect(pointToSegmentDistance(pt(15, 3), pt(0, 0), pt(10, 0))).toBeCloseTo(Math.sqrt(34), 10);
  });

  it('handles a degenerate segment (A === B) gracefully', () => {
    expect(pointToSegmentDistance(pt(3, 4), pt(0, 0), pt(0, 0))).toBe(5);
  });

  it('returns 0 when the point is on the segment', () => {
    expect(pointToSegmentDistance(pt(5, 0), pt(0, 0), pt(10, 0))).toBe(0);
  });
});

describe('closestPointOnSegment', () => {
  it('returns the foot of the perpendicular with the right t value when inside', () => {
    // (5, 5) → segment (0,0)→(10,0). Foot is (5,0), t = 0.5.
    const out = closestPointOnSegment(pt(5, 5), pt(0, 0), pt(10, 0));
    expect(out.point).toEqual({ x: 5, y: 0 });
    expect(out.t).toBe(0.5);
  });

  it('returns A with t=0 when the point is past A', () => {
    const out = closestPointOnSegment(pt(-5, 5), pt(0, 0), pt(10, 0));
    expect(out.point).toEqual({ x: 0, y: 0 });
    expect(out.t).toBe(0);
  });

  it('returns B with t=1 when the point is past B', () => {
    const out = closestPointOnSegment(pt(20, 5), pt(0, 0), pt(10, 0));
    expect(out.point).toEqual({ x: 10, y: 0 });
    expect(out.t).toBe(1);
  });

  it('returns a copy (not the same reference) when segment is degenerate', () => {
    const a = pt(3, 4);
    const out = closestPointOnSegment(pt(0, 0), a, { x: 3, y: 4 });
    expect(out.point).toEqual(a);
    expect(out.point).not.toBe(a);
    expect(out.t).toBe(0);
  });
});

describe('pointInPolygon (ray-casting)', () => {
  const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];

  it('returns true for a point in the interior', () => {
    expect(pointInPolygon(pt(5, 5), square)).toBe(true);
  });

  it('returns false for a point outside', () => {
    expect(pointInPolygon(pt(15, 5), square)).toBe(false);
    expect(pointInPolygon(pt(-5, 5), square)).toBe(false);
    expect(pointInPolygon(pt(5, 15), square)).toBe(false);
    expect(pointInPolygon(pt(5, -5), square)).toBe(false);
  });

  it('handles a concave polygon (the classic L-shape)', () => {
    // L-shape with the notch on the upper-right:
    //   ▢▢▢  vertices: (0,0)(10,0)(10,5)(5,5)(5,10)(0,10)
    //   ▢
    //   ▢
    const L = [pt(0, 0), pt(10, 0), pt(10, 5), pt(5, 5), pt(5, 10), pt(0, 10)];
    // (2, 7) is inside the left column.
    expect(pointInPolygon(pt(2, 7), L)).toBe(true);
    // (7, 7) is inside the notch — outside the polygon.
    expect(pointInPolygon(pt(7, 7), L)).toBe(false);
  });
});
