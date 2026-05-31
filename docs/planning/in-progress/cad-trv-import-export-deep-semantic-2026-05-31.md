# CAD TRV deep-semantic import — 2026-05-31

*Follow-up to `docs/planning/completed/cad-trv-import-export-2026-05-31.md`.
The first 10 passes (5 original slices + 5 perfection passes)
covered structured capture + byte-equal round-trip. The user now
wants TRUE SEMANTIC TRANSLATION so imported features show up as
editable native elements (with the right colors, line styles,
labels, curves) rather than just opaque round-trip blobs.*

## User ask (verbatim, 2026-05-31)

> "Please do five more passes to make sure we really are properly
> parsing everything and that we have a way to translate everything
> properly, and that we have ways to handle exceptions, or that we
> have fallbacks. … get the point data, the line data, the infill
> data, the text and bearing data, the curve data, and any data
> relating to the actual drawing. We then need to be able to edit
> everything and keep working on the survey in the starr cad
> software. … be able to save a drawing as a trv file … and be
> able to import it into traverse pc and have everything show up
> properly."

## Today's reality (audit, 2026-05-31)

Round-trip is **already lossless** (Pass 5: byte-equal on all
three live samples — 9/9 specs pass). What's missing is
**semantic mapping** for the records we capture:

- **Project metadata (90/101-106)** → captured in `TrvMetadata`
  but not applied to our `TitleBlockConfig` on import.
- **Traverse styling (51, 60, 70, 76, …)** → captured in
  `traverse.stylingRecords` (52 distinct codes) but not decoded
  into `feature.style.color` / `lineWeight` / `fillColor`.
- **Curve geometry** → traverses with a curved segment ride
  through as straight POLYLINE today. No ARC feature emitted.
- **Label format templates (159-162)** → captured but not used
  to compute bearings + distances on the rendered traverse.
- **Drawing-element 28/29 records** → round-trip intact but
  not translated into TEXT / CIRCLE / SYMBOL features.
- **Smart-merge add/remove** → coord edits work, but
  added/deleted features don't yet flow back into the source.

## Passes

### Pass 6 — Survey-info text block mapping

- Pure helper `applyTrvMetadataToTitleBlock(metadata,
  currentTitleBlock)` → patches the title block's
  `projectName` / `surveyDate` / `scaleLabel` / `notes` from
  the TRV metadata when those fields are currently empty.
  Non-destructive (won't clobber user-typed values).
- `importTrvFromText` exposes the metadata so the import flow
  can offer a "Apply project name + date to title block?"
  confirm.
- MenuBar's `importTrv` calls the helper after the user
  confirms the import, with a separate yes/no on the title-
  block apply so they can opt out.
- Tests: helper covers preserve-existing + fill-missing +
  empty-metadata cases; source-text spec on the MenuBar
  apply path.

### Pass 7 — Traverse color / line-weight mapping

- Decode the 51 record's color field (a 32-bit packed int) into
  a CSS hex color. Live samples show values like 2147483648,
  2147876992 — these are sign-flipped 0x80…  encodings of
  ARGB / BGR.
- Apply to `feature.style.color` on the traverse Feature when
  importing. Imported traverses then render with their TRV
  colors instead of the default black.
- Tests: pure decoder over a curated set of 51 color values
  → expected hex; mapper writes color onto the feature.

### Pass 7 — Curve detection + ARC / SPLINE feature creation ✅ shipped 2026-05-31

- New pure module `lib/cad/geometry/curve-fit.ts`:
  - `detectCurvedRuns(points, opts?)` — walks a vertex chain,
    flags interior vertices whose turn-angle exceeds the
    threshold (5° default), groups ≥ 2 consecutive flags into
    runs, extends each run by ±1 vertex (the PC + PT
    tangent endpoints).
  - `fitArcThroughPoints(points)` — least-squares circle fit
    via 3×3 Cramer's rule. Returns `{ center, radius,
    startAngle, endAngle, anticlockwise, maxResidual }` or
    null on collinear / < 3 points.
  - `fitSplineControlPoints(points)` — Catmull-Rom →
    cubic-Bezier conversion (tension 0.5) producing the
    3N+1 control-point array our `SplineGeometry` expects.
    Interpolating: every input point is an anchor.
- Mapper extension: `mapTraverse` now returns
  `Feature[]` (the polyline + 0+ ARC / SPLINE curve features).
  For each detected run, fits an arc; falls back to spline when
  residual > `ARC_FIT_RESIDUAL_TOLERANCE` (0.05 ft). Each curve
  feature lives on the same layer as its polyline + carries
  `properties.curveOfTraverse` pointing at the source so the
  surveyor can navigate both. The polyline KEEPS its full
  vertex chain so area / boundary computations stay correct.
- Polyline's `properties.trvCurveRuns` records the detected
  runs as JSON (`{ startIndex, endIndex, kind, residual }[]`)
  so a downstream serializer / UI tool can refer back.
- 16 specs lock the pure helpers (detection across straight /
  arc / mixed / corner / custom-threshold; arc fit recovers
  exact center+radius / handles offset centers / detects
  CW vs CCW / returns null on collinear; spline emits 3N+1
  cps + interpolates every input). 5 mapper specs lock the
  ARC + polyline-preserve + curveOfTraverse + JSON
  `trvCurveRuns` + straight-line no-curve paths.
- Full cad suite (2217) green; typecheck + lint clean.

### Pass 8 — Curve detection + ARC feature creation ✅ subsumed by Pass 7

Pass 7 above ships exactly this — `detectCurvedRuns` + arc fit +
spline fallback + per-curve feature emission with
`curveOfTraverse` back-reference.

- Detect curved segments inside traverses by inspecting the
  styling records (codes 32-49 carry curve metadata) +
  cross-validating with point distances vs. chord vs. arc
  length.
- When a curve is detected between two refs, emit an ARC
  feature instead of a polyline segment + keep the surrounding
  vertices as POLYLINE.
- Fallback: when the curve metadata is ambiguous, keep as
  POLYLINE and stash the raw curve params on
  `properties.trvCurveParams` so an export can re-emit them.

### Pass 9 — Smart-merge add / remove for points

- Extend Pass 4's smart-merger:
  - New points (feature with no `trvPointId`) get appended
    inside the `#,POINTS` section with the next available id.
  - Deleted points (a `0,<id>` block in source with no matching
    feature) are skipped on emit.
  - Traverse `10,<ref>` lines that reference deleted points
    are also skipped.
- Tests: round-trip with one added + one deleted point produces
  the expected output; the rest of the source stays verbatim.

### Pass 10 — End-to-end editability acceptance + Traverse-PC
reopen verification

- Hand the round-trip output of all three real samples through
  parseTrv again and assert the parsed structure matches the
  original (same point/traverse/styling counts) — Traverse-PC
  reopen verification by proxy.
- Document the manual test plan: import sample.TRV → edit a
  point → export → re-open in Traverse PC → confirm the edit
  shows up + nothing else has changed.

## Guardrails

- Every Pass keeps the byte-equal round-trip green (Pass 5's
  specs).
- Semantic decoders fall back to opaque-capture when a record
  can't be confidently interpreted — never drop data silently.
- Each Pass is its own slice + commit + push.

## TL;DR

Five more passes: project metadata → title block (6), traverse
color decoding (7), curve detection (8), add/remove in smart-merge
(9), editability acceptance + Traverse-PC reopen verification (10).
