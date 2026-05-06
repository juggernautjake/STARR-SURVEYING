// lib/cad/delivery/geojson-writer.ts
//
// Phase 7 §9 — GeoJSON exporter. Walks `DrawingDocument`
// features and emits a `FeatureCollection` consumable by
// QGIS, Mapbox, ArcGIS, FME, and any GIS tool that speaks
// GeoJSON.
//
// Coordinates ship as the source state-plane values (US Survey
// Feet) — proj4 isn't in the dependency tree yet, so we don't
// project to WGS84. RFC 7946 mandates WGS84, but the surveying
// world routinely ships state-plane GeoJSON with an out-of-
// band CRS hint; downstream tools that care can re-project on
// import. We carry the CRS hint two ways:
//   * top-level `crs` member (the legacy GeoJSON 1.0 channel
//     QGIS still reads),
//   * top-level `metadata` member (forward-compatible; modern
//     tools that ignore `crs` still see the EPSG code).
//
// Caller-supplied `crs` overrides the default ("urn:ogc:def:
// crs:EPSG::2277" — Texas State Plane Central, NAD83, US ft);
// `coordinateSystemLabel` overrides the human-readable label
// stamped into `metadata.coordinateSystem`.
//
// Pure: no I/O. Returns a single JSON string the caller can
// hand to a download helper or stream from a server route.

import type {
  ArcGeometry,
  CircleGeometry,
  DrawingDocument,
  EllipseGeometry,
  Feature,
  FeatureGeometry,
  Layer,
  Point2D,
  SplineGeometry,
} from '../types';
import { computeAreaFromPoints2D } from '../geometry/area';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface GeoJsonExportOptions {
  /** When true, hidden features still emit. Default false. */
  includeHidden?: boolean;
  /** Sample count per curve (CIRCLE / ELLIPSE / ARC / SPLINE).
   *  Default 32. */
  curveSamples?: number;
  /** Override the CRS URN. Default Texas State Plane Central
   *  NAD83 US ft (EPSG:2277). */
  crs?: string;
  /** Override the human-readable label stamped into
   *  `metadata.coordinateSystem`. */
  coordinateSystemLabel?: string;
  /** Pretty-print indentation. Default 2. */
  indent?: number;
}

interface GeoJsonGeometry {
  type:
    | 'Point'
    | 'LineString'
    | 'Polygon'
    | 'MultiLineString'
    | 'MultiPolygon';
  coordinates: unknown;
}

interface GeoJsonFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
  /** Legacy GeoJSON 1.0 CRS hint — still read by QGIS. */
  crs: {
    type: 'name';
    properties: { name: string };
  };
  metadata: {
    coordinateSystem: string;
    units: 'US Survey Feet';
    generatedAt: string;
    project: string;
    layerCount: number;
    featureCount: number;
  };
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

const DEFAULT_CRS = 'urn:ogc:def:crs:EPSG::2277';
const DEFAULT_LABEL =
  'NAD83 / Texas State Plane Central (US ft) — EPSG:2277';

export function exportToGeoJSON(
  doc: DrawingDocument,
  options: GeoJsonExportOptions = {}
): string {
  const samples = Math.max(8, options.curveSamples ?? 32);
  const includeHidden = !!options.includeHidden;
  const indent = options.indent ?? 2;

  const features = Object.values(doc.features).filter((f) =>
    includeHidden ? true : !f.hidden
  );
  const out: GeoJsonFeature[] = [];
  for (const f of features) {
    const converted = convertFeature(f, doc, samples);
    if (converted) out.push(converted);
  }

  const collection: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features: out,
    crs: {
      type: 'name',
      properties: { name: options.crs ?? DEFAULT_CRS },
    },
    metadata: {
      coordinateSystem: options.coordinateSystemLabel ?? DEFAULT_LABEL,
      units: 'US Survey Feet',
      generatedAt: new Date().toISOString(),
      project: doc.settings.titleBlock?.projectName || doc.name,
      layerCount: Object.keys(doc.layers).length,
      featureCount: out.length,
    },
  };
  return JSON.stringify(collection, null, indent);
}

/**
 * Browser-side wrapper that triggers a .geojson download.
 * Returns the produced filename + byte size for telemetry.
 */
export function downloadGeoJSON(
  doc: DrawingDocument,
  options: GeoJsonExportOptions = {}
): { filename: string; byteSize: number } {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('downloadGeoJSON can only run in the browser.');
  }
  const text = exportToGeoJSON(doc, options);
  const filename = `${kebabCase(doc.name) || 'drawing'}.geojson`;
  const blob = new Blob([text], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(globalThis.document.createElement('a'), {
    href: url,
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return { filename, byteSize: blob.size };
}

// ────────────────────────────────────────────────────────────
// Per-feature converter
// ────────────────────────────────────────────────────────────

function convertFeature(
  f: Feature,
  doc: DrawingDocument,
  samples: number
): GeoJsonFeature | null {
  const geometry = convertGeometry(f, samples);
  if (!geometry) return null;
  const layer: Layer | undefined = doc.layers[f.layerId];
  const properties: Record<string, unknown> = {
    type: f.type,
    layerId: f.layerId,
    ...(layer ? { layerName: layer.name, layerColor: layer.color } : {}),
    ...f.properties,
  };
  if (f.featureGroupId) properties.featureGroupId = f.featureGroupId;
  if (f.type === 'POLYGON' && f.geometry.vertices) {
    const area = computeAreaFromPoints2D(f.geometry.vertices);
    properties.areaSquareFeet = round(area.squareFeet, 2);
    properties.areaAcres = round(area.acres, 4);
  }
  return {
    type: 'Feature',
    id: f.id,
    geometry,
    properties,
  };
}

function convertGeometry(
  f: Feature,
  samples: number
): GeoJsonGeometry | null {
  const g = f.geometry;
  switch (f.type) {
    case 'POINT':
      if (g.point) return point(g.point);
      if (g.start) return point(g.start);
      return null;
    case 'LINE':
      if (g.start && g.end) return lineString([g.start, g.end]);
      return null;
    case 'POLYLINE':
      if (g.vertices && g.vertices.length >= 2) return lineString(g.vertices);
      return null;
    case 'POLYGON':
      if (g.circle) {
        return polygon([sampleCircle(g.circle, samples)]);
      }
      if (g.vertices && g.vertices.length >= 3) {
        return polygon([closeRing(g.vertices)]);
      }
      return null;
    case 'CIRCLE':
      if (g.circle) return polygon([sampleCircle(g.circle, samples)]);
      return null;
    case 'ELLIPSE':
      if (g.ellipse) return polygon([sampleEllipse(g.ellipse, samples)]);
      return null;
    case 'ARC':
      if (g.arc) return lineString(sampleArc(g.arc, samples));
      return null;
    case 'SPLINE':
      if (g.spline) {
        const pts = sampleSpline(g.spline, samples);
        if (pts.length >= 2) {
          return g.spline.isClosed
            ? polygon([closeRing(pts)])
            : lineString(pts);
        }
      }
      return null;
    case 'MIXED_GEOMETRY':
      if (g.vertices && g.vertices.length >= 2) {
        return lineString(g.vertices);
      }
      return null;
    case 'TEXT':
    case 'IMAGE':
      // Anchor as a point so the receiving GIS sees the
      // placement; the actual text content + image bytes are
      // out-of-band.
      if (g.point) return point(g.point);
      if (g.start) return point(g.start);
      if (g.image) return point(g.image.position);
      return null;
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Geometry builders + samplers
// ────────────────────────────────────────────────────────────

function point(p: Point2D): GeoJsonGeometry {
  return { type: 'Point', coordinates: coord(p) };
}

function lineString(points: Point2D[]): GeoJsonGeometry {
  return {
    type: 'LineString',
    coordinates: points.map((p) => coord(p)),
  };
}

function polygon(rings: Point2D[][]): GeoJsonGeometry {
  return {
    type: 'Polygon',
    coordinates: rings.map((ring) => ring.map((p) => coord(p))),
  };
}

function coord(p: Point2D): [number, number] {
  return [round(p.x, 4), round(p.y, 4)];
}

function closeRing(vertices: Point2D[]): Point2D[] {
  if (vertices.length === 0) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (first.x === last.x && first.y === last.y) return vertices;
  return [...vertices, first];
}

function sampleCircle(c: CircleGeometry, samples: number): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * Math.PI * 2;
    out.push({
      x: c.center.x + c.radius * Math.cos(t),
      y: c.center.y + c.radius * Math.sin(t),
    });
  }
  out.push(out[0]); // close ring
  return out;
}

function sampleEllipse(e: EllipseGeometry, samples: number): Point2D[] {
  const cosR = Math.cos(e.rotation);
  const sinR = Math.sin(e.rotation);
  const out: Point2D[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * Math.PI * 2;
    const x = e.radiusX * Math.cos(t);
    const y = e.radiusY * Math.sin(t);
    out.push({
      x: e.center.x + x * cosR - y * sinR,
      y: e.center.y + x * sinR + y * cosR,
    });
  }
  out.push(out[0]);
  return out;
}

function sampleArc(a: ArcGeometry, samples: number): Point2D[] {
  let span = a.endAngle - a.startAngle;
  if (a.anticlockwise && span < 0) span += Math.PI * 2;
  if (!a.anticlockwise && span > 0) span -= Math.PI * 2;
  const out: Point2D[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = a.startAngle + (span * i) / samples;
    out.push({
      x: a.center.x + a.radius * Math.cos(t),
      y: a.center.y + a.radius * Math.sin(t),
    });
  }
  return out;
}

function sampleSpline(s: SplineGeometry, samples: number): Point2D[] {
  const pts = s.controlPoints;
  const samplesPerCurve = Math.max(2, Math.floor(samples / 2));
  const out: Point2D[] = [];
  for (let i = 0; i + 3 < pts.length; i += 3) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];
    if (out.length === 0) out.push(p0);
    for (let j = 1; j <= samplesPerCurve; j += 1) {
      const t = j / samplesPerCurve;
      out.push(cubicBezier(p0, p1, p2, p3, t));
    }
  }
  return out;
}

function cubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number
): Point2D {
  const u = 1 - t;
  const c0 = u * u * u;
  const c1 = 3 * u * u * t;
  const c2 = 3 * u * t * t;
  const c3 = t * t * t;
  return {
    x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
    y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Reference the FeatureGeometry type so downstream consumers
// of this module can pull in our geometry shape without an
// extra import. Keeps tree-shaking happy.
export type { FeatureGeometry };
