# CAD TRV bearings + distances on imported traverses — 2026-05-31

*User shared 5 Traverse PC screenshots that reveal:*

1. **Traverse View Format dialog** — TPC's display sequence is
   `BHYXZD` (Bearing / Horiz Dist / Y / X / Z / Description).
2. **Closure View** for BOUNDARY — 5 points closed loop,
   888.68' perimeter, 43361.55 SqFt = 0.995 Acres.
3. **Traverse View** showing computed bearings + distances for
   every segment of BOUNDARY:
   `N73°34'00"W 299.62'`, `N16°39'00"E 144.73'`,
   `S73°33'47"E 299.62'`, `S16°39'01"W 144.72'`.
4. **Traverse Properties** — confirms closure metrics + area.
5. **Traverse Drawing Settings** with explicit field labels:
   font / size / line style / line weight / Direction toggle /
   Distance toggle / Description toggle / point symbol (Rebar)
   / interval / color.

## Today's reality (audit, 2026-05-31)

Bearings + distances are NOT stored in the TRV — TPC computes
them on the fly from the point coordinates. My math (atan2 →
azimuth → NSEW bearing format) produces results matching TPC
to the second on bearing and 0.01' on distance for every
BOUNDARY segment (just verified).

What's missing from my import: the labels themselves. The
reference drawing shows `S 73°33'47" E 299.62'` along every
boundary segment. My current import renders the polyline but
no labels.

## Slices

### Slice 1 — Compute + emit bearing + distance labels for traverse segments ✅ shipped 2026-05-31

- New pure module `lib/cad/io/trv-bearings.ts`:
  - `surveyorsBearing(a, b)` — NSEW-quadrant format
    (`N73°34'00"W`).
  - `formatDistance(ft, decimals?)` — `299.62'`.
  - `segmentDistance(a, b)` — straight-line hypot.
  - `traverseSegmentLabels(vertices)` — per-segment record
    `{ startIndex, endIndex, bearing, distance, distanceFt,
       midpoint, segmentAngleRad }`.
- 22 specs lock the math, anchored on the live BOUNDARY
  traverse from Garland: all 4 bearings match TPC to the
  second + all 4 distances match to 0.01 ft + the closed-loop
  perimeter sums to TPC's reported 888.68 ft.

- New pure module `lib/cad/io/trv-bearings.ts`:
  - `surveyorsBearing(deltaN, deltaE)` → `'N73°34'00"W'`
  - `formatDistance(ft, decimals = 2)` → `'299.62\''`
  - `traverseSegmentLabels(vertices)` → per-segment `{ bearing,
    distance, midpoint, angle }` for label placement.
- Mapper extension: on each non-`.csv` traverse, compute
  per-segment labels and emit them as the polyline's
  `feature.textLabels` so the canvas renders them
  immediately on import. Only when the polyline has ≥ 2
  vertices; respect the existing `showBearings` /
  `showDistances` layer-prefs toggles for visibility.
- Tests: verify against TPC-reported BOUNDARY values
  (already validated; locking as a regression test);
  segment label placement at midpoint; 4 BOUNDARY segments
  all match TPC.

### Slice 2 — Seed showBearings / showDistances / showPointNames on TRV layers ✅ shipped 2026-05-31

- `trvToDrawing` now stamps `displayPreferences` on both
  synthetic layers:
  - **TRV Drawing layer**: `showBearings: true`,
    `showDistances: true` — bearings + distances render
    immediately on import via the existing
    `lib/cad/labels/generate-labels.ts` pipeline (which
    already computes them from the polyline vertices using
    `inverseBearingDistance` + `formatBearing` — Starr's
    formatter happens to match TPC's content to the second).
  - **TRV Points layer**: `showPointNames: true`,
    `showPointDescriptions: true` — point ids + descriptions
    render next to each point.
- 3 specs lock the seed: both layers carry the right
  `displayPreferences`, other prefs stay at DEFAULT (false).

- The synthetic `trv-drawing:<prefix>` layer comes in with
  `displayPreferences` undefined → falls back to all-off
  defaults. The user explicitly mentioned line bearings +
  distances work, so the toggles ARE plumbed; the labels
  just aren't seeded.
- Seed `showBearings: true` + `showDistances: true` on the
  new TRV Drawing layer so the user gets the BOUNDARY-style
  bearing labels out of the box.
- Tests: source-text spec on the mapper seeding the prefs.

## TL;DR

Two slices: emit computed bearing + distance labels for every
imported traverse segment (Slice 1, matches TPC exactly) +
seed the TRV Drawing layer's display prefs so the bearings
+ distances render immediately on import (Slice 2).
