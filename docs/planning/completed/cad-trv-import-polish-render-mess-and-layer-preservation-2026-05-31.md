# CAD TRV import polish — render mess + layer preservation + nesting — 2026-05-31

*User screenshot of a Garland import shows working geometry on a
correctly-sized sheet, but with three concrete problems:*

> *"It's messy and all over the place. … Something is not
>  translating correctly with the curved lines, and I'm
>  wondering if it is trying to draw both polylines and arc
>  lines through the same points. … Our initial default
>  layers are being removed when we import the trv data.
>  Please keep the layers that are the default starting
>  layers. Also, put all of the trv layers that get imported
>  into one main layer with a bunch of sub groups and sub
>  layers."*

## Today's reality (audit, 2026-05-31)

Garland import produces **11 POLYLINE + 126 SPLINE + 8 POLYGON +
792 POINT** features. The 126 splines + 11 polylines means most
traverses have 1 polyline AND multiple SPLINE features rendering
through the SAME vertices — that's the "drawing both polylines
and arc lines through the same points" visual mess.

The spline emission was added in Pass 7 of the deep-semantic
work to give surveyors editable curve handles when an arc fit
failed. But for typical surveys (mostly straight lines + a few
true arcs), the spline fallback is overkill and double-draws.

For default layers: TRV layers come in via `drawingStore.addLayer`,
which CAN overwrite an existing layer when the ids collide. Our
default starting layers (NORTH-ARROW, SURVEY-INFO, BOUNDARY, etc.)
have static ids; TRV layers are prefixed `trv-layer:<n>` so they
shouldn't collide. Need to verify nothing else is removing the
defaults — possibly the `loadDocument` path or a different
import branch.

For nesting: the data model already has `LayerGroup` +
`layerGroups: Record<string, LayerGroup>` + `layerGroupOrder`.
TRV layers currently land as flat top-level layers; we want a
single "TRV Import: <project name>" group containing all 19 of
them.

## Slices

### Slice 1 — Stop emitting SPLINE curve features (drop double-draw) ✅ shipped 2026-05-31

- `mapTraverse` no longer emits SPLINE features for non-arc
  curved runs. The polyline already faithfully passes through
  every source vertex; the SPLINE alongside it was the source
  of the user's "drawing both polylines and arc lines through
  the same points" visual mess (126 splines + 11 polylines on
  Garland).
- ARC features still emit when the circle-fit residual is
  within tolerance (true circles get editable center+radius
  handles).
- Detection metadata stays in `properties.trvCurveRuns` so a
  future "Convert polyline segment to spline" tool can read
  it.
- `fitSplineControlPoints` import dropped from the mapper.
- 1 new spec locks the non-arc curved run → no SPLINE emission
  + the run still records in trvCurveRuns. Existing Pass-7
  ARC specs continue to pass.
- Full cad suite (2379) green; typecheck + lint clean.

- The polyline / polygon already faithfully follows every
  vertex in the source. Emitting an additional SPLINE that
  approximates the same vertices doubles the rendered geometry.
- Drop the SPLINE-fallback emission; only emit ARC features
  when the circle-fit residual is ≤ tolerance (true circles).
- Keep `properties.trvCurveRuns` metadata so a future "Convert
  polyline segment to spline" tool can read it.
- Tests: a curved polyline still has ONE polyline + zero
  spline features; arc-fit emission still works.

### Slice 2 — Preserve default starting layers across TRV import ✅ shipped 2026-05-31

Audit root cause: `createDefaultDocument()` in `drawing-store.ts`
was returning a doc with `layers: {}` + `layerOrder: []`. The
PHASE3 default starting layers (BOUNDARY, BOUNDARY-MON,
EASEMENT, STRUCTURES, FENCE, ROW, NORTH-ARROW, SURVEY-INFO,
etc.) were never being seeded — they only appeared in saved
.starr documents that already had them. So the user's "default
layers are being removed when we import" was actually "the
defaults were never there to start with."

Fix: `createDefaultDocument()` now seeds:
- `layers` from `getDefaultLayersRecord()` (28 default layers
  across 6 layer groups)
- `layerOrder` from `getDefaultLayerOrder()`
- `layerGroups` from `DEFAULT_LAYER_GROUPS` (Boundary &
  Control / Improvements / Utilities / Natural Features /
  Transportation / Annotation & Misc)
- `layerGroupOrder` matching the source order

5 new specs lock the preservation contract via the live store:
every default layer survives the TRV import, user-created
layers survive, isDefault flags retained, TRV layers append
to the END of layerOrder, pre-existing features stay intact.

One legacy AI test (`edit-drawing.test.ts > auto-creates a
layer named ON add`) updated — the AI's case-insensitive layer
matcher now routes `'STRUCTURES'` to the seeded default
`Structures` layer instead of creating a new one (which is the
correct behavior — the test was asserting the wrong shape).

- Investigate `addLayer` semantics + the TRV import flow. Add a
  spec that locks "every default layer present before the import
  is still present afterwards."
- If `addLayer` is overwriting, switch to a "skip if id exists"
  variant or namespace TRV ids explicitly.

### Slice 3 — Restructure TRV imports onto ONE main layer + a Points-Only layer ✅ shipped 2026-05-31

- `trvToDrawing` now emits exactly TWO synthetic Starr layers
  per import:
  - `TRV: <project> — Drawing` (sortOrder 1000) holds every
    POLYLINE / POLYGON / ARC.
  - `TRV: <project> — Points` (sortOrder 1001) holds every
    POINT.
- Prefix derived from `doc.metadata.projectName`; falls back to
  `TRV Import` when the source has no project name.
- Each mapped feature carries `properties.trvOriginalLayer`
  with the source TRV layer name (Boundaries / Topo / Easements
  / etc.) so the user can filter / colour-by / audit by source
  layer. The source layer ids stay in the round-trip data
  (parsed `doc.layers`) so smart-merge serialization still
  re-emits them.
- New `trvLayerPrefix(doc)` + `trvDrawingLayerKey` +
  `trvPointsLayerKey` + `trvLayerNameByStarrId` helpers (pure).
- 6 new specs lock the restructure end-to-end (Drawing /
  Points split, original-layer-name stamping, project-name vs
  fallback prefix, Garland integration). Affected legacy
  tests (3 fresh-export + 1 trv-io + 2 trv-to-drawing) updated
  to expect the new 2-layer behavior; smart-merge round-trip
  specs continue to pass unchanged (the merge path re-emits
  source layers verbatim from sourceTrv.lines).
- Full cad suite (2385) green; typecheck + lint clean.

User refined the ask:
> "Put all of the trv layers that get imported into one layer
>  so that we can select the main layer to edit and manage all
>  of the new element data."
> "Make sure that there is a layer created that only has the
>  point data, and none of the layer lines or anything like
>  that. … display the point names and point codes and
>  everything."

- After mapping a TRV doc, collapse the 19 TRV layers into
  TWO Starr layers:
  - `TRV: <project> — Drawing` — every POLYLINE / POLYGON /
    ARC feature
  - `TRV: <project> — Points` — every POINT feature, with
    `properties.label` already carrying the description (Slice
    2 of element-coverage) so the existing point-label panel
    options will render them.
- Each feature's original TRV layer name lives on
  `properties.trvOriginalLayer` for filter / colour-by /
  audit. The 19 source TRV layers stay in the round-trip data
  (`trvOriginalLayer`) so the smart-merge serializer still
  re-emits the source layer assignments.
- Default starting layers (NORTH-ARROW, SURVEY-INFO, etc.)
  are NOT touched by the import — the new TRV layers are
  added alongside.
- Tests: import yields exactly 2 new layers; every POINT lands
  on Points; every POLYLINE/POLYGON/ARC lands on Drawing;
  default layers still present; trvOriginalLayer preserved.

- After mapping a TRV doc, wrap all `trv-layer:*` layers in a
  new `LayerGroup` named "TRV Import — <project name>" (or
  "TRV Import" when no name).
- MenuBar's two TRV import branches call
  `drawingStore.addLayerGroup(group)` + assign each TRV
  layer's `groupId` (or whatever the data model uses) so the
  LayerPanel renders them nested.
- Tests: import produces N TRV layers + 1 wrapping group; the
  group's name reflects the TRV project metadata.

### Slice 4 — Layer-preference panel options work on imported elements ✅ shipped 2026-05-31

Audit: `lib/cad/labels/generate-labels.ts` reads
`feature.properties.pointName` (for "Show point names") and
`feature.properties.description` (for "Show point descriptions").
TRV-imported POINT features were stamping `trvPointId` +
`label` instead, so the toggles silently no-op'd on imported
elements.

Fix: TRV mapper now ALSO stamps the standard Starr property
names:
- `properties.pointName` ← TRV point id (every point)
- `properties.description` ← native `1,<desc>` line (when
  present)
- The subtype-12 drawing-element label attach step ALSO
  mirrors into `properties.description` so labels surfaced
  from `28,12,<pointId>` blocks flow through too.

The original TRV-specific fields (`trvPointId`, `label`) stay
in place so existing readers + the round-trip path continue to
work.

4 new specs lock the bridge: `pointName` always set, native
description mirrors to both `label` + `description`, a point
with no description has neither field, drawing-element labels
also mirror to `description`.

## Guardrails

- Lossless round-trip stays byte-equal (Pass 5 specs).
- Curve detection metadata still flows through
  `properties.trvCurveRuns` so future editability isn't lost.
- Default layer preservation locked by a new spec, not just
  by hopeful behavior.

## TL;DR

Three slices: drop SPLINE fallback emission to clean up the
visual mess (Slice 1), preserve default layers across TRV
import (Slice 2), nest the imported TRV layers under one
parent group (Slice 3).
