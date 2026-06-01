// __tests__/cad/ai/edit-drawing.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useSelectionStore } from '@/lib/cad/store/selection-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
import { applyEditDrawing } from '@/lib/cad/store/ai-conversations-store';
import { parseAction } from '@/lib/cad/ai-engine/drawing-chat';
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
    // cad-trv-import-polish Slice 2 — default starting layers
    // now seed every new drawing, including a `Structures` layer
    // (id `STRUCTURES`). The AI's case-insensitive name matcher
    // routes `STRUCTURES` to it, so we look up by id here.
    const layer = doc.layers['STRUCTURES'] ?? Object.values(doc.layers).find((l) => l.name.toLowerCase() === 'structures');
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

  it('moves a feature to another layer via modify', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'move', modify: [{ id, layerName: 'CONTROL' }] });
    const doc = useDrawingStore.getState().document;
    const target = Object.values(doc.layers).find((l) => l.name === 'CONTROL');
    expect(target).toBeDefined();
    expect(useDrawingStore.getState().getFeature(id)!.layerId).toBe(target!.id);
  });

  it('hides and unhides features non-destructively', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'hide', hideIds: [id] });
    expect(useDrawingStore.getState().getFeature(id)!.hidden).toBe(true);
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'show', unhideIds: [id] });
    expect(useDrawingStore.getState().getFeature(id)!.hidden).toBe(false);
  });

  it('applies a complex multi-op action atomically with one undo', () => {
    useUndoStore.getState().clear();
    // Seed two points: one to keep+hide, one to delete.
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'seed', add: [
      { shape: 'POINT', points: [{ northing: 1, easting: 1 }] },
      { shape: 'POINT', points: [{ northing: 2, easting: 2 }] },
    ] });
    const [keepId, delId] = useDrawingStore.getState().getAllFeatures().map((f) => f.id);
    useUndoStore.getState().clear();

    const summary = applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'complex',
      createLayers: [{ name: 'FENCE', color: '#E67E22' }],
      add: [{ shape: 'POLYGON', layerName: 'FENCE', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 5 }, { northing: 5, easting: 5 },
      ] }],
      hideIds: [keepId],
      deleteIds: [delId],
    });

    const ds = useDrawingStore.getState();
    expect(summary).toMatch(/added 1/);
    expect(Object.values(ds.document.layers).some((l) => l.name === 'FENCE')).toBe(true);
    expect(ds.getFeature(keepId)!.hidden).toBe(true);
    expect(ds.getFeature(delId)).toBeUndefined();
    expect(ds.getAllFeatures().some((f) => f.type === 'POLYGON')).toBe(true);

    // One undo reverts the geometry ops (polygon gone, deleted point back,
    // hidden point shown). The layer is non-undoable and remains.
    useUndoStore.getState().undo();
    const after = useDrawingStore.getState();
    expect(after.getAllFeatures().some((f) => f.type === 'POLYGON')).toBe(false);
    expect(after.getFeature(delId)).toBeDefined();
    expect(after.getFeature(keepId)!.hidden).toBe(false);
  });

  it('end-to-end: raw model JSON → parseAction → applyEditDrawing', () => {
    // Exactly what the model emits (untyped JSON), through the real parse +
    // execute path (no network).
    const raw = {
      type: 'EDIT_DRAWING',
      description: 'house from corners',
      createLayers: [{ name: 'STRUCTURES', color: '#7F8C8D' }],
      add: [{
        shape: 'POLYGON', layerName: 'STRUCTURES', fill: '#dddddd',
        points: [
          { northing: 0, easting: 0 }, { northing: 0, easting: 20 },
          { northing: 15, easting: 20 }, { northing: 15, easting: 0 },
          // a bogus coord that the parser must drop:
          { northing: 'x', easting: 1 },
        ],
      }],
      // unknown junk fields the parser must ignore:
      nonsense: true,
    };
    const action = parseAction(raw);
    expect(action).not.toBeNull();
    const summary = applyEditDrawing(action!);
    expect(summary).toContain('added 1');
    const doc = useDrawingStore.getState().document;
    // cad-trv-import-polish Slice 2 — default starting layers
    // now seed every new drawing, including a `Structures` layer
    // (id `STRUCTURES`). The AI's case-insensitive name matcher
    // routes `STRUCTURES` to it, so we look up by id here.
    const layer = doc.layers['STRUCTURES'] ?? Object.values(doc.layers).find((l) => l.name.toLowerCase() === 'structures');
    const poly = useDrawingStore.getState().getAllFeatures().find((f) => f.type === 'POLYGON')!;
    expect(poly.layerId).toBe(layer!.id);
    expect(poly.style.fillColor).toBe('#dddddd');
    expect(poly.geometry.vertices).toHaveLength(4); // bogus coord dropped
  });

  it('sets elevation on a created point', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'pt',
      add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }], elevation: 642.5, pointNumber: '10' }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.properties.elevation).toBe(642.5);
    expect(f.properties.pointNumber).toBe('10');
  });

  it('edits point survey attributes via modify (recode + elevation + renumber)', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'pt',
      add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }], pointNumber: '12', code: 'TMP' }],
    });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'recode',
      modify: [{ id, code: 'IP', elevation: 642, pointNumber: '100', description: 'iron pin' }],
    });
    const p = useDrawingStore.getState().getFeature(id)!.properties;
    expect(p.code).toBe('IP');
    expect(p.elevation).toBe(642);
    expect(p.pointNumber).toBe('100');
    expect(p.description).toBe('iron pin');
  });

  it('reverts a multi-aspect modify (attrs + layer) in one undo', () => {
    useUndoStore.getState().clear();
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'pt',
      add: [{ shape: 'POINT', points: [{ northing: 1, easting: 1 }], code: 'TMP' }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    const origLayer = useDrawingStore.getState().getFeature(id)!.layerId;
    useUndoStore.getState().clear();

    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'edit',
      modify: [{ id, code: 'IP', elevation: 642, layerName: 'CONTROL' }] });
    const mid = useDrawingStore.getState().getFeature(id)!;
    expect(mid.properties.code).toBe('IP');
    expect(mid.layerId).not.toBe(origLayer);

    useUndoStore.getState().undo();
    const back = useDrawingStore.getState().getFeature(id)!;
    expect(back.properties.code).toBe('TMP');
    expect(back.properties.elevation).toBeUndefined();
    expect(back.layerId).toBe(origLayer);
  });

  it('treats a closed POLYLINE as a POLYGON', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'closed',
      add: [{ shape: 'POLYLINE', closed: true, points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 }, { northing: 10, easting: 5 },
      ] }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.type).toBe('POLYGON');
    expect(f.geometry.vertices).toHaveLength(3);
  });

  it('transforms a circle: translate moves center, keeps radius; scale grows radius', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'c',
      add: [{ shape: 'CIRCLE', points: [{ northing: 10, easting: 10 }], radius: 5 }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'mv',
      transform: { ids: [id], translate: { north: 5, east: 3 } } });
    let c = useDrawingStore.getState().getFeature(id)!.geometry.circle!;
    expect(c.center).toEqual({ x: 13, y: 15 });
    expect(c.radius).toBeCloseTo(5, 6);
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'scale',
      transform: { ids: [id], scale: 2, about: { northing: 15, easting: 13 } } });
    c = useDrawingStore.getState().getFeature(id)!.geometry.circle!;
    expect(c.radius).toBeCloseTo(10, 6); // doubled about its own center
  });

  it('applies fill + lineType when fitting a shape', () => {
    applyEditDrawing({
      type: 'EDIT_DRAWING', description: 'fit styled',
      fit: [{ shape: 'RECTANGLE', fill: '#222222', lineType: 'DASHED', points: [
        { northing: 0, easting: 0 }, { northing: 0, easting: 10 },
        { northing: 8, easting: 10 }, { northing: 8, easting: 0 },
      ] }],
    });
    const f = useDrawingStore.getState().getAllFeatures()[0];
    expect(f.type).toBe('POLYGON');
    expect(f.style.fillColor).toBe('#222222');
    expect(f.style.lineTypeId).toBe('DASHED');
  });

  it('translates a feature by north/east feet', () => {
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'p', add: [{ shape: 'POINT', points: [{ northing: 0, easting: 0 }] }] });
    const id = useDrawingStore.getState().getAllFeatures()[0].id;
    applyEditDrawing({ type: 'EDIT_DRAWING', description: 'mv', transform: { ids: [id], translate: { north: 5, east: 3 } } });
    const f = useDrawingStore.getState().getFeature(id)!;
    expect(f.geometry.point).toEqual({ x: 3, y: 5 });
  });
});
