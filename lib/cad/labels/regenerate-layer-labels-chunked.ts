// lib/cad/labels/regenerate-layer-labels-chunked.ts
//
// cad-desktop-tauri-and-perf Slice P4 — non-blocking label
// regeneration.
//
// `regenerateLayerLabels` runs synchronously and walks every feature
// on a layer. On a 5k-point survey with rich label preferences a
// single prefs toggle can stall the main thread for ~200 ms — long
// enough that the slider's hold gesture stutters and the canvas
// drops a frame on the very edit the user just made.
//
// This module wraps the same pure pipeline (`generateLabelsForFeature`
// per feature, batched into the same id → labels map shape
// `regenerateLayerLabels` returns) but yields control to the event
// loop every `LABEL_REGEN_CHUNK_SIZE` features. The browser paints
// between chunks, the canvas keeps animating, and the surveyor
// stops seeing dropped frames during heavy prefs edits.
//
// Why not a Web Worker? `generateLabelsForFeature` reads
// `useDrawingStore.getState()` for the document's
// `codeDisplayMode` + `drawingScale`. Workers don't share zustand
// state with the main thread, so a Worker rewrite would need the
// callee refactored to take those settings explicitly. That's a
// follow-up (P4b). For now the chunked approach delivers the same
// user-facing non-blocking behaviour without that refactor.
//
// Pure module — the caller passes the same `(features, layer,
// displayPrefs)` triple `regenerateLayerLabels` takes and gets back
// the same `Map<featureId, TextLabel[]>`.

import type { DisplayPreferences, Feature, Layer, TextLabel } from '../types';
import { generateLabelsForFeature } from './generate-labels';

/** Process this many features per scheduler yield. Tuned for ~16 ms
 *  budget per chunk on the median 2020 laptop (typical
 *  `generateLabelsForFeature` cost on point features is < 0.1 ms);
 *  keeps each chunk well under one render frame so the canvas keeps
 *  animating. Exported so the LayerPreferencesPanel hot path can
 *  decide whether the chunked or the sync version is appropriate
 *  for the feature count at hand. */
export const LABEL_REGEN_CHUNK_SIZE = 200;

/** Feature-count threshold below which the synchronous
 *  `regenerateLayerLabels` is preferred — the chunked version has
 *  a small fixed scheduling overhead per chunk that isn't worth
 *  paying on small layers. */
export const LABEL_REGEN_CHUNK_THRESHOLD = LABEL_REGEN_CHUNK_SIZE;

/** Yield to the event loop. Falls back to `setTimeout` when
 *  `queueMicrotask` isn't enough — we want to let the browser
 *  paint between chunks, not just flush microtasks. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // `setTimeout(0)` queues a macrotask; the browser is allowed to
    // process input + paint between macrotasks, which is exactly
    // what we want.
    setTimeout(resolve, 0);
  });
}

/** Non-blocking equivalent of `regenerateLayerLabels`. Walks the
 *  features in input order, yielding every `chunkSize` entries.
 *
 *  `signal` is honored: when aborted, the in-flight regen resolves
 *  with the partial map collected so far (callers can throw it
 *  away or commit just the labels generated so far). */
export async function regenerateLayerLabelsChunked(
  features: ReadonlyArray<Feature>,
  layer: Layer,
  displayPrefs: DisplayPreferences,
  options?: { chunkSize?: number; signal?: AbortSignal },
): Promise<Map<string, TextLabel[]>> {
  const chunkSize = options?.chunkSize ?? LABEL_REGEN_CHUNK_SIZE;
  const signal = options?.signal;
  const out = new Map<string, TextLabel[]>();
  let processed = 0;
  for (const feature of features) {
    if (signal?.aborted) return out;
    if (feature.layerId === layer.id) {
      out.set(feature.id, generateLabelsForFeature(feature, layer, displayPrefs));
    }
    processed += 1;
    if (processed % chunkSize === 0) {
      // Yield so the browser can paint a frame + process input.
      // eslint-disable-next-line no-await-in-loop
      await yieldToEventLoop();
    }
  }
  return out;
}

/** Pick the right regen entrypoint for the feature count. Sync below
 *  the threshold (avoids the per-chunk scheduling overhead), chunked
 *  above. Returns a Promise either way for a uniform caller shape. */
export async function regenerateLayerLabelsAuto(
  features: ReadonlyArray<Feature>,
  layer: Layer,
  displayPrefs: DisplayPreferences,
  options?: { chunkSize?: number; signal?: AbortSignal },
): Promise<Map<string, TextLabel[]>> {
  if (features.length < LABEL_REGEN_CHUNK_THRESHOLD) {
    const out = new Map<string, TextLabel[]>();
    for (const feature of features) {
      if (feature.layerId === layer.id) {
        out.set(feature.id, generateLabelsForFeature(feature, layer, displayPrefs));
      }
    }
    return out;
  }
  return regenerateLayerLabelsChunked(features, layer, displayPrefs, options);
}
