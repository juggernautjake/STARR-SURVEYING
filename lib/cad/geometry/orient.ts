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
//   4. Extract all meaningful line segments from drawing features so the user
//      can visually pick a reference line from the actual drawing
//   5. Generate smart bearing candidates for a selected line — snap-to-angle
//      suggestions that the user can choose from (Phase 6 will enhance these
//      with AI-parsed deed calls)
//
// All angular values use survey azimuth convention: 0 = North, clockwise, degrees.
// All coordinate values are in world-space feet (x = Easting, y = Northing).

import type { Feature, Point2D } from '../types';
import { rotate, transformFeature } from './transform';
import { inverseBearingDistance, formatBearing } from './bearing';

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

// ─────────────────────────────────────────────────────────────────────────────
// Reference-line extraction — scan drawing features → candidate segments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single line segment extracted from drawing features, usable as an
 * orientation reference line.
 */
export interface ReferenceLine {
  /** Unique identifier (featureId + ':' + segmentIndex) */
  id: string;
  /** Feature this segment belongs to */
  featureId: string;
  /** Segment index within a polyline/polygon (0 for LINE features) */
  segmentIndex: number;
  from: Point2D;
  to: Point2D;
  /** Length in world-space units */
  length: number;
  /** Measured azimuth (0 = North, clockwise, degrees) */
  azimuth: number;
  /** Human-readable display label */
  label: string;
}

const DEFAULT_MIN_LENGTH = 0.5; // feet — ignore tiny rounding segments
const MAX_LINES = 80;           // cap to keep the picker list manageable

/**
 * Extract all meaningful line segments from `features`.
 * Results are sorted longest-first (most useful reference lines at the top).
 *
 * @param minLength  Minimum segment length to include (default 0.5 ft).
 */
export function extractReferenceLines(
  features: Feature[],
  minLength = DEFAULT_MIN_LENGTH,
): ReferenceLine[] {
  const lines: ReferenceLine[] = [];

  for (const feature of features) {
    const g = feature.geometry;

    if (g.type === 'LINE' && g.start && g.end) {
      const { azimuth, distance } = inverseBearingDistance(g.start, g.end);
      if (distance >= minLength) {
        lines.push({
          id: `${feature.id}:0`,
          featureId: feature.id,
          segmentIndex: 0,
          from: g.start,
          to: g.end,
          length: distance,
          azimuth,
          label: 'Line',
        });
      }
    } else if (
      (g.type === 'POLYLINE' || g.type === 'POLYGON' || g.type === 'MIXED_GEOMETRY') &&
      g.vertices && g.vertices.length >= 2
    ) {
      const verts = g.vertices;
      const count = g.type === 'POLYGON' ? verts.length : verts.length - 1;
      const featureLabel = g.type === 'POLYGON' ? 'Polygon' : 'Polyline';

      for (let i = 0; i < count; i++) {
        const from = verts[i];
        const to   = verts[(i + 1) % verts.length];
        const { azimuth, distance } = inverseBearingDistance(from, to);
        if (distance >= minLength) {
          lines.push({
            id: `${feature.id}:${i}`,
            featureId: feature.id,
            segmentIndex: i,
            from,
            to,
            length: distance,
            azimuth,
            label: `${featureLabel} seg ${i + 1}`,
          });
        }
      }
    }
    // POINT, ARC, SPLINE features do not yield reference lines here
  }

  // Sort longest first — the user's most significant boundary lines appear first
  lines.sort((a, b) => b.length - a.length);
  return lines.slice(0, MAX_LINES);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-ready bearing candidates — smart snap suggestions for a reference line
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source tag for a bearing candidate.  Phase 6 will add 'DEED_AI' once the
 * deed-OCR / NLP pipeline is wired up.
 */
export type BearingCandidateSource =
  | 'SNAP_1DEG'
  | 'SNAP_5DEG'
  | 'SNAP_15DEG'
  | 'SNAP_30DEG'
  | 'SNAP_45DEG'
  | 'CARDINAL'
  | 'DIAGONAL'
  | 'REVERSE'
  | 'PARALLEL'
  | 'PERPENDICULAR'
  | 'DEED_AI';  // Phase 6

/**
 * A single bearing candidate proposed for a reference line.
 */
export interface BearingCandidate {
  /** Proposed true azimuth (0 = North, clockwise, degrees) */
  azimuth: number;
  /** Formatted bearing string (e.g. "N 45°30'00\" E") */
  label: string;
  /** Human-readable explanation shown to the user */
  reason: string;
  /** Rotation (degrees) the drawing would undergo if this candidate is chosen */
  correctionDeg: number;
  /**
   * Confidence 0–1.  Currently rule-based (proximity-to-snap).
   * Phase 6 AI deed parsing will supply deed-calibrated scores.
   */
  confidence: number;
  source: BearingCandidateSource;
}

/**
 * Normalise an azimuth to [0, 360).
 */
function normAz(a: number): number {
  return ((a % 360) + 360) % 360;
}

/**
 * Snap `az` to the nearest multiple of `step` degrees, returning the result
 * normalised to [0, 360).
 */
function snapTo(az: number, step: number): number {
  return normAz(Math.round(az / step) * step);
}

/**
 * Generate smart bearing candidates for a line with the given measured azimuth.
 *
 * In addition to mathematical snap suggestions, passing `otherLines` will add
 * "parallel to …" and "perpendicular to …" candidates based on significant
 * lines already in the drawing — useful when the surveyor knows their property
 * boundary is supposed to be parallel to an adjacent road shot in the same file.
 *
 * Phase 6 AI integration point: call this function and then merge in
 * AI-generated candidates (source: 'DEED_AI') before passing the array to
 * the UI.  Each 'DEED_AI' candidate should carry a confidence score ≥ 0.5.
 *
 * @param measuredAzimuth  The azimuth of the selected line as currently drawn.
 * @param otherLines       Other extracted reference lines (optional) for
 *                         parallel/perpendicular suggestions.
 */
export function generateBearingCandidates(
  measuredAzimuth: number,
  otherLines?: ReferenceLine[],
): BearingCandidate[] {
  const m = normAz(measuredAzimuth);
  const candidates: BearingCandidate[] = [];
  const seen = new Set<number>(); // deduplicate by rounded azimuth

  function add(
    az: number,
    reason: string,
    confidence: number,
    source: BearingCandidateSource,
  ) {
    const n = normAz(az);
    const key = Math.round(n * 100); // deduplicate to 0.01° precision
    if (seen.has(key)) return;
    seen.add(key);
    const correctionDeg = computeOrientationCorrection(m, n);
    candidates.push({
      azimuth: n,
      label: formatBearing(n),
      reason,
      correctionDeg,
      confidence,
      source,
    });
  }

  // ── Snap suggestions ──────────────────────────────────────────────────────
  add(snapTo(m,  1), 'Round to nearest 1°',   0.55, 'SNAP_1DEG');
  add(snapTo(m,  5), 'Round to nearest 5°',   0.60, 'SNAP_5DEG');
  add(snapTo(m, 15), 'Round to nearest 15°',  0.65, 'SNAP_15DEG');
  add(snapTo(m, 30), 'Round to nearest 30°',  0.70, 'SNAP_30DEG');
  add(snapTo(m, 45), 'Round to nearest 45°',  0.70, 'SNAP_45DEG');

  // ── Cardinal directions (N/E/S/W) ─────────────────────────────────────────
  for (const [az, label] of [
    [0,   'True North (N 0°)'],
    [90,  'Due East (N 90°E)'],
    [180, 'True South (S 0°)'],
    [270, 'Due West (N 90°W)'],
  ] as [number, string][]) {
    const correction = computeOrientationCorrection(m, az);
    if (Math.abs(correction) <= 45) {
      add(az, label, 0.75, 'CARDINAL');
    }
  }

  // ── Diagonal (45° intercardinals) ─────────────────────────────────────────
  for (const [az, label] of [
    [45,  'NE diagonal (N 45°E)'],
    [135, 'SE diagonal (S 45°E)'],
    [225, 'SW diagonal (S 45°W)'],
    [315, 'NW diagonal (N 45°W)'],
  ] as [number, string][]) {
    const correction = computeOrientationCorrection(m, az);
    if (Math.abs(correction) <= 45) {
      add(az, label, 0.65, 'DIAGONAL');
    }
  }

  // ── Reverse of measured bearing ───────────────────────────────────────────
  add(normAz(m + 180), 'Reverse direction (180° flip)', 0.50, 'REVERSE');

  // ── Parallel / perpendicular to other lines in drawing ───────────────────
  if (otherLines) {
    const significant = otherLines
      .filter((l) => l.length > 5)   // only meaningful-length lines
      .slice(0, 10);                  // limit to top 10

    for (const other of significant) {
      const otherAz = normAz(other.azimuth);
      const perpAz  = normAz(otherAz + 90);

      const cPar  = computeOrientationCorrection(m, otherAz);
      const cPerp = computeOrientationCorrection(m, perpAz);

      if (Math.abs(cPar) <= 60) {
        add(
          otherAz,
          `Parallel to ${other.label} (${formatBearing(otherAz)})`,
          0.60,
          'PARALLEL',
        );
      }
      if (Math.abs(cPerp) <= 60) {
        add(
          perpAz,
          `Perpendicular to ${other.label} (${formatBearing(perpAz)})`,
          0.60,
          'PERPENDICULAR',
        );
      }
    }
  }

  // Sort by absolute correction magnitude (smallest change first — most
  // plausible corrections appear at the top of the list)
  candidates.sort((a, b) => Math.abs(a.correctionDeg) - Math.abs(b.correctionDeg));
  return candidates;
}
