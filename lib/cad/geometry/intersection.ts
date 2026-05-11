// lib/cad/geometry/intersection.ts — Intersection and bounds tests
import type { Point2D, BoundingBox, ArcGeometry } from '../types';

/** Line-line intersection (infinite lines through a->b and c->d) */
export function lineLineIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): Point2D | null {
  const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;

  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

/** Segment-segment intersection (returns null if they don't cross) */
export function segmentSegmentIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): Point2D | null {
  const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }
  return null;
}

/**
 * Intersection of an infinite line through a→b with a circle.
 * Returns:
 *   - `[]` when the line misses the circle (discriminant < 0).
 *   - `[p]` when the line is tangent (discriminant ≈ 0).
 *   - `[p1, p2]` ordered by parameter t along a→b (entry, exit).
 *
 * Solved by parameterising the line as `a + t·(b−a)` and
 * substituting into `(x−cx)² + (y−cy)² = r²`, yielding the
 * classic quadratic in t.
 */
export function lineCircleIntersections(
  a: Point2D,
  b: Point2D,
  center: Point2D,
  radius: number,
): Point2D[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;

  const A = dx * dx + dy * dy;
  if (A < 1e-20) return []; // degenerate line (a === b)
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;

  const disc = B * B - 4 * A * C;
  if (disc < -1e-9) return [];

  if (disc < 1e-9) {
    // Tangent — single intersection.
    const t = -B / (2 * A);
    return [{ x: a.x + t * dx, y: a.y + t * dy }];
  }

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-B - sqrtDisc) / (2 * A);
  const t2 = (-B + sqrtDisc) / (2 * A);
  return [
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
    { x: a.x + t2 * dx, y: a.y + t2 * dy },
  ];
}

/**
 * Intersection of an infinite line through a→b with an arc.
 * Same math as `lineCircleIntersections` plus an angular-span
 * filter so points that lie on the full circle but outside
 * the arc's sweep are discarded.
 */
export function lineArcIntersections(
  a: Point2D,
  b: Point2D,
  arc: ArcGeometry,
): Point2D[] {
  const circleHits = lineCircleIntersections(a, b, arc.center, arc.radius);
  if (circleHits.length === 0) return [];
  return circleHits.filter((p) => {
    const angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
    return isAngleInArc(angle, arc);
  });
}

/**
 * Check whether an angle (radians, measured from east) falls
 * within an arc's angular span. Mirrors what
 * `arc-render.tessellateArc` actually draws: lerp from
 * `startAngle` to `endAngle` directly, so the arc spans the
 * angular interval between them in lerp-parameter space.
 * Tests three representative branches (angle, angle ± 2π) so
 * wrap-around cases are handled.
 */
export function isAngleInArc(angle: number, arc: ArcGeometry): boolean {
  const sweep = arc.endAngle - arc.startAngle;
  if (Math.abs(sweep) < 1e-12) return false;
  const EPS = 1e-9;
  for (let k = -1; k <= 1; k++) {
    const a = angle + k * 2 * Math.PI;
    const t = (a - arc.startAngle) / sweep;
    if (t >= -EPS && t <= 1 + EPS) return true;
  }
  return false;
}

/**
 * Intersection of two circles. Returns:
 *   - `[]` when they miss (centers too far / one strictly
 *     inside the other / coincident with different radii) or
 *     when both circles are identical (infinitely many hits).
 *   - `[p]` when they're tangent (externally or internally).
 *   - `[p1, p2]` ordered by atan2 around `c1` so callers get
 *     a deterministic ordering.
 *
 * Classic radical-axis solution:
 *   d = |c2 − c1|
 *   a = (r1² − r2² + d²) / (2d)
 *   h = √(r1² − a²)
 *   p0 = c1 + a·(c2 − c1)/d
 *   p±  = p0 ± h·perpendicular
 */
export function circleCircleIntersections(
  c1: Point2D,
  r1: number,
  c2: Point2D,
  r2: number,
): Point2D[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  const EPS = 1e-9;
  // Concentric: identical circle → infinite hits (treat as
  // empty); strictly nested → no real intersection.
  if (d < EPS) return [];
  if (d > r1 + r2 + EPS) return [];
  if (d < Math.abs(r1 - r2) - EPS) return [];

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  // Tangent case — clamp small negatives from floating noise.
  if (hSq < EPS) {
    return [{ x: c1.x + (a * dx) / d, y: c1.y + (a * dy) / d }];
  }
  const h = Math.sqrt(hSq);
  const px = c1.x + (a * dx) / d;
  const py = c1.y + (a * dy) / d;
  // Perpendicular unit vector (rotated +90°).
  const rx = -dy / d;
  const ry = dx / d;
  const p1 = { x: px + h * rx, y: py + h * ry };
  const p2 = { x: px - h * rx, y: py - h * ry };
  // Order deterministically by angle around c1.
  const a1 = Math.atan2(p1.y - c1.y, p1.x - c1.x);
  const a2 = Math.atan2(p2.y - c1.y, p2.x - c1.x);
  return a1 <= a2 ? [p1, p2] : [p2, p1];
}

/**
 * Intersection of an arc with a circle — same math as
 * `circleCircleIntersections` plus a sweep-filter on the arc.
 */
export function arcCircleIntersections(
  arc: ArcGeometry,
  center: Point2D,
  radius: number,
): Point2D[] {
  const hits = circleCircleIntersections(arc.center, arc.radius, center, radius);
  if (hits.length === 0) return [];
  return hits.filter((p) => {
    const angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
    return isAngleInArc(angle, arc);
  });
}

/**
 * Intersection of two arcs — circle-circle hits filtered by
 * both arcs' angular spans.
 */
export function arcArcIntersections(
  arc1: ArcGeometry,
  arc2: ArcGeometry,
): Point2D[] {
  const hits = circleCircleIntersections(arc1.center, arc1.radius, arc2.center, arc2.radius);
  if (hits.length === 0) return [];
  return hits.filter((p) => {
    const a1 = Math.atan2(p.y - arc1.center.y, p.x - arc1.center.x);
    const a2 = Math.atan2(p.y - arc2.center.y, p.x - arc2.center.x);
    return isAngleInArc(a1, arc1) && isAngleInArc(a2, arc2);
  });
}

/** Test if a point is inside a bounding box */
export function pointInBounds(p: Point2D, bounds: BoundingBox): boolean {
  return (
    p.x >= bounds.minX &&
    p.x <= bounds.maxX &&
    p.y >= bounds.minY &&
    p.y <= bounds.maxY
  );
}

/** Test if two bounding boxes overlap */
export function boundsOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY
  );
}

/** Test if bbox inner is fully contained within outer */
export function boundsContains(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}
