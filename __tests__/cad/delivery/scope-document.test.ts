// __tests__/cad/delivery/scope-document.test.ts
import { describe, it, expect } from 'vitest';
import { scopeDocument, scopedFeatureCount } from '@/lib/cad/delivery/scope-document';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function mkFeature(id: string, layerId: string): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', position: { x: 0, y: 0 } },
    layerId,
    style: {} as Feature['style'],
    properties: {},
  } as Feature;
}

function mkDoc(): DrawingDocument {
  return {
    features: {
      a: mkFeature('a', 'L1'),
      b: mkFeature('b', 'L1'),
      c: mkFeature('c', 'L2'),
    },
    layers: {
      L1: { id: 'L1' } as DrawingDocument['layers'][string],
      L2: { id: 'L2' } as DrawingDocument['layers'][string],
    },
    layerOrder: ['L1', 'L2'],
  } as unknown as DrawingDocument;
}

describe('scopeDocument', () => {
  it('ALL returns the document unchanged', () => {
    const doc = mkDoc();
    expect(scopeDocument(doc, { kind: 'ALL' })).toBe(doc);
  });

  it('SELECTION keeps only the selected features', () => {
    const doc = mkDoc();
    const scoped = scopeDocument(doc, { kind: 'SELECTION', featureIds: ['a', 'c'] });
    expect(Object.keys(scoped.features).sort()).toEqual(['a', 'c']);
    // Layers preserved (styling context).
    expect(Object.keys(scoped.layers).sort()).toEqual(['L1', 'L2']);
  });

  it('SELECTION ignores unknown ids', () => {
    const doc = mkDoc();
    const scoped = scopeDocument(doc, { kind: 'SELECTION', featureIds: ['a', 'zzz'] });
    expect(Object.keys(scoped.features)).toEqual(['a']);
  });

  it('LAYERS keeps features on the chosen layers and narrows layerOrder', () => {
    const doc = mkDoc();
    const scoped = scopeDocument(doc, { kind: 'LAYERS', layerIds: ['L1'] });
    expect(Object.keys(scoped.features).sort()).toEqual(['a', 'b']);
    expect(scoped.layerOrder).toEqual(['L1']);
    expect(Object.keys(scoped.layers)).toEqual(['L1']);
  });

  it('does not mutate the source document', () => {
    const doc = mkDoc();
    scopeDocument(doc, { kind: 'SELECTION', featureIds: ['a'] });
    expect(Object.keys(doc.features).sort()).toEqual(['a', 'b', 'c']);
  });

  it('scopedFeatureCount reports the in-scope total', () => {
    const doc = mkDoc();
    expect(scopedFeatureCount(doc, { kind: 'ALL' })).toBe(3);
    expect(scopedFeatureCount(doc, { kind: 'LAYERS', layerIds: ['L2'] })).toBe(1);
    expect(scopedFeatureCount(doc, { kind: 'SELECTION', featureIds: ['a', 'b'] })).toBe(2);
  });
});
