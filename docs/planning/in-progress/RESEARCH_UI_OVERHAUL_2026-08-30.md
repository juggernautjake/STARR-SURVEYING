# Research UI overhaul — 2026-08-30

**Status:** IN PROGRESS · opened 2026-08-30 · **built one slice per pass; see "How to work this doc".**

The owner asked for the research pages to be rebuilt: better formatted, better styled, more
intuitive, using toggles, sliders, accordions and tabs so everything that needs surfacing is
surfaced. This is that work, cut into slices small enough to ship and verify one at a time.

---

## The measurement this starts from

| | |
|---|---|
| `.tsx` files under `app/admin/research` | **90** |
| Largest single file | `[projectId]/page.tsx` — **3,654 lines** |
| Next four | DrawingCanvas 2,677 · ResearchRunPanel 1,771 · PipelineProgressPanel 1,521 · ResearchAnalysisPanel 1,296 |
| `AdminResearch.css` | **12,083 lines** |
| Portal tabs | 8 (`Projects, Pipeline, Library, Coverage, Sites, Billing, SelfHeal, PortalWatch`) |
| Routed pages | 12 |

**A single sweeping pass across 90 components produces 90 half-changed files and a broken app.**
That is why this is a doc and not a commit.

---

## ⚠ READ FIRST — there are TWO research pipelines, and the UI does not say so

Measured 2026-08-30: **zero** references to `WORKER_URL` in `app/api/admin/research/[projectId]/analyze/route.ts`
or `lib/research/analysis.service.ts`.

| Path | Runs where | Uses `run-budget.ts` | Buys documents | Reached from |
|---|---|---|---|---|
| Project → **Start Analysis** | **In the app** (Vercel) | ✗ | ✗ | `[projectId]/page.tsx` |
| **Batch job** | **The netcup worker** | ✓ | ✓ (TexasFile) | `_tabs/PipelineTab.tsx` |

This is the single biggest source of confusion in the current UI and it is a *content* problem, not
a styling one. The owner started a run expecting a spend limit and a purchase, and got neither —
because that screen's pipeline has neither. **Every slice below that touches a run-starting surface
must say which pipeline it starts.** No amount of accordions fixes a screen that is quietly the
wrong engine.

`research_document_purchases` still has **0 rows**, and this is why.

---

## How to work this doc

One slice per pass, in order. Slices inside a phase may be reordered; phases may not — later phases
consume primitives the earlier ones build.

**Every slice must:**

1. Be behaviour-preserving unless it says otherwise. A refactor that also changes behaviour cannot be
   reviewed, and cannot be reverted without losing the fix.
2. `npm run type-check`, `npm run lint`, `npm run build` — **exit codes read without a pipe**
   (`$?` after `| tail` is `tail`'s status; this repo has shipped a false green that way).
3. Carry a test that asserts the **caller**, not just the component. A panel with passing tests that
   nothing mounts is this repo's most common defect.
4. Be **mutation-tested**: break the thing the test guards and watch it fail. A guard that cannot go
   red is decoration. Strip comments before scanning source — three guards here have matched their
   own documentation as evidence.
5. Annotate this doc with what shipped and what it cost.

**Definition of done for the doc:** every slice shipped or explicitly deferred with a one-line
reason. Then it moves to `completed/`.

---

## Phase A — the shared kit *(nothing else can start until this exists)*

Today each of the 90 components styles itself. That is why the portal looks like 90 separately
authored screens, and why "restyle everything" is otherwise an unbounded job.

### A1 — ~~Catalogue what already exists~~ ✅ **SHIPPED 2026-08-30**

`docs/planning/qa-evidence/research-css-audit.md`. **No CSS changed**, as specified.

1,353 classes across 84 families in 12,083 lines, route-scoped to `/admin/research/**`.

**The finding that changes A3: you cannot grep your way to a dead class here.** A naive scan says
204 classes (15%) are never referenced. That number is not a deletion list. **62 files build class
names at runtime** — `` className={`adjoiner adjoiner--${row.depth}`} `` composes three classes the
scan calls dead and which all render.

Partitioned by trustworthiness:

| Bucket | Count | Verdict |
|---|---|---|
| Modifier variants (`--suffix`) | 74 | **Do not trust** — this is the composed shape |
| Plain, but family stem IS referenced | 107 | Suspicious, needs per-case reading |
| Plain, whole family unreferenced | **23** | The only defensible dead list |

And even those 23 are cleared for *investigation*, not deletion: a family can be unreferenced
because its screen was consolidated away, or because the component rendering it is itself an orphan
nobody mounts — a different bug with a different fix.

**A3 must be built on the stem, not the composed name**, or it will produce exactly these false
positives. The audit is its baseline.

### A2 — The primitives ☐

`app/admin/research/components/ui/` — one file each, styles in a sheet **imported by the component**,
never in a route-scoped stylesheet:

- `Accordion.tsx` — collapsible section, keyboard operable, `aria-expanded`
- `Toggle.tsx` — the labelled checkbox pattern already hand-rolled in ProjectsTab and PipelineTab
- `SegmentedTabs.tsx` — in-page tab bar (used heavily by Phase B)
- `SectionHeader.tsx` — title + optional action + optional count
- `StatPill.tsx` — the status/count chip that six panels reinvent
- `EmptyState.tsx` — icon + sentence + optional action

`SpendLimitSlider.tsx` already shipped (2026-08-30) and moves into this folder as the seventh.

> **The trap this must avoid.** `.address-autocomplete__*` was defined in `AdminJobs.css`, which only
> `/admin/jobs` imports — so the component rendered unstyled on `/admin/research` and nobody noticed,
> because nothing errored. **This is the third such instance in this repo.** Every primitive ships
> with its styles beside it. See [[feedback_route_scoped_css_swallows_fixes]].

**Done:** six components, each with a story-free render test and styles that load with the component.

### A3 — The guard that stops the trap recurring ☐

A test asserting: every `className` a research component renders resolves to a rule in a stylesheet
that actually loads on that component's route.

**Done:** the guard passes, and mutation-testing it (rename one rendered class) fails it. Existing
violations may be listed as a known-set baseline rather than fixed here — but the baseline must only
shrink.

---

## Phase B — the 3,654-line project page

The screen the firm lives in. Split into tabs, one tab per slice, **behaviour identical throughout**.

### B1 — Tab shell, no content moved ☐

Introduce `SegmentedTabs` on `[projectId]/page.tsx` with **Overview · Documents · Boundary · Report**.
Wrap the existing content in Overview; the other three render a placeholder that says what is coming.
Tab state in the URL (`?tab=`) so a reload and a shared link land in the same place.

**Done:** page renders identically at `?tab=overview`; no component moved yet.

### B2 — Extract Overview ☐
### B3 — Extract Documents ☐
### B4 — Extract Boundary ☐
### B5 — Extract Report ☐

Each: move the relevant JSX into `[projectId]/_tabs/<Name>Tab.tsx`, no logic changes, and a wiring
test asserting the page imports and mounts it. Target: no file over ~600 lines when B is done.

### B6 — Say which pipeline this page runs ☐

Per the READ FIRST section. The "Start Analysis" control states plainly that it runs the in-app
analysis, does not purchase documents, and links to the batch form for a worker run.

**Done:** a person on this page can tell what the button will and will not do before clicking it.

---

## Phase C — intake

### C1 — New Research Project modal ☐

Required path is **address or Property ID, plus county**. Everything else (owner, project name,
notes, city/ZIP/state) goes behind an `Accordion` labelled "Optional details". The paid-documents
toggle uses `Toggle`.

**Done:** the modal opens showing four fields, not twelve.

### C2 — Address + county feedback ☐

The county checker (shipped 2026-08-30) and the Places notice are both present but visually
incidental. Give them one consistent inline-validation treatment.

**Done:** a wrong county and a dead Places key look like the same *kind* of message.

### C3 — Batch form parity ☐

`PipelineTab`'s batch form now carries the spend slider and purchase toggle. Bring the rest of it up
to the same standard: per-row validation, the county checker from C2, a running cost estimate.

---

## Phase D — run visibility

### D1 — `ResearchRunPanel` (1,771 lines) ☐
### D2 — `PipelineProgressPanel` (1,521 lines) ☐

Split each into a container plus presentational sections; surface phase, elapsed, spend-so-far and
the **skipped list** (`run-budget.ts` records what a run did not do and why — a partial result that
does not say what is missing is indistinguishable from a complete one).

### D3 — Run console + diff ☐

`RunConsoleBar` and `RunDiffPanel` into the tab shell rather than floating.

---

## Phase E — portal-wide consistency

### E1 — Tab bar across all 8 tabs ☐
### E2 — One empty state, one error state, one loading state ☐
### E3 — Responsive pass ☐

Measure at **1440 and 390** against a **production build** — dev-server layout differs. Watch for
Tailwind's `svg{display:block}` breaking icon headings. See [[project_ui_fit_sweep_and_preflight]].

---

## Phase F — accessibility

### F1 — Keyboard and focus ☐

Every primitive from A2 operable without a mouse; visible focus; correct roles.

### F2 — Contrast ☐

232 contrast problems are already recorded repo-wide (see [[project_page_versions_dossiers]]). Fix
the research subset; do not re-baseline the ratchet without investigating — both prior breaches were
real bugs, not debt.

---

## Deliberately NOT in scope

- **`DrawingCanvas.tsx` (2,677 lines).** A canvas editor is its own project with its own interaction
  model, and it is not what "the research pages look bad" refers to. Separate doc if wanted.
- **Rewriting `AdminResearch.css` wholesale.** A1 catalogues it; slices trim their own area. A
  12,000-line rewrite in one pass cannot be reviewed.
- **New features.** This doc restyles, resurfaces and reorganises what exists. The one exception
  already made — the spend slider — was a control the owner had been *told* existed.

---

## Known traps, learned the hard way on this codebase

1. **Route-scoped CSS.** `AdminResearch.css` loads last on research routes; a shared-class fix made
   elsewhere misses these pages. Third instance already.
2. **Authored but not wired.** Assert something imports *your* file. Its own tests passing proves
   nothing about whether it renders.
3. **A probe can be the bug.** Three guards this week matched their own comments as evidence. Strip
   comments; run a control that should fail.
4. **Two pipelines.** See READ FIRST. Any run-starting UI must name its engine.
5. **`$?` after a pipe** is the pipe's status. Read exit codes unpiped.

---

## Slice log

| Date | Slice | What shipped |
|---|---|---|
| 2026-08-30 | *(pre-doc)* | `SpendLimitSlider` + wiring into the batch form; the only UI that reaches the worker. 9 tests, mutation-tested. |
