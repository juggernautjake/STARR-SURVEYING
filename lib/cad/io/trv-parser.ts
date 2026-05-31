// lib/cad/io/trv-parser.ts
//
// cad-trv-import-export Slice 1 — pure parser for Traverse PC `.TRV`
// files. The format is line-oriented CSV with a leading numeric
// record code (or `#` for a comment / section marker). See the
// format reference in
// docs/planning/in-progress/cad-trv-import-export-2026-05-31.md.
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
  /** Source line of the traverse's first marker (the `30,<name>` or
   *  the first `10,<id>` if no name was present). */
  sourceLine: number;
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
  const rawLines = input.replace(/\r\n/g, '\n').split('\n');
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
    if (ln.code === '#') {
      // Section break — flush any in-progress aggregator.
      commitActivePoint();
      commitActiveTraverse();
      commitActiveDrawingElement();
      continue;
    }
    const section = sectionAt(i);
    const sectionLabel = section?.label ?? null;

    switch (ln.code) {
      case '80':
        version = (ln.fields[0] ?? '').trim() || null;
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
        activeTraverse = {
          name: (ln.fields[0] ?? '').trim() || null,
          pointIds: [],
          layerId: null,
          sourceLine: i,
        };
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
          activeTraverse = {
            name: null,
            pointIds: [],
            layerId: null,
            sourceLine: i,
          };
        }
        activeTraverse.pointIds.push(ref);
        break;
      }
      case '11': {
        if (activeTraverse && activeTraverse.layerId === null) {
          // 11,<polyId>,<offset>,?,<layerId>,? — extract the layer.
          const lid = (ln.fields[3] ?? '').trim();
          if (lid.length > 0) activeTraverse.layerId = lid;
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
        activeDrawingElement = {
          header: ln.fields.slice(),
          properties: [],
          sourceLine: i,
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
      case '13':
        lotSegments.push({ fields: ln.fields.slice(), sourceLine: i });
        break;
      default:
        // Unknown code — preserved in `lines` for round-trip, no
        // interpretation needed here.
        break;
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

  return {
    lines, version, sections, layers, points, traverses,
    projection, metadata, gnss,
    drawingElements, lotSegments,
    errors,
  };
}

/** Serialize a parsed TrvDocument back to its source text. By default
 *  this re-emits the `lines` array verbatim, which is enough for the
 *  Slice-3 round-trip use case. */
export function serializeTrv(doc: TrvDocument): string {
  return doc.lines.map((l) => l.raw).join('\r\n');
}
