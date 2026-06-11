// __tests__/cad/store/set-active-layer.test.ts
//
// cad-domain-audit Slice C — drawingStore.setActiveLayer rejects an
// id that isn't a layer in the current document and falls back to
// `layerOrder[0]` (or `''` when there is no layer). Previously every
// caller could drop in an arbitrary string and downstream feature
// creation would silently orphan its features onto a nonexistent
// layer.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('drawingStore.setActiveLayer — validates against doc.layers', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence the dev-time warning; we assert it fires in one test.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('accepts a known layer id', () => {
    loadDoc([layer('A'), layer('B')]);
    useDrawingStore.getState().setActiveLayer('B');
    expect(useDrawingStore.getState().activeLayerId).toBe('B');
  });

  it('rejects an unknown id and falls back to layerOrder[0]', () => {
    loadDoc([layer('A'), layer('B')]);
    useDrawingStore.getState().setActiveLayer('does-not-exist');
    expect(useDrawingStore.getState().activeLayerId).toBe('A');
  });

  it('falls back to empty string when there are zero layers', () => {
    loadDoc([]);
    useDrawingStore.getState().setActiveLayer('bogus');
    expect(useDrawingStore.getState().activeLayerId).toBe('');
  });

  it('warns in non-production builds when a fallback fires', () => {
    loadDoc([layer('A')]);
    useDrawingStore.getState().setActiveLayer('bogus');
    expect(warnSpy).toHaveBeenCalled();
    const msg = (warnSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(msg).toMatch(/setActiveLayer\("bogus"\)/);
    expect(msg).toMatch(/no such layer/);
  });

  it('does NOT change activeLayerId when the new id is already active and valid', () => {
    loadDoc([layer('A'), layer('B')]);
    useDrawingStore.getState().setActiveLayer('A');
    const before = useDrawingStore.getState().activeLayerId;
    useDrawingStore.getState().setActiveLayer('A');
    expect(useDrawingStore.getState().activeLayerId).toBe(before);
  });
});
