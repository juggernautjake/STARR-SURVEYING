// lib/research/rotation.service.ts — the entry point for putting an old survey on the grid you shoot.
//
// The owner's ask, verbatim in intent:
//
//   *"If we have an older survey where the bearings are 1–3 degrees off of our GPS recordings from
//   the actual field, we can input our recordings and correctly rotate the original so that the
//   bearings and distances most closely align with the Texas State Plane version we are shooting. Or
//   we might even have robotic and need to adjust the bearing and distances based on what we put in
//   for our initial bearing."*
//
// `worker/src/services/bearing-rotation.ts` does the arithmetic and has done since S4. It had no
// caller of any kind — no route, no page, no service. The one operation in Phase I that a *person*
// has to start, because it needs field measurements only they can supply, was the one with no way to
// start it. This is that way in.
//
// ── WHY THIS IS A SERVICE AND NOT JUST A ROUTE ──────────────────────────────────────────────────
//
// Two of the three decisions here are ones a route would be a bad place to make, because they are
// about what the answer MEANS rather than about HTTP:
//
//   **Scale stays off unless asked for.** `fitRotation` can solve scale as well as rotation, and
//   letting it float makes every fit look better. It also swallows the two things a distance
//   disagreement is usually trying to say: grid-versus-ground (the State Plane combined factor,
//   ~1 part in 10,000 — about half a foot in a mile) or a unit mistake (varas read as feet, which is
//   a factor of 2.78 and not subtle). So `fitScale` is opt-in and the response says which of those
//   two the observed scale looks like, in the units a surveyor thinks in.
//
//   **One tie is not a fit.** With a single common point the residual is zero by construction — not
//   because the survey agrees with the ground, but because there is nothing left over to disagree.
//   That reads as a perfect result and is an unverifiable one. It is reported as the warning it is,
//   at the top level of the response rather than buried in a statement string.

import {
  fitRotation, rotateCalls, rotationFromBackthesight, compareLine,
  type CommonPoint, type RotationFit, type RotatedCall,
} from '@/worker/src/services/bearing-rotation';
import { traverse, parseBearing, type TraverseInput, type Point } from '@/worker/src/services/survey-geometry';

/** A record call as the client already holds it — bearing text and a distance. */
export interface RecordCall {
  bearing: string | null;
  distance: number | null;
  /** Written unit, so varas are walked as varas. Omitted means US survey feet. */
  unit?: TraverseInput['unit'];
  toPoint?: string | null;
}

/** A corner the crew occupied, tied to the record corner it is believed to be. */
export interface FieldTie {
  label: string;
  /** Index of the record CALL whose end point this is (0-based), i.e. the corner it arrives at. */
  callIndex: number;
  /** Measured grid coordinates, US survey feet. */
  measured: Point;
}

export type RotationBasis =
  /** Best-fit over two or more tied corners. */
  | { kind: 'ties'; ties: FieldTie[]; fitScale?: boolean }
  /** A single line held as the basis, as a robotic setup does. */
  | { kind: 'backsight'; recordBearing: string; measuredBearing: string };

export interface RotationResult {
  ok: true;
  basis: 'ties' | 'backsight';
  rotationDeg: number;
  /** Formatted the way a surveyor reads it: "1°42'18\" clockwise". */
  rotationLabel: string;
  /** The scale the transform actually APPLIED. 1 unless `fitScale` was asked for — applying a scale
   *  you did not request would silently resize a boundary. */
  appliedScale: number;
  /** The ratio the ties actually SHOW, computed without fitting it. Null with fewer than two ties.
   *
   *  Kept separate from `appliedScale` on purpose: these are different numbers answering different
   *  questions, and one field holding whichever happened to be available is how a diagnostic ends up
   *  being applied as a correction. */
  observedScale: number | null;
  /** Present only for a ties fit. */
  fit: RotationFit | null;
  rotated: RotatedCall[];
  skipped: Array<{ index: number; reason: string }>;
  /** True when nothing in the arithmetic can check the answer. */
  unchecked: boolean;
  /** Per-tie comparison of the record line against the measured one. */
  lineChecks: string[];
  statement: string;
  nextStep: string;
  /** What this operation did NOT do. Shown beside the result, never implied. */
  caveats: string[];
}

export interface RotationFailure {
  ok: false;
  reason: string;
  nextStep: string;
}

/** Degrees as a surveyor reads them, with the sense named rather than signed. */
export function formatRotationLabel(deg: number): string {
  const sense = deg >= 0 ? 'clockwise' : 'counter-clockwise';
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = ((a - d) * 60 - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(0).padStart(2, '0')}" ${sense}`;
}

/** What a scale factor of this size usually means.
 *
 *  Named rather than printed as a bare number, because the two candidates are orders of magnitude
 *  apart and confusing them is expensive in opposite directions: a combined factor left uncorrected
 *  is half a foot in a mile, while varas read as feet is a boundary in the wrong place entirely. */
export function explainScale(scale: number): string {
  const ppm = (scale - 1) * 1_000_000;
  if (Math.abs(scale - 25 / 9) < 0.02) {
    return `Scale ${scale.toFixed(6)} is almost exactly 25/9 — that is the VARA. The record's ` +
      `distances are in varas and were walked as feet. Fix the units; do not fit this as a scale.`;
  }
  if (Math.abs(scale - 9 / 25) < 0.01) {
    return `Scale ${scale.toFixed(6)} is almost exactly 9/25 — the reciprocal of the vara. The ` +
      `measured and record distances are in different units. Fix the units; do not fit this as a scale.`;
  }
  if (Math.abs(ppm) < 400) {
    return `Scale ${scale.toFixed(8)} is ${ppm.toFixed(0)} ppm from unity — the size of a Texas State ` +
      `Plane combined factor (grid vs ground). About ${(Math.abs(ppm) * 5280 / 1_000_000).toFixed(2)} ft ` +
      `per mile. That is a real and expected difference, not a disagreement about the boundary.`;
  }
  return `Scale ${scale.toFixed(6)} (${ppm.toFixed(0)} ppm) is too large for a grid factor and not a ` +
    `unit ratio. Something else differs — check that the tied corners are the corners the record ` +
    `calls for before accepting this fit.`;
}

/** The ratio between what the ground measures and what the record recites, computed WITHOUT fitting
 *  it.
 *
 *  `fitRotation(points, false)` returns `scale: 1` — a hardcoded constant, not an observation. That
 *  is correct for the transform (nothing was fitted) but it means the default path reports no scale
 *  at all, and a record recited in varas but walked as feet would come back with enormous residuals
 *  and no explanation of why. The residuals say *something is wrong*; only the ratio says *the units
 *  are wrong*.
 *
 *  Rotation-invariant by construction: it compares how far the two point sets spread about their own
 *  centroids, which no rotation changes. Needs two points; one point has no spread. */
export function observedScale(points: CommonPoint[]): number | null {
  if (points.length < 2) return null;
  const cen = (get: (p: CommonPoint) => Point): Point => ({
    n: points.reduce((s, p) => s + get(p).n, 0) / points.length,
    e: points.reduce((s, p) => s + get(p).e, 0) / points.length,
  });
  const cR = cen((p) => p.record);
  const cM = cen((p) => p.measured);
  let sr = 0, sm = 0;
  for (const p of points) {
    sr += (p.record.n - cR.n) ** 2 + (p.record.e - cR.e) ** 2;
    sm += (p.measured.n - cM.n) ** 2 + (p.measured.e - cM.e) ** 2;
  }
  if (sr === 0) return null;
  return Math.sqrt(sm / sr);
}

/** Is this ratio far enough from 1 to be worth saying out loud?
 *
 *  200 ppm is well above the noise of a good tie and well below a State Plane combined factor, which
 *  `explainScale` then names for what it is. */
export const SCALE_NOTEWORTHY_PPM = 200;

const CAVEATS = [
  'A rotation does not correct the record survey. It expresses it in the basis you are measuring in, ' +
    'and the SHAPE is untouched — every internal angle is exactly what the original surveyor observed.',
  'Rotated bearings are for comparison with your field work. They are NOT what the record says, and ' +
    'a plat or description must still recite the record call.',
];

/** Rotate a record description onto measured field work. */
export function rotateRecord(
  calls: RecordCall[], basis: RotationBasis,
): RotationResult | RotationFailure {
  if (calls.length === 0) {
    return {
      ok: false,
      reason: 'There are no record calls to rotate.',
      nextStep: 'Extract or enter the record description first.',
    };
  }

  const rotatableCalls = calls.map((c) => ({ bearing: c.bearing, distance: c.distance }));

  // ── Backsight: one line held, as a robotic setup does ───────────────────────────────────────
  if (basis.kind === 'backsight') {
    const rec = parseBearing(basis.recordBearing);
    const mea = parseBearing(basis.measuredBearing);
    if (!rec || !mea) {
      return {
        ok: false,
        reason:
          `Could not read ${!rec ? `the record bearing "${basis.recordBearing}"` : ''}` +
          `${!rec && !mea ? ' or ' : ''}` +
          `${!mea ? `the measured bearing "${basis.measuredBearing}"` : ''}.`,
        nextStep: 'Enter bearings as quadrant bearings, e.g. N 45°30\'00" E, or as an azimuth in degrees.',
      };
    }
    const { rotationDeg, statement } = rotationFromBackthesight(rec.azimuthDeg, mea.azimuthDeg);
    const { rotated, skipped } = rotateCalls(rotatableCalls, rotationDeg);
    return {
      ok: true, basis: 'backsight', rotationDeg,
      rotationLabel: formatRotationLabel(rotationDeg),
      appliedScale: 1, observedScale: null, fit: null, rotated, skipped,
      unchecked: true,
      lineChecks: [],
      statement,
      nextStep:
        'Occupy a second known record corner and tie it. One line gives an exact rotation and no ' +
        'check at all — if this backsight is on the wrong monument, every rotated call is wrong by ' +
        'the same amount and looks perfect.',
      caveats: CAVEATS,
    };
  }

  // ── Ties: a best fit over corners occupied in the field ─────────────────────────────────────
  const t = traverse(calls.map((c) => ({
    bearing: c.bearing, distance: c.distance, toPoint: c.toPoint ?? null, unit: c.unit,
  })));

  const legByIndex = new Map(t.legs.map((l) => [l.index, l]));
  const common: CommonPoint[] = [];
  const unusableTies: string[] = [];

  for (const tie of basis.ties) {
    // callIndex -1 is the POINT OF BEGINNING, which the traverse puts at the origin.
    const record = tie.callIndex < 0 ? { n: 0, e: 0 } : legByIndex.get(tie.callIndex)?.to;
    if (!record) {
      unusableTies.push(
        `"${tie.label}" is tied to call ${tie.callIndex + 1}, which the record traverse could not ` +
        `place — so there is no record coordinate to compare your measurement against.`,
      );
      continue;
    }
    common.push({ label: tie.label, record, measured: tie.measured });
  }

  if (common.length === 0) {
    return {
      ok: false,
      reason: unusableTies.length > 0
        ? `None of the tied corners could be placed from the record. ${unusableTies.join(' ')}`
        : 'No field ties were supplied, so there is nothing to rotate the record onto.',
      nextStep: 'Tie at least one corner whose record call could be walked; two or more to get a check.',
    };
  }

  const fit = fitRotation(common, basis.fitScale === true);
  if (!fit) {
    return {
      ok: false,
      reason: 'The fit could not be solved from the supplied ties.',
      nextStep: 'Check that the measured coordinates are in US survey feet and are not identical.',
    };
  }

  const { rotated, skipped } = rotateCalls(rotatableCalls, fit.rotationDeg);

  // Line-by-line comparison between consecutive ties: this is where a specific corner disagrees, as
  // opposed to the whole survey sitting on a different north.
  const lineChecks: string[] = [];
  for (let i = 0; i + 1 < common.length; i++) {
    lineChecks.push(compareLine(
      common[i]!.record, common[i + 1]!.record,
      common[i]!.measured, common[i + 1]!.measured,
    ));
  }

  const caveats = [...CAVEATS, ...unusableTies];

  // Report what the distances say whether or not the fit was allowed to absorb it. When scale was
  // fitted, `fit.scale` IS the observation; when it was not, `fit.scale` is the constant 1 and the
  // observation has to be computed separately or the disagreement goes unnamed.
  const seen = basis.fitScale === true ? fit.scale : observedScale(common);
  if (seen !== null && Math.abs(seen - 1) * 1_000_000 > SCALE_NOTEWORTHY_PPM) {
    caveats.push(explainScale(seen));
  }

  return {
    ok: true, basis: 'ties',
    rotationDeg: fit.rotationDeg,
    rotationLabel: formatRotationLabel(fit.rotationDeg),
    appliedScale: fit.scale, observedScale: seen, fit, rotated, skipped,
    unchecked: fit.unchecked,
    lineChecks,
    statement: fit.statement,
    nextStep: fit.nextStep,
    caveats,
  };
}
