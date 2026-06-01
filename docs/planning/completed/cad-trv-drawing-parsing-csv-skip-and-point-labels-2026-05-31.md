# CAD TRV drawing parsing — `.csv` traverse skip + point label fix — 2026-05-31

*User shared the Traverse PC reference drawing + the TPC desktop
traverse list. Looking at the actual reference output:*

> *"Please continue to review the TRV file and get better at
>  interpreting the information."*
>
> *"While I can show line bearings and distances, I cannot show
>  point lines and codes still for imported trv files."*

## Today's reality (audit, 2026-05-31)

Reference image shows a clean rectangular BOUNDARY (5 points)
with bearings/distances labels + small interior traverses
(DECK 6 pts, WEST BUILDING 11, CENTER BUILDING 8, SHED 5,
FENCE 34, etc.) + a tie-line to "309 w/angle iron".

Traverse PC desktop list reveals the smoking gun in Garland:
- `26074.csv` — **223 points**
- `Copy-26074.csv` — **358 points**
- `DUP-26074.csv` — **358 points**

These three `*.csv`-named "traverses" are master point lists
from the source CSV import — they're NOT drawing geometry.
Traverse PC renders their member points as POINT SYMBOLS only,
NOT as polylines. My mapper makes one polyline per traverse,
connecting all 939 unrelated survey shots in row order →
explains the visual mess.

Point labels: layer-prefs panel writes `displayPreferences`
correctly + regenerates labels. The TRV-imported POINT
features have `properties.pointName` + `properties.description`
from earlier slice 4 work, BUT they're missing `properties.code`
which the panel's "Show point descriptions" check uses as a
fallback display. Without it, the description label may not
land on the right "code" track.

## Slices

### Slice 1 — Skip `.csv` master-list traverses ✅ shipped 2026-05-31

- `mapTraverse` returns `[]` when the traverse name matches
  `/\.csv\b/i`. Records a mapper note ("Skipped CSV master-list
  traverse '26074.csv' (223 points, rendered as POINT symbols
  only)") so the import-confirm dialog shows what was filtered.
- Member points still flow through the points pass as native
  POINT features (independent of the traverse mapping).
- Verified against the live Garland sample: total parsed
  traverses = 20, CSV-named = 3 (26074.csv 223 pts,
  Copy-26074.csv 358 pts, DUP-26074.csv 358 pts), final
  polyline count drops from 11 → 8 (matching the actual lot's
  drawing geometry — BOUNDARY, DECK, WEST BUILDING, CENTER
  BUILDING, SHED, FENCE, etc.).
- 6 specs lock the skip behavior (case-insensitive suffix,
  Copy- / DUP- prefix variants, non-CSV unaffected, member
  points still mapped, skip note carries point count).

### Slice 2 — Code-aware point properties for label panel ✅ shipped 2026-05-31

User: "I can show line bearings and distances, I cannot show
point lines and codes still for imported trv files."

Diagnosis: `lib/cad/labels/generate-labels.ts`'s
"showPointDescriptions" branch reads `properties.code` first
(then falls back to description). TRV-imported points were
only stamping `description`. The recognized-code fast-path
needs `code` (alpha) AND `codeNumeric` to be different — TRV
free-form descriptions don't resolve in our library, so the
fallback `String(properties.description ?? properties.code ?? '')`
runs. But if `code` is `undefined`, the cascade still finds
description so the label SHOULD render.

Fix anyway (defense in depth): mapper now stamps
`properties.code = p.description` so EITHER track of the
generator's code resolution can land the text. 2 specs lock
the stamping behavior + the no-description-no-code case.

## TL;DR

- `mapTraverse` returns empty array when `t.name` ends in
  `.csv` (case-insensitive) — these are CSV-import artifacts,
  not drawing polylines. The member points still flow through
  the points pass as POINT features; only the spurious
  polyline is suppressed.
- Optional same skip for `Copy-*.csv` / `DUP-*.csv` prefixed
  duplicates (subsumed by the suffix check).
- Mapper note records the skipped traverse for the import-
  confirm dialog: "Skipped CSV master-list traverse '26074.csv'
  (223 points)".
- Tests: pure mapper specs (suffix skip; case-insensitive;
  member points still extracted); Garland sample expected
  polyline count drops from 11 to ~8 once the 3 CSV traverses
  are skipped.

### Slice 2 — Code-aware point properties for label panel

- Stamp `properties.code` from the TRV's `methodCode` /
  `description` so the layer-prefs "Show point descriptions"
  toggle can render the code track when alpha/numeric codes
  aren't recognized.
- Tests: a TRV point with description "309 inside 315 1in"
  picks up `code = '309 inside 315 1in'` so the label panel
  can show it.

## TL;DR

Two slices: skip `.csv` master-list traverses (drops 939
spurious vertices from Garland — the "drawing isn't great"
visual mess) + stamp `properties.code` so the layer-prefs
"Show point descriptions / codes" toggle works on TRV points.
