// __tests__/jobs/capture-track.test.ts — did they walk, or were they standing still?
//
// Owner, 2026-09-20: "we will show the path the user walked for videos, if they walked far enough
// for it to matter at least."
//
// The whole module exists because "far enough to matter" — 15 ft, about 4.6 m — sits AT the noise
// floor of a phone GPS. A device lying on a tailgate wanders that far. So the tests that matter
// here are the ones asserting that a STATIONARY clip produces one point, because the obvious
// implementation produces a bird's nest and nobody reports it as a bug: it looks like data.

import { describe, it, expect } from 'vitest';
import {
  cleanTrack, trackShape, positionAt, metresBetween, feetBetween,
  MATTERS_FEET, UNUSABLE_ACCURACY_M, FEET_PER_METRE, type TrackSample,
} from '@/lib/jobs/capture-track';

/** Temple, Texas — Bell County, where this firm works. */
const BASE = { lat: 31.0982, lng: -97.3428 };

/** A point `feet` north of base. Latitude only, so the maths is easy to reason about. */
function north(feet: number, t: number, acc = 4): TrackSample {
  const metres = feet / FEET_PER_METRE;
  return { t, lat: BASE.lat + metres / 111_320, lng: BASE.lng, acc };
}

describe('distance', () => {
  it('measures a known short hop', () => {
    // 111,320 m per degree of latitude is the FLAT approximation, and it is the imprecise half of
    // this comparison: the true figure varies with latitude and is about 110,878 m at 31°N. So the
    // haversine result lands ~0.1% off the approximation, which is the approximation being wrong
    // rather than the module. Asserted as a tolerance band so the test says which is which.
    const a = { lat: 31.0982, lng: -97.3428 };
    const b = { lat: 31.0982 + 100 / 111_320, lng: -97.3428 };
    const d = metresBetween(a, b);
    expect(d).toBeGreaterThan(99.5);
    expect(d).toBeLessThan(100.5);
  });

  it('is zero for the same place', () => {
    expect(metresBetween(BASE, BASE)).toBe(0);
  });

  it('converts to feet with the right constant', () => {
    const b = { lat: BASE.lat + 100 / 111_320, lng: BASE.lng };
    expect(feetBetween(BASE, b)).toBeCloseTo(100 * FEET_PER_METRE, 0);
  });
});

describe('standing still produces ONE point, not a bird nest', () => {
  it('a phone wandering inside its own accuracy is not movement', () => {
    // Eight fixes scattered by up to 12 ft, each reporting ±5 m (16 ft) accuracy. Every one of
    // those jumps is under the accuracy the device itself declared — the phone has not told us it
    // moved, it has told us it does not know where it is.
    const jitter: TrackSample[] = [0, 1, 2, 3, 4, 5, 6, 7].map((t) =>
      north(t % 2 === 0 ? 0 : 12, t, 5),
    );
    const shape = trackShape(jitter);
    expect(shape.kind).toBe('point');
  });

  it('three minutes at a fence corner is a pin', () => {
    const still: TrackSample[] = Array.from({ length: 180 }, (_, t) => north((t % 3) * 4, t, 6));
    expect(trackShape(still).kind).toBe('point');
  });
});

describe('walking produces a path', () => {
  const walk: TrackSample[] = [
    north(0, 0), north(40, 5), north(85, 10), north(130, 15), north(175, 20),
  ];

  it('is a path', () => {
    expect(trackShape(walk).kind).toBe('path');
  });

  it('anchors at the start and lists only the bends after it', () => {
    // seeds/642:29-30 — "x/y is where it started, vertices are the bends after it". Repeating the
    // first sample in `vertices` would draw a zero-length first segment.
    const shape = trackShape(walk);
    if (shape.kind !== 'path') throw new Error('expected a path');
    expect(shape.at.lat).toBeCloseTo(walk[0]!.lat, 10);
    expect(shape.vertices).toHaveLength(4);
    expect(shape.vertices[0]!.lat).not.toBeCloseTo(shape.at.lat, 10);
  });

  it('measures roughly the distance actually walked', () => {
    const shape = trackShape(walk);
    if (shape.kind !== 'path') throw new Error('expected a path');
    expect(shape.lengthFeet).toBeGreaterThan(160);
    expect(shape.lengthFeet).toBeLessThan(190);
  });

  it('twenty feet is a clean two-point segment, as asked for', () => {
    // The owner's own example of the smallest thing that should count.
    const shape = trackShape([north(0, 0, 2), north(21, 4, 2)]);
    expect(shape.kind).toBe('path');
  });
});

describe('the accuracy half of the threshold', () => {
  it('a vague fix is not read as movement', () => {
    // 20 ft of apparent movement, but the phone said ±12 m (39 ft). Distance alone would call this
    // a walk; both thresholds together correctly call it noise.
    const shape = trackShape([north(0, 0, 12), north(20, 5, 12), north(0, 10, 12)]);
    expect(shape.kind).toBe('point');
  });

  it('the same movement with a good fix IS a walk', () => {
    const shape = trackShape([north(0, 0, 2), north(40, 5, 2), north(80, 10, 2)]);
    expect(shape.kind).toBe('path');
  });

  it('drops a fix worse than the unusable threshold outright', () => {
    const kept = cleanTrack([
      north(0, 0, 3),
      { ...north(500, 5), acc: UNUSABLE_ACCURACY_M + 1 },
      north(60, 10, 3),
    ]);
    expect(kept.map((s) => s.t)).toEqual([0, 10]);
  });

  it('an UNSTATED accuracy is treated as uncertain, not as perfect', () => {
    // A device that did not say is not a device that was certain. Treating a missing accuracy as 0
    // would make every jitter sample count as movement.
    const shape = trackShape([
      { t: 0, ...BASE }, { t: 1, lat: BASE.lat + 3 / 111_320, lng: BASE.lng },
      { t: 2, ...BASE }, { t: 3, lat: BASE.lat + 3 / 111_320, lng: BASE.lng },
    ]);
    expect(shape.kind).toBe('point');
  });
});

describe('the first and last samples are always kept', () => {
  it('keeps both ends of a walk', () => {
    const walk = [north(0, 0), north(3, 1), north(6, 2), north(200, 30)];
    const kept = cleanTrack(walk);
    expect(kept[0]!.t).toBe(0);
    expect(kept[kept.length - 1]!.t).toBe(30);
  });

  it('a path is never shortened by dropping its end', () => {
    // Without the always-keep-last rule, a walk that ends with a small final step loses it and
    // every path comes out up to one threshold short.
    const walk = [north(0, 0), north(100, 10), north(108, 12)];
    const shape = trackShape(walk);
    if (shape.kind !== 'path') throw new Error('expected a path');
    expect(shape.vertices[shape.vertices.length - 1]!.lat).toBeCloseTo(walk[2]!.lat, 10);
  });
});

describe('rubbish in, nothing out', () => {
  it('an empty track is nothing at all', () => {
    expect(trackShape([]).kind).toBe('none');
  });

  it('refuses Null Island', () => {
    // A real coordinate in the Gulf of Guinea and what a zeroed struct looks like. seeds/653
    // rejects it at the column too.
    expect(cleanTrack([{ t: 0, lat: 0, lng: 0 }])).toEqual([]);
  });

  it.each([
    ['NaN', { t: 0, lat: NaN, lng: -97 }],
    ['out of range latitude', { t: 0, lat: 120, lng: -97 }],
    ['out of range longitude', { t: 0, lat: 31, lng: 400 }],
    ['non-finite t', { t: Infinity, lat: 31, lng: -97 }],
  ])('drops %s', (_l, bad) => {
    expect(cleanTrack([bad as TrackSample])).toEqual([]);
  });

  it('sorts out-of-order samples rather than drawing a zigzag', () => {
    const jumbled = [north(200, 30), north(0, 0), north(100, 15)];
    expect(cleanTrack(jumbled).map((s) => s.t)).toEqual([0, 15, 30]);
  });
});

describe('positionAt drives the marker from playback time', () => {
  const walk = [north(0, 0), north(100, 10), north(200, 20)];

  it('interpolates between two fixes', () => {
    const at = positionAt(walk, 5)!;
    expect(at.lat).toBeCloseTo((walk[0]!.lat + walk[1]!.lat) / 2, 10);
  });

  it('holds at the start before the first fix', () => {
    // A marker that extrapolates backwards runs off the path during the lead-in.
    expect(positionAt(walk, -3)!.lat).toBeCloseTo(walk[0]!.lat, 10);
  });

  it('holds at the end after the last fix', () => {
    expect(positionAt(walk, 999)!.lat).toBeCloseTo(walk[2]!.lat, 10);
  });

  it('lands exactly on a sample at its own timestamp', () => {
    expect(positionAt(walk, 10)!.lat).toBeCloseTo(walk[1]!.lat, 10);
  });

  it('survives two fixes at the same instant instead of dividing by zero', () => {
    const dup = [north(0, 0), north(50, 5), north(90, 5), north(140, 10)];
    const at = positionAt(dup, 5);
    expect(at).not.toBeNull();
    expect(Number.isFinite(at!.lat)).toBe(true);
  });

  it('is null when there is nothing usable', () => {
    expect(positionAt([], 3)).toBeNull();
    expect(positionAt([{ t: 0, lat: 0, lng: 0 }], 3)).toBeNull();
  });

  it('a non-finite time falls back to the start rather than returning NaN', () => {
    expect(positionAt(walk, NaN)!.lat).toBeCloseTo(walk[0]!.lat, 10);
  });
});

describe('the thresholds are the owner’s numbers', () => {
  it('15 feet', () => {
    expect(MATTERS_FEET).toBe(15);
  });

  it('and a fix vaguer than 30 m is not a position on a property', () => {
    expect(UNUSABLE_ACCURACY_M).toBe(30);
  });

  it('the threshold is adjustable without editing the module', () => {
    // A drone or a vehicle-mounted camera moves further between fixes; the caller can say so.
    const small = [north(0, 0, 1), north(8, 5, 1)];
    expect(trackShape(small).kind, 'default 15ft: not a walk').toBe('point');
    expect(trackShape(small, { mattersFeet: 5 }).kind, 'a 5ft threshold: a walk').toBe('path');
  });
});
