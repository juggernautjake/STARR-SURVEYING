// __tests__/cad/store/get-active-layer.test.ts
//
// cad-domain-audit Slice D — single-source-of-truth resolver for the
// active layer + a sane `activeLayerId` after `newDocument()`. The
// `getActiveLayer()` selector returns the live Layer or null (no
// stale-id surprises), and `newDocument()` no longer leaves
// activeLayerId as the empty string so the surveyor's first piece of
// geometry doesn't land on a phantom layer.

import { describe, it, expect } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { DrawingDocument, Layer } from '@/lib/cad/types';

function layer(id: string): Layer {
  return {
    id, name: id, visible: true, locked: false, frozen: false, color: '#000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  };
}

function loadDoc(layers: Layer[]) {
  const lmap: Record<string, Layer> = {};
  for (const l of layers) lmap[l.id] = l;
  const doc = {
    id: 'd', name: 'd', created: '', modified: '', author: '',
    features: {}, layers: lmap, layerOrder: layers.map((l) => l.id),
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {}, projectImages: {},
    settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
  } as unknown as DrawingDocument;
  useDrawingStore.getState().loadDocument(doc);
}

describe('drawingStore.getActiveLayer — single source of truth', () => {
  it('returns the live Layer when activeLayerId is valid', () => {
    loadDoc([layer('A'), layer('B')]);
    useDrawingStore.getState().setActiveLayer('B');
    expect(useDrawingStore.getState().getActiveLayer()?.id).toBe('B');
  });

  it('returns null when activeLayerId is the empty string', () => {
    loadDoc([]);
    // setActiveLayer fell back to '' (Slice C), so getActiveLayer
    // should yield null without crashing.
    expect(useDrawingStore.getState().getActiveLayer()).toBeNull();
  });

  it('getActiveLayerStyle is built on top of getActiveLayer (fallback when null)', () => {
    loadDoc([]);
    const style = useDrawingStore.getState().getActiveLayerStyle();
    expect(style.color).toBe('#000000');
    expect(style.lineWeight).toBe(1);
    expect(style.opacity).toBe(1);
  });

  it('reflects the live layer styling when an active layer exists', () => {
    loadDoc([{ ...layer('A'), color: '#abcdef', lineWeight: 0.42, opacity: 0.3 }]);
    useDrawingStore.getState().setActiveLayer('A');
    const style = useDrawingStore.getState().getActiveLayerStyle();
    expect(style.color).toBe('#abcdef');
    expect(style.lineWeight).toBeCloseTo(0.42);
    expect(style.opacity).toBeCloseTo(0.3);
  });
});

describe('drawingStore.newDocument — seeds a valid activeLayerId', () => {
  it('sets activeLayerId to layerOrder[0] (not "")', () => {
    useDrawingStore.getState().newDocument();
    const { activeLayerId, document } = useDrawingStore.getState();
    expect(activeLayerId).not.toBe('');
    expect(document.layerOrder[0]).toBe(activeLayerId);
    expect(document.layers[activeLayerId]).toBeDefined();
  });

  it('getActiveLayer immediately returns a non-null Layer after newDocument', () => {
    useDrawingStore.getState().newDocument();
    expect(useDrawingStore.getState().getActiveLayer()).not.toBeNull();
  });
});
