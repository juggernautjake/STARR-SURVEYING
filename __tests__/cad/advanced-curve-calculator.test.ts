// C29 — the UI `compound-curve.ts` was built ahead of.
//
// The reachability test's own note on that module reads: *"compound-curve solving, built ahead of a
// UI that can express it."* This is that UI, and these are the checks that make placing its results
// safe.
//
// The engines themselves are covered in `place-curve-and-compound.test.ts`. What is new here is the
// spiral tessellation — a clothoid cannot be faked with an arc, because its radius varies along its
// length, which is the entire reason the curve exists — and the wiring that makes the calculator
// reachable and its output undoable.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeClothoidSpiral, spiralPolyline } from '@/lib/cad/geometry/compound-curve';
import { calculatorById, CALCULATOR_REGISTRY } from '@/lib/cad/calculators/registry';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('spiral tessellation', () => {
  const R = 400, L = 100, TS = { x: 0, y: 0 }, BRG = 0;

  it('starts at the TS', () => {
    expect(dist(spiralPolyline(R, L, 'RIGHT', TS, BRG)[0], TS)).toBeLessThan(1e-9);
  });

  it('ENDS at the SC point the solver reports', () => {
    // The one that matters. Using a different (even a better) series here would put a polyline on
    // the drawing that does not end where the curve table says it does — and a curve table that
    // disagrees with the geometry beside it is worse than either alone.
    const sp = computeClothoidSpiral(R, L, 'RIGHT', TS, BRG);
    const pts = spiralPolyline(R, L, 'RIGHT', TS, BRG);
    expect(dist(pts[pts.length - 1], sp.sc)).toBeLessThan(1e-9);
  });

  it('holds for a LEFT spiral too', () => {
    const sp = computeClothoidSpiral(R, L, 'LEFT', TS, BRG);
    const pts = spiralPolyline(R, L, 'LEFT', TS, BRG);
    expect(dist(pts[pts.length - 1], sp.sc)).toBeLessThan(1e-9);
  });

  it('and off an arbitrary tangent bearing', () => {
    const sp = computeClothoidSpiral(R, L, 'RIGHT', { x: 1000, y: 2000 }, 137.5);
    const pts = spiralPolyline(R, L, 'RIGHT', { x: 1000, y: 2000 }, 137.5);
    expect(dist(pts[pts.length - 1], sp.sc)).toBeLessThan(1e-9);
  });

  it('returns segments + 1 points', () => {
    expect(spiralPolyline(R, L, 'RIGHT', TS, BRG, 8)).toHaveLength(9);
    expect(spiralPolyline(R, L, 'RIGHT', TS, BRG)).toHaveLength(33);
  });

  it('refuses to degenerate below two points', () => {
    // A one-point "polyline" is not geometry; it draws nothing and reads as a failed placement.
    expect(spiralPolyline(R, L, 'RIGHT', TS, BRG, 0).length).toBeGreaterThanOrEqual(3);
    expect(spiralPolyline(R, L, 'RIGHT', TS, BRG, -5).length).toBeGreaterThanOrEqual(3);
  });

  it('curves — it is not a straight line', () => {
    // The whole point. A tessellation that returned collinear points would pass every endpoint
    // check above and draw a chord.
    const pts = spiralPolyline(R, L, 'RIGHT', TS, BRG, 16);
    const first = pts[0], last = pts[pts.length - 1], mid = pts[8];
    // Perpendicular distance of the midpoint from the TS→SC chord.
    const dx = last.x - first.x, dy = last.y - first.y;
    const len = Math.hypot(dx, dy);
    const off = Math.abs((mid.x - first.x) * dy - (mid.y - first.y) * dx) / len;
    expect(off).toBeGreaterThan(0.5);
  });

  it('deflects further as it goes, never back', () => {
    // A clothoid's curvature increases monotonically from zero. Offsets from the tangent must
    // therefore grow with every sample; a sign or series error shows up as a wobble.
    const pts = spiralPolyline(R, L, 'RIGHT', TS, BRG, 20);
    let prev = -1;
    for (const p of pts) {
      // Tangent is due north in this frame, so the deflection is |x|.
      const off = Math.abs(p.x);
      expect(off).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = off;
    }
  });

  it('a tighter radius deflects more over the same length', () => {
    const tight = spiralPolyline(200, L, 'RIGHT', TS, BRG);
    const wide = spiralPolyline(800, L, 'RIGHT', TS, BRG);
    expect(Math.abs(tight[tight.length - 1].x)).toBeGreaterThan(Math.abs(wide[wide.length - 1].x));
  });
});

describe('the calculator is reachable', () => {
  it('is registered, and says it draws', () => {
    const entry = calculatorById('advanced-curve');
    expect(entry).toBeDefined();
    expect(entry!.mode).toBe('INLINE');
    expect(entry!.writesGeometry).toBe(true);
    expect(entry!.group).toBe('CURVES');
  });

  it('the modal renders it', () => {
    // An entry the picker offers and the modal cannot render is a blank panel — the same
    // authored-but-not-wired shape this doc keeps finding.
    const modal = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/CalculatorModal.tsx'), 'utf8',
    );
    expect(modal).toMatch(/activeId === 'advanced-curve' && <AdvancedCurveCalculator \/>/);
  });

  it('every INLINE registry id is a CalculatorId the store accepts', () => {
    // The picker writes these into `setActiveCalculator`; an id outside the union would compile
    // only because the picker casts, and then match no branch in the modal.
    const store = readFileSync(join(process.cwd(), 'lib/cad/store/calculator-store.ts'), 'utf8');
    for (const c of CALCULATOR_REGISTRY.filter((x) => x.mode === 'INLINE')) {
      expect(store, `${c.id} is not in CalculatorId`).toMatch(new RegExp(`'${c.id}'`));
    }
  });
});

describe('placement', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/AdvancedCurveCalculator.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('places both arcs of a compound or reverse curve', () => {
    expect(src).toMatch(/for \(const c of pair\) features\.push\(curveToFeature\(c, layerId\)\)/);
  });

  it('places the spiral as a sampled polyline, not an arc', () => {
    // A clothoid's radius varies along its length. Drawing it as an ARC would be a different curve
    // that happens to share two points with the right one.
    expect(src).toMatch(/spiralPolyline\(/);
    expect(src).toMatch(/type: 'POLYLINE'/);
  });

  it('is ONE undo entry for the whole placement', () => {
    // Two arcs that arrived together must leave together. Undoing half a compound curve leaves
    // geometry that is not a curve and is not nothing, and the surveyor has to notice and press
    // undo again.
    expect(src).toMatch(/makeBatchEntry\(/);
    expect(src).toMatch(/features\.map\(\(f\) => \(\{ type: 'ADD_FEATURE', data: f \}\)/);
  });

  it('stamps the solved numbers on what it draws', () => {
    expect(src).toMatch(/method: 'SPIRAL'/);
    // C30 — the spiral parameter A is SOLVED from R and L, so it belongs with the outputs. A
    // reader asking what was given must not be handed a derived quantity in the same list.
    expect(src).toMatch(/outputs: { spiralParameterA/);
  });

  it('refuses impossible input instead of drawing NaN', () => {
    // A = √(R·L): a zero or negative either side makes the spiral parameter imaginary, and the
    // deltas must be under a half-turn for the curve solve to mean anything. Placing NaN
    // coordinates puts geometry at nowhere, which is far harder to notice than a blocked button.
    expect(src).toMatch(/R1 <= 0 \|\| L <= 0/);
    expect(src).toMatch(/D1 >= 180 \|\| D2 >= 180/);
  });

  it('says WHY it is blocked rather than dimming a button silently', () => {
    // The C16 rule.
    expect(src).toMatch(/data-testid="advanced-curve-blocked"/);
    expect(src).toMatch(/Enter a positive radius/);
  });
});
