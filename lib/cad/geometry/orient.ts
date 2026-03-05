// lib/cad/geometry/orient.ts — Survey orientation adjustment utilities
//
// Surveyed datasets from total stations are sometimes collected without proper
// backsight orientation, meaning every bearing is off by a constant rotational
// error. This module provides the math to:
//
//   1. Compute a correction angle from a single known reference leg
//      (user specifies: "the bearing from point A to point B should be X°")
//   2. Compute a correction angle from two measured azimuths
//      (the measured azimuth of a line vs. the known / deed azimuth of that line)
//   3. Apply any arbitrary rotation to all features in the drawing,
//      rotating about the centroid (or a user-supplied pivot point)
//
// All angular values use survey azimuth convention: 0 = North, clockwise, degrees.
// All coordinate values are in world-space feet (x = Easting, y = Northing).

import type { Feature, Point2D } from '../types';
import { rotate, transformFeature } from './transform';
import { inverseBearingDistance } from './bearing';

// ─────────────────────────────────────────────────────────────────────────────
// Centroid helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Collect all vertices from a feature's geometry into a flat array. */
function featurePoints(f: Feature): Point2D[] {
  const g = f.geometry;
  switch (g.type) {
    case 'POINT':       return g.point ? [g.point] : [];
    case 'LINE':        return [g.start!, g.end!].filter(Boolean);
    case 'POLYLINE':
    case 'POLYGON':
    case 'MIXED_GEOMETRY': return g.vertices ?? [];
    default:            return [];
  }
}

/**
 * Compute the unweighted centroid (average point) of all geometry vertices
 * across the given set of features.  Returns {x:0, y:0} when the set is empty.
 */
export function computeCentroid(features: Feature[]): Point2D {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const f of features) {
    for (const p of featurePoints(f)) {
      sumX += p.x;
      sumY += p.y;
      count++;
    }
  }

  if (count === 0) return { x: 0, y: 0 };
  return { x: sumX / count, y: sumY / count };
}

// ─────────────────────────────────────────────────────────────────────────────
// Correction-angle computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the rotation correction angle (degrees, counter-clockwise in survey
 * azimuth space, i.e. the amount to ADD to every measured azimuth to get the
 * true azimuth) given:
 *   @param measuredAzimuth  — The azimuth of a reference line as shot in the field (degrees, 0=N CW)
 *   @param trueAzimuth      — The known / deed azimuth for that same line (degrees)
 *
 * Returns the correction in degrees that must be applied as a CCW rotation of
 * the drawing to align measured bearings with true bearings.
 *
 * Example: measured 92°, deed says 45° → correction = 45 – 92 = –47°
 *   (rotate drawing 47° CW, i.e. –47° CCW, to fix orientation)
 */
export function computeOrientationCorrection(
  measuredAzimuth: number,
  trueAzimuth: number,
): number {
  // Normalise to 0–360
  const m = ((measuredAzimuth % 360) + 360) % 360;
  const t = ((trueAzimuth % 360) + 360) % 360;

  // Correction to add to every measured azimuth (signed, –180…+180)
  let correction = t - m;
  if (correction > 180)  correction -= 360;
  if (correction < -180) correction += 360;
  return correction;
}

/**
 * Compute the orientation correction from two world-space points and a
 * known/deed bearing for the line they define.
 *
 * @param from            — Start point of the reference line in world space
 * @param to              — End point of the reference line in world space
 * @param knownAzimuth    — The deed / record azimuth for that line (degrees)
 *
 * Returns correction in degrees (CCW rotation to apply to the drawing).
 */
export function computeCorrectionFromPoints(
  from: Point2D,
  to: Point2D,
  knownAzimuth: number,
): number {
  const { azimuth: measured } = inverseBearingDistance(from, to);
  return computeOrientationCorrection(measured, knownAzimuth);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotation application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rotate all features in `features` by `correctionDeg` degrees (survey
 * convention: positive = CCW) around `pivot`.
 *
 * Survey azimuth space uses clockwise angles, but spatial rotation uses CCW.
 * A correction of +C° in bearing space corresponds to a +C° CCW rotation of
 * the drawing geometry (because rotating the drawing CCW shifts all bearings CW
 * by the same amount, which is equivalent to subtracting that angle from every
 * azimuth — so applying +C° CCW aligns measured+C° → true).
 *
 * Returns a new array of rotated Feature objects (originals unmodified).
 */
export function applyOrientationRotation(
  features: Feature[],
  correctionDeg: number,
  pivot: Point2D,
): Feature[] {
  // Convert survey-space correction (CCW positive) to math radians (CCW positive)
  const angleRad = correctionDeg * (Math.PI / 180);
  return features.map((f) => transformFeature(f, (p) => rotate(p, pivot, angleRad)));
}

// ─────────────────────────────────────────────────────────────────────────────
// All-in-one: compute + apply
// ─────────────────────────────────────────────────────────────────────────────

export interface OrientationResult {
  /** Rotated features (originals unmodified) */
  features: Feature[];
  /** The correction angle that was applied (degrees, CCW) */
  correctionDeg: number;
  /** The pivot point used for the rotation */
  pivot: Point2D;
}

/**
 * Adjust the orientation of `features` so that the measured bearing of a
 * reference line (from → to) matches `knownAzimuth`.
 *
 * @param pivot  Optional pivot point; defaults to centroid of all features.
 */
export function orientSurveyByReferenceLine(
  features: Feature[],
  from: Point2D,
  to: Point2D,
  knownAzimuth: number,
  pivot?: Point2D,
): OrientationResult {
  const correctionDeg = computeCorrectionFromPoints(from, to, knownAzimuth);
  const pivotPt = pivot ?? computeCentroid(features);
  const rotated = applyOrientationRotation(features, correctionDeg, pivotPt);
  return { features: rotated, correctionDeg, pivot: pivotPt };
}

/**
 * Adjust the orientation of `features` by an explicit user-supplied correction
 * angle (positive = CCW, negative = CW).
 *
 * @param pivot  Optional pivot point; defaults to centroid of all features.
 */
export function orientSurveyByManualCorrection(
  features: Feature[],
  correctionDeg: number,
  pivot?: Point2D,
): OrientationResult {
  const pivotPt = pivot ?? computeCentroid(features);
  const rotated = applyOrientationRotation(features, correctionDeg, pivotPt);
  return { features: rotated, correctionDeg, pivot: pivotPt };
}
