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
