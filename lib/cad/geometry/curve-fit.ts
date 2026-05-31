// lib/cad/geometry/curve-fit.ts
//
// cad-trv-import-export-deep-semantic Pass 7 — curve detection +
// best-fit ARC / SPLINE construction for TRV-imported traverses.
// TRV files store curves as additional polyline vertices (PC →
// mid-arc → PT), without a dedicated arc record we can rely on
// in the public field schema. This module detects the curved runs
// geometrically (by angle-change between consecutive segments)
// and fits either:
//
//   - a circular ARC when the residual of a least-squares circle
//     fit is small (the run really IS a circle), or
//   - a cubic SPLINE when the residual is large (free-form curve).
//
// Pure module: no React, no DOM. Safe to unit-test against
// synthetic curve geometries.

import type { Point2D } from '../types';

export interface DetectCurveOpts {
  /** Angle change (radians) between consecutive segments that
   *  qualifies as "curved." Default ~0.087 rad (5°). */
  angleThreshold?: number;
  /** Minimum points in a run to consider it a curve. Defaults
   *  to 3 (the math needs 3 to fit a circle). */
  minRunLength?: number;
}

export interface CurvedRun {
  /** Index in the source `points` array where this run starts. */
  startIndex: number;
  /** Index in the source `points` array where this run ends
   *  (inclusive). */
  endIndex: number;
}

/** Detect runs of consecutive points that form a curved segment.
 *  Walks the chain and groups points whose successive segment-
 *  direction change exceeds `angleThreshold`. Returns runs of
 *  length ≥ `minRunLength` so isolated kinks (a single corner)
 *  don't trip the detector. */
export function detectCurvedRuns(
  points: ReadonlyArray<Point2D>,
  opts: DetectCurveOpts = {},
): CurvedRun[] {
  const angleThreshold = opts.angleThreshold ?? (5 * Math.PI / 180);
  const minRunLength = opts.minRunLength ?? 3;
  if (points.length < 3) return [];

  // Per-segment direction (heading) in radians.
  const headings: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    headings.push(Math.atan2(b.y - a.y, b.x - a.x));
  }

  // Per-vertex turn-angle (the change in heading between the
  // segment INTO the vertex and the one OUT of it). Index `i`
  // corresponds to `points[i]`; first + last have no turn.
  const isCurvedVertex: boolean[] = points.map(() => false);
  for (let i = 1; i < points.length - 1; i++) {
    const turn = Math.abs(normalizeAngleDelta(headings[i] - headings[i - 1]));
    if (turn > angleThreshold) isCurvedVertex[i] = true;
  }

  // Group consecutive curved interior vertices into runs.
  // Require ≥ 2 consecutive curved interior vertices (single
  // curved vertex = a sharp corner, not a curve). Extend each
  // run by one vertex on each side (the PC + PT) so a fit has
  // the tangent endpoints.
  const runs: CurvedRun[] = [];
  let i = 0;
  while (i < points.length) {
    if (!isCurvedVertex[i]) { i++; continue; }
    const runStart = i;
    while (i < points.length && isCurvedVertex[i]) i++;
    const runLen = i - runStart;
    if (runLen >= 2) {
      const start = Math.max(0, runStart - 1);
      const end = Math.min(points.length - 1, i);
      if (end - start + 1 >= minRunLength) {
        runs.push({ startIndex: start, endIndex: end });
      }
    }
  }
  return runs;
}

/** Wrap a radian angle delta into [-π, π]. */
function normalizeAngleDelta(d: number): number {
  let r = d;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export interface ArcFit {
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
  /** Maximum radial residual (point distance from fit circle).
   *  Caller uses this to decide ARC vs. SPLINE fallback. */
  maxResidual: number;
}

/** Least-squares circle fit through ≥ 3 points. Returns null when
 *  the points are collinear (the linear system is singular).
 *
 *  Algorithm: minimize Σ(x²+y² - 2ax - 2by + c)² where the circle
 *  is x² + y² = 2ax + 2by + (r² - a² - b²) = 0. Solving the
 *  normal equations (3×3 system) gives the center + radius. */
export function fitArcThroughPoints(points: ReadonlyArray<Point2D>): ArcFit | null {
  if (points.length < 3) return null;
  let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
  let sumX3 = 0, sumY3 = 0, sumXY2 = 0, sumX2Y = 0;
  for (const p of points) {
    const x = p.x, y = p.y;
    const xx = x * x, yy = y * y;
    sumX += x; sumY += y;
    sumXX += xx; sumYY += yy; sumXY += x * y;
    sumX3 += xx * x;
    sumY3 += yy * y;
    sumXY2 += x * yy;
    sumX2Y += xx * y;
  }
  const n = points.length;
  // Build normal equations for [A, B, C] where
  //   A·x + B·y + C = -(x² + y²)
  // After substitution this gives center + radius via:
  //   center = (-A/2, -B/2)
  //   radius = sqrt(A²/4 + B²/4 - C)
  // Using the standard linear-algebra form:
  const M = [
    [sumXX,  sumXY,  sumX],
    [sumXY,  sumYY,  sumY],
    [sumX,   sumY,   n],
  ];
  const rhs = [
    -(sumX3 + sumXY2),
    -(sumX2Y + sumY3),
    -(sumXX + sumYY),
  ];
  const sol = solve3x3(M, rhs);
  if (!sol) return null;
  const [A, B, C] = sol;
  const cx = -A / 2;
  const cy = -B / 2;
  const r2 = (A * A + B * B) / 4 - C;
  if (r2 <= 0) return null;
  const radius = Math.sqrt(r2);
  // Compute residuals + start/end angles.
  let maxResidual = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    const res = Math.abs(d - radius);
    if (res > maxResidual) maxResidual = res;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const startAngle = Math.atan2(first.y - cy, first.x - cx);
  const endAngle   = Math.atan2(last.y  - cy, last.x  - cx);
  // Determine direction: sweep through the middle point + check
  // whether the cross product of (first→mid) and (mid→last) is
  // positive (CCW) or negative (CW). Note this assumes the points
  // are in arc traversal order.
  const mid = points[Math.floor(points.length / 2)];
  const cross = (mid.x - first.x) * (last.y - mid.y) - (mid.y - first.y) * (last.x - mid.x);
  const anticlockwise = cross > 0;
  return { center: { x: cx, y: cy }, radius, startAngle, endAngle, anticlockwise, maxResidual };
}

/** Build a cubic-bezier SplineGeometry-shape control-point array
 *  that smoothly passes through the given points using the
 *  Catmull-Rom → Bezier conversion (tension 0.5). Returns the
 *  flattened `controlPoints` array our SplineGeometry interface
 *  expects: 3N+1 points for N segments. */
export function fitSplineControlPoints(points: ReadonlyArray<Point2D>): Point2D[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const cp: Point2D[] = [];
  const n = points.length;
  cp.push({ ...points[0] });
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    // Catmull-Rom → Bezier control points (tension 0.5).
    cp.push({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 });
    cp.push({ x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 });
    cp.push({ ...p2 });
  }
  return cp;
}

/** Solve a 3×3 linear system Mx = rhs via Cramer's rule. Returns
 *  null when the system is singular. */
function solve3x3(M: number[][], rhs: number[]): number[] | null {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(M);
  if (Math.abs(d) < 1e-12) return null;
  const replace = (col: number) => M.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)));
  return [det(replace(0)) / d, det(replace(1)) / d, det(replace(2)) / d];
}
