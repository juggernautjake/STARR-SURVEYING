// lib/cad/operations/offset-propagator.ts
//
// Slice 6 of cad-offset-tool-2026-05-29.md — mirrors
// `linked-instances.ts` but for offset features.
//
// When a source feature's geometry changes (the surveyor moves a
// line, edits a vertex, resizes a circle, etc.), every offset
// feature that was tagged with `offsetSourceId === source.id` in
// Slice 3 gets regenerated via the Slice-5 `recomputeOffsetGeometry`
// helper. The result is written via `updateFeatureGeometry` so the
// canvas re-renders in the same frame.
//
// Safety: a module-scope `_propagating` flag suppresses re-entry so
// the propagator's own writes don't trigger another pass. Deleted
// sources are NOT republished — the PropertyPanel's stale-link path
// (Slice 4) renders the warning.

import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { getOffsetMetadata } from './offset-metadata';
import { recomputeOffsetGeometry } from './recompute-offset-feature';
import type { Feature } from '@/lib/cad/types';

let _propagating = false;
let _unsubscribe: (() => void) | null = null;

/** Test-only escape hatch — read the propagation flag. Lets tests
 *  assert the re-entry guard worked without relying on internal
 *  module state. */
export function _isPropagating(): boolean {
  return _propagating;
}

/** Regenerate every offset feature linked to `sourceId` against the
 *  source's new geometry. Exported so it can be triggered directly
 *  in tests + by future entry points (e.g. an "Apply" button in the
 *  Phase-3 polish slices). */
export function propagateOffsetsFromSource(sourceId: string): void {
  if (_propagating) return;
  const drawingStore = useDrawingStore.getState();
  const source = drawingStore.getFeature(sourceId);
  if (!source) return;
  const features = drawingStore.document.features;

  _propagating = true;
  try {
    for (const f of Object.values(features)) {
      const metadata = getOffsetMetadata(f);
      if (!metadata || metadata.sourceId !== sourceId) continue;
      const recomputed = recomputeOffsetGeometry({
        sourceFeature: source,
        distance: metadata.distance,
        unit: metadata.unit,
        side: metadata.side,
        cornerHandling: metadata.cornerHandling,
      });
      // recompute returns null on unsupported geometry / collapse —
      // leave the offset's existing geometry alone in that case so
      // the surveyor doesn't lose work to a transient bad shape.
      if (!recomputed) continue;
      drawingStore.updateFeatureGeometry(f.id, recomputed.geometry);
    }
  } finally {
    _propagating = false;
  }
}

/** Walk every feature with offset metadata + check whether its
 *  source still exists. Returns the ids of offsets whose source has
 *  been deleted. The PropertyPanel + the Phase-3 stale-link warning
 *  use the same `describeOffsetSection` lookup at render time, so
 *  this helper is exposed mainly for the propagator's own bookkeeping
 *  + tests. */
export function findStaleOffsets(): string[] {
  const features = useDrawingStore.getState().document.features;
  const stale: string[] = [];
  for (const f of Object.values(features)) {
    const metadata = getOffsetMetadata(f);
    if (!metadata) continue;
    if (!features[metadata.sourceId]) stale.push(f.id);
  }
  return stale;
}

/** Mount the offset propagator. Idempotent — subsequent calls return
 *  the same unsubscribe handle. Should be invoked once at CAD
 *  shell mount, mirroring `mountLinkedInstanceSubscriber`. */
export function mountOffsetPropagator(): () => void {
  if (_unsubscribe) return _unsubscribe;
  let prevFeatures = useDrawingStore.getState().document.features;
  _unsubscribe = useDrawingStore.subscribe((state) => {
    const cur = state.document.features;
    if (cur === prevFeatures) return;
    if (_propagating) {
      prevFeatures = cur;
      return;
    }
    // Diff per id. Whenever a feature's geometry reference changed
    // we treat it as a potential source and re-propagate everything
    // hanging off it. Offset features themselves can't be sources
    // for the propagator's purposes — but we don't filter them out
    // here because a chained offset (offset-of-offset) is a
    // legitimate case + the inner loop only touches features whose
    // `offsetSourceId` matches.
    for (const [id, curFeat] of Object.entries(cur)) {
      const prevFeat = prevFeatures[id];
      if (!prevFeat) continue;
      if (prevFeat.geometry === curFeat.geometry) continue;
      propagateOffsetsFromSource(id);
    }
    prevFeatures = cur;
  });
  return _unsubscribe;
}

/** Stop the subscriber. Test cleanup + hot-reload safety. */
export function unmountOffsetPropagator(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

/** Test-only: clear the propagator + re-seed the internal "previous
 *  features" reference. Tests that mutate the store should call
 *  this between cases so the diff baseline matches reality. */
export function _resetOffsetPropagatorForTests(): void {
  unmountOffsetPropagator();
  _propagating = false;
}

// Re-exported for caller convenience so consumers don't have to
// import from two places when wiring the subscriber.
export type { Feature };
