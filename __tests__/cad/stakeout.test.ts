// C29 — station–offset and radial stakeout.
//
// C27's gap list, measured against a standard COGO toolkit, found four capabilities genuinely
// absent. These are the two a crew uses on an ordinary day, and both are pure geometry over data
// the drawing already holds.
//
// The tests lean hard on SIGN, because a stakeout number wrong by a sign sends somebody to the
// wrong side of a road, and every scalar in the answer still looks right.

import { describe, it, expect } from 'vitest';
import {
  stationOffset,
  pointAtStationOffset,
  alignmentLength,
  radialStakeout,
  shotToPoint,
} from '@/lib/cad/geometry/stakeout';
import type { Point2D } from '@/lib/cad/types';

/** A 100-ft alignment running due EAST from the origin. x = easting, y = northing. */
const EAST: Point2D[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

/** East 100, then north 100 — an L, for the vertex and multi-segment cases. */
const ELL: Point2D[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

describe('station along the alignment', () => {
  it('measures from the start', () => {
    expect(stationOffset(EAST, { x: 30, y: 0 })!.station).toBeCloseTo(30, 9);
  });

  it('accumulates across segments', () => {
    // 100 ft of the first leg plus 40 up the second.
    expect(stationOffset(ELL, { x: 100, y: 40 })!.station).toBeCloseTo(140, 9);
  });

  it('clamps a point beyond the end to the end', () => {
    // Projecting past the alignment would report a station on centreline that does not exist.
    const so = stationOffset(EAST, { x: 150, y: 0 })!;
    expect(so.station).toBeCloseTo(100, 9);
  });

  it('returns null for an alignment that is not one', () => {
    expect(stationOffset([], { x: 0, y: 0 })).toBeNull();
    expect(stationOffset([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBeNull();
  });

  it('survives a zero-length segment', () => {
    // Duplicate vertices happen in imported linework, and dividing by that length would produce
    // NaN stations for every point on the alignment.
    const dup: Point2D[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(stationOffset(dup, { x: 30, y: 0 })!.station).toBeCloseTo(30, 9);
  });
});

describe('offset side — the sign that matters', () => {
  it('is RIGHT for a point right of the direction of travel', () => {
    // Travelling EAST, "right" is SOUTH.
    const so = stationOffset(EAST, { x: 30, y: -12 })!;
    expect(so.side).toBe('RIGHT');
    expect(so.offset).toBeCloseTo(12, 9);
  });

  it('is LEFT for a point left of travel, with a negative offset', () => {
    const so = stationOffset(EAST, { x: 30, y: 12 })!;
    expect(so.side).toBe('LEFT');
    expect(so.offset).toBeCloseTo(-12, 9);
  });

  it('flips when the alignment runs the other way', () => {
    // The same point, the same ground, the opposite call — which is exactly why this is reported
    // as a side rather than an absolute distance.
    const west: Point2D[] = [{ x: 100, y: 0 }, { x: 0, y: 0 }];
    expect(stationOffset(west, { x: 30, y: -12 })!.side).toBe('LEFT');
  });

  it('says ON for a point on the line, rather than a hair to one side', () => {
    // A 0.0001-ft offset reported as "RIGHT" is noise presented as a fact.
    const so = stationOffset(EAST, { x: 30, y: 0 })!;
    expect(so.side).toBe('ON');
    expect(so.offset).toBe(0);
  });

  it('puts the base point on the alignment', () => {
    const so = stationOffset(EAST, { x: 30, y: -12 })!;
    expect(so.basePoint).toEqual({ x: 30, y: 0 });
  });
});

describe('the nearest segment wins', () => {
  it('does not report the first segment that happens to be close', () => {
    // A hairpin: out 100 east, then back west 100 offset 10 north. A point near the return leg is
    // within 10 ft of BOTH, and taking the first would report a station ~200 ft from the right one
    // while the offset still looked plausible.
    const hairpin: Point2D[] = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 0, y: 10 },
    ];
    const so = stationOffset(hairpin, { x: 20, y: 9 })!;
    expect(so.segmentIndex).toBe(2);
    // 100 + 10 along, then 80 back west.
    expect(so.station).toBeCloseTo(190, 6);
    expect(so.offset).toBeCloseTo(-1, 6);
  });

  it('breaks a tie toward the earlier segment', () => {
    // A point exactly at an interior vertex is equidistant from both. Either answer is defensible;
    // an answer that changes between identical calls is not.
    const a = stationOffset(ELL, { x: 100, y: 0 })!;
    const b = stationOffset(ELL, { x: 100, y: 0 })!;
    expect(a.segmentIndex).toBe(0);
    expect(a).toEqual(b);
  });
});

describe('station + offset → point', () => {
  it('round-trips', () => {
    for (const p of [{ x: 30, y: -12 }, { x: 70, y: 5 }, { x: 100, y: 40 }]) {
      const so = stationOffset(ELL, p)!;
      const back = pointAtStationOffset(ELL, so.station, so.offset)!;
      expect(near(back.x, p.x, 1e-6) && near(back.y, p.y, 1e-6), JSON.stringify(p)).toBe(true);
    }
  });

  it('offsets to the RIGHT for a positive value', () => {
    // The same convention as the reader, checked independently — the two drifting apart would make
    // the round-trip above pass while both were wrong.
    const p = pointAtStationOffset(EAST, 30, 12)!;
    expect(p.y).toBeCloseTo(-12, 9);
  });

  it('clamps rather than extrapolating past the end', () => {
    // A surveyor typing 2400 on a 190-foot alignment has made a mistake; inventing centreline to
    // honour it answers the question they typed instead of the one they meant.
    const p = pointAtStationOffset(ELL, 5000, 0)!;
    expect(p).toEqual({ x: 100, y: 100 });
  });

  it('measures the alignment', () => {
    expect(alignmentLength(ELL)).toBeCloseTo(200, 9);
    expect(alignmentLength([{ x: 0, y: 0 }])).toBe(0);
  });
});

describe('radial stakeout', () => {
  const setup = { x: 0, y: 0 };
  const backsight = { x: 0, y: 100 }; // due north

  it('gives azimuth and distance from the setup', () => {
    const [shot] = radialStakeout(setup, backsight, [{ id: 'A', point: { x: 100, y: 0 } }]);
    expect(shot.azimuth).toBeCloseTo(90, 9);
    expect(shot.distance).toBeCloseTo(100, 9);
  });

  it('gives the angle right from the backsight, which is the number dialled in', () => {
    // An azimuth is only usable if the instrument is already oriented, which is why this takes a
    // backsight at all.
    const shots = radialStakeout(setup, backsight, [
      { id: 'E', point: { x: 100, y: 0 } },
      { id: 'S', point: { x: 0, y: -100 } },
      { id: 'W', point: { x: -100, y: 0 } },
    ]);
    expect(shots[0].angleRight).toBeCloseTo(90, 9);
    expect(shots[1].angleRight).toBeCloseTo(180, 9);
    expect(shots[2].angleRight).toBeCloseTo(270, 9);
  });

  it('never returns a negative angle right', () => {
    // A total station has no negative angle-right. Backsighting east and shooting north is 270,
    // not −90.
    const shots = radialStakeout(setup, { x: 100, y: 0 }, [{ id: 'N', point: { x: 0, y: 100 } }]);
    expect(shots[0].angleRight).toBeCloseTo(270, 9);
  });

  it('drops a target sitting on the setup instead of inventing a shot', () => {
    // `atan2(0, 0)` is 0, which would print "N 00°00'00\" E, 0.00 ft" and read like a real shot at
    // north.
    expect(radialStakeout(setup, backsight, [{ id: 'X', point: { x: 0, y: 0 } }])).toEqual([]);
  });

  it('keeps the caller’s ids and points', () => {
    const [shot] = radialStakeout(setup, backsight, [{ id: 'PT-14', point: { x: 3, y: 4 } }]);
    expect(shot.id).toBe('PT-14');
    expect(shot.target).toEqual({ x: 3, y: 4 });
  });
});

describe('a stakeout list can be checked against the drawing', () => {
  it('turning the angle and chaining the distance lands on the target', () => {
    // A list that cannot be verified against the geometry it came from is a list somebody has to
    // trust. This is the round-trip that makes it checkable.
    const setup = { x: 1000, y: 2000 };
    const backsight = { x: 1200, y: 2050 };
    const targets = [
      { id: 'a', point: { x: 1100, y: 2100 } },
      { id: 'b', point: { x: 900, y: 1950 } },
      { id: 'c', point: { x: 1000, y: 1800 } },
    ];
    for (const shot of radialStakeout(setup, backsight, targets)) {
      const p = shotToPoint(setup, backsight, shot.angleRight, shot.distance);
      expect(near(p.x, shot.target.x, 1e-6), shot.id).toBe(true);
      expect(near(p.y, shot.target.y, 1e-6), shot.id).toBe(true);
    }
  });
});
