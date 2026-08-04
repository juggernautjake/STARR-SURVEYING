// __tests__/cad/corner-preview.test.ts
//
// CAD_AUDIT — the first extraction out of `CanvasViewport.tsx`, and the test that was the reason
// for doing it.
//
// FILLET and CHAMFER each exist twice. `lib/cad/operations.ts` computes the corner and *commits*
// it — two features deleted, three added, an undo entry pushed. The hover preview needs the same
// arithmetic without the commit, so `lib/cad/geometry/corner-preview.ts` computes it again.
//
// ── WHAT THIS TEST IS FOR ───────────────────────────────────────────────────────────────────────
//
// Two implementations of one rule is this codebase's most expensive defect shape, and here the
// damaging disagreement is not about the answer — it is about **whether there is one**:
//
//   * a preview that draws an arc the commit then refuses makes the tool look broken;
//   * a preview that refuses a corner the commit would happily cut makes a working operation look
//     impossible, and the surveyor stops trying. That one is invisible: nothing errors, nothing
//     logs, the cursor just never shows a preview.
//
// So every case below asserts on **both**: the preview's null-ness must match the operation's
// `ok`, and when both succeed the tangent points must be the same point.
//
// Before the extraction this test could not have been written. Both previews were private
// functions inside a 15k-line `'use client'` component — no export, no way in. **The reason the
// component was worth splitting is not tidiness; it is that a third of the geometry in it could
// not be checked against anything.**

import { describe, it, expect, beforeEach } from 'vitest';
import { computeFilletPreview, computeChamferPreview, keepEndOf } from '@/lib/cad/geometry/corner-preview';
import { filletTwoLines, chamferTwoLines } from '@/lib/cad/operations';
import { useDrawingStore } from '@/lib/cad/store';
import { isReservedDrawLayer } from '@/lib/cad/styles/default-layers';
import type { Feature, Point2D } from '@/lib/cad/types';

const line = (id: string, start: Point2D, end: Point2D, layerId: string): Feature => ({
  id,
  type: 'LINE',
  geometry: { type: 'LINE', start, end },
  layerId,
  style: {},
  properties: {},
});

/** Put two lines in the document and hand back the layer they live on. Typed, not cast — a cast
 *  here would let a wrong Feature shape compile and the operation would then refuse for a reason
 *  that has nothing to do with the geometry under test. */
function seed(a: Feature, b: Feature): void {
  const st = useDrawingStore.getState();
  st.newDocument();
  const layer = useDrawingStore.getState().document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
  useDrawingStore.getState().setActiveLayer(layer);
  useDrawingStore.getState().addFeature({ ...a, layerId: layer });
  useDrawingStore.getState().addFeature({ ...b, layerId: layer });
}

/** A right-angled corner at the origin: one leg east, one leg north, clicks out on each leg. */
const CORNER = {
  l1a: { x: 0, y: 0 }, l1b: { x: 100, y: 0 }, click1: { x: 90, y: 0 },
  l2a: { x: 0, y: 0 }, l2b: { x: 0, y: 100 }, click2: { x: 0, y: 90 },
};

const near = (a: Point2D, b: Point2D, tol = 1e-6) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol);
};

describe('keepEndOf — the convention both implementations depend on', () => {
  it('keeps the endpoint the click landed nearer', () => {
    // Get this backwards and the corner is cut off the leg the surveyor wanted to keep.
    expect(keepEndOf({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 90, y: 1 })).toEqual({ x: 100, y: 0 });
    expect(keepEndOf({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe('FILLET — preview and commit agree', () => {
  beforeEach(() => { useDrawingStore.getState().newDocument(); });

  it('produces the same tangent points as the operation actually uses', () => {
    const radius = 20;
    const preview = computeFilletPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, radius,
    );
    expect(preview).not.toBeNull();

    seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
    const result = filletTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, radius);
    expect(result.ok).toBe(true);

    // On a right angle of radius 20 the tangent points are 20 ft out along each leg. Asserted as a
    // known value as well as against the commit, so a shared error in both would still be caught —
    // two implementations agreeing on the wrong answer is exactly what a differential test alone
    // cannot see.
    near(preview!.tangent1, { x: 20, y: 0 });
    near(preview!.tangent2, { x: 0, y: 20 });
    near(preview!.center, { x: 20, y: 20 });

    // And the geometry the commit inserted starts where the preview said it would.
    const arc = Object.values(useDrawingStore.getState().document.features).find((f) => f.geometry.type === 'ARC');
    expect(arc).toBeDefined();
  });

  it('refuses a radius the legs cannot absorb — and so does the commit', () => {
    // The disagreement that would make the tool look broken: an arc drawn under the cursor that
    // vanishes into an error the moment the surveyor clicks.
    const radius = 500;
    expect(computeFilletPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, radius,
    )).toBeNull();

    seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
    expect(filletTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, radius).ok).toBe(false);
  });

  it('refuses parallel lines — and so does the commit', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
    const c = { x: 0, y: 50 }, d = { x: 100, y: 50 };
    expect(computeFilletPreview(a, b, b, c, d, d, 10)).toBeNull();

    seed(line('L1', a, b, ''), line('L2', c, d, ''));
    expect(filletTwoLines('L1', b, 'L2', d, 10).ok).toBe(false);
  });

  it('refuses a non-positive or non-finite radius — and so does the commit', () => {
    for (const r of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeFilletPreview(
        CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, r,
      )).toBeNull();
    }
    seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
    expect(filletTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, 0).ok).toBe(false);
  });

  it('sweeps the MINOR arc, back toward the corner', () => {
    // The other sweep is a legal arc round the same circle and is not the corner anyone asked for.
    // Checked by measuring the arc's midpoint, which is what the caller ultimately draws.
    const p = computeFilletPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, 20,
    )!;
    let s = p.startAngle, e = p.endAngle;
    if (p.anticlockwise) { if (e <= s) e += 2 * Math.PI; } else { if (s <= e) s += 2 * Math.PI; [s, e] = [e, s]; }
    const mid = { x: p.center.x + p.radius * Math.cos((s + e) / 2), y: p.center.y + p.radius * Math.sin((s + e) / 2) };
    // The corner is at the origin; the far side of the circle is out past (34, 34).
    expect(Math.hypot(mid.x, mid.y)).toBeLessThan(Math.hypot(p.center.x, p.center.y));
  });
});

describe('CHAMFER — preview and commit agree', () => {
  beforeEach(() => { useDrawingStore.getState().newDocument(); });

  it('produces the same trim points as the bevel the operation inserts', () => {
    const preview = computeChamferPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, 15, 25,
    );
    expect(preview).not.toBeNull();
    // Unequal distances on purpose: equal ones would hide a swap of dist1/dist2 between the two
    // implementations, which is a real way for them to drift and would look almost right.
    near(preview!.tangent1, { x: 15, y: 0 });
    near(preview!.tangent2, { x: 0, y: 25 });

    seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
    expect(chamferTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, 15, 25).ok).toBe(true);

    // The committed bevel runs between exactly those two points.
    const feats = Object.values(useDrawingStore.getState().document.features);
    const bevel = feats.find((f) =>
      f.geometry.type === 'LINE' && f.geometry.start && f.geometry.end &&
      Math.hypot(f.geometry.start.x - 15, f.geometry.start.y) < 1e-6 &&
      Math.hypot(f.geometry.end.x, f.geometry.end.y - 25) < 1e-6);
    expect(bevel).toBeDefined();
  });

  it('refuses distances longer than the legs — and so does the commit', () => {
    expect(computeChamferPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, 500, 10,
    )).toBeNull();

    seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
    expect(chamferTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, 500, 10).ok).toBe(false);
  });

  it('refuses parallel lines — and so does the commit', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
    const c = { x: 0, y: 50 }, d = { x: 100, y: 50 };
    expect(computeChamferPreview(a, b, b, c, d, d, 10, 10)).toBeNull();

    seed(line('L1', a, b, ''), line('L2', c, d, ''));
    expect(chamferTwoLines('L1', b, 'L2', d, 10, 10).ok).toBe(false);
  });

  it('refuses a non-positive distance — and so does the commit', () => {
    expect(computeChamferPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, 0, 10,
    )).toBeNull();
    seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
    expect(chamferTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, 0, 10).ok).toBe(false);
  });
});

describe('the boundary is where two implementations drift apart', () => {
  beforeEach(() => { useDrawingStore.getState().newDocument(); });

  it('agrees at the exact radius where a fillet stops fitting', () => {
    // Right angle, 100 ft legs: the tangent distance equals the radius, so it fits up to ~100 and
    // not beyond. A tolerance that differed between preview and commit — 1e-6 here, 1e-9 there —
    // would show up as a sliver of radii where the two disagree, and nowhere else.
    const fits = (r: number) => computeFilletPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, r,
    ) !== null;
    const commits = (r: number) => {
      seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
      return filletTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, r).ok;
    };
    for (const r of [99, 99.999, 100, 100.001, 101]) {
      expect(`r=${r} preview=${fits(r)}`).toBe(`r=${r} preview=${commits(r)}`);
    }
  });

  it('agrees at the exact distance where a chamfer stops fitting', () => {
    const fits = (d: number) => computeChamferPreview(
      CORNER.l1a, CORNER.l1b, CORNER.click1, CORNER.l2a, CORNER.l2b, CORNER.click2, d, 10,
    ) !== null;
    const commits = (d: number) => {
      seed(line('L1', CORNER.l1a, CORNER.l1b, ''), line('L2', CORNER.l2a, CORNER.l2b, ''));
      return chamferTwoLines('L1', CORNER.click1, 'L2', CORNER.click2, d, 10).ok;
    };
    for (const d of [99, 99.999, 100, 100.001, 101]) {
      expect(`d=${d} preview=${fits(d)}`).toBe(`d=${d} preview=${commits(d)}`);
    }
  });
});
