# CAD multi-error report modal — 2026-05-31

*User ask after the cad-import-validation-dedup-and-copy work:*

> *"Please create a new type of modal for the error display. It
>  should be able to report multiple errors and bugs. The modal
>  needs to allow for copying the error/bug text in full."*

## Today's reality (audit, 2026-05-31)

- The cad-trv-import-display Slice 2 modal in `MenuBar.tsx`
  takes a SINGLE `FileLoadDiagnostic`. Copyable, but only one
  diagnostic at a time + only triggered from the file-open path.
- The ImportDialog ValidationStep Copy buttons are scoped to
  the field-data import wizard's Validate step (separate
  surface).
- There's no shared "anywhere in the app" error-report channel
  the user can come back to + see what failed during a session.

## Slices

### Slice 1 — Global error-report store + multi-entry modal ✅ shipped 2026-05-31

- New `lib/cad/store/error-report-store.ts` (zustand): `entries`,
  `open`, `report(entry)` (returns id + flips open=true),
  `dismiss(id)`, `clear()`, `setOpen(bool)`. Newest entries
  first. `formatEntries(entries)` pretty-prints the full list
  for the Copy-all button.
- New `lib/cad/io/error-report.ts`: `reportFileLoadError(diag)`
  bridges the existing `FileLoadDiagnostic` into a single ERROR
  entry; `reportError({ title, body, severity?, hint? })` is
  the generic push.
- New `app/admin/cad/components/MultiErrorModal.tsx`: header
  with entry count + Copy-all + Clear-all + close × button.
  Each entry rendered as a collapsible row with severity icon,
  title (`user-select: text`), per-entry Copy + Dismiss
  buttons, and an expanded readOnly `<textarea>` showing the
  full body. clipboard API + execCommand fallback.
- CADLayout mounts `<MultiErrorModal />` once at the root.
- MenuBar's four file-load failure paths now call
  `reportFileLoadError(diag)` instead of the inline single-
  error modal. The inline modal state + JSX block is retired.
- 22 specs across error-report-store + multi-error-modal +
  the bridge helper.
- Full cad suite (2308) green; typecheck + lint clean.

### Slice 1b — Outlier-resistant bbox for paper auto-fit ✅ shipped 2026-05-31

Follow-up triggered by user report: "viewing functionality
still seems like it isn't adjusting to the scale." Diagnostic
showed Garland's POINT bbox was 13,167 × 10,020 ft (one or two
stray GPS shots) while the actual survey is 619 × 273 ft —
the paper picker correctly fitted ALL points but ended up at
ARCH_E + 2000 ft/in.

- New `bboxOfFeaturePointsRobust(features, opts?)` in
  `trv-paper-fit.ts` drops points outside the [pLo, pHi]
  percentile range (default 1st-99th) before bounding. The
  surveyor's actual lot now determines the paper, not the
  outliers. Zoom-extents still uses the strict bbox so the
  user can pan to outliers.
- MenuBar's `maybeFitPaperToImportedFeatures` switched to the
  robust variant.
- Garland sample now lands on TABLOID-or-smaller at ≤ 200
  ft/in (locked by integration spec).
- 4 new integration specs against the real Garland file.

- New `lib/cad/store/error-report-store.ts` (zustand):
  - `entries: ErrorReportEntry[]` (newest first)
  - `report(entry)` pushes
  - `clear()` empties
  - `dismiss(id)` removes one
  - `setOpen(bool)` + `open` flag
- New `app/admin/cad/components/MultiErrorModal.tsx`:
  - Renders a header with the entry count + "Clear all" + "Copy
    all" + Close.
  - Each entry shown as a collapsible row with severity icon,
    title, timestamp, and (when expanded) a readOnly `<textarea>`
    showing the full body + a per-entry Copy button.
  - All text is `user-select: text` so highlight-copy works.
- New `lib/cad/io/error-report.ts` — tiny helpers:
  - `reportFileLoadError(diag)` converts the existing
    `FileLoadDiagnostic` into an entry + pushes via the store.
  - `reportError({ title, body, severity?, hint? })` for any
    other site that wants to surface a bug.
- MenuBar's file-load failures now push into the store +
  call `useErrorReportStore.setState({ open: true })` instead
  of using the inline single-error modal. The inline modal
  code is retired in the same change.
- CADLayout mounts `<MultiErrorModal>` once at the root so any
  store push opens it.
- Tests:
  - Pure store: push / dismiss / clear / open.
  - reportFileLoadError builds the entry correctly.
  - MultiErrorModal source-text: testids, Copy all, per-entry
    Copy, collapse/expand, dismiss, readOnly textarea.

## TL;DR

One slice. Build a global error-report store + a multi-entry
modal mounted at the layout root; route the file-load errors
through it so the user gets ONE place to see + copy every
error from the session.
