// lib/cad/perf/harness.ts
//
// cad-desktop-tauri-and-perf Slice N1e — profiling harness driver.
//
// Stitches the three N1 pieces together:
//   - the deterministic fixtures from `./fixtures`
//   - the render-marker histogram from `./render-markers`
//   - whatever drawing-store sink the caller hands in (in real
//     use that's the `useDrawingStore` instance; in tests it's a
//     mock sink so we don't have to spin up the whole store)
//
// Public surface:
//
//   loadProfileFixture(features, sink, options?)
//     Resets the document (if the sink supports it), guarantees
//     the synthetic layer exists, and pushes `features` in. The
//     dev-overlay button (N1f) calls this for each named size.
//
//   captureProfileWindow(durationMs, options?)
//     Reset histogram → wait `durationMs` → snapshot. This is
//     the orchestration primitive — the render loop runs on
//     rAF independently, dropping samples into the histogram
//     while we wait.
//
// The fixture loading is deliberately tiny: drop existing
// features, ensure the synthetic layer, addFeatures(...) once.
// We don't repaint here — the render loop wakes off the store's
// dirty-region tracking and the Pixi container subscription.

import { DEFAULT_SYNTHETIC_LAYER_ID } from './fixtures';
import {
  getRenderProfile,
  resetRenderProfile,
  type RenderProfile,
} from './render-markers';
import type { Feature, Layer } from '../types';

/**
 * Minimum drawing-store surface the harness needs. `addFeatures`
 * is the only hard requirement; the optional members let the
 * caller use whatever subset of the real store makes sense
 * (`newDocument` for a clean slate, `addLayer` for a synthetic
 * layer the default doc doesn't already include).
 */
export interface ProfileFixtureSink {
  addFeatures: (features: Feature[]) => void;
  addLayer?: (layer: Layer) => void;
  newDocument?: () => void;
  /** Optional check the harness uses to skip `addLayer` when the
   *  layer is already in the doc (e.g. `'DEFAULT'`). Returning
   *  `undefined` is treated as "not present". */
  getLayer?: (id: string) => Layer | undefined;
}

export interface LoadProfileFixtureOptions {
  /** Layer id every feature gets routed to. Defaults to
   *  `DEFAULT_SYNTHETIC_LAYER_ID` (`'L1'`). */
  layerId?: string;
  /** When true (the default), call `sink.newDocument` before
   *  loading so the existing doc's features don't pollute the
   *  profile. Set false to layer fixtures on top of a real doc. */
  reset?: boolean;
}

export interface LoadProfileFixtureResult {
  /** Number of features that were pushed into the sink. */
  loaded: number;
  /** Whether `addLayer` was called (false when the sink's
   *  `getLayer(layerId)` already returned a Layer). */
  layerCreated: boolean;
  /** Whether `newDocument` was called. False when `reset: false`
   *  or the sink doesn't implement it. */
  reset: boolean;
  /** Wall-clock spent inside the sink (sink calls + the JS-side
   *  feature push, NOT the subsequent render). Useful for spotting
   *  fixture-load regressions independent of render perf. */
  loadMs: number;
}

const DEFAULT_LAYER_NAME_BY_ID: Record<string, string> = {
  L1: 'Layer 1 (synthetic)',
  L2: 'Layer 2 (synthetic)',
};

function makeSyntheticLayer(layerId: string): Layer {
  return {
    id: layerId,
    name: DEFAULT_LAYER_NAME_BY_ID[layerId] ?? `Synthetic layer ${layerId}`,
    visible: true,
    locked: false,
    frozen: false,
    color: '#000000',
    lineWeight: 0.5,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder: 100,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
  };
}

/**
 * Load a generated fixture into a drawing-store-shaped sink. See
 * the module-level docstring for the orchestration contract.
 */
export function loadProfileFixture(
  features: Feature[],
  sink: ProfileFixtureSink,
  options: LoadProfileFixtureOptions = {},
): LoadProfileFixtureResult {
  const layerId = options.layerId ?? DEFAULT_SYNTHETIC_LAYER_ID;
  const reset = options.reset ?? true;
  const start = performance.now();

  let resetCalled = false;
  if (reset && sink.newDocument) {
    sink.newDocument();
    resetCalled = true;
  }

  let layerCreated = false;
  if (sink.addLayer) {
    const existing = sink.getLayer?.(layerId);
    if (!existing) {
      sink.addLayer(makeSyntheticLayer(layerId));
      layerCreated = true;
    }
  }

  sink.addFeatures(features);

  return {
    loaded: features.length,
    layerCreated,
    reset: resetCalled,
    loadMs: performance.now() - start,
  };
}

export interface CaptureProfileWindowOptions {
  /** When true (the default), `resetRenderProfile()` runs first
   *  so the histogram window only sees samples from inside the
   *  capture interval. */
  reset?: boolean;
  /** Caller-supplied delay implementation. Defaults to
   *  `setTimeout`. Tests pass a fake-timer-friendly variant. */
  delay?: (ms: number) => Promise<void>;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Reset the histogram, wait `durationMs`, return the snapshot
 * plus the actual elapsed wall-clock (which may exceed
 * `durationMs` if the main thread was busy).
 */
export async function captureProfileWindow(
  durationMs: number,
  options: CaptureProfileWindowOptions = {},
): Promise<{ profile: RenderProfile; elapsedMs: number }> {
  const reset = options.reset ?? true;
  const delay = options.delay ?? defaultDelay;

  if (reset) resetRenderProfile();
  const start = performance.now();
  await delay(Math.max(0, durationMs));
  const elapsedMs = performance.now() - start;
  return { profile: getRenderProfile(), elapsedMs };
}
