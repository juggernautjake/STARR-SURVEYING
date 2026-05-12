// __tests__/cad/ai/tool-registry.test.ts
//
// Phase 6 §32 Slice 2 — tests for the five-tool registry. Drives
// each tool's execute() directly (no AI in the loop yet) to lock
// down the {ok, result, reason} envelope contract and verify that
// success paths call into the same drawing-store kernels manual
// UI uses.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  toolRegistry,
  addPoint,
  drawLineBetween,
  drawPolylineThrough,
  createLayer,
  applyLayerStyle,
} from '@/lib/cad/ai/tool-registry';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
import { generateId } from '@/lib/cad/types';
import type { Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    frozen: false,
    color: '#000000',
    lineWeight: 0.5,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder: 0,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
    ...overrides,
  };
}

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

describe('tool-registry — shape', () => {
  it('exports all five tools by name', () => {
    expect(Object.keys(toolRegistry).sort()).toEqual(
      ['addPoint', 'applyLayerStyle', 'createLayer', 'drawLineBetween', 'drawPolylineThrough'].sort(),
    );
  });

  it('every tool has a non-empty name, description, and JSON schema', () => {
    for (const [key, tool] of Object.entries(toolRegistry)) {
      expect(tool.name, `${key}.name`).toBe(key);
      expect(tool.description.length, `${key}.description length`).toBeGreaterThan(0);
      expect(typeof tool.inputSchema, `${key}.inputSchema`).toBe('object');
      expect((tool.inputSchema as { type?: string }).type, `${key}.inputSchema.type`).toBe('object');
    }
  });
});

describe('addPoint', () => {
  beforeEach(() => {
    resetStores();
  });

  it('drops a POINT on the active layer with finite coords', () => {
    const result = addPoint.execute({ x: 10, y: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.type).toBe('POINT');
    expect(result.result.geometry.point).toEqual({ x: 10, y: 20 });
    expect(result.result.layerId).toBe(useDrawingStore.getState().activeLayerId);
    expect(useDrawingStore.getState().document.features[result.result.id]).toBeDefined();
  });

  it('stamps code + properties when supplied', () => {
    const result = addPoint.execute({ x: 1, y: 2, code: 'BC-1', properties: { source: 'gps' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.properties.code).toBe('BC-1');
    expect(result.result.properties.source).toBe('gps');
  });

  it('writes to an explicit layerId when provided', () => {
    const other = generateId();
    useDrawingStore.getState().addLayer(makeLayer(other, 'OTHER'));
    const result = addPoint.execute({ x: 0, y: 0, layerId: other });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.layerId).toBe(other);
  });

  it('returns ok=false with a clear reason on non-finite coords', () => {
    const a = addPoint.execute({ x: Number.NaN, y: 0 });
    expect(a.ok).toBe(false);
    if (a.ok) return;
    expect(a.reason).toMatch(/finite/i);
  });

  it('returns ok=false when the target layer is missing', () => {
    const r = addPoint.execute({ x: 0, y: 0, layerId: 'does-not-exist' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/does not exist/i);
  });

  it('returns ok=false when the target layer is locked', () => {
    const locked = generateId();
    useDrawingStore.getState().addLayer(makeLayer(locked, 'LOCKED', { locked: true }));
    const r = addPoint.execute({ x: 0, y: 0, layerId: locked });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/locked/i);
  });

  it('pushes a single undo entry per successful drop', () => {
    const before = useUndoStore.getState().undoStack.length;
    addPoint.execute({ x: 5, y: 5 });
    const after = useUndoStore.getState().undoStack.length;
    expect(after).toBe(before + 1);
  });
});

describe('drawLineBetween', () => {
  beforeEach(() => {
    resetStores();
  });

  it('drops a LINE between two points', () => {
    const r = drawLineBetween.execute({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.type).toBe('LINE');
    expect(r.result.geometry.start).toEqual({ x: 0, y: 0 });
    expect(r.result.geometry.end).toEqual({ x: 10, y: 10 });
  });

  it('rejects degenerate zero-length lines', () => {
    const r = drawLineBetween.execute({ from: { x: 1, y: 1 }, to: { x: 1, y: 1 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/zero-length/i);
  });

  it('rejects non-finite vertex components', () => {
    const r = drawLineBetween.execute({ from: { x: 0, y: 0 }, to: { x: Number.POSITIVE_INFINITY, y: 1 } });
    expect(r.ok).toBe(false);
  });

  it('rejects when from is not a point-shaped object', () => {
    const r = drawLineBetween.execute({
      from: null as unknown as { x: number; y: number },
      to: { x: 1, y: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/from/i);
  });
});

describe('drawPolylineThrough', () => {
  beforeEach(() => {
    resetStores();
  });

  it('drops a POLYLINE through ≥ 2 vertices', () => {
    const r = drawPolylineThrough.execute({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.type).toBe('POLYLINE');
    expect(r.result.geometry.vertices).toHaveLength(3);
  });

  it('emits a POLYGON when closed=true with ≥ 3 vertices', () => {
    const r = drawPolylineThrough.execute({
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.type).toBe('POLYGON');
  });

  it('rejects fewer than 2 vertices', () => {
    const r = drawPolylineThrough.execute({ points: [{ x: 0, y: 0 }] });
    expect(r.ok).toBe(false);
  });

  it('rejects closed=true with fewer than 3 vertices', () => {
    const r = drawPolylineThrough.execute({
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/3 vertices/);
  });

  it('rejects when any vertex is malformed', () => {
    const r = drawPolylineThrough.execute({
      points: [
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/points\[1\]/);
  });
});

describe('createLayer', () => {
  beforeEach(() => {
    resetStores();
  });

  it('creates a layer with default style', () => {
    const r = createLayer.execute({ name: 'NEW_LAYER' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.name).toBe('NEW_LAYER');
    expect(r.result.color).toBe('#cccccc');
    expect(useDrawingStore.getState().document.layers[r.result.id]).toBeDefined();
  });

  it('honours explicit style overrides', () => {
    const r = createLayer.execute({
      name: 'STYLED',
      color: '#ff8800',
      lineWeight: 1.25,
      lineTypeId: 'DASHED',
      opacity: 0.5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.color).toBe('#ff8800');
    expect(r.result.lineWeight).toBe(1.25);
    expect(r.result.lineTypeId).toBe('DASHED');
    expect(r.result.opacity).toBe(0.5);
  });

  it('rejects empty / whitespace-only names', () => {
    expect(createLayer.execute({ name: '' }).ok).toBe(false);
    expect(createLayer.execute({ name: '   ' }).ok).toBe(false);
  });

  it('rejects case-insensitive name collisions', () => {
    createLayer.execute({ name: 'BACK_OF_CURB' });
    const r = createLayer.execute({ name: 'back_of_curb' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/already exists/i);
  });

  it('sets the new layer active when setActive=true', () => {
    const r = createLayer.execute({ name: 'ACTIVATE_ME', setActive: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(useDrawingStore.getState().activeLayerId).toBe(r.result.id);
  });
});

describe('applyLayerStyle', () => {
  beforeEach(() => {
    resetStores();
  });

  it('updates colour and line weight on an existing layer', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    const r = applyLayerStyle.execute({
      layerId,
      style: { color: '#3366ff', lineWeight: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.color).toBe('#3366ff');
    expect(r.result.lineWeight).toBe(2);
    expect(useDrawingStore.getState().document.layers[layerId].color).toBe('#3366ff');
  });

  it('updates visibility / locked / frozen flags', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    applyLayerStyle.execute({ layerId, style: { visible: false, locked: true } });
    const updated = useDrawingStore.getState().document.layers[layerId];
    expect(updated.visible).toBe(false);
    expect(updated.locked).toBe(true);
  });

  it('returns ok=false when the target layer does not exist', () => {
    const r = applyLayerStyle.execute({ layerId: 'missing', style: { color: '#ff0000' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/does not exist/i);
  });
});
