// __tests__/cad/store/dirty-feature-ids.test.ts
//
// cad-desktop-tauri-and-perf Slice P3 — drawing-store dirty-region
// tracking. Every feature mutation API stamps the touched id into
// `dirtyFeatureIds`; the renderer (to be wired in P3b) reads + clears
// per-id as it rebuilds its Pixi Graphics cache.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

function layer(id: string): Layer {
  return {
    id, name: id, visible: true, locked: false, frozen: false, color: '#000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  };
}

function pointFeat(id: string, layerId = 'L'): Feature {
  return {
    id, type: 'POINT', geometry: { type: 'POINT', point: { x: 1, y: 2 } },
    layerId, style: {} as Feature['style'], properties: { pointName: id },
  } as Feature;
}

function loadDoc(features: Feature[]) {
  const fmap: Record<string, Feature> = {};
  for (const f of features) fmap[f.id] = f;
  const doc = {
    id: 'd', name: 'd', created: '', modified: '', author: '',
    features: fmap, layers: { L: layer('L') }, layerOrder: ['L'],
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {}, projectImages: {},
    settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
  } as unknown as DrawingDocument;
  useDrawingStore.getState().loadDocument(doc);
}

beforeEach(() => {
  loadDoc([]);
  // loadDocument now wipes the dirty set, so each test starts clean.
});

describe('dirtyFeatureIds — initial state', () => {
  it('exists as a mutable Set with referential stability across reads', () => {
    const a = useDrawingStore.getState().dirtyFeatureIds;
    const b = useDrawingStore.getState().dirtyFeatureIds;
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(Set);
  });

  it('is empty on a freshly-loaded document', () => {
    expect(useDrawingStore.getState().dirtyFeatureIds.size).toBe(0);
  });
});

describe('mutation APIs — each stamps the touched id', () => {
  it('addFeature stamps the new id', () => {
    useDrawingStore.getState().addFeature(pointFeat('p1'));
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['p1']);
  });

  it('addFeatures stamps every id in the batch', () => {
    useDrawingStore.getState().addFeatures([pointFeat('p1'), pointFeat('p2'), pointFeat('p3')]);
    expect([...useDrawingStore.getState().dirtyFeatureIds].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('removeFeature stamps before the feature drops (so the renderer can evict its cache)', () => {
    loadDoc([pointFeat('p1')]);
    useDrawingStore.getState().removeFeature('p1');
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['p1']);
  });

  it('removeFeatures stamps every id in the batch', () => {
    loadDoc([pointFeat('p1'), pointFeat('p2')]);
    useDrawingStore.getState().removeFeatures(['p1', 'p2']);
    expect([...useDrawingStore.getState().dirtyFeatureIds].sort()).toEqual(['p1', 'p2']);
  });

  it('updateFeature stamps the touched id', () => {
    loadDoc([pointFeat('p1')]);
    useDrawingStore.getState().updateFeature('p1', { properties: { pointName: 'rename' } });
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['p1']);
  });

  it('updateFeatureGeometry stamps the touched id', () => {
    loadDoc([pointFeat('p1')]);
    useDrawingStore.getState().updateFeatureGeometry('p1', { type: 'POINT', point: { x: 5, y: 5 } });
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['p1']);
  });

  it('setFeatureTextLabels stamps the touched id', () => {
    loadDoc([pointFeat('p1')]);
    useDrawingStore.getState().setFeatureTextLabels('p1', []);
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['p1']);
  });
});

describe('markFeatureDirty / clearFeatureDirty / clearAllFeatureDirty', () => {
  it('markFeatureDirty(id) is idempotent on Sets', () => {
    useDrawingStore.getState().markFeatureDirty('p1');
    useDrawingStore.getState().markFeatureDirty('p1');
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['p1']);
  });

  it('markFeatureDirty accepts an array (batch stamp)', () => {
    useDrawingStore.getState().markFeatureDirty(['a', 'b', 'c']);
    expect([...useDrawingStore.getState().dirtyFeatureIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('clearFeatureDirty(id) removes only that id', () => {
    useDrawingStore.getState().markFeatureDirty(['a', 'b']);
    useDrawingStore.getState().clearFeatureDirty('a');
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['b']);
  });

  it('clearFeatureDirty accepts an array (renderer\'s typical "I processed these" call)', () => {
    useDrawingStore.getState().markFeatureDirty(['a', 'b', 'c']);
    useDrawingStore.getState().clearFeatureDirty(['a', 'c']);
    expect([...useDrawingStore.getState().dirtyFeatureIds]).toEqual(['b']);
  });

  it('clearAllFeatureDirty wipes the set', () => {
    useDrawingStore.getState().markFeatureDirty(['a', 'b']);
    useDrawingStore.getState().clearAllFeatureDirty();
    expect(useDrawingStore.getState().dirtyFeatureIds.size).toBe(0);
  });
});

describe('markAllFeaturesDirty — for full-rebuild signals', () => {
  it('stamps every feature currently in the document', () => {
    loadDoc([pointFeat('p1'), pointFeat('p2'), pointFeat('p3')]);
    useDrawingStore.getState().markAllFeaturesDirty();
    expect([...useDrawingStore.getState().dirtyFeatureIds].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('is the foundation cad:regenerateCanvas can call to evict the entire Graphics cache', () => {
    loadDoc([pointFeat('p1'), pointFeat('p2')]);
    useDrawingStore.getState().clearAllFeatureDirty();
    useDrawingStore.getState().markAllFeaturesDirty();
    expect(useDrawingStore.getState().dirtyFeatureIds.size).toBe(2);
  });
});

describe('document boundaries — loadDocument + newDocument wipe the dirty set', () => {
  it('loadDocument resets dirty so the new doc starts with no pending render work', () => {
    loadDoc([pointFeat('p1')]);
    useDrawingStore.getState().markFeatureDirty('stale-id');
    loadDoc([pointFeat('q1')]);
    expect(useDrawingStore.getState().dirtyFeatureIds.size).toBe(0);
  });

  it('newDocument also clears the set', () => {
    useDrawingStore.getState().markFeatureDirty('stale-id');
    useDrawingStore.getState().newDocument();
    expect(useDrawingStore.getState().dirtyFeatureIds.size).toBe(0);
  });
});
