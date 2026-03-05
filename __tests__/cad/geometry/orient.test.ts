// __tests__/cad/geometry/orient.test.ts — Unit tests for survey orientation utilities
import { describe, it, expect } from 'vitest';
import {
  computeOrientationCorrection,
  computeCorrectionFromPoints,
  applyOrientationRotation,
  computeCentroid,
  extractReferenceLines,
  generateBearingCandidates,
  orientSurveyByReferenceLine,
  orientSurveyByManualCorrection,
} from '@/lib/cad/geometry/orient';
import type { Feature } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeLineFeature(x1: number, y1: number, x2: number, y2: number, id = 'f1'): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: x1, y: y1 }, end: { x: x2, y: y2 } },
    layerId: 'TEST',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: {},
  };
}

function makePolylineFeature(vertices: { x: number; y: number }[], id = 'f2'): Feature {
  return {
    id,
    type: 'POLYLINE',
    geometry: { type: 'POLYLINE', vertices },
    layerId: 'TEST',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: {},
  };
}

function makePointFeature(x: number, y: number, id = 'f3'): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x, y } },
    layerId: 'TEST',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: {},
  };
}

// ── computeOrientationCorrection ──────────────────────────────────────────────

describe('computeOrientationCorrection', () => {
  it('returns positive correction when true > measured', () => {
    // Measured 90° (E), deed says 135° (SE) → correction = +45°
    const c = computeOrientationCorrection(90, 135);
    expect(c).toBeCloseTo(45, 5);
  });

  it('returns negative correction when true < measured', () => {
    // Measured 92°, deed says 45° → correction = -47°
    const c = computeOrientationCorrection(92, 45);
    expect(c).toBeCloseTo(-47, 5);
  });

  it('wraps correctly for cross-360 cases', () => {
    // Measured 350°, deed says 10° → correction = +20° (not -340°)
    const c = computeOrientationCorrection(350, 10);
    expect(c).toBeCloseTo(20, 5);
  });

  it('returns 0 when measured equals true', () => {
    expect(computeOrientationCorrection(45, 45)).toBeCloseTo(0, 5);
    expect(computeOrientationCorrection(0, 0)).toBeCloseTo(0, 5);
    expect(computeOrientationCorrection(180, 180)).toBeCloseTo(0, 5);
  });

  it('wraps other cross-360 case', () => {
    // Measured 10°, deed says 350° → correction = -20° (not +340°)
    const c = computeOrientationCorrection(10, 350);
    expect(c).toBeCloseTo(-20, 5);
  });

  it('normalises inputs outside [0,360)', () => {
    const c1 = computeOrientationCorrection(450, 45); // 450 normalises to 90
    expect(c1).toBeCloseTo(-45, 5);
    const c2 = computeOrientationCorrection(-10, 10); // -10 normalises to 350
    expect(c2).toBeCloseTo(20, 5);
  });
});

// ── computeCorrectionFromPoints ───────────────────────────────────────────────

describe('computeCorrectionFromPoints', () => {
  it('computes correction from a due-East line that should point NE', () => {
    // A line from (0,0) to (100,0) points East → azimuth 90°
    // Deed says it should be N 45°E → azimuth 45°
    const c = computeCorrectionFromPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 45);
    expect(c).toBeCloseTo(-45, 4);
  });

  it('zero correction when line already matches deed bearing', () => {
    // Line from (0,0) to (0,100) points North → azimuth 0°, deed says 0°
    const c = computeCorrectionFromPoints({ x: 0, y: 0 }, { x: 0, y: 100 }, 0);
    expect(c).toBeCloseTo(0, 4);
  });
});

// ── computeCentroid ───────────────────────────────────────────────────────────

describe('computeCentroid', () => {
  it('returns (0,0) for empty list', () => {
    const c = computeCentroid([]);
    expect(c).toEqual({ x: 0, y: 0 });
  });

  it('centroid of two symmetric points', () => {
    const features = [
      makeLineFeature(0, 0, 100, 0, 'a'),
    ];
    const c = computeCentroid(features);
    expect(c.x).toBeCloseTo(50, 4);
    expect(c.y).toBeCloseTo(0, 4);
  });

  it('centroid of a point feature', () => {
    const f = makePointFeature(10, 20);
    const c = computeCentroid([f]);
    expect(c.x).toBeCloseTo(10, 4);
    expect(c.y).toBeCloseTo(20, 4);
  });

  it('centroid of a polyline', () => {
    const f = makePolylineFeature([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    const c = computeCentroid([f]);
    expect(c.x).toBeCloseTo(20 / 3, 3);
    expect(c.y).toBeCloseTo(10 / 3, 3);
  });
});

// ── applyOrientationRotation ──────────────────────────────────────────────────

describe('applyOrientationRotation', () => {
  it('no-op for 0° correction', () => {
    const f = makeLineFeature(0, 0, 100, 0);
    const [rotated] = applyOrientationRotation([f], 0, { x: 0, y: 0 });
    expect(rotated.geometry.start!.x).toBeCloseTo(0, 4);
    expect(rotated.geometry.end!.x).toBeCloseTo(100, 4);
  });

  it('rotates a due-East line 90° CCW to point North', () => {
    const f = makeLineFeature(0, 0, 100, 0);
    // +90° CCW around origin: (100,0) → (0,100)
    const [rotated] = applyOrientationRotation([f], 90, { x: 0, y: 0 });
    expect(rotated.geometry.start!.x).toBeCloseTo(0, 3);
    expect(rotated.geometry.start!.y).toBeCloseTo(0, 3);
    expect(rotated.geometry.end!.x).toBeCloseTo(0, 3);
    expect(rotated.geometry.end!.y).toBeCloseTo(100, 3);
  });

  it('does not mutate originals', () => {
    const f = makeLineFeature(0, 0, 100, 0);
    applyOrientationRotation([f], 45, { x: 0, y: 0 });
    expect(f.geometry.end!.x).toBe(100); // unchanged
  });
});

// ── extractReferenceLines ─────────────────────────────────────────────────────

describe('extractReferenceLines', () => {
  it('returns empty for empty feature list', () => {
    expect(extractReferenceLines([])).toHaveLength(0);
  });

  it('extracts a single LINE feature', () => {
    const f = makeLineFeature(0, 0, 100, 0);
    const lines = extractReferenceLines([f]);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeCloseTo(100, 3);
    expect(lines[0].azimuth).toBeCloseTo(90, 3); // due East
    expect(lines[0].featureId).toBe('f1');
  });

  it('extracts segments from a polyline', () => {
    const f = makePolylineFeature([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
    ]);
    const lines = extractReferenceLines([f]);
    expect(lines).toHaveLength(2);
  });

  it('ignores segments shorter than minLength', () => {
    const f = makeLineFeature(0, 0, 0.1, 0); // 0.1 ft — below default 0.5 ft
    const lines = extractReferenceLines([f]);
    expect(lines).toHaveLength(0);
  });

  it('sorts by length descending', () => {
    const short = makeLineFeature(0, 0, 10, 0, 'short');
    const long  = makeLineFeature(0, 0, 500, 0, 'long');
    const lines = extractReferenceLines([short, long]);
    expect(lines[0].featureId).toBe('long');
    expect(lines[1].featureId).toBe('short');
  });

  it('ignores POINT features', () => {
    const p = makePointFeature(10, 20);
    const lines = extractReferenceLines([p]);
    expect(lines).toHaveLength(0);
  });

  it('computes correct azimuth for a North-pointing line', () => {
    const f = makeLineFeature(0, 0, 0, 100);
    const [line] = extractReferenceLines([f]);
    expect(line.azimuth).toBeCloseTo(0, 3); // due North
  });

  it('computes correct azimuth for a South-pointing line', () => {
    const f = makeLineFeature(0, 100, 0, 0);
    const [line] = extractReferenceLines([f]);
    expect(line.azimuth).toBeCloseTo(180, 3); // due South
  });

  it('computes correct azimuth for a West-pointing line', () => {
    const f = makeLineFeature(100, 0, 0, 0);
    const [line] = extractReferenceLines([f]);
    expect(line.azimuth).toBeCloseTo(270, 3); // due West
  });
});

// ── generateBearingCandidates ─────────────────────────────────────────────────

describe('generateBearingCandidates', () => {
  it('returns an array of candidates for any azimuth', () => {
    const c = generateBearingCandidates(45);
    expect(c.length).toBeGreaterThan(0);
  });

  it('all candidates have the expected shape', () => {
    const cs = generateBearingCandidates(92);
    for (const c of cs) {
      expect(typeof c.azimuth).toBe('number');
      expect(typeof c.label).toBe('string');
      expect(typeof c.reason).toBe('string');
      expect(typeof c.correctionDeg).toBe('number');
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('correction delta is consistent with computeOrientationCorrection', () => {
    const measAz = 92;
    const cs = generateBearingCandidates(measAz);
    for (const c of cs) {
      const expected = computeOrientationCorrection(measAz, c.azimuth);
      expect(c.correctionDeg).toBeCloseTo(expected, 4);
    }
  });

  it('includes a snap-to-1° candidate', () => {
    const cs = generateBearingCandidates(92.3);
    const snap1 = cs.find((c) => c.source === 'SNAP_1DEG');
    expect(snap1).toBeDefined();
    expect(snap1!.azimuth).toBeCloseTo(92, 0);
  });

  it('includes a near-90° candidate when measured is close to 90°', () => {
    // At 92° measured, snap-to-5° will add 90° first (deduplication is by value,
    // not source). Verify that a 90° suggestion exists regardless of source.
    const cs = generateBearingCandidates(92);
    const near90 = cs.find((c) => Math.abs(c.azimuth - 90) < 0.01);
    expect(near90).toBeDefined();
  });

  it('includes REVERSE candidate', () => {
    const cs = generateBearingCandidates(45);
    const rev = cs.find((c) => c.source === 'REVERSE');
    expect(rev).toBeDefined();
    expect(rev!.azimuth).toBeCloseTo(225, 1);
  });

  it('sorts by smallest absolute correction first', () => {
    const cs = generateBearingCandidates(90);
    for (let i = 0; i < cs.length - 1; i++) {
      expect(Math.abs(cs[i].correctionDeg)).toBeLessThanOrEqual(Math.abs(cs[i + 1].correctionDeg) + 0.001);
    }
  });

  it('no duplicate azimuths (to 2 decimal places)', () => {
    const cs = generateBearingCandidates(45);
    const seen = new Set<string>();
    for (const c of cs) {
      const key = c.azimuth.toFixed(2);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('includes PARALLEL candidates when other lines are provided', () => {
    // Use measured azimuth 35° and a reference line at 37°.
    // Snap candidates produce 35°, 30°, etc. — none hit 37° exactly, so
    // the PARALLEL candidate should survive deduplication.
    const otherLine = extractReferenceLines([makeLineFeature(0, 0, 100, 75, 'ref')])[0];
    // Verify the other line produces an azimuth that snaps won't collide with
    // (i.e., not a multiple of 5° or 15°).
    expect(otherLine.azimuth % 5).not.toBeCloseTo(0, 0);
    const cs = generateBearingCandidates(35, [otherLine]);
    const parallel = cs.find((c) => c.source === 'PARALLEL');
    expect(parallel).toBeDefined();
  });
});

// ── orientSurveyByReferenceLine ───────────────────────────────────────────────

describe('orientSurveyByReferenceLine', () => {
  it('orients a due-East line to match a 0° (North) deed bearing', () => {
    const f = makeLineFeature(0, 0, 100, 0); // due East, azimuth = 90°
    // Supply explicit pivot at (0,0) so the expected geometry is deterministic
    const result = orientSurveyByReferenceLine(
      [f],
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      0, // deed says it should point North
      { x: 0, y: 0 }, // explicit pivot
    );
    expect(result.correctionDeg).toBeCloseTo(-90, 4);
    // After -90° correction (90° CW rotation about origin):
    //   start (0,0)   → (0,0)
    //   end   (100,0) → (0,-100)
    const end = result.features[0].geometry.end!;
    expect(end.x).toBeCloseTo(0, 3);
    expect(end.y).toBeCloseTo(-100, 3);
  });
});

// ── orientSurveyByManualCorrection ────────────────────────────────────────────

describe('orientSurveyByManualCorrection', () => {
  it('applies a +45° correction', () => {
    const f = makeLineFeature(0, 0, 100, 0); // due East
    const result = orientSurveyByManualCorrection([f], 45, { x: 0, y: 0 });
    expect(result.correctionDeg).toBe(45);
    // 45° CCW rotation of (100,0) → (100cos45, 100sin45) ≈ (70.71, 70.71)
    const end = result.features[0].geometry.end!;
    expect(end.x).toBeCloseTo(100 * Math.cos(Math.PI / 4), 3);
    expect(end.y).toBeCloseTo(100 * Math.sin(Math.PI / 4), 3);
  });
});
