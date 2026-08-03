// worker/src/services/survey-geometry.ts — where the corners are in relation to each other.
//
// The owner's ask, verbatim in intent: *"extract the information that tells us where boundary
// markers are in relation to each other exactly, for every survey research run."*
//
// The calls already carry it — a metes-and-bounds description IS a set of relative positions — but
// as prose. Nothing turned them into coordinates, so nothing could answer the question a crew
// actually asks: *from the rod I am standing on, which way and how far is the next one?*
//
// This module is the primitives and the traverse. `monument-positions.ts` puts markers on it, and
// `bearing-rotation.ts` rotates the result onto a measured grid.
//
import { INTERNAL_UNIT, toInternal, type LengthUnit } from './survey-units.js';

// ── A BEARING THAT WILL NOT PARSE IS NOT DUE NORTH ──────────────────────────────────────────────
//
// `TraverseComputation.bearingToAzimuth` returns **0** when its regex does not match. Zero is a
// legitimate azimuth — due north — so an unreadable bearing silently becomes a real call pointing
// north, and every corner after it in the traverse is displaced. The closure error absorbs it, the
// traverse still "computes", and nothing anywhere says a bearing could not be read.
//
// `parseBearing` returns **null** instead, and every consumer here treats null as a stop rather than
// a value. A traverse with an unreadable call reports which call, not a plausible polygon.

export interface Bearing {
  /** Azimuth clockwise from north, 0–360. */
  azimuthDeg: number;
  /** As written, kept so a person can always check the parse. */
  raw: string;
  quadrant: 'NE' | 'SE' | 'SW' | 'NW' | null;
}

/** Quadrant bearings — `N 45°30'20" E`, `S 12-15-00 W`, `N45.5E` — and plain azimuths.
 *
 *  Deliberately tolerant of the punctuation OCR produces (° as 0/o/*, ' as ´, " as '') and of
 *  missing seconds, because a deed typed in 1954 and scanned in 2011 rarely survives clean.
 *  Returns null when it genuinely cannot be read — never a default. */
export function parseBearing(raw: string | null | undefined): Bearing | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  // Quadrant form. Degree/minute/second separators are whatever the scan produced.
  const q = /^([NS])\s*(\d{1,3}(?:\.\d+)?)\s*(?:[°º*o:\-\s]\s*(\d{1,2}(?:\.\d+)?))?\s*(?:['´′:\-\s]\s*(\d{1,2}(?:\.\d+)?))?\s*["”″']*\s*([EW])/i.exec(s);
  if (q) {
    const deg = parseFloat(q[2]);
    const min = q[3] ? parseFloat(q[3]) : 0;
    const sec = q[4] ? parseFloat(q[4]) : 0;
    if (deg > 90 || min >= 60 || sec >= 60) return null;      // not a quadrant bearing
    const angle = deg + min / 60 + sec / 3600;

    const ns = q[1].toUpperCase();
    const ew = q[5].toUpperCase();
    const quadrant = `${ns}${ew}` as Bearing['quadrant'];

    let azimuthDeg: number;
    if (ns === 'N' && ew === 'E') azimuthDeg = angle;
    else if (ns === 'S' && ew === 'E') azimuthDeg = 180 - angle;
    else if (ns === 'S' && ew === 'W') azimuthDeg = 180 + angle;
    else azimuthDeg = 360 - angle;

    return { azimuthDeg: normaliseAzimuth(azimuthDeg), raw: s, quadrant };
  }

  // Plain azimuth: "123°45'30"" or "123.7585".
  const a = /^(\d{1,3}(?:\.\d+)?)\s*(?:[°º*o]\s*(\d{1,2}(?:\.\d+)?))?\s*(?:['´′]\s*(\d{1,2}(?:\.\d+)?))?\s*["”″]?$/.exec(s);
  if (a) {
    const deg = parseFloat(a[1]);
    const min = a[2] ? parseFloat(a[2]) : 0;
    const sec = a[3] ? parseFloat(a[3]) : 0;
    if (deg >= 360 || min >= 60 || sec >= 60) return null;
    return { azimuthDeg: normaliseAzimuth(deg + min / 60 + sec / 3600), raw: s, quadrant: null };
  }

  return null;
}

export function normaliseAzimuth(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** Render an azimuth back as a quadrant bearing, which is how a deed and a crew both read it. */
export function azimuthToBearing(azimuthDeg: number): string {
  const az = normaliseAzimuth(azimuthDeg);
  let ns: 'N' | 'S', ew: 'E' | 'W', angle: number;

  if (az <= 90) { ns = 'N'; ew = 'E'; angle = az; }
  else if (az <= 180) { ns = 'S'; ew = 'E'; angle = 180 - az; }
  else if (az <= 270) { ns = 'S'; ew = 'W'; angle = az - 180; }
  else { ns = 'N'; ew = 'W'; angle = 360 - az; }

  const d = Math.floor(angle);
  const mFloat = (angle - d) * 60;
  const m = Math.floor(mFloat);
  const sec = Math.round((mFloat - m) * 60);
  // Carry, so 30'60" never prints.
  const s2 = sec === 60 ? 0 : sec;
  const m2 = sec === 60 ? m + 1 : m;
  const d2 = m2 === 60 ? d + 1 : d;
  const m3 = m2 === 60 ? 0 : m2;

  return `${ns} ${d2}°${String(m3).padStart(2, '0')}'${String(s2).padStart(2, '0')}" ${ew}`;
}

// ── Points and legs ─────────────────────────────────────────────────────────────────────────────

export interface Point {
  /** Local plane coordinates, in the calls' own distance unit. */
  n: number;
  e: number;
}

export interface Leg {
  /** Which call produced this leg. */
  index: number;
  bearing: Bearing;
  /** ALWAYS in US survey feet — normalised from the call's own unit before any geometry ran. */
  distance: number;
  /** The unit the call was written in, kept so the drawing can label it as the deed does. */
  unit: LengthUnit;
  from: Point;
  to: Point;
  /** Free text from the call — where the monument description lives. */
  toPoint: string | null;
}

export interface TraverseInput {
  bearing: string | null;
  distance: number | null;
  toPoint?: string | null;
  /** A curve is traversed on its CHORD: the chord is the straight line between the two corners, and
   *  the corners are what a crew occupies. The arc matters for area, not for getting there. */
  chordBearing?: string | null;
  chordDistance?: number | null;
  /** The unit this call's distance is written in. Every call carries its own because a single deed
   *  genuinely mixes them — an old description recited in varas with a modern replat's tie in feet.
   *  Omitted means US survey feet, which is what a bare "feet" means in a Texas land description. */
  unit?: LengthUnit;
}

export interface TraverseResult {
  points: Point[];
  legs: Leg[];
  /** Calls that could not be used, and why. Never silently skipped. */
  unusable: Array<{ index: number; reason: string }>;
  /** Distance from the last point back to the first — the closure error. */
  closureDistance: number;
  closureBearing: string | null;
  perimeter: number;
  /** 1 in N. Null when the perimeter is zero or the traverse never closed a loop. */
  closurePrecision: number | null;
  statement: string;
}

/** Walk the calls and produce a coordinate for every corner.
 *
 *  Starts at (0,0): these are RELATIVE positions, which is exactly what the record gives. Putting
 *  them on the state plane needs a measured tie, and inventing one here would produce coordinates
 *  that look surveyed and are not — see `bearing-rotation.ts` for the honest version. */
export function traverse(calls: TraverseInput[]): TraverseResult {
  const points: Point[] = [{ n: 0, e: 0 }];
  const legs: Leg[] = [];
  const unusable: Array<{ index: number; reason: string }> = [];
  let perimeter = 0;

  calls.forEach((call, index) => {
    const isCurve = !!(call.chordBearing && call.chordDistance);
    const bearingRaw = isCurve ? call.chordBearing! : call.bearing;
    const distance = isCurve ? call.chordDistance! : call.distance;

    const bearing = parseBearing(bearingRaw);
    if (!bearing) {
      // NOT treated as due north. A call we cannot read stops this leg and is named.
      unusable.push({
        index,
        reason: `Call ${index + 1}: the bearing ${bearingRaw ? `"${bearingRaw}"` : '(missing)'} could not be read. ` +
          `Every corner after it is unplaced — this is not a call pointing north.`,
      });
      return;
    }
    if (distance == null || !Number.isFinite(distance) || distance <= 0) {
      unusable.push({
        index,
        reason: `Call ${index + 1}: no usable distance (${distance ?? 'missing'}). The direction is known, the length is not.`,
      });
      return;
    }

    // Normalise BEFORE any geometry. A vara call added to a foot call closes to a polygon that is
    // simply the wrong shape — 1,900 varas read as feet is a line 36% of its true length, and
    // nothing downstream can detect it because the result is perfectly self-consistent.
    const unit = call.unit ?? INTERNAL_UNIT;
    const lengthFt = toInternal(distance, unit);

    const from = points[points.length - 1]!;
    const rad = (bearing.azimuthDeg * Math.PI) / 180;
    const to = { n: from.n + lengthFt * Math.cos(rad), e: from.e + lengthFt * Math.sin(rad) };

    points.push(to);
    legs.push({ index, bearing, distance: lengthFt, from, to, toPoint: call.toPoint ?? null, unit });
    perimeter += lengthFt;
  });

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dn = first.n - last.n;
  const de = first.e - last.e;
  const closureDistance = Math.hypot(dn, de);
  const closureBearing = closureDistance > 1e-9
    ? azimuthToBearing((Math.atan2(de, dn) * 180) / Math.PI)
    : null;
  const closurePrecision = perimeter > 0 && closureDistance > 1e-9
    ? Math.round(perimeter / closureDistance)
    : null;

  const parts: string[] = [];
  if (legs.length === 0) {
    parts.push('No call could be placed, so no corner has a position relative to any other.');
  } else {
    parts.push(`${legs.length} of ${calls.length} call(s) placed; ${points.length} corner(s) positioned.`);
  }
  if (unusable.length > 0) {
    // Stated, and stated as breaking the CHAIN — a traverse missing a leg is not a traverse with one
    // fewer side, it is two disconnected runs of corners.
    parts.push(
      `${unusable.length} call(s) could NOT be placed, so the corners after each break are positioned ` +
        `relative to the break rather than to the point of beginning.`,
    );
  }
  if (closurePrecision !== null && unusable.length === 0) {
    parts.push(`Closure ${closureDistance.toFixed(2)} over ${perimeter.toFixed(2)} — about 1 in ${closurePrecision}.`);
  } else if (unusable.length > 0) {
    parts.push('Closure is NOT reported: a traverse with unplaced calls cannot have a meaningful closure error.');
  }

  return {
    points, legs, unusable,
    closureDistance: unusable.length === 0 ? closureDistance : NaN,
    closureBearing: unusable.length === 0 ? closureBearing : null,
    perimeter,
    closurePrecision: unusable.length === 0 ? closurePrecision : null,
    statement: parts.join(' '),
  };
}

// ── The question a crew actually asks ───────────────────────────────────────────────────────────

export interface Inverse {
  azimuthDeg: number;
  bearing: string;
  distance: number;
}

/** From one corner to another: which way, and how far.
 *
 *  This is the inverse, and it is the whole point of computing coordinates — it answers the question
 *  no metes-and-bounds description answers directly, because a deed only ever describes consecutive
 *  corners. From the rod in hand to the one two corners away, the deed is silent and this is not. */
export function inverse(from: Point, to: Point): Inverse {
  const dn = to.n - from.n;
  const de = to.e - from.e;
  const distance = Math.hypot(dn, de);
  const azimuthDeg = normaliseAzimuth((Math.atan2(de, dn) * 180) / Math.PI);
  return { azimuthDeg, bearing: azimuthToBearing(azimuthDeg), distance };
}
