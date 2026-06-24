# AI Research Initiation — Build-Out & Mobile

**Status:** 🟡 In progress — project creation + pipeline trigger exist but the
"start analysis" action is buried, progress isn't mobile-friendly, and results/
export are incomplete.

## How this doc is driven

Stop-hook driven: next unchecked slice → read live code → smallest shippable
change → typecheck + lint + commit + push → check box + note. All `[x]` → move to
`completed/`. Keep desktop intact; verify mobile at 390px.

## Current state (verified 2026-06-24)

- List/create: `app/admin/research/page.tsx` ("+ New Research Project" → parcel
  id + address + county + notes → POST `app/api/admin/research`). Project hub:
  `app/admin/research/[projectId]/page.tsx`.
- Trigger: `handleInitiateResearch()` → POST `app/api/admin/research/[projectId]/pipeline`
  with documents + config; client polls status (2–5s). Stages: upload → configure
  → analyzing → review → drawing → verifying → complete.
- Gaps: the run/initiate control is buried inside `PropertySearchPanel` and varies
  by stage; no clear mobile progress UI; no finalized results/export surface.

## Slice plan

- [x] **R1 — Clear "Start / Re-run analysis" action.** Surface a single, always-
  visible primary action on the project page to initiate (or re-run) the AI
  pipeline, with a disabled/explained state when prerequisites (e.g. documents)
  are missing. Don't make the user hunt by workflow stage.
  _Done 2026-06-24:_ added an always-visible **action bar** directly under the
  pipeline stepper whose label/behavior derives from `project.status`: pre-analysis
  → **"Start AI analysis"** (calls a new `handleStartAnalysis` that mirrors Stage 1's
  initiate — seeds search params, flags auto-start, moves to the research stage so
  `ResearchRunPanel` fires on mount), **disabled with an explanation** when there's
  no address/parcel id and no document; while running → a spinner + "analysis is
  running" note; post-analysis → **"Re-run analysis"**. The re-run confirm dialog was
  lifted from the Review block to the top level so it works from the action bar in
  any stage. Added `.research-action-bar` styling (44px button, full-width on
  phones). tsc + lint clean. _Note: the `[projectId]` page is a dynamic, project-
  stateful route not mountable in the ux-harness like the list page, so this reuses
  the already-proven initiate/re-run code paths and is verified by typecheck/lint +
  review rather than a 390px screenshot._
- [x] **R2 — Mobile new-project + upload.** Make the "+ New Research Project"
  form and the document upload usable at 390px (stacked fields, tap-friendly file
  input/drop area, no overflow). Verify via `ux-harness?page=research`.
  _Done 2026-06-24:_ audited at 390px in the harness — the create modal already
  renders well (358px wide, full-width stacked fields, 45px inputs, City/ZIP +
  County/State 2-col rows fit, 0px overflow) and the list header buttons/status
  chips wrap cleanly with 0 overflow, so no layout changes were needed there. For
  the document upload (project-page `DocumentUploadPanel`): the dropzone is already
  a large tap target that opens the native picker on tap (`accept` covers PDF/
  images/HEIC/DOCX, `multiple`), so the only fix was making the copy touch-aware —
  "**Tap to add files — or drag & drop**" instead of "click to browse". Verified
  list + modal at 390px (screenshots, 0px overflow). tsc + lint clean.
- [x] **R3 — Live progress UI.** Show a clear stage + percentage progress bar and
  status message while the pipeline runs; harden the polling for mobile
  backgrounding (resume on focus) or move to a Supabase Realtime subscription on
  the project row. A finished run shows a clear "complete" state.
  _Done 2026-06-24:_ added a **determinate progress bar** to `ResearchRunPanel`
  driven by the existing micro-stage model — `progressPct` maps the current stage's
  index across the 8 `MICRO_STAGES` (clamped 6–96% while running, pinned 100% on
  success), with a "step N of 8" label, a gradient fill (blue running → green done
  → red failed) and an accessible `role="progressbar"`. The existing spinner /
  headline / elapsed timer / animated message / "Research Complete" state stay.
  Mobile backgrounding hardening: a `visibilitychange` listener fires an **immediate
  catch-up `pollStatus()` + document fetch** when the tab returns to foreground (phone
  browsers throttle/suspend `setInterval` when hidden), so progress re-syncs on
  return instead of showing stale state. tsc + lint clean. _(Project-page dynamic
  route, not harness-mountable — verified by typecheck/lint + review; reuses existing
  poll plumbing.)_
- [x] **R4 — Results & export.** When analysis completes, give one place to review
  outputs and export (PDF / drawing / data) without hopping across subpages.
  _Done 2026-06-24:_ the Review stage is already the single review surface (summary
  + property/survey/easements/discrepancies/artifacts tabs); added a consolidated
  **export bar** at the top of it with four one-click actions: **Data (CSV)** and
  **Data (JSON)** (client downloads of the extracted `data_points` — category,
  display/raw value, unit, source page, confidence, excerpt — disabled until data
  exists), **Print / PDF** (`window.print()`, which uses the page's existing print
  stylesheet), and **Drawing & CAD →** (routes to Job Prep where the existing
  `ExportPanel` handles PDF/DXF/SVG drawing export). So data + printable results are
  exportable right where you review them, with a clear path to the drawing export.
  44px touch targets, full-width buttons on phones. tsc + lint clean. _(Project-page
  dynamic route — verified by typecheck/lint + review.)_
- [ ] **R5 — Findability.** Ensure "Research" / "Start research" is an obvious
  entry point (nav + hub/command-palette) and the list page reads well on mobile.
