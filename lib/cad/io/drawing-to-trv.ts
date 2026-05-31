// lib/cad/io/drawing-to-trv.ts
//
// cad-trv-import-export Slice 3 — pure serializer that turns a
// (subset of a) DrawingDocument into Traverse PC `.TRV` text. Two
// modes:
//
//   1. **Fresh export** (no `sourceTrv` opt) — emit the minimum
//      viable TRV from scratch: `999,begin`, version, `86` layer
//      records, point blocks (`0,id` + `1,desc` + `3,layer` +
//      `4,method` + `2,N,E,Z`), traverse blocks (`30,name` +
//      `10,id` pairs), `999,end`.
//
//   2. **Verbatim round-trip** (`opts.sourceTrv` set) — re-emit the
//      sourceTrv's raw lines verbatim so unknown record codes survive
//      a round trip. The smart selective-rewrite (apply our drawing's
//      changes back into the source while preserving unknown codes)
//      is a documented follow-up; this Slice ships the lossless
//      passthrough so callers don't accidentally drop fields when
//      they save unchanged.
//
// Pure module: no I/O, no zustand. Safe to unit-test.

import type { DrawingDocument, Feature, Layer } from '../types';
import type { TrvDocument, TrvProjection, TrvMetadata, TrvGnss, TrvDrawingElement, TrvLotSegment } from './trv-parser';
import { serializeTrv } from './trv-parser';

export interface DrawingToTrvOptions {
  /** When provided, take this as the canonical record stream and
   *  re-emit it verbatim. Future slices will apply the doc's changes
   *  on top while preserving unknown codes. */
  sourceTrv?: TrvDocument;
  /** cad-trv-import-export Pass 4 — when `sourceTrv` is set + this
   *  flag is true, walk the source's raw lines and patch only the
   *  records whose corresponding features have been edited (coord
   *  changes today; add/remove TBD). Unknown codes still round-trip
   *  verbatim because the source's lines are the base. Defaults
   *  false (Slice 3's verbatim passthrough). */
  applyChanges?: boolean;
  /** Traverse PC version stamp for fresh exports. Defaults to the
   *  same value we observed in the live 2026-vintage samples. */
  version?: string;
  /** cad-trv-import-export Pass 1 — projection / metadata / gnss
   *  blocks to emit on a fresh export. When the drawing was
   *  imported from a TRV, callers can pass the original blocks
   *  back through to preserve the projection setup + project
   *  metadata even when not using sourceTrv passthrough. */
  projection?: TrvProjection | null;
  metadata?: TrvMetadata | null;
  gnss?: TrvGnss | null;
  /** cad-trv-import-export Pass 2 — drawing elements (28/29) +
   *  lot/parcel segments (13) to emit on a fresh export. Each
   *  drawingElement's raw header + property field arrays are
   *  serialized verbatim so the round-trip is lossless even
   *  though we don't (yet) interpret the records semantically. */
  drawingElements?: ReadonlyArray<TrvDrawingElement>;
  lotSegments?: ReadonlyArray<TrvLotSegment>;
}

const DEFAULT_VERSION = '26.000';
const CRLF = '\r\n';

/** Strip our `trv-*:` prefix from an id so it can be re-emitted as
 *  the original TRV id. Non-trv ids fall back to the input. */
function unprefix(prefix: string, id: string): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** Layer id in TRV form. */
const trvLayerId = (l: Layer): string => unprefix('trv-layer:', l.id);

/** Point id in TRV form. */
const trvPointId = (f: Feature): string => unprefix('trv-point:', f.id);

/** Resolve a point feature's (north, east, elevation) for export.
 *  Prefers the `surveyNorth` / `surveyEast` properties we stash on
 *  import so coords round-trip exactly. Falls back to the inverse
 *  of the screen-y-down transform when those properties are absent
 *  (manually-drawn point that didn't come from a TRV import). */
function pointCoords(f: Feature): { north: number; east: number; elevation: number } {
  const surveyNorth = f.properties.surveyNorth;
  const surveyEast = f.properties.surveyEast;
  const elevation = f.properties.elevation;
  const north = typeof surveyNorth === 'number'
    ? surveyNorth
    : (typeof f.geometry.point?.y === 'number' ? -f.geometry.point.y : 0);
  const east = typeof surveyEast === 'number'
    ? surveyEast
    : (typeof f.geometry.point?.x === 'number' ? f.geometry.point.x : 0);
  const z = typeof elevation === 'number' ? elevation : 0;
  return { north, east, elevation: z };
}

/** Format a number for TRV output. Caps precision at `decimals` (so
 *  we don't emit Float-glitch tails like `0.30000000000000004`) but
 *  trims trailing zeros so a value like `4994.142075` doesn't
 *  pick up a phantom zero at position 7. Integers stay integer-
 *  printed (`700`, not `700.0`). */
function num(n: number, decimals = 7): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return n.toString();
  const fixed = n.toFixed(decimals);
  // Strip trailing zeros + optional trailing dot.
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

/** Emit one point block. */
function emitPoint(f: Feature, layerIdByOurId: Map<string, string>): string[] {
  const lines: string[] = [];
  lines.push(`0,${trvPointId(f)}`);
  const desc = f.properties.label;
  if (typeof desc === 'string' && desc.length > 0) {
    lines.push(`1,${desc}`);
  }
  const ourLayerId = f.layerId;
  const trvLid = ourLayerId ? layerIdByOurId.get(ourLayerId) ?? '0' : '0';
  lines.push(`3,${trvLid}`);
  const methodCode = f.properties.trvMethodCode;
  const mc = typeof methodCode === 'string' && methodCode.length > 0 ? methodCode : '5';
  lines.push(`4,${mc},0,0`);
  const { north, east, elevation } = pointCoords(f);
  lines.push(`2,${num(north)},${num(east)},${num(elevation, 3)}`);
  return lines;
}

/** Emit one traverse block (POLYLINE / POLYGON). The vertex order
 *  is taken from the feature's geometry; if the feature originated
 *  from a TRV import the original ref-id list is preserved in
 *  `properties.trvPointRefs`, which lets us re-emit the exact
 *  ref sequence (including the closing ref of a POLYGON).
 *  Otherwise we synthesize refs from feature ids derived in this
 *  export pass (callers that built a new traverse with a fresh
 *  vertex chain not tied to TRV points are out of scope for Slice
 *  3 — fully synthetic traverses come with the Slice-5 coord-
 *  handling work). */
function emitTraverse(f: Feature, sourceLineCounter: { i: number }, layerIdByOurId: Map<string, string>): string[] {
  const lines: string[] = [];
  const name = typeof f.properties.name === 'string' ? f.properties.name : '';
  lines.push(`30,${name}`);
  const refs = (typeof f.properties.trvPointRefs === 'string'
    ? f.properties.trvPointRefs.split(',').filter((s) => s.length > 0)
    : []);
  if (refs.length === 0) {
    // No round-trip refs; skip the body so we don't emit a
    // malformed traverse. The header alone is harmless (other
    // tooling treats a body-less 30 as an empty traverse).
    lines.push(`31,0,0,0,0`);
    return lines;
  }
  const ourLayerId = f.layerId;
  const trvLid = ourLayerId ? layerIdByOurId.get(ourLayerId) ?? '0' : '0';
  lines.push(`31,0,${refs.length},0,0`);
  // Pass 3 — re-emit any captured styling records (32-76, 159-162,
  // 349-369, etc.) before the 10/11 ref pairs. Source order in the
  // live samples puts them between 31 and the first 10, so we
  // mirror that. The JSON-serialized capture lives in
  // properties.trvStylingRecords.
  const rawStyling = typeof f.properties.trvStylingRecords === 'string'
    ? f.properties.trvStylingRecords
    : null;
  if (rawStyling) {
    try {
      const parsed = JSON.parse(rawStyling) as Array<{ code: string; fields: string[] }>;
      for (const r of parsed) lines.push(`${r.code},${r.fields.join(',')}`);
    } catch {
      // Malformed JSON — silently skip rather than break the export.
    }
  }
  refs.forEach((ref, i) => {
    lines.push(`10,${ref}`);
    lines.push(`11,1,${i},0,${trvLid},0`);
  });
  sourceLineCounter.i += lines.length;
  return lines;
}

/** Serialize a DrawingDocument (or subset) into Traverse PC `.TRV`
 *  text. See module header for the two-mode behavior. */
export function drawingToTrv(doc: DrawingDocument, opts: DrawingToTrvOptions = {}): string {
  // Mode 1: sourceTrv supplied.
  if (opts.sourceTrv) {
    // Pass 4 — smart-merge: patch only the changed records (point
    // coords); leave unknown codes intact. Otherwise (Slice 3
    // verbatim mode), re-emit the source byte-for-byte.
    if (opts.applyChanges) {
      return mergeSourceTrvWithDoc(opts.sourceTrv, doc);
    }
    return serializeTrv(opts.sourceTrv);
  }

  // Mode 2: fresh export. Build the minimum viable TRV from scratch.
  const version = opts.version ?? DEFAULT_VERSION;
  const out: string[] = [];

  // Build our-layer-id → TRV-layer-id map so points + traverses can
  // reference layers by their TRV id.
  const layerIdByOurId = new Map<string, string>();
  const layers = doc.layerOrder
    .map((id) => doc.layers[id])
    .filter((l): l is Layer => !!l);
  layers.forEach((l, i) => {
    const tid = trvLayerId(l) || String(i);
    layerIdByOurId.set(l.id, tid);
  });

  out.push('#,TRAVERSE PC');
  out.push('999,begin');
  out.push(`80,${version}`);
  out.push('#,SURVEY');
  out.push('83,0');
  for (const l of layers) {
    const tid = layerIdByOurId.get(l.id) ?? '0';
    // 86,name,id,parent_id (we don't track parent; emit 0)
    out.push(`86,${l.name},${tid},0`);
  }
  // Pass 1 — emit the projection block + project metadata + GNSS
  // settings when supplied. Each is independently optional; raw
  // field arrays come straight from the imported source so the
  // round-trip is byte-faithful.
  const meta = opts.metadata;
  if (meta?.sourcePath) out.push(`90,${meta.sourcePath}`);
  const proj = opts.projection;
  if (proj?.raw91.length) out.push(`91,${proj.raw91.join(',')}`);
  if (proj?.raw92.length) out.push(`92,${proj.raw92.join(',')}`);
  if (proj?.raw93.length) out.push(`93,${proj.raw93.join(',')}`);
  if (proj?.raw94.length) out.push(`94,${proj.raw94.join(',')}`);
  if (meta?.projectName) out.push(`101,${meta.projectName}`);
  if (meta?.surveyDate) out.push(`102,${meta.surveyDate}`);
  if (meta?.scale) out.push(`103,${meta.scale}`);
  if (meta?.units) out.push(`104,${meta.units}`);
  if (meta?.raw105) out.push(`105,${meta.raw105}`);
  if (typeof meta?.pointCount === 'number') out.push(`106,${meta.pointCount}`);
  if (opts.gnss) {
    out.push('#,GNSS');
    if (opts.gnss.raw199.length) out.push(`199,${opts.gnss.raw199.join(',')}`);
    if (opts.gnss.raw198.length) out.push(`198,${opts.gnss.raw198.join(',')}`);
  }
  out.push('#,POINTS');
  const allFeatures = Object.values(doc.features);
  const points = allFeatures.filter((f) => f.type === 'POINT');
  out.push(`95,${points.length}`);
  for (const p of points) {
    for (const line of emitPoint(p, layerIdByOurId)) out.push(line);
  }
  const traverses = allFeatures.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON');
  if (traverses.length > 0) {
    out.push('#,TRAVERSE');
    const counter = { i: 0 };
    for (const t of traverses) {
      for (const line of emitTraverse(t, counter, layerIdByOurId)) out.push(line);
    }
  }
  // Pass 2 — drawing elements (28/29) + lot/parcel segments (13)
  // re-emitted verbatim from their raw field arrays. Order: lots
  // first (typically appear earlier in source files), then drawing
  // elements (sheets, north arrows, scale bars, etc.).
  if (opts.lotSegments && opts.lotSegments.length > 0) {
    out.push('#,LOTS');
    for (const seg of opts.lotSegments) {
      out.push(`13,${seg.fields.join(',')}`);
    }
  }
  if (opts.drawingElements && opts.drawingElements.length > 0) {
    out.push('#,DRAWING');
    for (const elt of opts.drawingElements) {
      if (elt.header.length > 0) out.push(`28,${elt.header.join(',')}`);
      for (const prop of elt.properties) out.push(`29,${prop.join(',')}`);
    }
  }
  out.push('999,end');
  return out.join(CRLF);
}

/** cad-trv-import-export Pass 4 + Pass 9 — smart-merge serializer.
 *  Walks every raw line of `sourceTrv` and produces a TRV that
 *  reflects the current drawing while preserving source structure
 *  + unknown codes:
 *
 *  - **Coord patch** (Pass 4): point-coord (`2,N,E,Z`) lines for
 *    moved points are rewritten; tolerance 1e-6 ft.
 *  - **Deletes** (Pass 9): a point that was in the source but is
 *    GONE from the current doc has its entire block (`0,id` →
 *    `2,...` inclusive) dropped from the output. Traverse `10,id`
 *    refs to deleted points are dropped (and the matching `11,...`
 *    edge descriptor with them).
 *  - **Adds** (Pass 9): features that have no `trvPointId` (POINT
 *    features the surveyor added after import) are emitted as
 *    fresh point blocks just before `999,end`.
 *  - **`95,N` count rewrite** (Pass 9): the points-count header is
 *    updated to (original count - deletes + adds).
 *
 *  Every other source line round-trips verbatim. */
function mergeSourceTrvWithDoc(sourceTrv: TrvDocument, doc: DrawingDocument): string {
  type Patch = { line: number; north: number; east: number; elevation: number };
  const patches: Patch[] = [];
  const featuresByTrvId = new Map<string, Feature>();
  for (const f of Object.values(doc.features)) {
    const trvPointId = f.properties.trvPointId;
    if (typeof trvPointId === 'string') featuresByTrvId.set(trvPointId, f);
  }

  // Pass 9 — detect deletes: source points whose trvPointId is no
  // longer in the doc. Their entire block lines (0/1/2/3/4) get
  // marked for skip.
  const deletedTrvIds = new Set<string>();
  const skipLines = new Set<number>();
  for (const p of sourceTrv.points) {
    if (featuresByTrvId.has(p.id)) continue;
    deletedTrvIds.add(p.id);
    // Mark the point block's lines for skip: from the 0,<id> line
    // through the next 0 or section boundary or 999.
    for (let i = p.sourceLine; i < sourceTrv.lines.length; i++) {
      const ln = sourceTrv.lines[i];
      if (i !== p.sourceLine && (ln.code === '0' || ln.code === '#' || ln.code === '999')) break;
      skipLines.add(i);
    }
  }
  // Traverse refs to deleted points: also skip the 10,<id> line +
  // the following 11,... edge-descriptor line (which is paired).
  for (let i = 0; i < sourceTrv.lines.length; i++) {
    const ln = sourceTrv.lines[i];
    if (ln.code === '10' && deletedTrvIds.has((ln.fields[0] ?? '').trim())) {
      skipLines.add(i);
      const next = sourceTrv.lines[i + 1];
      if (next && next.code === '11') skipLines.add(i + 1);
    }
  }

  // Pass 4 — coord patches for moved points.
  for (const p of sourceTrv.points) {
    if (deletedTrvIds.has(p.id)) continue;
    const feat = featuresByTrvId.get(p.id);
    if (!feat) continue;
    const { north, east, elevation } = pointCoords(feat);
    const sourceLineOfTwo = findLineIndex(sourceTrv, p.sourceLine, '2');
    if (sourceLineOfTwo === -1) continue;
    const dN = Math.abs(north - (p.north ?? 0));
    const dE = Math.abs(east - (p.east ?? 0));
    const dZ = Math.abs(elevation - (p.elevation ?? 0));
    if (dN < 1e-6 && dE < 1e-6 && dZ < 1e-6) continue;
    patches.push({ line: sourceLineOfTwo, north, east, elevation });
  }

  // Pass 9 — detect adds: POINT features without a trvPointId.
  // Each gets its own 0/1/3/4/2 block appended just before 999,end.
  const addedPoints: Feature[] = [];
  for (const f of Object.values(doc.features)) {
    if (f.type !== 'POINT') continue;
    if (typeof f.properties.trvPointId === 'string') continue;
    addedPoints.push(f);
  }

  // Walk + emit.
  const layerIdByOurId = new Map<string, string>();
  // The merge path doesn't have a layerOrder to compute layerIdByOurId
  // from, so synthesize the map from the source's 86 records — we
  // need it for emitPoint to write a valid `3,<layerId>` line.
  for (const l of sourceTrv.layers) layerIdByOurId.set(`trv-layer:${l.id}`, l.id);
  const out: string[] = [];
  // Rewrite `95,<count>` lines to the new total. There may be
  // multiple `95` lines per file (the live samples have one); we
  // patch every occurrence.
  const newPointCount = sourceTrv.points.length - deletedTrvIds.size + addedPoints.length;
  for (let i = 0; i < sourceTrv.lines.length; i++) {
    if (skipLines.has(i)) continue;
    const ln = sourceTrv.lines[i];
    // Patch coords?
    const patch = patches.find((p) => p.line === i);
    if (patch) {
      out.push(`2,${num(patch.north)},${num(patch.east)},${num(patch.elevation, 3)}`);
      continue;
    }
    // Rewrite the points-count line.
    if (ln.code === '95') {
      out.push(`95,${newPointCount}`);
      continue;
    }
    // Append new-point blocks right before `999,end` (the LAST
    // line of the source).
    if (ln.code === '999' && (ln.fields[0] ?? '').trim() === 'end' && addedPoints.length > 0) {
      for (const f of addedPoints) {
        for (const newLine of emitPoint(f, layerIdByOurId)) out.push(newLine);
      }
    }
    out.push(ln.raw);
  }
  return out.join(CRLF);
}

/** Find the first line at-or-after `startIdx` whose code equals
 *  `targetCode`. Stops at the next `0,` opener so we don't cross
 *  point block boundaries. Returns -1 when not found. */
function findLineIndex(sourceTrv: TrvDocument, startIdx: number, targetCode: string): number {
  for (let i = startIdx; i < sourceTrv.lines.length; i++) {
    const l = sourceTrv.lines[i];
    if (l.code === targetCode) return i;
    if (l.code === '0' && i !== startIdx) return -1;
  }
  return -1;
}
