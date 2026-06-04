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

> NOTE: a research pass on classic survey-plat formatting (sheet/border
> sizes, title-block contents, required graphic elements, certification/
> notes, line-weight + typography conventions) is running in parallel;
> fold its concrete checklist into Slice 1 before building.

## Approach
Make the **vector** export the primary, professional deliverable (crisp,
scalable, small) by adding the missing classic-plat elements to
`pdf-writer.ts`, and keep the raster canvas-capture as a high-fidelity
fallback. Reuse the on-screen title-block config + furniture geometry so
the PDF matches the screen. Each slice: `tsc` + `lint` + tests, commit,
push, annotate.

## Slices

### Slice 1 — Sheet framing + heavy border + round plot scale
Frame the drawing in a proper working area: a heavy border line inset
from the sheet edge (≈0.5in), the drawing centered in the area above the
title block, snapped to a round plot scale (1"=10/20/30/40/50/60/100')
that fits. Reserve the title-block + notes regions. (Pull exact
inset/region sizes from the research checklist.)

### Slice 2 — North arrow + graphic scale bar + written scale (vector)
Vector-draw a north arrow (respecting drawing rotation) and a checkered
graphic scale bar with tick labels + the written scale ("1\" = 50'"),
mirroring the on-screen `TitleBlockConfig` placement/size.

### Slice 3 — Full classic title block
Enhance `drawTitleStrip` into a bordered title block (bottom-right or a
bottom strip): drawing title (ALL-CAPS "BOUNDARY SURVEY OF…"), firm
name/address/phone + firm reg #, surveyor + RPLS #, job #, client,
date, drawn-by, scale, Sheet X of Y, revision block — from
`doc.settings.titleBlock`.

### Slice 4 — Line-weight hierarchy + line types
Boundary heavy, interior/tie lines light, dashed easements/adjoiners;
honor each feature's `lineTypeId` (dash pattern) + a weight hierarchy so
the plat reads with proper emphasis.

### Slice 5 — Infill fills in the PDF
Render the feature fill patterns (dots/hatch/grass/etc.) in vector form
(or a faithful approximation) so concrete/grass/etc. areas read like the
plat, reusing the `generateFillPattern` primitives.

### Slice 6 — TEXT + bearing/distance + area labels
Render TEXT features (the site annotations + title text), the per-segment
bearing/distance labels, and the lot area annotation, with the captured
font/size/alignment.

### Slice 7 — Monument symbols + legend/key
Draw point symbols (found/set monuments, utilities) via the symbol
library, and a legend/key box mapping symbols + line types to labels.

### Slice 8 — Certification + seal + general notes block
Lay out the surveyor's certification statement, the seal/stamp, and the
general-notes block (basis of bearings, flood zone, title-commitment
disclaimer, easements) in a readable, classic arrangement.

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
