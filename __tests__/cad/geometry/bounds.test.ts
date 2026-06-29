// __tests__/cad/geometry/bounds.test.ts
//
// Coverage for the CAD `bounds` module — `computeBounds`,
// `featureBounds`, `computeFeaturesBounds`, `expandBounds`. These feed
// the LOD culler, the snap engine, the SAVE-fit-to-window helper, the
// printing extent, and the "centre on selection" UI. A wrong value
// here typically shows up as "feature disappears" or "fit-to-window
// zooms past the data" — both immediately visible to the surveyor.

import { describe, it, expect } from 'vitest';
import {
  computeBounds,
  featureBounds,
  computeFeaturesBounds,
  expandBounds,
} from '@/lib/cad/geometry/bounds';
import type { Feature } from '@/lib/cad/types';

const point = (x: number, y: number) => ({ x, y });
const feat = (id: string, geometry: Feature['geometry']): Feature =>
  ({ id, layerId: 'L', geometry, style: {} } as unknown as Feature);

describe('computeBounds', () => {
  it('returns 0-bbox for an empty point list', () => {
    expect(computeBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('returns a single point as a degenerate (min===max) bbox', () => {
    expect(computeBounds([point(5, 7)])).toEqual({ minX: 5, minY: 7, maxX: 5, maxY: 7 });
  });

  it('correctly wraps a multi-point set', () => {
    expect(computeBounds([point(0, 0), point(10, 20), point(-5, 15)]))
      .toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 });
  });
});

describe('featureBounds — geometry types', () => {
  it('POINT', () => {
    expect(featureBounds(feat('p', { type: 'POINT', point: point(3, 4) } as Feature['geometry'])))
      .toEqual({ minX: 3, minY: 4, maxX: 3, maxY: 4 });
  });

  it('LINE', () => {
    expect(featureBounds(feat('l', { type: 'LINE', start: point(0, 0), end: point(10, 5) } as Feature['geometry'])))
      .toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it('POLYLINE / POLYGON from vertices', () => {
    expect(featureBounds(feat('pl', {
      type: 'POLYLINE',
      vertices: [point(0, 0), point(10, 5), point(5, 10)],
    } as Feature['geometry']))).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('CIRCLE — bbox is centre ± radius', () => {
    expect(featureBounds(feat('c', {
      type: 'CIRCLE',
      circle: { center: point(10, 10), radius: 5 },
    } as Feature['geometry']))).toEqual({ minX: 5, minY: 5, maxX: 15, maxY: 15 });
  });

  it('ELLIPSE — axis-aligned bbox matches radiusX / radiusY when rotation is 0', () => {
    const b = featureBounds(feat('e', {
      type: 'ELLIPSE',
      ellipse: { center: point(0, 0), radiusX: 10, radiusY: 5, rotation: 0 },
    } as Feature['geometry']));
    expect(b.minX).toBeCloseTo(-10, 8);
    expect(b.maxX).toBeCloseTo(10, 8);
    expect(b.minY).toBeCloseTo(-5, 8);
    expect(b.maxY).toBeCloseTo(5, 8);
  });

  it('ELLIPSE — 90° rotation swaps x/y extents', () => {
    const b = featureBounds(feat('e', {
      type: 'ELLIPSE',
      ellipse: { center: point(0, 0), radiusX: 10, radiusY: 5, rotation: Math.PI / 2 },
    } as Feature['geometry']));
    expect(b.maxX).toBeCloseTo(5, 8);
    expect(b.maxY).toBeCloseTo(10, 8);
  });

  it('ARC uses the conservative full-circle bbox', () => {
    // (Tight arc bbox requires checking quadrant crossings — the
    // conservative call avoids that complexity.)
    expect(featureBounds(feat('a', {
      type: 'ARC',
      arc: { center: point(10, 10), radius: 5, startAngle: 0, endAngle: Math.PI, anticlockwise: false },
    } as Feature['geometry']))).toEqual({ minX: 5, minY: 5, maxX: 15, maxY: 15 });
  });

  it('SPLINE uses the control-point bbox', () => {
    expect(featureBounds(feat('s', {
      type: 'SPLINE',
      spline: { controlPoints: [point(0, 0), point(5, 10), point(10, 0)] },
    } as Feature['geometry']))).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('IMAGE — unrotated bbox is position + width/height', () => {
    expect(featureBounds(feat('i', {
      type: 'IMAGE',
      image: { position: point(2, 3), width: 100, height: 50, rotation: 0 },
    } as Feature['geometry']))).toEqual({ minX: 2, minY: 3, maxX: 102, maxY: 53 });
  });

  it('IMAGE — rotated bbox uses the rotated corners, not the naive box', () => {
    // 90° CCW about the bottom-left anchor: a 100×50 image at (0,0) sweeps
    // into x∈[-50,0], y∈[0,100]. The old naive bbox would have wrongly
    // reported x∈[0,100], y∈[0,50] — the bug that made rotated images
    // un-grabbable when zoomed in.
    const bb = featureBounds(feat('i', {
      type: 'IMAGE',
      image: { position: point(0, 0), width: 100, height: 50, rotation: Math.PI / 2 },
    } as Feature['geometry']));
    expect(bb.minX).toBeCloseTo(-50);
    expect(bb.maxX).toBeCloseTo(0);
    expect(bb.minY).toBeCloseTo(0);
    expect(bb.maxY).toBeCloseTo(100);
  });

  it('TEXT uses the anchor point as a degenerate bbox', () => {
    expect(featureBounds(feat('t', {
      type: 'TEXT',
      point: point(7, 8),
    } as Feature['geometry']))).toEqual({ minX: 7, minY: 8, maxX: 7, maxY: 8 });
  });
});

describe('computeFeaturesBounds', () => {
  it('returns null for an empty feature list', () => {
    expect(computeFeaturesBounds([])).toBeNull();
  });

  it('unions the bboxes of multiple features', () => {
    const f1 = feat('p1', { type: 'POINT', point: point(0, 0) } as Feature['geometry']);
    const f2 = feat('p2', { type: 'POINT', point: point(10, 10) } as Feature['geometry']);
    expect(computeFeaturesBounds([f1, f2])).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe('expandBounds', () => {
  it('adds the margin on all four sides', () => {
    expect(expandBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 2))
      .toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 });
  });

  it('accepts a negative margin (shrink) — caller responsibility', () => {
    // Documented as "expand", but a negative number just inverts the math.
    expect(expandBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, -1))
      .toEqual({ minX: 1, minY: 1, maxX: 9, maxY: 9 });
  });
});
