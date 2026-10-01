// lib/cad/io/trv-parser.ts
//
// cad-trv-import-export Slice 1 — pure parser for Traverse PC `.TRV`
// files. The format is line-oriented CSV with a leading numeric
// record code (or `#` for a comment / section marker). See the
// format reference in
// docs/planning/completed/cad-trv-import-export-2026-05-31.md.
//
// Design goals:
//
//  1. Every line is preserved verbatim in `lines` so that a
//     downstream serializer can round-trip unknown record codes
//     back out without data loss.
//  2. The parser NEVER throws on a malformed line — it captures
//     the problem in `errors[]` and keeps going. A partially-
//     malformed TRV still yields a partially-correct document the
//     user can inspect.
//  3. The interpreted views (`layers`, `points`, `traverses`,
//     `metadata`, `sections`) are computed on top of `lines` so
//     callers can audit how each interpreted record maps back to
//     its source line index.
//  4. Pure module: no I/O, no DOM, no React. Safe to unit-test.
//
// cad-trv-drawing-element-rendering Slice 7 — record codes seen in
// the wild that are PRESERVED VERBATIM (round-trip via `lines`) but
// intentionally NOT interpreted into a structured view, because they
// drive Traverse PC's own UI/report config rather than the drawn
// geometry: `100` (Drawing Groups, e.g. `100,Plats,4,0` — TPC layer-
// panel groupings; Starr's import deliberately collapses to two
// synthetic Drawing/Points layers so these aren't surfaced), `136-162`
// (per-traverse bearing/distance label format templates) and `349-369`
// (print/report fonts, colors, margins). Don't re-flag these as
// "missing" — they have no geometric effect and round-trip losslessly.

/** A single raw line, preserved verbatim from the source file (modulo
 *  CRLF stripping). Sequential `index` matches the line order in the
 *  original document, so serialization can stream lines back out in
 *  the same order. */
export interface TrvLine {
  /** 0-based position within the source file. */
  index: number;
  /** Numeric record code as a string when the line is a data record,
   *  '#' when the line is a comment / section marker, or null when
   *  the line is blank. */
  code: string | null;
  /** CSV fields AFTER the record code. For `0,1` the fields are
   *  `['1']`; for `2,4994.142,4999.067,700` the fields are
   *  `['4994.142', '4999.067', '700']`. */
  fields: string[];
  /** Verbatim original line content (sans the trailing CR / LF). */
  raw: string;
}

/** Section marker lifted from a `#,X` line. We track the active
 *  section so a downstream record-walker can disambiguate code-0
 *  point records (which can appear under `#,POINTS`) from code-0
 *  records that mean something else under another section. */
export interface TrvSection {
  /** Section label (the text after `#,`). Examples: `SURVEY`,
   *  `POINTS`, `TRAVERSE`, `GNSS`, `Calibrations`. */
  label: string;
  /** Line index where this section starts. */
  startIndex: number;
  /** Line index just past the last line of this section (exclusive). */
  endIndex: number;
}

export interface TrvLayer {
  /** Numeric layer id as a string (TRV ids start at 0 and are
   *  typically dense, but we keep them as strings so a non-numeric
   *  id from a non-standard file doesn't get coerced silently). */
  id: string;
  name: string;
  /** Parent layer id, or null when the layer is a root layer. */
  parentId: string | null;
  /** Source line that defined this layer (so serializer + audit UI
   *  can point back). */
  sourceLine: number;
}

export interface TrvPoint {
  /** Point id as written in the source (`1`, `1:1`, `20fnd`, etc.).
   *  Kept as a string because TRV ids are not always numeric. */
  id: string;
  /** Optional description (record code 1). */
  description: string | null;
  /** Layer id reference (record code 3). Null when unspecified. */
  layerId: string | null;
  /** Method code (record code 4 field 0). 5 = GPS, 6 = traverse,
   *  others observed but undocumented. Null when unspecified. */
  methodCode: string | null;
  /** Northing (state-plane survey feet). Null when missing or
   *  unparseable. */
  north: number | null;
  /** Easting (state-plane survey feet). Null when missing or
   *  unparseable. */
  east: number | null;
  /** Elevation (state-plane survey feet). Null when missing or
   *  unparseable. */
  elevation: number | null;
  /** Source line where the point's `0,<id>` opener was found. */
  sourceLine: number;
  /** trv-full-support — raw numeric value of record `3`. Observed values
   *  are 0 / 2 / 4 / 6 / 64 / 68 / 258: a bit field, NOT a dense layer
   *  index (the legacy `layerId` keeps the same raw string for backward
   *  compatibility). Undefined / null when absent. */
  attrFlags?: number | null;
}

/** trv-full-support — one point reference inside a traverse, with the
 *  per-reference records that follow its `10,<id>` line:
 *
 *    11,<flags>,<seq>,0,<drawingLayerId>,0
 *        flags bit 8  = normal vertex (almost always set)
 *        flags bit 16 = PEN UP: no line is drawn INTO this point
 *                       (inferred: segments into these refs never carry
 *                       a `28,15` label; CSV point lists set it on
 *                       every ref)
 *        flags bit 4  = point was computed by a COGO entry (a `13`
 *                       record follows)
 *        flags 0      = terminal ref (last point of an open traverse)
 *        drawingLayerId = drawing layer the segment is drawn on (always
 *                       3 = "TPCLines" in the samples)
 *    12,<132|134>    curve marker: 132 = a curve leaves this point,
 *                    134 = last point of a curve run
 *    13,<flags>,<dist>,<dz>,<azimuthDeg>,0,<radius>,<n>f
 *                    the COGO observation that produced this point
 *    190,…           (rare) per-ref adjustment record, kept raw */
export interface TrvTraverseRef {
  pointId: string;
  /** `11` field 0 (null when no `11` record followed). */
  flags: number | null;
  /** `11` field 1: TPC's running sequence number. */
  seq: number | null;
  /** `11` field 3: drawing-layer id of the segment (null if absent). */
  drawingLayerId: string | null;
  /** True when bit 16 of `flags` is set: no line drawn into this ref. */
  penUp: boolean;
  /** `12` field 0: 132 / 134 curve marker, null when absent. */
  curveMarker: number | null;
  /** Decoded `13` COGO record, null when absent. */
  cogo: TrvCogoObservation | null;
  /** Any other per-ref record (190 …) preserved raw. */
  extra: Array<{ code: string; fields: string[] }>;
  sourceLine: number;
}

/** trv-full-support — a decoded `13` record. */
export interface TrvCogoObservation {
  flags: number;
  distance: number | null;
  dz: number | null;
  azimuthDeg: number | null;
  radius: number | null;
  raw: string[];
}

/** trv-full-support — one `#,LINES` entry: a CURVE between two points.
 *  `20,<from>` `21,<to>` `22,<flags>,0,0` `23,<signedRadius>`. Every
 *  sample radius is at least half the chord, so the radius defines a
 *  circular arc. Sign: NEGATIVE = centre on the LEFT of from→to (the arc
 *  runs counter-clockwise), POSITIVE = centre on the RIGHT (clockwise);
 *  confirmed against concentric offset curves in the samples. The minor
 *  arc (|Δ| ≤ 180°) is used. */
export interface TrvLineEntity {
  fromId: string;
  toId: string;
  /** `22` field 0 (observed 8 / 40 / 104). */
  flags: number | null;
  /** `23` field 0, signed. Null when missing / unparseable. */
  radius: number | null;
  sourceLine: number;
}

/** trv-full-support — a `100,<name>,<id>,<flags>` drawing group (TPC's
 *  layer-panel groupings: Plats, Lots, Research, …). */
export interface TrvDrawingGroup {
  name: string;
  id: string;
  flags: string;
  sourceLine: number;
}

/** trv-full-support — a drawing (CAD) layer from `29,0,7` inside the
 *  `28,0` sheet header:
 *  `29,0,7,<name>,<id>,<flags>,0,<visible>,<weight>,<scale>,<color>`.
 *  Drawing elements reference these ids in their `29,2` style record
 *  (field 1) and traverse segments in `11` field 3. */
export interface TrvDrawingLayer {
  id: string;
  name: string;
  /** Raw flags (0x10000000 = TPC-managed system layer, 0x40000000 =
   *  user layer). */
  flags: number;
  visible: boolean;
  lineWeight: number | null;
  /** CSS colour (#rrggbb) decoded from a Windows COLORREF, or null for
   *  the default (`-1`, plotted black). */
  color: string | null;
  sourceLine: number;
}

/** trv-full-support — the `28,0` sheet header + its `29,0,*` settings. */
export interface TrvSheet {
  name: string | null;
  /** Plot scale in feet per paper inch (field 5; 40 → 1" = 40'). */
  scale: number | null;
  paperWidthIn: number | null;
  paperHeightIn: number | null;
  /** `29,0,8`: survey extents as [x1, y1, x2, y2] (E/N). */
  extents: [number, number, number, number] | null;
  /** `29,0,10`: sheet centre in world (E, N). */
  center: { x: number; y: number } | null;
  /** `28,0` field 16: sheet rotation in degrees (raw, unverified). */
  rotationDeg: number | null;
  /** `29,0,9`: font table (index → face). */
  fonts: Array<{ index: number; face: string }>;
  layers: TrvDrawingLayer[];
  sourceLine: number;
}

/** trv-full-support — job header records (`81`, `87`-`89`, `95`, `107`)
 *  and the `#` banner's full version string. All optional. */
export interface TrvHeader {
  /** `# Full Version number,24.0.4.9 (09122024)`. */
  fullVersion: string | null;
  /** `81`: job description line. */
  jobDescription: string | null;
  /** `87`: job address (fields joined with ', '). */
  jobAddress: string | null;
  /** `88`: surveyor / crew name. */
  surveyor: string | null;
  /** `89`: job number. */
  jobNumber: string | null;
  /** `107`: client name + address (fields joined with ', '). */
  client: string | null;
  /** `95`: the next free point number at save time. */
  nextPointNumber: string | null;
}

/** A traverse / polyline = ordered list of point references plus
 *  an optional name. Captures the raw `10` + `11` pair sequence. */
export interface TrvTraverse {
  /** Optional name (record code 30). Many traverses are unnamed
   *  in the wild. */
  name: string | null;
  /** Ordered point ids referenced by `10,<id>` records inside the
   *  traverse block. */
  pointIds: string[];
  /** Layer id derived from the first `11,<polyId>,<offset>,?,<layerId>`
   *  edge descriptor seen in the block. Null when no edge descriptor
   *  was present. */
  layerId: string | null;
  /** cad-trv-import-export Pass 3 — every UN-INTERPRETED record
   *  that appeared inside this traverse block (between its `30,`
   *  opener and the next traverse / section boundary). Each entry
   *  preserves the raw record code + field array so a downstream
   *  serializer can re-emit the styling / metadata / label-format
   *  records (32-76, 159-162, 349-369, etc.) verbatim, even though
   *  this Pass doesn't interpret their subtype semantics. */
  stylingRecords: Array<{ code: string; fields: string[] }>;
  /** Source line of the traverse's first marker (the `30,<name>` or
   *  the first `10,<id>` if no name was present). */
  sourceLine: number;
  /** trv-full-support — per-reference detail, same order as
   *  `pointIds`. */
  refs?: TrvTraverseRef[];
  /** trv-full-support — `31` field 1: TPC's traverse id. `28,14,<id>`
   *  area labels reference it. */
  trvId?: string | null;
  /** trv-full-support — `31` field 0 raw flags. */
  flags?: number | null;
  /** trv-full-support — `33` field 0: the area TPC computed (square
   *  survey units), present on area-bearing traverses. */
  area?: number | null;
  /** trv-full-support — the traverse's `1,<text>` description (often
   *  the source CSV path). */
  description?: string | null;
}

export interface TrvParseError {
  lineIndex: number;
  message: string;
}

/** cad-trv-import-export Pass 1 — projection / coordinate-system
 *  records 91-94. The raw field arrays are preserved verbatim so a
 *  serializer can re-emit them losslessly; we additionally lift a
 *  handful of named fields for callers that want them. */
export interface TrvProjection {
  /** 91 — generic projection setup. Field layout (observed):
   *  `flag, ?, ?, ?, ?, ?, ?, ?, ?, crsName, pgmName, ?`. */
  raw91: string[];
  /** 92 — ellipsoid. Field layout (observed):
   *  `semiMajor, eccSqA, flattening, ellipsoidName, semiMinor, eccSqB`. */
  raw92: string[];
  /** 93 — scale + rotation. `scaleX, scaleY, rotation, ?, ?`. */
  raw93: string[];
  /** 94 — accuracy thresholds in feet. `thresh1, thresh2, thresh3`. */
  raw94: string[];
  /** Lifted from 91 (typically `Local.crs` or a projection filename). */
  crsName: string | null;
  /** Lifted from 92 (typically `GRS 80`). */
  ellipsoidName: string | null;
}

/** cad-trv-import-export Pass 1 — project metadata records. */
export interface TrvMetadata {
  /** 90 — original source document path (Windows-style in samples). */
  sourcePath: string | null;
  /** 101 — project / job name. */
  projectName: string | null;
  /** 102 — survey date as written (DD-MM-YYYY in samples). */
  surveyDate: string | null;
  /** 103 — scale (single field; meaning context-dependent). */
  scale: string | null;
  /** 104 — units flag (`0` = feet in samples; further values
   *  undocumented). */
  units: string | null;
  /** 105 — unknown flag preserved verbatim. */
  raw105: string | null;
  /** 106 — point count snapshot at export time. */
  pointCount: number | null;
}

/** cad-trv-import-export Pass 1 — GNSS calibration / receiver
 *  settings. Both raw field arrays are preserved for lossless
 *  round-trip; meaning is largely undocumented outside Traverse PC. */
export interface TrvGnss {
  /** 198 — accuracy thresholds (6 floats). */
  raw198: string[];
  /** 199 — flags + a sentinel value. */
  raw199: string[];
}

/** cad-trv-import-export Pass 2 — drawing-element record. Each 28
 *  record opens a graphical primitive (drawing header, DXF-
 *  referenced symbol like a North Arrow, etc.) followed by zero or
 *  more 29 records carrying its properties (color, font, layout,
 *  layer-styles, etc.). The shape of 29 varies wildly by subtype
 *  (~12 subtypes observed in the live samples), so this Pass
 *  captures them as raw field arrays — the round-trip can re-emit
 *  them verbatim. Full semantic mapping (28 → CIRCLE / TEXT
 *  features) is a follow-up. */
export interface TrvDrawingElement {
  /** Raw 28 fields — variable-width, subtype-dependent. */
  header: string[];
  /** Ordered list of 29 records that followed this 28. Each 29
   *  carries its own subtype id (typically field 2). */
  properties: string[][];
  /** Source line of the opening 28 record. */
  sourceLine: number;
  /** trv-full-support — which sheet (`28,0` drawing) the element
   *  belongs to: 0 for the first `28,0` in the file, 1 for the next …
   *  Undefined for elements that precede every `28,0`. A file can hold
   *  several sheets that repeat the same labels. */
  sheetIndex?: number;
}

/** cad-trv-import-export Pass 2 — lot / parcel boundary segment
 *  (record 13). Captured as a raw field array; the live samples
 *  show ~8 fields per record with the trailing field carrying a
 *  segment-id token. */
export interface TrvLotSegment {
  /** Raw 13 fields. */
  fields: string[];
  /** Source line index. */
  sourceLine: number;
}

export interface TrvDocument {
  /** Every line in the source file, in order. Comments + blanks
   *  preserved. */
  lines: TrvLine[];
  /** Optional Traverse PC version string from record code 80. */
  version: string | null;
  /** Section markers in source order. */
  sections: TrvSection[];
  /** Layer table (code 86). */
  layers: TrvLayer[];
  /** Survey points (code 0 blocks under `#,POINTS`). */
  points: TrvPoint[];
  /** Traverses / polylines (code 30 + `10,id` blocks). */
  traverses: TrvTraverse[];
  /** cad-trv-import-export Pass 1 — projection / coordinate-system
   *  block (records 91-94). null when no projection was emitted. */
  projection: TrvProjection | null;
  /** cad-trv-import-export Pass 1 — project metadata block
   *  (90 / 101-106). Every field is independently optional. */
  metadata: TrvMetadata;
  /** cad-trv-import-export Pass 1 — GNSS settings (198 / 199).
   *  null when the file has no GNSS section. */
  gnss: TrvGnss | null;
  /** cad-trv-import-export Pass 2 — drawing elements (28/29
   *  pair groups). Empty array when no drawing section was
   *  emitted. */
  drawingElements: TrvDrawingElement[];
  /** cad-trv-import-export Pass 2 — lot / parcel boundary
   *  segments (record 13). Empty array when none present. */
  lotSegments: TrvLotSegment[];
  /** Non-fatal parse errors. */
  errors: TrvParseError[];
  /** trv-full-support — `#,LINES` curve entities (20-23). */
  lineEntities: TrvLineEntity[];
  /** trv-full-support — `#,DRAWING GROUPS` (100). */
  drawingGroups: TrvDrawingGroup[];
  /** trv-full-support — the `28,0` sheet (null when the file has no
   *  `#,Drawing` section). */
  sheet: TrvSheet | null;
  /** trv-full-support — every sheet in the file, in file order. `sheet`
   *  is the one with the most drawing elements (the plotted drawing). */
  sheets: TrvSheet[];
  /** trv-full-support — index into `sheets` of `sheet` (-1 when none). */
  primarySheetIndex: number;
  /** trv-full-support — job header records. */
  header: TrvHeader;
  /** trv-full-support — how many lines carried each record code (`#`
   *  for comment / section lines). */
  recordCounts: Record<string, number>;
  /** trv-full-support — record codes this parser does not know, with
   *  how often they appeared + the first line. They are never dropped:
   *  every line still lives in `lines` for round-trip. */
  unknownRecords: Array<{ code: string; count: number; firstLine: number }>;
  /** trv-full-support — the text looked like a TRV (banner, `999,begin`
   *  or a version record was seen). */
  looksLikeTrv: boolean;
}

/** trv-full-support — every record code the parser either interprets or
 *  deliberately preserves as known-but-opaque settings. Anything else
 *  lands in `unknownRecords`. See docs/cad/trv-format.md. */
export const KNOWN_TRV_CODES: ReadonlySet<string> = new Set([
  // points
  '0', '1', '2', '3', '4',
  // traverse refs + per-ref records
  '10', '11', '12', '13', '190',
  // #,LINES curves
  '20', '21', '22', '23',
  // drawing elements
  '28', '29',
  // traverse header + styling / label-format settings (opaque)
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '40', '41', '42', '43', '44', '45',
  '46', '47', '48', '49', '50', '51', '60', '70', '71', '76',
  '129', '130', '131', '132', '133', '134', '135', '136', '137', '138', '139', '140', '141',
  '159', '160', '161', '162', '163', '164',
  '349', '350', '361', '362', '363', '364', '366', '367', '368', '369',
  // file / survey header
  '80', '81', '82', '83', '86', '87', '88', '89', '90', '91', '92', '93', '94', '95',
  '100', '101', '102', '103', '104', '105', '106', '107',
  // GNSS
  '198', '199',
  // begin / end
  '999',
]);

/** trv-full-support — decode a Windows COLORREF (0x00BBGGRR) into a CSS
 *  hex colour. -1 / out-of-range / non-numeric → null (default ink). */
export function colorRefToCss(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return null;
  const r = n & 0xff;
  const g = (n >> 8) & 0xff;
  const b = (n >> 16) & 0xff;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Split a TRV record line into `code` + `fields`. TRV uses simple
 *  CSV without quoting in the samples we have, so a naive split-on-
 *  comma is faithful. Handles the leading `#` comment form. */
function splitTrvLine(raw: string): { code: string | null; fields: string[] } {
  if (raw.length === 0) return { code: null, fields: [] };
  if (raw.startsWith('#')) {
    // Comments are either `#,<label>` or just `#<...>`; we treat the
    // entire post-`#` content as a single "label" field.
    const rest = raw.slice(1);
    if (rest.startsWith(',')) {
      return { code: '#', fields: [rest.slice(1)] };
    }
    return { code: '#', fields: [rest] };
  }
  const commaIdx = raw.indexOf(',');
  if (commaIdx === -1) return { code: raw, fields: [] };
  const code = raw.slice(0, commaIdx);
  const fieldStr = raw.slice(commaIdx + 1);
  return { code, fields: fieldStr.split(',') };
}

/** Parse a TRV file body. */
export function parseTrv(input: string): TrvDocument {
  // Normalize line endings — TRV uses CRLF in the wild but we accept
  // LF-only too so a hand-edited copy doesn't fail to parse.
  // trv-full-support — also strip a byte-order mark and accept bare-CR
  // (classic Mac) line endings.
  const body = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rawLines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: TrvLine[] = rawLines.map((raw, index) => {
    const { code, fields } = splitTrvLine(raw);
    return { index, code, fields, raw };
  });

  const errors: TrvParseError[] = [];
  const sections: TrvSection[] = [];
  const layers: TrvLayer[] = [];
  const points: TrvPoint[] = [];
  const traverses: TrvTraverse[] = [];
  let version: string | null = null;
  // Pass 1 — projection / metadata / gnss accumulators. Populated
  // lazily; left at null / default until their records appear.
  let proj91: string[] | null = null;
  let proj92: string[] | null = null;
  let proj93: string[] | null = null;
  let proj94: string[] | null = null;
  let gnss198: string[] | null = null;
  let gnss199: string[] | null = null;
  const metadata: TrvMetadata = {
    sourcePath: null, projectName: null, surveyDate: null,
    scale: null, units: null, raw105: null, pointCount: null,
  };
  // Pass 2 — drawing-element accumulator + lot-segment list.
  const drawingElements: TrvDrawingElement[] = [];
  const lotSegments: TrvLotSegment[] = [];
  let activeDrawingElement: TrvDrawingElement | null = null;
  const commitActiveDrawingElement = () => {
    if (activeDrawingElement) {
      drawingElements.push(activeDrawingElement);
      activeDrawingElement = null;
    }
  };

  // First pass: pull section markers out so a second pass can scope
  // its decisions (e.g. "code 0 only means a point under #,POINTS").
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.code !== '#') continue;
    const label = (ln.fields[0] ?? '').trim();
    if (label.length === 0) continue;
    // Close the previous section's endIndex; we'll set this one's
    // endIndex when the next section opens or at EOF.
    if (sections.length > 0) sections[sections.length - 1].endIndex = i;
    sections.push({ label, startIndex: i, endIndex: lines.length });
  }

  const sectionAt = (lineIdx: number): TrvSection | null => {
    for (const s of sections) {
      if (lineIdx >= s.startIndex && lineIdx < s.endIndex) return s;
    }
    return null;
  };

  // Helper: forgiving float parser. Returns null when the source
  // string isn't a finite number.
  const parseNum = (s: string | undefined): number | null => {
    if (s === undefined) return null;
    const trimmed = s.trim();
    if (trimmed.length === 0) return null;
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  // Second pass: interpret known record codes. Code 0 opens a point
  // record that continues across subsequent lines (1/2/3/4) until
  // the next 0 OR until the section changes.
  let activePoint: TrvPoint | null = null;
  let activeTraverse: TrvTraverse | null = null;
  // trv-full-support accumulators.
  const lineEntities: TrvLineEntity[] = [];
  let activeLineEntity: TrvLineEntity | null = null;
  const drawingGroups: TrvDrawingGroup[] = [];
  const header: TrvHeader = {
    fullVersion: null, jobDescription: null, jobAddress: null, surveyor: null,
    jobNumber: null, client: null, nextPointNumber: null,
  };
  const recordCounts: Record<string, number> = {};
  const unknownByCode = new Map<string, { count: number; firstLine: number }>();
  let looksLikeTrv = false;
  /** Index of the current `28,0` sheet (-1 before the first). */
  let sheetCounter = -1;
  const parseIntOrNull = (s: string | undefined): number | null => {
    if (s === undefined) return null;
    const n = parseInt(s.trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  /** The traverse ref the per-ref records (11/12/13/190) attach to. */
  const lastRef = (): TrvTraverseRef | null => {
    const refs = activeTraverse?.refs;
    return refs && refs.length > 0 ? refs[refs.length - 1] : null;
  };
  const newTraverse = (name: string | null, sourceLine: number): TrvTraverse => ({
    name,
    pointIds: [],
    layerId: null,
    stylingRecords: [],
    sourceLine,
    refs: [],
    trvId: null,
    flags: null,
    area: null,
    description: null,
  });

  const commitActivePoint = () => {
    if (activePoint) {
      points.push(activePoint);
      activePoint = null;
    }
  };
  const commitActiveTraverse = () => {
    if (activeTraverse) {
      traverses.push(activeTraverse);
      activeTraverse = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.code === null) continue;
    // trv-full-support — census every record code; remember the unknown
    // ones (they still round-trip verbatim through `lines`).
    const codeKey = ln.code.trim();
    if (codeKey.length > 0) {
      recordCounts[codeKey] = (recordCounts[codeKey] ?? 0) + 1;
      if (codeKey !== '#' && !KNOWN_TRV_CODES.has(codeKey)) {
        const u = unknownByCode.get(codeKey);
        if (u) u.count += 1;
        else unknownByCode.set(codeKey, { count: 1, firstLine: i });
      }
    }
    if (ln.code === '#') {
      const label = (ln.fields[0] ?? '').trim();
      if (/^TRAVERSE PC\b/i.test(label)) looksLikeTrv = true;
      const fv = /^\s*Full Version number\s*,\s*(.+)$/i.exec(ln.raw.slice(1));
      if (fv) header.fullVersion = fv[1].trim();
      // Section break — flush any in-progress aggregator.
      commitActivePoint();
      commitActiveTraverse();
      commitActiveDrawingElement();
      activeLineEntity = null;
      continue;
    }
    const section = sectionAt(i);
    const sectionLabel = section?.label ?? null;

    switch (ln.code) {
      case '80':
        version = (ln.fields[0] ?? '').trim() || null;
        looksLikeTrv = true;
        break;
      // trv-full-support — job header records.
      case '81':
        header.jobDescription = ln.fields.join(',').trim() || null;
        break;
      case '87':
        header.jobAddress = ln.fields.map((f) => f.trim()).filter(Boolean).join(', ') || null;
        break;
      case '88':
        header.surveyor = ln.fields.map((f) => f.trim()).filter(Boolean).join(', ') || null;
        break;
      case '89':
        header.jobNumber = ln.fields.join(',').trim() || null;
        break;
      case '95':
        header.nextPointNumber = (ln.fields[0] ?? '').trim() || null;
        break;
      case '107':
        header.client = ln.fields.map((f) => f.trim()).filter(Boolean).join(', ') || null;
        break;
      case '100': {
        const [name, id, flags] = ln.fields;
        if (name !== undefined && id !== undefined) {
          drawingGroups.push({ name: name.trim(), id: id.trim(), flags: (flags ?? '').trim(), sourceLine: i });
        }
        break;
      }
      // trv-full-support — #,LINES curve entities: 20 opens, 21-23 fill.
      case '20': {
        const from = (ln.fields[0] ?? '').trim();
        activeLineEntity = null;
        if (from.length === 0) {
          errors.push({ lineIndex: i, message: '20 record missing point id' });
          break;
        }
        activeLineEntity = { fromId: from, toId: '', flags: null, radius: null, sourceLine: i };
        lineEntities.push(activeLineEntity);
        break;
      }
      case '21':
        if (activeLineEntity) activeLineEntity.toId = (ln.fields[0] ?? '').trim();
        break;
      case '22':
        if (activeLineEntity) activeLineEntity.flags = parseIntOrNull(ln.fields[0]);
        break;
      case '23':
        if (activeLineEntity) activeLineEntity.radius = parseNum(ln.fields[0]);
        break;
      case '86': {
        const [name, id, parentId] = ln.fields;
        if (id === undefined || (name === undefined)) {
          errors.push({ lineIndex: i, message: '86 record missing name or id' });
          break;
        }
        layers.push({
          id: id.trim(),
          name: (name ?? '').trim(),
          parentId: parentId !== undefined && parentId.trim().length > 0 ? parentId.trim() : null,
          sourceLine: i,
        });
        break;
      }
      case '0': {
        // Always close the previous aggregator before opening a new
        // point record. Outside of #,POINTS we still capture the
        // record (the Slice-2 mapper decides whether to ignore non-
        // point-section opens).
        commitActivePoint();
        commitActiveTraverse();
        const id = (ln.fields[0] ?? '').trim();
        if (id.length === 0) {
          errors.push({ lineIndex: i, message: '0 record missing point id' });
          break;
        }
        activePoint = {
          id,
          description: null,
          layerId: null,
          methodCode: null,
          north: null,
          east: null,
          elevation: null,
          sourceLine: i,
        };
        break;
      }
      case '1':
        if (activePoint) activePoint.description = ln.fields.join(',').trim() || null;
        break;
      case '2':
        if (activePoint) {
          activePoint.north = parseNum(ln.fields[0]);
          activePoint.east = parseNum(ln.fields[1]);
          activePoint.elevation = parseNum(ln.fields[2]);
        }
        break;
      case '3':
        if (activePoint) {
          const v = (ln.fields[0] ?? '').trim();
          activePoint.layerId = v.length > 0 ? v : null;
          activePoint.attrFlags = parseIntOrNull(v);
        }
        break;
      case '4':
        if (activePoint) {
          const v = (ln.fields[0] ?? '').trim();
          activePoint.methodCode = v.length > 0 ? v : null;
        }
        break;
      case '30': {
        // Traverse name marker — opens a traverse aggregator. Code
        // 30 only opens a traverse when we're not currently inside
        // a point block (which can also receive a stray 30).
        commitActivePoint();
        commitActiveTraverse();
        activeTraverse = newTraverse((ln.fields[0] ?? '').trim() || null, i);
        break;
      }
      case '10': {
        // Polyline/traverse point reference. If we're not currently
        // building a traverse, open an unnamed one so we don't drop
        // the references on the floor.
        const ref = (ln.fields[0] ?? '').trim();
        if (ref.length === 0) {
          errors.push({ lineIndex: i, message: '10 record missing point id' });
          break;
        }
        if (!activeTraverse) {
          // Don't open an unnamed traverse inside #,POINTS — there
          // a stray 10 is unexpected and probably noise. Outside of
          // #,POINTS we treat it as the start of an unnamed traverse.
          if (sectionLabel === 'POINTS') {
            errors.push({ lineIndex: i, message: '10 record in POINTS section without traverse opener' });
            break;
          }
          commitActivePoint();
          activeTraverse = newTraverse(null, i);
        }
        activeTraverse.pointIds.push(ref);
        activeTraverse.refs?.push({
          pointId: ref,
          flags: null,
          seq: null,
          drawingLayerId: null,
          penUp: false,
          curveMarker: null,
          cogo: null,
          extra: [],
          sourceLine: i,
        });
        break;
      }
      case '11': {
        if (activeTraverse && activeTraverse.layerId === null) {
          // 11,<polyId>,<offset>,?,<layerId>,? — extract the layer.
          const lid = (ln.fields[3] ?? '').trim();
          if (lid.length > 0) activeTraverse.layerId = lid;
        }
        // trv-full-support — per-ref flags (pen-up bit 16 etc.).
        const r = lastRef();
        if (r) {
          r.flags = parseIntOrNull(ln.fields[0]);
          r.seq = parseIntOrNull(ln.fields[1]);
          const dl = (ln.fields[3] ?? '').trim();
          r.drawingLayerId = dl.length > 0 ? dl : null;
          r.penUp = r.flags !== null && (r.flags & 16) !== 0;
        }
        break;
      }
      case '999':
        // Begin/end markers — flush in-progress aggregators.
        commitActivePoint();
        commitActiveTraverse();
        commitActiveDrawingElement();
        break;
      // Pass 1 — projection block. Code 90 carries the source
      // document path (the .doc Traverse PC was working with). 91-94
      // are the coordinate-system descriptors; we preserve the raw
      // field arrays + lift a couple of named values.
      case '90':
        metadata.sourcePath = ln.fields.join(',') || null;
        break;
      case '91':
        proj91 = ln.fields.slice();
        break;
      case '92':
        proj92 = ln.fields.slice();
        break;
      case '93':
        proj93 = ln.fields.slice();
        break;
      case '94':
        proj94 = ln.fields.slice();
        break;
      // Pass 1 — project metadata block (101-106).
      case '101':
        metadata.projectName = ln.fields.join(',') || null;
        break;
      case '102':
        metadata.surveyDate = ln.fields.join(',') || null;
        break;
      case '103':
        metadata.scale = ln.fields.join(',') || null;
        break;
      case '104':
        metadata.units = ln.fields.join(',') || null;
        break;
      case '105':
        metadata.raw105 = ln.fields.join(',') || null;
        break;
      case '106':
        metadata.pointCount = parseNum(ln.fields[0]);
        break;
      // Pass 1 — GNSS calibration / receiver settings.
      case '198':
        gnss198 = ln.fields.slice();
        break;
      case '199':
        gnss199 = ln.fields.slice();
        break;
      // Pass 2 — drawing elements (28 opens, 29 records carry
      // properties) + lot/parcel segments (13).
      case '28':
        commitActiveDrawingElement();
        if ((ln.fields[0] ?? '').trim() === '0') sheetCounter += 1;
        activeDrawingElement = {
          header: ln.fields.slice(),
          properties: [],
          sourceLine: i,
          ...(sheetCounter >= 0 ? { sheetIndex: sheetCounter } : {}),
        };
        break;
      case '29':
        if (activeDrawingElement) {
          activeDrawingElement.properties.push(ln.fields.slice());
        } else {
          // Stray 29 with no opener — capture as a header-less
          // entry so the round-trip preserves it.
          drawingElements.push({
            header: [],
            properties: [ln.fields.slice()],
            sourceLine: i,
          });
        }
        break;
      case '13': {
        lotSegments.push({ fields: ln.fields.slice(), sourceLine: i });
        // trv-full-support — inside a traverse a 13 is the COGO
        // observation that produced the preceding ref's point.
        const r = activeTraverse ? lastRef() : null;
        if (r) {
          r.cogo = {
            flags: parseIntOrNull(ln.fields[0]) ?? 0,
            distance: parseNum(ln.fields[1]),
            dz: parseNum(ln.fields[2]),
            azimuthDeg: parseNum(ln.fields[3]),
            radius: parseNum(ln.fields[5]),
            raw: ln.fields.slice(),
          };
        }
        break;
      }
      default:
        // trv-full-support — per-ref and per-traverse records that ride
        // along inside a traverse block. They ALSO fall through to the
        // stylingRecords capture below so the round-trip is unchanged.
        if (activeTraverse !== null && activePoint === null) {
          const r = lastRef();
          if (ln.code === '12' && r) r.curveMarker = parseIntOrNull(ln.fields[0]);
          else if (ln.code === '190' && r) r.extra.push({ code: ln.code, fields: ln.fields.slice() });
          else if (ln.code === '31') {
            activeTraverse.flags = parseIntOrNull(ln.fields[0]);
            const tid = (ln.fields[1] ?? '').trim();
            activeTraverse.trvId = tid.length > 0 ? tid : null;
          } else if (ln.code === '33') activeTraverse.area = parseNum(ln.fields[0]);
        }
        // Unknown code. Pass 3 — if an active traverse is open,
        // these records belong to its styling block (32-76, 159-162,
        // 349-369, etc.). Preserve them so the serializer can re-
        // emit verbatim. Otherwise the line still lives in `lines[]`
        // for verbatim round-trip via serializeTrv.
        if (activeTraverse !== null) {
          activeTraverse.stylingRecords.push({ code: ln.code, fields: ln.fields.slice() });
        }
        break;
    }
    // Pass 3 — code `1` (description) has its own switch case that
    // ONLY writes when an active point is open. Inside a traverse
    // block with no active point, the `1` would otherwise silently
    // drop. Catch it here so the round-trip preserves the
    // traverse's description record. (Other codes that hit the
    // default branch are already captured above when activeTraverse
    // is set.)
    if (
      activeTraverse !== null
      && activePoint === null
      && ln.code === '1'
    ) {
      activeTraverse.stylingRecords.push({ code: ln.code, fields: ln.fields.slice() });
      if (activeTraverse.description == null) activeTraverse.description = ln.fields.join(',').trim() || null;
    }
  }
  // Flush at EOF.
  commitActivePoint();
  commitActiveTraverse();
  commitActiveDrawingElement();

  // Pass 1 — assemble the projection block when any 91-94 record
  // was seen. crsName lifted from 91 field 9; ellipsoidName from
  // 92 field 3 (per the live samples).
  const projection: TrvProjection | null = (proj91 || proj92 || proj93 || proj94)
    ? {
        raw91: proj91 ?? [],
        raw92: proj92 ?? [],
        raw93: proj93 ?? [],
        raw94: proj94 ?? [],
        crsName: proj91 && proj91[8] !== undefined ? proj91[8] : null,
        ellipsoidName: proj92 && proj92[3] !== undefined ? proj92[3] : null,
      }
    : null;
  const gnss: TrvGnss | null = (gnss198 || gnss199)
    ? { raw198: gnss198 ?? [], raw199: gnss199 ?? [] }
    : null;

  if (sections.some((s) => /^TRAVERSE PC\b/i.test(s.label)) || recordCounts['999']) looksLikeTrv = true;

  // trv-full-support — sheets: one per `28,0`. The primary sheet is the
  // one carrying the most drawing elements.
  const sheets: TrvSheet[] = [];
  const sheetSizes: number[] = [];
  for (const el of drawingElements) {
    if (el.header[0] === '0') { sheets.push(extractSheet(el)); sheetSizes.push(0); }
    else if (el.sheetIndex !== undefined && sheetSizes[el.sheetIndex] !== undefined) sheetSizes[el.sheetIndex] += 1;
  }
  let primarySheetIndex = sheets.length > 0 ? 0 : -1;
  sheetSizes.forEach((n, k) => { if (n > sheetSizes[primarySheetIndex]) primarySheetIndex = k; });

  return {
    lines, version, sections, layers, points, traverses,
    projection, metadata, gnss,
    drawingElements, lotSegments,
    errors,
    lineEntities: lineEntities.filter((l) => l.toId.length > 0),
    drawingGroups,
    sheet: primarySheetIndex >= 0 ? sheets[primarySheetIndex] : null,
    sheets,
    primarySheetIndex,
    header,
    recordCounts,
    unknownRecords: [...unknownByCode.entries()]
      .map(([code, v]) => ({ code, count: v.count, firstLine: v.firstLine }))
      .sort((a, b) => a.firstLine - b.firstLine),
    looksLikeTrv,
  };
}

/** trv-full-support — lift the `28,0` sheet header + its `29,0,*`
 *  settings (layers, fonts, extents, centre) out of the drawing
 *  elements. Layout of the `28,0` header (after the subtype):
 *  `0,<name>,0,<flags>,<scale>,<?>,<paperW>,<paperH>,<m1..m4>,<?>,<?>,<?>,<rotation>,<?>`. */
function extractSheet(el: TrvDrawingElement): TrvSheet {
  const num = (s: string | undefined): number | null => {
    if (s === undefined || s.trim() === '') return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  const h = el.header;
  const sheet: TrvSheet = {
    name: (h[2] ?? '').trim() || null,
    scale: num(h[5]),
    paperWidthIn: num(h[7]),
    paperHeightIn: num(h[8]),
    extents: null,
    center: null,
    rotationDeg: num(h[16]),
    fonts: [],
    layers: [],
    sourceLine: el.sourceLine,
  };
  el.properties.forEach((p) => {
    if (p[0] !== '0') return;
    const sub = p[1];
    if (sub === '7' && p[2] !== undefined && p[3] !== undefined) {
      const flags = parseInt(p[4] ?? '0', 10);
      sheet.layers.push({
        id: p[3].trim(),
        name: p[2].trim() || `Layer ${p[3].trim()}`,
        flags: Number.isFinite(flags) ? flags : 0,
        visible: (p[6] ?? '1').trim() !== '0',
        lineWeight: num(p[7]),
        color: colorRefToCss(p[9]),
        sourceLine: el.sourceLine,
      });
    } else if (sub === '8') {
      const v = p.slice(2, 6).map((s) => num(s));
      if (v.every((x) => x !== null)) sheet.extents = v as [number, number, number, number];
    } else if (sub === '9') {
      const idx = parseInt(p[2] ?? '', 10);
      if (Number.isFinite(idx) && p[3]) sheet.fonts.push({ index: idx, face: p[3].trim() });
    } else if (sub === '10') {
      const x = num(p[2]);
      const y = num(p[3]);
      if (x !== null && y !== null) sheet.center = { x, y };
    }
  });
  return sheet;
}

/** Serialize a parsed TrvDocument back to its source text. By default
 *  this re-emits the `lines` array verbatim, which is enough for the
 *  Slice-3 round-trip use case. */
export function serializeTrv(doc: TrvDocument): string {
  return doc.lines.map((l) => l.raw).join('\r\n');
}
