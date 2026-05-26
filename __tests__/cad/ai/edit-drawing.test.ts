// __tests__/cad/ai/edit-drawing.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useSelectionStore } from '@/lib/cad/store/selection-store';
import { applyEditDrawing } from '@/lib/cad/store/ai-conversations-store';
import type { Layer } from '@/lib/cad/types';

function addLayer(id: string) {
  const layer: Layer = {
    id, name: id, visible: true, locked: false, frozen: false,
    color: '#000000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
  };
  useDrawingStore.getState().addLayer(layer);
  useDrawingStore.getState().setActiveLayer(id);
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  useSelectionStore.getState().deselectAll();
  addLayer('L');
});

describe('applyEditDrawing', () => {
  it('adds a POLYGON from northing/easting coords (origin-aware)', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'square',
      add: [{ shape: 'POLYGON', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 },
        { northing: 10, easting: 10 }, { northing: 10, easting: 0 },
      ] }],
    });
    const feats = useDrawingStore.getState().getAllFeatures();
    expect(feats).toHaveLength(1);
    expect(feats[0].type).toBe('POLYGON');
    // easting→x, northing→y
    expect(feats[0].geometry.vertices).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ]);
  });

  it('honors color + opacity on a created shape', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'c',
      add: [{ shape: 'CIRCLE', points: [{ northing: 5, easting: 5 }], radius: 3, color: '#ff0000', opacity: 0.5 }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.type).toBe('CIRCLE');
    expect(f.geometry.circle).toMatchObject({ center: { x: 5, y: 5 }, radius: 3 });
    expect(f.style.color).toBe('#ff0000');
    expect(f.style.opacity).toBe(0.5);
  });

  it('builds a smooth closed SPLINE', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 's',
      add: [{ shape: 'SPLINE', closed: true, points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 },
        { northing: 10, easting: 10 }, { northing: 10, easting: 0 },
      ] }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.type).toBe('SPLINE');
    expect(f.geometry.spline?.isClosed).toBe(true);
    // closed fit → 1 + 3*4 = 13 control points
    expect(f.geometry.spline?.controlPoints).toHaveLength(13);
  });

  it('deletes features by id and clears them from the selection', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 1, easting: 2 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    useSelectionStore.getState().select(id, 'ADD');
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'del', deleteIds: [id] });
    expect(useDrawingStore.getState().getAllFeatures()).toHaveLength(0);
    expect(useSelectionStore.getState().selectedIds.has(id)).toBe(false);
  });

  it('translates a feature by north/east feet', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 0, easting: 0 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'mv', transform: { ids: [id], translate: { north: 5, east: 3 } } });
    const f = useDrawingStore.getState().getFeature(id)!;
    expect(f.geometry.point).toEqual({ x: 3, y: 5 });
  });
});
