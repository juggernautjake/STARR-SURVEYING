// worker/src/services/bearing-rotation.ts — putting an old survey onto the grid you are shooting.
//
// The owner's ask: *"if we have an older survey where the bearings are 1–3 degrees off of our GPS
// recordings from the actual field, we can input our recordings and correctly rotate the original so
// that the bearings and distances most closely align with the Texas State Plane version we are
// shooting. Or we might have robotic and need to adjust based on what we put in for our initial
// bearing."*
//
// ── WHY IT IS 1–3 DEGREES, AND WHY THAT IS NOT AN ERROR ─────────────────────────────────────────
//
// An old description is almost never wrong by a degree. It is measured from a different NORTH.
//
//   MAGNETIC       what a compass read on the day. Declination in Central Texas is ~3–4° east now and
//                  has swung several degrees over the last century, so the date of the survey
//                  changes the answer.
//   TRUE/geodetic  north along the meridian through the property.
//   GRID           what your GPS reports on the Texas State Plane. Differs from true north by the
//                  CONVERGENCE, which grows with distance from the zone's central meridian and can
//                  reach a degree or more at a zone edge.
//   ASSUMED        an arbitrary basis: the surveyor called one line "N 0° E" and worked from it.
//
// A rotation does not correct the old survey. It expresses it in the basis you are measuring in, and
// the SHAPE is untouched. That is why rotation is the right operation and "fixing the bearings" is
// not: the internal angles of the old survey are its actual observations, and they are usually
// better than the basis they were reported against.
//
// ── ONE COMMON LINE GIVES YOU NO CHECK ──────────────────────────────────────────────────────────
//
// With a single pair of common points the rotation is exact by construction — the residual is zero
// because there is nothing left over. That is not a good fit; it is an unverifiable one. If the
// monument you tied to is not the monument the record called for, the entire rotated survey is
// wrong by that blunder and nothing in the arithmetic can tell you.
//
// Two or more common lines produce residuals, and the residuals are the whole value: they say
// whether the old survey and the ground actually agree, and which corner does not.

import { azimuthToBearing, inverse, normaliseAzimuth, parseBearing, type Point } from './survey-geometry.js';

/** A corner observed both in the record and on the ground. */
export interface CommonPoint {
  /** Label a human recognises — "NE corner", "IRF at fence". */
  label: string;
  /** Where the record puts it: local traverse coordinates from `traverse()`. */
  record: Point;
  /** Where you measured it: grid northing/easting, same units (US survey feet). */
  measured: Point;
}

export interface RotationFit {
  /** Degrees to ADD to every record bearing to express it in the measured basis. */
  rotationDeg: number;
  /** Scale factor record→measured. 1 means the distances already agree. */
  scale: number;
  /** Translation applied after rotation and scaling, in measured coordinates. */
  translation: Point;
  /** Per-point leftover after the fit — where the record and the ground disagree. */
  residuals: Array<{ label: string; dn: number; de: number; distance: number }>;
  /** Root-mean-square of the residual distances. */
  rmsResidual: number;
  /** The worst point, which is usually the interesting one. */
  worst: { label: string; distance: number } | null;
  /** True when the fit had no redundancy and therefore no check. */
  unchecked: boolean;
  statement: string;
  nextStep: string;
}

/** Best-fit rotation (and optionally scale) taking record coordinates onto measured ones.
 *
 *  This is the 2-D similarity / Helmert transform solved in closed form, which for rotation and
 *  uniform scale is exactly the least-squares answer — no iteration and no starting guess to get
 *  wrong.
 *
 *  `fitScale` defaults FALSE. Scale and rotation are different questions, and letting scale float
 *  absorbs disagreements that are trying to tell you something: a systematic distance difference is
 *  usually grid-versus-ground (the State Plane combined factor, ~1 part in 10,000 — about half a
 *  foot in a mile) or a unit mistake (varas read as feet), and neither should be quietly swallowed
 *  by a scale term on a rotation fit. Turn it on when you know why the distances differ. */
export function fitRotation(points: CommonPoint[], fitScale = false): RotationFit | null {
  if (points.length < 1) return null;

  const n = points.length;
  const centroid = (get: (p: CommonPoint) => Point): Point => ({
    n: points.reduce((s, p) => s + get(p).n, 0) / n,
    e: points.reduce((s, p) => s + get(p).e, 0) / n,
  });

  const cR = centroid((p) => p.record);
  const cM = centroid((p) => p.measured);

  // Cross-covariance about the centroids. For a pure rotation the optimum is atan2(Σ cross, Σ dot).
  let sumCross = 0, sumDot = 0, sumRecordSq = 0;
  for (const p of points) {
    const rn = p.record.n - cR.n, re = p.record.e - cR.e;
    const mn = p.measured.n - cM.n, me = p.measured.e - cM.e;
    sumDot += rn * mn + re * me;
    sumCross += rn * me - re * mn;
    sumRecordSq += rn * rn + re * re;
  }

  if (n === 1 || sumRecordSq === 0) {
    // A single common point fixes only the translation — there is no direction to rotate. Saying so
    // beats returning a rotation of 0, which would read as "the bases already agree".
    return {
      rotationDeg: 0, scale: 1,
      translation: { n: cM.n - cR.n, e: cM.e - cR.e },
      residuals: [], rmsResidual: 0, worst: null, unchecked: true,
      statement:
        'Only ONE common point was supplied, which fixes position but not direction. No rotation has been ' +
        'computed — a rotation of 0° here would read as "the two bases already agree", which nothing has shown.',
      nextStep: 'Supply a second common corner. Two give a rotation; three or more give a rotation you can check.',
    };
  }

  const rotationRad = Math.atan2(sumCross, sumDot);
  const scale = fitScale ? Math.hypot(sumDot, sumCross) / sumRecordSq : 1;

  const cos = Math.cos(rotationRad), sin = Math.sin(rotationRad);
  const apply = (p: Point): Point => ({
    n: scale * (cos * (p.n - cR.n) - sin * (p.e - cR.e)) + cM.n,
    e: scale * (sin * (p.n - cR.n) + cos * (p.e - cR.e)) + cM.e,
  });

  const residuals = points.map((p) => {
    const fitted = apply(p.record);
    const dn = p.measured.n - fitted.n;
    const de = p.measured.e - fitted.e;
    return { label: p.label, dn, de, distance: Math.hypot(dn, de) };
  });

  const rms = Math.sqrt(residuals.reduce((s, r) => s + r.distance ** 2, 0) / n);
  const worst = residuals.reduce<{ label: string; distance: number } | null>(
    (w, r) => (!w || r.distance > w.distance ? { label: r.label, distance: r.distance } : w), null,
  );

  const rotationDeg = normaliseAzimuth((rotationRad * 180) / Math.PI);
  const signed = rotationDeg > 180 ? rotationDeg - 360 : rotationDeg;
  const unchecked = n < 3;

  const parts = [
    `Rotate the record ${formatRotation(signed)} to express it in the basis you measured in` +
      `${fitScale ? `, and scale by ${scale.toFixed(7)}` : ''}.`,
  ];

  if (n === 2) {
    parts.push(
      'Fitted on TWO common points, so the rotation is exact by construction and the residuals are zero ' +
        'by definition — this fit has NOT been checked. If either monument is not the one the record called ' +
        'for, the whole rotated survey is wrong by that blunder and the arithmetic cannot show it.',
    );
  } else {
    parts.push(`RMS residual ${rms.toFixed(2)} ft across ${n} common points.`);
    if (worst) parts.push(`Worst is ${worst.label} at ${worst.distance.toFixed(2)} ft.`);
  }

  if (!fitScale) {
    parts.push(
      'Scale was held at 1. A systematic distance difference is usually grid-versus-ground or a unit ' +
        'mistake, and both are worth seeing rather than absorbing into a scale term.',
    );
  }

  return {
    rotationDeg: signed, scale, translation: { n: cM.n - cR.n, e: cM.e - cR.e },
    residuals, rmsResidual: rms, worst, unchecked,
    statement: parts.join(' '),
    nextStep: unchecked
      ? 'Add a third common corner. Two points can only produce a perfect fit; three tell you whether it is a true one.'
      : outlierLabel(residuals) ??
        '',
  };
}

/** Which point, if any, disagrees with the OTHERS rather than with the average.
 *
 *  ── WHY THE OBVIOUS TEST CANNOT WORK ──────────────────────────────────────────────────────────
 *
 *  Comparing the worst residual against the overall RMS is self-defeating twice over. The blunder
 *  inflates the RMS it is being measured against, and — less obviously — least squares SPREADS it:
 *  the fit shifts to reduce the total, so a blunder of size d leaves roughly d(n−1)/n on the bad
 *  point and d/n on each of the others.
 *
 *  That puts a hard ceiling on the ratio of **n − 1**. On four common points the worst residual can
 *  never be more than three times the others no matter how large the blunder, so a "3 sigma" rule
 *  never fires — an 8-foot bust on a 4-corner fit comes out at exactly 3.0 and passes.
 *
 *  A blunder is therefore detected by comparing the worst against the MEDIAN of the rest (a median
 *  is unmoved by one bad value) at a threshold well inside that ceiling. */
function outlierLabel(residuals: RotationFit['residuals']): string | null {
  if (residuals.length < 3) return null;

  const sorted = [...residuals].sort((a, b) => b.distance - a.distance);
  const worst = sorted[0]!;
  const rest = sorted.slice(1);
  const restSorted = [...rest].sort((a, b) => a.distance - b.distance);
  const mid = Math.floor(restSorted.length / 2);
  const restRms = restSorted.length % 2
    ? restSorted[mid]!.distance
    : (restSorted[mid - 1]!.distance + restSorted[mid]!.distance) / 2;

  // A tolerance floor, so a fit already good to a hundredth of a foot does not report an "outlier"
  // three hundredths out.
  if (worst.distance < 0.1) return null;
  if (restRms > 1e-9 && worst.distance < 2 * restRms) return null;

  return (
    `Look at ${worst.label} before accepting this: at ${worst.distance.toFixed(2)} ft it disagrees with the ` +
    `other corners (median ${restRms.toFixed(2)} ft between them), which usually means that monument is not the ` +
    `corner the record called for — not that the survey is bad. Rotating with it included drags every other ` +
    `corner toward it.`
  );
}

/** The rotation implied by one line whose bearing you know both ways.
 *
 *  This is the robotic-setup case: you occupy a corner, backsight another, and enter a bearing for
 *  that line. Whatever you enter defines the basis everything else is computed in, so the difference
 *  between it and the record's bearing for the same line IS the rotation. */
export function rotationFromBackthesight(
  recordAzimuthDeg: number,
  measuredAzimuthDeg: number,
): { rotationDeg: number; statement: string } {
  const diff = normaliseAzimuth(measuredAzimuthDeg - recordAzimuthDeg);
  const signed = diff > 180 ? diff - 360 : diff;
  return {
    rotationDeg: signed,
    statement:
      `The record calls this line ${azimuthToBearing(recordAzimuthDeg)}; you are holding ` +
      `${azimuthToBearing(measuredAzimuthDeg)}. Rotate the record ${formatRotation(signed)}. ` +
      `This is a ONE-LINE basis with no redundancy: every other call inherits it exactly, so if this ` +
      `backsight is on the wrong monument the whole survey rotates with it and nothing here will say so.`,
  };
}

/** Apply a rotation to a record azimuth. */
export function rotateAzimuth(azimuthDeg: number, rotationDeg: number): number {
  return normaliseAzimuth(azimuthDeg + rotationDeg);
}

export interface RotatedCall {
  index: number;
  recordBearing: string;
  rotatedBearing: string;
  rotatedAzimuthDeg: number;
  /** Unchanged: a rotation does not alter lengths. Present so the rotated description is complete. */
  distance: number;
}

/** Re-express every call in the measured basis.
 *
 *  Distances are untouched, and that is the point worth stating: rotating a survey changes only the
 *  direction it is reported in. A caller that also wants distances changed is asking for a scale
 *  change, which is a different decision with a different cause. */
export function rotateCalls(
  calls: Array<{ bearing: string | null; distance: number | null }>,
  rotationDeg: number,
): { rotated: RotatedCall[]; skipped: Array<{ index: number; reason: string }> } {
  const rotated: RotatedCall[] = [];
  const skipped: Array<{ index: number; reason: string }> = [];

  calls.forEach((c, index) => {
    const parsed = c.bearing ? parseBearingSafe(c.bearing) : null;
    if (!parsed) {
      skipped.push({ index, reason: `Call ${index + 1}: bearing ${c.bearing ? `"${c.bearing}"` : '(missing)'} could not be read, so it cannot be rotated.` });
      return;
    }
    const az = rotateAzimuth(parsed, rotationDeg);
    rotated.push({
      index,
      recordBearing: c.bearing!,
      rotatedBearing: azimuthToBearing(az),
      rotatedAzimuthDeg: az,
      distance: c.distance ?? NaN,
    });
  });

  return { rotated, skipped };
}

function parseBearingSafe(raw: string): number | null {
  // One bearing grammar in the codebase — survey-geometry's. A second parser here would drift from
  // it, and the two would disagree about exactly the malformed bearings that matter.
  return parseBearing(raw)?.azimuthDeg ?? null;
}

function formatRotation(signed: number): string {
  const abs = Math.abs(signed);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  return `${signed >= 0 ? '+' : '−'}${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

/** How far apart two corners are, once both are on the same basis — the check a crew makes first. */
export function compareLine(recordFrom: Point, recordTo: Point, measuredFrom: Point, measuredTo: Point): string {
  const r = inverse(recordFrom, recordTo);
  const m = inverse(measuredFrom, measuredTo);
  const dDist = m.distance - r.distance;
  const dAz = normaliseAzimuth(m.azimuthDeg - r.azimuthDeg);
  const signedAz = dAz > 180 ? dAz - 360 : dAz;

  return (
    `Record: ${r.bearing}, ${r.distance.toFixed(2)} ft. Measured: ${m.bearing}, ${m.distance.toFixed(2)} ft. ` +
    `Direction differs by ${formatRotation(signedAz)}; length differs by ${dDist >= 0 ? '+' : ''}${dDist.toFixed(2)} ft ` +
    `(${((dDist / (r.distance || 1)) * 1e6).toFixed(0)} ppm). A consistent direction difference across every line is a ` +
    `BASIS difference and should be rotated out; a consistent length difference is grid-versus-ground or a unit ` +
    `mistake; a difference on one line only is usually the wrong monument.`
  );
}
