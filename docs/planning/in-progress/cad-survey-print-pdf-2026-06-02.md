# Survey print + classic PDF export — 2026-06-02

*User request:*
> "We need to be able to print out the survey, and we need to be able to
> save/export it as a PDF. Do research on what a good survey should look
> like. The PDF version should be well formatted and have a classic
> survey drawing look to it. Please make sure we have this fully fleshed
> out."

## Current state (investigated 2026-06-02)
Two PDF paths already exist:
- **Vector** — `lib/cad/delivery/pdf-writer.ts` (`exportToPdf` / `downloadPdf`, 607 lines; MenuBar "Export as PDF (sealed)…"). Renders geometry (LINE/POLYLINE/POLYGON/CIRCLE/SPLINE) at a fixed thin line width, a bottom title STRIP (`drawTitleStrip`), and a seal block (`drawSealBlock`). MISSING: heavy border, north arrow, graphic scale bar, legend/key, infill fills, TEXT features, bearing/distance + area labels, line-weight hierarchy, monument symbols, certification statement, notes block. So it does NOT look like a classic plat yet.
- **Raster** — `PrintDialog` → `cad:exportImage` → `CanvasViewport` (~12660) captures the rendered canvas to JPEG and `addImage`s it onto a jsPDF sheet. This DOES include everything the canvas renders (title block, north arrow, scale bar, cert, notes, fills, labels, monument symbols from the prior cad-trv-fidelity work) — but as a raster image (not crisp at print scale, larger file).

Libs available: `jspdf` 4.2, `pdfkit` 0.17. The on-screen canvas already renders the full classic furniture set, so the data + layout exist; the gap is producing a clean, well-framed PDF/print of it.

## Classic-plat spec (from research, 2026-06-02 — TSPS/ALTA/CAD conventions)
Paper-space (plotted-sheet) inches, independent of survey scale:
- **Sheet sizes:** ANSI A 8.5×11, B 11×17, D 22×34, ARCH D 24×36 (24×36
  field default; 8.5×11 legal minimum). **Border:** heavy line inset
  0.5in (3 sides) / 1.0–1.5in (left/binding), weight 0.70mm. Reserve the
  right ~3.5in column for title block + notes + legend; center the
  drawing in the rest.
- **Round plot scale:** fit then SNAP to 1"=10/20/30/40/50/60/100/200ft;
  never an odd ratio. Always pair a GRAPHIC bar scale with the written
  scale.
- **Title block** (bottom-right, ~3.5in tall): ALL-CAPS drawing title
  ("BOUNDARY SURVEY OF…"); firm name/address/phone + firm reg #;
  surveyor + RPLS #; client; job #; survey date; drawn/checked-by;
  written scale; Sheet X of Y; revision block.
- **Graphic elements:** north arrow (north-up), graphic+written scale,
  legend/key (symbols + line types + abbreviations), monument symbols
  (found vs set, open vs filled, labeled w/ size/material), bearing+
  distance on each boundary line, Curve Table (No./Radius/Arc/Delta/
  ChordBrg/Chord), area in BOTH "SQ. FT. / AC.".
- **Text/cert:** surveyor certification block (TSPS Cat 1A / ALTA verbatim);
  circular RPLS seal + signature + date adjacent (not over linework);
  legal/metes-and-bounds panel; numbered general notes (basis of
  bearings, FEMA flood zone, title-commitment disclaimer, easements,
  adjoiner/deed calls).
- **Line weights (mm):** border 0.70; boundary 0.50–0.70; buildings 0.35;
  interior/tie/dimension 0.18–0.25; easements/adjoiners dashed 0.25;
  ROW dash-dot. **Type:** upright sans (Arial/RomanS) for labels/tables,
  serif/fixed for legal text, ALL-CAPS title. **Plotted text:** title
  0.20–0.25in; headers 0.12in; bearing/distance 0.08–0.10in; notes
  0.07–0.10in.
- **Layout:** drawing optically centered; title/legend/notes stacked in
  the right column or bottom strip; balanced white space.
  (Exact insets/sizes are sensible CAD defaults — parameterize them.)

## Approach
Make the **vector** export the primary, professional deliverable (crisp,
scalable, small) by adding the missing classic-plat elements to
`pdf-writer.ts`, and keep the raster canvas-capture as a high-fidelity
fallback. Reuse the on-screen title-block config + furniture geometry so
the PDF matches the screen. Each slice: `tsc` + `lint` + tests, commit,
push, annotate.

## Slices

### Slice 1 — Sheet framing + heavy border + round plot scale
> **DONE (2026-06-02).** `pdf-writer.ts`: FIT_TO_PAGE now snaps to a
> ROUND engineering scale via the new exported `roundPlotScale`
> (1"=10/20/30/40/50/60/80/100/150/200/…' — smallest that fits; huge
> tracts round to thousands) and plots through `fixedScalePaper` so the
> drawing centers + measures to a clean scale. Added a heavy `drawBorder`
> frame (0.02in ≈0.5mm, inset at the margin, drawn last). The title strip
> now receives + shows the TRUE plotted scale (`1" = N'`). Removed the
> now-unused `fitToPaper`. Tests in `pdf-writer-framing.test.ts`. Suite
> 2602 green. (Right-column reservation for notes/legend is handled in
> later slices.)

### Slice 2 — North arrow + graphic scale bar + written scale (vector)
> **DONE (2026-06-02).** `drawNorthArrow` (slim two-tone filled arrow +
> "N", rotated by `-drawingRotationDeg` so it points true north) at the
> top-right of the drawable area, and `drawScaleBar` (checkered 4-segment
> bar at 2in = round-scale feet, tick labels, "FEET", + the written
> `1"=N'`) at the bottom-left. Both gated on the on-screen
> `northArrowVisible` / `scaleBarVisible` toggles + `northArrowSizeIn`.
> Tests in `pdf-writer-framing.test.ts`. Suite 2604 green.

### Slice 3 — Full classic title block
> **DONE (2026-06-02).** `drawTitleStrip` now lays out a classic
> tombstone title block in the right ~4.2in column of the bottom strip
> (the seal block owns the left), separated by a vertical divider. It
> shows the ALL-CAPS drawing title `${surveyType} OF ${PROJECT}`
> (surveyType from `titleBlock.surveyType`, default "BOUNDARY SURVEY")
> with an underline, the firm name (9pt), the surveyor `, RPLS #<lic>`
> (8pt), and a two-column CLIENT / JOB NO. / DATE / SCALE / SHEET field
> grid (6.5pt) that filters out empty values and renders SHEET as
> "<n> OF <total>". SCALE shows the TRUE plotted `1" = N'`. Tests in
> `pdf-writer-framing.test.ts`. Suite 2608 green.

### Slice 4 — Line-weight hierarchy + line types
> **DONE (2026-06-02).** `drawFeature` now sets the plotted stroke per
> feature instead of one global hairline. `resolvePlotWeightIn` maps the
> authored `lineWeight` (feature override → layer, in MILLIMETRES) to
> paper inches with a ~0.005in hairline floor, so the boundary (≈0.50mm)
> reads heavier than tie/interior lines (≈0.18–0.35mm) — the surveyor's
> on-screen weight hierarchy survives to paper. `resolveDashPatternIn`
> resolves each feature's effective line type and converts its WORLD-FEET
> dash pattern to paper inches through the plot scale, so dashed/dotted/
> dash-dot easement + adjoiner lines plot dashed; points always plot
> solid and the dash is reset before the framing furniture. Tests in
> `pdf-writer-framing.test.ts`. Suite green.

### Slice 5 — Infill fills in the PDF
> **DONE (2026-06-02).** A new `drawFeatureFill` pre-pass (run before the
> stroke loop so no fill covers an adjacent boundary) renders each closed
> shape's resolved fill stack in vector form, reusing the exact canvas
> pipeline: `resolveVisibleFillLayers` → `generateFillPattern` →
> `patternLineWeight`, seeded with the same FNV-1a `hashSeed` so the
> stipple lands in the identical layout. The polygon/circle/ellipse/
> closed-spline boundary ring clips every layer via jsPDF's path clip
> (`saveGraphicsState` → `moveTo`/`lineTo`/`close` → `clip`/`discardPath`
> → `restoreGraphicsState`); SOLID layers fill the bbox rect, dot families
> plot as filled circles, hatch/brick/wave/grass as stroked lines. The
> pattern is sized to MATCH the screen — one pattern-pixel ≡
> `1/PDF_PATTERN_WORLD_DETAIL` world-feet → paper inches via `xform.scale`,
> with the same density (×2) + size (×0.85) multipliers. Per-layer opacity
> rides a jsPDF `GState`. `applyStroke` refactored to share a `resolveInk`
> color resolver with the new `applyFill`. Tests in
> `pdf-writer-framing.test.ts`. Suite 2619 green.

### Slice 6 — TEXT + bearing/distance + area labels
> **DONE (2026-06-02).** A text pass after the linework renders TEXT
> features (`drawTextFeature` — site annotations + world text, with the
> captured `properties.fontSize/fontFamily/fontWeight/fontStyle/textAlign`
> + rotation) and every feature's visible `textLabels`
> (`drawFeatureLabels` — bearing/distance at the segment midpoint, area at
> the centroid, point name/code/desc at the point), mirroring the canvas
> `renderLabels` anchor + offset math (line-relative along/perp offset vs
> direct, world → paper via `xform.scale`). Font size plots at the TRUE
> scale (`stylePt × scale × drawingScale × xform.scale`) so text keeps its
> physical proportion to the geometry at any round plot scale; arbitrary
> families map to a jsPDF core font (helvetica/times/courier) with combined
> bold/italic; `readableAngleDeg` keeps along-line text upright. Verified
> end-to-end with a runtime smoke export (fills + dashes + mixed-font
> labels + TEXT all render). Tests in `pdf-writer-framing.test.ts`. Suite
> 2626 green.

### Slice 7 — Monument symbols + legend/key
> **DONE (2026-06-02).** POINT features now plot their assigned monument/
> utility glyph: `drawPointFeature` resolves `style.symbolId` via
> `findSymbol`, and `renderSymbolPdf` renders the same `SymbolDefinition`
> paths the Pixi canvas uses (CIRCLE/RECT/PATH incl. beziers via
> `parseSVGPathData` + `pdf.curveTo`) as crisp jsPDF vectors, sized from
> the symbol's mm `defaultSize` so monuments plot a constant physical size
> at any survey scale; INHERIT path colors take the feature ink, NONE
> skips, and a missing symbol falls back to a crosshair. `collectLegendEntries`
> gathers the distinct symbols + non-solid line types actually on the
> sheet, and `drawLegend` draws a bordered LEGEND key box on a white
> knockout (top-left) pairing each sample glyph / dashed line with its
> name — auto-skipped when empty, gated on the `showLegend` option.
> Verified end-to-end (symbol + legend + no-legend cases). Tests in
> `pdf-writer-framing.test.ts`. Suite 2632 green.

### Slice 8 — Certification + seal + general notes block
> **DONE (2026-06-02).** The left data column now stacks legend → general
> notes → surveyor's certification top-down on white knockouts (shared
> `drawColumnBoxHeader`). `drawNotesBlock` renders a numbered, word-wrapped
> GENERAL NOTES block (basis of bearings / flood zone / title-commitment
> disclaimer / easements — whatever lines the caller supplies) using
> `pdf.splitTextToSize`. `drawCertificationBlock` lays out the cert
> statement in a serif (times) face — substituting `{{surveyorName}}` /
> `{{licenseNumber}}` / `{{licenseState}}` / `{{state}}` / `{{firmName}}` —
> followed by signature + RPLS-license + date lines. Both arrive as plain
> data via new `PdfCertificationContent` / `PdfNotesContent` options so the
> writer stays decoupled from the template store (the print dialog wires
> them in Slice 9); the seal/stamp block was already in place
> (`drawSealBlock`). Verified end-to-end with cert + notes content. Tests
> in `pdf-writer-framing.test.ts`. Suite 2636 green.

### Slice 9 — Print + PrintDialog UX
A real Print action (browser print of the PDF / print-to-PDF) plus a
fleshed-out `PrintDialog`: sheet size + orientation, plot scale, element
toggles (border/title/legend/notes/north/scale), and a preview; wire it
to the enhanced vector writer with the raster capture as a fallback.

## TL;DR
The canvas already renders a classic plat; this plan makes the PDF/print
export reproduce it cleanly in vector form — border, north arrow, scale
bar, full title block, line-weight hierarchy + line types, fills, labels,
monument symbols + legend, and the certification/notes blocks — with a
fleshed-out Print/PDF dialog.
