# AI Reference — EDIT_DRAWING Action Cookbook

`EDIT_DRAWING` is how the AI changes the drawing. The client applies it as
one undoable batch behind an Apply button. All coordinates are
northing/easting (feet). Combine fields freely.

## Fields
- `add[]` — create features. `shape`:
  `POINT|LINE|POLYLINE|POLYGON|SPLINE|CIRCLE|ELLIPSE|ARC|TEXT`.
  - POINT `points:[pt]`; LINE `[a,b]`; POLYLINE/POLYGON `[verts…]`
    (polygon auto-closes — list corners once);
  - SPLINE `[verts…]` + `closed`; ARC `[start,mid,end]`;
  - CIRCLE `points:[center]` + `radius`; ELLIPSE `[center]` +
    `radiusX/radiusY` (+`rotationDeg`); TEXT `points:[anchor]` + `text`.
  - Styling: `color` (stroke #hex), `fill` (area #hex, closed shapes),
    `opacity` (0–1), `lineWeight` (mm), `lineType` (DASHED/FENCE_*/…),
    `symbol` (glyph at a POINT: UTIL_POLE/VEG_TREE_DECID/MON_*), `layerName`
    (auto-creates if missing). POINT may carry `pointNumber`/`code`/`description`.
- `fit[]` — exact best-fit shape from a point set:
  `{ shape:"RECTANGLE|CIRCLE|LINE|CURVE", fromIds:[…], points:[…],
     closed (CURVE), deleteSource:true, color, fill, opacity, lineWeight,
     layerName }`. Prefer this for "best-fit square/circle/line/curve".
- `modify[]` — `{ id, points?, color?, fill?, opacity?, lineWeight?,
  lineType?, symbol?, layerName? (move), pointNumber?, code?, description?,
  elevation? }` (reshape, restyle, re-layer, and edit POINT survey attrs).
- `transform` — `{ ids:"SELECTION"|[…], translate:{north,east},
  rotateDeg, scale, about:"CENTROID"|{northing,easting} }`.
- `createLayers[]` — `{ name, color? }` pre-create named layers.
- `hideIds[]` / `unhideIds[]` — non-destructive show/hide.
- `deleteIds[]` — remove features by id.

## Worked examples
Fit squares to selected pillar shots (ids 200,201,202 / 196), replacing them:
```json
{ "type":"EDIT_DRAWING","description":"fit pillar squares",
  "fit":[
    {"shape":"RECTANGLE","fromIds":["200","201","202"],"deleteSource":true},
    {"shape":"RECTANGLE","fromIds":["196"],"deleteSource":true} ] }
```

Draw a fence polyline through three shots and make it dashed-red:
```json
{ "type":"EDIT_DRAWING","description":"fence",
  "add":[{"shape":"POLYLINE","points":[{"northing":100,"easting":50},
    {"northing":140,"easting":52},{"northing":175,"easting":60}],
    "color":"#cc0000","lineWeight":0.5}] }
```

Rotate the selection 15° about its centroid:
```json
{ "type":"EDIT_DRAWING","description":"rotate","transform":
  {"ids":"SELECTION","rotateDeg":15,"about":"CENTROID"} }
```

Smooth closed pond outline through shots:
```json
{ "type":"EDIT_DRAWING","description":"pond","add":[
  {"shape":"SPLINE","closed":true,"points":[ /* perimeter shots */ ]}]}
```
