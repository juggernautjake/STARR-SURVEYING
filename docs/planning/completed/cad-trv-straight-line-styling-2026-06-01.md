# CAD TRV straight-line styling decode — 2026-06-01

*User shared the Fill/Control-Base tabs for DECK / ROAD / FENCE /
BOUNDARY + the Program Settings (Units / Width / Decimals / Angle
Sets). Direction: "for now let's just get all of the straight
lines working and stuff." This drawing has no curves.*

## Ground truth cracked from the screenshots

Pairing each traverse's Fill-tab selection with its raw
`51` / `71` styling records (extracted from the live file):

| Traverse | TPC Fill        | `71,<A>,<B>` | `51` field 1 | Line type   |
| -------- | --------------- | ------------ | ------------ | ----------- |
| DECK     | Diagonal / (0)  | `71,5,37`    | 1            | Solid       |
| ROAD     | 5 Percent (17)  | `71,22,37`   | 1            | Solid       |
| FENCE    | (none)          | `71,0,7`     | **−43**      | **Fence Wire** |
| BOUNDARY | (none)          | `71,0,7`     | 1            | Solid (bold)|

**Fill decode** — `71` field 0 = TPC internal fill enum.
`Diagonal /`(dropdown 0) → 5; `5 Percent`(dropdown 17) → 22.
Both confirm **dropdownIndex = field0 − 5**; `field0 < 5` (e.g.
0) → NO fill. So `tpcFillIndexToStarr(field0 − 5)` gives the
Starr pattern.

**Line type decode** — `51` field 1: `1` = Solid; `−43` = Fence
Wire (negative = special symbol line type). FENCE → our
`FENCE_BARBED_WIRE`.

**Line weight** — `51` field 0: BOUNDARY = 8 (bold, 0.02"),
others = 0 (hairline). So field0 ≥ 4 → bold boundary weight.

**Units (Program Settings)**: Distance=Feet, Direction=Bearing,
Angles=DMS, Area=Acres (factor 43560), SqFt, Station=100. These
confirm our bearing format (already matching) + are TPC program
settings, not per-file — no parser change needed.

## Slices

### Slice 1 — Decode `51`/`71` into line style + apply to traverse polylines ✅ shipped 2026-06-01

- New `lib/cad/io/trv-line-style.ts`: `decodeTrvLineStyle` →
  `{ lineTypeId, isBold, fillPattern, fillRotation, fillDensity,
     tpcFillName }`.
  - Fill: `71` field0 ≥ 5 → `tpcFillIndexToStarr(field0 − 5)`;
    else NONE.
  - Line type: `51` field1 === −43 → FENCE_BARBED_WIRE, else
    SOLID.
  - Bold: `51` field0 ≥ 4 → true.
- `mapTraverse` applies it: `lineTypeId`, `lineWeight` (bold →
  0.5), and `fillPattern`/`patternRotation`/`patternDensity`/
  `patternColor`/`fillOpacity` when a fill is present; stamps
  `properties.trvFillName`.
- 10 specs anchored on the EXACT live records: DECK→LINES@45
  (Diagonal /), ROAD→DOT_UNIFORM (5 Percent), FENCE→
  FENCE_BARBED_WIRE, BOUNDARY→bold solid no-fill + live-file
  integration. The old visibility test's "all polygons
  outline-only" assertion relaxed to "valid pattern + pattern
  color when filled" since filled traverses now legitimately
  carry a pattern.

## Status

Slice 1 shipped — the only slice. Doc moves to completed/.

- New `lib/cad/io/trv-line-style.ts`:
  - `decodeTrvLineStyle(stylingRecords)` →
    `{ lineTypeId, fillPattern, fillRotation, fillDensity,
       isBold }`.
  - Fill: `71` field0 ≥ 5 → `tpcFillIndexToStarr(field0 − 5)`;
    else NONE.
  - Line type: `51` field1 === 1 → SOLID, === −43 →
    FENCE_BARBED_WIRE, else SOLID.
  - Bold: `51` field0 ≥ 4 → true.
- `mapTraverse` applies the decode to the polyline's
  `feature.style`: `lineTypeId`, `lineWeight` (bold → 0.5,
  else null), and `fillPattern` / `patternRotation` /
  `patternDensity` / `patternColor` when a fill is present.
- Tests: the 4 ground-truth records decode to the expected
  styles (DECK→LINES@45, ROAD→DOT_UNIFORM, FENCE→barbed wire,
  BOUNDARY→bold solid no-fill).

## TL;DR

One focused slice: decode the cracked `51`/`71` line-style
records so imported straight lines render with the right line
type (fence wire vs solid), weight (bold boundary), and fill
(DECK diagonal hatch, ROAD percent screen) — matching TPC.
