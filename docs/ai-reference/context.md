# AI Reference — Context the Assistant Receives

Every drawing-chat turn injects two JSON blocks into the system prompt.
Read them before answering; they are the source of truth for the live state.

## CURRENT DRAWING SNAPSHOT
- `name`, `paperSize`, `paperOrientation`, `drawingScale`, `codeDisplayMode`,
  `sealed`/`sealHash`.
- `featureCounts` — count by feature type.
- `layers` — `{ name, color, featureCount }` (zero-feature default layers culled).
- `codesInUse` — distinct point codes present (reuse this coding scheme).
- `activeLayer` — the default layer; omit `layerName` to draw onto it.
- `extents` — `{ minNorthing, minEasting, maxNorthing, maxEasting }` (or null);
  size/place new geometry/art relative to this.
- `linework` — up to 60 non-point features `{ id, type, layer, center,
  lengthFt?, areaSqFt? }`; target these unselected shapes by `id`.
- `titleBlock` — firm/surveyor/project/client/etc.

## CURRENT SELECTION
What the user has highlighted right now ("these", "the selected points").
- `count`, `byType`, `truncated`.
- Per item (`items[]`, up to 150): `id`, `type`, `layer`, `pointNumber?`,
  `code?`, `description?`, `northing/easting` (anchor), `elevation?`.
- Style overrides when set: `color`, `fill`, `lineType`, `opacity`.
- Derived geometry: LINE `start/end/midpoint/lengthFt/bearing/azimuthDeg`;
  POLYLINE/POLYGON `verts[]` (≤48) + `centroid` + `lengthFt` + `areaSqFt`
  (polygon); CIRCLE/ELLIPSE/ARC `center` + `radius` + `areaSqFt`.

## Rules
- All coordinates are survey northing/easting (feet) — see `coordinates.md`.
- Never invent numbers: derive from these blocks. If the selection is empty
  but the user said "these", ask them to select something.
- After your EDIT_DRAWING applies, the created features become the new
  selection — so a follow-up "refine that" sees them here next turn.
