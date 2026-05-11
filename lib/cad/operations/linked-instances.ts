// lib/cad/operations/linked-instances.ts
//
// Phase 8 §11.7 Slice 10 — linked-instance propagation.
// When a feature is flagged as a duplicate via the
// LayerTransferDialog with `linkDuplicatesToSource` on, it
// carries:
//   properties.linkedSourceId   — source feature id
//   properties.linkedOffsetX/Y  — world-feet translation
//
// This module mounts a zustand subscription that watches
// the drawing store. When a source feature's geometry
// changes, every linked duplicate gets regenerated:
// clone the source's NEW geometry, translate by the stored
// offset, write back.
//
// When a linked duplicate is edited directly (its geometry
// changes outside a propagation pass), we break the link
// — the surveyor's edit becomes the new truth and the
// duplicate stops tracking the source.
//
// Safety: a module-scope `_propagating` flag suppresses
// re-entry, so the propagation's own writes don't bounce
// back into another propagation pass.

import type { Feature, FeatureGeometry, Point2D } from '../types';
import { useDrawingStore } from '../store/drawing-store';

let _propagating = false;
let _unsubscribe: (() => void) | null = null;

/**
 * Translate every coordinate in a geometry by (dx, dy).
 * Same shape coverage as the transfer kernel.
 */
function translateGeometry(geom: FeatureGeometry, dx: number, dy: number): FeatureGeometry {
  if (dx === 0 && dy === 0) {
    return JSON.parse(JSON.stringify(geom)) as FeatureGeometry;
  }
  const trans = (p: Point2D): Point2D => ({ x: p.x + dx, y: p.y + dy });
  const cloned = JSON.parse(JSON.stringify(geom)) as FeatureGeometry;
  if (cloned.type === 'POINT' && cloned.point) {
    cloned.point = trans(cloned.point);
  } else if (cloned.type === 'LINE') {
    if (cloned.start) cloned.start = trans(cloned.start);
    if (cloned.end)   cloned.end   = trans(cloned.end);
  } else if (cloned.type === 'CIRCLE' && cloned.circle) {
    cloned.circle = { ...cloned.circle, center: trans(cloned.circle.center) };
  } else if (cloned.type === 'ARC' && cloned.arc) {
    cloned.arc = { ...cloned.arc, center: trans(cloned.arc.center) };
  } else if (cloned.type === 'ELLIPSE' && cloned.ellipse) {
    cloned.ellipse = { ...cloned.ellipse, center: trans(cloned.ellipse.center) };
  } else if (cloned.type === 'SPLINE' && cloned.spline) {
    cloned.spline = { ...cloned.spline, controlPoints: cloned.spline.controlPoints.map(trans) };
  } else if (cloned.type === 'TEXT' && cloned.point) {
    cloned.point = trans(cloned.point);
  } else if (cloned.type === 'IMAGE' && cloned.image) {
    cloned.image = { ...cloned.image, position: trans(cloned.image.position) };
  } else if (cloned.vertices) {
    cloned.vertices = cloned.vertices.map(trans);
  }
  return cloned;
}

/**
 * Walk every feature in the document and find duplicates
 * whose `linkedSourceId` matches `sourceId`. Each gets its
 * geometry rewritten to source-NEW-geometry + storedOffset.
 */
function propagateFromSource(sourceId: string, newGeom: FeatureGeometry): void {
  const drawingStore = useDrawingStore.getState();
  const features = drawingStore.document.features;
  _propagating = true;
  try {
    for (const f of Object.values(features)) {
      if (f.properties?.linkedSourceId !== sourceId) continue;
      const dx = typeof f.properties.linkedOffsetX === 'number' ? f.properties.linkedOffsetX : 0;
      const dy = typeof f.properties.linkedOffsetY === 'number' ? f.properties.linkedOffsetY : 0;
      const next = translateGeometry(newGeom, dx, dy);
      drawingStore.updateFeatureGeometry(f.id, next);
    }
  } finally {
    _propagating = false;
  }
}

/**
 * Strip link stamps from a feature whose geometry was
 * edited directly. The surveyor's edit becomes the new
 * truth; subsequent source changes stop tracking.
 */
function breakLink(featureId: string): void {
  const drawingStore = useDrawingStore.getState();
  const feat = drawingStore.getFeature(featureId);
  if (!feat) return;
  if (feat.properties?.linkedSourceId == null) return;
  const nextProps = { ...feat.properties };
  delete nextProps.linkedSourceId;
  delete nextProps.linkedOffsetX;
  delete nextProps.linkedOffsetY;
  nextProps.linkBrokenAt = new Date().toISOString();
  drawingStore.updateFeature(featureId, { properties: nextProps });
}

/**
 * Mount the linked-instance subscriber. Idempotent —
 * subsequent calls return the same unsubscribe handle.
 * Should be invoked once from CADLayout mount.
 */
export function mountLinkedInstanceSubscriber(): () => void {
  if (_unsubscribe) return _unsubscribe;
  let prevFeatures = useDrawingStore.getState().document.features;
  _unsubscribe = useDrawingStore.subscribe((state) => {
    const cur = state.document.features;
    if (cur === prevFeatures) return;
    // Diff the feature table by id. For each id present in
    // both, if the geometry reference changed:
    //   - propagating? skip — our own write loop.
    //   - source flagged? propagate to dependents.
    //   - linked duplicate? break the link.
    if (!_propagating) {
      for (const [id, curFeat] of Object.entries(cur)) {
        const prevFeat = prevFeatures[id];
        if (!prevFeat) continue;
        if (prevFeat.geometry === curFeat.geometry) continue;
        // Geometry changed for this feature.
        if (curFeat.properties?.linkedSourceId != null) {
          // Direct edit on a linked duplicate → break link.
          breakLink(id);
          continue;
        }
        // Any feature whose change propagates to linked
        // dependents. Walking the whole feature table per
        // source change is O(n); fine for typical document
        // sizes. Optimise with a per-source index if a
        // profile shows it.
        propagateFromSource(id, curFeat.geometry);
      }
    }
    prevFeatures = cur;
  });
  return _unsubscribe;
}

/**
 * Stop the subscriber. Test cleanup + hot-reload safety.
 */
export function unmountLinkedInstanceSubscriber(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}
