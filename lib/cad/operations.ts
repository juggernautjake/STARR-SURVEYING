// lib/cad/operations.ts — Shared CAD operations (rotate, flip, duplicate, clipboard)
// Used by FeatureContextMenu, ToolBar variants, and keyboard shortcuts.

import { generateId } from './types';
import type { Feature, Point2D } from './types';
import { rotate, mirror, scale, transformFeature, translate } from './geometry/transform';
import { computeBounds } from './geometry/bounds';
import { offsetPolyline } from './geometry/offset';
import { useDrawingStore } from './store/drawing-store';
import { useSelectionStore } from './store/selection-store';
import { useUndoStore, makeBatchEntry, makeAddFeatureEntry, makeRemoveFeatureEntry } from './store/undo-store';
import { useViewportStore } from './store/viewport-store';

// ─────────────────────────────────────────────
// Clipboard
// ─────────────────────────────────────────────
let _clipboard: Feature[] = [];

export function copyToClipboard(features: Feature[]): void {
  _clipboard = features.map((f) => ({ ...f }));
}

export function pasteFromClipboard(
  offsetX = 10,
  offsetY = -10,
): Feature[] {
  if (_clipboard.length === 0) return [];
  return _clipboard.map((f) => {
    const newF: Feature = JSON.parse(JSON.stringify(f));
    newF.id = generateId();
    // Offset geometry
    const geom = newF.geometry;
    if (geom.type === 'POINT' && geom.point) {
      geom.point = { x: geom.point.x + offsetX, y: geom.point.y + offsetY };
    } else if (geom.type === 'LINE') {
      if (geom.start) geom.start = { x: geom.start.x + offsetX, y: geom.start.y + offsetY };
      if (geom.end) geom.end = { x: geom.end.x + offsetX, y: geom.end.y + offsetY };
    } else if (geom.vertices) {
      geom.vertices = geom.vertices.map((v) => ({ x: v.x + offsetX, y: v.y + offsetY }));
    }
    return newF;
  });
}

export function hasClipboard(): boolean {
  return _clipboard.length > 0;
}

export function getClipboardCount(): number {
  return _clipboard.length;
}

// ─────────────────────────────────────────────
// Centroid helpers
// ─────────────────────────────────────────────

/** Get world-space vertices for a feature (for centroid calc) */
export function getFeaturePoints(feature: Feature): Point2D[] {
  const g = feature.geometry;
  if (g.type === 'POINT' && g.point) return [g.point];
  if (g.type === 'LINE') return [g.start!, g.end!].filter(Boolean);
  return g.vertices ?? [];
}

/** Compute bounding-box centroid of a set of features */
export function computeSelectionCentroid(featureIds: string[]): Point2D {
  const drawingStore = useDrawingStore.getState();
  const allPts: Point2D[] = [];
  for (const id of featureIds) {
    const f = drawingStore.getFeature(id);
    if (f) allPts.push(...getFeaturePoints(f));
  }
  if (allPts.length === 0) return { x: 0, y: 0 };
  const bounds = computeBounds(allPts);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

// ─────────────────────────────────────────────
// Transform operations
// ─────────────────────────────────────────────

export function rotateSelection(angleDeg: number, center?: Point2D): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  const pivot = center ?? computeSelectionCentroid(ids);
  const angleRad = (angleDeg * Math.PI) / 180;

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => rotate(p, pivot, angleRad));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Rotate ${angleDeg}°`, ops));
  }
}

export function flipSelectionHorizontal(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  const centroid = computeSelectionCentroid(ids);
  // Mirror line: vertical line through centroid (from centroid going straight up)
  const lineA: Point2D = { x: centroid.x, y: centroid.y - 1 };
  const lineB: Point2D = { x: centroid.x, y: centroid.y + 1 };

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => mirror(p, lineA, lineB));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry('Flip Horizontal', ops));
  }
}

export function flipSelectionVertical(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  const centroid = computeSelectionCentroid(ids);
  // Mirror line: horizontal line through centroid
  const lineA: Point2D = { x: centroid.x - 1, y: centroid.y };
  const lineB: Point2D = { x: centroid.x + 1, y: centroid.y };

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => mirror(p, lineA, lineB));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry('Flip Vertical', ops));
  }
}

export function scaleSelection(factor: number): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0 || factor <= 0) return;

  const centroid = computeSelectionCentroid(ids);

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => scale(p, centroid, factor));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Scale ×${factor}`, ops));
  }
}

/**
 * Scale the selection non-uniformly (distort) around a pivot point.
 * scaleX and scaleY are independent multipliers for each axis.
 */
export function scaleSelectionXY(scaleX: number, scaleY: number, pivot?: Point2D): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0 || scaleX <= 0 || scaleY <= 0) return;

  const center = pivot ?? computeSelectionCentroid(ids);

  const distort = (p: Point2D): Point2D => ({
    x: center.x + (p.x - center.x) * scaleX,
    y: center.y + (p.y - center.y) * scaleY,
  });

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, distort);
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Distort ×X${scaleX} ×Y${scaleY}`, ops));
  }
}

export function duplicateSelection(offsetX = 10, offsetY = -10): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  // Build a mapping of old polylineGroupId → new polylineGroupId so that all
  // duplicated segments from the same polyline group share the same new group ID.
  const groupIdMap = new Map<string, string>();

  const newFeatures: Feature[] = [];
  for (const id of ids) {
    const f = drawingStore.getFeature(id);
    if (!f) continue;
    const newF: Feature = JSON.parse(JSON.stringify(f));
    newF.id = generateId();
    // Offset geometry
    const geom = newF.geometry;
    if (geom.type === 'POINT' && geom.point) {
      geom.point = { x: geom.point.x + offsetX, y: geom.point.y + offsetY };
    } else if (geom.type === 'LINE') {
      if (geom.start) geom.start = { x: geom.start.x + offsetX, y: geom.start.y + offsetY };
      if (geom.end) geom.end = { x: geom.end.x + offsetX, y: geom.end.y + offsetY };
    } else if (geom.vertices) {
      geom.vertices = geom.vertices.map((v) => ({ x: v.x + offsetX, y: v.y + offsetY }));
    }
    // Remap polylineGroupId: all duplicated segments from the same group share a new group ID
    const oldGroupId = f.properties.polylineGroupId as string | undefined;
    if (oldGroupId) {
      if (!groupIdMap.has(oldGroupId)) {
        groupIdMap.set(oldGroupId, generateId());
      }
      newF.properties = { ...newF.properties, polylineGroupId: groupIdMap.get(oldGroupId)! };
    }
    newFeatures.push(newF);
  }

  drawingStore.addFeatures(newFeatures);
  const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
  undoStore.pushUndo(makeBatchEntry('Duplicate', ops));

  // Select the new features
  selectionStore.selectMultiple(
    newFeatures.map((f) => f.id),
    'REPLACE',
  );
}

export function copyCadSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  copyToClipboard(features);
}

export function pasteCadClipboard(pasteWorldX?: number, pasteWorldY?: number): void {
  if (!hasClipboard()) return;
  const drawingStore = useDrawingStore.getState();
  const selectionStore = useSelectionStore.getState();
  const undoStore = useUndoStore.getState();

  // Compute clipboard centroid to offset paste to the right position
  let offsetX = 10;
  let offsetY = -10;
  if (pasteWorldX !== undefined && pasteWorldY !== undefined) {
    // Find clipboard centroid
    const clipPts: Point2D[] = [];
    for (const f of _clipboard) clipPts.push(...getFeaturePoints(f));
    if (clipPts.length > 0) {
      const bounds = computeBounds(clipPts);
      const clipCx = (bounds.minX + bounds.maxX) / 2;
      const clipCy = (bounds.minY + bounds.maxY) / 2;
      offsetX = pasteWorldX - clipCx;
      offsetY = pasteWorldY - clipCy;
    }
  }

  const newFeatures = pasteFromClipboard(offsetX, offsetY);
  drawingStore.addFeatures(newFeatures);
  const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
  undoStore.pushUndo(makeBatchEntry('Paste', ops));
  selectionStore.selectMultiple(
    newFeatures.map((f) => f.id),
    'REPLACE',
  );
}

export function deleteSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  for (const f of features) drawingStore.removeFeature(f.id);
  selectionStore.deselectAll();
  if (features.length === 1) {
    undoStore.pushUndo(makeRemoveFeatureEntry(features[0]));
  } else if (features.length > 1) {
    const ops = features.map((f) => ({ type: 'REMOVE_FEATURE' as const, data: f }));
    undoStore.pushUndo(makeBatchEntry('Delete', ops));
  }
}

export function selectSimilarType(featureId: string): void {
  const drawingStore = useDrawingStore.getState();
  const selectionStore = useSelectionStore.getState();
  const feature = drawingStore.getFeature(featureId);
  if (!feature) return;
  // Select features of the same type on the same layer (matches AutoCAD "Select Similar" behaviour)
  const similarIds = drawingStore
    .getAllFeatures()
    .filter((f) => f.type === feature.type && f.layerId === feature.layerId)
    .map((f) => f.id);
  selectionStore.selectMultiple(similarIds, 'REPLACE');
}

export function zoomToSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const viewportStore = useViewportStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  const pts = features.flatMap(getFeaturePoints);
  if (pts.length === 0) return;
  const bounds = computeBounds(pts);
  viewportStore.zoomToExtents(bounds, 0.15);
}
