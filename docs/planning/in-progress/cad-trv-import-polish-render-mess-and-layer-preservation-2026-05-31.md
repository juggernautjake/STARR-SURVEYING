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

### Slice 2 — Preserve default starting layers across TRV import

- Investigate `addLayer` semantics + the TRV import flow. Add a
  spec that locks "every default layer present before the import
  is still present afterwards."
- If `addLayer` is overwriting, switch to a "skip if id exists"
  variant or namespace TRV ids explicitly.

### Slice 3 — Nest imported TRV layers under one parent layer group

- After mapping a TRV doc, wrap all `trv-layer:*` layers in a
  new `LayerGroup` named "TRV Import — <project name>" (or
  "TRV Import" when no name).
- MenuBar's two TRV import branches call
  `drawingStore.addLayerGroup(group)` + assign each TRV
  layer's `groupId` (or whatever the data model uses) so the
  LayerPanel renders them nested.
- Tests: import produces N TRV layers + 1 wrapping group; the
  group's name reflects the TRV project metadata.

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
