// C29 — the first two gaps from C27's list.
//
// ── GAP A: THE "PLACE ON DRAWING" BUTTON HAS NEVER RENDERED ─────────────────────────────────────
//
// `CurveCalculator` takes `onPlace?: (curve: CurveParameters) => void` and renders its placement
// button only when that prop is present. **Nothing passed it.** So the one curve path in the
// product that creates geometry did not, and C28's registry asserted `writesGeometry: true` for it
// on the strength of the prop existing in the type.
//
// That is worth stating plainly: a capability can be present in the signature and absent from the
// running product, and a scan that reads types will report it as present. C27's audit needed four
// corrections for related reasons; this one got past all of them.
//
// ── GAP B: THREE CURVE ENGINES NOTHING COULD REACH ──────────────────────────────────────────────
//
// `compound-curve.ts` exports compound, reverse and clothoid-spiral solvers. The repo already knew:
// `cad-modules-are-reachable.test.ts` lists it as "built ahead of a UI that can express it". What
// it did NOT have was a single test of the maths — so the UI C29 owes it would have been built on
// arithmetic nobody had checked. These tests come first for that reason.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeCurve } from '@/lib/cad/geometry/curve';
import {
  computeCompoundCurve,
  computeReverseCurve,
  computeClothoidSpiral,
} from '@/lib/cad/geometry/compound-curve';
import { curveToArcGeometry, curveToFeature } from '@/lib/cad/calculators/place-curve';
import { readDerivation } from '@/lib/cad/derivation';
import type { CurveParameters } from '@/lib/cad/types';

/** A curve solved the way the calculator solves one: 200 ft radius, 60° delta, deflecting right,
 *  starting at the origin heading due north. */
function sample(direction: 'LEFT' | 'RIGHT' = 'RIGHT'): CurveParameters {
  return computeCurve({
    R: 200, delta: 60, direction, pc: { x: 0, y: 0 }, tangentInBearing: 0,
  })!;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('the solver produces what the placement needs', () => {
  it('gives a radius point equidistant from both ends', () => {
    // Not decoration: the whole conversion below assumes `rp` is the true centre. If it were not,
    // the arc would be drawn at the wrong radius and still look like a curve.
    const c = sample();
    expect(dist(c.rp, c.pc)).toBeCloseTo(200, 6);
    expect(dist(c.rp, c.pt)).toBeCloseTo(200, 6);
  });
});

describe('curve → arc geometry', () => {
  it('centres on the radius point at the solved radius', () => {
    const g = curveToArcGeometry(sample());
    expect(g.center).toEqual(sample().rp);
    expect(g.radius).toBe(200);
  });

  it('starts at PC and ends at PT', () => {
    const c = sample();
    const g = curveToArcGeometry(c);
    const at = (a: number) => ({
      x: g.center.x + Math.cos(a) * g.radius,
      y: g.center.y + Math.sin(a) * g.radius,
    });
    expect(dist(at(g.startAngle), c.pc)).toBeLessThan(1e-6);
    expect(dist(at(g.endAngle), c.pt)).toBeLessThan(1e-6);
  });

  /** Angle actually swept, honouring the geometry's own `anticlockwise` flag. Deliberately derived
   *  from the flag rather than from the curve's direction, so the assertion cannot smuggle in the
   *  same assumption the code is being checked for — which is how the first version of this file
   *  managed to be wrong and self-consistent at the same time. */
  function sweptDegrees(g: ReturnType<typeof curveToArcGeometry>): number {
    const TAU = Math.PI * 2;
    const norm = (a: number) => ((a % TAU) + TAU) % TAU;
    const swept = g.anticlockwise
      ? norm(g.endAngle - g.startAngle)
      : norm(g.startAngle - g.endAngle);
    return (swept * 180) / Math.PI;
  }

  it.each(['RIGHT', 'LEFT'] as const)('sweeps the MINOR arc for a %s curve', (dir) => {
    // The 300-foot error that still passes for a curve at a glance. A 60° curve at R=200 is
    // 209.44 ft; the major arc is 1047.20 ft. Both are arcs between the same two points, and only
    // one of them is the curve that was solved.
    //
    // Checked in BOTH directions because a sign error shows up in exactly one of the two — which
    // is how this caught the real bug: `anticlockwise` was mapped by reasoning about the convention
    // instead of measuring it, and the reasoning was backwards for this solver.
    const c = sample(dir);
    const g = curveToArcGeometry(c);
    expect(sweptDegrees(g)).toBeCloseTo(60, 4);
    expect((sweptDegrees(g) * Math.PI / 180) * g.radius).toBeCloseTo(c.L, 3);
  });

  it('flips the sweep flag with the curve direction', () => {
    // Measured, not assumed — see the note on `curveToArcGeometry`.
    expect(curveToArcGeometry(sample('RIGHT')).anticlockwise).toBe(true);
    expect(curveToArcGeometry(sample('LEFT')).anticlockwise).toBe(false);
  });
});

describe('curve → feature', () => {
  it('is a drawable ARC on the given layer', () => {
    const f = curveToFeature(sample(), 'L1');
    expect(f.type).toBe('ARC');
    expect(f.geometry.type).toBe('ARC');
    expect(f.geometry.arc).toBeDefined();
    expect(f.layerId).toBe('L1');
    expect(f.id).toBeTruthy();
  });

  it('carries the numbers it was solved from', () => {
    // A curve table can then be checked against the geometry rather than against a memory of what
    // was typed. Not provenance — C30 is where a derivation becomes a field a viewer reads back —
    // but the closest thing the product has today.
    // C30 moved these onto the shared derivation model, and the move sharpened the assertion: the
    // radius and delta were GIVEN, the arc length was SOLVED, and the two now live on opposite
    // sides where a reader can tell which is which.
    const d = readDerivation(curveToFeature(sample(), 'L1').properties)!;
    expect(d.method).toBe('CURVE_CALCULATOR');
    expect(d.inputs.radius).toBe(200);
    expect(d.inputs.deltaDeg).toBe(60);
    expect(d.inputs.direction).toBe('RIGHT');
    expect(d.outputs!.arcLength).toBeCloseTo(209.44, 1);
    expect(d.inputs.arcLength).toBeUndefined();
  });

  it('rounds to survey feet', () => {
    // Raw floats put `132.48000000000002` in a curve table, which reads as a precision claim
    // nobody made.
    const d = readDerivation(curveToFeature(sample(), 'L1').properties)!;
    for (const [k, v] of [...Object.entries(d.inputs), ...Object.entries(d.outputs ?? {})]) {
      if (typeof v !== 'number') continue;
      expect(String(v).split('.')[1]?.length ?? 0, k).toBeLessThanOrEqual(3);
    }
  });

  it('accepts an explicit id, for a caller that batches', () => {
    expect(curveToFeature(sample(), 'L1', 'fixed').id).toBe('fixed');
  });
});

describe('the button is actually wired now', () => {
  const layout = readFileSync(join(process.cwd(), 'app/admin/cad/CADLayout.tsx'), 'utf8');

  it('passes onPlace, without which the button does not render at all', () => {
    expect(layout).toMatch(/onPlace=\{\(curve\) =>/);
    expect(layout).toMatch(/curveToFeature\(curve, layerId\)/);
  });

  it('places on the active layer and pushes undo', () => {
    // A placement that cannot be undone is worse than none: the surveyor experimenting with a
    // curve solve would be stuck with whatever they tried.
    expect(layout).toMatch(/useDrawingStore\.getState\(\)\.activeLayerId/);
    expect(layout).toMatch(/pushUndo\(makeAddFeatureEntry\(feature\)\)/);
  });
});

// ── The three engines nothing has ever run ─────────────────────────────────────────────────────
describe('compound curve', () => {
  const cc = computeCompoundCurve(300, 30, 150, 40, 'RIGHT', { x: 0, y: 0 }, 0);

  it('joins: the second curve begins exactly where the first ends', () => {
    // That junction IS the compound curve. If the two are solved independently the drawing has two
    // arcs with a gap nobody sees until it is plotted.
    expect(dist(cc.curve1.pt, cc.curve2.pc)).toBeLessThan(1e-9);
    expect(cc.pcc).toEqual(cc.curve1.pt);
  });

  it('is tangent through the junction', () => {
    // The defining property, and the one a unit slip destroys silently: `computeCurve` takes
    // `tangentInBearing` in DEGREES while `CurveParameters.tangentOutBearing` is RADIANS, and the
    // engine converts. Without that conversion the second curve leaves at a wild angle and still
    // draws a curve.
    expect(cc.curve2.tangentInBearing).toBeCloseTo(cc.curve1.tangentOutBearing, 9);
  });

  it('keeps both curves turning the same way, with different radii', () => {
    expect(cc.curve1.direction).toBe('RIGHT');
    expect(cc.curve2.direction).toBe('RIGHT');
    expect(cc.curve1.R).toBe(300);
    expect(cc.curve2.R).toBe(150);
  });

  it('sweeps the total delta it was given', () => {
    const total = ((cc.curve1.delta + cc.curve2.delta) * 180) / Math.PI;
    expect(total).toBeCloseTo(70, 6);
  });
});

describe('reverse curve', () => {
  const rc = computeReverseCurve(300, 30, 150, 40, 'RIGHT', { x: 0, y: 0 }, 0);

  it('joins at the point of reverse curvature', () => {
    expect(dist(rc.curve1.pt, rc.curve2.pc)).toBeLessThan(1e-9);
    expect(rc.prc).toEqual(rc.curve1.pt);
  });

  it('actually reverses', () => {
    // The one thing that distinguishes it from a compound curve. A copy-paste that left both
    // curves turning the same way would produce a compound curve under a reverse curve's name.
    expect(rc.curve1.direction).toBe('RIGHT');
    expect(rc.curve2.direction).toBe('LEFT');
  });

  it('is still tangent through the junction', () => {
    expect(rc.curve2.tangentInBearing).toBeCloseTo(rc.curve1.tangentOutBearing, 9);
  });

  it('puts the two radius points on opposite sides of the common tangent', () => {
    // The geometric consequence of reversing, checked independently of the direction flag so a
    // flag that lied would still be caught.
    const t = rc.curve1.tangentOutBearing;
    // Azimuth: 0 = north, clockwise. Left-normal of the tangent.
    const nx = -Math.cos(t);
    const ny = Math.sin(t);
    const side = (p: { x: number; y: number }) =>
      Math.sign((p.x - rc.prc.x) * nx + (p.y - rc.prc.y) * ny);
    expect(side(rc.curve1.rp)).not.toBe(side(rc.curve2.rp));
  });
});

describe('clothoid spiral', () => {
  const sp = computeClothoidSpiral(400, 100, 'RIGHT', { x: 0, y: 0 }, 0);

  it('satisfies A² = R × L, which is the definition', () => {
    expect(sp.A ** 2).toBeCloseTo(400 * 100, 6);
  });

  it('runs from an infinite radius on the tangent to the curve radius', () => {
    // A spiral exists to take the driver from straight to circular. Starting at anything but
    // infinity would mean it begins already curving, which is the thing it is there to avoid.
    expect(sp.radiusStart).toBe(Infinity);
    expect(sp.radiusEnd).toBe(400);
  });

  it('lands its SC point at very nearly the spiral length from the TS', () => {
    // The chord is slightly shorter than the arc — 100 ft of spiral at R=400 deflects only ~7°, so
    // a straight-line distance far off 100 would mean the series expansion is wrong.
    const d = dist(sp.ts, sp.sc);
    expect(d).toBeGreaterThan(99);
    expect(d).toBeLessThan(100.01);
  });

  it('deflects to the correct side', () => {
    // Heading due north from the origin, a RIGHT spiral must end east of the tangent and a LEFT
    // one west. A sign error here is invisible in every scalar above.
    expect(computeClothoidSpiral(400, 100, 'RIGHT', { x: 0, y: 0 }, 0).sc.x).toBeGreaterThan(0);
    expect(computeClothoidSpiral(400, 100, 'LEFT', { x: 0, y: 0 }, 0).sc.x).toBeLessThan(0);
  });

  it('a longer spiral at the same radius is a sharper deflection', () => {
    const short = computeClothoidSpiral(400, 50, 'RIGHT', { x: 0, y: 0 }, 0);
    const long = computeClothoidSpiral(400, 150, 'RIGHT', { x: 0, y: 0 }, 0);
    expect(long.sc.x).toBeGreaterThan(short.sc.x);
  });
});
