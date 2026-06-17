// __tests__/cad/spatial/viewport-cull-cache.test.ts
//
// cad-desktop-tauri-and-perf Slice P2 — viewport-cull result cache.
// The cache memoizes the cull result keyed by a quantized AABB hash
// + an opaque version stamp. Pure module — every test driven
// directly without a Pixi mount.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createViewportCullCache,
  getCachedCull,
  invalidateCullCache,
  setCachedCull,
  viewportBBoxKey,
} from '@/lib/cad/spatial/viewport-cull-cache';
import type { BoundingBox } from '@/lib/cad/types';

const bb = (minX: number, minY: number, maxX: number, maxY: number): BoundingBox =>
  ({ minX, minY, maxX, maxY });

describe('viewportBBoxKey — stable hash', () => {
  it('returns the same key for the same bbox', () => {
    expect(viewportBBoxKey(bb(0, 0, 100, 100))).toBe(viewportBBoxKey(bb(0, 0, 100, 100)));
  });

  it('returns different keys for different bboxes', () => {
    expect(viewportBBoxKey(bb(0, 0, 100, 100))).not.toBe(viewportBBoxKey(bb(0, 0, 200, 100)));
  });

  it('quantizes to 0.5 ft so sub-pixel jitter doesn\'t bust the cache', () => {
    // Two AABBs that differ by < 0.25 ft should land on the same key.
    expect(viewportBBoxKey(bb(0.1, 0.1, 100, 100))).toBe(viewportBBoxKey(bb(0.2, 0.2, 100, 100)));
  });

  it('returns null for malformed inputs', () => {
    expect(viewportBBoxKey(null)).toBeNull();
    expect(viewportBBoxKey({ minX: NaN, minY: 0, maxX: 1, maxY: 1 })).toBeNull();
    // Reversed maxX < minX is malformed too.
    expect(viewportBBoxKey({ minX: 10, minY: 0, maxX: 0, maxY: 10 })).toBeNull();
  });
});

describe('createViewportCullCache — fresh slot', () => {
  it('starts empty (key + version + value all unset)', () => {
    const cache = createViewportCullCache<string[]>();
    expect(cache.key).toBeNull();
    expect(cache.version).toBeUndefined();
    expect(cache.value).toBeNull();
  });
});

describe('getCachedCull / setCachedCull — hit / miss', () => {
  it('hit when both viewport key + version match', () => {
    const cache = createViewportCullCache<string[]>();
    const version = { tag: 'v1' };
    setCachedCull(cache, bb(0, 0, 100, 100), version, ['a', 'b']);
    expect(getCachedCull(cache, bb(0, 0, 100, 100), version)).toEqual(['a', 'b']);
  });

  it('miss when viewport changes (camera moved)', () => {
    const cache = createViewportCullCache<string[]>();
    const version = { tag: 'v1' };
    setCachedCull(cache, bb(0, 0, 100, 100), version, ['a']);
    expect(getCachedCull(cache, bb(50, 0, 150, 100), version)).toBeNull();
  });

  it('miss when version changes (feature add/remove invalidates immediately)', () => {
    const cache = createViewportCullCache<string[]>();
    const a = { tag: 'v1' };
    const b = { tag: 'v2' };
    setCachedCull(cache, bb(0, 0, 100, 100), a, ['a']);
    expect(getCachedCull(cache, bb(0, 0, 100, 100), b)).toBeNull();
  });

  it('hit survives sub-quant jitter on the same camera position', () => {
    const cache = createViewportCullCache<string[]>();
    const version = { tag: 'v1' };
    setCachedCull(cache, bb(0.1, 0.1, 100, 100), version, ['a']);
    expect(getCachedCull(cache, bb(0.2, 0.2, 100, 100), version)).toEqual(['a']);
  });

  it('miss when viewport is null (cache can\'t safely key)', () => {
    const cache = createViewportCullCache<string[]>();
    const version = { tag: 'v1' };
    setCachedCull(cache, bb(0, 0, 100, 100), version, ['a']);
    expect(getCachedCull(cache, null, version)).toBeNull();
  });
});

describe('invalidateCullCache — manual reset', () => {
  it('subsequent gets return null', () => {
    const cache = createViewportCullCache<string[]>();
    const version = { tag: 'v1' };
    setCachedCull(cache, bb(0, 0, 100, 100), version, ['a']);
    invalidateCullCache(cache);
    expect(getCachedCull(cache, bb(0, 0, 100, 100), version)).toBeNull();
  });
});

describe('CanvasViewport — Slice P2 wiring', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
    'utf8',
  );

  it('imports the viewport-cull cache helpers', () => {
    expect(SRC).toMatch(
      /import \{\s*\n\s*createViewportCullCache,\s*\n\s*getCachedCull,\s*\n\s*setCachedCull,\s*\n\s*\} from '@\/lib\/cad\/spatial\/viewport-cull-cache'/,
    );
  });

  it('declares cullCacheRef alongside the existing featureIndexCacheRef', () => {
    expect(SRC).toMatch(/const cullCacheRef = useRef\(createViewportCullCache<Feature\[\]>\(\)\)/);
  });

  it('checks the cache before falling back to cullFeaturesWithIndex', () => {
    expect(SRC).toMatch(
      /const cached = getCachedCull\(cullCacheRef\.current, viewportBBox, indexCache\)/,
    );
    expect(SRC).toMatch(/setCachedCull\(cullCacheRef\.current, viewportBBox, indexCache, culledFeatures\)/);
  });

  it('the cache version uses the indexCache identity (auto-invalidates on rebuild)', () => {
    // The setCachedCull call passes `indexCache` straight through —
    // when ensureFeatureIndex rebuilds (feature/layer change), the
    // new object identity busts the cache automatically.
    expect(SRC).toMatch(/setCachedCull\([\s\S]*?indexCache,/);
  });
});
