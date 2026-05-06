// lib/cad/delivery/dxf-reader.ts
//
// Phase 7 §10.4 — minimal DXF reader. Parses an ASCII DXF
// (R12+) string and produces a partial `DrawingDocument`
// suitable for hand-off to `useDrawingStore.loadDocument`.
//
// Coverage in this slice (entity reverse-mapping, mirrors the
// writer's coverage):
//   POINT       → POINT
//   LINE        → LINE
//   LWPOLYLINE  → POLYLINE (flag 70 bit 1 = closed → POLYGON)
//   POLYLINE    → POLYLINE (legacy variant, walked through
//                 trailing VERTEX entries until SEQEND)
//   CIRCLE      → CIRCLE
//   ARC         → ARC (degrees → radians; CCW sweep)
//   ELLIPSE     → ELLIPSE (major-axis-end vector + ratio)
//
// Layer table is parsed from the TABLES section; entities
// reference layers by name (group 8). When an entity references
// a layer that wasn't in the LAYER table (some writers skip the
// table), we synthesize one on the fly so nothing is dropped.
//
// Out of scope this slice (follow-ups):
//   * SPLINE entity (NURBS sampler).
//   * TEXT / INSERT / DIMENSION (annotation + symbol round-trip
//     follows once the writer's BLOCKS round-trip is locked
//     down).
//   * HEADER variable parsing ($EXTMIN / $EXTMAX / $INSUNITS
//     are written but ignored on read; we recompute from real
//     geometry when needed).
//
// Pure: no I/O. Throws on malformed group-code pairs so the
// caller can surface a friendly error.

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
// Public API
// ────────────────────────────────────────────────────────────

export interface DxfImportResult {
  document: DrawingDocument;
  /** Per-entity warnings (unsupported types, malformed
   *  geometry) so the UI can surface a "imported with N
   *  warnings" toast without hiding the data. */
  warnings: string[];
  /** Stats for telemetry / UI. */
  stats: {
    entitiesParsed: number;
    layersParsed:   number;
    featuresEmitted: number;
  };
}

export function importFromDxf(text: string): DxfImportResult {
  const pairs = tokenize(text);
  const sections = collectSections(pairs);

  const layerTable = sections.tables
    ? parseLayerTable(sections.tables)
    : new Map<string, ParsedLayer>();
  const { features, warnings, parsed } = parseEntities(
    sections.entities ?? [],
    layerTable
  );

  // Always emit Layer 0 even if no entities reference it; AutoCAD
  // expects it.
  if (!layerTable.has('0')) {
    layerTable.set('0', { name: '0', color: '#FFFFFF' });
  }
  const layers: Record<string, Layer> = {};
  const layerOrder: string[] = [];
  let sortOrder = 0;
  for (const [name, parsedLayer] of layerTable) {
    const id = generateId();
    layers[id] = {
      id,
      name,
      visible: true,
      locked: false,
      frozen: false,
      color: parsedLayer.color,
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
  }
  // Re-key features by their layer name → layerId.
  const nameToId = new Map<string, string>();
  for (const id of Object.keys(layers)) {
    nameToId.set(layers[id].name, id);
  }
  const featuresMap: Record<string, Feature> = {};
  for (const f of features) {
    const layerId = nameToId.get(f.layerId) ?? layerOrder[0] ?? '';
    featuresMap[f.id] = { ...f, layerId };
  }

  const document: DrawingDocument = {
    id: generateId(),
    name: 'Imported Drawing',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: 'DXF Import',
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
    settings: defaultSettings(),
  };

  return {
    document,
    warnings,
    stats: {
      entitiesParsed: parsed,
      layersParsed: layerTable.size,
      featuresEmitted: features.length,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Tokenization
// ────────────────────────────────────────────────────────────

interface Pair {
  code:  number;
  value: string;
}

function tokenize(text: string): Pair[] {
  // DXF lines come as group-code / value pairs separated by
  // CR/LF. We accept any line ending.
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeText = lines[i].trim();
    if (codeText.length === 0) {
      // Skip stray blank lines without breaking the pairing.
      i -= 1;
      continue;
    }
    const code = Number.parseInt(codeText, 10);
    if (!Number.isFinite(code)) {
      throw new Error(`Malformed DXF: non-integer group code "${codeText}".`);
    }
    pairs.push({ code, value: lines[i + 1] ?? '' });
  }
  return pairs;
}

// ────────────────────────────────────────────────────────────
// Section walk
// ────────────────────────────────────────────────────────────

interface Sections {
  tables?:   Pair[];
  entities?: Pair[];
}

function collectSections(pairs: Pair[]): Sections {
  const out: Sections = {};
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === 0 && p.value === 'SECTION') {
      // Next pair carries group 2 = section name.
      const nameP = pairs[i + 1];
      if (!nameP || nameP.code !== 2) {
        i += 1;
        continue;
      }
      const sectionName = nameP.value;
      const start = i + 2;
      const end = findSectionEnd(pairs, start);
      const body = pairs.slice(start, end);
      if (sectionName === 'TABLES') out.tables = body;
      else if (sectionName === 'ENTITIES') out.entities = body;
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

function findSectionEnd(pairs: Pair[], start: number): number {
  for (let i = start; i < pairs.length; i += 1) {
    if (pairs[i].code === 0 && pairs[i].value === 'ENDSEC') return i;
  }
  return pairs.length;
}

// ────────────────────────────────────────────────────────────
// Layer table
// ────────────────────────────────────────────────────────────

interface ParsedLayer {
  name:  string;
  color: string;
}

function parseLayerTable(pairs: Pair[]): Map<string, ParsedLayer> {
  const out = new Map<string, ParsedLayer>();
  let i = 0;
  while (i < pairs.length) {
    if (pairs[i].code === 0 && pairs[i].value === 'LAYER') {
      const { entry, next } = readEntity(pairs, i + 1);
      const name = stringField(entry, 2) ?? '0';
      const aci = numberField(entry, 62);
      const trueColor = numberField(entry, 420);
      const color =
        trueColor !== null
          ? trueColorToHex(trueColor)
          : aci !== null
            ? aciToHex(aci)
            : '#FFFFFF';
      out.set(name, { name, color });
      i = next;
    } else {
      i += 1;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Entities
// ────────────────────────────────────────────────────────────

interface ParseEntitiesResult {
  features: Feature[];
  warnings: string[];
  parsed:   number;
}

function parseEntities(
  pairs: Pair[],
  layerTable: Map<string, ParsedLayer>
): ParseEntitiesResult {
  const features: Feature[] = [];
  const warnings: string[] = [];
  let parsed = 0;
  let i = 0;
  while (i < pairs.length) {
    if (pairs[i].code !== 0) {
      i += 1;
      continue;
    }
    const type = pairs[i].value;
    if (type === 'POLYLINE') {
      // Legacy POLYLINE — vertex list trails as VERTEX
      // entities until SEQEND.
      const { entity, vertices, next } = readPolylineGroup(pairs, i + 1);
      parsed += 1;
      const layerName = stringField(entity, 8) ?? '0';
      ensureLayer(layerTable, layerName);
      if (vertices.length >= 2) {
        const flags = numberField(entity, 70) ?? 0;
        features.push(
          buildPolylineFeature(layerName, vertices, (flags & 1) === 1)
        );
      } else {
        warnings.push('POLYLINE skipped: fewer than 2 vertices.');
      }
      i = next;
      continue;
    }

    const { entry, next } = readEntity(pairs, i + 1);
    parsed += 1;
    const layerName = stringField(entry, 8) ?? '0';
    ensureLayer(layerTable, layerName);
    const feature = entityToFeature(type, entry, layerName, warnings);
    if (feature) features.push(feature);
    i = next;
  }
  return { features, warnings, parsed };
}

function entityToFeature(
  type: string,
  entry: Pair[],
  layerName: string,
  warnings: string[]
): Feature | null {
  switch (type) {
    case 'POINT':
      return buildSimpleFeature('POINT', layerName, {
        type: 'POINT',
        point: vec2(entry, 10, 20) ?? { x: 0, y: 0 },
      });
    case 'LINE': {
      const start = vec2(entry, 10, 20);
      const end = vec2(entry, 11, 21);
      if (!start || !end) {
        warnings.push('LINE skipped: missing endpoint coordinates.');
        return null;
      }
      return buildSimpleFeature('LINE', layerName, {
        type: 'LINE',
        start,
        end,
      });
    }
    case 'LWPOLYLINE': {
      const flags = numberField(entry, 70) ?? 0;
      const closed = (flags & 1) === 1;
      const verts = collectLwVertices(entry);
      if (verts.length < 2) {
        warnings.push('LWPOLYLINE skipped: fewer than 2 vertices.');
        return null;
      }
      return buildPolylineFeature(layerName, verts, closed);
    }
    case 'CIRCLE': {
      const center = vec2(entry, 10, 20);
      const radius = numberField(entry, 40);
      if (!center || radius === null) {
        warnings.push('CIRCLE skipped: missing center or radius.');
        return null;
      }
      return buildSimpleFeature('CIRCLE', layerName, {
        type: 'CIRCLE',
        circle: { center, radius },
      });
    }
    case 'ARC': {
      const center = vec2(entry, 10, 20);
      const radius = numberField(entry, 40);
      const startDeg = numberField(entry, 50);
      const endDeg = numberField(entry, 51);
      if (
        !center ||
        radius === null ||
        startDeg === null ||
        endDeg === null
      ) {
        warnings.push('ARC skipped: missing geometry fields.');
        return null;
      }
      return buildSimpleFeature('ARC', layerName, {
        type: 'ARC',
        arc: {
          center,
          radius,
          startAngle: (startDeg * Math.PI) / 180,
          endAngle: (endDeg * Math.PI) / 180,
          anticlockwise: true, // DXF arcs are CCW-only
        },
      });
    }
    case 'ELLIPSE': {
      const center = vec2(entry, 10, 20);
      const majorEnd = vec2(entry, 11, 21);
      const ratio = numberField(entry, 40);
      if (!center || !majorEnd || ratio === null) {
        warnings.push('ELLIPSE skipped: missing geometry fields.');
        return null;
      }
      const radiusX = Math.hypot(majorEnd.x, majorEnd.y);
      const rotation = Math.atan2(majorEnd.y, majorEnd.x);
      return buildSimpleFeature('ELLIPSE', layerName, {
        type: 'ELLIPSE',
        ellipse: {
          center,
          radiusX,
          radiusY: radiusX * ratio,
          rotation,
        },
      });
    }
    case 'SEQEND':
    case 'VERTEX':
      // Trailing VERTEX entities are consumed by `readPolylineGroup`.
      return null;
    case 'TEXT':
    case 'MTEXT':
    case 'INSERT':
    case 'DIMENSION':
    case 'SPLINE':
    case 'HATCH':
      warnings.push(`${type} entity skipped (annotation/insert pass-through pending).`);
      return null;
    default:
      warnings.push(`Unsupported entity type "${type}" — skipped.`);
      return null;
  }
}

function collectLwVertices(entry: Pair[]): Point2D[] {
  // LWPOLYLINE inlines vertices as repeated 10/20 pairs after
  // the metadata. Walk the entry list in order; every 10/20
  // pair after the first counts as a vertex (the first 10/20
  // pair is the entity reference point in some writers, but
  // the spec says LWPOLYLINE has no anchor — so all 10/20
  // pairs become vertices).
  const out: Point2D[] = [];
  let pendingX: number | null = null;
  for (const p of entry) {
    if (p.code === 10) {
      pendingX = Number.parseFloat(p.value);
    } else if (p.code === 20 && pendingX !== null) {
      const y = Number.parseFloat(p.value);
      if (Number.isFinite(pendingX) && Number.isFinite(y)) {
        out.push({ x: pendingX, y });
      }
      pendingX = null;
    }
  }
  return out;
}

interface PolylineGroup {
  entity:   Pair[];
  vertices: Point2D[];
  next:     number;
}

function readPolylineGroup(pairs: Pair[], start: number): PolylineGroup {
  const entity: Pair[] = [];
  let i = start;
  // Read POLYLINE header until the first VERTEX or SEQEND.
  while (i < pairs.length) {
    if (
      pairs[i].code === 0 &&
      (pairs[i].value === 'VERTEX' || pairs[i].value === 'SEQEND')
    ) {
      break;
    }
    entity.push(pairs[i]);
    i += 1;
  }
  const vertices: Point2D[] = [];
  while (i < pairs.length && pairs[i].code === 0) {
    if (pairs[i].value === 'VERTEX') {
      const { entry, next } = readEntity(pairs, i + 1);
      const v = vec2(entry, 10, 20);
      if (v) vertices.push(v);
      i = next;
      continue;
    }
    if (pairs[i].value === 'SEQEND') {
      const { next } = readEntity(pairs, i + 1);
      return { entity, vertices, next };
    }
    break;
  }
  return { entity, vertices, next: i };
}

interface EntityRead {
  entry: Pair[];
  next:  number;
}

/** Collect the property pairs that follow a `0 / <type>` header
 *  up to (but not including) the next `0 / <next-entity>` line. */
function readEntity(pairs: Pair[], start: number): EntityRead {
  const entry: Pair[] = [];
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    entry.push(pairs[i]);
    i += 1;
  }
  return { entry, next: i };
}

// ────────────────────────────────────────────────────────────
// Feature builders
// ────────────────────────────────────────────────────────────

function buildSimpleFeature(
  type: Feature['type'],
  layerName: string,
  geometry: FeatureGeometry
): Feature {
  return {
    id: generateId(),
    type,
    geometry,
    layerId: layerName,
    style: defaultStyle(),
    properties: {},
  };
}

function buildPolylineFeature(
  layerName: string,
  vertices: Point2D[],
  closed: boolean
): Feature {
  return {
    id: generateId(),
    type: closed ? 'POLYGON' : 'POLYLINE',
    geometry: {
      type: closed ? 'POLYGON' : 'POLYLINE',
      vertices,
    },
    layerId: layerName,
    style: defaultStyle(),
    properties: {},
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

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function ensureLayer(
  table: Map<string, ParsedLayer>,
  name: string
): void {
  if (!table.has(name)) table.set(name, { name, color: '#FFFFFF' });
}

function stringField(entry: Pair[], code: number): string | null {
  for (const p of entry) {
    if (p.code === code) return p.value;
  }
  return null;
}

function numberField(entry: Pair[], code: number): number | null {
  for (const p of entry) {
    if (p.code === code) {
      const n = Number.parseFloat(p.value);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function vec2(
  entry: Pair[],
  xCode: number,
  yCode: number
): Point2D | null {
  const x = numberField(entry, xCode);
  const y = numberField(entry, yCode);
  if (x === null || y === null) return null;
  return { x, y };
}

function trueColorToHex(rgb: number): string {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

function aciToHex(aci: number): string {
  switch (aci) {
    case 1:
      return '#FF0000';
    case 2:
      return '#FFFF00';
    case 3:
      return '#00FF00';
    case 4:
      return '#00FFFF';
    case 5:
      return '#0000FF';
    case 6:
      return '#FF00FF';
    case 7:
      return '#000000';
    default:
      return '#9CA3AF';
  }
}

function defaultSettings(): DrawingSettings {
  // Lean default settings — UI panels know how to fill in
  // missing keys via the schema validator. Importer just needs
  // the geometry; downstream `validateAndMigrateDocument` adds
  // the rest.
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
      projectName: 'Imported Drawing',
      projectNumber: '',
      clientName: '',
      surveyDate: '',
      scaleLabel: '',
      sheetNumber: '',
      totalSheets: '',
      notes: '',
    },
  };
}
