// __tests__/cad/io/trv-bearings.test.ts
//
// cad-trv-bearings-and-distances Slice 1 — pure bearing+distance
// math, verified against Traverse PC's reported values for the
// real Garland BOUNDARY traverse.

import { describe, it, expect } from 'vitest';
import {
  surveyorsBearing,
  formatDistance,
  segmentDistance,
  traverseSegmentLabels,
} from '@/lib/cad/io/trv-bearings';

describe('surveyorsBearing — Garland BOUNDARY (matches TPC to the second)', () => {
  // Source coords from the live TRV; expected bearings from
  // TPC's "Traverse View - BOUNDARY" screenshot.
  const pts = {
    '20fnd': { n: 10385166.492, e: 3245972.976 },
    '21fnd': { n: 10385251.253, e: 3245685.600 },
    '22fnd': { n: 10385389.919, e: 3245727.070 },
    '23fnd': { n: 10385305.140, e: 3246014.441 },
  };

  it('20fnd → 21fnd matches TPC\'s N73°34\'00"W', () => {
    expect(surveyorsBearing(pts['20fnd'], pts['21fnd'])).toBe('N73°34\'00"W');
  });
  it('21fnd → 22fnd matches TPC\'s N16°39\'00"E', () => {
    expect(surveyorsBearing(pts['21fnd'], pts['22fnd'])).toBe('N16°39\'00"E');
  });
  it('22fnd → 23fnd matches TPC\'s S73°33\'47"E', () => {
    expect(surveyorsBearing(pts['22fnd'], pts['23fnd'])).toBe('S73°33\'47"E');
  });
  it('23fnd → 20fnd matches TPC\'s S16°39\'01"W', () => {
    expect(surveyorsBearing(pts['23fnd'], pts['20fnd'])).toBe('S16°39\'01"W');
  });
});

describe('surveyorsBearing — quadrant boundaries', () => {
  it('due north → N0°00\'00"E', () => {
    expect(surveyorsBearing({ n: 0, e: 0 }, { n: 100, e: 0 })).toBe('N0°00\'00"E');
  });
  it('due east → N90°00\'00"E', () => {
    expect(surveyorsBearing({ n: 0, e: 0 }, { n: 0, e: 100 })).toBe('N90°00\'00"E');
  });
  it('due south → S0°00\'00"E (boundary picks East at azimuth=180)', () => {
    // At azimuth exactly 180° our impl picks 'S 0° E' (the
    // <= 180 branch).
    expect(surveyorsBearing({ n: 0, e: 0 }, { n: -100, e: 0 })).toBe('S0°00\'00"E');
  });
  it('due west → S90°00\'00"W (azimuth 270 falls in the S-W branch)', () => {
    // At azimuth exactly 270° the convention is ambiguous (it's
    // both N90°W and S90°W mathematically). Our impl picks
    // S90°W via the <= 270 branch — assert the deterministic
    // result so future refactors don't silently flip.
    expect(surveyorsBearing({ n: 0, e: 0 }, { n: 0, e: -100 })).toBe('S90°00\'00"W');
  });
  it('45° NE → N45°00\'00"E', () => {
    expect(surveyorsBearing({ n: 0, e: 0 }, { n: 100, e: 100 })).toBe('N45°00\'00"E');
  });
  it('45° SW → S45°00\'00"W', () => {
    expect(surveyorsBearing({ n: 0, e: 0 }, { n: -100, e: -100 })).toBe('S45°00\'00"W');
  });
});

describe('formatDistance', () => {
  it('default 2 decimals + foot mark', () => {
    expect(formatDistance(299.62)).toBe('299.62\'');
    expect(formatDistance(144.73456)).toBe('144.73\'');
  });
  it('custom decimals', () => {
    expect(formatDistance(299.62, 3)).toBe('299.620\'');
    expect(formatDistance(299.62, 0)).toBe('300\'');
  });
});

describe('segmentDistance — Garland BOUNDARY (matches TPC to 0.01\')', () => {
  const pts = {
    '20fnd': { n: 10385166.492, e: 3245972.976 },
    '21fnd': { n: 10385251.253, e: 3245685.600 },
    '22fnd': { n: 10385389.919, e: 3245727.070 },
    '23fnd': { n: 10385305.140, e: 3246014.441 },
  };
  it('20fnd → 21fnd ≈ 299.62 ft', () => {
    expect(segmentDistance(pts['20fnd'], pts['21fnd'])).toBeCloseTo(299.62, 2);
  });
  it('21fnd → 22fnd ≈ 144.73 ft', () => {
    expect(segmentDistance(pts['21fnd'], pts['22fnd'])).toBeCloseTo(144.73, 2);
  });
  it('22fnd → 23fnd ≈ 299.62 ft', () => {
    expect(segmentDistance(pts['22fnd'], pts['23fnd'])).toBeCloseTo(299.62, 2);
  });
  it('23fnd → 20fnd ≈ 144.72 ft', () => {
    expect(segmentDistance(pts['23fnd'], pts['20fnd'])).toBeCloseTo(144.72, 2);
  });
  it('BOUNDARY perimeter sums to TPC\'s 888.68 ft (closure check)', () => {
    const total = ['20fnd→21fnd', '21fnd→22fnd', '22fnd→23fnd', '23fnd→20fnd']
      .map((seg) => {
        const [a, b] = seg.split('→') as Array<keyof typeof pts>;
        return segmentDistance(pts[a], pts[b]);
      })
      .reduce((s, d) => s + d, 0);
    expect(total).toBeCloseTo(888.68, 2);
  });
});

describe('traverseSegmentLabels', () => {
  it('returns N-1 labels for an N-vertex chain', () => {
    const labels = traverseSegmentLabels([
      { n: 0, e: 0 }, { n: 100, e: 0 }, { n: 100, e: 100 },
    ]);
    expect(labels).toHaveLength(2);
  });

  it('an empty chain returns no labels', () => {
    expect(traverseSegmentLabels([])).toEqual([]);
    expect(traverseSegmentLabels([{ n: 0, e: 0 }])).toEqual([]);
  });

  it('skips zero-length segments (consecutive identical vertices)', () => {
    expect(traverseSegmentLabels([
      { n: 0, e: 0 }, { n: 0, e: 0 }, { n: 100, e: 0 },
    ])).toHaveLength(1);
  });

  it('midpoint sits at the average of the segment endpoints', () => {
    const [label] = traverseSegmentLabels([
      { n: 0, e: 0 }, { n: 100, e: 200 },
    ]);
    expect(label.midpoint).toEqual({ n: 50, e: 100 });
  });

  it('full BOUNDARY chain produces 4 labels matching TPC', () => {
    const labels = traverseSegmentLabels([
      { n: 10385166.492, e: 3245972.976 }, // 20fnd
      { n: 10385251.253, e: 3245685.600 }, // 21fnd
      { n: 10385389.919, e: 3245727.070 }, // 22fnd
      { n: 10385305.140, e: 3246014.441 }, // 23fnd
      { n: 10385166.492, e: 3245972.976 }, // back to 20fnd (closed)
    ]);
    expect(labels.map((l) => l.bearing)).toEqual([
      'N73°34\'00"W', 'N16°39\'00"E', 'S73°33\'47"E', 'S16°39\'01"W',
    ]);
    expect(labels.map((l) => l.distance)).toEqual([
      '299.62\'', '144.73\'', '299.62\'', '144.72\'',
    ]);
  });
});
