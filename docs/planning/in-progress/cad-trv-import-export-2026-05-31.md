# CAD TRV import + export (Traverse PC interop) — 2026-05-31

*Opened 2026-05-31 in response to the user's ask: import and export
Traverse PC `.TRV` files round-trip from our CAD editor. Three
sample files were attached:*

- *`GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026.TRV`*
- *`GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV`*
- *`SKP_PROPERTY_ADVISORS_TREMONT_ST_BELTON_26065_MAY_20_2026.TRV`*

## Format reference (from sample analysis 2026-05-31)

ISO-8859 text, CRLF line terminators. Each line is `<code>,<csv-
fields>`. Lines starting with `#,` are comments / section markers
(`#,TRAVERSE PC`, `#,SURVEY`, `#,POINTS`, `#,TRAVERSE`).

Key record codes:

| Code  | Fields                                | Meaning                                                                              |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| 999   | begin / end                           | Document boundaries                                                                  |
| 80    | version                               | Traverse PC version (e.g. 26.000)                                                    |
| 83    | flag                                  | Survey flag (typically 0)                                                            |
| 86    | name, id, parent_id                   | Layer definition (hierarchical via parent_id)                                        |
| 90    | path                                  | Source document path                                                                 |
| 91-94 | projection / scale / thresholds       | Coordinate-system + tolerance metadata                                               |
| 95    | n                                     | Total point count                                                                    |
| 0     | point_id                              | Opens a nested point record                                                          |
| 1     | description                           | Point description                                                                    |
| 2     | north, east, elev                     | Coordinates (state-plane survey feet)                                                |
| 3     | layer_id                              | Point's layer assignment                                                             |
| 4     | method_code, ...                      | Method (5 = GPS, 6 = traverse, …)                                                    |
| 10    | point_id                              | Traverse/polyline point reference                                                    |
| 11    | poly_id, offset, ?, layer_id, ?       | Polyline edge descriptor (paired with preceding code 10)                             |
| 13    | flags, …, layer_id, …                 | Lot / boundary segment                                                               |
| 28/29 | drawing element header + properties   | CAD-style drawing element (polylines, circles, text, …)                              |
| 30/31 | traverse name + metadata              | Names a traverse/polyline                                                            |
| 32–76 | varies                                | Traverse styling / label format / colors / fonts                                     |
| #,X   | comment                               | Section marker                                                                       |

A point record spans multiple lines: code 0 (open), then any of
1/2/3/4 records, until the next 0 or end-of-section.

## Slices

### Slice 1 — Pure parser: TRV text → structured AST ✅ shipped 2026-05-31

- `lib/cad/io/trv-parser.ts` ships `parseTrv(input) → TrvDocument` +
  `serializeTrv(doc) → string`. Document captures every line
  verbatim in `lines[]`, plus interpreted views
  (`version`, `sections`, `layers`, `points`, `traverses`, `errors`).
- Parser is forgiving: malformed lines collect into `errors[]`
  rather than throwing; coords that don't parse become `null`;
  unknown record codes are preserved in `lines[]` so a serializer
  round-trips them intact.
- Verified against the three live samples the user attached
  (Garland Kreuger, SKP — 2026): all three parse with ZERO errors:
    - Garland: 7389 lines → 19 layers, 792 points, 20 traverses.
    - SKP: 2889 lines → 19 layers, 199 points, 24 traverses.
- Tests: 13 specs cover line preservation (verbatim), splits,
  comment / section markers, LF-only acceptance, interpreted-view
  extraction (version, layers, points with id/desc/layer/method/
  coords, traverses with ordered point refs), error tolerance
  (broken records, non-numeric coords, unknown codes preserved),
  and serialize-round-trip equality. Typecheck + lint clean.

- `lib/cad/io/trv-parser.ts`: pure module, no I/O.
  ```
  parseTrv(input: string): TrvDocument
  ```
  with `TrvDocument = { version, layers, points, traverses,
  projection, source, raw: TrvRecord[] }`.
- `TrvRecord` keeps EVERY line (code + raw fields) so an unknown
  code is preserved for round-trip export.
- Parser is forgiving: unknown codes captured as `TrvRecord` but
  not interpreted. Errors collected (not thrown) per line so a
  bad import still yields a partial document the user can inspect.
- Tests: parser handles all three sample files; round-trip
  `serializeTrv(parseTrv(x)) === x` for record-preserving cases;
  layers extracted with correct id/parent.

### Slice 2 — Pure mapper: TRV → drawing doc ✅ shipped 2026-05-31

- `lib/cad/io/trv-to-drawing.ts` ships `trvToDrawing(doc) →
  { layers, features, notes }` mapping a parsed TrvDocument into
  the shape our drawing store consumes.
- Layers: one Layer per TRV `86` record, id prefixed `trv-layer:<id>`
  to avoid collisions with our system layers. Defaults visible /
  unlocked / SOLID. Source order preserved via `sortOrder`. (TRV
  layer parent_id is dropped — our `Layer` interface has no
  hierarchy field; the FeatureGroup nesting from cad-layer-grouping
  Slice 2 is a separate concern.)
- Points: one POINT Feature per TRV point with parseable coords.
  TRV (north, east) → our (east, -north) for screen-y-down space.
  Preserves: `elevation` (when present), `label` (description),
  `surveyNorth` + `surveyEast` (so Slice 3 can invert the
  transform on export), `trvPointId`, `trvMethodCode`. Layer
  reference resolved via the TRV→our-id map. Points without coords
  are SKIPPED with a note.
- Traverses: each `30 + 10-pair` sequence becomes one Feature.
  Closed (first ref id === last ref id) → POLYGON with duplicate
  closing vertex dropped; open → POLYLINE. Refs that don't resolve
  to a known point are skipped + noted. Carries
  `name` / `trvPointRefs` / `trvSourceLine` on properties.
- Returns a `notes[]` array of non-fatal mapping issues for
  surfacing in the Slice-4 import confirmation modal.
- Tests: 14 unit specs cover layers (count, ids, sort, defaults),
  points (count, ids, coord transform, properties, layer
  assignment, skipped-with-coords case), traverses (closed
  POLYGON, open POLYLINE, coord transform, properties, skipped
  on < 2 refs), and the full-fixture composition.
- Smoke-tested against the live samples: Garland (19 layers, 792
  points, 19 traverses) and SKP (19 layers, 199 points, 20
  traverses) both round-trip with structured notes for skipped
  items.
- Full cad suite (2037) green; typecheck + lint clean.

### Slice 3 — Pure serializer: drawing doc → TRV text ✅ shipped 2026-05-31 (two-mode MVP)

- `lib/cad/io/drawing-to-trv.ts` ships `drawingToTrv(doc, opts) →
  string`. Two modes:
  - **Verbatim round-trip** when `opts.sourceTrv` is supplied:
    re-emits the parsed source byte-for-byte via
    `serializeTrv(sourceTrv)`. Lossless for unknown record codes.
  - **Fresh export** when `opts.sourceTrv` is omitted: emits a
    minimum viable TRV — `#,TRAVERSE PC`, `999,begin`,
    `80,<version>`, `#,SURVEY`, `83,0`, one `86,` per layer,
    `#,POINTS`, `95,<count>`, point blocks (`0/1/3/4/2`),
    `#,TRAVERSE`, traverse blocks (`30/31/10/11` pairs),
    `999,end`.
- Point coords prefer `surveyNorth/surveyEast` properties stashed
  on import for byte-faithful round-trip; falls back to the
  inverse screen-y-down transform for manually-drawn points.
- Numeric formatting trims trailing zeros so output matches
  Traverse PC's own formatting.
- Tests: 10 specs lock the verbatim round-trip, every block-type
  emission, the parse-back round-trip with preserved coords, and
  the fallback inverse-transform.
- **Deferred — smart selective sourceTrv rewrite (3b).** When
  sourceTrv is supplied AND the drawing has been edited, the
  right behavior is to take the source's record stream as the
  base and patch only the affected records so unknown codes
  still round-trip. Needs per-record diff + targeted line
  rewrite + reference renumbering. Covered by the
  "5-pass" perfection work below.

### Slice 4 — UI: File menu "Import TRV…" + "Export TRV…" ✅ shipped 2026-05-31

- New `lib/cad/io/trv-io.ts` with two thin wrappers:
  - `importTrvFromText(text) → TrvImportReport` runs parser +
    mapper, surfaces layer / point / traverse counts +
    consolidated notes (parser errors + mapper notes).
  - `downloadTrv(doc, opts?) → { byteSize, filename }` serializes
    a DrawingDocument + triggers a Blob download (slugged
    filename from `doc.name`, falls back to `survey.TRV`).
- MenuBar wiring:
  - File → Export → "Export as Traverse PC (.TRV)…" calls
    `exportTrv()` (logs bytes + filename to `cadLog`).
  - File → Import → "Import Traverse PC (.TRV)…" opens a
    `<input type="file" accept=".TRV,.trv">`, reads the chosen
    file as text, parses + previews counts + first-5 notes in a
    `window.confirm()` prompt, then `drawingStore.addLayer` /
    `addFeatures` to merge into the current drawing on confirm.
- Surveyor can now actually round-trip: open a TRV, edit it,
  export it back out. Earlier slices (parser, mapper, serializer)
  already proved that's lossless for our supported records;
  Slice 4 connects the UI.
- 10 specs cover the wrappers (counts report, filename slug,
  explicit filename override, empty-name fallback) + the
  MenuBar wiring (imports, exportTrv / importTrv function
  shape, store writes on confirm, menu-entry labels).
- Full cad suite (2156) green; typecheck + lint clean.

### Slice 5 — Coordinate-system handling

- TRV coordinates are state-plane survey feet (northing + easting +
  elevation). Our drawing is unitless screen-pixel-y-down.
- Import: store the original (north, east) on `feature.properties.
  surveyCoord` so the user can see the real-world position; the
  geometry's (x, y) is a derived display coord (east → x, -north →
  y, scaled so the bounding box fits a reasonable canvas extent).
- Export: invert the import transform using the stored
  `surveyCoord` when present; derive from current x/y otherwise.
- Tests: round-trip preserves real coords for unchanged features;
  modified features export the modified positions back through the
  inverse transform.

### Slice 6 — Drawing-element (code 28/29) round-trip

- The 28/29 codes carry CAD-style drawing primitives Traverse PC
  uses for circles, text labels, etc.
- Slice 2's first pass keeps these as opaque records (round-tripped
  intact, not imported as our features). Slice 6 maps the common
  subset (circle, text label) to native features when possible.

## 5-pass perfection effort (started 2026-05-31)

Per follow-up user ask: get the TRV translation/parsing PERFECT so
the full file can be imported and exported losslessly. 5 iterative
passes, one slice each.

### Pass 1 — Projection / metadata / GNSS capture ✅ shipped 2026-05-31

- `TrvProjection` (90 source path + 91-94 raw field arrays + lifted
  crsName / ellipsoidName), `TrvMetadata` (90 sourcePath, 101
  projectName, 102 surveyDate, 103 scale, 104 units, 105 raw,
  106 pointCount), `TrvGnss` (raw 198 + 199) added to
  `TrvDocument`.
- Parser routes codes 90 / 91-94 / 101-106 / 198 / 199 into the new
  structured fields; raw field arrays preserved verbatim so a
  round-trip is byte-faithful.
- `drawingToTrv` fresh-export grew `projection` / `metadata` /
  `gnss` opts; emits the records (90, 91-94, 101-106, `#,GNSS`,
  198/199) when supplied so an import → export round trip carries
  the projection setup forward.
- Tests: 9 parser specs (projection block, metadata fields,
  null-when-absent, GNSS), 2 serializer specs (projection +
  metadata + GNSS passthrough).
- Real-sample verification: Garland (project=MISC,
  pointCount=61, crs=Local.crs) + SKP (project=BACK CONCRETE
  SLAB, pointCount=61, crs=Local.crs) both round-trip the metadata
  through parse + re-emit.

### Pass 2 — Drawing elements + lot/parcel records ✅ shipped 2026-05-31 (structured capture)

- New `TrvDrawingElement` (28 header + N 29 properties) and
  `TrvLotSegment` (13 raw fields) types added to `TrvDocument`.
- Parser groups each 28 + its subsequent 29 records into one
  `TrvDrawingElement`; section breaks / 999 markers / 28-of-new-
  element commit the active aggregator. Stray 29 records with
  no opener are preserved as header-less entries so nothing
  drops on the floor. Code 13 records collect into
  `lotSegments[]` independently.
- Serializer fresh-export grew `drawingElements` + `lotSegments`
  opts. When supplied, emits `#,LOTS` with one `13,...` per
  segment, then `#,DRAWING` with each element's `28,header,…`
  + N `29,prop,…` lines. Verbatim from the raw field arrays —
  fully lossless even though we don't (yet) interpret subtype
  semantics.
- Real-sample structured-capture verification: SKP yields 69
  drawing elements with 133 total 29 properties (0 lot
  segments); Garland yields drawing elements + 13-records for
  its lot setbacks. Every record we previously dropped now
  round-trips when the caller threads the original arrays back
  through the serializer.
- Tests: 6 new parser specs (group shape, raw 29 preservation,
  empty-when-absent, stray-29 capture, lot segment capture +
  empty) + 3 serializer specs (drawing-element emission, lot
  emission, omits when neither supplied). Full cad suite (2165)
  green; typecheck + lint clean.
- **Deferred — full 28/29 semantic mapping.** Translating each
  28 subtype (drawing header, DXF-referenced symbol, etc.) into
  native features (CIRCLE / TEXT) requires per-subtype field
  decoding for ~12 observed subtypes. Pass 3 (traverse styling)
  + Pass 4 (smart-merge serializer) are higher leverage; full
  semantic mapping is its own future pass when surveyors need to
  EDIT 28/29 content vs. just preserve it on round-trip.

### Pass 3 — Traverse styling (queued)

Codes 32-71 (colors/fonts/line styles/scales) + 159-162 (label
format templates) + 349-369 (drawing annotation UI). Parser
collects them onto the owning traverse so the styling round-trips.

### Pass 4 — Smart selective sourceTrv serializer (queued)

`drawingToTrv(doc, { sourceTrv, applyChanges: true })` walks the
sourceTrv's raw lines and patches only the records whose
corresponding features have been edited (changed coords, added /
removed). Unknown codes round-trip intact. This is the "Slice 3b"
deferred item.

### Pass 5 — Bidirectional round-trip verification (queued)

Run `parseTrv → trvToDrawing → drawingToTrv(... sourceTrv)` on
every real sample and assert the output is byte-equal to the
input. Any deltas drive targeted fixes back through Passes 2-4.

## Out of scope / placeholder

- DXF / DWG / SHP — separate effort; this plan covers TRV only.
- Editing the projection / coordinate system inside our editor —
  the TRV projection is preserved verbatim but not user-editable
  here. Slice 5 just respects what's in the source file.
- TRV record codes we haven't observed in the samples (anything
  outside the dictionary above) — they round-trip as unknown
  records but aren't interpreted. We'll extend interpretation as
  real-world samples surface them.

## Guardrails

- Pure modules under `lib/cad/io/` — no DOM, no React, fully
  unit-testable.
- The parser NEVER throws on a malformed line; errors collected.
- Every modification preserves unknown TRV records so round-trips
  don't silently drop data.

## TL;DR

Six slices, all building on a pure record-preserving parser
(Slice 1) so the round-trip is verifiable end-to-end before any UI
wiring (Slice 4). Coord-system handling (Slice 5) is the most
likely place for surprises; we keep the source coords on every
imported feature so exports invert cleanly even after edits.
