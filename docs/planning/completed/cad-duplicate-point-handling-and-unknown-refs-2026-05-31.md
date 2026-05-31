# CAD duplicate-point handling + unknown refs — 2026-05-31

*User ask:*

> *"Make sure we can account for unknown points, and also
>  account for duplicate points on the same layer and on
>  different layers. We need to be able to handle duplicate
>  points and manage them well. If we have a point 23 on one
>  layer and another point 23 on another layer, then the second
>  point 23 might become 23:1 or something. We will need to
>  track it and handle point duplication well."*

## Today's reality (audit, 2026-05-31)

- `lib/cad/import/validation.ts` flags same-pointNumber sets as
  a `DUPLICATE_POINT_NUMBER` WARNING (Slice 1 just collapsed
  these into ONE warning per group). No auto-rename.
- `lib/cad/import/import-pipeline.ts` builds `SurveyPoint`s
  with whatever `pointName` came in from the parser. Collisions
  pass through unchanged; the surveyor sees a warning + has to
  resolve manually.
- `lib/cad/io/trv-to-drawing.ts` already preserves TRV's own
  `:N` convention (the Garland sample uses `20fnd:1` for the
  duplicate of `20fnd`) — round-trips intact. But our import
  pipeline doesn't ADOPT that convention for new collisions.
- "Unknown point" — no dedicated concept. The TRV traverse
  mapper emits a `Traverse "X" — missing point "Y"` text note
  when a `10,<ref>` points at an undefined id, but it isn't a
  structured issue type the UI can pivot on.

## Slices

### Slice 1 — Pure deduper for cross-layer + same-layer collisions ✅ shipped 2026-05-31

- `lib/cad/import/dedupe-points.ts`:
  - `dedupePointNumbers(points)` — returns `{ renamed, renames }`.
    First occurrence keeps the bare name; later occurrences get
    `:1`, `:2`, ... appended. The next free `:N` is picked so
    a source that already has `23` + `23:1` keeps both and a
    new dup steps to `:2`.
  - Per-rename log carries `surveyPointId`, `fromName`,
    `toName`, `baseLayerId`, `thisLayerId`, and a `kind` tag
    (`SAME_LAYER` | `CROSS_LAYER`).
  - `originalPointName` stamped on every renamed entry so the
    UI can show `23 → 23:1` lineage.
  - `formatRenames(renames)` pretty-prints the log for the
    import-confirm dialog + Copy button.
- 10 specs lock the rule set: clean set untouched, same-layer
  rename, cross-layer rename with kind tag, 4-way collision
  counts to `:3`, source already using `:1` skips to `:2`,
  source order preserved, originalPointName stamping, and the
  user's extreme 20-occurrences case.
- Pure module, no DOM / React / store deps. Pipeline + TRV
  mapper integration tracked in Slices 2-4.

Full cad suite (2318) green; typecheck + lint clean.

- New `lib/cad/import/dedupe-points.ts`:
  - `dedupePointNumbers(points: SurveyPoint[]): { renamed: SurveyPoint[]; renames: PointRename[] }`
  - For each `pointNumber` with > 1 occurrence: the FIRST
    occurrence keeps the bare name; later occurrences get
    `:1`, `:2`, ... appended (matching Traverse PC's own
    convention).
  - Cross-layer collisions tagged `kind: 'CROSS_LAYER'` in the
    rename log; same-layer collisions tagged `kind: 'SAME_LAYER'`.
  - `originalPointName` on each renamed entry preserves the
    pre-dedupe name so the UI / export can show "23 → 23:1".
- Tests: same-layer collision renamed; cross-layer collision
  renamed; non-collisions untouched; rename log enumerates
  every change with its `kind`.

### Slice 2 — Unknown-point-reference issue type ✅ shipped 2026-05-31

- `ValidationIssueType` extended with `UNKNOWN_POINT_REFERENCE`.
- New pure module `lib/cad/import/unknown-refs.ts`:
  - `findUnknownPointRefs(points, lineStrings)` — every LineString
    that references a point id not in the points list yields one
    WARNING issue with the line-string id in `pointId` (so the UI
    can link back to the affected feature) and the missing ref +
    code base in the message.
  - `findOrphanPoints(points, lineStrings)` — INFO-level companion
    that flags points NOT referenced by any line string. Useful
    for QA of multi-system exports. Opt-in.
- Validator integrates `findUnknownPointRefs` so the field-data
  Validate step lists every dangling ref as a structured issue
  alongside the other warnings.
- 6 new specs cover: clean set → no issues; per-ref WARNING
  emission; message format; pointId routing to the line-string
  id; orphan-point INFO detection; validator integration.
- Full cad suite (2324) green; typecheck + lint clean.

- Extend `ValidationIssueType` with `UNKNOWN_POINT_REFERENCE`.
- New helper `findUnknownPointRefs(points, lineStrings)` walks
  every LineString.pointIds (uuid) + every line of `rawRecord`
  that mentions a numeric point name we don't have, and emits a
  structured issue (severity = ERROR for traverse refs, WARNING
  for line-string refs).
- TRV mapper's "missing point" note gets re-classified as
  `UNKNOWN_POINT_REFERENCE` so the import-confirm dialog can
  group + count them.
- Tests: refs to absent ids → issue; clean references → no
  issue; the issue carries the missing ref + the source feature
  so the UI can link back.

### Slice 3 — Wire dedupe + unknown-refs through the import pipeline ✅ shipped 2026-05-31

- `processImport` now runs `dedupePointNumbers` immediately after
  the point-parsing loop + before line-string building. Colliding
  pointNumbers land as `23` / `23:1` / `23:2` ... with the
  `SurveyPoint.id` (uuid) preserved so existing LineString refs
  remain valid.
- `ImportResult` carries `pointRenames: PointRename[]` so the
  Validate step can show "N points auto-renamed" + offer the full
  list via the Copy button.
- The existing `DUPLICATE_POINT_NUMBER` warning still fires once
  per collision group (the surveyor wants to KNOW about
  collisions even after we auto-resolve their names) — but it's
  one warning per group, not per occurrence (Slice 1 of the
  earlier dedup-and-copy work).
- 5 specs cover: clean set → empty renames; same-layer collision
  rename; cross-layer collision rename; existing DUPLICATE
  warning still fires once per group; downstream line-string refs
  remain valid through the rename.
- Full cad suite (2329) green; typecheck + lint clean.

- `processImport` runs `dedupePointNumbers(points)` after the
  initial parse + uses the renamed `pointName` going forward.
- `ImportResult` carries `pointRenames: PointRename[]` so the
  Validate step can show "N points were auto-renamed
  (cross-layer collision)" with the full list available via
  the Copy button.
- The validator's DUPLICATE_POINT_NUMBER check runs against
  the POST-dedupe set — any remaining duplicates are real
  bugs the deduper couldn't resolve (shouldn't happen, but
  catches future regressions).
- Tests: pipeline integration with a 3-collision fixture +
  the renames flow through to the result.

### Slice 4 — TRV mapper applies the same dedupe convention ✅ shipped 2026-05-31

- New `lib/cad/io/dedupe-trv-features.ts` (pure):
  - `dedupeTrvFeaturesAgainstDrawing(newFeatures, existingFeatures)`
    walks every POINT in `newFeatures`, checks each
    `properties.trvPointId` against the drawing's existing set,
    and renames colliders using the next free `:N` suffix.
  - Skips suffixes already in use (so a drawing with `23` +
    `23:1` makes a new `23` step to `23:2`).
  - Tracks intra-import duplicates against the same usedIds
    set so a single import containing `23` twice resolves
    cleanly (`23` + `23:1`).
  - Non-POINT features (polylines / polygons / arcs / splines)
    pass through untouched.
  - Records `originalTrvPointId` on the renamed feature so
    the UI can show lineage.
  - Returns a `PointRename[]` log matching Slice-1's shape,
    with `SAME_LAYER` / `CROSS_LAYER` kind tagging.
- MenuBar's two TRV import branches (Open route + dedicated
  Import TRV) call the helper just before `addFeatures` and log
  the rename count via cadLog.
- 11 specs lock: empty-drawing pass-through; cross-layer
  rename + kind; same-layer rename + kind; existing `:1` skips
  to `:2`; intra-import duplicate resolution; non-POINT
  pass-through; originalTrvPointId stamping; POINT without
  trvPointId pass-through; MenuBar wires the helper into BOTH
  branches; addFeatures consumes the deduped output.
- The legacy `trv-io` source-text assertion that locked the raw
  `addFeatures(report.mapped.features)` shape updated to the
  new `addFeatures(dedupedOpen|Import.features)` form.
- Full cad suite (2340) green; typecheck + lint clean.

## Status

All four slices shipped. Plan doc moves to `completed/`.

- TRV import's `trvToDrawing` already preserves source `:N`
  ids. When OUR auto-rename creates new `:N` collisions (e.g.
  the source had `23` + `23:1`, we add a new point `23` that
  collides with the original), the deduper picks the next
  available `:N`.
- Same-layer vs cross-layer handling is identical inside the
  TRV layer hierarchy.

## Out of scope

- Re-numbering globally (the user explicitly wants tracking,
  not renumbering 1..N).
- Manual conflict resolution UI (per-point override list) —
  deferred until the auto-rename proves insufficient.

## TL;DR

Four slices: pure deduper (1) + structured unknown-ref issue
(2) + pipeline integration (3) + TRV mapper coverage (4).
Slice 1 is the foundation everything else builds on.
