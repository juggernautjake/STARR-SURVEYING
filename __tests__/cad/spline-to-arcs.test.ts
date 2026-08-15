// C29 — spline → arcs, made reachable.
//
// ── WHY THE CAPABILITY MATTERS ──────────────────────────────────────────────────────────────────
//
// A spline is a perfectly good curve on screen and a problem in a deliverable: plenty of the
// packages a plat gets handed to — older survey software, some county filing systems, a few CAD
// readers — will not accept one. The usual fallback is a polyline of hundreds of chords, which IS
// accepted and is not the same drawing; it prints heavier, edits worse, and every vertex is a place
// for a rounding difference to appear.
//
// A bi-arc fit reproduces the curve to a stated tolerance with a handful of entities. The fitter was
// written and C27 found it exported and called by nothing. The two missing pieces were a sampler
// that turns this codebase's `SplineGeometry` into the point list it wants, and a caller.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  sampleSplineGeometry,
  splineEndTangents,
  convertSplineGeometryToArcs,
} from '@/lib/cad/geometry/spline-to-arc';
import type { SplineGeometry, Point2D } from '@/lib/cad/types';

/** One cubic bezier arcing from (0,0) to (100,0) with a bulge north. */
const ONE: SplineGeometry = {
  controlPoints: [
    { x: 0, y: 0 }, { x: 25, y: 50 }, { x: 75, y: 50 }, { x: 100, y: 0 },
  ],
  isClosed: false,
};

/** Two joined segments — an S. */
const TWO: SplineGeometry = {
  controlPoints: [
    { x: 0, y: 0 }, { x: 25, y: 50 }, { x: 75, y: 50 }, { x: 100, y: 0 },
    { x: 125, y: -50 }, { x: 175, y: -50 }, { x: 200, y: 0 },
  ],
  isClosed: false,
};

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

describe('sampling', () => {
  it('starts and ends on the curve’s own endpoints', () => {
    const pts = sampleSplineGeometry(ONE, 8);
    expect(dist(pts[0], { x: 0, y: 0 })).toBeLessThan(1e-12);
    expect(dist(pts[pts.length - 1], { x: 100, y: 0 })).toBeLessThan(1e-12);
  });

  it('shares the joint between segments instead of duplicating it', () => {
    // A duplicated vertex at the join is a zero-length chord, which every downstream fit and
    // shoelace has to special-case.
    const pts = sampleSplineGeometry(TWO, 4);
    expect(pts).toHaveLength(9); // 1 + 4 + 4
    for (let i = 1; i < pts.length; i += 1) {
      expect(dist(pts[i], pts[i - 1])).toBeGreaterThan(1e-9);
    }
  });

  it('matches the walk the DXF writer uses', () => {
    // A second, subtly different sampler would mean an exported DXF and a converted-in-place
    // spline disagreed about where the same curve is.
    const dxf = readFileSync(join(process.cwd(), 'lib/cad/delivery/dxf-writer.ts'), 'utf8');
    expect(dxf).toMatch(/for \(let i = 0; i \+ 3 < pts\.length; i \+= 3\)/);
    const src = readFileSync(join(process.cwd(), 'lib/cad/geometry/spline-to-arc.ts'), 'utf8');
    expect(src).toMatch(/for \(let i = 0; i \+ 3 < pts\.length; i \+= 3\)/);
  });

  it('refuses to degenerate below two samples per curve', () => {
    expect(sampleSplineGeometry(ONE, 0).length).toBeGreaterThanOrEqual(3);
  });

  it('returns nothing for too few control points', () => {
    expect(sampleSplineGeometry({ controlPoints: [{ x: 0, y: 0 }], isClosed: false })).toEqual([]);
  });
});

describe('end tangents', () => {
  it('come from the control legs, not from the sampled chords', () => {
    // The first and last control legs ARE the tangents of a cubic bezier — that is what the
    // handles mean. Estimating from the first sampled chord is only approximately tangent and gets
    // worse as sampling gets coarser.
    const t = splineEndTangents(ONE)!;
    const expected = Math.atan2(50, 25);
    expect(Math.atan2(t.start.y, t.start.x)).toBeCloseTo(expected, 9);
  });

  it('are unit vectors', () => {
    const t = splineEndTangents(ONE)!;
    expect(Math.hypot(t.start.x, t.start.y)).toBeCloseTo(1, 9);
    expect(Math.hypot(t.end.x, t.end.y)).toBeCloseTo(1, 9);
  });

  it('survive a handle pulled onto its anchor', () => {
    // Legal geometry, and a straight division by zero without the fallback.
    const degenerate: SplineGeometry = {
      controlPoints: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 75, y: 50 }, { x: 100, y: 0 }],
      isClosed: false,
    };
    const t = splineEndTangents(degenerate)!;
    expect(Number.isFinite(t.start.x) && Number.isFinite(t.start.y)).toBe(true);
    expect(Math.hypot(t.start.x, t.start.y)).toBeCloseTo(1, 9);
  });

  it('returns null when there is no bezier at all', () => {
    expect(splineEndTangents({ controlPoints: [{ x: 0, y: 0 }], isClosed: false })).toBeNull();
  });
});

describe('the whole conversion', () => {
  it('produces segments that start and end where the spline does', () => {
    const r = convertSplineGeometryToArcs(ONE)!;
    expect(r.segments.length).toBeGreaterThan(0);
    expect(dist(r.segments[0].start, { x: 0, y: 0 })).toBeLessThan(1e-9);
    expect(dist(r.segments[r.segments.length - 1].end, { x: 100, y: 0 })).toBeLessThan(1e-9);
  });

  it('joins end to end with no gaps', () => {
    // A gap is invisible on screen at drawing zoom and fatal in a deliverable, where the receiving
    // package treats the run as open.
    const r = convertSplineGeometryToArcs(TWO)!;
    for (let i = 1; i < r.segments.length; i += 1) {
      expect(dist(r.segments[i].start, r.segments[i - 1].end)).toBeLessThan(1e-9);
    }
  });

  it('holds the stated tolerance', () => {
    const r = convertSplineGeometryToArcs(ONE, { tolerance: 0.01 })!;
    expect(r.maxDeviation).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  it('a tighter tolerance costs more segments, never fewer', () => {
    const loose = convertSplineGeometryToArcs(TWO, { tolerance: 1 })!;
    const tight = convertSplineGeometryToArcs(TWO, { tolerance: 0.001 })!;
    expect(tight.segmentCount).toBeGreaterThanOrEqual(loose.segmentCount);
  });

  it('beats a polyline on entity count by a wide margin', () => {
    // The reason to do this at all. 24 samples per bezier over two beziers is 49 vertices; the fit
    // should need a small fraction of that.
    const r = convertSplineGeometryToArcs(TWO)!;
    expect(r.segmentCount).toBeLessThan(sampleSplineGeometry(TWO).length / 4);
  });

  it('every arc segment carries the centre and radius a caller needs', () => {
    const r = convertSplineGeometryToArcs(ONE)!;
    for (const s of r.segments) {
      if (s.type !== 'ARC') continue;
      expect(s.center).toBeDefined();
      expect(s.radius).toBeGreaterThan(0);
      // Both endpoints really are on the fitted circle — the check that catches a centre solved
      // from the wrong three points.
      expect(dist(s.start, s.center!)).toBeCloseTo(s.radius!, 6);
      expect(dist(s.end, s.center!)).toBeCloseTo(s.radius!, 6);
      expect(s.direction === 'CW' || s.direction === 'CCW').toBe(true);
    }
  });

  it('returns null rather than a degenerate line for an unfittable spline', () => {
    // So the caller can say why instead of dropping a single straight segment where a curve was.
    expect(convertSplineGeometryToArcs({ controlPoints: [{ x: 0, y: 0 }], isClosed: false })).toBeNull();
  });
});

describe('it is reachable', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/FeatureContextMenu.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('from the feature context menu', () => {
    expect(src).toMatch(/convertSplineGeometryToArcs/);
    expect(src).toMatch(/Convert spline to arcs…/);
  });

  it('and only on an actual spline', () => {
    // A greyed entry on every other feature would be noise on a menu this long.
    expect(src).toMatch(/const splineSelected = !!feature\?\.geometry\.spline/);
    expect(src).toMatch(/hidden: !splineSelected/);
    expect(src).toMatch(/if \(mi\.hidden\) return null/);
  });

  it('replaces the spline in ONE undo entry', () => {
    // A half-converted spline leaves the drawing holding neither the curve nor its arcs, and the
    // surveyor has to notice and press undo again.
    expect(src).toMatch(/makeBatchEntry\('Convert spline to arcs', ops\)/);
    expect(src).toMatch(/\{ type: 'REMOVE_FEATURE', data: f \}/);
  });

  it('keeps the layer and style of what it replaced', () => {
    // Converting must not also restyle. A curve that changes colour when it changes type looks
    // like two edits happened.
    expect(src).toMatch(/layerId: f\.layerId/);
    expect(src).toMatch(/style: \{ \.\.\.f\.style \}/);
  });

  it('records the deviation, because the fit is an approximation', () => {
    expect(src).toMatch(/outputs: { maxDeviation/);
    expect(src).toMatch(/max deviation/);
  });

  it('says so when the spline cannot be fitted', () => {
    // The C16 rule: a menu item that does nothing is worse than one that explains itself.
    expect(src).toMatch(/too few control points to fit/);
  });
});
