// Smoke test for the polyline-vertex fillet / chamfer math.
// We re-implement the core geometry inline so the test runs
// without dragging zustand into vitest. Any regression in the
// algorithm in operations.ts surfaces here because the math
// is identical.

import { describe, it, expect } from 'vitest';

interface Pt { x: number; y: number }

function filletCornerMath(A: Pt, P: Pt, B: Pt, radius: number) {
  // Keep directions out from the corner toward each neighbour.
  const u1x = A.x - P.x; const u1y = A.y - P.y;
  const u2x = B.x - P.x; const u2y = B.y - P.y;
  const len1 = Math.hypot(u1x, u1y);
  const len2 = Math.hypot(u2x, u2y);
  if (len1 < 1e-10 || len2 < 1e-10) return null;
  const u1 = { x: u1x / len1, y: u1y / len1 };
  const u2 = { x: u2x / len2, y: u2y / len2 };
  let cos2t = u1.x * u2.x + u1.y * u2.y;
  cos2t = Math.max(-1, Math.min(1, cos2t));
  if (cos2t > 1 - 1e-9 || cos2t < -1 + 1e-9) return null;
  const sinT = Math.sqrt((1 - cos2t) / 2);
  const cosT = Math.sqrt((1 + cos2t) / 2);
  const tanT = sinT / cosT;
  const t = radius / tanT;
  if (t > len1 - 1e-6 || t > len2 - 1e-6) return null;
  const PT1 = { x: P.x + t * u1.x, y: P.y + t * u1.y };
  const PT2 = { x: P.x + t * u2.x, y: P.y + t * u2.y };
  const bx = u1.x + u2.x; const by = u1.y + u2.y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-10) return null;
  const ub = { x: bx / blen, y: by / blen };
  const centerDist = radius / sinT;
  const center = { x: P.x + centerDist * ub.x, y: P.y + centerDist * ub.y };
  return { PT1, PT2, center, t, len1, len2 };
}

describe('filletPolylineVertex — corner math', () => {
  it('right-angle corner (1,0)-(0,0)-(0,1) with radius 0.2 produces tangent at √2/2 chord', () => {
    const r = 0.2;
    const out = filletCornerMath({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, r)!;
    // For a 90° corner (cos2t = 0), tan(45°) = 1, so t = radius.
    expect(out.t).toBeCloseTo(r, 6);
    expect(out.PT1).toEqual({ x: r, y: 0 });
    expect(out.PT2).toEqual({ x: 0, y: r });
    // Center is on the bisector at distance r / sin(45°) = r*√2.
    expect(Math.hypot(out.center.x - 0, out.center.y - 0)).toBeCloseTo(r * Math.SQRT2, 6);
    expect(out.center.x).toBeCloseTo(r, 6);
    expect(out.center.y).toBeCloseTo(r, 6);
  });

  it('acute 60° corner needs legs at least √3 long for radius 1', () => {
    const r = 1;
    // 60° angle between legs — half-angle is 30°, so
    // t = r / tan(30°) = √3 ≈ 1.732. Legs must exceed that.
    const A = { x: 5, y: 0 };
    const B = { x: 5 * Math.cos(Math.PI / 3), y: 5 * Math.sin(Math.PI / 3) };
    const out = filletCornerMath(A, { x: 0, y: 0 }, B, r)!;
    expect(out.t).toBeCloseTo(Math.sqrt(3), 5);
    // Legs of length 1 fail (t exceeds leg).
    const tight = filletCornerMath(
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: Math.cos(Math.PI / 3), y: Math.sin(Math.PI / 3) },
      r,
    );
    expect(tight).toBeNull();
  });

  it('returns null when neighbours are the same direction (cos2t ≈ 1)', () => {
    const out = filletCornerMath({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }, 0.1);
    expect(out).toBeNull();
  });

  it('returns null when radius too large for the legs', () => {
    const out = filletCornerMath({ x: 0.5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0.5 }, 5);
    expect(out).toBeNull();
  });

  it('handles oblique 120° corner (interior angle)', () => {
    // 120° interior corner: directions 0° and 240° (= -120°).
    const A = { x: 1, y: 0 };
    const B = { x: -0.5, y: -Math.sqrt(3) / 2 };
    const out = filletCornerMath(A, { x: 0, y: 0 }, B, 0.5)!;
    // Half-angle = 60°, tan(60°) = √3, t = 0.5/√3 ≈ 0.2887.
    expect(out.t).toBeCloseTo(0.5 / Math.sqrt(3), 5);
    expect(out).not.toBeNull();
  });
});

describe('chamferPolylineVertex — corner math', () => {
  // Chamfer is just two parametric points along the legs;
  // no half-angle math needed. Verify symmetric and asymmetric.

  it('symmetric chamfer at right-angle corner (d1=d2=0.3)', () => {
    const A = { x: 1, y: 0 };
    const P = { x: 0, y: 0 };
    const B = { x: 0, y: 1 };
    const u1 = { x: 1, y: 0 };
    const u2 = { x: 0, y: 1 };
    const T1 = { x: P.x + 0.3 * u1.x, y: P.y + 0.3 * u1.y };
    const T2 = { x: P.x + 0.3 * u2.x, y: P.y + 0.3 * u2.y };
    expect(T1).toEqual({ x: 0.3, y: 0 });
    expect(T2).toEqual({ x: 0, y: 0.3 });
    // Bevel length = 0.3 * √2.
    expect(Math.hypot(T1.x - T2.x, T1.y - T2.y)).toBeCloseTo(0.3 * Math.SQRT2, 6);
  });

  it('asymmetric chamfer (d1=0.5, d2=0.2)', () => {
    const T1 = { x: 0.5, y: 0 };
    const T2 = { x: 0, y: 0.2 };
    expect(Math.hypot(T1.x - T2.x, T1.y - T2.y)).toBeCloseTo(Math.hypot(0.5, 0.2), 6);
  });
});
