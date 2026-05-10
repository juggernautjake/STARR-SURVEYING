import { describe, it, expect } from 'vitest';
import { findLinkedFeatureIds } from '@/lib/cad/operations/find-linked-geometry';
import type { Feature } from '@/lib/cad/types';

const BASE_STYLE = {
  color: null,
  lineWeight: null,
  opacity: 1,
  lineTypeId: null,
  symbolId: null,
  symbolSize: null,
  symbolRotation: 0,
  labelVisible: null,
  labelFormat: null,
  labelOffset: { x: 0, y: 0 },
  isOverride: false,
} as const;

const point = (id: string, x: number, y: number): Feature => ({
  id,
  type: 'POINT',
  geometry: { type: 'POINT', point: { x, y } },
  layerId: 'L',
  style: BASE_STYLE,
  properties: {},
});

const line = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Feature => ({
  id,
  type: 'LINE',
  geometry: { type: 'LINE', start: a, end: b },
  layerId: 'L',
  style: BASE_STYLE,
  properties: {},
});

const polyline = (id: string, vertices: { x: number; y: number }[]): Feature => ({
  id,
  type: 'POLYLINE',
  geometry: { type: 'POLYLINE', vertices },
  layerId: 'L',
  style: BASE_STYLE,
  properties: {},
});

const polygon = (id: string, vertices: { x: number; y: number }[]): Feature => ({
  id,
  type: 'POLYGON',
  geometry: { type: 'POLYGON', vertices },
  layerId: 'L',
  style: BASE_STYLE,
  properties: {},
});

describe('findLinkedFeatureIds', () => {
  it('empty pick set yields empty result', () => {
    const features = [point('p1', 0, 0), line('l1', { x: 0, y: 0 }, { x: 10, y: 0 })];
    const linked = findLinkedFeatureIds(new Set<string>(), features);
    expect(linked).toEqual([]);
  });

  it('picking a single POINT returns lines and polylines anchored to it (when both endpoints match)', () => {
    const features = [
      point('p1', 0, 0),
      point('p2', 10, 0),
      line('l1', { x: 0, y: 0 }, { x: 10, y: 0 }),  // matches both
      line('l2', { x: 0, y: 0 }, { x: 99, y: 99 }), // only one endpoint matches
    ];
    const linked = findLinkedFeatureIds(new Set(['p1', 'p2']), features);
    expect(linked).toEqual(['l1']);
  });

  it('polygon with all vertices matching gets included', () => {
    const features = [
      point('p1', 0, 0),
      point('p2', 10, 0),
      point('p3', 10, 10),
      point('p4', 0, 10),
      polygon('poly1', [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ]),
    ];
    const linked = findLinkedFeatureIds(new Set(['p1', 'p2', 'p3', 'p4']), features);
    expect(linked).toEqual(['poly1']);
  });

  it('polygon with only some vertices matching is NOT included (strict rule)', () => {
    const features = [
      point('p1', 0, 0),
      point('p2', 10, 0),
      polygon('poly1', [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ]),
    ];
    const linked = findLinkedFeatureIds(new Set(['p1', 'p2']), features);
    expect(linked).toEqual([]);
  });

  it('arc with both endpoints matching picked POINTs gets included', () => {
    // CCW quarter arc from (10, 0) to (0, 10) centered at origin radius 10.
    const arcFeature: Feature = {
      id: 'arc1',
      type: 'ARC',
      geometry: {
        type: 'ARC',
        arc: {
          center: { x: 0, y: 0 },
          radius: 10,
          startAngle: 0,
          endAngle: Math.PI / 2,
          anticlockwise: true,
        },
      },
      layerId: 'L',
      style: BASE_STYLE,
      properties: {},
    };
    const features = [
      point('pStart', 10, 0),
      point('pEnd', 0, 10),
      arcFeature,
    ];
    const linked = findLinkedFeatureIds(new Set(['pStart', 'pEnd']), features);
    expect(linked).toEqual(['arc1']);
  });

  it('spline with first + last control points matching gets included; middle control points do not need to match', () => {
    const splineFeature: Feature = {
      id: 'sp1',
      type: 'SPLINE',
      geometry: {
        type: 'SPLINE',
        spline: {
          controlPoints: [
            { x: 0, y: 0 },        // matched
            { x: 5, y: 99 },       // unmatched — that's fine for handles
            { x: 8, y: 99 },       // unmatched — that's fine for handles
            { x: 10, y: 10 },      // matched
          ],
          isClosed: false,
        },
      },
      layerId: 'L',
      style: BASE_STYLE,
      properties: {},
    };
    const features = [
      point('pA', 0, 0),
      point('pB', 10, 10),
      splineFeature,
    ];
    const linked = findLinkedFeatureIds(new Set(['pA', 'pB']), features);
    expect(linked).toEqual(['sp1']);
  });

  it('eps tolerance handles tiny floating-point drift', () => {
    const features = [
      point('p1', 100, 200),
      line('l1', { x: 100.0001, y: 200.0001 }, { x: 100, y: 200 }),
    ];
    // 1e-4 drift is within the default 1e-3 tolerance.
    const linked = findLinkedFeatureIds(new Set(['p1']), features, { eps: 0.001 });
    // Only one endpoint matches p1; second endpoint also lands on p1 (same coord).
    // Both endpoints match the same picked POINT, so the line is included.
    expect(linked).toEqual(['l1']);
  });

  it('CIRCLE / ELLIPSE / TEXT / IMAGE never match', () => {
    const features: Feature[] = [
      point('p1', 0, 0),
      {
        id: 'c1', type: 'CIRCLE',
        geometry: { type: 'CIRCLE', circle: { center: { x: 0, y: 0 }, radius: 5 } },
        layerId: 'L', style: BASE_STYLE, properties: {},
      },
      {
        id: 'e1', type: 'ELLIPSE',
        geometry: { type: 'ELLIPSE', ellipse: { center: { x: 0, y: 0 }, radiusX: 5, radiusY: 3, rotation: 0 } },
        layerId: 'L', style: BASE_STYLE, properties: {},
      },
      {
        id: 't1', type: 'TEXT',
        geometry: { type: 'TEXT', point: { x: 0, y: 0 } },
        layerId: 'L', style: BASE_STYLE, properties: { text: 'hi' },
      },
    ];
    const linked = findLinkedFeatureIds(new Set(['p1']), features);
    expect(linked).toEqual([]);
  });

  it('mixed picks: lines + polygons share the same coordinate space', () => {
    const features = [
      point('p1', 0, 0),
      point('p2', 10, 0),
      point('p3', 10, 10),
      point('p4', 0, 10),
      line('l-side', { x: 0, y: 0 }, { x: 10, y: 0 }),
      polygon('poly-full', [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ]),
    ];
    const linked = findLinkedFeatureIds(new Set(['p1', 'p2', 'p3', 'p4']), features);
    expect(linked.sort()).toEqual(['l-side', 'poly-full']);
  });

  it('does not include picked features themselves (no self-loop)', () => {
    const features = [
      point('p1', 0, 0),
      point('p2', 10, 0),
      line('l1', { x: 0, y: 0 }, { x: 10, y: 0 }),
    ];
    // Even with l1 in the picked set, it's not "linked" to itself.
    const linked = findLinkedFeatureIds(new Set(['l1', 'p1', 'p2']), features);
    expect(linked).toEqual([]);
  });
});
