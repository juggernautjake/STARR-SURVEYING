import { describe, it, expect } from 'vitest';
import {
  segmentLengthFt,
  segmentAzimuthDeg,
  azimuthToBearing,
  parcelSegments,
  perimeterFt,
  ringAreaAcres,
  parcelBoundary,
} from '../research/parcel-geometry.js';

// Plan B — the parcel-lines drawing labels each side with its GIS-computed BEARING and length. These
// are the pure functions behind that; the render and the structured segment data both read them, so a
// bug here shows on the sketch AND in the data. Numbers are checked against hand computation.

describe('azimuthToBearing', () => {
  it('maps the four cardinal-ish azimuths to quadrant bearings', () => {
    expect(azimuthToBearing(0)).toBe('N0°00′E');
    expect(azimuthToBearing(45)).toBe('N45°00′E');
    expect(azimuthToBearing(90)).toBe('N90°00′E'); // due east
    expect(azimuthToBearing(135)).toBe('S45°00′E');
    expect(azimuthToBearing(180)).toBe('S0°00′E');
    expect(azimuthToBearing(225)).toBe('S45°00′W');
    expect(azimuthToBearing(315)).toBe('N45°00′W');
  });

  it('normalises out-of-range azimuths and carries minutes', () => {
    expect(azimuthToBearing(360)).toBe('N0°00′E');
    expect(azimuthToBearing(-45)).toBe('N45°00′W');
    // 30.5° → 30°30′
    expect(azimuthToBearing(30.5)).toBe('N30°30′E');
  });
});

describe('segmentAzimuthDeg', () => {
  it('due north and due east from a point in Bell County', () => {
    const p: [number, number] = [-97.4, 31.1];
    const north: [number, number] = [-97.4, 31.101];
    const east: [number, number] = [-97.399, 31.1];
    expect(segmentAzimuthDeg(p, north)).toBeCloseTo(0, 1);
    expect(segmentAzimuthDeg(p, east)).toBeCloseTo(90, 1);
  });
});

describe('segmentLengthFt', () => {
  it('~one degree of latitude is ~364000 ft (69 miles)', () => {
    // 0.001° of latitude ≈ 364 ft.
    const ft = segmentLengthFt([-97.4, 31.1], [-97.4, 31.101]);
    expect(ft).toBeGreaterThan(355);
    expect(ft).toBeLessThan(370);
  });
});

describe('parcelSegments + perimeterFt', () => {
  it('turns a small square ring into four sides with lengths and bearings', () => {
    // ~a small closed square near Temple, TX.
    const ring: Array<[number, number]> = [
      [-97.400, 31.100],
      [-97.399, 31.100],
      [-97.399, 31.101],
      [-97.400, 31.101],
      [-97.400, 31.100],
    ];
    const segs = parcelSegments(ring);
    expect(segs).toHaveLength(4);
    expect(segs[0].bearing).toBe('N90°00′E'); // east side
    expect(segs.every((s) => s.lengthFt > 200)).toBe(true);
    expect(perimeterFt(ring)).toBeCloseTo(segs.reduce((n, s) => n + s.lengthFt, 0), 6);
  });
});

describe('ringAreaAcres (plan B2)', () => {
  // The same ~0.001° square near Temple, TX. Hand computation:
  //   lat side ≈ 0.001° × 111,320 m/° ≈ 111.3 m ≈ 365 ft
  //   lon side ≈ 365 ft × cos(31.1°) ≈ 312 ft
  //   area ≈ 365 × 312 ≈ 114,000 sq ft ≈ 2.6 acres
  const square: Array<[number, number]> = [
    [-97.400, 31.100], [-97.399, 31.100], [-97.399, 31.101], [-97.400, 31.101], [-97.400, 31.100],
  ];

  it('gives the hand-computed acreage of the square', () => {
    expect(ringAreaAcres(square)).toBeGreaterThan(2.4);
    expect(ringAreaAcres(square)).toBeLessThan(2.8);
  });

  it('drops a duplicated closing vertex rather than counting it twice', () => {
    const open = square.slice(0, -1); // no closing vertex
    expect(ringAreaAcres(open)).toBeCloseTo(ringAreaAcres(square), 6);
  });

  it('a degenerate ring (< 3 vertices) has zero area, not a crash', () => {
    expect(ringAreaAcres([[-97.4, 31.1], [-97.399, 31.1]])).toBe(0);
    expect(ringAreaAcres([])).toBe(0);
  });

  it('winding direction does not flip the sign — area is absolute', () => {
    const reversed = [...square].reverse() as Array<[number, number]>;
    expect(ringAreaAcres(reversed)).toBeCloseTo(ringAreaAcres(square), 6);
  });
});

describe('parcelBoundary (plan B2) — the whole emitted payload', () => {
  it('bundles segments + perimeter + area, each consistent with its own helper', () => {
    const ring: Array<[number, number]> = [
      [-97.400, 31.100], [-97.399, 31.100], [-97.399, 31.101], [-97.400, 31.101], [-97.400, 31.100],
    ];
    const b = parcelBoundary(ring);
    expect(b.segments).toEqual(parcelSegments(ring));
    expect(b.perimeterFt).toBeCloseTo(perimeterFt(ring), 6);
    expect(b.areaAc).toBeCloseTo(ringAreaAcres(ring), 6);
  });
});
