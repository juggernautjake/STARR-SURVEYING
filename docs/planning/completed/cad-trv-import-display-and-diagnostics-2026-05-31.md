# CAD TRV import display + diagnostics fixes — 2026-05-31

*Follow-up to the closed-out TRV import/export plans. The user
imported a real Garland survey + hit three production issues:*

> *"None of the line data imported, and there were no new layers
> created. Nothing is on the page, but the point manager does
> show a lot of the points that were imported. … The little
> error pop up that appears has no way to copy the text. Now
> when I try and import the drawing data, it is saying that a
> lot of the points have errors and can't be included."*

## Reality (smoke-tested 2026-05-31 against the Garland sample)

The data IS importing — `parseTrv` + `trvToDrawing` produced
**19 layers (all visible) + 937 features (792 POINT + 11 POLYLINE
+ 8 POLYGON + 126 SPLINE)** with only 1 mapper note ("TELE PED —
fewer than 2 resolvable points; skipped"). The user's symptoms
come from rendering, not parsing:

- **Coords are in state-plane survey feet** (typical GNSS Texas:
  northing ~10,385,000; easting ~3,245,000). Our screen viewport
  is at the origin; features render 10 MILLION units off-screen
  — invisible.
- **`2,0,0,0` placeholder points** (records 1-4 + many `:2`
  duplicates) get mapped to features at `(0, 0)`, polluting any
  bounding-box-fit logic toward the origin.
- **No post-import auto-fit** — the importer leaves the viewport
  wherever it was; the user can't see what was added.
- **`alert()` strings are not copyable** — the user can read the
  diagnostic but can't paste it back for support.

## Slices

### Slice 1 — Skip `2,0,0,0` placeholder points + auto zoom-to-extents ✅ shipped 2026-05-31

- `mapPoint` skips a point whose coords are literally
  `(north=0, east=0, elevation∈{0, null})` + emits a
  `"Skipped placeholder point ..."` note so the import-confirm
  dialog tells the surveyor what happened.
- `mapTraverse` drops the same placeholder ids from the
  resolved-vertex chain so a `10,1` ref to a `2,0,0,0` point
  doesn't yank a polyline through (0, 0), which would render
  as visible spaghetti once the viewport auto-fits.
- `mergeSourceTrvWithDoc` treats placeholders as "preserved" not
  "deleted" so a fresh import → immediate export remains
  byte-equal.
- MenuBar's "Import TRV…" path now dispatches `cad:zoomExtents`
  after `addFeatures`, matching the Open path. Without this the
  state-plane survey (x ~3M, y ~-10M) lands 10 million units
  off-screen and the canvas looks empty.
- Tests: 5 new specs lock placeholder-skip behavior +
  real-Garland bbox no-longer-contains-origin + MenuBar fires
  zoom on both branches. Legacy specs that relied on
  `2,0,0,0` producing a feature were updated; Pass-9 / Pass-10
  count math is preserved because the merge serializer no
  longer treats placeholders as deletions.
- Full cad suite (2255) green; typecheck + lint clean.

### Slice 1 (rationale — original outline)

The mapper change in `lib/cad/io/trv-to-drawing.ts` is described
above. Original outline kept for reference.

- Mapper change in `lib/cad/io/trv-to-drawing.ts`: a point with
  `north === 0 && east === 0 && elevation === 0` (all three
  literally zero) is a placeholder record in Traverse PC (used as
  a "reserve this id" slot). Skip these in `mapPoint` AND in the
  point lookup used by traverses (so a 10/11 ref to such an id
  doesn't drag a polyline through the origin).
- MenuBar's TRV import paths fire `cad:zoomExtents` AFTER the
  layers + features are added (the .starr Open path already does
  this; the TRV path doesn't).
- Tests: pure mapper covers skip-on-zero + traverse-skip-ref;
  source-text spec on MenuBar's two TRV branches firing the
  zoom event.

### Slice 2 — Copyable error modal (replaces `alert()`) ✅ shipped 2026-05-31

- MenuBar's `loadError: FileLoadDiagnostic | null` state + a
  full-screen modal that renders:
  - red headline + meta line (filename, byte size, detected
    format, stage)
  - blue "Hint:" callout when the diagnostic carries one
  - `<textarea readOnly>` with the formatted diagnostic
    (selectable by the OS; auto-selects on focus)
  - "Copy to clipboard" button that runs
    `navigator.clipboard.writeText` + flashes "Copied!" for 2s.
    Fallback when the clipboard API is unavailable: focus +
    select the textarea so the user can ⌘C / Ctrl+C.
  - backdrop + Close button both call `setLoadError(null)`.
- All 4 prior `alert(formatFileLoadDiagnostic(diag))` call sites
  in MenuBar now call `setLoadError(diag)` instead.
- 8 source-text specs lock the state slot, the alert-removal,
  the testids, the readOnly textarea, the clipboard call, the
  "Copied!" confirm, the backdrop dismissal, and the hint
  callout.
- Full cad suite (2255) green.

### Slice 2 (rationale — original outline)

New modal component spec preserved above. Modal lives in
MenuBar inline rather than as its own component because it's
only consumed there + adding a separate file is more friction
than the inline JSX is worth.

- New `<FileLoadErrorModal>` component: takes a
  `FileLoadDiagnostic`, renders it in a `<pre>` plus a
  `<textarea readOnly>` (selectable by the OS) + a "Copy"
  button using `navigator.clipboard.writeText`. Mounts at the
  root + portals out so it can show over any other UI.
- MenuBar replaces every `alert(formatFileLoadDiagnostic(d))`
  call with `setLoadError(d)` + the modal reads from a
  zustand-store-or-local-state pair.
- Tests: rendered modal contains every diagnostic field +
  Copy button writes to a stubbed clipboard.

### Slice 3 — Survey-coordinate auto-fit / paper auto-size ✅ shipped 2026-05-31

- New pure module `lib/cad/io/trv-paper-fit.ts`:
  - `fitPaperToBounds(bounds, opts?)` walks LETTER → TABLOID →
    ARCH_C → ARCH_D → ARCH_E in both orientations, and at each
    paper walks the standard engineering scales (1, 5, 10, 20,
    30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 750, 1000,
    1500, 2000, 3000, 5000, 10000 ft per inch). Returns the
    smallest paper × smallest scale combination whose
    printable area (paper - 2×margin) covers the bbox, with
    the bbox centered on the sheet via `paperOriginWorld`.
  - `bboxOfFeaturePoints(features)` is a lightweight bbox
    computer that handles every relevant feature geometry
    (POINT / POLYLINE / POLYGON / LINE / MIXED / SPLINE / ARC /
    CIRCLE).
- MenuBar's two TRV import branches (Open route + dedicated
  Import TRV) now call a shared `maybeFitPaperToImportedFeatures`
  helper just before `cad:zoomExtents` is dispatched. The helper:
  - bbox's the imported features
  - picks the smallest standard paper + scale that fits
  - updates `paperSize` / `paperOrientation` / `drawingScale` /
    `paperOrigin` atomically
  - fills `titleBlock.scaleLabel` (`1" = N'`) only when it's
    currently empty (non-destructive, same policy as the
    metadata apply)
- 17 specs: smallest-paper selection across 4 bbox sizes,
  Garland-sample bbox fits a normal sheet, paper-centering math,
  null on degenerate / too-big bboxes, `candidateSizes` lock,
  bbox-of-features handles every geometry type, MenuBar wires
  helper into BOTH TRV branches, atomic settings update,
  non-destructive `scaleLabel` fill.
- Full cad suite (2272) green; typecheck + lint clean.

### Slice 3 (rationale — original outline)

The original outline below is preserved for reference. Note that
the optional "toast" was skipped — the import-confirm dialog
already shows the layer/point/traverse counts + notes; an
additional toast would duplicate that information.

- After a TRV import (when survey-coord features land far from
  the origin), compute the bbox of the imported features and
  (a) set the viewport center + zoom to fit with padding, AND
  (b) auto-size the paper to a sensible standard size for the
  survey's real-world extent (24x36, 30x42, 36x48, etc.) +
  auto-set the scale label (`1" = N'`).
- Optional toast: "Imported survey is in state-plane coords —
  fitted view to N points across W × H feet."
- Tests: bbox helper handles outliers; paper-size picker picks
  the smallest standard that fits.

## Guardrails

- Lossless round-trip stays byte-equal (Pass 5 specs guard).
- Skipped `2,0,0,0` points are NOT silently dropped on export —
  the smart-merge serializer's source-line walk re-emits them
  from the original `sourceTrv` so a round-trip preserves the
  TRV exactly.
- Every new feature-skip is logged to the mapper notes the user
  sees in the import-confirm dialog.

## TL;DR

Three slices: filter placeholder points + auto-zoom on import
(Slice 1, immediate visual fix), copyable error modal (Slice 2),
paper auto-size / coordinate auto-fit (Slice 3).
