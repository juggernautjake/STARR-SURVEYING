// __tests__/cad/store/remove-layer.test.ts — deleting layers.
// Non-last deletes move features to a surviving layer; deleting the LAST
// layer empties the project (all features, incl. points, are removed).
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

function layer(id: string, name: string, isDefault = false): Layer {
  return {
    id, name, visible: true, locked: false, frozen: false, color: '#000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault, isProtected: false, autoAssignCodes: [],
  };
}
function pointFeat(id: string, layerId: string): Feature {
  return {
    id, type: 'POINT', geometry: { type: 'POINT', point: { x: 1, y: 2 } },
    layerId, style: {} as Feature['style'], properties: { pointName: id },
  } as Feature;
}
function loadDoc(layers: Layer[], features: Feature[]) {
  const lmap: Record<string, Layer> = {};
  for (const l of layers) lmap[l.id] = l;
  const fmap: Record<string, Feature> = {};
  for (const f of features) fmap[f.id] = f;
  const doc = {
    id: 'd', name: 'd', created: '', modified: '', author: '',
    features: fmap, layers: lmap, layerOrder: layers.map((l) => l.id),
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {}, projectImages: {},
    settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
  } as unknown as DrawingDocument;
  useDrawingStore.getState().loadDocument(doc);
}
const doc = () => useDrawingStore.getState().document;

describe('removeLayer', () => {
  beforeEach(() => {
    loadDoc(
      [layer('A', 'Points', true), layer('B', 'Fence')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'A'), pointFeat('f1', 'B')],
    );
    useDrawingStore.setState({ activeLayerId: 'A' });
  });

  it('moves features to a surviving layer when other layers remain', () => {
    useDrawingStore.getState().removeLayer('A');
    expect(doc().layerOrder).toEqual(['B']);
    // p1/p2 survived, reassigned to the remaining layer B.
    expect(Object.keys(doc().features).sort()).toEqual(['f1', 'p1', 'p2']);
    expect(doc().features.p1.layerId).toBe('B');
    expect(doc().features.p2.layerId).toBe('B');
    expect(useDrawingStore.getState().activeLayerId).toBe('B');
  });

  it('can delete the default layer (no longer protected)', () => {
    useDrawingStore.getState().removeLayer('A');
    expect(doc().layers.A).toBeUndefined();
  });

  it('deleting the LAST layer removes its features and empties the project', () => {
    useDrawingStore.getState().removeLayer('A'); // → only B left, points moved to B
    useDrawingStore.getState().removeLayer('B'); // → last layer, everything gone
    expect(doc().layerOrder).toEqual([]);
    expect(Object.keys(doc().features)).toEqual([]);
    expect(useDrawingStore.getState().activeLayerId).toBe('');
  });

  it('addLayer re-activates a layer after the project was emptied', () => {
    useDrawingStore.getState().removeLayer('A');
    useDrawingStore.getState().removeLayer('B');
    expect(useDrawingStore.getState().activeLayerId).toBe('');
    useDrawingStore.getState().addLayer(layer('C', 'New'));
    expect(useDrawingStore.getState().activeLayerId).toBe('C');
  });
});
