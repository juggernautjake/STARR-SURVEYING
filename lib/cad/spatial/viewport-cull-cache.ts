// lib/cad/spatial/viewport-cull-cache.ts
//
// cad-desktop-tauri-and-perf Slice P2 — viewport-cull result cache.
//
// The existing render loop in `CanvasViewport.tsx` already does
// spatial-index-accelerated culling (Phase 7 §19), but every render
// re-runs the query — even when nothing moved. This module adds a
// thin memoization layer on top:
//
//   * Hash the viewport AABB to a stable string (with epsilon
//     rounding so floating-point jitter doesn't bust the cache).
//   * Pair the hash with an opaque `indexVersion` so a feature
//     add/remove invalidates immediately.
//   * On a hit, hand back the previously-computed result array.
//
// Pure — no Pixi or React imports. The CanvasViewport caller wraps
// the cache in a useRef so the cached result survives across React
// re-renders.

import type { BoundingBox } from '../types';

/** Quantization step (world units) for the viewport AABB hash.
 *  At 0.5 ft the cache survives sub-pixel pan jitter on common
 *  zoom levels but invalidates on a real camera move. */
const HASH_QUANT = 0.5;

/** Pure helper — turn a viewport AABB into a stable cache key.
 *  Quantizes each edge so two camera positions that round to the
 *  same world-rect share a cache slot. Returns `null` for
 *  malformed inputs so callers can bypass the cache when they
 *  can't safely key it. */
export function viewportBBoxKey(viewport: BoundingBox | null): string | null {
  if (!viewport) return null;
  const { minX, minY, maxX, maxY } = viewport;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    maxX < minX ||
    maxY < minY
  ) {
    return null;
  }
  const q = (v: number): number => Math.round(v / HASH_QUANT) * HASH_QUANT;
  return `${q(minX)},${q(minY)},${q(maxX)},${q(maxY)}`;
}

export interface ViewportCullCache<T> {
  /** Latest hashed viewport key. */
  key: string | null;
  /** Opaque version stamp invalidating the cache when the feature
   *  index identity changes. */
  version: unknown;
  /** Most recently computed cull result. */
  value: T | null;
}

/** Build an empty cache. Generic over the cull-result type so
 *  callers that hand back a `Feature[]` (the render path) and
 *  callers that hand back a `string[]` (a future hit-test path)
 *  share the same memo. */
export function createViewportCullCache<T>(): ViewportCullCache<T> {
  return { key: null, version: undefined, value: null };
}

/** Look up a cached result. Returns the stored value when both the
 *  hashed key and the version stamp match; `null` otherwise. */
export function getCachedCull<T>(
  cache: ViewportCullCache<T>,
  viewport: BoundingBox | null,
  version: unknown,
): T | null {
  const key = viewportBBoxKey(viewport);
  if (key === null) return null;
  if (cache.key !== key) return null;
  if (cache.version !== version) return null;
  return cache.value;
}

/** Store a cull result keyed by the viewport hash + version stamp. */
export function setCachedCull<T>(
  cache: ViewportCullCache<T>,
  viewport: BoundingBox | null,
  version: unknown,
  value: T,
): void {
  cache.key = viewportBBoxKey(viewport);
  cache.version = version;
  cache.value = value;
}

/** Drop the stored result. Use when the caller knows the upstream
 *  is invalidated (e.g. layer-visibility toggle). */
export function invalidateCullCache<T>(cache: ViewportCullCache<T>): void {
  cache.key = null;
  cache.version = undefined;
  cache.value = null;
}
