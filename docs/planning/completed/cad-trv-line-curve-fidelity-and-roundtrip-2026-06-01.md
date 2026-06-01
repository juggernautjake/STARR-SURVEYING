# CAD TRV line/curve fidelity + round-trip — 2026-06-01

*User shared 10 Traverse PC screenshots + 4 TRV files + the
reference plat PDF. Goal: perfectly replicate the TPC drawing on
import AND export Starr data back to a TRV that TPC opens
correctly.*

## What the screenshots + file tail revealed

### 1. Line connections ARE explicit — `28,15,<from>,<to>`

The file tail contains the breakthrough record:

```
28,15,20fnd,21fnd
29,5,-0.18,-0.51,0,1,8.00,3435,14,N 73°34'00" W 299.62'¶
28,15,23fnd,20fnd
29,5,0.45,-0.18,0,1,8.00,733,14,S 16°39'01" W 144.72'¶
```

`28,15,<fromPointId>,<toPointId>` = a drawn line segment with
TPC's PRE-COMPUTED bearing+distance label in the paired `29,5`
record's last text field. The number before the text (`3435`,
`733`) is the distance×scale or a label-id; the text is
verbatim (`N 73°34'00" W 299.62'`).

These are SUPPLEMENTAL labels (only 2 in Garland) — the 4
boundary sides are auto-labeled by the BOUNDARY traverse's
159-162 format templates. But the `28,15` strings let us
render TPC's EXACT label text (guaranteed match) where present.

### 2. Area label — `28,14,<n>`

```
28,14,6
29,5,-1.09,0.36,0,0,10.00,0,6,43362 SqFt0.995 Acres¶
```

The closed-traverse area label ("43362 SqFt / 0.995 Acres").

### 3. Connection order = traverse 10/11 sequence

Confirmed via the Traverse View screenshots: BOUNDARY is
`20fnd → 21fnd → 22fnd → 23fnd → 20fnd` (the 10,<id> order in
the 30-block). DECK/WEST BUILDING/etc. each list their own
points. My parser already captures `pointIds` in this order.

### 4. Authoritative TPC fill list (from the Fill dropdown)

47 named patterns in dropdown order (0-indexed):
`Diagonal /`, `Cross`, `Diagonal Cross`, `Brick`,
`Brick Filled`, `Clay`, `Concrete`, `Earth`, `Forest`,
`Forest (filled)`, `Grass`, `Gravel`, `Sand`, `Swamp`,
`Swamp (filled)`, `Water`, `Water (filled)`, `5 Percent` …
`90 Percent`, `Light Diagonal \`, `Light Diagonal /`,
`Dark Diagonal \/`, `Wide Diagonal \/`, `Light/Narrow/Dark
Vertical+Horizontal`, `Dashed Diagonal/Horizontal/Vertical`,
`Small Confetti`, `Large Confetti`. `*` suffix = "exports to
CAD".

### 5. Drawing variables (authoritative scale + units)

`$$SCALEPERINCH: 80 Ft/In`, `$$SCALE: 80'`, `$$UNITS: Feet`,
`$$DISTANCETYPE: Grid Dist`, `$$DIRECTIONTYPE: Grid Bearing`,
`Extents: top=10385412.21 left=3245433.75 bottom=10385138.80`.
These are TPC-INTERNAL (not in the TRV text) — confirmed by
grepping the file. So we keep computing our own scale, but now
we know TPC chose 80 ft/in for a ~270×410 ft survey on a
14"×8.5" Legal sheet → our paper-fit picking ~50 ft/in on a
smaller sheet is reasonable + close.

## Slices

### Slice 1 — Parse `28,15` line labels + `28,14` area labels ✅ shipped 2026-06-01

- `trv-drawing-elements.ts` gains `extractLineLabels` (28,15 →
  `{ fromId, toId, text, sourceLine }`) + `extractAreaLabels`
  (28,14 → `{ text, sourceLine }`). Both reuse `cleanLabelText`.
- Verified against the live Garland file: pulls
  `20fnd→21fnd "N 73°34'00" W 299.62'"`,
  `23fnd→20fnd "S 16°39'01" W 144.72'"`, and the area label
  `"43362 SqFt 0.995 Acres"`.
- 6 specs lock both extractors (incl. skip non-matching
  subtypes + missing text-run + missing point ids).

- Extend `trv-drawing-elements.ts`:
  - `extractLineLabels(elements)` → `{ fromId, toId, text,
    sourceLine }[]` from `28,15` blocks.
  - `extractAreaLabels(elements)` → `{ text, sourceLine }[]`
    from `28,14` blocks.
- Pure module specs lock both against the Garland tail.

### Slice 2 — Apply TPC's verbatim segment labels onto traverse polylines ✅ shipped 2026-06-01

- `trvToDrawing` attaches `28,15` segment labels to the
  polyline whose ordered point refs contain the from→to (or
  to→from) consecutive pair, stored as
  `properties.trvSegmentLabels` (JSON array of
  `{ fromId, toId, text }`).
- The `28,14` area label attaches to the largest closed polygon
  (boundary heuristic) as `properties.trvAreaLabel`.
- Falls back silently when no drawing-element labels are
  present; computed bearings still cover unlabeled segments.
- 5 specs incl. live Garland verification (boundary carries
  "43362 SqFt" area + the 2 segment labels).

- When a `28,15,A,B` matches a consecutive vertex pair in a
  traverse, use TPC's exact label string instead of (or
  alongside) our computed bearing. Stamp on the polyline's
  `textLabels` so it renders verbatim.
- Falls back to our computed bearing (already TPC-matching)
  for segments without an explicit `28,15`.

### Slice 3 — TPC fill-pattern name → Starr fillPattern table ✅ shipped 2026-06-01

- New `lib/cad/io/trv-fill-patterns.ts`: `TPC_FILL_NAMES` (the
  authoritative 47-entry ordered dropdown list) +
  `tpcFillNameToStarr(name)` / `tpcFillIndexToStarr(index)` →
  `{ pattern, rotation, density, tpcName }`.
- Mapping: Diagonal /→LINES@45, Diagonal \→LINES@135,
  Cross→CROSSHATCH@0, Diagonal Cross→CROSSHATCH@45,
  Brick→BRICK, Vertical/Horizontal families→LINES@90/0 with
  light/narrow/dark/wide density, Gravel/Sand/Earth/Clay/
  Concrete/Confetti→DOT_GRAVEL, Water/Swamp→WAVE, Forest/
  Grass→dense DOT_GRAVEL, N Percent→DOT_UNIFORM scaled by %.
- 19 specs incl. full-coverage check (every one of the 47
  names maps to a non-null Starr spec).

- New `lib/cad/io/trv-fill-patterns.ts`: the 47-entry ordered
  TPC fill list + a `tpcFillToStarr(name | index)` mapper to
  our 8 patterns with rotation/density hints:
  - `Diagonal /` → LINES @ 45°; `Diagonal \` → LINES @ 135°
  - `Cross` / `Diagonal Cross` → CROSSHATCH (0° / 45°)
  - `Brick` / `Brick Filled` → BRICK
  - `Gravel` / `Sand` / `Earth` → DOT_GRAVEL (density tuned)
  - `Light/Dark/Wide Vertical/Horizontal` → LINES @ 90°/0°
    with density from the light/dark/wide qualifier
  - `N Percent` → DOT_UNIFORM with density scaled by N
  - `Confetti` → DOT_GRAVEL
  - unmapped → NONE (round-trip preserved)
- Pure specs lock every name → pattern + rotation.

### Slice 4 — Round-trip: emit `28,15` + area on export ⏸ deferred 2026-06-01

Rationale: the lossless smart-merge serializer (`drawing-to-trv.ts`
Pass 4/5) already re-emits every source drawing-element record
(`28,15` / `28,14` / `29,...`) VERBATIM from `sourceTrv.lines`,
so a TRV imported → edited → exported retains its segment + area
labels byte-for-byte without any new code. The
`properties.trvSegmentLabels` / `trvAreaLabel` stamps from Slice
2 are for the RENDER path + a future fresh-export (no sourceTrv)
case. Fresh-export label emission is low-value until a surveyor
actually authors labels from scratch in Starr + exports to a
brand-new TRV — deferring until that workflow exists. No data
loss in the meantime: the round-trip path covers the realistic
import→edit→export case.

- `drawing-to-trv.ts`: when a feature carries
  `properties.trvSegmentLabels` / area metadata, re-emit the
  `28,15` / `28,14` blocks. Smart-merge keeps source labels
  verbatim; fresh export computes them.

## Guardrails

- Byte-equal round-trip stays green (Pass 5).
- Computed bearings continue to match TPC to the second.
- Every new decode falls back to opaque-preserve on ambiguity.

## TL;DR

Four slices: parse the `28,15`/`28,14` label records (1), apply
TPC's verbatim segment + area labels (2), map the 47 TPC fill
patterns to our infill options (3), round-trip the labels back
to TRV on export (4).
