# AI Reference — Structure Recipes (point-code driven)

How to turn coded survey points into common structures. Read each point's
`code`/`description` from CURRENT SELECTION to choose the recipe and layer.
These are guidelines; compute exact coordinates from the shots.

## Building / house
- Corner shots define the footprint. If they're meant to be square/
  rectangular, use `fit` RECTANGLE (min-area) per wing; otherwise connect
  corners as a closed POLYGON in shot order.
- Layer: `STRUCTURES` (or the points' layer). Style: solid, medium weight.

## Fence
- Connect the fence shots in order as a POLYLINE.
- Apply a fence line type (dashed / barbed / chain — Phase 3 line-type
  assignment) matching the code (FN01 barbed, FN03 chain-link, …).
- Layer: `FENCE`.

## Road / driveway
- Two edge strings (left/right shots) → two POLYLINEs.
- Optional centerline = midpoints of paired edge points.
- Layer: `ROW`/`ROAD`. Curves: fit smooth SPLINE/ARC where edges bend.

## Boundary / parcel
- Closed POLYGON through the boundary monuments in order.
- Report bearings + distances per leg; area via shoelace.
- Layer: `BOUNDARY`. Heavy solid line.

## General principles
- Preserve the surveyor's positions exactly — never move shots unless asked.
- Keep new geometry on a sensible layer and echo the existing coding scheme.
- Prefer `fit` for regular shapes; raw `add` for free-form linework.
