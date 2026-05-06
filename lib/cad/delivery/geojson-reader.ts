// lib/cad/delivery/geojson-reader.ts
//
// Phase 7 §10 — GeoJSON importer. Round-trip companion to
// `geojson-writer.ts`. Walks a `FeatureCollection` and
// rebuilds a partial `DrawingDocument` ready for
// `useDrawingStore.loadDocument`.
//
// Geometry coverage (mirrors the writer):
//   * Point          → POINT
//   * MultiPoint     → expands to one POINT per coordinate
//   * LineString     → POLYLINE
//   * MultiLineString → expands to one POLYLINE per ring
//   * Polygon        → POLYGON (outer ring only; holes warn
//                      until the engine supports doughnut
//                      polygons)
//   * MultiPolygon   → expands to one POLYGON per polygon's
//                      outer ring
//   * GeometryCollection → recurses into each member
//
// Layer rebuild:
//   * `properties.layerName` (matching the writer) becomes
//     the layer key; `properties.layerColor` becomes its
//     color. Features that omit the property land on a
//     synthesized "Imported" layer with a neutral color.
//
// Property pass-through:
//   * Numeric / string / boolean values flow into
//     `feature.properties` (the Feature.properties shape only
//     accepts those primitives).
//   * Reserved keys (`type`, `layerId`, `layerName`,
//     `layerColor`, `featureGroupId`, `areaSquareFeet`,
//     `areaAcres`) are stripped — they're internal and the
//     writer re-emits them.
//
// Pure: no I/O. Throws on malformed JSON.

import {
  generateId,
  type DrawingDocument,
  type DrawingSettings,
  type Feature,
  type FeatureGeometry,
  type Layer,
  type Point2D,
} from '../types';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from '../styles/types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface GeoJsonImportResult {
  document: DrawingDocument;
  warnings: string[];
  stats: {
    geojsonFeatures: number;
    geometriesParsed: number;
    featuresEmitted: number;
    layersParsed:    number;
  };
}

interface RawGeoJson {
  type?: string;
  features?: unknown[];
  geometry?: unknown;
  geometries?: unknown[];
  coordinates?: unknown;
  properties?: unknown;
  crs?: unknown;
}

const RESERVED_PROPS = new Set([
  'type',
  'layerId',
  'layerName',
  'layerColor',
  'featureGroupId',
  'areaSquareFeet',
  'areaAcres',
]);

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function importFromGeoJSON(text: string): GeoJsonImportResult {
  const root = JSON.parse(text) as RawGeoJson;
  const warnings: string[] = [];

  const layerTable = new Map<
    string,
    { name: string; color: string }
  >();
  const features: Feature[] = [];
  let geojsonFeatures = 0;
  let geometriesParsed = 0;

  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const raw of root.features) {
      geojsonFeatures += 1;
      const emitted = ingestGeoFeature(raw, layerTable, warnings);
      if (emitted) {
        features.push(...emitted);
        geometriesParsed += emitted.length;
      }
    }
  } else if (root.type === 'Feature') {
    geojsonFeatures = 1;
    const emitted = ingestGeoFeature(root, layerTable, warnings);
    if (emitted) {
      features.push(...emitted);
      geometriesParsed = emitted.length;
    }
  } else if (typeof root.type === 'string' && isGeometryType(root.type)) {
    // Bare geometry — no `properties` channel; goes onto the
    // default "Imported" layer.
    geojsonFeatures = 1;
    const built = buildFeaturesFromGeometry(
      root,
      defaultLayerName(),
      {},
      warnings
    );
    if (built.length > 0) {
      ensureLayer(layerTable, defaultLayerName());
      features.push(...built);
      geometriesParsed = built.length;
    }
  } else {
    warnings.push(
      `GeoJSON root type "${String(root.type)}" not supported. Only ` +
        'FeatureCollection / Feature / bare Geometry are recognized.'
    );
  }

  // Always emit a Layer 0 even if no features reference it.
  if (!layerTable.has('0')) {
    layerTable.set('0', { name: '0', color: '#FFFFFF' });
  }

  // Record the source CRS as a title-block note when present.
  let crsNote = '';
  if (root.crs && typeof root.crs === 'object') {
    const props = (root.crs as { properties?: { name?: string } })
      .properties;
    if (props && typeof props.name === 'string') {
      crsNote = `Imported coordinates: ${props.name}.`;
    }
  }

  // Build the layer table.
  const layers: Record<string, Layer> = {};
  const layerOrder: string[] = [];
  const nameToId = new Map<string, string>();
  let sortOrder = 0;
  for (const [name, parsed] of layerTable) {
    const id = generateId();
    layers[id] = {
      id,
      name,
      visible: true,
      locked: false,
      frozen: false,
      color: parsed.color,
      lineWeight: 1,
      lineTypeId: '',
      opacity: 1,
      groupId: null,
      sortOrder: sortOrder++,
      isDefault: name === '0',
      isProtected: name === '0',
      autoAssignCodes: [],
    };
    layerOrder.push(id);
    nameToId.set(name, id);
  }

  // Re-key features by their layer name → layerId.
  const featuresMap: Record<string, Feature> = {};
  for (const f of features) {
    const id = nameToId.get(f.layerId) ?? layerOrder[0] ?? '';
    featuresMap[f.id] = { ...f, layerId: id };
  }

  const document: DrawingDocument = {
    id: generateId(),
    name: 'Imported GeoJSON',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: 'GeoJSON Import',
    features: featuresMap,
    layers,
    layerOrder,
    featureGroups: {},
    layerGroups: {},
    layerGroupOrder: [],
    customSymbols: [],
    customLineTypes: [],
    codeStyleOverrides: {},
    globalStyleConfig: { ...DEFAULT_GLOBAL_STYLE_CONFIG },
    projectImages: {},
    settings: defaultSettings(crsNote),
  };

  return {
    document,
    warnings,
    stats: {
      geojsonFeatures,
      geometriesParsed,
      featuresEmitted: features.length,
      layersParsed: layerTable.size,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Per-feature ingestion
// ────────────────────────────────────────────────────────────

function ingestGeoFeature(
  raw: unknown,
  layerTable: Map<string, { name: string; color: string }>,
  warnings: string[]
): Feature[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (f.type !== 'Feature') {
    warnings.push(`Skipped non-Feature entry of type "${String(f.type)}".`);
    return null;
  }
  const props = (f.properties && typeof f.properties === 'object'
    ? (f.properties as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const layerName = pickLayerName(props);
  const layerColor = pickLayerColor(props);
  ensureLayer(layerTable, layerName, layerColor);
  const filteredProps = filterProperties(props);
  const geom = f.geometry;
  if (!geom || typeof geom !== 'object') {
    warnings.push('Feature without geometry skipped.');
    return null;
  }
  return buildFeaturesFromGeometry(
    geom as RawGeoJson,
    layerName,
    filteredProps,
    warnings
  );
}

function buildFeaturesFromGeometry(
  geom: RawGeoJson,
  layerName: string,
  properties: Record<string, string | number | boolean>,
  warnings: string[]
): Feature[] {
  const type = geom.type;
  const out: Feature[] = [];
  switch (type) {
    case 'Point': {
      const p = coordToPoint(geom.coordinates);
      if (p) {
        out.push(
          buildFeature('POINT', layerName, properties, {
            type: 'POINT',
            point: p,
          })
        );
      } else warnings.push('Point with non-numeric coordinates skipped.');
      break;
    }
    case 'MultiPoint': {
      const pts = coordsToPoints(geom.coordinates, warnings);
      for (const p of pts) {
        out.push(
          buildFeature('POINT', layerName, properties, {
            type: 'POINT',
            point: p,
          })
        );
      }
      break;
    }
    case 'LineString': {
      const verts = coordsToPoints(geom.coordinates, warnings);
      if (verts.length >= 2) {
        out.push(
          buildFeature('POLYLINE', layerName, properties, {
            type: 'POLYLINE',
            vertices: verts,
          })
        );
      } else warnings.push('LineString with < 2 vertices skipped.');
      break;
    }
    case 'MultiLineString': {
      const rings = Array.isArray(geom.coordinates)
        ? geom.coordinates
        : [];
      for (const ring of rings) {
        const verts = coordsToPoints(ring, warnings);
        if (verts.length >= 2) {
          out.push(
            buildFeature('POLYLINE', layerName, properties, {
              type: 'POLYLINE',
              vertices: verts,
            })
          );
        }
      }
      break;
    }
    case 'Polygon': {
      const rings = Array.isArray(geom.coordinates)
        ? geom.coordinates
        : [];
      if (rings.length === 0) {
        warnings.push('Polygon without rings skipped.');
        break;
      }
      const verts = stripClosingVertex(coordsToPoints(rings[0], warnings));
      if (verts.length >= 3) {
        out.push(
          buildFeature('POLYGON', layerName, properties, {
            type: 'POLYGON',
            vertices: verts,
          })
        );
      } else warnings.push('Polygon outer ring < 3 vertices skipped.');
      if (rings.length > 1) {
        warnings.push(
          'Polygon with holes: outer ring imported, inner rings ' +
            'dropped (donut polygons not yet supported).'
        );
      }
      break;
    }
    case 'MultiPolygon': {
      const polygons = Array.isArray(geom.coordinates)
        ? geom.coordinates
        : [];
      for (const poly of polygons) {
        const rings = Array.isArray(poly) ? poly : [];
        if (rings.length === 0) continue;
        const verts = stripClosingVertex(coordsToPoints(rings[0], warnings));
        if (verts.length >= 3) {
          out.push(
            buildFeature('POLYGON', layerName, properties, {
              type: 'POLYGON',
              vertices: verts,
            })
          );
        }
        if (rings.length > 1) {
          warnings.push(
            'MultiPolygon piece had inner rings; donut polygons not ' +
              'yet supported.'
          );
        }
      }
      break;
    }
    case 'GeometryCollection': {
      const members = Array.isArray(geom.geometries)
        ? geom.geometries
        : [];
      for (const m of members) {
        out.push(
          ...buildFeaturesFromGeometry(
            m as RawGeoJson,
            layerName,
            properties,
            warnings
          )
        );
      }
      break;
    }
    default:
      warnings.push(`Unsupported geometry type "${String(type)}" skipped.`);
      break;
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function isGeometryType(type: string): boolean {
  return [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
  ].includes(type);
}

function coordToPoint(raw: unknown): Point2D | null {
  if (!Array.isArray(raw)) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function coordsToPoints(raw: unknown, warnings: string[]): Point2D[] {
  if (!Array.isArray(raw)) return [];
  const out: Point2D[] = [];
  for (const c of raw) {
    const p = coordToPoint(c);
    if (p) out.push(p);
    else warnings.push('Coordinate with non-numeric values skipped.');
  }
  return out;
}

function stripClosingVertex(verts: Point2D[]): Point2D[] {
  if (verts.length < 2) return verts;
  const first = verts[0];
  const last = verts[verts.length - 1];
  if (first.x === last.x && first.y === last.y) {
    return verts.slice(0, -1);
  }
  return verts;
}

function pickLayerName(props: Record<string, unknown>): string {
  const candidate = props.layerName;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate;
  }
  return defaultLayerName();
}

function pickLayerColor(props: Record<string, unknown>): string {
  const candidate = props.layerColor;
  if (
    typeof candidate === 'string' &&
    /^#?[0-9a-fA-F]{6}$/.test(candidate)
  ) {
    return candidate.startsWith('#') ? candidate : `#${candidate}`;
  }
  return '#475569';
}

function defaultLayerName(): string {
  return 'Imported';
}

function ensureLayer(
  table: Map<string, { name: string; color: string }>,
  name: string,
  color?: string
): void {
  if (!table.has(name)) {
    table.set(name, { name, color: color ?? '#475569' });
  } else if (color && table.get(name)!.color === '#475569') {
    // Promote the more specific color when it shows up later.
    table.set(name, { name, color });
  }
}

function filterProperties(
  props: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (RESERVED_PROPS.has(k)) continue;
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      out[k] = v;
    }
  }
  return out;
}

function buildFeature(
  type: Feature['type'],
  layerName: string,
  properties: Record<string, string | number | boolean>,
  geometry: FeatureGeometry
): Feature {
  return {
    id: generateId(),
    type,
    geometry,
    layerId: layerName,
    style: defaultStyle(),
    properties: { ...properties },
  };
}

function defaultStyle(): Feature['style'] {
  return {
    color: null,
    lineWeight: null,
    opacity: 1,
    lineTypeId: null,
    symbolId: null,
    symbolSize: null,
    symbolRotation: 0,
    labelVisible: null,
    labelFormat: null,
    labelOffset: { x: 0, y: 0 },
    isOverride: false,
  };
}

function defaultSettings(notes: string): DrawingSettings {
  // Mirrors the DXF reader's defaults; only the title-block
  // notes diverge so the importer can stamp the source CRS.
  return {
    units: 'FEET',
    gridVisible: true,
    gridMajorSpacing: 100,
    gridMinorDivisions: 10,
    gridStyle: 'DOTS',
    snapEnabled: true,
    snapTypes: [],
    snapRadius: 15,
    backgroundColor: '#FFFFFF',
    selectionColor: '#0088FF',
    hoverColor: '#66AAFF',
    gridMajorColor: '#C8C8C8',
    gridMinorColor: '#E8E8E8',
    groupSelectMode: 'GROUP_FIRST',
    boxSelectMode: 'CROSSING_EXPAND_GROUPS',
    paperSize: 'TABLOID',
    paperOrientation: 'LANDSCAPE',
    drawingScale: 50,
    codeDisplayMode: 'ALPHA',
    zoomSpeed: 1.0,
    zoomTowardCursor: true,
    invertScrollZoom: false,
    panSpeed: 1.0,
    dragThreshold: 5,
    gripSize: 6,
    gripColor: '#0088FF',
    gripFillColor: '#FFFFFF',
    hoverGlowEnabled: true,
    hoverGlowIntensity: 1.0,
    selectionLineWidth: 1.5,
    showPointLabels: true,
    showLineLabels: true,
    showDimensions: true,
    cursorCrosshairSize: 24,
    showCursorCoordinates: false,
    autoSaveEnabled: true,
    autoSaveIntervalSec: 120,
    displayPreferences: {} as DrawingSettings['displayPreferences'],
    drawingRotationDeg: 0,
    titleBlock: {
      visible: true,
      northArrowStyle: 'STARR',
      northArrowSizeIn: 1.5,
      infoBoxStyle: 'STANDARD',
      firmName: '',
      surveyorName: '',
      surveyorLicense: '',
      projectName: 'Imported GeoJSON',
      projectNumber: '',
      clientName: '',
      surveyDate: '',
      scaleLabel: '',
      sheetNumber: '',
      totalSheets: '',
      notes,
    },
  };
}
