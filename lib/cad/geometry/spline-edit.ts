// lib/cad/geometry/spline-edit.ts
//
// Add / remove on-curve nodes on a stored SplineGeometry. A SplineGeometry
// keeps a flat cubic-bezier control-point chain: for N segments there are
// 3N+1 points, and the on-curve "nodes" (the fit points a surveyor grabs)
// live at indices 0, 3, 6, … — the points in between are tangent handles.
//
// - INSERT splits the segment under the cursor with de Casteljau subdivision,
//   which is EXACT: the curve shape is unchanged, you just gain an editable
//   node where you clicked.
// - REMOVE drops the nearest node and merges its two adjacent segments into
//   one, keeping the outer tangent handles (a faithful, minimal change).
//
// Both operate only on the spline's own control points — they never touch
// any other feature, so survey POINT features that happen to sit under a
// node are left completely alone.
//
// Scope: OPEN splines (the common case for curved survey linework). Closed
// splines return null so a wrap-around chain can't be corrupted.

import type { Point2D, SplineGeometry } from '../types';
import { cubicBezier } from './spline';

function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Segment count of an OPEN bezier spline, or null when the control-point
 *  array isn't a clean open chain (e.g. closed, or malformed). */
export function splineSegmentCount(sp: SplineGeometry): number | null {
  if (sp.isClosed) return null;
  const len = sp.controlPoints.length;
  if (len < 4 || (len - 1) % 3 !== 0) return null;
  return (len - 1) / 3;
}

/** Indices of the on-curve nodes (fit points) within `controlPoints`. */
export function splineNodeIndices(sp: SplineGeometry): number[] {
  const n = splineSegmentCount(sp);
  if (n === null) return [];
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) out.push(i * 3);
  return out;
}

/** Closest point on the spline to `pt`, returned as the segment index and the
 *  bezier parameter t within it, plus the distance. */
function closestOnSpline(
  cp: Point2D[],
  segCount: number,
  pt: Point2D,
): { seg: number; t: number; dist: number } {
  let best = { seg: 0, t: 0, dist: Infinity };
  const COARSE = 24;
  for (let seg = 0; seg < segCount; seg += 1) {
    const p0 = cp[seg * 3], p1 = cp[seg * 3 + 1], p2 = cp[seg * 3 + 2], p3 = cp[seg * 3 + 3];
    for (let s = 0; s <= COARSE; s += 1) {
      const t = s / COARSE;
      const b = cubicBezier(p0, p1, p2, p3, t);
      const d = Math.hypot(pt.x - b.x, pt.y - b.y);
      if (d < best.dist) best = { seg, t, dist: d };
    }
  }
  // Refine around the best coarse hit with a finer local sweep.
  const seg = best.seg;
  const p0 = cp[seg * 3], p1 = cp[seg * 3 + 1], p2 = cp[seg * 3 + 2], p3 = cp[seg * 3 + 3];
  const span = 1 / COARSE;
  const lo = Math.max(0, best.t - span);
  const hi = Math.min(1, best.t + span);
  const FINE = 20;
  for (let s = 0; s <= FINE; s += 1) {
    const t = lo + ((hi - lo) * s) / FINE;
    const b = cubicBezier(p0, p1, p2, p3, t);
    const d = Math.hypot(pt.x - b.x, pt.y - b.y);
    if (d < best.dist) best = { seg, t, dist: d };
  }
  return best;
}

/** Closest point ON the spline curve to `pt` (for hover previews), or null
 *  when the spline isn't an editable open chain. */
export function closestPointOnSpline(
  sp: SplineGeometry,
  pt: Point2D,
): { point: Point2D; dist: number } | null {
  const segCount = splineSegmentCount(sp);
  if (segCount === null || segCount < 1) return null;
  const cp = sp.controlPoints;
  const { seg, t, dist } = closestOnSpline(cp, segCount, pt);
  const i = seg * 3;
  const point = cubicBezier(cp[i], cp[i + 1], cp[i + 2], cp[i + 3], t);
  return { point, dist };
}

/**
 * Insert a new on-curve node at the point of the spline closest to `worldPt`,
 * via exact de Casteljau subdivision (the curve is visually unchanged).
 * Returns the new geometry, or null when the spline isn't an editable open
 * chain or the click lands essentially on an existing node (a no-op).
 */
export function insertSplineNode(sp: SplineGeometry, worldPt: Point2D): SplineGeometry | null {
  const segCount = splineSegmentCount(sp);
  if (segCount === null || segCount < 1) return null;
  const cp = sp.controlPoints;
  const { seg, t } = closestOnSpline(cp, segCount, worldPt);
  // Too close to a segment end == essentially an existing node → no-op.
  if (t <= 0.02 || t >= 0.98) return null;

  const i = seg * 3;
  const p0 = cp[i], p1 = cp[i + 1], p2 = cp[i + 2], p3 = cp[i + 3];
  // de Casteljau split at t.
  const q1 = lerp(p0, p1, t);
  const mid = lerp(p1, p2, t);
  const r2 = lerp(p2, p3, t);
  const q2 = lerp(q1, mid, t);
  const r1 = lerp(mid, r2, t);
  const m = lerp(q2, r1, t); // the new on-curve node

  const next = cp.slice();
  // Replace this segment's 4 control points with the 7 of the two halves.
  next.splice(i, 4, p0, q1, q2, m, r1, r2, p3);
  return { ...sp, controlPoints: next };
}

/**
 * Remove the spline node nearest to `worldPt` (within `pickRadiusWorld`) and
 * merge its neighbouring segments, keeping their outer tangent handles.
 * Won't drop below 2 nodes (one segment). Returns the new geometry, or null
 * when nothing qualifies.
 */
export function removeSplineNode(
  sp: SplineGeometry,
  worldPt: Point2D,
  pickRadiusWorld: number,
): SplineGeometry | null {
  const segCount = splineSegmentCount(sp);
  if (segCount === null) return null;
  // Need at least 2 segments (3 nodes) so a removal leaves a valid spline.
  if (segCount < 2) return null;
  const cp = sp.controlPoints;
  const nodeIdx = splineNodeIndices(sp);

  // Nearest node to the cursor.
  let bestK = -1;
  let bestDist = Infinity;
  for (let k = 0; k < nodeIdx.length; k += 1) {
    const v = cp[nodeIdx[k]];
    const d = Math.hypot(worldPt.x - v.x, worldPt.y - v.y);
    if (d < bestDist) { bestDist = d; bestK = k; }
  }
  if (bestK < 0 || bestDist > pickRadiusWorld) return null;

  const next = cp.slice();
  const lastK = nodeIdx.length - 1;
  if (bestK === 0) {
    // Drop the first node + its segment.
    next.splice(0, 3);
  } else if (bestK === lastK) {
    // Drop the last node + its segment.
    next.splice(next.length - 3, 3);
  } else {
    // Interior node: remove [innerHandle, node, innerHandle] so the two
    // segments merge, keeping the outer handles on each side.
    const at = bestK * 3; // index of the node in the control array
    next.splice(at - 1, 3);
  }
  return { ...sp, controlPoints: next };
}
