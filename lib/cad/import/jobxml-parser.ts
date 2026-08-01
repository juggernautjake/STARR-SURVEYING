// lib/cad/import/jobxml-parser.ts — Trimble JobXML / JXL (audit §3c.2, item 8k: "exists, needs hardening").
//
// ── WHAT WAS WRONG WITH THE PREVIOUS VERSION, AND WHY IT MATTERED ───────────────────────────────
//
// It had two implementations — `DOMParser` in the browser, regex on the server — which is two chances
// to disagree about the same file, and they did. Both also carried the same four defects, and every
// one of them produces a file that imports "successfully" with wrong numbers:
//
// 1. **Missing coordinates became 0.** `northEl ? parseFloat(...) : 0`. A `<Point>` with no grid
//    coordinates — a JobXML file is full of them: design points, station setups, records that carry
//    only a code — landed at northing 0, easting 0. On a Texas state-plane job that is a point
//    roughly 600 miles off the Gulf coast, which at least is visible; mixed into 400 real points it
//    is a corner nobody notices.
//
// 2. **`querySelector('North')` reaches into ANY descendant.** A `<Point>` containing both a
//    `<Grid>` and a `<WGS84>` block would take whichever came first in document order. Latitude read
//    as a northing is a point in the Gulf of Guinea.
//
// 3. **JobXML's real element is not always `<Point>`.** Trimble Access writes `<PointRecord>` in JXL
//    and `<Point>` under `<Reductions>`; a file of the first kind imported as zero points and read
//    as "the file was empty".
//
// 4. **Description was hard-coded to `''`.** JobXML has both `<Code>` and `<Description1>` /
//    `<Description2>`, and crews use them differently. Throwing the descriptions away loses the note
//    that says which fence corner this is.
//
// One implementation now, on `xml-lite`, which runs in both environments. Same reasoning as §1.3:
// two sources for one answer is how they drift.
//
// **Coordinate order note.** Unlike LandXML (northing-first text content) and GSI (easting-first
// blocks), JobXML names its elements, so order is not a trap here — but the code still reads them by
// name from a *scoped* container rather than by position, which is what fixes defect 2.

import type { ParsedImportRow } from './types';
import { attr, childrenNamed, descendantsNamed, firstChild, localName, parseXml, XmlParseError, type XmlNode } from './xml-lite';
import { cadLog } from '../logger';

export interface JobXmlPoint {
  name: string;
  code: string;
  description: string;
  northing: number;
  easting: number;
  elevation: number | null;
  /** Which block the coordinates came from. Surfaced so a user can tell a reduced grid coordinate
   *  from a raw GNSS position — they are not interchangeable and mixing them is a real error. */
  source: 'grid' | 'local' | 'ecef' | 'unknown';
}

export interface JobXmlDocument {
  points: JobXmlPoint[];
  /** Non-fatal problems. Never dropped — see §1.1b. */
  warnings: string[];
}

/** The containers that hold a usable plane coordinate, in preference order. `WGS84` is deliberately
 *  absent: latitude/longitude is not a northing/easting and converting it here would need a
 *  projection this reader has not been told. */
const COORD_CONTAINERS: Array<{ tag: string; source: JobXmlPoint['source'] }> = [
  { tag: 'Grid', source: 'grid' },
  { tag: 'ComputedGrid', source: 'grid' },
  { tag: 'Local', source: 'local' },
];

const NORTH_TAGS = ['North', 'Northing'];
const EAST_TAGS = ['East', 'Easting'];
const ELEV_TAGS = ['Elevation', 'Elev', 'Height'];

function numberFrom(node: XmlNode, tags: string[]): number | null {
  for (const tag of tags) {
    const child = firstChild(node, tag);
    if (child) {
      const v = Number(child.text);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

/** Read one point element. Returns null when it carries no plane coordinate — which is a normal,
 *  frequent state in a JobXML file and must NOT become 0,0 (defect 1). */
function readPoint(node: XmlNode): JobXmlPoint | null {
  const name = firstChild(node, 'Name')?.text ?? attr(node, 'Name') ?? attr(node, 'ID') ?? '';
  const code = firstChild(node, 'Code')?.text ?? attr(node, 'Code') ?? '';
  const description = [
    firstChild(node, 'Description1')?.text,
    firstChild(node, 'Description2')?.text,
    firstChild(node, 'Description')?.text,
  ].filter(Boolean).join(' ').trim();

  // Defect 2: look inside a named container first, so a WGS84 sibling cannot be picked up by
  // accident. Only if none exists do we fall back to direct children of the point itself.
  for (const { tag, source } of COORD_CONTAINERS) {
    const container = firstChild(node, tag);
    if (!container) continue;
    const northing = numberFrom(container, NORTH_TAGS);
    const easting = numberFrom(container, EAST_TAGS);
    if (northing === null || easting === null) continue;
    return { name, code, description, northing, easting, elevation: numberFrom(container, ELEV_TAGS), source };
  }

  const northing = numberFrom(node, NORTH_TAGS);
  const easting = numberFrom(node, EAST_TAGS);
  if (northing === null || easting === null) return null;
  return { name, code, description, northing, easting, elevation: numberFrom(node, ELEV_TAGS), source: 'unknown' };
}

/** Element names that hold a point, across the JobXML and JXL dialects (defect 3). */
const POINT_TAGS = ['Point', 'PointRecord'];

export function parseJobXMLDocument(xmlText: string): JobXmlDocument {
  const warnings: string[] = [];
  let root: XmlNode;
  try {
    root = parseXml(xmlText);
  } catch (err) {
    const detail = err instanceof XmlParseError ? `${err.message} (at character ${err.offset})` : String(err);
    throw new Error(`This does not parse as XML, so it cannot be read as Trimble JobXML: ${detail}`);
  }

  const rootName = localName(root.name);
  if (!/^(JOBFile|JobFile|Job|HeaderRecord)$/i.test(rootName)) {
    // Not fatal — Trimble has shipped several root names over the years and a firm's archive will
    // contain more than one. Reported so an unexpected format is visible rather than mysterious.
    warnings.push(`Root element is <${rootName}>, which is not a Trimble JobXML root this reader recognises. Points were still read where found.`);
  }

  const seen = new Set<XmlNode>();
  const points: JobXmlPoint[] = [];
  let withoutCoordinates = 0;

  for (const tag of POINT_TAGS) {
    for (const node of descendantsNamed(root, tag)) {
      if (seen.has(node)) continue;
      seen.add(node);
      const p = readPoint(node);
      if (p) points.push(p); else withoutCoordinates++;
    }
  }

  if (withoutCoordinates > 0) {
    warnings.push(
      `${withoutCoordinates} point record(s) carry no grid or local coordinate and were skipped rather than imported at 0, 0. ` +
      'Design points, station setups and code-only records look like this and are normal in a JobXML file.',
    );
  }

  const localOnly = points.filter((p) => p.source === 'local').length;
  if (localOnly > 0) {
    warnings.push(`${localOnly} point(s) came from a <Local> block rather than <Grid> — these are on the job's local system, not the state plane grid.`);
  }
  const unknownSource = points.filter((p) => p.source === 'unknown').length;
  if (unknownSource > 0) {
    warnings.push(`${unknownSource} point(s) had coordinates directly on the record with no <Grid>/<Local> block, so which system they are on could not be confirmed.`);
  }

  cadLog.info('JobXMLParser', `Parsed ${points.length} point(s); ${withoutCoordinates} record(s) had no coordinates`);
  return { points, warnings };
}

/** The pipeline-facing signature, unchanged from before so every existing caller keeps working. */
export function parseJobXML(xmlText: string): ParsedImportRow[] {
  let doc: JobXmlDocument;
  try {
    doc = parseJobXMLDocument(xmlText);
  } catch (err) {
    return [{ lineNumber: 0, rawLine: '', error: err instanceof Error ? err.message : String(err), data: null }];
  }

  return doc.points.map((p, idx) => {
    const numMatch = /^(\d+)/.exec(p.name);
    return {
      lineNumber: idx + 1,
      rawLine: `<Point name="${p.name}"> ${p.northing} ${p.easting}`,
      error: null,
      data: {
        pointNumber: numMatch ? parseInt(numMatch[1], 10) : idx + 1,
        pointName: p.name || String(idx + 1),
        northing: p.northing,
        easting: p.easting,
        elevation: p.elevation,
        rawCode: p.code,
        description: p.description,
      },
    };
  });
}

/** Does this look like Trimble JobXML/JXL? */
export function looksLikeJobXml(text: string): boolean {
  const head = text.slice(0, 4096);
  return /<\s*(\w+:)?(JOBFile|JobFile)[\s>]/i.test(head) || /<\s*(\w+:)?PointRecord[\s>]/i.test(head);
}

/** Kept for the one caller that wanted the raw children of a named element. */
export function jobXmlChildren(node: XmlNode, name: string): XmlNode[] {
  return childrenNamed(node, name);
}
