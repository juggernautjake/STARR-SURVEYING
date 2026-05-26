// lib/cad/geometry/fit.ts — Best-fit geometry helpers.
//
// Pure functions that compute an exact best-fit shape from a set of
// points, so the AI (and tools) can turn rough shots into precise
// rectangles, circles, and lines instead of eyeballed coordinates.

import type { Point2D } from '../types';

/** Andrew's monotone-chain convex hull (CCW, no repeated last point). */
export function convexHull(points: Point2D[]): Point2D[] {
  const pts = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Minimum-area bounding rectangle (rotating-calipers via brute force over
 * hull edges). Returns 4 corners in order. Recovers the true orientation
 * of a rotated rectangle/square — unlike PCA, which is ambiguous for
 * rotationally symmetric point sets. Falls back to the axis-aligned box
 * for degenerate (<3 distinct) inputs.
 */
export function fitOrientedRectangle(points: Point2D[]): Point2D[] | null {
  const finite = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finite.length < 2) return null;
  const hull = convexHull(finite);
  if (hull.length < 3) return axisAlignedBox(finite);

  let best: { area: number; corners: Point2D[] } | null = null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    const ux = ex / len, uy = ey / len;   // edge direction
    const vx = -uy, vy = ux;              // perpendicular
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy;
      const v = p.x * vx + p.y * vy;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const toXY = (u: number, v: number): Point2D => ({ x: u * ux + v * vx, y: u * uy + v * vy });
      best = {
        area,
        corners: [toXY(minU, minV), toXY(maxU, minV), toXY(maxU, maxV), toXY(minU, maxV)],
      };
    }
  }
  return best?.corners ?? axisAlignedBox(finite);
}

function axisAlignedBox(pts: Point2D[]): Point2D[] | null {
  if (pts.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return [
    { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY },
  ];
}

/**
 * Least-squares circle fit (Kåsa algebraic method). Returns center +
 * radius. Falls back to centroid + mean radius for < 3 points.
 */
export function fitCircle(points: Point2D[]): { center: Point2D; radius: number } | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n === 0) return null;
  const cx0 = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy0 = pts.reduce((s, p) => s + p.y, 0) / n;
  if (n < 3) {
    const r = pts.reduce((s, p) => s + Math.hypot(p.x - cx0, p.y - cy0), 0) / n;
    return { center: { x: cx0, y: cy0 }, radius: r };
  }
  // Solve [Suu Suv; Suv Svv] [uc; vc] = [0.5(Suuu+Suvv); 0.5(Svvv+Svuu)]
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const p of pts) {
    const u = p.x - cx0, v = p.y - cy0;
    Suu += u * u; Suv += u * v; Svv += v * v;
    Suuu += u * u * u; Svvv += v * v * v;
    Suvv += u * v * v; Svuu += v * u * u;
  }
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-12) {
    const r = pts.reduce((s, p) => s + Math.hypot(p.x - cx0, p.y - cy0), 0) / n;
    return { center: { x: cx0, y: cy0 }, radius: r };
  }
  const bu = 0.5 * (Suuu + Suvv);
  const bv = 0.5 * (Svvv + Svuu);
  const uc = (bu * Svv - bv * Suv) / det;
  const vc = (bv * Suu - bu * Suv) / det;
  const center = { x: cx0 + uc, y: cy0 + vc };
  const radius = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
  return { center, radius };
}

/**
 * Total-least-squares (PCA) best-fit line through the points, returned as
 * the segment spanning the projection extent along the principal axis.
 */
export function fitLine(points: Point2D[]): { start: Point2D; end: Point2D } | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  // Principal eigenvector of the 2×2 covariance.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta), uy = Math.sin(theta);
  let minT = Infinity, maxT = -Infinity;
  for (const p of pts) { const t = (p.x - cx) * ux + (p.y - cy) * uy; minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
  return {
    start: { x: cx + minT * ux, y: cy + minT * uy },
    end: { x: cx + maxT * ux, y: cy + maxT * uy },
  };
}
