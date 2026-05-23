// __tests__/cad/geometry/vertex-closure.test.ts
// Vertex-array closure + Bowditch adapters used by the AI tool
// registry and the Calc-point / Close-drawing dialogues.

import { describe, it, expect } from 'vitest';
import {
  vertexClosure,
  vertexBowditchAdjust,
} from '@/lib/cad/geometry/closure';

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('vertexClosure', () => {
  it('reports zero error for a perfectly closed square', () => {
    // Square: (0,0) → (10,0) → (10,10) → (0,10) → (0,0)
    const r = vertexClosure([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]);
    close(r.linearError, 0);
    close(r.errorEast, 0);
    close(r.errorNorth, 0);
    close(r.totalDistance, 40);
  });

  it('measures the gap on an open polygon', () => {
    // Drop the closing return; last vertex (0,10) is 10 units
    // away from the first (0,0).
    const r = vertexClosure([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    close(r.linearError, 10);
    close(r.errorEast, 0);
    close(r.errorNorth, 10);
    expect(r.precisionDenominator).toBe(3); // 30 / 10
    close(r.totalDistance, 30);
  });

  it('errorBearingDeg points from first vertex toward last for the open case', () => {
    // First (0,0), last (5,0): error is purely east → azimuth 90°.
    const r = vertexClosure([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 5, y: 0 },
    ]);
    close(r.errorEast, 5);
    close(r.errorNorth, 0);
    close(r.errorBearingDeg, 90);
  });
});

describe('vertexBowditchAdjust', () => {
  it('returns input unchanged when already closed', () => {
    const original = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const out = vertexBowditchAdjust(original);
    for (let i = 0; i < original.length; i++) {
      close(out[i].x, original[i].x);
      close(out[i].y, original[i].y);
    }
  });

  it('forces the final vertex to land on the first (closure invariant)', () => {
    // Open path with an arbitrary gap.
    const out = vertexBowditchAdjust([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 1, y: 10 },
    ]);
    expect(out).toHaveLength(4);
    close(out[0].x, 0);
    close(out[0].y, 0);
    close(out[3].x, out[0].x);
    close(out[3].y, out[0].y);
  });

  it('mid vertex shifts by error × cumulative-ratio', () => {
    // Three equal legs of 10 ft each closing onto a 1-ft eastward
    // gap (errorEast = 1, errorNorth = 0). Mid-vertex sits at 1/3
    // of the total perimeter, so it should slide 1/3 ft west.
    const a: { x: number; y: number } = { x: 0, y: 0 };
    const b: { x: number; y: number } = { x: 10, y: 0 };
    const c: { x: number; y: number } = { x: 10, y: 10 };
    // Pick d so the perimeter sums to 30 and the closing gap is
    // purely east: d = (1, 0), but the c→d leg length is
    // sqrt(81 + 100) which isn't 10. Use an L-shape where legs are
    // 10, 10, 10 and the gap is along the implied closing edge.
    // a→b = 10 east; b→c = 10 north; c→d = 10 with d shifted east 1.
    const dxNeeded = Math.sqrt(100 - 100); // gives 0 — degenerate.
    // Easier: just verify the proportional shape via two parallel
    // identical-length legs with an east-only gap.
    const out = vertexBowditchAdjust([a, b, c, { x: 10 + dxNeeded + 0, y: 20 }]);
    // c→last leg = (0, 10) → length 10. Total = 30. Gap = last - first = (10, 20).
    // Verify final lands on first (the universal invariant).
    close(out[3].x, out[0].x);
    close(out[3].y, out[0].y);
    // Mid (i=1) at cum 10/30 = 1/3 should have shifted by (-10/3, -20/3).
    close(out[1].x, 10 - 10 / 3);
    close(out[1].y, 0 - 20 / 3);
  });
});
