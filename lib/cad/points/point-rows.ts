// lib/cad/points/point-rows.ts
//
// Editable spreadsheet row model for the Point Data Viewer (plan §10).
// Rows are derived from drawing-store POINT features (the canonical,
// exportable points — including auto-created ones). Coordinates are
// shown in survey space (N/E) and converted back to world geometry on
// edit so moving a value moves the point on the drawing.
//
//   displayed northing = worldY + originNorthing
//   displayed easting  = worldX + originEasting
//
// Pure + framework-free; unit-tested.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10

import type { DrawingDocument, Feature, DrawingSettings } from '../types';
import { pointNumberOf, pointCodeOf, pointDescriptionOf } from '../feature-fields';
import { collectDerivedPoints } from './derived-points';

export interface PointRow {
  id: string;
  name: string;
  northing: number;
  easting: number;
  elevation: number | null;
  code: string;
  description: string;
  layerId: string;
  /** false for derived (vertex-ref) points — shown read-only since they
   *  are line vertices, not standalone editable POINT features. */
  editable: boolean;
}

function origin(settings: DrawingSettings): { n: number; e: number } {
  const dp = settings.displayPreferences;
  return { n: dp?.originNorthing ?? 0, e: dp?.originEasting ?? 0 };
}

function elevationOf(f: Feature): number | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const v = p.elevation ?? p.elev ?? p.z;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Build rows for the Point Data Viewer: editable rows from every POINT
 * feature, plus (when `includeDerived`) read-only rows for "created
 * points" that live only as linework vertex refs (minted vertex names +
 * cross-layer `:N`) so the viewer shows ALL created points.
 */
export function buildPointRows(doc: DrawingDocument, includeDerived = true): PointRow[] {
  const { n: oN, e: oE } = origin(doc.settings);
  const rows: PointRow[] = [];
  for (const f of Object.values(doc.features)) {
    if (f.type !== 'POINT' || !f.geometry.point) continue;
    rows.push({
      id: f.id,
      name: pointNumberOf(f) ?? '',
      northing: f.geometry.point.y + oN,
      easting: f.geometry.point.x + oE,
      elevation: elevationOf(f),
      code: pointCodeOf(f),
      description: pointDescriptionOf(f),
      layerId: f.layerId,
      editable: true,
    });
  }
  if (includeDerived) {
    for (const dpt of collectDerivedPoints(doc)) {
      rows.push({
        id: `derived:${dpt.name}`,
        name: dpt.name,
        northing: dpt.northing,
        easting: dpt.easting,
        elevation: null,
        code: '',
        description: '',
        layerId: dpt.layerId,
        editable: false,
      });
    }
  }
  return rows;
}

/** Convert an edited row's N/E back to a world-space point. */
export function rowToWorldPoint(
  row: Pick<PointRow, 'northing' | 'easting'>,
  settings: DrawingSettings,
): { x: number; y: number } {
  const { n: oN, e: oE } = origin(settings);
  return { x: row.easting - oE, y: row.northing - oN };
}

export type PointRowField = 'northing' | 'easting' | 'elevation' | 'code' | 'description';

/** cad-domain-audit Slice P — returns true when an edit to this row
 *  field changes a value the layer's display labels render from, so
 *  the caller knows to re-run label generation. Coordinate edits also
 *  matter because POINT_COORDINATES + the anchor for every label
 *  shifts when the point moves. */
export function rowEditAffectsLabels(field: PointRowField): boolean {
  switch (field) {
    case 'code':
    case 'description':
    case 'elevation':
    case 'northing':
    case 'easting':
      return true;
    default:
      return false;
  }
}

/**
 * Produce a `Partial<Feature>` update for an edited row field (excluding
 * `name`, which is handled by the guarded rename flow §10.3). Returns
 * null when the value is invalid (e.g. non-numeric coordinate).
 */
export function rowEditToFeatureUpdate(
  feature: Feature,
  field: PointRowField,
  rawValue: string,
  settings: DrawingSettings,
): Partial<Feature> | null {
  const props = { ...(feature.properties ?? {}) };
  switch (field) {
    case 'northing':
    case 'easting': {
      const num = Number(rawValue);
      if (rawValue.trim() === '' || Number.isNaN(num)) return null;
      const { n: oN, e: oE } = origin(settings);
      const cur = feature.geometry.point ?? { x: 0, y: 0 };
      const point =
        field === 'northing'
          ? { x: cur.x, y: num - oN }
          : { x: num - oE, y: cur.y };
      return { geometry: { ...feature.geometry, point } };
    }
    case 'elevation': {
      if (rawValue.trim() === '') {
        delete props.elevation;
        return { properties: props };
      }
      const num = Number(rawValue);
      if (Number.isNaN(num)) return null;
      props.elevation = num;
      return { properties: props };
    }
    case 'code':
      props.code = rawValue;
      return { properties: props };
    case 'description':
      props.description = rawValue;
      return { properties: props };
    default:
      return null;
  }
}
