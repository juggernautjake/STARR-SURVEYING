// __tests__/cad/media/media-index.test.ts
import { describe, it, expect } from 'vitest';
import { indexAdd, indexRemove, indexFromMeta, type MediaItem } from '@/lib/cad/media/media-store';

function item(id: string, ownerId: string): MediaItem {
  return {
    id, ownerId, ownerKind: 'feature', kind: 'image',
    name: `${id}.jpg`, mime: 'image/jpeg', size: 10, thumbnail: null,
    addedAt: '2026-05-27T00:00:00Z',
  };
}

describe('media index helpers', () => {
  it('adds items grouped by owner', () => {
    let idx: Record<string, MediaItem[]> = {};
    idx = indexAdd(idx, item('m1', 'p1'));
    idx = indexAdd(idx, item('m2', 'p1'));
    idx = indexAdd(idx, item('m3', 'p2'));
    expect(idx['p1'].map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(idx['p2'].map((m) => m.id)).toEqual(['m3']);
  });

  it('removes by id and drops empty owners', () => {
    let idx = indexFromMeta([item('m1', 'p1'), item('m2', 'p1'), item('m3', 'p2')]);
    idx = indexRemove(idx, 'm3');
    expect(idx['p2']).toBeUndefined(); // owner with no media is dropped
    idx = indexRemove(idx, 'm1');
    expect(idx['p1'].map((m) => m.id)).toEqual(['m2']);
  });

  it('builds an index from a flat meta list', () => {
    const idx = indexFromMeta([item('a', 'x'), item('b', 'y'), item('c', 'x')]);
    expect(Object.keys(idx).sort()).toEqual(['x', 'y']);
    expect(idx['x']).toHaveLength(2);
  });

  it('treats add/remove as immutable (does not mutate input)', () => {
    const base = indexFromMeta([item('a', 'x')]);
    const added = indexAdd(base, item('b', 'x'));
    expect(base['x']).toHaveLength(1); // original unchanged
    expect(added['x']).toHaveLength(2);
  });
});
