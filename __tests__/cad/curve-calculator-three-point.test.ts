// C29 — the Curve Calculator's 3-point method, which had never been usable.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `THREE_POINT` has always been in the method dropdown, labelled "3-Point (PC, Mid, PT)".
// `computeCurve` implements it completely — `circleThrough3Points`, exercised by
// `__tests__/cad/geometry/curve.test.ts`, which is why nothing looked wrong.
//
// The form had no fields for the three points. No state, no inputs, and `compute()` never set
// `point1`/`point2`/`point3`. Choosing the method hid the R and Direction fields, left nothing
// behind, and Compute answered "Insufficient input — provide at least R and one other parameter"
// — advice for a method that does not take R.
//
// A capability present in the engine and in the signature, and absent from the running product:
// the same class as C29's "Place on drawing has never rendered", and the reason a green engine
// suite is not evidence that a feature exists.
//
// ── WHY A SOURCE SCAN ───────────────────────────────────────────────────────────────────────────
//
// The component reads two zustand stores that a canvas populates. Standing that up in jsdom to
// click three points would test the harness. What is worth pinning cheaply is that the wiring
// EXISTS and that the engine still solves what the wiring now hands it — the second half asserted
// against the real solver, so the test cannot pass on a UI that reaches a broken engine.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCurve } from '@/lib/cad/geometry/curve';

const raw = readFileSync(
  join(process.cwd(), 'app/admin/cad/components/CurveCalculator.tsx'),
  'utf8',
);
// Comments stripped — this change's own comment quotes the symbols it introduced and the error
// message it replaced. C3's guard paid for this three times.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the method is wired to the engine', () => {
  it('sets all three points on the input', () => {
    for (const field of ['point1', 'point2', 'point3']) {
      expect(code, `${field} must reach computeCurve`).toMatch(
        new RegExp(`input\\.${field}\\s*=`),
      );
    }
  });

  it('takes them from the live selection, not from typed coordinates', () => {
    // Six coordinates read off the screen and retyped is precisely the gap C27 measured, and the
    // points are already on the drawing.
    expect(code).toContain('getSelectedFeatures');
    expect(code).toContain('useSelectionStore');
    // C29c's note: without `document.features` in the deps, dragging one of the three points would
    // not change the curve it solves.
    expect(code).toContain('document.features');
  });

  it('does not offer a Direction radio that the geometry already decides', () => {
    // A curve through three known positions has a direction. Letting a stale radio override it
    // draws the MAJOR arc through the same three points — the 300-foot error C29 measured, which
    // still passes for a curve at a glance.
    expect(code).toMatch(/method !== 'THREE_POINT'[\s\S]{0,400}Direction/);
  });
});

describe('the refusals name the cause', () => {
  it('says how many points are selected when the count is wrong', () => {
    // "Select exactly three points" leaves the surveyor wondering whether the tool can see the
    // selection at all. Naming what it can see answers that in the same sentence.
    expect(code).toMatch(/points\.length !== 3/);
    expect(raw).toMatch(/are selected/);
  });

  it('distinguishes collinear points from insufficient input', () => {
    // The engine returns null for both. Only one of them is worth re-checking the input over —
    // three collinear points are a complete input describing an impossible arc.
    expect(raw).toMatch(/lie on a straight line/);
    expect(code).toMatch(/THREE_POINT'[\s\S]{0,200}straight line/);
  });

  it('does not silently truncate a selection of more than three', () => {
    // Solving the first three of five answers a question the surveyor did not ask, and looks
    // right doing it.
    expect(code).toMatch(/points\.length > 3/);
  });
});

describe('the embedded body has the same method and had the same defect', () => {
  // Two surfaces share the compute kernel, and only their dropdowns agreed: `CurveCalculatorBody`
  // offered THREE_POINT with no inputs either. Fixing one and not the other would leave the bug
  // reachable from the Calculations hub while the standalone dialog worked.
  const bodyRaw = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/CurveCalculatorBody.tsx'),
    'utf8',
  );
  const bodyCode = bodyRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('sets all three points on the input', () => {
    for (const field of ['point1', 'point2', 'point3']) {
      expect(bodyCode).toMatch(new RegExp(`input\\.${field}\\s*=`));
    }
  });

  it('reads them from the selection through the shared extractor', () => {
    expect(bodyCode).toContain('selectedPoints');
    expect(bodyCode).toContain('getSelectedFeatures');
  });

  it('reports collinear points as collinear, not as insufficient input', () => {
    expect(bodyRaw).toMatch(/lie on a straight line/);
  });
});

describe('the engine still solves what the wiring hands it', () => {
  const R = 500;
  const DEG = Math.PI / 180;
  // PC, a point along the arc, PT — the order the UI labels them in.
  const pc = { x: R * Math.sin(-15 * DEG), y: R * Math.cos(-15 * DEG) };
  const mid = { x: 0, y: R };
  const pt = { x: R * Math.sin(15 * DEG), y: R * Math.cos(15 * DEG) };

  it('recovers the curve from three points in click order', () => {
    const result = computeCurve({ point1: pc, point2: mid, point3: pt });
    expect(result).not.toBeNull();
    expect(result!.R).toBeCloseTo(500, 0);
    expect(result!.delta * (180 / Math.PI)).toBeCloseTo(30, 1);
  });

  it('returns null for three collinear points, which is what the UI reports as such', () => {
    const flat = computeCurve({
      point1: { x: 0, y: 0 },
      point2: { x: 50, y: 0 },
      point3: { x: 100, y: 0 },
    });
    expect(flat).toBeNull();
  });

  it('puts the PC and PT where the surveyor clicked them', () => {
    // The labels in the UI make a promise about which point is which. If the engine used them in
    // another order the panel would be captioned wrongly, and the caption is the only thing
    // telling the surveyor that click order matters.
    const result = computeCurve({ point1: pc, point2: mid, point3: pt })!;
    expect(result.pc.x).toBeCloseTo(pc.x, 6);
    expect(result.pc.y).toBeCloseTo(pc.y, 6);
    expect(result.pt.x).toBeCloseTo(pt.x, 6);
    expect(result.pt.y).toBeCloseTo(pt.y, 6);
  });
});
