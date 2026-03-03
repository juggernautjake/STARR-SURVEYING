// lib/cad/geometry/intersection.ts — Intersection and bounds tests
import type { Point2D, BoundingBox } from '../types';

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
