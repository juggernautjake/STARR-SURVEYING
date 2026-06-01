# TRV dual-layer points, file-named layers, unsaved-changes guard — 2026-06-01

> **STATUS: COMPLETE (2026-06-01).** All three slices shipped.
> Slice 1 (file-named layers) + Slice 2 (point mirrors on both
> layers) committed together; Slice 3 (unsaved-changes guard:
> Save / Don't Save / Cancel wired into New / Open / Import /
> leave-page + the existing beforeunload backstop). Full cad suite
> green (2477), typecheck + lint clean.

*User:*

> *"The points should also be in the trv drawing layer with all of
> the lines and stuff, but I want the duplicate layer, TRV:MISC -
> Points that just has the points. Make sure that the points are
> included on both layers. Make sure everything renders
> appropriately. Also, whenever I import a drawing, such as a trv
> file, the layers related to the imported file need to use the
> name of the file for the layer rather than just 'TRV'. Also, if I
> am working on a drawing or have imported a drawing, and then I
> attempt to exit the program or leave the cad page, or open or
> import another drawing or points file, or start a new drawing, it
> needs to alert me and ask if I would like to save the current
> drawing, that is, if I haven't saved the drawing since the last
> change was made or since it was opened/imported."*

## Audit (2026-06-01)

- **TRV import builds two synthetic layers** in
  `lib/cad/io/trv-to-drawing.ts → trvToDrawing()`:
  `${prefix} — Drawing` (POLYLINE/POLYGON/ARC) and
  `${prefix} — Points` (POINT). `prefix` = `trvLayerPrefix(doc)` =
  `TRV: ${projectName}` or `TRV Import`. POINTs land ONLY on the
  Points layer today.
- **Round-trip** (`lib/cad/io/drawing-to-trv.ts`): a "fresh"
  serializer (`drawingToTrv`) filters `type === 'POINT'` and emits
  one block each + a `95,N` count; a "smart-merge" serializer
  (`mergeSourceTrvWithDoc`) patches/deletes/adds by `trvPointId`.
- **Import dedupe** (`lib/cad/io/dedupe-trv-features.ts →
  dedupeTrvFeaturesAgainstDrawing`): renames colliding `trvPointId`
  within the batch + against the existing drawing.
- **Import wiring** (`MenuBar.tsx`): `openFileDialog` (Open) +
  `importTrv` (Import) both call `importTrvFromText(text)` then
  `addLayer`/`addFeatures`. `file.name` is in scope at both sites.
- **Dirty tracking already exists**: `useDrawingStore().isDirty`
  flips true on every mutation, false on `loadDocument`/`newDocument`/
  `markClean`. `useUnsavedChangesGuard()` registers a native
  `beforeunload` (covers tab-close / refresh / address-bar) and
  returns an UNUSED `guard(action)` helper. The discard actions
  (New / Open / Import) are NOT guarded today, and client-side nav
  away from /admin/cad isn't caught by beforeunload.

## Slices

### Slice 1 — File-named import layers

- `trvToDrawing(doc, opts?: { layerPrefix?: string })` — when
  `layerPrefix` is given, use it verbatim as the prefix; else fall
  back to `trvLayerPrefix(doc)` (projectName / "TRV Import").
- `importTrvFromText(text, opts?: { fileName?: string })` — derive
  the prefix from the file's base name (strip directory +
  extension) and pass it through as `layerPrefix`.
- `MenuBar.openFileDialog` + `importTrv` pass `{ fileName: file.name }`.
- Tests: trvToDrawing honors `layerPrefix`; importTrvFromText turns
  `Smith Boundary.TRV` → `Smith Boundary — Drawing/Points`; default
  (no opts) is unchanged.

### Slice 2 — Points on BOTH layers (Drawing mirror + Points)

- In `trvToDrawing`, after the points land on the Points layer,
  ADD a render-only MIRROR of each point on the Drawing layer:
  `{ ...pt, id: '${pt.id}:draw', layerId: drawingLayerId,
     properties: { ...pt.properties, trvPointMirror: true } }`.
  Result: Points layer = just the points; Drawing layer = lines +
  point mirrors → "everything".
- Keep round-trip emitting each point ONCE:
  - `drawing-to-trv.ts` fresh path: filter `!trvPointMirror` when
    collecting points (count + blocks).
  - `mergeSourceTrvWithDoc`: skip `trvPointMirror` when building
    `featuresByTrvId` (canonical point owns its slot); the adds loop
    is already safe (mirrors keep `trvPointId`).
- `dedupeTrvFeaturesAgainstDrawing`: skip `trvPointMirror` features
  (pass through untouched, don't pollute the used-id set).
- Tests: trvToDrawing puts points on BOTH layers (mirror flagged);
  drawingToTrv round-trip point count excludes mirrors; deduper
  leaves mirrors untouched.

### Slice 3 — Unsaved-changes guard (Save / Don't Save / Cancel)

- New `useUnsavedGuardStore` (zustand) holding a pending action +
  open flag, and a `UnsavedChangesModal` rendered in CADLayout with
  three buttons: **Save** (dispatch `cad:saveDocument`, then run the
  pending action once `isDirty` flips false — bounded watcher +
  timeout, so silent local + async cloud + first-time Save dialog
  all behave), **Don't Save** (run pending action now), **Cancel**.
- `requestDiscard(action)`: runs `action` immediately when clean;
  else opens the modal with `action` pending.
- Wire `requestDiscard` into every discard entry point:
  - New Drawing (MenuBar) + the startup NewDrawingDialog Create /
    Import buttons.
  - Open file (`openFileDialog`) + Import field data (ImportDialog
    open) + Import TRV (`importTrv`).
  - Client-side navigation away from /admin/cad — capture-phase
    `<a>` click interceptor (best-effort; beforeunload still covers
    hard exits).
- Keep the existing native `beforeunload` guard for tab-close /
  refresh.
- Tests: store runs action immediately when clean, defers when
  dirty; Save path fires the pending action after markClean;
  Don't-Save fires immediately; Cancel never fires.

## Out of scope / notes

- Point mirrors are render echoes: editing a point on one layer
  doesn't move its twin. The dedicated Points layer is for label
  control; the Drawing layer keeps points visible alongside the
  linework. Documented for the user.
- The link-click nav interceptor is best-effort; programmatic
  `router.push` from other components won't be caught (rare on this
  page). beforeunload remains the backstop for hard exits.

## TL;DR

TRV layers take the imported FILE's name; points render on BOTH the
Drawing layer (with the lines) and the dedicated Points layer; and
any discard action (New / Open / Import / leave page) prompts to
save first when there are unsaved changes.
