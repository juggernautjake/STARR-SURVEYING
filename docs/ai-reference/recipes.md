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

## Worked EDIT_DRAWING examples

Square up a brick pillar from 3 corner shots (ids 200,201,202), replacing them:
```json
{ "type":"EDIT_DRAWING","description":"pillar square",
  "fit":[{"shape":"RECTANGLE","fromIds":["200","201","202"],
           "deleteSource":true,"layerName":"STRUCTURES"}] }
```

Fence through shots, dashed-barbed on the FENCE layer:
```json
{ "type":"EDIT_DRAWING","description":"barbed fence",
  "createLayers":[{"name":"FENCE","color":"#E67E22"}],
  "add":[{"shape":"POLYLINE","layerName":"FENCE","lineType":"FENCE_BARBED_WIRE",
          "points":[{"northing":100,"easting":50},{"northing":140,"easting":52},
                    {"northing":175,"easting":60}]}] }
```

Boundary parcel + a leg-bearing label (read bearing from the digest):
```json
{ "type":"EDIT_DRAWING","description":"boundary",
  "add":[
    {"shape":"POLYGON","layerName":"BOUNDARY","lineWeight":0.6,
     "points":[{"northing":0,"easting":0},{"northing":0,"easting":200},
               {"northing":150,"easting":200},{"northing":150,"easting":0}]},
    {"shape":"TEXT","layerName":"BOUNDARY","text":"N90°00'00\"E  200.00'",
     "points":[{"northing":-6,"easting":100}]} ] }
```

Pond outline as a smooth closed curve through perimeter shots, filled blue:
```json
{ "type":"EDIT_DRAWING","description":"pond",
  "fit":[{"shape":"CURVE","fromIds":["p1","p2","p3","p4","p5","p6"],
          "closed":true,"fill":"#7fb3ff","opacity":0.5,"layerName":"WATER"}] }
```

Telephone poles at each utility shot:
```json
{ "type":"EDIT_DRAWING","description":"poles",
  "modify":[{"id":"u1","symbol":"UTIL_POLE"},{"id":"u2","symbol":"UTIL_POLE"}] }
```

## General principles
- Preserve the surveyor's positions exactly — never move shots unless asked.
- Keep new geometry on a sensible layer and echo the existing coding scheme.
- Prefer `fit` for regular shapes; raw `add` for free-form linework.
- Read coordinates/bearings/centers from CURRENT SELECTION + the snapshot
  `linework` catalog; never guess numbers.
