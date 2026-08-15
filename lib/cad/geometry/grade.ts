// lib/cad/geometry/grade.ts — C29, slope, grade and vertical curves
//
// The third of the four capabilities C27 found genuinely absent. Grade between two shots is
// everyday work; the vertical curve is what turns two grades into something a road can be built on.
//
// ── ONE CONVENTION, STATED ONCE ─────────────────────────────────────────────────────────────────
//
// Grade is a PERCENTAGE throughout, positive uphill in the direction of travel. Not a ratio, not a
// decimal fraction, not degrees. Every one of those is used somewhere in surveying, and mixing two
// of them gives an answer that is off by a factor of 100 while looking entirely reasonable — 2%
// and 0.02 both read as "a gentle grade". The ratio and the vertical angle are reported ALONGSIDE
// the percentage rather than instead of it, so a caller never has to guess which they were handed.

import type { Point2D } from '../types';

export interface GradeResult {
  /** Horizontal distance. */
  run: number;
  /** Elevation difference, signed: positive means uphill from `a` to `b`. */
  rise: number;
  /** Rise over run as a percentage. */
  gradePercent: number;
  /**
   * Run per unit of rise — the "1 in N" a spec sheet uses. `null` for dead level, because "1 in ∞"
   * is not a number anybody wants printed on a plan.
   */
  ratio: number | null;
  /** Vertical angle in degrees, positive up. */
  verticalAngleDeg: number;
  /** Slope distance — the actual chained length, which is what a tape measures. */
  slopeDistance: number;
}

/**
 * Grade from `a` to `b`.
 *
 * Returns null for a zero run: two shots on the same spot have no grade, and reporting one as
 * infinite or as zero would both be wrong in ways a caller might not check.
 */
export function gradeBetween(
  a: Point2D & { z?: number },
  b: Point2D & { z?: number },
  elevA?: number,
  elevB?: number,
): GradeResult | null {
  const za = elevA ?? a.z ?? 0;
  const zb = elevB ?? b.z ?? 0;
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  if (run <= 1e-9) return null;

  const rise = zb - za;
  const gradePercent = (rise / run) * 100;
  return {
    run,
    rise,
    gradePercent,
    ratio: Math.abs(rise) <= 1e-12 ? null : run / Math.abs(rise),
    verticalAngleDeg: (Math.atan2(rise, run) * 180) / Math.PI,
    slopeDistance: Math.hypot(run, rise),
  };
}

/** Elevation after running `distance` at `gradePercent`. */
export function elevationAfter(startElev: number, gradePercent: number, distance: number): number {
  return startElev + (gradePercent / 100) * distance;
}

// ── Vertical curve ─────────────────────────────────────────────────────────────────────────────

export interface VerticalCurve {
  /** The grades the curve joins, in percent. **Carried on the result rather than left for the
   *  caller to hold**: the first version tried to recover `gIn` from the geometry and could not do
   *  it cleanly, and a caller keeping them alongside is a pair of values free to drift apart. */
  gIn: number;
  gOut: number;
  /** Station and elevation where the curve begins (beginning of vertical curve). */
  bvcStation: number;
  bvcElevation: number;
  /** Station and elevation where it ends. */
  evcStation: number;
  evcElevation: number;
  /** Algebraic difference `gOut − gIn`, in percent. Positive is a sag, negative is a crest. */
  a: number;
  /** `L / |A|` — the rate of vertical curvature. Design standards are written in K. */
  k: number | null;
  /** `'CREST' | 'SAG' | 'NONE'`, from the sign of A. */
  shape: 'CREST' | 'SAG' | 'NONE';
  /** Station and elevation of the high point (crest) or low point (sag), when one falls on the
   *  curve. Null when the grades do not reverse — a curve between +2% and +4% never turns over,
   *  and reporting a turning point outside its own limits is worse than reporting none. */
  turningStation: number | null;
  turningElevation: number | null;
  length: number;
}

/**
 * Equal-tangent parabolic vertical curve.
 *
 * The standard highway curve: a parabola whose grade changes linearly from `gIn` to `gOut` over
 * `length`, symmetric about the PVI. `gIn`/`gOut` are percentages.
 *
 * Returns null for a non-positive length. A zero-length "curve" is the two tangents meeting at a
 * point, and every station formula below divides by L.
 */
export function verticalCurve(
  pviStation: number,
  pviElevation: number,
  gIn: number,
  gOut: number,
  length: number,
): VerticalCurve | null {
  if (!(length > 0)) return null;

  const half = length / 2;
  const bvcStation = pviStation - half;
  const evcStation = pviStation + half;
  // Back along the incoming tangent from the PVI, forward along the outgoing one.
  const bvcElevation = pviElevation - (gIn / 100) * half;
  const evcElevation = pviElevation + (gOut / 100) * half;

  const a = gOut - gIn;
  const shape: VerticalCurve['shape'] =
    Math.abs(a) <= 1e-12 ? 'NONE' : a < 0 ? 'CREST' : 'SAG';

  // Turning point: where the derivative of the parabola is zero, measured from the BVC.
  let turningStation: number | null = null;
  let turningElevation: number | null = null;
  if (shape !== 'NONE') {
    const x = (-gIn * length) / a;
    // Only report it when it actually lies ON the curve. Two grades of the same sign give an x
    // outside [0, L], and a "high point" 400 ft past the end of the curve is a number somebody
    // would stake.
    if (x >= 0 && x <= length) {
      turningStation = bvcStation + x;
      turningElevation = elevationOnVerticalCurve(bvcElevation, gIn, a, length, x);
    }
  }

  return {
    gIn,
    gOut,
    bvcStation,
    bvcElevation,
    evcStation,
    evcElevation,
    a,
    k: shape === 'NONE' ? null : length / Math.abs(a),
    shape,
    turningStation,
    turningElevation,
    length,
  };
}

/** Elevation `x` along the curve from the BVC. Exported so a caller can build a stake-out table. */
export function elevationOnVerticalCurve(
  bvcElevation: number,
  gIn: number,
  a: number,
  length: number,
  x: number,
): number {
  return bvcElevation + (gIn / 100) * x + (a * x * x) / (200 * length);
}

/**
 * Elevation at an absolute station on a solved curve.
 *
 * Stations outside the curve follow the TANGENTS rather than the parabola — which is what the road
 * actually does, and what a stake-out table has to say for the shots either side of the BVC and
 * EVC. Extending the parabola instead would send the profile off in a direction the road never
 * goes, more wrongly the further out it is asked.
 */
export function elevationAtStation(curve: VerticalCurve, station: number): number {
  if (station <= curve.bvcStation) {
    return curve.bvcElevation + (curve.gIn / 100) * (station - curve.bvcStation);
  }
  if (station >= curve.evcStation) {
    return curve.evcElevation + (curve.gOut / 100) * (station - curve.evcStation);
  }
  return elevationOnVerticalCurve(
    curve.bvcElevation, curve.gIn, curve.a, curve.length, station - curve.bvcStation,
  );
}

/**
 * Stake-out table at a fixed interval, plus the BVC, EVC and turning point.
 *
 * The interval alone would miss the three stations that matter most — the turning point in
 * particular almost never lands on an even 50 — and a profile table without its high point is a
 * table somebody has to interpolate by hand at the exact spot where drainage depends on it.
 */
export function verticalCurveTable(
  curve: VerticalCurve,
  interval = 50,
): Array<{ station: number; elevation: number; note?: string }> {
  const rows: Array<{ station: number; elevation: number; note?: string }> = [];
  const push = (station: number, note?: string) => {
    rows.push({ station, elevation: elevationAtStation(curve, station), note });
  };

  push(curve.bvcStation, 'BVC');
  if (interval > 0) {
    // First even multiple of the interval strictly inside the curve.
    const first = Math.ceil(curve.bvcStation / interval + 1e-9) * interval;
    for (let s = first; s < curve.evcStation - 1e-9; s += interval) {
      if (Math.abs(s - curve.bvcStation) > 1e-9) push(s);
    }
  }
  if (curve.turningStation !== null) push(curve.turningStation, curve.shape === 'CREST' ? 'High point' : 'Low point');
  push(curve.evcStation, 'EVC');

  return rows.sort((p, q) => p.station - q.station);
}
