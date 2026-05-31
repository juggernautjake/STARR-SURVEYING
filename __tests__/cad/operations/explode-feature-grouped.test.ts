// __tests__/cad/operations/explode-feature-grouped.test.ts
//
// cad-layer-grouping-and-context-menus Slice 6 — explodes a
// POLYLINE / POLYGON into per-segment LINE features AND wraps the
// result in a FeatureGroup named after the source.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useSelectionStore } from '@/lib/cad/store';
import { generateId, type Feature, type Layer } from '@/lib/cad/types';
import { explodeFeatureGrouped } from '@/lib/cad/operations';

function makeLayer(id: string, name: string): Layer {
  return {
    id, name, visible: true, locked: false, frozen: false, color: '#000000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  };
}

function makePolygon(id: string, layerId: string, name?: string): Feature {
  return {
    id,
    type: 'POLYGON',
    geometry: { type: 'POLYGON', vertices: [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ] },
    layerId,
    properties: name ? { name } : {},
    style: {
      color: '#000000', lineWeight: 1, opacity: 1, lineTypeId: null,
      symbolId: null, symbolSize: null, symbolRotation: 0,
      labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 },
    } as unknown as Feature['style'],
  } as Feature;
}

function makePolyline(id: string, layerId: string): Feature {
  return {
    ...makePolygon(id, layerId),
    type: 'POLYLINE',
    geometry: { type: 'POLYLINE', vertices: [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ] },
  };
}

describe('explodeFeatureGrouped', () => {
  beforeEach(() => {
    const layer = makeLayer('L', 'Test');
    useDrawingStore.setState((s) => ({
      document: {
        ...s.document,
        features: {},
        featureGroups: {},
        layers: { L: layer },
        layerOrder: ['L'],
      },
      activeLayerId: 'L',
      isDirty: false,
    }));
    useSelectionStore.getState().deselectAll();
  });

  it('explodes a 4-vertex POLYGON into 4 LINEs (closed shape)', () => {
    const poly = makePolygon('p1', 'L', 'Boundary');
    useDrawingStore.getState().addFeature(poly);
    expect(explodeFeatureGrouped('p1')).toBe(true);
    const features = Object.values(useDrawingStore.getState().document.features);
    const lines = features.filter((f) => f.type === 'LINE');
    expect(lines.length).toBe(4);
    // Original polygon is gone.
    expect(useDrawingStore.getState().getFeature('p1')).toBeUndefined();
  });

  it('explodes a 3-vertex POLYLINE into 2 LINEs (open chain)', () => {
    const poly = makePolyline('pl1', 'L');
    useDrawingStore.getState().addFeature(poly);
    expect(explodeFeatureGrouped('pl1')).toBe(true);
    const lines = Object.values(useDrawingStore.getState().document.features).filter((f) => f.type === 'LINE');
    expect(lines.length).toBe(2);
  });

  it('wraps the new LINEs in a FeatureGroup named after the source', () => {
    const poly = makePolygon('p2', 'L', 'My Boundary');
    useDrawingStore.getState().addFeature(poly);
    explodeFeatureGrouped('p2');
    const groups = Object.values(useDrawingStore.getState().document.featureGroups);
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('My Boundary');
    expect(groups[0].featureIds.length).toBe(4);
  });

  it('the group name falls back to a `<TYPE> <shortId>` label when the source has no name', () => {
    const poly = makePolygon('p3-1234567890', 'L');
    useDrawingStore.getState().addFeature(poly);
    explodeFeatureGrouped('p3-1234567890');
    const groups = Object.values(useDrawingStore.getState().document.featureGroups);
    expect(groups[0].name).toMatch(/^POLYGON p3-12/);
  });

  it('every new LINE carries featureGroupId pointing at the new group', () => {
    const poly = makePolygon('p4', 'L', 'Plot');
    useDrawingStore.getState().addFeature(poly);
    explodeFeatureGrouped('p4');
    const group = Object.values(useDrawingStore.getState().document.featureGroups)[0];
    const lines = Object.values(useDrawingStore.getState().document.features).filter((f) => f.type === 'LINE');
    for (const ln of lines) {
      expect(ln.featureGroupId).toBe(group.id);
    }
  });

  it('returns false (no-op) for a non-existent feature id', () => {
    expect(explodeFeatureGrouped('ghost')).toBe(false);
    expect(Object.values(useDrawingStore.getState().document.featureGroups).length).toBe(0);
  });
});

describe('FeatureContextMenu — "Explode to segments (grouped)" menu wiring', () => {
  it('imports explodeFeatureGrouped from operations', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const SRC = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'FeatureContextMenu.tsx'),
      'utf8',
    );
    expect(SRC).toMatch(/explodeFeatureGrouped,/);
  });

  it('renders the new menu item alongside the existing Explode entry, gated on non-LINE source', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const SRC = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'FeatureContextMenu.tsx'),
      'utf8',
    );
    expect(SRC).toMatch(
      /id: 'explodeGrouped',\s*label: 'Explode to segments \(grouped\)',\s*action: \(\) => \{ explodeFeatureGrouped\(feature\.id\); onClose\(\); \}/,
    );
  });
});
