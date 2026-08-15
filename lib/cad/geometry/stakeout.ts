// lib/cad/geometry/stakeout.ts — C29, station–offset and radial stakeout
//
// ── WHY THESE TWO ───────────────────────────────────────────────────────────────────────────────
//
// C27's gap list, measured against a standard COGO toolkit, found four things genuinely absent from
// this product. These are the two that a crew uses on an ordinary day:
//
//   STATION–OFFSET   where is this point along the alignment, and how far off it?
//   RADIAL STAKEOUT  from this setup, what do I turn and how far do I go, for each of these points?
//
// Both are pure geometry over data the drawing already holds, which is why they belong in a tested
// module rather than inside a dialog. A stakeout number that is wrong by a sign sends somebody to
// the wrong side of a road.

import type { Point2D } from '../types';
import { closestPointOnSegment } from './point';
import { inverseBearingDistance, forwardPoint } from './bearing';

// ── Station / offset ───────────────────────────────────────────────────────────────────────────

export interface StationOffset {
  /** Distance along the alignment from its start, in world units. */
  station: number;
  /** Perpendicular distance from the alignment. **Signed**: positive right of the direction of
   *  travel, negative left. */
  offset: number;
  /** The sign, spelled out. Surveyors say "12 feet left", not "offset −12". */
  side: 'LEFT' | 'RIGHT' | 'ON';
  /** Where the perpendicular meets the alignment. */
  basePoint: Point2D;
  /** Which segment of the alignment carried it, 0-based. */
  segmentIndex: number;
}

/** Tolerance below which a point counts as ON the alignment rather than a hair to one side. A
 *  0.0001 ft offset reported as "RIGHT" is noise presented as a fact. */
const ON_TOLERANCE = 1e-6;

/**
 * Station and offset of `p` along a polyline alignment.
 *
 * **The nearest segment wins, not the first one within tolerance.** An alignment that doubles back
 * — a cul-de-sac, a hairpin — has points that are close to two segments at once, and taking the
 * first would report a station hundreds of feet from the right one while the offset still looked
 * plausible.
 *
 * Ties break toward the EARLIER segment, so a point exactly at an interior vertex reports the
 * station of that vertex either way and never oscillates between two answers on re-computation.
 */
export function stationOffset(alignment: Point2D[], p: Point2D): StationOffset | null {
  if (alignment.length < 2) return null;

  let best: StationOffset | null = null;
  let bestDist = Infinity;
  let runningStation = 0;

  for (let i = 0; i < alignment.length - 1; i += 1) {
    const a = alignment[i];
    const b = alignment[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;

    const { point, t } = closestPointOnSegment(p, a, b);
    const d = Math.hypot(p.x - point.x, p.y - point.y);

    // Strictly less-than keeps the earlier segment on a tie.
    if (d < bestDist - 1e-12) {
      bestDist = d;
      // Cross product of the segment direction with the vector to the point. In this frame x is
      // easting and y is northing, so a NEGATIVE cross means the point lies to the RIGHT of the
      // direction of travel.
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const side: StationOffset['side'] =
        Math.abs(cross) <= ON_TOLERANCE * segLen ? 'ON' : cross < 0 ? 'RIGHT' : 'LEFT';
      best = {
        station: runningStation + t * segLen,
        offset: side === 'RIGHT' ? d : side === 'LEFT' ? -d : 0,
        side,
        basePoint: point,
        segmentIndex: i,
      };
    }
    runningStation += segLen;
  }

  return best;
}

/**
 * The inverse: the point at a given station and offset.
 *
 * Stations past either end are **clamped to the alignment ends rather than extrapolated**. A
 * surveyor typing 2400 on a 1900-foot alignment has made a mistake, and inventing 500 feet of
 * imaginary centreline to honour it would answer the question they typed instead of the one they
 * meant. Callers that want the mistake surfaced can compare `station` against `alignmentLength`.
 */
export function pointAtStationOffset(
  alignment: Point2D[],
  station: number,
  offset: number,
): Point2D | null {
  if (alignment.length < 2) return null;

  const total = alignmentLength(alignment);
  const target = Math.max(0, Math.min(total, station));

  let running = 0;
  for (let i = 0; i < alignment.length - 1; i += 1) {
    const a = alignment[i];
    const b = alignment[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;

    if (target <= running + segLen || i === alignment.length - 2) {
      const t = (target - running) / segLen;
      const on = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      if (offset === 0) return on;
      // Unit normal pointing RIGHT of travel, matching the sign convention above.
      const ux = (b.x - a.x) / segLen;
      const uy = (b.y - a.y) / segLen;
      return { x: on.x + offset * uy, y: on.y - offset * ux };
    }
    running += segLen;
  }
  return null;
}

/** Total length of the alignment. */
export function alignmentLength(alignment: Point2D[]): number {
  let total = 0;
  for (let i = 0; i < alignment.length - 1; i += 1) {
    total += Math.hypot(alignment[i + 1].x - alignment[i].x, alignment[i + 1].y - alignment[i].y);
  }
  return total;
}

// ── Radial stakeout ────────────────────────────────────────────────────────────────────────────

export interface StakeoutShot {
  /** Whatever the caller uses to identify the target — a point number, a feature id. */
  id: string;
  /** Azimuth from the setup to the target, degrees, 0 = north, clockwise. */
  azimuth: number;
  /** Horizontal distance from the setup. */
  distance: number;
  /**
   * Clockwise angle from the backsight to the target, degrees in [0, 360).
   *
   * This is the number actually dialled into a total station, and it is the reason this function
   * takes a backsight at all: an azimuth is only usable if the instrument is already oriented.
   */
  angleRight: number;
  target: Point2D;
}

/**
 * Radial stakeout from one setup.
 *
 * Targets at the setup point itself are **dropped rather than reported with a zero distance and a
 * meaningless azimuth** — `atan2(0, 0)` is 0, which would print "N 00°00'00\" E, 0.00 ft" and read
 * like a real shot at north.
 */
export function radialStakeout(
  setup: Point2D,
  backsight: Point2D,
  targets: Array<{ id: string; point: Point2D }>,
): StakeoutShot[] {
  const bs = inverseBearingDistance(setup, backsight);
  const out: StakeoutShot[] = [];

  for (const t of targets) {
    const { azimuth, distance } = inverseBearingDistance(setup, t.point);
    if (distance <= ON_TOLERANCE) continue;
    let angleRight = azimuth - bs.azimuth;
    // Normalised into [0, 360). A total station has no negative angle-right.
    angleRight = ((angleRight % 360) + 360) % 360;
    out.push({ id: t.id, azimuth, distance, angleRight, target: { ...t.point } });
  }
  return out;
}

/**
 * The reverse: where a shot lands.
 *
 * Used to check a field book against the drawing — turn this angle, chain this distance, and the
 * point should be here. A stakeout list that cannot be verified against the geometry it came from
 * is a list somebody has to trust.
 */
export function shotToPoint(
  setup: Point2D,
  backsight: Point2D,
  angleRight: number,
  distance: number,
): Point2D {
  const bs = inverseBearingDistance(setup, backsight);
  return forwardPoint(setup, bs.azimuth + angleRight, distance);
}
