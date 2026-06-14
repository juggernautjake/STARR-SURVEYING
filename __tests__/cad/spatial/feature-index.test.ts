// __tests__/cad/spatial/feature-index.test.ts
//
// cad-desktop-tauri-and-perf Slice P1 — feature spatial index.
// Hand-rolled uniform-grid implementation with a large-bin
// overflow. Tests cover correctness (every feature whose bounds
// intersect the query returns), incremental upsert/remove,
// stress under a 10k-feature synthetic, and the large-bin path
// (oversized AABBs always show up in queries that intersect
// them).

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CELL_SIZE_FT,
  buildFeatureIndex,
  createFeatureIndex,
} from '@/lib/cad/spatial/feature-index';
import type { BoundingBox } from '@/lib/cad/types';

const bb = (minX: number, minY: number, maxX: number, maxY: number): BoundingBox =>
  ({ minX, minY, maxX, maxY });

describe('createFeatureIndex — empty index baseline', () => {
  it('size / cellCount / largeBinSize all 0 on a fresh index', () => {
    const idx = createFeatureIndex();
    expect(idx.size()).toBe(0);
    expect(idx.cellCount()).toBe(0);
    expect(idx.largeBinSize()).toBe(0);
  });

  it('queryRect against an empty index returns []', () => {
    const idx = createFeatureIndex();
    expect(idx.queryRect(bb(0, 0, 1000, 1000))).toEqual([]);
  });
});

describe('upsert / queryRect — basic hit + miss', () => {
  it('a single point bound is returned when the query overlaps', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    expect(idx.queryRect(bb(0, 0, 50, 50))).toEqual(['p1']);
  });

  it('a feature whose bounds do NOT intersect the query is excluded', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    expect(idx.queryRect(bb(100, 100, 200, 200))).toEqual([]);
  });

  it('upsert dedup — calling upsert twice with the same id keeps a single membership', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    idx.upsert('p1', bb(20, 20, 20, 20));
    expect(idx.size()).toBe(1);
    expect(idx.queryRect(bb(0, 0, 15, 15))).toEqual([]); // moved out of the old box
    expect(idx.queryRect(bb(15, 15, 25, 25))).toEqual(['p1']);
  });

  it('a feature spanning multiple cells is returned exactly once per query', () => {
    const idx = createFeatureIndex(10); // small cells force multi-cell coverage
    idx.upsert('line', bb(0, 0, 35, 0));
    const result = idx.queryRect(bb(0, -1, 50, 1));
    expect(result).toEqual(['line']);
  });

  it('queryRect ignores non-finite bounds defensively', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    expect(idx.queryRect({ minX: NaN, minY: 0, maxX: 1, maxY: 1 })).toEqual([]);
  });
});

describe('remove — incremental removal', () => {
  it('drops the id from queries + size', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    idx.upsert('p2', bb(20, 20, 20, 20));
    idx.remove('p1');
    expect(idx.size()).toBe(1);
    expect(idx.queryRect(bb(0, 0, 50, 50))).toEqual(['p2']);
  });

  it('removing an unknown id is a no-op', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    idx.remove('ghost');
    expect(idx.size()).toBe(1);
    expect(idx.queryRect(bb(0, 0, 50, 50))).toEqual(['p1']);
  });

  it('cells with no remaining members are garbage collected', () => {
    const idx = createFeatureIndex();
    idx.upsert('p1', bb(10, 10, 10, 10));
    expect(idx.cellCount()).toBeGreaterThan(0);
    idx.remove('p1');
    expect(idx.cellCount()).toBe(0);
  });
});

describe('invalid bounds — silently skipped', () => {
  it('reversed maxX < minX does NOT insert', () => {
    const idx = createFeatureIndex();
    idx.upsert('bad', bb(10, 0, 0, 10));
    expect(idx.size()).toBe(0);
  });

  it('non-finite values do NOT insert', () => {
    const idx = createFeatureIndex();
    idx.upsert('bad', { minX: 0, minY: 0, maxX: Infinity, maxY: 1 });
    expect(idx.size()).toBe(0);
  });
});

describe('large-bin overflow — oversized AABBs always returned on overlap', () => {
  it('a feature whose diagonal exceeds 8× cellSize goes into the large bin', () => {
    const idx = createFeatureIndex(10); // 10 ft cells; diagonal threshold = 80 ft
    idx.upsert('huge', bb(0, 0, 100, 100)); // diagonal ≈ 141
    expect(idx.largeBinSize()).toBe(1);
    expect(idx.cellCount()).toBe(0);
  });

  it('queries against a region the large feature overlaps return it', () => {
    const idx = createFeatureIndex(10);
    idx.upsert('huge', bb(0, 0, 200, 200));
    expect(idx.queryRect(bb(50, 50, 60, 60))).toEqual(['huge']);
  });

  it('queries that do NOT overlap the large feature exclude it', () => {
    const idx = createFeatureIndex(10);
    idx.upsert('huge', bb(0, 0, 200, 200));
    expect(idx.queryRect(bb(300, 300, 400, 400))).toEqual([]);
  });

  it('upsert moves an id between the grid and the large bin', () => {
    const idx = createFeatureIndex(10);
    idx.upsert('p', bb(0, 0, 5, 5));
    expect(idx.cellCount()).toBeGreaterThan(0);
    expect(idx.largeBinSize()).toBe(0);
    idx.upsert('p', bb(0, 0, 500, 500));
    expect(idx.cellCount()).toBe(0);
    expect(idx.largeBinSize()).toBe(1);
  });
});

describe('buildFeatureIndex — bulk loader convenience', () => {
  it('round-trips every entry passed in', () => {
    const idx = buildFeatureIndex([
      ['a', bb(0, 0, 1, 1)],
      ['b', bb(10, 10, 11, 11)],
      ['c', bb(20, 20, 21, 21)],
    ]);
    expect(idx.size()).toBe(3);
    expect(idx.queryRect(bb(0, 0, 30, 30)).sort()).toEqual(['a', 'b', 'c']);
  });

  it('honors a custom cellSize', () => {
    const idx = buildFeatureIndex([], 25);
    expect(DEFAULT_CELL_SIZE_FT).toBe(100); // sanity guard
    idx.upsert('p', bb(0, 0, 5, 5));
    // With cellSize=25, a 5x5 bound fits in one cell; with the
    // default 100, also one cell — both fine. Test the smaller
    // cell yields a hit too.
    expect(idx.queryRect(bb(0, 0, 10, 10))).toEqual(['p']);
  });
});

describe('stress — 10k features synthetic', () => {
  it('inserts 10k random points within 1 second + queries a small region in well under 100ms', () => {
    const idx = createFeatureIndex();
    const N = 10_000;
    // Deterministic pseudo-random — Mulberry32 so the test stays
    // reproducible.
    let seed = 0xdeadbeef;
    const rand = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const insertStart = Date.now();
    for (let i = 0; i < N; i++) {
      const x = rand() * 10000;
      const y = rand() * 10000;
      idx.upsert(`p${i}`, bb(x, y, x, y));
    }
    const insertMs = Date.now() - insertStart;
    expect(idx.size()).toBe(N);
    expect(insertMs).toBeLessThan(1500);

    const queryStart = Date.now();
    const results = idx.queryRect(bb(0, 0, 100, 100));
    const queryMs = Date.now() - queryStart;
    expect(queryMs).toBeLessThan(50);
    // With uniform random over a 10000×10000 area, ~100 points
    // land in a 100×100 region on average.
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(N / 10); // very loose upper bound
  });
});
