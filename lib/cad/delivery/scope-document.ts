// lib/cad/delivery/scope-document.ts
//
// Produce a filtered copy of a DrawingDocument for scoped export — only
// the current selection, or only a chosen set of layers. Every exporter
// (CSV, PNEZD, DXF, LandXML, GeoJSON) consumes a DrawingDocument, so
// narrowing the document up front lets all of them export "by scope"
// without per-writer changes.
//
// Layers/settings/style libraries are preserved as-is; only `features`
// (and, for a layer scope, `layerOrder`/`layers`) are narrowed so the
// output still carries the styling context the features reference.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §5
// (export by scope)

import type { DrawingDocument, Feature } from '../types';

export type ExportScope =
  | { kind: 'ALL' }
  | { kind: 'SELECTION'; featureIds: Iterable<string> }
  | { kind: 'LAYERS'; layerIds: Iterable<string> };

/** Returns a shallow document clone whose `features` match the scope. */
export function scopeDocument(
  doc: DrawingDocument,
  scope: ExportScope,
): DrawingDocument {
  if (scope.kind === 'ALL') return doc;

  const keep: Record<string, Feature> = {};

  if (scope.kind === 'SELECTION') {
    const ids = new Set(scope.featureIds);
    for (const id of ids) {
      const f = doc.features[id];
      if (f) keep[id] = f;
    }
    return { ...doc, features: keep };
  }

  // LAYERS
  const layerIds = new Set(scope.layerIds);
  for (const [id, f] of Object.entries(doc.features)) {
    if (layerIds.has(f.layerId)) keep[id] = f;
  }
  // Narrow the layer set + order to the chosen layers so downstream
  // writers that enumerate layers don't emit empty ones.
  const layers: DrawingDocument['layers'] = {};
  for (const lid of layerIds) {
    if (doc.layers[lid]) layers[lid] = doc.layers[lid];
  }
  const layerOrder = doc.layerOrder.filter((lid) => layerIds.has(lid));
  return { ...doc, features: keep, layers, layerOrder };
}

/** Count how many features a scope would export (for UI/logging). */
export function scopedFeatureCount(
  doc: DrawingDocument,
  scope: ExportScope,
): number {
  return Object.keys(scopeDocument(doc, scope).features).length;
}
