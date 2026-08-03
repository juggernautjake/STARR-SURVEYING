// CAD_AUDIT Slice S9a — comparing two surveys of the same parcel.
//
// THE CASE THIS EXISTS FOR: two surveys of the same land, written forty years apart, will disagree
// about every single bearing and usually agree perfectly. They are on different bases — magnetic
// north in 1952, grid north in 1998, a called line from an adjoining deed. A naive diff reports "18
// discrepancies" and sends a surveyor out to chase eighteen problems that do not exist.
//
// So the comparison finds the constant rotation first, calls it a BASIS DIFFERENCE, and reports only
// what remains. Most of these tests are about that distinction and about the ways the estimate can
// be poisoned.

import { describe, it, expect } from 'vitest';
import {
  compareSurveys, normalizeDelta, median, callsFromPoints, type CompareCall,
} from '@/lib/cad/compare/survey-compare';

const call = (bearing: number | null, distance: number | null): CompareCall => ({ bearing, distance });

/** A square, and the same square rotated — the same land on a different basis. */
const square: CompareCall[] = [call(0, 100), call(90, 100), call(180, 100), call(270, 100)];
const rotated = (deg: number): CompareCall[] =>
  square.map((c) => call(((c.bearing as number) + deg + 360) % 360, c.distance));

describe('angle helpers', () => {
  it('wraps a delta into (-180, 180]', () => {
    // Without this, 359° vs 1° reads as a 358° disagreement instead of 2°.
    expect(normalizeDelta(358)).toBe(-2);
    expect(normalizeDelta(-358)).toBe(2);
    expect(normalizeDelta(0)).toBe(0);
    expect(normalizeDelta(180)).toBe(180);
    expect(normalizeDelta(-180)).toBe(180);
  });

  it('median returns null for nothing, not 0', () => {
    // 0 is a meaningful offset — "same basis". Conflating it with "no data" would report agreement
    // for two records that share no comparable course at all.
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('a different basis is reported as a basis, not as errors', () => {
  const out = compareSurveys(square, rotated(2));

  it('finds the rotation', () => {
    expect(out.basisOffsetDeg).toBeCloseTo(2, 6);
  });

  it('flags NOTHING, because the surveys agree', () => {
    // The whole point. Eighteen false discrepancies is the failure this slice prevents.
    expect(out.flaggedCount).toBe(0);
  });

  it('says so in words a surveyor would use', () => {
    expect(out.basisStatement).toMatch(/different basis of bearings/i);
    expect(out.basisStatement).toMatch(/not an error/i);
  });

  it('still exposes the raw delta, so the rotation is auditable', () => {
    expect(out.comparisons[0].rawBearingDeltaDeg).toBeCloseTo(2, 6);
    expect(out.comparisons[0].residualBearingDeltaDeg).toBeCloseTo(0, 6);
  });
});

describe('a real disagreement survives the basis correction', () => {
  it('flags the one bad course and not the others', () => {
    const b = rotated(2);
    b[2] = call((b[2].bearing as number) + 0.5, b[2].distance);   // 30' out, well past tolerance
    const out = compareSurveys(square, b);
    expect(out.flaggedCount).toBe(1);
    expect(out.comparisons[2].flagged).toBe(true);
    expect(out.comparisons[0].flagged).toBe(false);
  });

  it('flags a distance difference', () => {
    const b = rotated(0);
    b[1] = call(b[1].bearing, 100.5);
    const out = compareSurveys(square, b);
    expect(out.comparisons[1].flagged).toBe(true);
    expect(out.comparisons[1].distanceDeltaFeet).toBeCloseTo(0.5, 6);
    expect(out.comparisons[1].reason).toMatch(/distance differs/i);
  });
});

describe('the offset uses the MEDIAN, and that is load-bearing', () => {
  it('one gross error does not turn every other course into a false discrepancy', () => {
    // A transposed digit — one call out by 10°. With a mean offset (10/4 = 2.5° here) every course
    // would be flagged and the real error would be buried among them. This is the difference
    // between a useful report and a misleading one, not a refinement.
    const b = rotated(0);
    b[3] = call(((b[3].bearing as number) + 10) % 360, b[3].distance);
    const out = compareSurveys(square, b);
    expect(out.basisOffsetDeg).toBeCloseTo(0, 6);
    expect(out.flaggedCount).toBe(1);
    expect(out.comparisons[3].flagged).toBe(true);
  });
});

describe('a reversed traverse is detected, not computed through', () => {
  it('reports the direction problem instead of a meaningless offset', () => {
    // One deed written clockwise, the other counter-clockwise. Deltas cluster near ±180 and
    // averaging them produces nonsense.
    const b = square.map((c) => call(((c.bearing as number) + 180) % 360, c.distance));
    const out = compareSurveys(square, b);
    expect(out.reversed).toBe(true);
    expect(out.basisOffsetDeg).toBeNull();
    expect(out.basisStatement).toMatch(/opposite directions/i);
  });
});

describe('it refuses to invent what is not there', () => {
  it('does not treat a missing bearing as zero', () => {
    // A null bearing read as 0 would invent a due-north call and poison the median every other
    // residual depends on.
    const b = rotated(2);
    b[0] = call(null, b[0].distance);
    const out = compareSurveys(square, b);
    expect(out.basisOffsetDeg).toBeCloseTo(2, 6);
    expect(out.comparisons[0].rawBearingDeltaDeg).toBeNull();
    expect(out.uncomparable.some((u) => u.index === 0)).toBe(true);
  });

  it('names a course only one record describes, rather than truncating', () => {
    // Differing call counts usually mean one record splits a line the other runs through — exactly
    // what a surveyor needs told, and exactly what a silent truncation hides.
    const out = compareSurveys(square, [...rotated(2), call(45, 50)]);
    expect(out.countMismatch).toEqual({ a: 4, b: 5 });
    expect(out.uncomparable).toContainEqual({
      index: 4,
      why: 'present in the second survey only — the records describe a different number of courses',
    });
  });

  it('reports a missing distance without flagging a bearing that is fine', () => {
    const b = rotated(0);
    b[1] = call(b[1].bearing, null);
    const out = compareSurveys(square, b);
    expect(out.comparisons[1].distanceDeltaFeet).toBeNull();
    expect(out.comparisons[1].flagged).toBe(false);
    expect(out.uncomparable.some((u) => u.index === 1)).toBe(true);
  });

  it('says plainly when nothing could be compared', () => {
    const out = compareSurveys([call(null, null)], [call(null, null)]);
    expect(out.basisOffsetDeg).toBeNull();
    expect(out.basisStatement).toMatch(/no course could be compared/i);
  });
});

describe('identical records', () => {
  it('report a shared basis and no differences', () => {
    const out = compareSurveys(square, square);
    expect(out.basisOffsetDeg).toBe(0);
    expect(out.flaggedCount).toBe(0);
    expect(out.uncomparable).toEqual([]);
    expect(out.basisStatement).toMatch(/share a basis/i);
  });
});

describe('tolerances are configurable, because a 1952 deed is not a 2020 survey', () => {
  it('a tighter bearing tolerance flags more', () => {
    const b = rotated(2);
    b[1] = call((b[1].bearing as number) + 0.01, b[1].distance);   // 36 seconds
    expect(compareSurveys(square, b).comparisons[1].flagged).toBe(false);
    expect(compareSurveys(square, b, { bearingToleranceSeconds: 10 }).comparisons[1].flagged).toBe(true);
  });
});

describe('callsFromPoints derives courses from corners', () => {
  it('uses the SURVEYING azimuth convention, not the mathematical one', () => {
    // atan2(dx, dy), clockwise from north. The mathematical atan2(dy, dx) mirrors every bearing
    // about the 45° line — which looks plausible on a square and is wrong on everything else.
    const calls = callsFromPoints([
      { x: 0, y: 0 }, { x: 0, y: 100 },   // due north
      { x: 100, y: 100 },                 // due east
      { x: 100, y: 0 },                   // due south
    ]);
    expect(calls[0].bearing).toBeCloseTo(0, 6);
    expect(calls[1].bearing).toBeCloseTo(90, 6);
    expect(calls[2].bearing).toBeCloseTo(180, 6);
    expect(calls.map((c) => c.distance)).toEqual([100, 100, 100]);
  });

  it('gives a zero-length course a null bearing rather than 0°', () => {
    // 0° is due north — a real answer. A duplicated corner has no direction at all.
    const calls = callsFromPoints([{ x: 5, y: 5 }, { x: 5, y: 5 }]);
    expect(calls[0].bearing).toBeNull();
    expect(calls[0].distance).toBe(0);
  });

  it('round-trips through the comparison as a perfect match', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }];
    const out = compareSurveys(callsFromPoints(pts), callsFromPoints(pts));
    expect(out.flaggedCount).toBe(0);
    expect(out.basisOffsetDeg).toBe(0);
  });
});
