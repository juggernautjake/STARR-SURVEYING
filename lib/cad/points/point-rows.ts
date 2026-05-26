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
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §10

import type { DrawingDocument, Feature, DrawingSettings } from '../types';
import { pointNumberOf, pointCodeOf, pointDescriptionOf } from '../feature-fields';

export interface PointRow {
  id: string;
  name: string;
  northing: number;
  easting: number;
  elevation: number | null;
  code: string;
  description: string;
  layerId: string;
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

/** Build editable rows from every POINT feature in the document. */
export function buildPointRows(doc: DrawingDocument): PointRow[] {
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
    });
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
