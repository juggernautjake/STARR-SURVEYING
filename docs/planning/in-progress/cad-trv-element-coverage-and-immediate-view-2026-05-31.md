# CAD TRV element-coverage + immediate-view — 2026-05-31

*User ask: review parsing + translation from TRV to Starr;
make sure paper-fit + zoom land everything on the page +
immediately viewable; coords preserved; equivalencies for
every TRV element type; create new Starr elements if needed.*

## Today's reality (audit, 2026-05-31)

Diagnostic against Garland (792 pts) + SKP (199 pts) live
samples:

| element                       | TRV count (Garland / SKP) | Starr equivalent today        |
| ----------------------------- | ------------------------- | ----------------------------- |
| layers (86)                   | 19 / 19                   | ✅ Layer per 86 record        |
| points (0/1/2/3/4)            | 788 / 198 (post-placeholder skip) | ✅ POINT feature       |
| traverses (30 + 10/11)        | 19 / 22                   | ✅ POLYLINE / POLYGON         |
| detected curves               | 126 SPLINE + 0 ARC (G) / 26 SPLINE + 1 ARC (S) | ✅ Pass 7 curve-fit |
| projection (91-94) + GNSS     | preserved                 | ✅ round-trip captured        |
| metadata (90, 101-106)        | preserved                 | ✅ titleblock apply prompt    |
| **drawing elements (28/29)**  | **48 / 69**               | ⚠ round-trip only — no Starr equivalent |
| **lot segments (13)**         | **3 / 0**                 | ⚠ round-trip only — no Starr equivalent |
| traverse styling (32-76, 129-162, 349-369) | per-traverse opaque | ⚠ deferred (color decoding) |

Issue with display (user-reported "doesn't adjust to scale"):
the paper-fit picks the ROBUST bbox (365 × 237 ft → LETTER
landscape @ 1" = 50' for Garland — perfect). But the
follow-up `cad:zoomExtents` re-computes its own STRICT bbox
inside CanvasViewport, so the camera ZOOMS OUT to the
13,168 × 10,020 ft outlier extent. The paper IS sized right,
but the camera lands on outliers + the survey looks tiny.

## Slices

### Slice 1 — Zoom to PAPER after import (not strict feature bbox) ✅ shipped 2026-05-31

- New `cad:zoomToPaper` event + `onZoomToPaper` handler in
  `CanvasViewport`. The handler reads `paperSize` /
  `paperOrientation` / `drawingScale` / `paperOrigin` from the
  drawing settings, computes the world-space paper rectangle,
  and calls `vpStore.zoomToExtents` on it with a small padding.
- New pure helper `paperRectWorld(settings)` in
  `lib/cad/io/trv-paper-fit.ts` so the math is unit-tested
  separately from the canvas integration.
- MenuBar's two TRV import branches now dispatch
  `cad:zoomToPaper` (not `cad:zoomExtents`) after paper-fit so
  the camera lands on the auto-sized sheet instead of the
  strict feature bbox (which on the Garland sample is 13k ×
  10k ft because of 1-2 stray GPS shots).
- 9 specs: paperRectWorld math (LETTER landscape + portrait +
  custom origin + defaults + state-plane millions); CanvasViewport
  handler shape + listener registration; MenuBar wires both
  branches to dispatch the new event; legacy cad:zoomExtents
  no longer fires from the TRV branches.
- Full cad suite (2349) green; typecheck + lint clean.

- New `cad:zoomToPaper` event the CanvasViewport listens to.
  Handler reads `paperOrigin` / `paperSize` / `paperOrientation`
  / `drawingScale` from the drawing settings + calls
  `vpStore.zoomToExtents` on the paper rectangle (with a small
  padding). Survey is then fully visible immediately on import,
  outliers off-screen but pan-accessible.
- MenuBar's two TRV import branches dispatch `cad:zoomToPaper`
  instead of `cad:zoomExtents` after the paper-fit runs.
- The legacy `cad:zoomExtents` (used by the View toolbar +
  the .starr open flow) stays unchanged.
- Tests: source-text spec on the new event handler + MenuBar
  wiring; behavioral spec on a paper-size → viewport-zoom
  pure helper.

### Slice 2 — Map TRV drawing elements (28/29) → POINT labels ✅ shipped 2026-05-31

- New pure module `lib/cad/io/trv-drawing-elements.ts`:
  - `extractPointLabels(elements)` walks every 28/29 element,
    finds subtype-12 entries (`28,12,<pointId>` + paired
    `29,5,...,"<text>¶"`), and returns clean point-label records.
  - `cleanLabelText(raw)` strips trailing pilcrows, splits multi-
    line label payloads on `¶` (U+00B6), joins DC4-separated
    tokens with a single space.
- Mapper integration in `trvToDrawing`: after the POINT pass,
  walks the extracted labels + attaches them to matching POINT
  features as `properties.label` + `properties.trvLabelSourceLine`.
  Non-destructive: the point's native `1,<description>` wins
  when both exist.
- 14 specs cover: `cleanLabelText` strip / split / DC4 join /
  empty payloads; `extractPointLabels` filters non-subtype-12,
  extracts cleaned text, handles missing text-runs, document
  ordering preserved; mapper attaches on empty native label +
  preserves native description when present; Garland sample
  yields the expected "309 inside 315 1in" label.
- Full cad suite (2363) green; typecheck + lint clean.

- 28/29 records carry north arrows, scale bars, legend boxes,
  title-block text, label callouts. ~48-69 per file.
- Build `mapDrawingElement(record)` that recognises the
  highest-value subtypes:
  - Text element → Starr `TEXT` feature with content + font
    size + position.
  - North arrow / scale-bar symbol references → Starr SYMBOL
    feature (or a STARR_NORTH_ARROW / STARR_SCALE_BAR symbol
    on a SURVEY-INFO-like overlay).
  - Other subtypes → fall back to opaque properties (so
    round-trip still preserves them).
- Tests: per-subtype mapper unit tests + Garland-sample
  integration counting the new TEXT features.

### Slice 3 — Map TRV lot segments (13) to Starr POLYGON features

- 13 records: lot/parcel boundary segments. Group consecutive
  13 records by their `polyId` field + emit one POLYGON per
  lot, tagged `properties.lotId` + `properties.isLotBoundary`.
- Tests: pure helper that groups 13 records + emits POLYGON +
  Garland sample yields ≥ 1 lot.

## Guardrails

- Lossless round-trip stays byte-equal (Pass 5 specs guard).
- Newly-mapped features carry back-references
  (`properties.trvSourceLine`, `properties.trvDrawingElementId`)
  so the smart-merge serializer can re-emit them losslessly +
  the surveyor can audit lineage.
- Coords stay in state-plane feet — no global re-scale or
  translation.

## TL;DR

Three slices: zoom-to-paper after import (immediate fix for
"doesn't adjust to scale"), drawing-element mapping (the 48-69
opaque records become editable TEXT/symbol features), lot-
segment mapping (the 3+ opaque records become POLYGON features
with lot metadata).
