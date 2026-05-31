// lib/cad/feature-vertices.ts
//
// cad-layer-grouping-and-context-menus Slice 1 — pure helper that
// projects a POLYLINE / POLYGON Feature's vertex array into one
// display string per vertex, for the LayerPanel's expandable
// polygon-row UI. POLYLINE / POLYGON in our model is a SINGLE
// Feature whose constituent segments are computed by iterating
// `geometry.vertices` — so the UI shows the vertex list, not a
// per-segment list (per-segment hideability requires the explode
// op in Slice 6 of this plan).

import type { Feature } from './types';

/** Render one display string per vertex of a POLYLINE / POLYGON
 *  feature. Returns [] when the feature has no vertex array (any
 *  other Feature type, or a degenerate POLYLINE / POLYGON without
 *  vertices). Each string is `v<n> — (x.x, y.y)` with one decimal
 *  place of precision (enough for visual orientation; the surveyor
 *  edits exact coords elsewhere). */
export function formatFeatureVertices(feature: Feature): string[] {
  if (feature.type !== 'POLYLINE' && feature.type !== 'POLYGON') return [];
  const verts = feature.geometry.vertices;
  if (!Array.isArray(verts) || verts.length === 0) return [];
  return verts.map((v, i) => `v${i + 1} — (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
}

/** True for the two feature types that have constituent vertices
 *  worth surfacing in the LayerPanel expand-list. Used to gate the
 *  chevron + the indented child rows. */
export function isExpandableFeature(feature: Feature): boolean {
  if (feature.type !== 'POLYLINE' && feature.type !== 'POLYGON') return false;
  const verts = feature.geometry.vertices;
  return Array.isArray(verts) && verts.length > 0;
}
