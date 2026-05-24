import { describe, it, expect, beforeEach } from 'vitest';
import { deleteSegmentAt } from '@/lib/cad/operations';
import { useDrawingStore } from '@/lib/cad/store';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, Point2D } from '@/lib/cad/types';

function poly(id: string, type: 'POLYLINE' | 'POLYGON', verts: Point2D[]): Feature {
  return {
    id,
    type,
    geometry: { type, vertices: verts },
    layerId: 'L',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: {},
  };
}

function vertsOf(f: Feature): Array<[number, number]> {
  return (f.geometry.vertices ?? []).map((v) => [v.x, v.y]);
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
});

describe('deleteSegmentAt', () => {
  it('splits a polyline into two runs when a middle segment is deleted', () => {
    const f = poly('p1', 'POLYLINE', [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 },
    ]);
    useDrawingStore.getState().addFeature(f);
    const ok = deleteSegmentAt('p1', { x: 15, y: 0 }); // segment v1–v2
    expect(ok).toBe(true);
    const polylines = useDrawingStore.getState().getAllFeatures().filter((x) => x.type === 'POLYLINE');
    expect(polylines.length).toBe(2);
    const sets = polylines.map(vertsOf).sort((a, b) => a[0][0] - b[0][0]);
    expect(sets[0]).toEqual([[0, 0], [10, 0]]);
    expect(sets[1]).toEqual([[20, 0], [30, 0]]);
    expect(useDrawingStore.getState().getFeature('p1')).toBeUndefined();
  });

  it('drops the end run (keeps one polyline) when the last segment is deleted', () => {
    useDrawingStore.getState().addFeature(poly('p2', 'POLYLINE', [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
    ]));
    deleteSegmentAt('p2', { x: 18, y: 0 }); // last segment v1–v2
    const polylines = useDrawingStore.getState().getAllFeatures().filter((x) => x.type === 'POLYLINE');
    expect(polylines.length).toBe(1);
    expect(vertsOf(polylines[0])).toEqual([[0, 0], [10, 0]]);
  });

  it('opens a polygon into one polyline at the deleted edge', () => {
    useDrawingStore.getState().addFeature(poly('pg', 'POLYGON', [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ]));
    deleteSegmentAt('pg', { x: 5, y: 0 }); // edge v0–v1
    const all = useDrawingStore.getState().getAllFeatures();
    const polylines = all.filter((x) => x.type === 'POLYLINE');
    expect(all.filter((x) => x.type === 'POLYGON').length).toBe(0);
    expect(polylines.length).toBe(1);
    // Walks from the far endpoint of the cut around to the near one.
    expect(vertsOf(polylines[0])).toEqual([[10, 0], [10, 10], [0, 10], [0, 0]]);
  });
});
