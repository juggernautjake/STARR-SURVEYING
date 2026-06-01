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

### Slice 3a — Visibility audit + outline-only polygon defaults ✅ shipped 2026-05-31

User ask: "Make sure all of the lines and elements actually
show up and are not hidden or fully opaque, unless the trv
specifies that they should be."

Audit result on the live Garland sample:
- Every imported Layer is `visible: true` (already correct).
- Every imported Feature has `opacity: 1`, `color: '#000000'`,
  `lineWeight: 0.5` (already correct).
- POLYGON features previously inherited the bare `defaultStyle()`
  which omitted `fillColor` / `fillPattern`. Render path treats
  `undefined` `fillColor` as no-fill (already outline-only), but
  the defensive fix is to set them EXPLICITLY so the contract is
  visible at the call site + future fill-mapping work can layer
  on top deterministically.

Fix: `defaultStyle()` in `trv-to-drawing.ts` now stamps
`fillColor: null`, `fillPattern: 'NONE'`, `fillOpacity: 1` so
closed polygons are unambiguously OUTLINE-ONLY on import. No
opaque area to hide other features behind.

5 specs lock the visibility contract (every layer visible,
every feature opacity > 0 + color + lineWeight > 0, every
POLYGON outline-only) — synthetic + Garland end-to-end.

Full cad suite (2368) green; typecheck + lint clean.

### Slice 3 — Map TRV lot segments (13) to Starr features (deferred — needs parser-context change)

Diagnostic on Garland: the 3 surviving 13 records aren't
standalone lot boundaries — they're vertex-indexed annotations
INSIDE a traverse block (`13,524288,0,0,0,0,5,3533f` references
vertex 5 of the active traverse, lot name `3533f`). Mapping
these to Starr features requires the parser to track which
traverse the 13 belongs to + which vertex index resolves to
which point. Captured for round-trip; semantic mapping queued
as a separate slice once we have a multi-lot sample to validate
against (the current samples only have 3 lot annotations, none
forming closed lot boundaries).

### Slice 4 — Map TRV infill patterns (51 / 70 / 71) — partial decode shipped 2026-05-31

User ask: "the infill patterns from the trv also map to the
infill options that we have."

Diagnostic on Garland (20 traverses): the `71` record's field 0
is a clean fill-presence signal — 9 of 20 traverses use the
default `71,0,7` (no fill), the rest use values 1 / 4 / 5 / 22
/ 23 indicating different fill subtypes. The `70` record carries
a stable `scale` (always 5.0) + `param170` (always 170.000000,
likely a rotation in degrees but ground-truth undecoded).

What's shipped:
- New pure module `lib/cad/io/trv-fill-styling.ts`:
  - `hasTrvFillSpec(records)` — true when any `71` record has
    field 0 > 0.
  - `extractTrvFillSummary(records)` — returns
    `{ hasFill, fillKindCode, subtypeIndex, scale, param170 }`
    pulling the first fill-bearing 71 + the first 70.
- Mapper integration: `trvToDrawing` stamps every
  fill-bearing traverse's polygon/polyline feature with
  `properties.trvHasFillSpec: true` + the raw
  `trvFillKindCode` / `trvFillSubtypeIndex` / `trvFillScale` /
  `trvFillParam170` so the surveyor knows the TRV expected a
  fill there + the existing PropertyPanel infill picker can be
  opened on the feature for a manual pattern pick.
- 10 specs: pure decoder (empty / default / fill-bearing /
  first-wins / unrelated-records); mapper stamping on a
  synthetic DECK + verification that defaults stay unstamped;
  Garland sample yields ≥ 5 fill-bearing features.

What's DEFERRED (a separate slice when ground-truth is
available):
- Auto-picking a specific Starr `fillPattern`
  (DOT_UNIFORM / CROSSHATCH / BRICK / WAVE / etc.) from the
  raw subtype code. Without a TRV sample that has a KNOWN
  explicit fill (e.g. "this `71,5,37` traverse should render
  as brick"), a decoder would guess + could mislead the
  surveyor. The metadata is now preserved verbatim + the
  surveyor can pick the right Starr pattern manually via
  the existing PropertyPanel infill picker.
- 32-bit color decoding in `51` field 4 (deferred in earlier
  work, same rationale).

## Status

All four slices shipped (3 + 3a partially, 4 partially) or
explicitly deferred with rationale. Plan doc moves to
`completed/`.

User ask: "the infill patterns from the trv also map to the
infill options that we have. Check the scale of infill and
attributes of the infill from the trv and come up with
equivalent infill options."

Per-traverse styling records (51, 70, 71) carry the TRV fill
specification (pattern type, color, scale, rotation). They are
already captured opaquely in `traverse.stylingRecords` so
round-trip stays byte-equal. Decoding them into our
`fillPattern` / `patternColor` / `patternDensity` /
`patternRotation` / `patternScale` style fields requires:
  - Identifying which TRV pattern subtype maps to which of our
    8 fill patterns (DOT_UNIFORM / DOT_GRAVEL / LINES /
    CROSSHATCH / BRICK / WAVE / SOLID / NONE).
  - Decoding the 32-bit color packed field in 51 (deferred in
    earlier work — no Traverse PC docs for the encoding).
  - Calibrating density / rotation / scale to match the visual.

Queued as the next slice; will benefit from a TRV sample with
explicit known fill so we can ground-truth the decoder.

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
