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
 * Forward intersection of two bearing RAYS.
 *
 * ── C29, resolving C27's finding F3 ─────────────────────────────────────────────────────────────
 *
 * This function and `cogo.brgBrgPoint` answer the same surveyor question — "where do these two
 * bearings cross?" — and until now they gave **different answers**. This one intersected the
 * infinite lines and returned a hit *behind* either station; `brgBrgPoint` rejected exactly that,
 * with a comment saying why: "a bearing entered backwards would otherwise plant the point on the
 * wrong side of a station."
 *
 * The safer of the two was the one nothing called. `CalcPointDialog`'s bearing–bearing method and
 * the AI tool registry both used this one, so a mistyped bearing — a back bearing, a transposed
 * quadrant — placed a point 400 feet the wrong way and reported success.
 *
 * Fixed here rather than by deleting a module: `cogo.ts` is still the right home for the
 * multi-solution intersections (distance–distance and bearing–distance each yield up to two points,
 * which the `SolverResult` envelope has no shape for), and this file is still the right home for
 * the single-answer constraint solvers. **The boundary is the number of answers, not the subject** —
 * and now the one operation they share agrees.
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
  // Both rays must reach the point going FORWARD. The dot product of (hit − origin) with the unit
  // direction is negative when the crossing is behind that station.
  const tA = (hit.x - originA.x) * (a2.x - originA.x) + (hit.y - originA.y) * (a2.y - originA.y);
  const tB = (hit.x - originB.x) * (b2.x - originB.x) + (hit.y - originB.y) * (b2.y - originB.y);
  if (tA < -EPS || tB < -EPS) {
    return {
      ok: false,
      // Names the likely cause, because "no intersection" for two bearings that plainly cross is
      // the kind of refusal a surveyor argues with instead of re-reading their field notes.
      reason: 'The bearings only cross behind one of the points — check for a back bearing.',
    };
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
