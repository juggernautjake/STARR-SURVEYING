// lib/cad/points/traverse-rows.ts
//
// Computed row model for the Traverse Viewer (plan §10.4/§10.5): per-
// feature line/curve metrics — start/end N,E, distance, azimuth,
// quadrant bearing, and (for arcs) radius, delta, arc length, chord.
// Pure + framework-free; unit-tested.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §10

import type { DrawingDocument, Feature, DrawingSettings, Point2D } from '../types';
import { inverseBearingDistance, formatBearing, forwardPoint, parseBearing } from '../geometry/bearing';

export interface TraverseRow {
  id: string;
  layerId: string;
  kind: 'LINE' | 'POLYLINE' | 'POLYGON' | 'ARC';
  startN: number | null;
  startE: number | null;
  endN: number | null;
  endE: number | null;
  distance: number | null; // total length (ft)
  azimuth: number | null; // degrees, start→end
  bearing: string | null; // quadrant bearing string
  radius: number | null;
  delta: number | null; // degrees (arc included angle)
  arcLength: number | null;
  chord: number | null;
}

function origin(settings: DrawingSettings): { n: number; e: number } {
  const dp = settings.displayPreferences;
  return { n: dp?.originNorthing ?? 0, e: dp?.originEasting ?? 0 };
}

function polylineLength(verts: Point2D[]): number {
  let total = 0;
  for (let i = 1; i < verts.length; i++) {
    total += Math.hypot(verts[i].x - verts[i - 1].x, verts[i].y - verts[i - 1].y);
  }
  return total;
}

function lineRow(f: Feature, oN: number, oE: number): TraverseRow | null {
  const { start, end } = f.geometry;
  if (!start || !end) return null;
  const { azimuth, distance } = inverseBearingDistance(start, end);
  return {
    id: f.id,
    layerId: f.layerId,
    kind: 'LINE',
    startN: start.y + oN,
    startE: start.x + oE,
    endN: end.y + oN,
    endE: end.x + oE,
    distance,
    azimuth,
    bearing: formatBearingSafe(azimuth),
    radius: null,
    delta: null,
    arcLength: null,
    chord: null,
  };
}

function polyRow(f: Feature, oN: number, oE: number): TraverseRow | null {
  const v = f.geometry.vertices;
  if (!v || v.length < 2) return null;
  const start = v[0];
  const end = v[v.length - 1];
  const { azimuth } = inverseBearingDistance(start, end);
  return {
    id: f.id,
    layerId: f.layerId,
    kind: f.type === 'POLYGON' ? 'POLYGON' : 'POLYLINE',
    startN: start.y + oN,
    startE: start.x + oE,
    endN: end.y + oN,
    endE: end.x + oE,
    distance: polylineLength(f.type === 'POLYGON' ? [...v, v[0]] : v),
    azimuth,
    bearing: formatBearingSafe(azimuth),
    radius: null,
    delta: null,
    arcLength: null,
    chord: null,
  };
}

function arcRow(f: Feature, oN: number, oE: number): TraverseRow | null {
  const a = f.geometry.arc;
  if (!a) return null;
  let deltaRad = a.endAngle - a.startAngle;
  // Normalize to the traversed sweep magnitude.
  deltaRad = Math.abs(((deltaRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  if (deltaRad === 0) deltaRad = 2 * Math.PI;
  const arcLength = a.radius * deltaRad;
  const chord = 2 * a.radius * Math.sin(deltaRad / 2);
  const sx = a.center.x + a.radius * Math.cos(a.startAngle);
  const sy = a.center.y + a.radius * Math.sin(a.startAngle);
  const ex = a.center.x + a.radius * Math.cos(a.endAngle);
  const ey = a.center.y + a.radius * Math.sin(a.endAngle);
  return {
    id: f.id,
    layerId: f.layerId,
    kind: 'ARC',
    startN: sy + oN,
    startE: sx + oE,
    endN: ey + oN,
    endE: ex + oE,
    distance: arcLength,
    azimuth: null,
    bearing: null,
    radius: a.radius,
    delta: (deltaRad * 180) / Math.PI,
    arcLength,
    chord,
  };
}

function formatBearingSafe(azimuth: number): string {
  return formatBearing(azimuth);
}

export type TraverseEditField = 'distance' | 'azimuth' | 'bearing';

/**
 * §10f — editing a LINE course's distance / azimuth / quadrant bearing
 * moves its end point (keeping the start fixed). Returns a geometry
 * update, or null for invalid input or non-LINE features.
 */
export function traverseEditToGeometry(
  feature: Feature,
  field: TraverseEditField,
  rawValue: string,
): Partial<Feature> | null {
  if (feature.type !== 'LINE') return null;
  const { start, end } = feature.geometry;
  if (!start || !end) return null;
  const cur = inverseBearingDistance(start, end);

  let newEnd: Point2D | null = null;
  if (field === 'distance') {
    const d = Number(rawValue);
    if (rawValue.trim() === '' || Number.isNaN(d) || d <= 0) return null;
    newEnd = forwardPoint(start, cur.azimuth, d);
  } else if (field === 'azimuth') {
    const az = Number(rawValue);
    if (rawValue.trim() === '' || Number.isNaN(az)) return null;
    newEnd = forwardPoint(start, az, cur.distance);
  } else {
    const az = parseBearing(rawValue);
    if (az == null) return null;
    newEnd = forwardPoint(start, az, cur.distance);
  }
  return { geometry: { ...feature.geometry, end: newEnd } };
}

/** Build traverse rows for all line/curve features in the document. */
export function buildTraverseRows(doc: DrawingDocument): TraverseRow[] {
  const { n: oN, e: oE } = origin(doc.settings);
  const rows: TraverseRow[] = [];
  for (const f of Object.values(doc.features)) {
    let row: TraverseRow | null = null;
    if (f.type === 'LINE') row = lineRow(f, oN, oE);
    else if (f.type === 'POLYLINE' || f.type === 'POLYGON') row = polyRow(f, oN, oE);
    else if (f.type === 'ARC') row = arcRow(f, oN, oE);
    if (row) rows.push(row);
  }
  return rows;
}
