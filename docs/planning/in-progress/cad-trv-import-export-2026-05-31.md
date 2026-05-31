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

### Slice 2 — Pure mapper: TRV → drawing doc

- `lib/cad/io/trv-to-drawing.ts`:
  ```
  trvToDrawing(doc: TrvDocument): { layers, features, mappingNotes }
  ```
- Maps:
  - 86 records → our `Layer` records (id keyed by TRV layer id).
  - Point records → POINT features (geometry: { x: east, y:
    -north } in our local screen-y-down coordinates; preserves
    elevation in `properties.elevation`, description in
    `properties.label`).
  - Each traverse (30 + 10-pair sequence) → one POLYLINE feature
    (or POLYGON when the first/last point ids match) referencing
    the imported point coordinates by lookup.
- Tests: source → output snapshots for each sample; layers preserve
  hierarchy (parent_id → our layer.parentId once Slice 1 of
  layer-grouping lands; nullable until then).

### Slice 3 — Pure serializer: drawing doc → TRV text

- `lib/cad/io/drawing-to-trv.ts`:
  ```
  drawingToTrv(doc: DrawingDocument, opts: { sourceTrv?:
    TrvDocument }): string
  ```
- When `sourceTrv` is supplied, the original `TrvRecord[]` is the
  base; we only rewrite the records corresponding to changed
  features. Unknown codes round-trip intact.
- Fresh export (no sourceTrv): emit the minimum viable doc — 999
  begin, 80 version (we pin a stamped version we know), 86 layers,
  point records (0/1/2/3/4), traverses (30/31/10/11), 999 end.
- Tests: round-trip a parsed sample through trvToDrawing →
  drawingToTrv and assert key records match the original.

### Slice 4 — UI: File menu "Import TRV…" + "Export TRV…"

- File menu entry opens an `<input type="file" accept=".TRV,.trv">`,
  reads as text, runs parser + mapper, opens a confirmation modal
  showing layer + point + traverse counts before applying.
- Export prompts for a filename (defaults to `<projectName>.TRV`),
  triggers a download Blob.
- Tests: smoke test that the menu items wire to the right handlers;
  source-text spec on the menu entries.

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
