// __tests__/cad/points/copy-to-layer-naming.test.ts — §17d/§8.4
// Copying a point to a different layer (no explicit renumber) names the
// copy `base:N`.
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { transferSelectionToLayer } from '@/lib/cad/operations';
import { pointNumberOf } from '@/lib/cad/feature-fields';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

function layer(id: string, name: string): Layer {
  return {
    id, name, visible: true, locked: false, frozen: false, color: '#000',
    lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
    sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
  };
}
function pointFeat(id: string, layerId: string, name: string): Feature {
  return {
    id, type: 'POINT', geometry: { type: 'POINT', point: { x: 5, y: 7 } },
    layerId, style: {} as Feature['style'], properties: { pointName: name },
  } as Feature;
}
function loadDoc(features: Feature[]) {
  const fmap: Record<string, Feature> = {};
  for (const f of features) fmap[f.id] = f;
  const doc = {
    id: 'd', name: 'd', created: '', modified: '', author: '',
    features: fmap,
    layers: { BOUNDARY: layer('BOUNDARY', 'Boundary'), FENCE: layer('FENCE', 'Fence') },
    layerOrder: ['BOUNDARY', 'FENCE'],
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
    globalStyleConfig: {}, projectImages: {},
    settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
  } as unknown as DrawingDocument;
  useDrawingStore.getState().loadDocument(doc);
}

const baseOpts = {
  keepOriginals: true,
  renumberStart: null,
  stripUnknownCodes: false,
  targetTraverseId: null,
  bringAlongLinkedGeometry: false,
  transferOperationId: 'test-op',
} as Parameters<typeof transferSelectionToLayer>[2];

function fenceCopies() {
  return Object.values(useDrawingStore.getState().document.features)
    .filter((f) => f.layerId === 'FENCE');
}

describe('copy point to another layer → base:N (§17d)', () => {
  beforeEach(() => loadDoc([pointFeat('p', 'BOUNDARY', '255')]));

  it('first cross-layer copy becomes 255:1', () => {
    transferSelectionToLayer(['p'], 'FENCE', baseOpts);
    const copies = fenceCopies();
    expect(copies).toHaveLength(1);
    expect(pointNumberOf(copies[0])).toBe('255:1');
    // Original untouched.
    expect(pointNumberOf(useDrawingStore.getState().document.features['p'])).toBe('255');
  });

  it('second cross-layer copy becomes 255:2', () => {
    transferSelectionToLayer(['p'], 'FENCE', baseOpts);
    transferSelectionToLayer(['p'], 'FENCE', baseOpts);
    const names = fenceCopies().map((f) => pointNumberOf(f)).sort();
    expect(names).toEqual(['255:1', '255:2']);
  });

  it('an explicit renumber overrides the :N scheme', () => {
    transferSelectionToLayer(['p'], 'FENCE', { ...baseOpts, renumberStart: 900 });
    expect(pointNumberOf(fenceCopies()[0])).toBe('900');
  });
});
