// lib/cad/geometry/solver.ts — Deterministic point-from-constraints
// helpers used by the "calc a missing point" UI dialogue and by the
// AI tool-registry. See docs/planning/in-progress/CAD_POINTS_AND_AI.md
// slice A.
//
// Every solver returns the same { ok, point | reason } envelope so
// the tool-registry can forward results to the copilot without extra
// case analysis. Coordinates follow the project convention: x = East,
// y = North; azimuths are degrees clockwise from North.

import type { Point2D } from '../types';
import { forwardPoint } from './bearing';
import { lineLineIntersection } from './intersection';

export type SolverResult =
  | { ok: true; point: Point2D; meta?: Record<string, unknown> }
  | { ok: false; reason: string };

const EPS = 1e-9;

/**
 * Complete a parallelogram given three of its corners. `opposite`
 * is the corner diagonally across from the missing one; the other
 * two arguments are the adjacent corners. Formula: D = A + C - B
 * where B is the diagonal partner of the missing point. This is
 * exact for parallelograms and a good first guess for "close to
 * rectangular" cases such as building corners that were measured
 * with mild error.
 */
export function calcFourthParallelogramCorner(
  adjacent1: Point2D,
  opposite: Point2D,
  adjacent2: Point2D,
): SolverResult {
  if (samePoint(adjacent1, opposite) || samePoint(adjacent2, opposite) || samePoint(adjacent1, adjacent2)) {
    return { ok: false, reason: 'Three distinct corners are required.' };
  }
  return {
    ok: true,
    point: {
      x: adjacent1.x + adjacent2.x - opposite.x,
      y: adjacent1.y + adjacent2.y - opposite.y,
    },
  };
}

/**
 * Compute a point at (origin + bearing × distance). Pure pass-through
 * to `forwardPoint`; wrapped here so every solver shares a result
 * envelope.
 */
export function calcPointFromBearingDistance(
  origin: Point2D,
  bearingDeg: number,
  distance: number,
): SolverResult {
  if (!Number.isFinite(bearingDeg) || !Number.isFinite(distance)) {
    return { ok: false, reason: 'Bearing and distance must be numbers.' };
  }
  if (distance < 0) {
    return { ok: false, reason: 'Distance must be non-negative.' };
  }
  return { ok: true, point: forwardPoint(origin, bearingDeg, distance) };
}

/**
 * Intersection of two rays defined by an origin + an azimuth.
 * Returns the point where the two lines meet; null if the rays
 * are parallel or the origins coincide along the same azimuth.
 */
export function calcPointFromTwoBearings(
  originA: Point2D,
  bearingADeg: number,
  originB: Point2D,
  bearingBDeg: number,
): SolverResult {
  const a2 = forwardPoint(originA, bearingADeg, 1);
  const b2 = forwardPoint(originB, bearingBDeg, 1);
  const hit = lineLineIntersection(originA, a2, originB, b2);
  if (!hit) {
    return { ok: false, reason: 'Bearings are parallel (or anti-parallel); no unique intersection.' };
  }
  return { ok: true, point: hit };
}

/**
 * Intersection of a ray (origin + azimuth) with a line segment.
 * The line segment is treated as an infinite line; clamp at the
 * caller if you need segment-only behaviour.
 */
export function calcPointFromBearingAndLine(
  origin: Point2D,
  bearingDeg: number,
  lineStart: Point2D,
  lineEnd: Point2D,
): SolverResult {
  if (samePoint(lineStart, lineEnd)) {
    return { ok: false, reason: 'Reference line must have two distinct endpoints.' };
  }
  const a2 = forwardPoint(origin, bearingDeg, 1);
  const hit = lineLineIntersection(origin, a2, lineStart, lineEnd);
  if (!hit) {
    return { ok: false, reason: 'Bearing is parallel to the reference line.' };
  }
  return { ok: true, point: hit };
}

/**
 * Project a point along a parallel offset of a reference line. The
 * result lies on a line parallel to `refStart → refEnd`, offset by
 * `perpendicularDistance` to the chosen side, at the foot of the
 * perpendicular dropped from `origin`. Useful for "the missing
 * corner sits on a wall parallel to this one, this far over".
 *
 * Side: 'LEFT' / 'RIGHT' relative to the direction of travel along
 * the reference line (right-hand rule from the line direction).
 */
export function calcPointParallelToLine(
  origin: Point2D,
  refStart: Point2D,
  refEnd: Point2D,
  perpendicularDistance: number,
  side: 'LEFT' | 'RIGHT',
  alongDistance = 0,
): SolverResult {
  if (samePoint(refStart, refEnd)) {
    return { ok: false, reason: 'Reference line must have two distinct endpoints.' };
  }
  const dx = refEnd.x - refStart.x;
  const dy = refEnd.y - refStart.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) {
    return { ok: false, reason: 'Reference line has zero length.' };
  }
  const ux = dx / len;
  const uy = dy / len;
  // Right-perpendicular (rotated +90° clockwise in screen coords;
  // since y = North, "right" of a line heading north points East).
  const sign = side === 'RIGHT' ? 1 : -1;
  const px = uy * sign;
  const py = -ux * sign;
  return {
    ok: true,
    point: {
      x: origin.x + px * perpendicularDistance + ux * alongDistance,
      y: origin.y + py * perpendicularDistance + uy * alongDistance,
    },
  };
}

function samePoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}
