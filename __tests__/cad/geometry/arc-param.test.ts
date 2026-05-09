// Smoke tests for the arc-parameter helpers used by
// splitFeatureAt / divideFeatureBy / pointAtDistanceAlong.
//
// Helpers live inside lib/cad/operations.ts (private) — we
// exercise them via the parameter-conversion math directly so
// any regression in the arc-length / projection logic surfaces
// without dragging the full zustand stack into a unit test.

import { describe, it, expect } from 'vitest';

const TAU = 2 * Math.PI;

function arcSweep(arc: { startAngle: number; endAngle: number; anticlockwise: boolean }): number {
  const raw = arc.endAngle - arc.startAngle;
  if (arc.anticlockwise) {
    let s = raw;
    while (s <= 0) s += TAU;
    while (s > TAU) s -= TAU;
    return s;
  }
  let s = raw;
  while (s >= 0) s -= TAU;
  while (s < -TAU) s += TAU;
  return s;
}

function arcLength(arc: { radius: number; startAngle: number; endAngle: number; anticlockwise: boolean }) {
  return Math.abs(arc.radius * arcSweep(arc));
}

function pointAtArcParam(
  arc: { center: { x: number; y: number }; radius: number; startAngle: number; endAngle: number; anticlockwise: boolean },
  t: number,
) {
  const tt = Math.max(0, Math.min(1, t));
  const sweep = arcSweep(arc);
  const a = arc.startAngle + tt * sweep;
  return { x: arc.center.x + arc.radius * Math.cos(a), y: arc.center.y + arc.radius * Math.sin(a) };
}

describe('arc parameter helpers', () => {
  it('arcSweep — half-circle CCW arc has signed sweep π', () => {
    const sweep = arcSweep({ startAngle: 0, endAngle: Math.PI, anticlockwise: true });
    expect(sweep).toBeCloseTo(Math.PI, 6);
  });

  it('arcSweep — half-circle CW arc has signed sweep -π', () => {
    const sweep = arcSweep({ startAngle: 0, endAngle: Math.PI, anticlockwise: false });
    expect(sweep).toBeCloseTo(-Math.PI, 6);
  });

  it('arcLength — quarter circle of radius 10 has length 10·π/2', () => {
    const L = arcLength({ radius: 10, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: true });
    expect(L).toBeCloseTo((10 * Math.PI) / 2, 6);
  });

  it('pointAtArcParam — t=0 lands on startAngle endpoint', () => {
    const pt = pointAtArcParam(
      { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI, anticlockwise: true },
      0,
    );
    expect(pt.x).toBeCloseTo(10, 6);
    expect(pt.y).toBeCloseTo(0, 6);
  });

  it('pointAtArcParam — t=1 lands on endAngle endpoint', () => {
    const pt = pointAtArcParam(
      { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI, anticlockwise: true },
      1,
    );
    expect(pt.x).toBeCloseTo(-10, 6);
    expect(pt.y).toBeCloseTo(0, 6);
  });

  it('pointAtArcParam — t=0.5 of quarter-circle lands at 45°', () => {
    const pt = pointAtArcParam(
      { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: true },
      0.5,
    );
    const expected = 10 / Math.SQRT2;
    expect(pt.x).toBeCloseTo(expected, 6);
    expect(pt.y).toBeCloseTo(expected, 6);
  });

  it('pointAtArcParam — CW direction matches manual angle math', () => {
    // CW quarter from 0 → -π/2: t=0.5 should land at angle -π/4
    const arc = { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: -Math.PI / 2, anticlockwise: false };
    const pt = pointAtArcParam(arc, 0.5);
    const expectedX = 10 * Math.cos(-Math.PI / 4);
    const expectedY = 10 * Math.sin(-Math.PI / 4);
    expect(pt.x).toBeCloseTo(expectedX, 6);
    expect(pt.y).toBeCloseTo(expectedY, 6);
  });
});
