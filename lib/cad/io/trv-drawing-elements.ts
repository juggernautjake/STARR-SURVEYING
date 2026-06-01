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
