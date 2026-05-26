# AI Reference — Calculation Methods

The exact methods the app uses. Use these so results match the software.

## Distance / inverse
- Distance between A and B: `√((Bx−Ax)² + (By−Ay)²)` (feet).
- Azimuth A→B (clockwise from north): `atan2(Δeasting, Δnorthing)`
  normalized to 0–360°. (East = Δx, North = Δy.)

## Midpoint / centroid
- Segment midpoint: component-wise average of the two endpoints.
- Polygon/polyline centroid (vertex average is what the app reports in the
  selection digest): mean of the vertices.

## Area (shoelace)
For polygon vertices `v[0..n-1]`:
`A = ½ · |Σ (v[i].x·v[i+1].y − v[i+1].x·v[i].y)|` (indices mod n).

## Circular curve relations
Given radius `R` and central angle `Δ` (radians):
- Arc length `L = R·Δ`
- Chord `C = 2R·sin(Δ/2)`
- Tangent `T = R·tan(Δ/2)`
- External `E = R·(sec(Δ/2) − 1)`
- Mid-ordinate `M = R·(1 − cos(Δ/2))`
- Degree of curve (arc def, 100 ft): `D = 5729.578 / R`

## Best-fit shapes (lib/cad/geometry/fit.ts)
- **Rectangle** — minimum-area bounding rectangle via convex hull +
  rotating calipers. Recovers the true orientation of a rotated square
  (do NOT use an axis-aligned box or PCA, which are ambiguous for squares).
- **Circle** — Kåsa least-squares algebraic fit → center + radius.
- **Line** — total-least-squares (PCA principal axis) through the points,
  spanning the projection extent.
- **Smooth spline through points** — Catmull-Rom tangents → cubic beziers
  (`fitPointsToBezier`); set closed for a smooth loop (pond/lake).

## Rectangle from a few corner shots
1. Collect the shot coordinates.
2. Use the best-fit **Rectangle** (min-area) — it yields 4 corners with the
   correct size AND rotation.
3. Emit as a POLYGON `add`/`fit`; optionally delete the source shots.
