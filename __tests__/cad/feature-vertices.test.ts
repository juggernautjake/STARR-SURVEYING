// __tests__/cad/feature-vertices.test.ts
//
// cad-layer-grouping-and-context-menus Slice 1 — pure helper for
// the LayerPanel's expandable polygon-row UI.

import { describe, it, expect } from 'vitest';
import type { Feature } from '@/lib/cad/types';
import { formatFeatureVertices, isExpandableFeature } from '@/lib/cad/feature-vertices';

const polygon = (verts: Array<{ x: number; y: number }>, type: 'POLYGON' | 'POLYLINE' = 'POLYGON'): Feature => ({
  id: 'f1',
  type,
  geometry: { type, vertices: verts },
  properties: {},
  style: {} as Feature['style'],
  layerId: null,
} as unknown as Feature);

describe('formatFeatureVertices', () => {
  it('renders one display string per vertex with 1-decimal coords', () => {
    const f = polygon([{ x: 0, y: 0 }, { x: 10.234, y: -5.6 }, { x: 100, y: 50 }]);
    expect(formatFeatureVertices(f)).toEqual([
      'v1 — (0.0, 0.0)',
      'v2 — (10.2, -5.6)',
      'v3 — (100.0, 50.0)',
    ]);
  });

  it('works for POLYLINE the same as POLYGON', () => {
    const f = polygon([{ x: 1, y: 2 }, { x: 3, y: 4 }], 'POLYLINE');
    expect(formatFeatureVertices(f)).toEqual(['v1 — (1.0, 2.0)', 'v2 — (3.0, 4.0)']);
  });

  it('returns [] for a POINT / LINE / TEXT (non-polygonal) feature', () => {
    const point: Feature = { id: 'p1', type: 'POINT', geometry: { type: 'POINT' }, properties: {}, style: {} as Feature['style'], layerId: null } as unknown as Feature;
    expect(formatFeatureVertices(point)).toEqual([]);
  });

  it('returns [] for a POLYGON with no vertex array', () => {
    const empty: Feature = { id: 'e1', type: 'POLYGON', geometry: { type: 'POLYGON' }, properties: {}, style: {} as Feature['style'], layerId: null } as unknown as Feature;
    expect(formatFeatureVertices(empty)).toEqual([]);
  });
});

describe('isExpandableFeature', () => {
  it('true for POLYGON / POLYLINE with vertices', () => {
    expect(isExpandableFeature(polygon([{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toBe(true);
    expect(isExpandableFeature(polygon([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'POLYLINE'))).toBe(true);
  });

  it('false for POINT / LINE / TEXT', () => {
    const point: Feature = { id: 'p1', type: 'POINT', geometry: { type: 'POINT' }, properties: {}, style: {} as Feature['style'], layerId: null } as unknown as Feature;
    expect(isExpandableFeature(point)).toBe(false);
  });

  it('false for a vertex-less POLYGON', () => {
    const empty: Feature = { id: 'e1', type: 'POLYGON', geometry: { type: 'POLYGON' }, properties: {}, style: {} as Feature['style'], layerId: null } as unknown as Feature;
    expect(isExpandableFeature(empty)).toBe(false);
  });
});
