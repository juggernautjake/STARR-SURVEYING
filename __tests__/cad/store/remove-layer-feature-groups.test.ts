// __tests__/cad/store/remove-layer-feature-groups.test.ts
//
// cad-domain-audit Slice F — `removeLayer` cleans up feature groups
// instead of leaving them as silent orphans pointing at the deleted
// layer. Non-last delete: groups migrate to the same safe target the
// features migrate to (so the grouping intent survives). Last-layer
// delete: groups on the deleted layer drop. Same cleanup automatically
// covers `promoteDraftLayer` since it delegates to `removeLayer`.

import { describe, it, expect } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { DrawingDocument, Feature, FeatureGroup, Layer } from '@/lib/cad/types';

function layer(id: string, name = id): Layer {
  return {
    id, name, visible: true, locked: false, frozen: false, color: '#000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  };
}

function pointFeat(id: string, layerId: string): Feature {
  return {
    id, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId, style: {} as Feature['style'], properties: {},
  } as Feature;
}

function group(id: string, layerId: string, featureIds: string[]): FeatureGroup {
  return { id, name: id, layerId, featureIds, parentGroupId: null };
}

function loadDoc(layers: Layer[], features: Feature[], groups: FeatureGroup[]) {
  const lmap: Record<string, Layer> = {};
  for (const l of layers) lmap[l.id] = l;
  const fmap: Record<string, Feature> = {};
  for (const f of features) fmap[f.id] = f;
  const gmap: Record<string, FeatureGroup> = {};
  for (const g of groups) gmap[g.id] = g;
  const doc = {
    id: 'd', name: 'd', created: '', modified: '', author: '',
    features: fmap, layers: lmap, layerOrder: layers.map((l) => l.id),
    featureGroups: gmap, layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {}, projectImages: {},
    settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
  } as unknown as DrawingDocument;
  useDrawingStore.getState().loadDocument(doc);
}

describe('removeLayer — feature-group cleanup', () => {
  it('migrates groups on the deleted layer to the same safe target the features go to', () => {
    loadDoc(
      [layer('A'), layer('B')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'A')],
      [group('g1', 'A', ['p1', 'p2'])],
    );
    useDrawingStore.getState().removeLayer('A');
    const doc = useDrawingStore.getState().document;
    // Features migrated to B; group migrated alongside them.
    expect(doc.features.p1.layerId).toBe('B');
    expect(doc.features.p2.layerId).toBe('B');
    expect(doc.featureGroups.g1).toBeDefined();
    expect(doc.featureGroups.g1.layerId).toBe('B');
  });

  it('leaves groups on OTHER layers untouched', () => {
    loadDoc(
      [layer('A'), layer('B')],
      [pointFeat('pa', 'A'), pointFeat('pb', 'B')],
      [group('gA', 'A', ['pa']), group('gB', 'B', ['pb'])],
    );
    useDrawingStore.getState().removeLayer('A');
    const doc = useDrawingStore.getState().document;
    // gA migrated to B (the safe target).
    expect(doc.featureGroups.gA.layerId).toBe('B');
    // gB never moved.
    expect(doc.featureGroups.gB.layerId).toBe('B');
  });

  it('drops groups on the deleted layer when it was the LAST layer', () => {
    loadDoc(
      [layer('A')],
      [pointFeat('p1', 'A')],
      [group('g1', 'A', ['p1'])],
    );
    useDrawingStore.getState().removeLayer('A');
    const doc = useDrawingStore.getState().document;
    expect(doc.layerOrder).toEqual([]);
    expect(doc.features).toEqual({});
    // Group dropped — there's no target layer to migrate to.
    expect(doc.featureGroups.g1).toBeUndefined();
  });

  it('does not migrate groups when the removed layer id has no groups', () => {
    loadDoc(
      [layer('A'), layer('B')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'B')],
      [group('gB', 'B', ['p2'])],
    );
    useDrawingStore.getState().removeLayer('A');
    const doc = useDrawingStore.getState().document;
    expect(doc.featureGroups.gB.layerId).toBe('B');
  });
});
