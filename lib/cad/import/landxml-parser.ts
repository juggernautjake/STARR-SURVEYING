// lib/cad/import/landxml-parser.ts — LandXML in, points/alignments/surfaces/parcels out.
//
// Audit §3c.2, item 8j: *"Every one of the five vendors exports LandXML, and it is the neutral
// interchange the whole industry already uses. One good LandXML reader covers all five for points,
// alignments and surfaces before a single vendor-specific parser is written."*
//
// Trimble, Topcon, Leica, GeoMax and Spectra all write it. So does Civil 3D, Carlson, MicroStation
// and every state DOT. This is the one reader that makes a firm able to move its data in on day one
// without anybody signing a partner agreement.
//
// ── THE FOUR TRAPS, ALL OF WHICH SILENTLY PRODUCE WRONG COORDINATES ─────────────────────────────
//
// 1. **Coordinate ORDER is northing-first, and half the world assumes easting-first.** LandXML's
//    `<CgPoint>` content is `northing easting [elevation]`. A reader that assumes X,Y (the near-
//    universal habit) mirrors every point about the 45° line. It does not crash, it does not warn,
//    and the plat looks plausible until somebody overlays it on a map. Same order applies inside
//    `<P>` (surface points), `<Start>`, `<End>` and `<Center>`.
//
// 2. **UNITS are declared, not assumed, and "feet" is three different things.** `<Metric>` and
//    `<Imperial>` are separate elements, and `linearUnit` distinguishes `USSurveyFoot` from
//    `foot` (International). They differ by 2 ppm — about 0.01 ft per mile — which is inside the
//    noise on a lot survey and outside it on a section line. We record the unit rather than
//    converting, because converting to a house unit and back is how precision quietly disappears;
//    the caller decides.
//
// 3. **`<CgPoint>` may carry no coordinates at all.** A `pntRef` attribute points at another point
//    by name. Reading such an element as "0 0 0" plants a point at the origin, which is both wrong
//    and highly visible on a drawing — the least bad of these four, and still a defect.
//
// 4. **Elevation is optional and 0 is a real elevation.** A point with two numbers has *no* Z, and
//    coercing that to 0 puts a boundary corner at sea level. Distinguished as `null`.
//
// Not in scope for this first pass, and deliberately: spiral geometry beyond its endpoints, superele-
// vation, cross-sections, and pipe networks. A surveying firm's day-one need is points, boundaries,
// alignment centrelines and TIN surfaces.

import type { ParsedImportRow } from './types';
import { attr, childrenNamed, descendantsNamed, firstChild, localName, parseXml, XmlParseError, type XmlNode } from './xml-lite';
import { cadLog } from '../logger';

// ── Units ────────────────────────────────────────────────────────────────────────────────────────

export type LinearUnit = 'USSurveyFoot' | 'foot' | 'meter' | 'unknown';

export interface LandXmlUnits {
  linear: LinearUnit;
  /** As written in the file, for display and for round-tripping without loss. */
  rawLinear: string | null;
  angular: string | null;
  system: 'imperial' | 'metric' | 'unknown';
}

/** Feet per metre for each recognised unit. Exposed rather than applied — see trap 2. */
export const METERS_PER_UNIT: Record<Exclude<LinearUnit, 'unknown'>, number> = {
  // 1200/3937 exactly, by the 1893 Mendenhall Order. Not 0.3048.
  USSurveyFoot: 1200 / 3937,
  foot: 0.3048,
  meter: 1,
};

function readUnits(root: XmlNode): LandXmlUnits {
  const units = firstChild(root, 'Units');
  const imperial = units ? firstChild(units, 'Imperial') : null;
  const metric = units ? firstChild(units, 'Metric') : null;
  const el = imperial ?? metric;
  const rawLinear = el ? attr(el, 'linearUnit') ?? null : null;
  const linear: LinearUnit =
    rawLinear === 'USSurveyFoot' ? 'USSurveyFoot'
    : rawLinear === 'foot' || rawLinear === 'internationalFoot' ? 'foot'
    : rawLinear === 'meter' || rawLinear === 'metre' ? 'meter'
    : 'unknown';
  return {
    linear,
    rawLinear,
    angular: el ? attr(el, 'angularUnit') ?? null : null,
    system: imperial ? 'imperial' : metric ? 'metric' : 'unknown',
  };
}

// ── Geometry ─────────────────────────────────────────────────────────────────────────────────────

export interface LandXmlPoint {
  name: string;
  /** LandXML `code` — the field code a surveyor shot it with. */
  code: string;
  description: string;
  northing: number;
  easting: number;
  /** Null when the file gave two numbers rather than three. 0 is a real elevation (trap 4). */
  elevation: number | null;
  /** When this point is a reference to another by name and carried no coordinates of its own. */
  refersTo: string | null;
}

export interface LandXmlAlignment {
  name: string;
  /** Station of the first element, as written. */
  staStart: number | null;
  length: number | null;
  /** Centreline vertices in order. Curves and spirals contribute their endpoints; the bulge is not
   *  reconstructed here, which is why `hasCurves` exists — a consumer that draws these as straight
   *  segments must know it is approximating. */
  vertices: Array<{ northing: number; easting: number }>;
  hasCurves: boolean;
}

export interface LandXmlSurface {
  name: string;
  description: string;
  /** 1-based point indices as written; faces reference these. */
  points: Array<{ id: number; northing: number; easting: number; elevation: number | null }>;
  /** Triangle vertex indices into `points`. */
  faces: Array<[number, number, number]>;
}

export interface LandXmlParcel {
  name: string;
  description: string;
  /** Area as written in the file, in the document's units. */
  area: number | null;
  /** Boundary point names in order, from `<CoordGeom>` or the parcel's point references. */
  vertices: Array<{ northing: number; easting: number }>;
  closed: boolean;
}

export interface LandXmlDocument {
  version: string | null;
  units: LandXmlUnits;
  /** The `<CoordinateSystem>` element's attributes, verbatim. A firm needs to know whether its data
   *  arrived on NAD83 Texas Central or something else, and inventing a default would be a guess about
   *  where the land is. */
  coordinateSystem: Record<string, string> | null;
  points: LandXmlPoint[];
  alignments: LandXmlAlignment[];
  surfaces: LandXmlSurface[];
  parcels: LandXmlParcel[];
  /** Non-fatal problems worth telling the user about. Never silently dropped (§1.1b). */
  warnings: string[];
}

/** Read `"3162345.12 942111.87 812.4"` in LandXML's northing-easting-elevation order (trap 1). */
function readCoords(text: string): { northing: number; easting: number; elevation: number | null } | null {
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return {
    northing: parts[0],
    easting: parts[1],
    elevation: parts.length >= 3 && Number.isFinite(parts[2]) ? parts[2] : null,
  };
}

function pointFromNode(node: XmlNode): LandXmlPoint | null {
  const name = attr(node, 'name') ?? attr(node, 'pntRef') ?? '';
  const pntRef = attr(node, 'pntRef') ?? null;
  const coords = readCoords(node.text);
  if (!coords) {
    // Trap 3: a reference-only point. Reported, not fabricated at the origin.
    if (pntRef) {
      return { name, code: attr(node, 'code') ?? '', description: attr(node, 'desc') ?? '', northing: 0, easting: 0, elevation: null, refersTo: pntRef };
    }
    return null;
  }
  return {
    name,
    code: attr(node, 'code') ?? '',
    description: attr(node, 'desc') ?? '',
    ...coords,
    refersTo: null,
  };
}

/** Pull the ordered vertices out of a `<CoordGeom>`, and say whether any of it was curved. */
function verticesFromCoordGeom(coordGeom: XmlNode): { vertices: Array<{ northing: number; easting: number }>; hasCurves: boolean } {
  const vertices: Array<{ northing: number; easting: number }> = [];
  let hasCurves = false;

  const push = (node: XmlNode | null) => {
    if (!node) return;
    const c = readCoords(node.text);
    if (!c) return;
    const last = vertices[vertices.length - 1];
    // Consecutive elements share an endpoint by construction; keeping both would double every vertex.
    if (last && last.northing === c.northing && last.easting === c.easting) return;
    vertices.push({ northing: c.northing, easting: c.easting });
  };

  for (const el of coordGeom.children) {
    const kind = localName(el.name);
    if (kind === 'Curve' || kind === 'Spiral') hasCurves = true;
    push(firstChild(el, 'Start'));
    push(firstChild(el, 'PI'));
    push(firstChild(el, 'End'));
  }
  return { vertices, hasCurves };
}

// ── The reader ───────────────────────────────────────────────────────────────────────────────────

export function parseLandXml(xmlText: string): LandXmlDocument {
  const warnings: string[] = [];
  let root: XmlNode;
  try {
    root = parseXml(xmlText);
  } catch (err) {
    // Rethrown with the format named. "Unclosed element <Surface>" on its own leaves the user
    // guessing which of the six things they tried to import was malformed.
    const detail = err instanceof XmlParseError ? `${err.message} (at character ${err.offset})` : String(err);
    throw new Error(`This does not parse as XML, so it cannot be read as LandXML: ${detail}`);
  }

  if (localName(root.name) !== 'LandXML') {
    throw new Error(`Expected a <LandXML> document; found <${root.name}>. Trimble JobXML and Leica GSI have their own readers.`);
  }

  const units = readUnits(root);
  if (units.linear === 'unknown') {
    // Trap 2. Not fatal — the numbers are still right relative to each other — but a firm merging
    // this with existing data needs to know we could not tell feet from metres.
    warnings.push('No linear unit declared. Coordinates were read as written; confirm feet vs metres before merging with existing data.');
  }

  const csNode = firstChild(root, 'CoordinateSystem');
  const coordinateSystem = csNode ? { ...csNode.attrs } : null;
  if (!coordinateSystem) {
    warnings.push('No <CoordinateSystem> declared, so the projection is unknown. Points will import, but confirm the datum before overlaying on mapped data.');
  }

  // ── Points ──
  const points: LandXmlPoint[] = [];
  let skipped = 0;
  for (const container of childrenNamed(root, 'CgPoints')) {
    for (const node of childrenNamed(container, 'CgPoint')) {
      const p = pointFromNode(node);
      if (p) points.push(p); else skipped++;
    }
  }
  // Some writers put CgPoint outside a CgPoints wrapper. Picked up, but only those not already seen.
  if (points.length === 0) {
    for (const node of descendantsNamed(root, 'CgPoint')) {
      const p = pointFromNode(node);
      if (p) points.push(p); else skipped++;
    }
  }
  if (skipped > 0) {
    warnings.push(`${skipped} point element(s) carried no readable coordinates and were skipped rather than placed at the origin.`);
  }
  const refOnly = points.filter((p) => p.refersTo).length;
  if (refOnly > 0) {
    warnings.push(`${refOnly} point(s) are references to other points by name and have no coordinates of their own.`);
  }

  // ── Alignments ──
  const alignments: LandXmlAlignment[] = [];
  for (const node of descendantsNamed(root, 'Alignment')) {
    const coordGeom = firstChild(node, 'CoordGeom');
    const { vertices, hasCurves } = coordGeom ? verticesFromCoordGeom(coordGeom) : { vertices: [], hasCurves: false };
    alignments.push({
      name: attr(node, 'name') ?? '',
      staStart: numOrNull(attr(node, 'staStart')),
      length: numOrNull(attr(node, 'length')),
      vertices,
      hasCurves,
    });
  }
  const curved = alignments.filter((a) => a.hasCurves).length;
  if (curved > 0) {
    warnings.push(`${curved} alignment(s) contain curves or spirals. Their endpoints imported; the arc geometry between them is not reconstructed in this pass.`);
  }

  // ── Surfaces ──
  const surfaces: LandXmlSurface[] = [];
  for (const node of descendantsNamed(root, 'Surface')) {
    const def = firstChild(node, 'Definition');
    if (!def) continue;
    const pnts = firstChild(def, 'Pnts');
    const faces = firstChild(def, 'Faces');

    const surfacePoints: LandXmlSurface['points'] = [];
    if (pnts) {
      for (const p of childrenNamed(pnts, 'P')) {
        const c = readCoords(p.text);
        if (!c) continue;
        surfacePoints.push({ id: Number(attr(p, 'id') ?? surfacePoints.length + 1), ...c });
      }
    }

    const surfaceFaces: Array<[number, number, number]> = [];
    if (faces) {
      for (const f of childrenNamed(faces, 'F')) {
        // `i="1"` marks an invisible face — part of the TIN's convex hull rather than the surface.
        // Keeping them would inflate the surface out to its bounding triangle.
        if (attr(f, 'i') === '1') continue;
        const idx = f.text.trim().split(/\s+/).map(Number);
        if (idx.length >= 3 && idx.every(Number.isFinite)) surfaceFaces.push([idx[0], idx[1], idx[2]]);
      }
    }

    surfaces.push({
      name: attr(node, 'name') ?? '',
      description: attr(node, 'desc') ?? '',
      points: surfacePoints,
      faces: surfaceFaces,
    });
  }

  // ── Parcels ──
  const parcels: LandXmlParcel[] = [];
  for (const node of descendantsNamed(root, 'Parcel')) {
    const coordGeom = firstChild(node, 'CoordGeom');
    const { vertices } = coordGeom ? verticesFromCoordGeom(coordGeom) : { vertices: [] };
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    parcels.push({
      name: attr(node, 'name') ?? '',
      description: attr(node, 'desc') ?? '',
      area: numOrNull(attr(node, 'area')),
      vertices,
      closed: !!first && !!last && first.northing === last.northing && first.easting === last.easting,
    });
  }

  cadLog.info('LandXML', `Parsed: ${points.length} point(s), ${alignments.length} alignment(s), ${surfaces.length} surface(s), ${parcels.length} parcel(s)`);

  return {
    version: attr(root, 'version') ?? null,
    units,
    coordinateSystem,
    points,
    alignments,
    surfaces,
    parcels,
    warnings,
  };
}

function numOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

// ── Bridge to the existing import pipeline ───────────────────────────────────────────────────────

/** LandXML points as the rows the CSV/RW5/JobXML pipeline already consumes.
 *
 *  Reference-only points are dropped here rather than imported at 0,0 — the pipeline has no concept
 *  of "a point that is really that other point", and a corner at the origin is worse than a corner
 *  that did not import. The document-level warning still names them. */
export function parseLandXmlAsRows(xmlText: string): ParsedImportRow[] {
  const doc = parseLandXml(xmlText);
  const rows: ParsedImportRow[] = [];
  let lineNumber = 0;

  for (const p of doc.points) {
    lineNumber++;
    if (p.refersTo) {
      rows.push({
        lineNumber,
        rawLine: `<CgPoint name="${p.name}" pntRef="${p.refersTo}" />`,
        error: `Point "${p.name}" is a reference to "${p.refersTo}" and carries no coordinates.`,
        data: null,
      });
      continue;
    }
    const numMatch = /^(\d+)/.exec(p.name);
    rows.push({
      lineNumber,
      rawLine: `<CgPoint name="${p.name}">${p.northing} ${p.easting}${p.elevation !== null ? ` ${p.elevation}` : ''}</CgPoint>`,
      error: null,
      data: {
        pointNumber: numMatch ? parseInt(numMatch[1], 10) : lineNumber,
        pointName: p.name || String(lineNumber),
        northing: p.northing,
        easting: p.easting,
        elevation: p.elevation,
        rawCode: p.code,
        description: p.description,
      },
    });
  }
  return rows;
}

/** Does this text look like LandXML? Used to route a dropped file to the right reader.
 *
 *  Checks for the root element rather than just the string "LandXML", which also appears in the
 *  schema URL of files that are not LandXML at all. */
export function looksLikeLandXml(text: string): boolean {
  return /<\s*(\w+:)?LandXML[\s>]/i.test(text.slice(0, 4096));
}
