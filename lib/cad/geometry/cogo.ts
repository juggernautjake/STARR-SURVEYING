// lib/cad/geometry/cogo.ts
//
// COGO "calculate a new point from two known points". Three classic surveyor
// intersection methods, each thin wrappers over the geometry primitives in
// ./intersection.ts:
//
//   • Distance–Distance : two distances → intersect the two distance circles.
//   • Bearing–Distance  : a bearing ray from A + a distance circle around B.
//   • Bearing–Bearing   : two bearing rays → their forward intersection.
//
// Azimuth is survey degrees (0 = North, clockwise), matching bearing.ts
// (forwardPoint / parseBearing) and the world convention x = East, y = North.
// Distance–Distance and Bearing–Distance can yield 0, 1, or 2 solutions;
// callers let the surveyor pick which. Bearing–Bearing yields 0 or 1.

import type { Point2D } from '../types';
import {
  circleCircleIntersections,
  rayCircleIntersections,
  lineLineIntersection,
} from './intersection';

export type CogoMethod = 'DIST_DIST' | 'BRG_DIST' | 'BRG_BRG';

/** Unit direction of a survey azimuth (deg, 0 = North, CW). */
function azDir(azDeg: number): Point2D {
  const rad = (azDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: Math.cos(rad) };
}

/** Distance–distance: the up-to-2 points at distance `da` from `a` AND `db`
 *  from `b` (intersection of the two distance circles). */
export function distDistPoints(a: Point2D, da: number, b: Point2D, db: number): Point2D[] {
  if (!(da > 0) || !(db > 0)) return [];
  return circleCircleIntersections(a, da, b, db);
}

/** Bearing–distance: the up-to-2 points along the bearing ray from `from`
 *  (azimuth `azDeg`) that are also at distance `radius` from `center`. Ordered
 *  nearest-first along the ray. */
export function brgDistPoints(from: Point2D, azDeg: number, center: Point2D, radius: number): Point2D[] {
  if (!Number.isFinite(azDeg) || !(radius > 0)) return [];
  return rayCircleIntersections(from, azDeg, center, radius);
}

/** Bearing–bearing: the single forward intersection of the bearing ray from
 *  `a` (azimuth `azA`) and the bearing ray from `b` (azimuth `azB`). Empty when
 *  the rays are parallel or only meet behind one of the stations. */
export function brgBrgPoint(a: Point2D, azA: number, b: Point2D, azB: number): Point2D[] {
  if (!Number.isFinite(azA) || !Number.isFinite(azB)) return [];
  const dA = azDir(azA);
  const dB = azDir(azB);
  const a2 = { x: a.x + dA.x, y: a.y + dA.y };
  const b2 = { x: b.x + dB.x, y: b.y + dB.y };
  const hit = lineLineIntersection(a, a2, b, b2);
  if (!hit) return []; // parallel bearings
  // Both rays must reach the point going forward (a bearing entered backwards
  // would otherwise plant the point on the wrong side of a station).
  const tA = (hit.x - a.x) * dA.x + (hit.y - a.y) * dA.y;
  const tB = (hit.x - b.x) * dB.x + (hit.y - b.y) * dB.y;
  if (tA < -1e-9 || tB < -1e-9) return [];
  return [hit];
}

export interface CogoInput {
  method: CogoMethod;
  /** First selected reference point. */
  a: Point2D;
  /** Second selected reference point. */
  b: Point2D;
  /** Distance from `a` (DIST_DIST). */
  distA?: number;
  /** Distance from `b` (DIST_DIST, BRG_DIST). */
  distB?: number;
  /** Bearing azimuth (deg) from `a` (BRG_DIST, BRG_BRG). */
  azA?: number;
  /** Bearing azimuth (deg) from `b` (BRG_BRG). */
  azB?: number;
}

/** Compute the candidate solution point(s) for a COGO input. Returns [] when
 *  the inputs are incomplete/invalid or the construction has no real solution;
 *  1 or 2 points otherwise (callers pick which for the 2-solution cases). */
export function computeCogoSolutions(input: CogoInput): Point2D[] {
  switch (input.method) {
    case 'DIST_DIST':
      return distDistPoints(input.a, input.distA ?? NaN, input.b, input.distB ?? NaN);
    case 'BRG_DIST':
      // Bearing ray from A, distance circle around B.
      return brgDistPoints(input.a, input.azA ?? NaN, input.b, input.distB ?? NaN);
    case 'BRG_BRG':
      return brgBrgPoint(input.a, input.azA ?? NaN, input.b, input.azB ?? NaN);
    default:
      return [];
  }
}
