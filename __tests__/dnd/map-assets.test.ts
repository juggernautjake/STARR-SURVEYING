// __tests__/dnd/map-assets.test.ts — the asset tray's ordering and search (M4-3).
//
// "Recently-used first" is the whole slice — *"placing forty trees means using the same asset forty
// times"* — so it is asserted here rather than only exercised through a database. A rule that only runs
// behind I/O is one nobody notices breaking.
import { describe, it, expect } from 'vitest';
import { labelFor, orderAssets, searchAssets, type MapAsset } from '@/lib/dnd/maps/assets';

const asset = (over: Partial<MapAsset>): MapAsset => ({
  id: 'a', url: 'https://x/a.png', thumbUrl: null, label: 'Asset', kind: 'map', uses: 0,
  createdAt: '2026-08-01T10:00:00Z', ...over,
});

describe('order', () => {
  it('puts the most-used first', () => {
    const got = orderAssets([
      asset({ id: 'rare', uses: 1 }),
      asset({ id: 'common', uses: 12 }),
      asset({ id: 'never', uses: 0 }),
    ]);
    expect(got.map((a) => a.id)).toEqual(['common', 'rare', 'never']);
  });

  it('falls back to newest when nothing has been used yet', () => {
    // A fresh campaign has no usage at all, and "all equal" must not mean "arbitrary" — the newest
    // upload is the one the DM just added and is most likely reaching for.
    const got = orderAssets([
      asset({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
      asset({ id: 'new', createdAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(got.map((a) => a.id)).toEqual(['new', 'old']);
  });

  it('is STABLE for identical rows, so the tray does not reshuffle between renders', () => {
    // A DM reaching for "the third one" twice must get the same asset twice. Ties break on id, which is
    // arbitrary but fixed — unlike the sort's own tie behaviour, which is not guaranteed.
    const same = { uses: 3, createdAt: '2026-08-01T10:00:00Z' };
    const a = orderAssets([asset({ id: 'b', ...same }), asset({ id: 'a', ...same })]);
    const b = orderAssets([asset({ id: 'a', ...same }), asset({ id: 'b', ...same })]);
    expect(a.map((x) => x.id)).toEqual(['a', 'b']);
    expect(b.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [asset({ id: 'x', uses: 0 }), asset({ id: 'y', uses: 9 })];
    orderAssets(input);
    expect(input.map((a) => a.id)).toEqual(['x', 'y']);
  });
});

describe('search', () => {
  const shelf = [
    asset({ id: '1', label: 'Oak tree', url: 'https://s/ab12cd34.png' }),
    asset({ id: '2', label: 'Stone bridge', url: 'https://s/ef56.png' }),
  ];

  it('matches the label, case-insensitively', () => {
    expect(searchAssets(shelf, 'TREE').map((a) => a.id)).toEqual(['1']);
    expect(searchAssets(shelf, 'brid').map((a) => a.id)).toEqual(['2']);
  });

  it('NEVER matches the URL', () => {
    // A storage URL carries a content hash and a campaign uuid, so searching it turns half the tray into
    // a match for any hex digit the DM types — which reads as the search being broken, not clever.
    expect(searchAssets(shelf, 'ab12')).toEqual([]);
    expect(searchAssets(shelf, 'https')).toEqual([]);
  });

  it('an empty or whitespace query shows everything', () => {
    expect(searchAssets(shelf, '')).toHaveLength(2);
    expect(searchAssets(shelf, '   ')).toHaveLength(2);
  });
});

describe('a media row that never got a name', () => {
  it('falls back to the caption, then to its kind — never to an empty chip', () => {
    expect(labelFor({ label: 'Named', caption: 'c', kind: 'map' })).toBe('Named');
    expect(labelFor({ label: '  ', caption: 'A caption', kind: 'map' })).toBe('A caption');
    expect(labelFor({ label: null, caption: null, kind: 'handout' })).toBe('Untitled handout');
    expect(labelFor({ label: null, caption: null, kind: null })).toBe('Untitled image');
  });
});
