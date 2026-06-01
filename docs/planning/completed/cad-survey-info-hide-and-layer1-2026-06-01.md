# CAD survey-info hide + Layer 1 rename — 2026-06-01

*User: hiding the Survey Info / Title Block / Annotation / Default
layers via the eye doesn't hide the rendered furniture (title
block, seal, graphic scale, north arrow — all on SURVEY-INFO).
Also: rename the empty starter "Default" layer to "Layer 1".*

## Root cause (audit, 2026-06-01)

`renderTitleBlock()` (CanvasViewport ~2578) gates the furniture
overlay on:

```
const surveyInfoLayer = drawingStore.document.layers['SURVEY-INFO'];
```

`drawingStore` is the `useDrawingStore()` HOOK value captured in
the component body. The render loop runs from a requestAnimation-
Frame callback, so this closure can hold a STALE document — the
gate reads the SURVEY-INFO `visible` flag as of the last React
render, not the live value. Toggling the eye updates the store
but the RAF gate keeps seeing `visible: true`.

The sibling `renderPaperFurniture()` (~2319) does it right:
`useDrawingStore.getState().document` — always fresh.

## Slices

### Slice 1 — Gate furniture on the LIVE SURVEY-INFO visibility + rename starter layer ✅ shipped 2026-06-01

- `renderTitleBlock` reads `useDrawingStore.getState().document`
  for the SURVEY-INFO layer (matching `renderPaperFurniture`),
  so the eye toggle takes effect immediately.
- Rename the default starter drawing layer from "Default"
  (id `DEFAULT`) to **"Layer 1"** (keep id `DEFAULT` so the AI
  layer-router + code library references stay valid).
- Tests: source-text spec on the getState() gate; default-
  layers spec on the "Layer 1" name.

## Out of scope (already working)

- Right-click "Hide element" + the per-layer eye toggle: these
  already exist in LayerPanel / the canvas context menu. The
  SURVEY-INFO furniture was the one un-hideable case (canvas
  overlay, not a Feature row) — fixed by the live-gate above.

### Slice 2 — Fix the vertical-mirror flip on TRV import ✅ shipped 2026-06-01

User caught it: our imported drawing was vertically mirrored vs
the TPC original (road on top instead of bottom, shape flipped
about a horizontal axis).

Root cause: `trv-to-drawing.ts` mapped survey coords as
`y = -north` (screen-y-DOWN assumption). But Starr's WORLD
space is Y-UP (north = +y) — confirmed by the native field-data
importer (`linework-features.ts`: `{ x: easting, y: northing }`)
and the AI coord helper (`y: northing - originN`). Negating
north double-flipped the geometry relative to the north arrow +
paper.

Fix: import maps `y = +north` (mapPoint + mapTraverse); the
export inverse fallback in `drawing-to-trv.ts` `pointCoords`
becomes `north = +y`. The `surveyNorth`/`surveyEast` property
stash keeps round-trip byte-exact regardless of the screen
convention. 4 tests that asserted the old `-north` mirror
updated to the Y-UP convention.

## TL;DR

Three fixes: gate the title-block furniture on the LIVE
SURVEY-INFO visibility (was a stale-closure read) so the eye
hides it; rename the empty starter layer to "Layer 1"; and flip
the TRV import to Y-UP (north = +y) so the drawing is no longer
vertically mirrored vs the TPC original.
