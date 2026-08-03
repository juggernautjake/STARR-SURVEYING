// worker/src/services/curve-check.ts — a curve can prove its own transcription errors.
//
// A circular curve on a plat is written with six numbers: radius, delta (central angle), arc length,
// chord bearing, chord distance, and direction. They are **over-determined** — any two of radius,
// delta and arc give the third, and radius with delta gives the chord:
//
//     arc   = R · Δ                     (Δ in radians)
//     chord = 2 · R · sin(Δ / 2)
//
// So a curve is one of very few things in a land record that can be checked **without going to the
// field and without a second document**. If the numbers disagree, one of them was mis-transcribed —
// by the original draftsman, by the county's index, or by our own OCR — and the disagreement itself
// says which is most likely.
//
// ── WHY THIS MATTERS MORE THAN IT LOOKS ─────────────────────────────────────────────────────────
//
// The traverse walks the CHORD, because the chord is the straight line between the two corners a
// crew occupies. So a mis-read chord distance moves a corner directly, and a mis-read radius or
// delta does not move anything at all until somebody stakes the curve itself.
//
// That asymmetry is the useful part: when the three disagree, the check can say *which* value is
// wrong, and therefore whether the error affects where the corners are or only how the arc between
// them bends. A single "curve data inconsistent" flag would lose exactly that distinction.
//
// ── AND OCR HAS A FAVOURITE MISTAKE ─────────────────────────────────────────────────────────────
//
// Digits, on a scanned plat: 3↔8, 5↔6, 1↔7, 0↔8. A radius of 573.69 read as 578.69 is a five-foot
// error that looks perfectly plausible in isolation and is provable in context. Where the residual
// matches a single-digit substitution, the check says so — that is a far more actionable statement
// than a percentage.

import { normaliseAzimuth, parseBearing } from './survey-geometry.js';

export interface CurveInput {
  /** Radius, in the same unit as the arc and chord distances. */
  radius?: number | null;
  /** Central angle in decimal degrees. */
  deltaDeg?: number | null;
  arcLength?: number | null;
  chordDistance?: number | null;
  chordBearing?: string | null;
  direction?: 'left' | 'right' | null;
  /** Bearing of the line entering the curve, when known — lets the tangency be checked too. */
  inboundBearing?: string | null;
}

export type CurveVerdict =
  /** The values that are present agree within tolerance. */
  | 'consistent'
  /** Enough values to check, and they disagree. */
  | 'inconsistent'
  /** Not enough values to check anything — reported, never treated as agreement. */
  | 'unverifiable';

export interface CurveCheck {
  verdict: CurveVerdict;
  /** Values recomputed from the others, so a reader can see what the record should have said. */
  derived: {
    radius?: number;
    deltaDeg?: number;
    arcLength?: number;
    chordDistance?: number;
  };
  /** Which stated value is most likely wrong, when that can be told. */
  suspect: 'radius' | 'delta' | 'arc' | 'chord' | null;
  /** True when the disagreement moves a CORNER rather than only the shape of the arc. */
  affectsCornerPosition: boolean;
  statement: string;
  nextStep: string;
}

/** Relative tolerance for agreement between recomputed and stated values.
 *
 *  Plats are drafted to hundredths of a foot and OCR is exact when it is right, so a real
 *  transcription error is orders of magnitude bigger than rounding. A loose tolerance here would
 *  swallow exactly the digit substitutions this check exists to catch. */
export const CURVE_TOLERANCE = 0.001;   // 0.1%
/** Absolute floor, so a 3-foot radius is not judged on a 0.003 ft tolerance. */
export const CURVE_ABS_TOLERANCE = 0.02;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function agrees(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(CURVE_ABS_TOLERANCE, Math.abs(b) * CURVE_TOLERANCE);
}

/** Could a single digit substitution explain this difference?
 *
 *  Written out because "the radius is 0.9% off" is a statistic and "the radius reads 578.69 where the
 *  geometry needs 573.69 — a 3/8 swap in one digit" is a correction somebody can make. */
export function digitSubstitution(stated: number, needed: number): string | null {
  const s = stated.toFixed(2);
  const n = needed.toFixed(2);
  if (s.length !== n.length) return null;

  const diffs: number[] = [];
  for (let i = 0; i < s.length; i++) if (s[i] !== n[i]) diffs.push(i);
  if (diffs.length !== 1) return null;

  const i = diffs[0]!;
  const a = s[i]!, b = n[i]!;
  if (!/\d/.test(a) || !/\d/.test(b)) return null;

  const CONFUSABLE = new Set(['38', '83', '56', '65', '17', '71', '08', '80', '69', '96', '13', '31']);
  const pair = `${a}${b}`;
  return CONFUSABLE.has(pair)
    ? `a single-digit ${a}/${b} substitution — the commonest OCR error on a scanned plat`
    : `a single digit differs (${a} where the geometry needs ${b})`;
}

/** Check a curve against itself. */
export function checkCurve(c: CurveInput): CurveCheck {
  const R = num(c.radius);
  const D = num(c.deltaDeg);
  const A = num(c.arcLength);
  const C = num(c.chordDistance);

  const derived: CurveCheck['derived'] = {};
  const known = [R, D, A, C].filter((v) => v !== null).length;

  if (known < 2) {
    return {
      verdict: 'unverifiable', derived, suspect: null, affectsCornerPosition: false,
      statement:
        `This curve states ${known} of radius/delta/arc/chord. At least two are needed to check any of ` +
        `them, so nothing here has been verified — that is NOT the same as the curve being consistent.`,
      nextStep: 'Read the missing curve values off the plat face or the curve table before relying on this arc.',
    };
  }

  // Recompute everything derivable from the most reliable available pair.
  if (R !== null && D !== null) {
    derived.arcLength = R * rad(D);
    derived.chordDistance = 2 * R * Math.sin(rad(D) / 2);
  } else if (R !== null && A !== null) {
    derived.deltaDeg = deg(A / R);
    derived.chordDistance = 2 * R * Math.sin(A / R / 2);
  } else if (D !== null && A !== null) {
    derived.radius = A / rad(D);
    derived.chordDistance = 2 * derived.radius * Math.sin(rad(D) / 2);
  } else if (R !== null && C !== null) {
    const half = Math.min(1, Math.max(-1, C / (2 * R)));
    derived.deltaDeg = deg(2 * Math.asin(half));
    derived.arcLength = R * rad(derived.deltaDeg);
  } else if (D !== null && C !== null) {
    derived.radius = C / (2 * Math.sin(rad(D) / 2));
    derived.arcLength = derived.radius * rad(D);
  } else if (A !== null && C !== null) {
    // Arc and chord alone determine the radius only by iteration, and the solution is ill-conditioned
    // for shallow curves. Saying so beats returning a number whose precision is invented.
    return {
      verdict: 'unverifiable', derived, suspect: null, affectsCornerPosition: false,
      statement:
        'Only the arc length and chord distance are stated. They do determine the curve in principle, but the ' +
        'solution is ill-conditioned for a shallow arc — a small reading error in either swings the radius ' +
        'wildly — so no radius is derived here rather than one with invented precision.',
      nextStep: 'Read the radius or the delta off the plat; either makes this curve checkable.',
    };
  }

  // Compare every derived value against its stated counterpart.
  const problems: Array<{ field: NonNullable<CurveCheck['suspect']>; stated: number; needed: number }> = [];
  if (derived.arcLength !== undefined && A !== null && !agrees(derived.arcLength, A)) {
    problems.push({ field: 'arc', stated: A, needed: derived.arcLength });
  }
  if (derived.chordDistance !== undefined && C !== null && !agrees(derived.chordDistance, C)) {
    problems.push({ field: 'chord', stated: C, needed: derived.chordDistance });
  }
  if (derived.deltaDeg !== undefined && D !== null && !agrees(derived.deltaDeg, D)) {
    problems.push({ field: 'delta', stated: D, needed: derived.deltaDeg });
  }
  if (derived.radius !== undefined && R !== null && !agrees(derived.radius, R)) {
    problems.push({ field: 'radius', stated: R, needed: derived.radius });
  }

  if (problems.length === 0) {
    return {
      verdict: 'consistent', derived, suspect: null, affectsCornerPosition: false,
      statement: `Curve is internally consistent: radius, delta, arc and chord agree to within ${CURVE_TOLERANCE * 100}%.`,
      nextStep: '',
    };
  }

  const worst = problems.reduce((w, p) =>
    Math.abs(p.stated - p.needed) > Math.abs(w.stated - w.needed) ? p : w);
  const hint = digitSubstitution(worst.stated, worst.needed);

  // The chord is what the traverse walks, so a chord error moves a CORNER. A radius or delta error
  // changes only how the arc bends between corners that are still in the right place.
  const affectsCornerPosition = problems.some((p) => p.field === 'chord');

  const statement =
    `Curve data DISAGREES with itself: ${worst.field} is stated as ${worst.stated.toFixed(2)} but the other ` +
    `values require ${worst.needed.toFixed(2)}${hint ? ` — ${hint}` : ''}. This is a transcription error the ` +
    `document proves on its own; no field work is needed to know something here is wrong.` +
    (affectsCornerPosition
      ? ' The chord is involved, so this moves a CORNER — the traverse walks the chord.'
      : ' The chord agrees, so the corners are in the right place and only the arc between them is mis-described.');

  return {
    verdict: 'inconsistent', derived, suspect: worst.field, affectsCornerPosition,
    statement,
    nextStep: affectsCornerPosition
      ? `Re-read ${worst.field} from the document image before using this curve — a wrong chord puts the corner in the wrong place.`
      : `Re-read ${worst.field} from the document image. The corners are unaffected, so this is a records correction rather than a field problem.`,
  };
}

/** Is the curve tangent to the line entering it?
 *
 *  Most boundary curves on a plat are tangent — the road curve continues the line before it — and
 *  when they are, the inbound bearing and the chord bearing differ by exactly half the delta. It is a
 *  second, independent check on delta, using a number from a different part of the description.
 *
 *  It is not applied automatically: a NON-tangent curve is perfectly legal and common at a
 *  cul-de-sac or a deflection, so a failed tangency test is a QUESTION, never a defect. */
export function checkTangency(c: CurveInput): string | null {
  const inbound = c.inboundBearing ? parseBearing(c.inboundBearing) : null;
  const chord = c.chordBearing ? parseBearing(c.chordBearing) : null;
  const D = num(c.deltaDeg);
  if (!inbound || !chord || D === null || !c.direction) return null;

  const expected = c.direction === 'right'
    ? normaliseAzimuth(inbound.azimuthDeg + D / 2)
    : normaliseAzimuth(inbound.azimuthDeg - D / 2);

  let diff = Math.abs(normaliseAzimuth(chord.azimuthDeg - expected));
  if (diff > 180) diff = 360 - diff;

  if (diff < 0.02) {
    return `Curve is TANGENT to the line before it, and the chord bearing confirms delta independently (within ${(diff * 3600).toFixed(0)}").`;
  }
  return (
    `Curve is NOT tangent to the line before it — the chord bearing is ${diff.toFixed(3)}° from where a tangent ` +
    `curve of this delta would put it. That is legal and common (a cul-de-sac, a deflection), so this is a ` +
    `QUESTION rather than an error: either the curve genuinely is not tangent, or delta or the chord bearing ` +
    `was mis-read.`
  );
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;
}
