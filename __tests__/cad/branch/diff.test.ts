// __tests__/cad/branch/diff.test.ts
//
// cad-branching — the pure change-summary between two drawing documents that
// powers the branch/review UI. Covers add/remove/modify detection for both
// features and layers, key-order-independent equality, and the count summary.

import { describe, it, expect } from 'vitest';
import { diffDrawingDocuments, stableStringify, summarizeCounts } from '@/lib/cad/branch/diff';

const doc = (features: Record<string, unknown>, layers: Record<string, unknown> = {}) => ({ features, layers });

describe('stableStringify', () => {
  it('is key-order independent for objects', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  it('preserves array order (vertex order is meaningful)', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });
  it('handles null + primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(5)).toBe('5');
    expect(stableStringify('x')).toBe('"x"');
  });
});

describe('diffDrawingDocuments — features', () => {
  it('detects added features', () => {
    const d = diffDrawingDocuments(doc({ a: { x: 1 } }), doc({ a: { x: 1 }, b: { x: 2 } }));
    expect(d.featuresAdded).toEqual(['b']);
    expect(d.featuresRemoved).toEqual([]);
    expect(d.featuresModified).toEqual([]);
    expect(d.hasChanges).toBe(true);
  });

  it('detects removed features', () => {
    const d = diffDrawingDocuments(doc({ a: {}, b: {} }), doc({ a: {} }));
    expect(d.featuresRemoved).toEqual(['b']);
    expect(d.hasChanges).toBe(true);
  });

  it('detects modified features by value, not key order', () => {
    const d = diffDrawingDocuments(
      doc({ a: { x: 1, y: 2 } }),
      doc({ a: { y: 2, x: 1 } }), // same data, different key order
    );
    expect(d.featuresModified).toEqual([]);
    expect(d.hasChanges).toBe(false);
  });

  it('flags a genuine value change as modified', () => {
    const d = diffDrawingDocuments(doc({ a: { color: '#000' } }), doc({ a: { color: '#fff' } }));
    expect(d.featuresModified).toEqual(['a']);
    expect(d.hasChanges).toBe(true);
  });
});

describe('diffDrawingDocuments — layers + robustness', () => {
  it('diffs layers independently of features', () => {
    const d = diffDrawingDocuments(
      { features: {}, layers: { L1: { name: 'A' } } },
      { features: {}, layers: { L1: { name: 'A' }, L2: { name: 'B' } } },
    );
    expect(d.layersAdded).toEqual(['L2']);
    expect(d.hasChanges).toBe(true);
  });

  it('treats missing / null documents as empty (no crash)', () => {
    expect(diffDrawingDocuments(null, null).hasChanges).toBe(false);
    expect(diffDrawingDocuments(undefined, doc({ a: {} })).featuresAdded).toEqual(['a']);
    expect(diffDrawingDocuments(doc({ a: {} }), {}).featuresRemoved).toEqual(['a']);
  });

  it('returns sorted id lists', () => {
    const d = diffDrawingDocuments(doc({}), doc({ z: {}, a: {}, m: {} }));
    expect(d.featuresAdded).toEqual(['a', 'm', 'z']);
  });
});

describe('summarizeCounts', () => {
  it('joins the non-zero parts', () => {
    expect(summarizeCounts(12, 3, 1)).toBe('12 added · 3 changed · 1 removed');
    expect(summarizeCounts(5, 0, 0)).toBe('5 added');
  });
  it('reports "No changes" when everything is zero', () => {
    expect(summarizeCounts(0, 0, 0)).toBe('No changes');
    expect(summarizeCounts(0, 0, 0, 'feature change')).toBe('No feature changes');
  });
});
