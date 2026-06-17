// lib/cad/perf/fixtures.ts
//
// cad-desktop-tauri-and-perf Slice N1d — profiling fixtures.
//
// The Perf overlay surfaces histograms, but the Phase-3 go/no-go
// call needs APPLES-TO-APPLES comparisons across three sizes:
// small (real Garland file ~ a few hundred features), medium
// (50k synthetic), large (200k synthetic). Garland comes from the
// repo's existing TRV imports; this module is the synthetic side
// — a deterministic feature generator the harness drives.
//
// Design notes:
//
//   - Deterministic mulberry32 PRNG seeded per call so two runs
//     with the same seed produce byte-identical feature arrays.
//     Lets us snapshot specific seeds in tests + commit them
//     as the canonical "synthetic 50k" / "synthetic 200k"
//     baselines.
//   - Output stays on a single layer (`'L1'` by default) with
//     the default feature style so downstream perf code doesn't
//     have to know about the synthetic layer registry.
//   - Geometry is a 40 / 40 / 20 mix of POINT / LINE / POLYLINE
//     so we exercise the three biggest hot paths in
//     `renderFeatures` (point dots, line segments, multi-vertex
//     pixi geometry).
//   - The world extent grows with √count so density stays roughly
//     constant — 50k features in a 1ft × 1ft square would degenerate
//     to all-in-one-cell, defeating the spatial index test.

import { DEFAULT_FEATURE_STYLE } from '../constants';
import type { Feature } from '../types';

export const FIXTURE_SIZES = {
  small: 1_000,
  medium: 50_000,
  large: 200_000,
} as const;
export type FixtureSize = keyof typeof FIXTURE_SIZES;

export const DEFAULT_SYNTHETIC_SEED = 0xc0ffee;
export const DEFAULT_SYNTHETIC_LAYER_ID = 'L1';

export interface SyntheticFixtureOptions {
  /** Seed for the mulberry32 PRNG. Same seed + same count =>
   *  byte-identical Feature[]. Defaults to `DEFAULT_SYNTHETIC_SEED`. */
  seed?: number;
  /** All features land on this layer. Defaults to
   *  `DEFAULT_SYNTHETIC_LAYER_ID`. */
  layerId?: string;
  /** ID prefix for the generated features (each gets a numeric
   *  suffix). Defaults to `'syn'`. */
  idPrefix?: string;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically build a Feature[] for profiling. Geometry
 * distribution: 40% POINT, 40% LINE, 20% POLYLINE (3–6 vertices).
 * World extent ≈ √count × 100 ft so density stays sensible.
 */
export function generateSyntheticFeatures(
  count: number,
  options: SyntheticFixtureOptions = {},
): Feature[] {
  if (!Number.isFinite(count) || count <= 0) return [];

  const seed = options.seed ?? DEFAULT_SYNTHETIC_SEED;
  const layerId = options.layerId ?? DEFAULT_SYNTHETIC_LAYER_ID;
  const idPrefix = options.idPrefix ?? 'syn';
  const rand = mulberry32(seed);
  const extent = Math.max(100, Math.sqrt(count) * 100);

  const out: Feature[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const r = rand();
    const x = rand() * extent;
    const y = rand() * extent;
    if (r < 0.4) {
      out[i] = {
        id: `${idPrefix}-${i}`,
        type: 'POINT',
        geometry: { type: 'POINT', point: { x, y } },
        layerId,
        style: { ...DEFAULT_FEATURE_STYLE },
        properties: {},
      };
    } else if (r < 0.8) {
      const dx = (rand() - 0.5) * 50;
      const dy = (rand() - 0.5) * 50;
      out[i] = {
        id: `${idPrefix}-${i}`,
        type: 'LINE',
        geometry: {
          type: 'LINE',
          start: { x, y },
          end: { x: x + dx, y: y + dy },
        },
        layerId,
        style: { ...DEFAULT_FEATURE_STYLE },
        properties: {},
      };
    } else {
      const vertexCount = 3 + Math.floor(rand() * 4); // 3..6
      const vertices = new Array(vertexCount);
      let px = x;
      let py = y;
      for (let v = 0; v < vertexCount; v += 1) {
        vertices[v] = { x: px, y: py };
        px += (rand() - 0.5) * 30;
        py += (rand() - 0.5) * 30;
      }
      out[i] = {
        id: `${idPrefix}-${i}`,
        type: 'POLYLINE',
        geometry: { type: 'POLYLINE', vertices },
        layerId,
        style: { ...DEFAULT_FEATURE_STYLE },
        properties: {},
      };
    }
  }
  return out;
}

/**
 * Convenience: build the canonical fixture for one of the three
 * named sizes. `medium`/`large` use the default seed so two
 * profiling runs on the same machine line up exactly.
 */
export function generateNamedFixture(
  size: FixtureSize,
  options: SyntheticFixtureOptions = {},
): Feature[] {
  return generateSyntheticFeatures(FIXTURE_SIZES[size], options);
}
