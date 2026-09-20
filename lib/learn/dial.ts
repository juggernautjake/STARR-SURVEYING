// lib/learn/dial.ts — the angle arithmetic behind the draggable demos.
//
// Owner, 2026-09-20: "I want demonstrations and illustrations and animations of different
// concepts … or turning an instrument in the right direction, or reorienting a drawing to the
// correct north."
//
// Two demos drag a dial: aiming an instrument through a turned angle, and rotating a plan until
// north is up. Both need the same handful of angle facts, and all of them are the kind that look
// obvious and are wrong in one specific case.
//
// ── EVERY FUNCTION HERE NORMALISES FIRST ────────────────────────────────────────────────────────
//
// Dragging produces whatever `atan2` gives, which is −180 to +180. Adding a turned angle produces
// numbers past 360. Subtracting produces negatives. A student who drags all the way round twice
// should be judged on where the instrument POINTS, not on how they got there, so nothing in this
// file compares raw values.
//
// ── THE ONE THAT CATCHES PEOPLE: THE DIFFERENCE BETWEEN 359° AND 1° IS 2° ───────────────────────
//
// `Math.abs(a - b)` says 358. Used as a tolerance check it means somebody who lands one degree the
// wrong side of north is marked 358 degrees out, and told they are hopeless when they were right.
// `angularDifference` is the function that gets this right, and it is why this module exists rather
// than the two components each doing their own subtraction.
//
// Pure. Tested in __tests__/learn/dial.test.ts.

/** Any angle into [0, 360). Handles negatives and multiple turns. */
export function normalize(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * The smallest angle between two directions, 0 to 180.
 *
 * Direction-free on purpose: "how far off am I" has no sign. Where the sign matters —
 * which way to turn — use `signedDifference`.
 */
export function angularDifference(a: number, b: number): number {
  const d = Math.abs(normalize(a) - normalize(b));
  return d > 180 ? 360 - d : d;
}

/**
 * How far, and which way, to get from `from` to `to`. Positive is clockwise.
 *
 * Always the SHORT way round, in −180 to +180. A hint that says "turn 2° clockwise" is useful;
 * one that says "turn 358° anticlockwise" is technically true and useless.
 */
export function signedDifference(from: number, to: number): number {
  const d = normalize(to) - normalize(from);
  if (d > 180) return d - 360;
  if (d <= -180) return d + 360;
  return d;
}

/** Whether an aim is close enough to count. */
export function withinTolerance(aim: number, target: number, toleranceDeg: number): boolean {
  return angularDifference(aim, target) <= Math.abs(toleranceDeg);
}

/**
 * The azimuth a point on screen sits at, seen from the dial's centre.
 *
 * SVG y grows DOWNWARD and azimuth runs clockwise from north, so the arguments to `atan2` are
 * (dx, −dy) rather than the (dy, dx) of a maths-convention bearing. Getting this wrong mirrors the
 * dial: everything works, and every answer is reflected about the north-south line, which is
 * remarkably hard to see by looking.
 */
export function azimuthFromPoint(cx: number, cy: number, x: number, y: number): number {
  const dx = x - cx;
  const dy = y - cy;
  if (dx === 0 && dy === 0) return 0;
  return normalize((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * Snap to the nearest step, for a dial that should not demand sub-degree dragging.
 *
 * A step of 0 means no snapping. The result is normalised, so snapping 359.8 to a 1° step gives 0
 * and not 360 — the same direction, and the form the rest of this module expects.
 */
export function snap(deg: number, stepDeg: number): number {
  if (!stepDeg) return normalize(deg);
  return normalize(Math.round(normalize(deg) / stepDeg) * stepDeg);
}

/**
 * Where an instrument ends up after turning `angle` from a backsight.
 *
 * `right` is clockwise, which is what "angle right" means in the field and what almost every total
 * station measures by default. `left` is anticlockwise. Deflection angles are the same arithmetic
 * measured from the extension of the back line, which is why `fromExtension` exists rather than a
 * separate function: a deflection is a turn from the backsight plus 180.
 */
export function turnedTo(
  backsight: number,
  angle: number,
  direction: 'right' | 'left',
  fromExtension = false,
): number {
  const base = fromExtension ? backsight + 180 : backsight;
  return normalize(direction === 'right' ? base + angle : base - angle);
}

/** An angle as degrees-minutes-seconds, the way a field book records it. */
export function toDMS(deg: number): string {
  const a = normalize(deg);
  const d = Math.floor(a);
  const minFloat = (a - d) * 60;
  let m = Math.floor(minFloat);
  let s = Math.round((minFloat - m) * 60);
  // Rounding 59.6 seconds gives 60, which is not a number of seconds. Carrying it is the whole
  // reason this is not three lines inline in a component.
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) return `${normalize(d + 1)}°00′00″`;
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}
