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
- [ ] **R2 — Mobile new-project + upload.** Make the "+ New Research Project"
  form and the document upload usable at 390px (stacked fields, tap-friendly file
  input/drop area, no overflow). Verify via `ux-harness?page=research`.
- [ ] **R3 — Live progress UI.** Show a clear stage + percentage progress bar and
  status message while the pipeline runs; harden the polling for mobile
  backgrounding (resume on focus) or move to a Supabase Realtime subscription on
  the project row. A finished run shows a clear "complete" state.
- [ ] **R4 — Results & export.** When analysis completes, give one place to review
  outputs and export (PDF / drawing / data) without hopping across subpages.
- [ ] **R5 — Findability.** Ensure "Research" / "Start research" is an obvious
  entry point (nav + hub/command-palette) and the list page reads well on mobile.
