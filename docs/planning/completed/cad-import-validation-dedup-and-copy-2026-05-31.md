# CAD field-data import validation + copy — 2026-05-31

*User report after the cad-trv-import-display work landed —
re-running the Field Data import wizard surfaced:*

> *"132 Errors: Point N has zero northing or easting" (repeated 132×)*
> *"3181 Warnings: Duplicate point number 31 (20 occurrences)"
>   (the SAME line appears dozens of times)*
> *"I am still not able to copy the errors. I need a copy errors
>   button or a way to highlight and copy the error text."*

## Today's reality (audit, 2026-05-31)

- `lib/cad/import/validation.ts` has TWO independent bugs feeding
  the noise:
  - **Duplicate dedup bug** (lines 35-46): for each duplicate
    group, the code emits **one issue per duplicate occurrence**,
    every one with the same `"Duplicate point number 31 (20
    occurrences)"` message. 159 distinct duplicate ids × ~20 =
    3181 warnings, all dupes of dupes.
  - **Zero-coord over-broad rule** (lines 50-60): fires when
    `north === 0 || east === 0`. TRV placeholders have `north
    === east === 0` (legitimate "reserve this id" records);
    they should be a single aggregated WARNING, not 132
    individual ERRORs. A point with only ONE axis zero is
    suspicious — that should stay a per-point ERROR.
- `ImportDialog.tsx` `ValidationStep` (lines 484-533):
  - No copy button — issues render as plain divs.
  - Each issue div is in a styled background block; default
    `user-select` rules let you select but the column gap +
    multi-row select gets awkward.
  - Truncates to first 20 per group with "…and N more" — the
    extra entries are invisible to the user, so even manual
    copy can't retrieve them.

## Slices

### Slice 1 — Validation dedup + zero-coord triage ✅ shipped 2026-05-31

- `validatePoints` rewritten:
  - **Duplicates**: emit ONE issue per duplicate group (not
    per occurrence). `pointId` points at the first duplicate
    so the preview highlight still lands. Add
    `affectedPointIds` so the UI can show all of them on click.
  - **Zero coords**: split into two paths:
    - Both N and E are zero (and the point's pointName matches
      a placeholder pattern, or unconditionally on `(0,0)`):
      one aggregated WARNING ("N points have placeholder zero
      coordinates — these will not be plotted").
    - Only one axis zero (rarer, suspicious — possible export
      bug or partial-coord row): keep as per-point ERROR.
- 132 errors → 0-or-few errors plus 1 aggregated warning;
  3181 warnings → 159 warnings (one per dup id).
- Tests: pure validator covers (a) dedup count = distinct dup
  ids, (b) two-axis-zero aggregates, (c) one-axis-zero stays
  per-point ERROR.

### Slice 2 — Copyable validation issues + per-group Copy button ✅ shipped 2026-05-31

- Each issue row gets `user-select: text` so highlight + Ctrl+C
  works.
- Each severity group's heading gets a "Copy" button that
  copies ALL of that group's messages (not just the first 20
  rendered) as text to the clipboard via
  `navigator.clipboard.writeText`. Confirmation flash "Copied!"
  for 2 s. Fallback when the clipboard API is unavailable:
  build a hidden textarea, select, document.execCommand('copy').
- The "…and N more" hint now reads "…and N more (use Copy to
  see them all)" so the user knows the data isn't lost.
- Tests: source-text spec on the Copy button per group +
  user-select style + click-to-copy handler call.

## Out of scope

- Auto-fixing duplicates / placeholders during import — risky
  default; we surface the issues + let the surveyor pick.
- Validation-step search / filter — deferred; the Copy button
  + scroll list cover the immediate ask.

## TL;DR

Two slices — fix the validator's dedup + zero-coord triage so
the message list drops from 3313 entries to ~160 + 1, and add
a Copy button per severity group with selectable text so the
surveyor can paste the entries back into a support thread.
