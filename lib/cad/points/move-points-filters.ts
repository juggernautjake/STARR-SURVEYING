// lib/cad/points/move-points-filters.ts
//
// cad-ux-cleanup-pass Slice 3 — pure helpers for the "Move points
// into this layer" search box + source filter. Extracted from
// NewLayerDialog so the rules are easy to unit-test (the dialog is
// React/DOM; these are framework-free).
//
// Two concerns:
//
//  1. **Comma-tokenized search** — the surveyor types `308, IRF, 22fnd`
//     and wants any of those tokens to match. The old filter ran the
//     entire string through `includes()`, so commas were treated as
//     literal characters and the search returned nothing. We now split
//     on commas, trim each token, and return rows that match ANY
//     non-empty token (OR semantics).
//
//  2. **Master-only source filter** — when moving points into a NEW
//     layer, the source pool defaults to the canonical "master points
//     file" (every POINT feature that isn't already a copy). Layers
//     created by the LayerPanel "Duplicate layer" action carry
//     `duplicateOf` pointing at the source layer, so their features
//     are filtered out. TRV-import points-layer mirrors
//     (`properties.trvPointMirror`) are filtered out the same way for
//     the same reason: they're render-only twins of the canonical
//     points, not additional surveyable points.

import type { DrawingDocument, Feature, Layer } from '../types';
import type { PointRow } from './point-rows';

export type MovePointsSourceMode = 'MASTER_ONLY' | 'ALL_LAYERS';
export type SearchField = 'NAME' | 'CODE';

/** Feature-level master check — reusable from any "move points"
 *  surface that holds the `Feature` directly (e.g. LayerTransferDialog)
 *  instead of going through `PointRow`. Excludes points on a layer
 *  with `duplicateOf` set AND points carrying `trvPointMirror` in
 *  their properties. */
export function isMasterPointFeature(
  feature: Feature,
  layers: Record<string, Layer>,
): boolean {
  if (feature.properties?.trvPointMirror) return false;
  if (layers[feature.layerId]?.duplicateOf) return false;
  return true;
}

/** Split a raw query into a list of trimmed, non-empty search tokens.
 *  Returns an empty array for an all-whitespace / comma-only query. */
export function tokenizeSearch(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/** A row matches the query when ANY token is a substring of the row's
 *  chosen field. An empty token list matches every row (so the
 *  caller's "no filter" path is just `tokenizeSearch(q).length === 0`
 *  → skip the filter). */
export function matchesQueryTokens(row: PointRow, field: SearchField, tokens: ReadonlyArray<string>): boolean {
  if (tokens.length === 0) return true;
  const haystack = (field === 'CODE' ? row.code : row.name).toLowerCase();
  for (const token of tokens) if (haystack.includes(token)) return true;
  return false;
}

/** True when the point row belongs to the canonical master pool — i.e.
 *  NOT on a duplicate layer AND NOT a TRV points-layer mirror. */
export function isMasterPointRow(row: PointRow, doc: DrawingDocument): boolean {
  const feature: Feature | undefined = doc.features[row.id];
  if (feature) return isMasterPointFeature(feature, doc.layers);
  // Row without a backing feature (derived/projected rows) — fall back
  // to the layer check so the answer stays consistent.
  return !doc.layers[row.layerId]?.duplicateOf;
}

/** Apply the search + source filters in one pass. Pure — does not
 *  mutate inputs. Returns the filtered rows in the original order. */
export function filterMovePointRows(
  rows: ReadonlyArray<PointRow>,
  doc: DrawingDocument,
  options: {
    query: string;
    field: SearchField;
    sourceMode: MovePointsSourceMode;
  },
): PointRow[] {
  const tokens = tokenizeSearch(options.query);
  const out: PointRow[] = [];
  for (const row of rows) {
    if (options.sourceMode === 'MASTER_ONLY' && !isMasterPointRow(row, doc)) continue;
    if (!matchesQueryTokens(row, options.field, tokens)) continue;
    out.push(row);
  }
  return out;
}
