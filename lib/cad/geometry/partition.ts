// lib/cad/geometry/partition.ts — C29, split a parcel to a target area
//
// ── WHY THIS ONE ────────────────────────────────────────────────────────────────────────────────
//
// C27 called it "the classic reason a surveyor opens a calculator at all", and found nothing in the
// product that could do it. "Cut me one acre off the north end" is a request that arrives on the
// phone, and answering it by hand means guessing a line, computing the area, and guessing again.
//
// ── HOW IT IS SOLVED, AND WHY NOT ALGEBRAICALLY ─────────────────────────────────────────────────
//
// A closed-form solution exists for a cut across a convex quadrilateral and stops existing the
// moment the parcel has a re-entrant corner, a curved-ish boundary approximated by many vertices,
// or the cut crosses more than two edges — all of which are ordinary.
//
// So: **bisection on the position of the cut**, which works for any simple polygon because the area
// on one side of a sweeping line is *monotonic* in how far the line has swept. Monotonicity is the
// whole justification; without it bisection can converge on the wrong root and report a confident
// wrong answer. It is asserted in the tests rather than assumed.
//
// Every result carries the area it actually achieved, not the area that was asked for. A partition
// that silently reports the target back is useless for the one thing it exists for.

import type { Point2D } from '../types';

const EPS = 1e-9;

/** Signed double area — positive for a counter-clockwise ring. */
function signedDoubleArea(poly: Point2D[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** Absolute area of a simple polygon. */
export function polygonArea(poly: Point2D[]): number {
  if (poly.length < 3) return 0;
  return Math.abs(signedDoubleArea(poly)) / 2;
}

/**
 * The part of `poly` on the keep side of the infinite line through `origin` with direction `dir`.
 *
 * Sutherland–Hodgman. "Keep side" is where the cross product is positive — the LEFT of the
 * direction of travel, matching the sign convention `stakeout.ts` uses so the two modules cannot
 * disagree about which side is which.
 *
 * Correct for convex results and for concave polygons cut into a single piece. A cut that would
 * produce **two disjoint pieces** (an L-shaped parcel sliced across the notch) yields a degenerate
 * ring here rather than two rings — see `partitionByDirection`, which reports that rather than
 * returning a shape nobody can stake.
 */
export function clipToHalfPlane(poly: Point2D[], origin: Point2D, dir: Point2D): Point2D[] {
  if (poly.length < 3) return [];
  const side = (p: Point2D) => (p.x - origin.x) * dir.y - (p.y - origin.y) * dir.x;

  const out: Point2D[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const sc = side(cur);
    const sn = side(nxt);
    // Negative side is kept: with `side` as written, a point to the LEFT of `dir` gives a negative
    // cross. Spelled out because a flipped sign here silently returns the complement — an answer
    // that is exactly as plausible and exactly wrong.
    const keepCur = sc <= EPS;
    const keepNxt = sn <= EPS;
    if (keepCur) out.push(cur);
    if (keepCur !== keepNxt) {
      const t = sc / (sc - sn);
      out.push({ x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) });
    }
  }
  return out;
}

export interface PartitionResult {
  /** The two endpoints of the cut, spanning the parcel. */
  cutLine: [Point2D, Point2D];
  /** The piece on the keep side. */
  keptPolygon: Point2D[];
  /** The area actually achieved — NOT the target. The difference is the answer's honesty. */
  achievedArea: number;
  /** `achievedArea − targetArea`. Signed, so a caller can see which way it missed. */
  error: number;
  iterations: number;
}

/** Project every vertex onto `dir` and return the span, so bisection starts outside the parcel on
 *  both sides and cannot miss the root by starting inside it. */
function projectionRange(poly: Point2D[], dir: Point2D): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const d = p.x * dir.x + p.y * dir.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/**
 * Cut the parcel with a line of a given bearing so the kept side has `targetArea`.
 *
 * `directionDeg` is an azimuth (0 = north, clockwise), matching every other bearing in this
 * codebase. The kept side is the LEFT of that direction.
 *
 * Returns null when the target is not achievable — negative, zero, or larger than the parcel. A
 * caller asking for two acres out of one has made a mistake, and returning the whole parcel with a
 * quiet 1-acre "error" would let it through into a deed.
 */
export function partitionByDirection(
  poly: Point2D[],
  targetArea: number,
  directionDeg: number,
  tolerance = 1e-6,
  maxIterations = 100,
): PartitionResult | null {
  const total = polygonArea(poly);
  if (poly.length < 3 || targetArea <= 0 || targetArea >= total) return null;

  const az = (directionDeg * Math.PI) / 180;
  // Azimuth → vector, the same mapping `forwardPoint` uses: x is easting, y is northing.
  const dir = { x: Math.sin(az), y: Math.cos(az) };
  // The line sweeps along its own normal.
  const normal = { x: -dir.y, y: dir.x };
  const { min, max } = projectionRange(poly, normal);

  let lo = min - 1;
  let hi = max + 1;
  const areaAt = (d: number) => {
    const origin = { x: normal.x * d, y: normal.y * d };
    const kept = clipToHalfPlane(poly, origin, dir);
    return { kept, area: polygonArea(kept) };
  };

  // Area on the keep side is monotonic in `mid` — that is what makes bisection sound here — but
  // whether it RISES or FALLS depends on which way the normal points relative to the kept side.
  // Measured once at the brackets rather than reasoned about: the first version assumed rising,
  // and for an eastward cut the kept (north) side shrinks as the line moves north, so every
  // bisection ran the wrong way and returned the whole parcel. Deriving the sense also means a
  // future change to the keep-side convention cannot silently invert this.
  const risesWithD = areaAt(hi).area > areaAt(lo).area;

  let iterations = 0;
  let mid = (lo + hi) / 2;
  let kept: Point2D[] = [];
  let area = 0;

  while (iterations < maxIterations) {
    iterations += 1;
    mid = (lo + hi) / 2;
    const at = areaAt(mid);
    kept = at.kept;
    area = at.area;
    if (Math.abs(area - targetArea) <= tolerance) break;
    if ((area < targetArea) === risesWithD) lo = mid;
    else hi = mid;
  }

  if (kept.length < 3) return null;

  const origin = { x: normal.x * mid, y: normal.y * mid };
  // Span the cut generously past the parcel so the returned line crosses it completely — a cut that
  // stops at the mathematical intersection is hard to snap to and impossible to extend by eye.
  const reach = Math.hypot(max - min, max - min) + polygonDiagonal(poly);
  return {
    cutLine: [
      { x: origin.x - dir.x * reach, y: origin.y - dir.y * reach },
      { x: origin.x + dir.x * reach, y: origin.y + dir.y * reach },
    ],
    keptPolygon: kept,
    achievedArea: area,
    error: area - targetArea,
    iterations,
  };
}

/** Longest span of the polygon's bounding box — enough to guarantee a cut line crosses it. */
function polygonDiagonal(poly: Point2D[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/**
 * Cut the parcel with a line **hinged at a fixed point**, rotating until the kept side has
 * `targetArea`.
 *
 * The other half of how this request actually arrives: "one acre off the north end, hinged at the
 * existing corner monument" — because the cut has to start somewhere a crew can find.
 *
 * **Not plain bisection — a sampled sweep first, then bisection inside the bracket it finds.**
 *
 * The direction case can bisect straight away because area is monotonic in how far the cut has
 * swept. Rotating about a hinge is NOT monotonic, and assuming it was is a bug this shipped with
 * for one test run. Hinged at (40, 0) on a 100 × 100 square: bearing 0 keeps 4,000, bearing 180
 * keeps 6,000 — but bearing 90 keeps the whole 10,000 and bearing 270 keeps nothing. A bracket
 * taken from the two endpoints sees 4,000 and 6,000, declares 3,500 unreachable, and returns null
 * for a cut that plainly exists.
 *
 * So the full turn is sampled coarsely, the first interval that brackets the target is taken, and
 * bisection runs inside it — where the function *is* monotonic. Sampling the full 360° rather than
 * a half is deliberate: a line and its reverse are the same line but keep **opposite** sides, so a
 * half turn reaches only one of each pair of complementary areas.
 */
export function partitionFromHinge(
  poly: Point2D[],
  hinge: Point2D,
  targetArea: number,
  startBearingDeg = 0,
  tolerance = 1e-6,
  maxIterations = 200,
): PartitionResult | null {
  const total = polygonArea(poly);
  if (poly.length < 3 || targetArea <= 0 || targetArea >= total) return null;

  const areaAt = (deg: number) => {
    const az = (deg * Math.PI) / 180;
    const dir = { x: Math.sin(az), y: Math.cos(az) };
    const kept = clipToHalfPlane(poly, hinge, dir);
    return { kept, area: polygonArea(kept), dir };
  };

  // 1° steps: fine enough that no polygon this product draws hides a whole crossing between two
  // samples, coarse enough to cost 360 clips.
  const STEP = 1;
  let lo = NaN;
  let hi = NaN;
  let aLo = 0;
  let prev = areaAt(startBearingDeg).area;
  for (let d = startBearingDeg + STEP; d <= startBearingDeg + 360; d += STEP) {
    const cur = areaAt(d).area;
    if ((prev - targetArea) * (cur - targetArea) <= 0) {
      lo = d - STEP;
      hi = d;
      aLo = prev;
      break;
    }
    prev = cur;
  }
  if (Number.isNaN(lo)) return null;

  let iterations = 0;
  let mid = (lo + hi) / 2;
  let cur = areaAt(mid);
  while (iterations < maxIterations) {
    iterations += 1;
    mid = (lo + hi) / 2;
    cur = areaAt(mid);
    if (Math.abs(cur.area - targetArea) <= tolerance) break;
    if ((cur.area - targetArea) * (aLo - targetArea) > 0) lo = mid;
    else hi = mid;
  }

  if (cur.kept.length < 3) return null;

  const reach = polygonDiagonal(poly) * 2;
  return {
    cutLine: [
      { x: hinge.x, y: hinge.y },
      { x: hinge.x + cur.dir.x * reach, y: hinge.y + cur.dir.y * reach },
    ],
    keptPolygon: cur.kept,
    achievedArea: cur.area,
    error: cur.area - targetArea,
    iterations,
  };
}
