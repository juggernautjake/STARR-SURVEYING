// __tests__/cad/store/visible-vs-selectable-features.test.ts
//
// cad-domain-audit Slice E — `getVisibleFeatures` honors `frozen`
// (matches the documented intent of `canFeatureBeRendered`), and the
// new `getSelectableFeatures` additionally excludes `locked`. Use
// the latter for snap targets / hit-testing / selection candidates.

import { describe, it, expect } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

function layer(id: string, over: Partial<Layer> = {}): Layer {
  return {
    id, name: id, visible: true, locked: false, frozen: false, color: '#000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
    ...over,
  };
}

function pointFeat(id: string, layerId: string, hidden = false): Feature {
  return {
    id, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId, style: {} as Feature['style'], properties: {}, hidden,
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

describe('drawingStore.getVisibleFeatures — honors frozen + hidden', () => {
  it('excludes features whose layer is invisible', () => {
    loadDoc(
      [layer('A', { visible: false }), layer('B')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'B')],
    );
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).toEqual(['p2']);
  });

  it('excludes features whose layer is frozen (Slice E fix)', () => {
    loadDoc(
      [layer('A', { frozen: true }), layer('B')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'B')],
    );
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).toEqual(['p2']);
  });

  it('still INCLUDES features on a locked layer (locked is for editing only)', () => {
    loadDoc(
      [layer('A', { locked: true })],
      [pointFeat('p1', 'A')],
    );
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).toEqual(['p1']);
  });

  it('excludes user-hidden features regardless of layer state', () => {
    loadDoc([layer('A')], [pointFeat('p1', 'A', true)]);
    expect(useDrawingStore.getState().getVisibleFeatures()).toEqual([]);
  });

  it('excludes orphaned features whose layer no longer exists', () => {
    loadDoc([layer('A')], [pointFeat('p1', 'ghost')]);
    expect(useDrawingStore.getState().getVisibleFeatures()).toEqual([]);
  });
});

describe('drawingStore.getSelectableFeatures — additionally excludes locked', () => {
  it('locked layer drops out of the selectable set (but stays visible for render)', () => {
    loadDoc(
      [layer('A', { locked: true }), layer('B')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'B')],
    );
    const state = useDrawingStore.getState();
    expect(state.getVisibleFeatures().map((f) => f.id).sort()).toEqual(['p1', 'p2']);
    expect(state.getSelectableFeatures().map((f) => f.id)).toEqual(['p2']);
  });

  it('frozen layer drops out of BOTH visible + selectable', () => {
    loadDoc(
      [layer('A', { frozen: true }), layer('B')],
      [pointFeat('p1', 'A'), pointFeat('p2', 'B')],
    );
    const state = useDrawingStore.getState();
    expect(state.getVisibleFeatures().map((f) => f.id)).toEqual(['p2']);
    expect(state.getSelectableFeatures().map((f) => f.id)).toEqual(['p2']);
  });
});
