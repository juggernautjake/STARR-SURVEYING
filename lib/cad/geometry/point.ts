// lib/cad/geometry/point.ts — Point math utilities
import type { Point2D } from '../types';

/** Distance between two points */
export function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** Midpoint between two points */
export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Angle from a to b in radians (atan2, CCW from east) */
export function angle(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Point at distance and angle from origin */
export function pointAtDistanceAngle(
  origin: Point2D,
  dist: number,
  angleRad: number,
): Point2D {
  return {
    x: origin.x + dist * Math.cos(angleRad),
    y: origin.y + dist * Math.sin(angleRad),
  };
}

/** Perpendicular distance from point to line segment */
export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return distance(p, a); // Degenerate segment

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  const closest: Point2D = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, closest);
}

/** Closest point on segment to p (returns the point and the parameter t) */
export function closestPointOnSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D,
): { point: Point2D; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { point: { ...a }, t: 0 };

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    point: { x: a.x + t * dx, y: a.y + t * dy },
    t,
  };
}

/** Check if point is inside polygon (ray casting algorithm) */
export function pointInPolygon(p: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;

    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
