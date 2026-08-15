// C29 — C27's finding F3: two COGO vocabularies.
//
// ── WHAT THE FINDING ACTUALLY WAS ───────────────────────────────────────────────────────────────
//
// C27 reported `cogo.ts` and `solver.ts` as two implementations of the same job, one of them
// unused, and suggested picking a winner. Reading them properly says something more useful and more
// alarming.
//
// They are NOT redundant. The boundary between them is **the number of answers**:
//
//   cogo.ts     distance–distance and bearing–distance each yield up to TWO points, and the
//               surveyor picks. `SolverResult` has no shape for that.
//   solver.ts   single-answer constraint solves, in an `{ ok, point | reason }` envelope the AI
//               tool-registry forwards without case analysis.
//
// And `CalcPointDialog` uses BOTH — `computeCogoSolutions` for its two-solution methods and the
// solver for the rest. Deleting either would have broken the dialog.
//
// ── THE PART THAT WAS A REAL BUG ────────────────────────────────────────────────────────────────
//
// Exactly one operation existed in both, and they DISAGREED. Bearing–bearing:
//
//   cogo.brgBrgPoint              rejects a crossing behind either station, with a comment saying
//                                 why — "a bearing entered backwards would otherwise plant the
//                                 point on the wrong side of a station"
//   solver.calcPointFromTwoBearings  intersected the infinite lines and returned it
//
// The safer of the two was the one nothing called. The dialog's bearing–bearing method AND the AI
// tool registry both used the permissive one, so a mistyped bearing — a back bearing, a transposed
// quadrant — placed a point hundreds of feet the wrong way and reported success.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calcPointFromTwoBearings, calcPointFromBearingDistance } from '@/lib/cad/geometry/solver';
import { brgBrgPoint, brgDistPoints, distDistPoints, computeCogoSolutions } from '@/lib/cad/geometry/cogo';

describe('the two bearing–bearing implementations now agree', () => {
  // A crosses B forward: A at the origin heading east, B south of the crossing heading north.
  const forward = () => ({
    a: { x: 0, y: 0 }, azA: 90,
    b: { x: 100, y: -50 }, azB: 0,
  });

  it('both find the same forward intersection', () => {
    const f = forward();
    const viaSolver = calcPointFromTwoBearings(f.a, f.azA, f.b, f.azB);
    const viaCogo = brgBrgPoint(f.a, f.azA, f.b, f.azB);
    expect(viaSolver.ok).toBe(true);
    expect(viaCogo).toHaveLength(1);
    if (viaSolver.ok) {
      expect(viaSolver.point.x).toBeCloseTo(viaCogo[0].x, 9);
      expect(viaSolver.point.y).toBeCloseTo(viaCogo[0].y, 9);
      expect(viaSolver.point.x).toBeCloseTo(100, 9);
      expect(viaSolver.point.y).toBeCloseTo(0, 9);
    }
  });

  it('BOTH now refuse a crossing behind a station', () => {
    // The fix. Same geometry, but A points west — away from the crossing. The lines still meet at
    // (100, 0); the rays do not.
    const back = calcPointFromTwoBearings({ x: 0, y: 0 }, 270, { x: 100, y: -50 }, 0);
    expect(back.ok).toBe(false);
    expect(brgBrgPoint({ x: 0, y: 0 }, 270, { x: 100, y: -50 }, 0)).toEqual([]);
  });

  it('and refuses when the OTHER station is the backwards one', () => {
    const back = calcPointFromTwoBearings({ x: 0, y: 0 }, 90, { x: 100, y: -50 }, 180);
    expect(back.ok).toBe(false);
  });

  it('names the likely cause instead of just saying no', () => {
    // "No intersection" for two bearings that plainly cross is the kind of refusal a surveyor
    // argues with instead of re-reading their field notes.
    const back = calcPointFromTwoBearings({ x: 0, y: 0 }, 270, { x: 100, y: -50 }, 0);
    if (!back.ok) expect(back.reason).toMatch(/back bearing/i);
  });

  it('still refuses parallel bearings, with its own reason', () => {
    const par = calcPointFromTwoBearings({ x: 0, y: 0 }, 45, { x: 5, y: 5 }, 45);
    expect(par.ok).toBe(false);
    if (!par.ok) expect(par.reason).toMatch(/parallel/i);
  });

  it('accepts a crossing exactly AT a station', () => {
    // Zero is forward, not backward. A tolerance that excluded it would refuse the commonest
    // deliberate case: shooting a bearing from a point that is already on the other line.
    const at = calcPointFromTwoBearings({ x: 0, y: 0 }, 90, { x: 0, y: -50 }, 0);
    expect(at.ok).toBe(true);
    if (at.ok) {
      expect(at.point.x).toBeCloseTo(0, 9);
      expect(at.point.y).toBeCloseTo(0, 9);
    }
  });
});

describe('the two modules are NOT redundant — the boundary is the number of answers', () => {
  it('cogo returns up to TWO points, which the solver envelope cannot express', () => {
    // Two circles of equal radius about two stations cross twice, and which one the surveyor wants
    // is a judgement the maths cannot make.
    const two = distDistPoints({ x: 0, y: 0 }, 50, { x: 60, y: 0 }, 50);
    expect(two).toHaveLength(2);
    expect(brgDistPoints({ x: 0, y: 0 }, 90, { x: 50, y: 0 }, 20)).toHaveLength(2);
  });

  it('the solver returns exactly one, with a reason when it cannot', () => {
    const one = calcPointFromBearingDistance({ x: 0, y: 0 }, 90, 100);
    expect(one.ok).toBe(true);
    const bad = calcPointFromBearingDistance({ x: 0, y: 0 }, 90, -1);
    expect(bad.ok).toBe(false);
  });

  it('and they are different OPERATIONS despite similar names', () => {
    // `calcPointFromBearingDistance` is a FORWARD — go this way, this far, one answer.
    // `brgDistPoints` is an INTERSECTION — where does this ray cross a circle about another
    // station, up to two answers. Reading the names alone, they sound like the same thing.
    const fwd = calcPointFromBearingDistance({ x: 0, y: 0 }, 90, 100);
    expect(fwd.ok).toBe(true);
    if (fwd.ok) expect(fwd.point).toEqual({ x: 100, y: expect.closeTo(0, 9) });

    const isect = brgDistPoints({ x: 0, y: 0 }, 90, { x: 100, y: 0 }, 10);
    expect(isect.map((p) => Math.round(p.x))).toEqual([90, 110]);
  });
});

describe('both vocabularies are live — deleting either would break the dialog', () => {
  const dialog = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/CalcPointDialog.tsx'), 'utf8',
  );

  it('the dialog imports from both', () => {
    expect(dialog).toMatch(/computeCogoSolutions/);
    expect(dialog).toMatch(/calcPointFromTwoBearings/);
    expect(dialog).toMatch(/calcFourthParallelogramCorner/);
  });

  it('it routes the two-solution methods through cogo', () => {
    expect(dialog).toMatch(/computeCogoSolutions\(\{ method: 'DIST_DIST'/);
  });

  it('and the single-answer ones through the solver', () => {
    expect(dialog).toMatch(/r = calcPointFromTwoBearings\(/);
  });

  it('computeCogoSolutions still dispatches all three methods', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 60, y: 0 };
    expect(computeCogoSolutions({ method: 'DIST_DIST', a, b, distA: 50, distB: 50 })).toHaveLength(2);
    expect(computeCogoSolutions({ method: 'BRG_DIST', a, b, azA: 90, distB: 20 })).toHaveLength(2);
    expect(computeCogoSolutions({ method: 'BRG_BRG', a, azA: 90, b: { x: 60, y: -50 }, azB: 0 })).toHaveLength(1);
  });
});

describe('the AI tool registry gets the fix for free', () => {
  it('it calls the solver, which now rejects backward crossings', () => {
    // The registry forwards `SolverResult` straight to the copilot. Before this, an AI-proposed
    // bearing–bearing point could land behind a station and arrive labelled `ok: true`.
    const registry = readFileSync(join(process.cwd(), 'lib/cad/ai/tool-registry.ts'), 'utf8');
    expect(registry).toMatch(/calcPointFromTwoBearings\(oa\.result, args\.bearingADeg, ob\.result, args\.bearingBDeg\)/);
  });
});
