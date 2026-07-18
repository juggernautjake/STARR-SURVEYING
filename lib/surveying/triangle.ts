// lib/surveying/triangle.ts — the surveying-calculator's TRIANGLE + ANGLE math (Work Mode calculator, owner
// 2026-07-18). The existing calculator modules already cover bearing↔azimuth conversion
// (`lib/calculators/bearing-azimuth/convert.ts`) and general scientific trig (`lib/calculators/math.ts`); the
// gap the owner named — "law of sines and cosines and pythagorean theorem … find the right angle or the
// complementary angle … angle subtraction and addition" — lives here, so the field calculator can solve the
// triangles a survey actually needs without reinventing the angle primitives (it reuses the DMS types).
//
// All angles are DEGREES (surveying convention). Pure + framework-free + fully unit-tested; every function
// returns a finite number or `null` on an impossible/invalid input rather than NaN, so a UI never shows "NaN".
import { type Dms, dmsToDecimal, decimalToDms } from '@/lib/calculators/bearing-azimuth/convert';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Normalize an angle in degrees to [0, 360). A survey turns can exceed 360; this brings it back. */
export function normalizeAngle(deg: number): number | null {
  if (!isNum(deg)) return null;
  return ((deg % 360) + 360) % 360;
}

/** Add two angles (degrees), normalized to [0, 360). The bread-and-butter of turning through a traverse. */
export function addAngles(a: number, b: number): number | null {
  if (!isNum(a) || !isNum(b)) return null;
  return normalizeAngle(a + b);
}

/** Subtract angle `b` from `a` (degrees), normalized to [0, 360). */
export function subtractAngles(a: number, b: number): number | null {
  if (!isNum(a) || !isNum(b)) return null;
  return normalizeAngle(a - b);
}

/** Angle arithmetic in DMS — add/subtract two DMS angles, returning a DMS in [0°, 360°). */
export function addAnglesDms(a: Dms, b: Dms): Dms | null {
  const da = dmsToDecimal(a), db = dmsToDecimal(b);
  const sum = addAngles(da, db);
  return sum === null ? null : decimalToDms(sum);
}
export function subtractAnglesDms(a: Dms, b: Dms): Dms | null {
  const da = dmsToDecimal(a), db = dmsToDecimal(b);
  const diff = subtractAngles(da, db);
  return diff === null ? null : decimalToDms(diff);
}

/** The complementary angle (90° − a). Defined only for 0 ≤ a ≤ 90; returns null otherwise (there is no
 *  real complement of an obtuse angle). */
export function complement(a: number): number | null {
  if (!isNum(a) || a < 0 || a > 90) return null;
  return 90 - a;
}

/** The supplementary angle (180° − a). Defined for 0 ≤ a ≤ 180. */
export function supplement(a: number): number | null {
  if (!isNum(a) || a < 0 || a > 180) return null;
  return 180 - a;
}

// ── Right triangles (Pythagorean theorem) ───────────────────────────────────────────────────────────────

/** Hypotenuse from the two legs: √(a² + b²). Legs must be positive. */
export function pythagoreanHypotenuse(legA: number, legB: number): number | null {
  if (!isNum(legA) || !isNum(legB) || legA <= 0 || legB <= 0) return null;
  return Math.hypot(legA, legB);
}

/** The other leg from the hypotenuse and one leg: √(hyp² − leg²). The hypotenuse must exceed the leg. */
export function pythagoreanLeg(hypotenuse: number, leg: number): number | null {
  if (!isNum(hypotenuse) || !isNum(leg) || hypotenuse <= 0 || leg <= 0 || leg >= hypotenuse) return null;
  return Math.sqrt(hypotenuse * hypotenuse - leg * leg);
}

// ── Oblique triangles (law of sines / law of cosines) ───────────────────────────────────────────────────
// Convention: side `a` is opposite angle `A`, side `b` opposite `B`, side `c` opposite `C`.

/**
 * Law of sines — solve for a side given its OPPOSITE angle and one known angle+opposite-side pair:
 * b = a · sin(B) / sin(A). Returns null if a known angle is ≤ 0 or ≥ 180, sin(A) ~ 0 (degenerate), or a
 * side is non-positive.
 */
export function lawOfSinesSide(knownSide: number, knownAngleDeg: number, wantedAngleDeg: number): number | null {
  if (!isNum(knownSide) || knownSide <= 0) return null;
  if (!isNum(knownAngleDeg) || knownAngleDeg <= 0 || knownAngleDeg >= 180) return null;
  if (!isNum(wantedAngleDeg) || wantedAngleDeg <= 0 || wantedAngleDeg >= 180) return null;
  const sinKnown = Math.sin(toRad(knownAngleDeg));
  if (Math.abs(sinKnown) < 1e-12) return null;
  return (knownSide * Math.sin(toRad(wantedAngleDeg))) / sinKnown;
}

/**
 * Law of sines — solve for an ANGLE given its opposite side and one known angle+opposite-side pair:
 * B = asin( b · sin(A) / a ). Returns the PRIMARY (acute-or-right) solution in (0, 180); returns null when
 * the ratio exceeds 1 (no such triangle — the ambiguous/SSA impossible case).
 */
export function lawOfSinesAngle(wantedSide: number, knownSide: number, knownAngleDeg: number): number | null {
  if (!isNum(wantedSide) || wantedSide <= 0) return null;
  if (!isNum(knownSide) || knownSide <= 0) return null;
  if (!isNum(knownAngleDeg) || knownAngleDeg <= 0 || knownAngleDeg >= 180) return null;
  const ratio = (wantedSide * Math.sin(toRad(knownAngleDeg))) / knownSide;
  if (ratio < -1 || ratio > 1) return null; // no real angle → impossible triangle
  return toDeg(Math.asin(ratio));
}

/**
 * Law of cosines — the third side from two sides and their INCLUDED angle:
 * c = √(a² + b² − 2ab·cos(C)). Returns null on non-positive sides or an included angle outside (0, 180).
 */
export function lawOfCosinesSide(sideA: number, sideB: number, includedAngleDeg: number): number | null {
  if (!isNum(sideA) || !isNum(sideB) || sideA <= 0 || sideB <= 0) return null;
  if (!isNum(includedAngleDeg) || includedAngleDeg <= 0 || includedAngleDeg >= 180) return null;
  const c2 = sideA * sideA + sideB * sideB - 2 * sideA * sideB * Math.cos(toRad(includedAngleDeg));
  return c2 <= 0 ? null : Math.sqrt(c2);
}

/**
 * Law of cosines — the angle OPPOSITE side `c` from all three sides:
 * C = acos( (a² + b² − c²) / (2ab) ). Returns null unless the three lengths satisfy the triangle inequality
 * (each side strictly less than the sum of the other two).
 */
export function lawOfCosinesAngle(sideA: number, sideB: number, sideC: number): number | null {
  if (!isNum(sideA) || !isNum(sideB) || !isNum(sideC)) return null;
  if (sideA <= 0 || sideB <= 0 || sideC <= 0) return null;
  // Triangle inequality — otherwise the sides can't close.
  if (sideA + sideB <= sideC || sideA + sideC <= sideB || sideB + sideC <= sideA) return null;
  const cos = (sideA * sideA + sideB * sideB - sideC * sideC) / (2 * sideA * sideB);
  const clamped = Math.min(1, Math.max(-1, cos)); // guard float drift at the degenerate limits
  return toDeg(Math.acos(clamped));
}
