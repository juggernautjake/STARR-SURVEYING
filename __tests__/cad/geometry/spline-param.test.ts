// Smoke tests for the spline arc-length parameterisation
// shared by explodeFeature / divideFeatureBy / pointAtDistanceAlong.
// Like the arc-param test, we re-implement the math inline so
// the test runs without the zustand store, while exercising
// the same algorithm in operations.ts.

import { describe, it, expect } from 'vitest';

interface Pt { x: number; y: number }

function cubicBezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function sampleSpline(cps: Pt[], samplesPerSegment = 32): Pt[] {
  const numSegments = Math.floor((cps.length - 1) / 3);
  if (numSegments < 1) return cps.slice();
  const out: Pt[] = [];
  for (let seg = 0; seg < numSegments; seg += 1) {
    const idx = seg * 3;
    const startStep = seg === 0 ? 0 : 1;
    for (let s = startStep; s <= samplesPerSegment; s += 1) {
      out.push(cubicBezierPoint(cps[idx], cps[idx + 1], cps[idx + 2], cps[idx + 3], s / samplesPerSegment));
    }
  }
  return out;
}

function splineLength(samples: Pt[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    total += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }
  return total;
}

function pointAlongSpline(samples: Pt[], t: number): Pt {
  if (samples.length === 1) return { ...samples[0] };
  const total = splineLength(samples);
  if (total < 1e-12) return { ...samples[0] };
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const seg = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    if (acc + seg >= target) {
      const localT = seg > 1e-12 ? (target - acc) / seg : 0;
      const a = samples[i - 1];
      const b = samples[i];
      return { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };
    }
    acc += seg;
  }
  return { ...samples[samples.length - 1] };
}

describe('spline sampling', () => {
  it('degenerate spline (3+1=4 collinear points) samples to a straight line', () => {
    const cps: Pt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const samples = sampleSpline(cps, 8);
    expect(samples.length).toBeGreaterThan(4);
    // Every sample lies on y=0.
    for (const p of samples) {
      expect(Math.abs(p.y)).toBeLessThan(1e-9);
    }
    // Total length matches the chord (3 ft).
    expect(splineLength(samples)).toBeCloseTo(3, 5);
  });

  it('two-segment spline: sample count = 2*samplesPerSegment + 1 (no duplicate boundary)', () => {
    // 7 control points → 2 cubic segments.
    const cps: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },  // segment-1 endpoint == segment-2 start
      { x: 1, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 0 },
    ];
    const samples = sampleSpline(cps, 10);
    // Expected: 11 + 10 = 21 (drop the duplicate boundary).
    expect(samples.length).toBe(21);
  });
});

describe('pointAlongSpline — arc-length parameterisation', () => {
  it('t=0 lands on the first control point', () => {
    const cps: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    const pt = pointAlongSpline(sampleSpline(cps), 0);
    expect(pt.x).toBeCloseTo(0, 6);
    expect(pt.y).toBeCloseTo(0, 6);
  });

  it('t=1 lands on the last control point', () => {
    const cps: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    const pt = pointAlongSpline(sampleSpline(cps), 1);
    expect(pt.x).toBeCloseTo(1, 6);
    expect(pt.y).toBeCloseTo(0, 6);
  });

  it('t=0.5 of a straight-line spline lands at the midpoint', () => {
    const cps: Pt[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
      { x: 10, y: 0 },
    ];
    const pt = pointAlongSpline(sampleSpline(cps, 64), 0.5);
    expect(pt.x).toBeCloseTo(5, 4);
    expect(pt.y).toBeCloseTo(0, 6);
  });
});

describe('explodeFeature — spline samples become per-segment LINEs', () => {
  it('a 3-segment spline yields ~3*32 LINE chunks when exploded', () => {
    // 10 control points → 3 cubic segments → 3*32 + 1 = 97 samples → 96 LINEs.
    const cps: Pt[] = [];
    for (let i = 0; i <= 9; i += 1) cps.push({ x: i, y: i % 2 === 0 ? 0 : 1 });
    const samples = sampleSpline(cps, 32);
    expect(samples.length).toBe(3 * 32 + 1);
    // Number of LINE segments = samples - 1 (open polyline).
    expect(samples.length - 1).toBe(3 * 32);
  });
});
