// lib/cad/io/trv-drawing-elements.ts
//
// cad-trv-element-coverage Slice 2 — pure helpers to recognise
// the highest-value subtypes of TRV's 28/29 drawing-element
// records and turn them into Starr equivalents. The full 28/29
// surface has at least a dozen subtypes per file; this module
// covers the ones with a clear semantic mapping today + leaves
// the rest as opaque round-trip data.
//
// Subtype catalog (live samples 2026-05-31):
//
//   28 header[0] = '0'  / '1'        — drawing-setup (paper / margins)
//                = '5'                — paper-relative text (firm
//                                       name, address, phone in
//                                       title block). Skipped here
//                                       because the coords are
//                                       relative to TRV's paper
//                                       origin which we don't have.
//                = '10'               — DXF symbol reference
//                                       (North Arrow / Scale Bar)
//                = '12'  ← **mapped** — point label (descriptive
//                                       text drawn next to a
//                                       survey point)
//                = '20' / '32' / '33' — boundary / curve metadata
//                                       (round-trip only for now)
//
// Pure module: no DOM, no React, no store deps.

import type { TrvDrawingElement } from './trv-parser';
import type { Point2D } from '../types';

/** A subtype-12 point label = `28,12,<pointId>` opener with a
 *  paired `29,5,...,...,"<text>¶"` body. The text payload is in
 *  the 29's LAST field, with `¶` (U+00B6) as a multi-line
 *  separator. We split on it so a multi-line label round-trips
 *  cleanly into our `\n`-separated `properties.label` slot. */
export interface PointLabel {
  /** TRV point id this label is attached to (header[1] of the 28
   *  record — matches `TrvPoint.id`). */
  trvPointId: string;
  /** Label text, multi-line joined with `\n`. */
  label: string;
  /** Source line of the opening 28 record (for audit trail +
   *  round-trip lineage). */
  sourceLine: number;
}

/** Pilcrow (U+00B6) — TRV's in-band multi-line separator. */
const PILCROW = '¶';
/** DC4 (device-control-4, U+0014) — TRV uses this to separate
 *  the point-id token from descriptive text inside the 29's
 *  last field, e.g. `'443\x14930 5ft os'`. Our rendered label
 *  joins the surrounding tokens with a single space. */
const DC4 = '\x14';

/** Walk every drawing element + extract subtype-12 point labels.
 *  Each label carries the TRV point id + the cleaned text. */
export function extractPointLabels(elements: ReadonlyArray<TrvDrawingElement>): PointLabel[] {
  const out: PointLabel[] = [];
  for (const de of elements) {
    if (de.header[0] !== '12') continue;
    const trvPointId = de.header[1];
    if (typeof trvPointId !== 'string' || trvPointId.length === 0) continue;
    // The text payload sits in the LAST field of the FIRST 29
    // record whose subtype (field 0) is "5" (text run). When the
    // 28 has no such 29 we drop the label entirely; the round-
    // trip still preserves the original record.
    const textRun = de.properties.find((p) => p[0] === '5');
    const raw = textRun?.[textRun.length - 1] ?? '';
    const label = cleanLabelText(String(raw));
    if (label.length === 0) continue;
    out.push({ trvPointId, label, sourceLine: de.sourceLine });
  }
  return out;
}

/** Clean a TRV label payload — strip the trailing pilcrow,
 *  collapse pilcrows + field separators into reader-friendly
 *  separators. */
export function cleanLabelText(raw: string): string {
  return raw
    .replace(new RegExp(PILCROW + '$'), '')
    .split(PILCROW)
    .map((line) => line.split(DC4).filter((s) => s.length > 0).join(' '))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** cad-trv-line-curve-fidelity Slice 1 — a `28,15,<from>,<to>`
 *  line-segment label. Traverse PC draws the bearing+distance
 *  text along the line connecting two points, with the verbatim
 *  string in the paired `29,5,...` record's last field
 *  (e.g. `N 73°34'00" W 299.62'`). Capturing TPC's exact string
 *  guarantees a pixel-match on the rendered label. */
export interface LineSegmentLabel {
  /** TRV point id at the start of the labeled segment. */
  fromId: string;
  /** TRV point id at the end of the labeled segment. */
  toId: string;
  /** TPC's verbatim label text (cleaned of pilcrow / DC4). */
  text: string;
  /** Source line of the opening `28,15` record. */
  sourceLine: number;
}

/** Walk every drawing element + extract subtype-15 line-segment
 *  labels (the `28,15,<from>,<to>` blocks). */
export function extractLineLabels(elements: ReadonlyArray<TrvDrawingElement>): LineSegmentLabel[] {
  const out: LineSegmentLabel[] = [];
  for (const de of elements) {
    if (de.header[0] !== '15') continue;
    const fromId = de.header[1];
    const toId = de.header[2];
    if (typeof fromId !== 'string' || fromId.length === 0) continue;
    if (typeof toId !== 'string' || toId.length === 0) continue;
    const textRun = de.properties.find((p) => p[0] === '5');
    const raw = textRun?.[textRun.length - 1] ?? '';
    const text = cleanLabelText(String(raw));
    if (text.length === 0) continue;
    out.push({ fromId, toId, text, sourceLine: de.sourceLine });
  }
  return out;
}

/** cad-trv-drawing-element-rendering Slice 1 — a `28,16,<from>,<to>`
 *  connector. Traverse PC draws a straight line segment between two
 *  survey points as a drawing element (edge of pavement, building
 *  lines, fences, etc.) — distinct from the boundary traverses. The
 *  geometry is implied by the two referenced point ids, so we only
 *  capture the id pair here + resolve coords at map time. */
export interface Connector {
  /** TRV point id at the start of the connector segment. */
  fromId: string;
  /** TRV point id at the end of the connector segment. */
  toId: string;
  /** Source line of the `28,16` record. */
  sourceLine: number;
}

/** Walk every drawing element + extract subtype-16 point-to-point
 *  connector segments (`28,16,<from>,<to>`). */
export function extractConnectors(elements: ReadonlyArray<TrvDrawingElement>): Connector[] {
  const out: Connector[] = [];
  for (const de of elements) {
    if (de.header[0] !== '16') continue;
    const fromId = de.header[1];
    const toId = de.header[2];
    if (typeof fromId !== 'string' || fromId.length === 0) continue;
    if (typeof toId !== 'string' || toId.length === 0) continue;
    if (fromId === toId) continue;
    out.push({ fromId, toId, sourceLine: de.sourceLine });
  }
  return out;
}

/** cad-trv-drawing-element-rendering Slice 3 — a `28,5` text element.
 *  Layout: `28,5,x,y,a,b,fontSize,c,d,<text…>`. Traverse PC uses it
 *  for BOTH the world-placed site annotations ("grass", "asphalt
 *  parking", deed calls) AND the paper-space title-block text (firm
 *  name, job no.). World vs paper is told apart by coordinate
 *  magnitude. The text payload is everything from field 9 onward —
 *  JOINED with ',' because legal notes contain commas — then cleaned
 *  of the `¶` multi-line separator. */
export interface TextElement {
  /** Placement coordinate. WORLD → (E, N); PAPER → title-block units. */
  x: number;
  y: number;
  /** TPC point size (field 6). */
  fontSize: number;
  /** Cleaned, multi-line (`\n`) text. */
  text: string;
  /** WORLD-placed (survey coords) vs PAPER-space (title block). */
  space: 'WORLD' | 'PAPER';
  /** Source line of the `28,5` record. */
  sourceLine: number;
}

/** Coordinates beyond this magnitude are world (state-plane feet);
 *  smaller ones are paper-space title-block placements. */
const TEXT_WORLD_THRESHOLD = 100000;

/** Walk every drawing element + extract subtype-5 text elements. */
export function extractTextElements(elements: ReadonlyArray<TrvDrawingElement>): TextElement[] {
  const out: TextElement[] = [];
  for (const de of elements) {
    if (de.header[0] !== '5') continue;
    const x = Number(de.header[1]);
    const y = Number(de.header[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fontSize = Number(de.header[5]);
    // Text = fields 9..end joined with ',' (it may contain commas),
    // then cleaned of pilcrow / DC4.
    const text = cleanLabelText(de.header.slice(8).join(','));
    if (text.length === 0) continue;
    const space: TextElement['space'] =
      Math.abs(x) > TEXT_WORLD_THRESHOLD || Math.abs(y) > TEXT_WORLD_THRESHOLD ? 'WORLD' : 'PAPER';
    out.push({ x, y, fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 0, text, space, sourceLine: de.sourceLine });
  }
  return out;
}

/** cad-trv-drawing-element-rendering Slice 2 — a free geometry
 *  drawing element with coordinates carried INLINE in the `28`
 *  header (not via point-id refs):
 *    - `28,30,<nPts>,E1,N1,E2,N2,…` — a polyline (footprints,
 *      structures, pavement). Closed when the first vertex repeats
 *      as the last.
 *    - `28,4,E1,N1,E2,N2,Z` — a single line segment.
 *  Element coords are (East, North); Starr world is `{x: E, y: N}`,
 *  so each pair maps first→x, second→y (NO swap — unlike point
 *  records which are N,E). */
export interface ElementShape {
  kind: 'POLYLINE' | 'LINE';
  /** Vertices in Starr world space (`{x: E, y: N}`). */
  vertices: Point2D[];
  /** True when the polyline's first + last vertex coincide (the
   *  duplicate closing vertex is dropped from `vertices`). */
  closed: boolean;
  /** Source line of the `28` record. */
  sourceLine: number;
}

const SHAPE_EPS = 1e-4;
const samePt = (a: Point2D, b: Point2D) =>
  Math.abs(a.x - b.x) < SHAPE_EPS && Math.abs(a.y - b.y) < SHAPE_EPS;

/** Walk every drawing element + extract subtype-30 polylines and
 *  subtype-4 line segments as world-space geometry. */
export function extractElementShapes(elements: ReadonlyArray<TrvDrawingElement>): ElementShape[] {
  const out: ElementShape[] = [];
  for (const de of elements) {
    if (de.header[0] === '4') {
      // 28,4,E1,N1,E2,N2,Z — two endpoints (Z ignored).
      const n = de.header.slice(1, 5).map(Number);
      if (n.length < 4 || n.some((v) => !Number.isFinite(v))) continue;
      const verts = [{ x: n[0], y: n[1] }, { x: n[2], y: n[3] }];
      if (samePt(verts[0], verts[1])) continue; // zero-length
      out.push({ kind: 'LINE', vertices: verts, closed: false, sourceLine: de.sourceLine });
      continue;
    }
    if (de.header[0] === '30') {
      // 28,30,<nPts>,E1,N1,E2,N2,… — read nPts coord pairs.
      const nPts = Number(de.header[1]);
      if (!Number.isFinite(nPts) || nPts < 2) continue;
      const coords = de.header.slice(2).map(Number);
      const verts: Point2D[] = [];
      for (let i = 0; i + 1 < coords.length && verts.length < nPts; i += 2) {
        const x = coords[i];
        const y = coords[i + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        verts.push({ x, y });
      }
      // Collapse consecutive duplicate vertices (TPC pads the last
      // pair on some records).
      const dedup: Point2D[] = [];
      for (const v of verts) {
        const last = dedup[dedup.length - 1];
        if (last && samePt(last, v)) continue;
        dedup.push(v);
      }
      if (dedup.length < 2) continue;
      // Closed when first ≈ last → drop the closing duplicate.
      let closed = false;
      if (dedup.length > 2 && samePt(dedup[0], dedup[dedup.length - 1])) {
        closed = true;
        dedup.pop();
      }
      out.push({ kind: 'POLYLINE', vertices: dedup, closed, sourceLine: de.sourceLine });
    }
  }
  return out;
}

/** cad-trv-line-curve-fidelity Slice 1 — a `28,14,<n>` area /
 *  free-text annotation. Traverse PC uses this for the closed-
 *  traverse area callout (e.g. `43362 SqFt / 0.995 Acres`). */
export interface AreaLabel {
  /** TPC's verbatim text (cleaned). */
  text: string;
  /** Source line of the opening `28,14` record. */
  sourceLine: number;
}

/** Walk every drawing element + extract subtype-14 area / text
 *  annotations (the `28,14,<n>` blocks). */
export function extractAreaLabels(elements: ReadonlyArray<TrvDrawingElement>): AreaLabel[] {
  const out: AreaLabel[] = [];
  for (const de of elements) {
    if (de.header[0] !== '14') continue;
    const textRun = de.properties.find((p) => p[0] === '5');
    const raw = textRun?.[textRun.length - 1] ?? '';
    const text = cleanLabelText(String(raw));
    if (text.length === 0) continue;
    out.push({ text, sourceLine: de.sourceLine });
  }
  return out;
}
