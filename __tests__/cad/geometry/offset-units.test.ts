// __tests__/cad/geometry/offset-units.test.ts
//
// Slice 8 of cad-offset-tool-2026-05-29.md. Fuzz + edge-case coverage
// for the offset path's unit-conversion + recompute helpers. Catches
// regressions in the FT ↔ M / IN / MM conversion table + the
// associativity of recompute under unit swaps that produce the same
// feet-equivalent (e.g. 1 m vs 100 cm vs 1000 mm all parallel to
// the same offset line).

import { describe, it, expect } from 'vitest';
import type { Feature, LinearUnit } from '@/lib/cad/types';
import { distanceToFeet } from '@/lib/cad/operations/apply-offset-from-panel';
import { recomputeOffsetGeometry } from '@/lib/cad/operations/recompute-offset-feature';

function lineSource(): Feature {
  return {
    id: 'src-fuzz',
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

// Anchor values for hand-verification.
const ANCHORS: Array<{ distance: number; unit: LinearUnit; feet: number }> = [
  { distance: 1,    unit: 'FT',   feet: 1 },
  { distance: 12,   unit: 'IN',   feet: 1 },
  { distance: 1,    unit: 'MILE', feet: 5280 },
  { distance: 1,    unit: 'M',    feet: 1 / 0.3048 },
  { distance: 100,  unit: 'CM',   feet: 1 / 0.3048 },
  { distance: 1000, unit: 'MM',   feet: 1 / 0.3048 },
];

describe('distanceToFeet — anchor values', () => {
  it.each(ANCHORS)('$distance $unit → $feet ft', ({ distance, unit, feet }) => {
    const got = distanceToFeet(distance, unit);
    expect(got).not.toBeNull();
    expect(got!).toBeCloseTo(feet, 6);
  });
});

describe('distanceToFeet — equivalent-value triples land at the same feet', () => {
  it('1 m ≈ 100 cm ≈ 1000 mm in feet', () => {
    const m = distanceToFeet(1, 'M')!;
    const cm = distanceToFeet(100, 'CM')!;
    const mm = distanceToFeet(1000, 'MM')!;
    expect(cm).toBeCloseTo(m, 9);
    expect(mm).toBeCloseTo(m, 9);
  });

  it('1 ft ≈ 12 in ≈ 304.8 mm in feet', () => {
    const ft = distanceToFeet(1, 'FT')!;
    const inch = distanceToFeet(12, 'IN')!;
    const mm = distanceToFeet(304.8, 'MM')!;
    expect(inch).toBeCloseTo(ft, 9);
    expect(mm).toBeCloseTo(ft, 6);
  });
});

describe('recompute round-trip — unit swap with the same feet-equivalent produces the same geometry', () => {
  it.each([
    { aDistance: 1,    aUnit: 'M'    as LinearUnit, bDistance: 100,  bUnit: 'CM'   as LinearUnit },
    { aDistance: 1,    aUnit: 'M'    as LinearUnit, bDistance: 1000, bUnit: 'MM'   as LinearUnit },
    { aDistance: 1,    aUnit: 'FT'   as LinearUnit, bDistance: 12,   bUnit: 'IN'   as LinearUnit },
    { aDistance: 5280, aUnit: 'FT'   as LinearUnit, bDistance: 1,    bUnit: 'MILE' as LinearUnit },
  ])('$aDistance $aUnit == $bDistance $bUnit', ({ aDistance, aUnit, bDistance, bUnit }) => {
    const a = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: aDistance, unit: aUnit, side: 'LEFT', cornerHandling: 'MITER',
    })!;
    const b = recomputeOffsetGeometry({
      sourceFeature: lineSource(),
      distance: bDistance, unit: bUnit, side: 'LEFT', cornerHandling: 'MITER',
    })!;
    expect(a.geometry.start!.y).toBeCloseTo(b.geometry.start!.y, 6);
    expect(a.geometry.end!.y).toBeCloseTo(b.geometry.end!.y, 6);
  });
});

describe('recompute fuzz — random distances in random units land at predictable geometry', () => {
  // Deterministic seed so a fuzz failure reproduces locally.
  function mulberry32(seed: number) {
    let a = seed;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const UNITS: LinearUnit[] = ['FT', 'IN', 'MILE', 'M', 'CM', 'MM'];
  const SIDES = ['LEFT', 'RIGHT'] as const;
  const CORNERS = ['MITER', 'ROUND', 'CHAMFER'] as const;

  it('100 random configurations: LEFT y-offset matches the feet-equivalent within 1e-6', () => {
    const rand = mulberry32(20260529);
    for (let i = 0; i < 100; i++) {
      const unit = UNITS[Math.floor(rand() * UNITS.length)];
      // Distances chosen to stay >0 + bounded so MILE doesn't blow the line out of float range.
      const distance = 0.01 + rand() * (unit === 'MILE' ? 0.1 : 10);
      const side = SIDES[Math.floor(rand() * SIDES.length)];
      const corner = CORNERS[Math.floor(rand() * CORNERS.length)];

      const feet = distanceToFeet(distance, unit);
      expect(feet).not.toBeNull();

      const result = recomputeOffsetGeometry({
        sourceFeature: lineSource(),
        distance, unit, side, cornerHandling: corner,
      });
      expect(result).not.toBeNull();
      const expected = side === 'LEFT' ? feet! : -feet!;
      expect(result!.geometry.start!.y).toBeCloseTo(expected, 6);
      expect(result!.geometry.end!.y).toBeCloseTo(expected, 6);
      // Metadata always carries the typed value verbatim — NOT the feet-equivalent.
      expect(result!.metadata.distance).toBe(distance);
      expect(result!.metadata.unit).toBe(unit);
      expect(result!.metadata.side).toBe(side);
      expect(result!.metadata.cornerHandling).toBe(corner);
    }
  });
});

describe('distanceToFeet — rejection paths', () => {
  it.each([
    { distance: 0,          why: 'zero' },
    { distance: -1,         why: 'negative' },
    { distance: NaN,        why: 'NaN' },
    { distance: Infinity,   why: 'Infinity' },
    { distance: -Infinity,  why: 'negative Infinity' },
  ])('rejects $why', ({ distance }) => {
    for (const unit of ['FT', 'IN', 'MILE', 'M', 'CM', 'MM'] as LinearUnit[]) {
      expect(distanceToFeet(distance, unit)).toBeNull();
    }
  });
});
