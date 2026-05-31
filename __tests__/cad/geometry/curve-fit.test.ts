// __tests__/cad/geometry/curve-fit.test.ts
//
// cad-trv-import-export-deep-semantic Pass 7 — pure curve detection
// + best-fit ARC / SPLINE for TRV-imported polyline geometry.

import { describe, it, expect } from 'vitest';
import {
  detectCurvedRuns,
  fitArcThroughPoints,
  fitSplineControlPoints,
} from '@/lib/cad/geometry/curve-fit';
import type { Point2D } from '@/lib/cad/types';

/** Generate points along a circular arc centered at the origin. */
function arcPoints(radius: number, startDeg: number, endDeg: number, count: number): Point2D[] {
  const out: Point2D[] = [];
  const span = (endDeg - startDeg) * (Math.PI / 180);
  const start = startDeg * (Math.PI / 180);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const a = start + t * span;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

describe('detectCurvedRuns', () => {
  it('returns no runs for a single straight line', () => {
    const line = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
      { x: 30, y: 0 }, { x: 40, y: 0 },
    ];
    expect(detectCurvedRuns(line)).toEqual([]);
  });

  it('detects an arc run when the angle changes exceed the threshold', () => {
    // 90° arc sampled at 10 points → every interior vertex turns
    // ~10° → well above the 5° default threshold.
    const arc = arcPoints(100, 0, 90, 10);
    const runs = detectCurvedRuns(arc);
    expect(runs.length).toBe(1);
    expect(runs[0].startIndex).toBe(0);
    expect(runs[0].endIndex).toBe(9);
  });

  it('detects a curved RUN flanked by straight segments', () => {
    // Straight 4 pts → arc 6 pts → straight 4 pts.
    const straightA: Point2D[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 },
    ];
    const arc = arcPoints(50, 0, 90, 6).map((p) => ({ x: p.x + 30, y: p.y }));
    const straightB: Point2D[] = [
      { x: arc[arc.length - 1].x, y: arc[arc.length - 1].y + 10 },
      { x: arc[arc.length - 1].x, y: arc[arc.length - 1].y + 20 },
      { x: arc[arc.length - 1].x, y: arc[arc.length - 1].y + 30 },
    ];
    const chain = [...straightA, ...arc.slice(1), ...straightB];
    const runs = detectCurvedRuns(chain);
    expect(runs.length).toBe(1);
    // Run includes the PC (last straight vertex) + the arc.
    expect(runs[0].endIndex).toBeGreaterThan(runs[0].startIndex);
  });

  it('skips isolated single-vertex kinks (corners, not curves)', () => {
    // Right-angle corner: 3 points with one sharp turn.
    const corner = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ];
    expect(detectCurvedRuns(corner)).toEqual([]); // single curved vertex; below minRunLength=3
  });

  it('respects a custom angleThreshold', () => {
    const arc = arcPoints(100, 0, 30, 10);
    // 30°/9 segments ≈ 3.3° per vertex turn → below 5° default.
    expect(detectCurvedRuns(arc).length).toBe(0);
    // But above 2° (overrides the default).
    expect(detectCurvedRuns(arc, { angleThreshold: 2 * Math.PI / 180 }).length).toBe(1);
  });
});

describe('fitArcThroughPoints', () => {
  it('recovers the center + radius from a perfect arc', () => {
    const arc = arcPoints(100, 0, 90, 9);
    const fit = fitArcThroughPoints(arc);
    expect(fit).not.toBeNull();
    expect(fit!.center.x).toBeCloseTo(0, 5);
    expect(fit!.center.y).toBeCloseTo(0, 5);
    expect(fit!.radius).toBeCloseTo(100, 5);
    expect(fit!.maxResidual).toBeLessThan(1e-5);
  });

  it('recovers a center offset from the origin', () => {
    const arc = arcPoints(50, 0, 120, 7).map((p) => ({ x: p.x + 30, y: p.y + 40 }));
    const fit = fitArcThroughPoints(arc);
    expect(fit).not.toBeNull();
    expect(fit!.center.x).toBeCloseTo(30, 5);
    expect(fit!.center.y).toBeCloseTo(40, 5);
    expect(fit!.radius).toBeCloseTo(50, 5);
  });

  it('returns a non-zero maxResidual when the points aren\'t exactly on a circle', () => {
    const arc = arcPoints(100, 0, 90, 9);
    // Push every other point inward by 2ft — not a real circle.
    const noisy = arc.map((p, i) => i % 2 === 0 ? p : { x: p.x * 0.98, y: p.y * 0.98 });
    const fit = fitArcThroughPoints(noisy);
    expect(fit).not.toBeNull();
    expect(fit!.maxResidual).toBeGreaterThan(0.5);
  });

  it('returns null for collinear points (singular system)', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    expect(fitArcThroughPoints(line)).toBeNull();
  });

  it('returns null for < 3 points', () => {
    expect(fitArcThroughPoints([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it('detects anticlockwise vs clockwise via the mid-point cross product', () => {
    // CCW arc from 0° to 90°.
    const ccw = arcPoints(100, 0, 90, 5);
    const fitCcw = fitArcThroughPoints(ccw);
    expect(fitCcw!.anticlockwise).toBe(true);
    // CW arc from 0° to -90°.
    const cw = arcPoints(100, 0, -90, 5);
    const fitCw = fitArcThroughPoints(cw);
    expect(fitCw!.anticlockwise).toBe(false);
  });
});

describe('fitSplineControlPoints', () => {
  it('emits 3N+1 control points for N segments', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }, { x: 30, y: 0 },
    ];
    const cp = fitSplineControlPoints(pts);
    expect(cp.length).toBe(3 * (pts.length - 1) + 1);
  });

  it('the spline passes through every input point (interpolating)', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 },
    ];
    const cp = fitSplineControlPoints(pts);
    // Anchor points (every 3rd) should equal the input.
    for (let i = 0; i < pts.length; i++) {
      expect(cp[i * 3].x).toBeCloseTo(pts[i].x, 5);
      expect(cp[i * 3].y).toBeCloseTo(pts[i].y, 5);
    }
  });

  it('passes through a single-segment 2-point input verbatim', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    const cp = fitSplineControlPoints(pts);
    expect(cp[0]).toEqual({ x: 0, y: 0 });
    expect(cp[cp.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('returns a 1-point array verbatim when given 1 point', () => {
    expect(fitSplineControlPoints([{ x: 5, y: 5 }])).toEqual([{ x: 5, y: 5 }]);
  });

  it('returns an empty array when given no points', () => {
    expect(fitSplineControlPoints([])).toEqual([]);
  });
});
