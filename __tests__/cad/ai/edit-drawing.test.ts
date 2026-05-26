// __tests__/cad/ai/edit-drawing.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useSelectionStore } from '@/lib/cad/store/selection-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
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

  it('fits a best-fit rectangle to selected pillar points and deletes the shots', () => {
    // Three shots roughly on a rotated square corner set.
    const shots = [
      { northing: 0, easting: 0 },
      { northing: 0, easting: 8 },
      { northing: 8, easting: 8 },
    ];
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'shots',
      add: shots.map((s) => ({ shape: 'POINT' as const, points: [s] })),
    });
    const ids = useDrawingStore.getState().getAllFeatures().map((f) => f.id);
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'fit square',
      fit: [{ shape: 'RECTANGLE', fromIds: ids, deleteSource: true }],
    });
    const feats = useDrawingStore.getState().getAllFeatures();
    // The 3 points are gone, replaced by one polygon rectangle.
    expect(feats).toHaveLength(1);
    expect(feats[0].type).toBe('POLYGON');
    expect(feats[0].geometry.vertices).toHaveLength(4);
  });

  it('fits a smooth closed CURVE through a point set', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'pond',
      fit: [{ shape: 'CURVE', closed: true, points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 },
        { northing: 10, easting: 10 }, { northing: 10, easting: 0 },
      ] }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.type).toBe('SPLINE');
    expect(f.geometry.spline?.isClosed).toBe(true);
    expect(f.geometry.spline?.controlPoints).toHaveLength(13); // 1 + 3*4
  });

  it('auto-creates a layer named on add and places the feature there', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'house',
      add: [{ shape: 'POLYGON', layerName: 'STRUCTURES', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 5 }, { northing: 5, easting: 5 },
      ] }],
    });
    const doc = useDrawingStore.getState().document;
    const layer = Object.values(doc.layers).find((l) => l.name === 'STRUCTURES');
    expect(layer).toBeDefined();
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.layerId).toBe(layer!.id);
  });

  it('creates explicit layers with color', () => {
    const summary = applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'layers',
      createLayers: [{ name: 'FENCE', color: '#E67E22' }],
    });
    const layer = Object.values(useDrawingStore.getState().document.layers).find((l) => l.name === 'FENCE');
    expect(layer?.color).toBe('#E67E22');
    expect(summary).toContain('created 1 layer');
  });

  it('places a TEXT label at a point', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'label',
      add: [{ shape: 'TEXT', text: 'N 45°00\'00" E  50.00\'', points: [{ northing: 20, easting: 15 }] }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.type).toBe('TEXT');
    expect(f.geometry.textContent).toContain('50.00');
    expect(f.geometry.point).toEqual({ x: 15, y: 20 });
  });

  it('sets a line type on a created feature and on modify', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'fence',
      add: [{ shape: 'POLYLINE', lineType: 'FENCE_BARBED_WIRE', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 20 },
      ] }],
    });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    expect(useDrawingStore.getState().getFeature(id)!.style.lineTypeId).toBe('FENCE_BARBED_WIRE');
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'restyle', modify: [{ id, lineType: 'DASHED' }] });
    expect(useDrawingStore.getState().getFeature(id)!.style.lineTypeId).toBe('DASHED');
  });

  it('skips degenerate geometry (zero-length line, zero-area polygon) and reports it', () => {
    const summary = applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'mixed',
      add: [
        { shape: 'LINE', points: [{ northing: 5, easting: 5 }, { northing: 5, easting: 5 }] }, // zero length
        { shape: 'POLYGON', points: [{ northing: 0, easting: 0 }, { northing: 0, easting: 10 }, { northing: 0, easting: 20 }] }, // collinear → 0 area
        { shape: 'LINE', points: [{ northing: 0, easting: 0 }, { northing: 0, easting: 10 }] }, // valid
      ],
    });
    const feats = useDrawingStore.getState().getAllFeatures();
    expect(feats).toHaveLength(1);           // only the valid line
    expect(feats[0].type).toBe('LINE');
    expect(summary).toContain('skipped 2');
  });

  it('selects the features it just created (for iterative refinement)', () => {
    useSelectionStore.getState().deselectAll();
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'two',
      add: [
        { shape: 'POINT', points: [{ northing: 1, easting: 1 }] },
        { shape: 'POINT', points: [{ northing: 2, easting: 2 }] },
      ],
    });
    const ids = useDrawingStore.getState().getAllFeatures().map((f) => f.id);
    const sel = useSelectionStore.getState().selectedIds;
    expect(sel.size).toBe(2);
    for (const id of ids) expect(sel.has(id)).toBe(true);
  });

  it('rotates 90° CCW about an explicit pivot', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 0, easting: 10 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'rot',
      transform: { ids: [id], rotateDeg: 90, about: { northing: 0, easting: 0 } },
    });
    const f = useDrawingStore.getState().getFeature(id)!;
    // world {x:10,y:0} rotated +90° about origin → {x:0,y:10}
    expect(f.geometry.point!.x).toBeCloseTo(0, 6);
    expect(f.geometry.point!.y).toBeCloseTo(10, 6);
  });

  it('scales 2× about the selection centroid', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'line',
      add: [{ shape: 'LINE', points: [{ northing: 0, easting: 0 }, { northing: 0, easting: 10 }] }],
    });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'scale', transform: { ids: [id], scale: 2, about: 'CENTROID' } });
    const g = useDrawingStore.getState().getFeature(id)!.geometry;
    // centroid x=5; start 0→-5, end 10→15
    expect(g.start!.x).toBeCloseTo(-5, 6);
    expect(g.end!.x).toBeCloseTo(15, 6);
  });

  it('reshapes a spline via modify (control points recomputed)', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 's',
      add: [{ shape: 'SPLINE', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 }, { northing: 5, easting: 5 },
      ] }],
    });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    expect(useDrawingStore.getState().getFeature(id)!.geometry.spline!.controlPoints).toHaveLength(7); // 1 + 3*2
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'reshape',
      modify: [{ id, points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 },
        { northing: 10, easting: 10 }, { northing: 10, easting: 0 },
      ] }],
    });
    expect(useDrawingStore.getState().getFeature(id)!.geometry.spline!.controlPoints).toHaveLength(10); // 1 + 3*3
  });

  it('applies add+delete as ONE undoable batch that fully reverts', () => {
    useUndoStore.getState().clear();
    // Seed a point directly (not via AI) so it pre-exists.
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'seed', add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }] }] });
    const seedId = useDrawingStore.getState().getAllFeatures()[0].id;

    // One AI action: add a polygon AND delete the seed point.
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'swap',
      add: [{ shape: 'POLYGON', points: [{ northing: 0, easting: 0 }, { northing: 0, easting: 5 }, { northing: 5, easting: 5 }] }],
      deleteIds: [seedId],
    });
    let feats = useDrawingStore.getState().getAllFeatures();
    expect(feats).toHaveLength(1);
    expect(feats[0].type).toBe('POLYGON');

    // A single undo restores the seed point and removes the polygon.
    useUndoStore.getState().undo();
    feats = useDrawingStore.getState().getAllFeatures();
    expect(feats).toHaveLength(1);
    expect(feats[0].id).toBe(seedId);
    expect(feats[0].type).toBe('POINT');
  });

  it('sets an area fill on a closed shape (add) and via modify', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'filled',
      add: [{ shape: 'POLYGON', fill: '#000000', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 }, { northing: 10, easting: 5 },
      ] }],
    });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    expect(useDrawingStore.getState().getFeature(id)!.style.fillColor).toBe('#000000');
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'recolor', modify: [{ id, fill: '#ffcc00' }] });
    expect(useDrawingStore.getState().getFeature(id)!.style.fillColor).toBe('#ffcc00');
  });

  it('assigns a point symbol on add and via modify', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'pole',
      add: [{ shape: 'POINT', symbol: 'UTIL_POLE', points: [{ northing: 3, easting: 4 }] }],
    });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    expect(useDrawingStore.getState().getFeature(id)!.style.symbolId).toBe('UTIL_POLE');
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'tree', modify: [{ id, symbol: 'VEG_TREE_DECID' }] });
    expect(useDrawingStore.getState().getFeature(id)!.style.symbolId).toBe('VEG_TREE_DECID');
  });

  it('skips a no-op (identity) transform without touching the feature', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 7, easting: 8 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    const before = JSON.stringify(useDrawingStore.getState().getFeature(id)!.geometry);
    useUndoStore.getState().clear();
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'noop', transform: { ids: [id] } });
    expect(JSON.stringify(useDrawingStore.getState().getFeature(id)!.geometry)).toBe(before);
    expect(useUndoStore.getState().canUndo()).toBe(false); // no junk undo entry
  });

  it('skips a fit when source points are coincident or insufficient', () => {
    // Coincident points → degenerate LINE → skipped.
    const s1 = applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'badline',
      fit: [{ shape: 'LINE', points: [{ northing: 5, easting: 5 }, { northing: 5, easting: 5 }] }],
    });
    expect(useDrawingStore.getState().getAllFeatures()).toHaveLength(0);
    expect(s1).toMatch(/No valid|skipped/);

    // Single source point for a RECTANGLE → insufficient → skipped.
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'badrect', fit: [{ shape: 'RECTANGLE', fromIds: [id] }] });
    // still just the one point — no rectangle created
    expect(useDrawingStore.getState().getAllFeatures().filter((f) => f.type === 'POLYGON')).toHaveLength(0);
  });

  it('translates a feature by north/east feet', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 0, easting: 0 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'mv', transform: { ids: [id], translate: { north: 5, east: 3 } } });
    const f = useDrawingStore.getState().getFeature(id)!;
    expect(f.geometry.point).toEqual({ x: 3, y: 5 });
  });
});
