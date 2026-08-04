// __tests__/cad/ghost-preview.test.ts
//
// CAD_AUDIT S19c — the ghost outline a surveyor sees before committing a transform.
//
// Mirror, move, copy, flip, invert, rotate and scale all draw a faint preview of where the geometry
// will land. It covers **nine geometry types**, and until this extraction not one of them was
// tested — the function lived inside a 15,000-line `'use client'` component, and it read the
// viewport store, so testing a circle meant standing up a store and a renderer.
//
// It now takes `GraphicsLike` and `zoom`, which is what makes this file possible: hand it a
// recorder and read back what was drawn.

import { describe, it, expect } from 'vitest';
import { drawTransformedFeaturePreview } from '@/lib/cad/render/ghost-preview';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, Point2D, FeatureGeometry } from '@/lib/cad/types';
import type { GraphicsLike } from '@/lib/cad/geometry/curve-render';

/** Records every drawing call instead of rendering. */
function recorder() {
  const calls: string[] = [];
  const points: Array<{ x: number; y: number }> = [];
  const g: GraphicsLike = {
    lineStyle: () => { calls.push('lineStyle'); },
    beginFill: () => { calls.push('beginFill'); },
    endFill: () => { calls.push('endFill'); },
    moveTo: (x, y) => { calls.push('moveTo'); points.push({ x, y }); },
    lineTo: (x, y) => { calls.push('lineTo'); points.push({ x, y }); },
    arc: () => { calls.push('arc'); },
    bezierCurveTo: () => { calls.push('bezierCurveTo'); },
    quadraticCurveTo: () => { calls.push('quadraticCurveTo'); },
    closePath: () => { calls.push('closePath'); },
    drawCircle: (x, y, r) => { calls.push('drawCircle'); points.push({ x, y }); calls.push(`r=${r}`); },
    drawEllipse: () => { calls.push('drawEllipse'); },
    drawRect: () => { calls.push('drawRect'); },
    clear: () => { calls.push('clear'); },
  };
  return { g, calls, points };
}

/** Identity world→screen, so a drawn coordinate IS the world coordinate and assertions stay legible. */
const w2s = (wx: number, wy: number) => ({ sx: wx, sy: wy });

const feature = (geometry: FeatureGeometry): Feature => ({
  id: 'f1',
  type: 'LINE',
  geometry,
  layerId: 'L',
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: {},
});

/** Move everything 10 right, 20 up. */
const shift = (p: Point2D): Point2D => ({ x: p.x + 10, y: p.y + 20 });

describe('every geometry type draws something', () => {
  // The guard the rest of the file rests on. A type that silently draws nothing is invisible: the
  // surveyor sees no ghost and concludes the tool does not support that shape, which is exactly the
  // kind of gap that survives for months.
  const cases: Array<[string, FeatureGeometry]> = [
    ['POINT', { type: 'POINT', point: { x: 1, y: 2 } }],
    ['LINE', { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 5, y: 5 } }],
    ['POLYLINE', { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }] }],
    ['POLYGON', { type: 'POLYGON', vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] }],
    ['CIRCLE', { type: 'CIRCLE', circle: { center: { x: 3, y: 3 }, radius: 7 } }],
    ['ELLIPSE', { type: 'ELLIPSE', ellipse: { center: { x: 0, y: 0 }, radiusX: 4, radiusY: 2, rotation: 0 } }],
    ['ARC', { type: 'ARC', arc: { center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: false } }],
    ['MIXED_GEOMETRY', { type: 'MIXED_GEOMETRY', vertices: [{ x: 0, y: 0 }, { x: 2, y: 2 }] }],
  ] as Array<[string, FeatureGeometry]>;

  for (const [name, geometry] of cases) {
    it(`${name} emits drawing calls`, () => {
      const { g, calls } = recorder();
      drawTransformedFeaturePreview(g, feature(geometry), shift, w2s, 1);
      expect(calls.length, `${name} drew nothing — the ghost would simply not appear`).toBeGreaterThan(0);
    });
  }
});

describe('the ghost is drawn TRANSFORMED, not where the feature already is', () => {
  it('a line is offset by the transform', () => {
    // The whole point of a preview. Drawing the untransformed geometry would show the surveyor
    // exactly what is already on screen and look like the tool doing nothing.
    const { g, points } = recorder();
    drawTransformedFeaturePreview(
      g, feature({ type: 'LINE', start: { x: 0, y: 0 }, end: { x: 5, y: 5 } }), shift, w2s, 1,
    );
    expect(points[0]).toEqual({ x: 10, y: 20 });
    expect(points[1]).toEqual({ x: 15, y: 25 });
  });

  it('the identity transform draws it exactly where it is', () => {
    // Used by the rotate-grab path, which ghosts the ORIGINAL outline while the real geometry spins.
    const { g, points } = recorder();
    drawTransformedFeaturePreview(
      g, feature({ type: 'LINE', start: { x: 1, y: 2 }, end: { x: 3, y: 4 } }), (p) => p, w2s, 1,
    );
    expect(points).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });
});

describe('a polygon closes and a polyline does not', () => {
  // Same vertices, different shapes. If a polygon did not close, the ghost would show an open figure
  // and a surveyor would reasonably read that as the transform breaking their boundary.
  const vertices = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];

  it('the polygon returns to its first point', () => {
    const { g, points } = recorder();
    drawTransformedFeaturePreview(g, feature({ type: 'POLYGON', vertices }), (p) => p, w2s, 1);
    expect(points[points.length - 1]).toEqual(points[0]);
  });

  it('the polyline does not', () => {
    const { g, points } = recorder();
    drawTransformedFeaturePreview(g, feature({ type: 'POLYLINE', vertices }), (p) => p, w2s, 1);
    expect(points[points.length - 1]).not.toEqual(points[0]);
  });
});

describe('zoom is a parameter, and it is used', () => {
  it('a circle ghost grows with zoom', () => {
    // It read `useViewportStore.getState().zoom` before the extraction. Passing it in is not
    // cosmetic: a radius is a WORLD length and the ghost is drawn in SCREEN pixels, so a helper that
    // cannot see the zoom draws the wrong size at every zoom but 1.
    const at1 = recorder();
    drawTransformedFeaturePreview(
      at1.g, feature({ type: 'CIRCLE', circle: { center: { x: 0, y: 0 }, radius: 10 } }), (p) => p, w2s, 1,
    );
    const at4 = recorder();
    drawTransformedFeaturePreview(
      at4.g, feature({ type: 'CIRCLE', circle: { center: { x: 0, y: 0 }, radius: 10 } }), (p) => p, w2s, 4,
    );
    expect(at1.calls).toContain('r=10');
    expect(at4.calls).toContain('r=40');
  });

  it('reaches into no store at all', () => {
    // The property that makes this file possible. Asserted on the source because the alternative —
    // a store read that happens to work in a test — is exactly what hid this function from testing.
    const src = require('node:fs').readFileSync('lib/cad/render/ghost-preview.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).not.toMatch(/useViewportStore|useDrawingStore|useToolStore/);
  });
});
