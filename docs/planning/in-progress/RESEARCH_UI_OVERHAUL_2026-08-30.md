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

### A2 — ~~The primitives~~ ✅ **SHIPPED 2026-08-30**

`app/admin/research/components/ui/` — Accordion, Toggle, SegmentedTabs, SectionHeader, StatPill,
EmptyState, with `primitives.css` **imported by the component file**, not added to
`AdminResearch.css`. `SpendLimitSlider` (shipped earlier) is the seventh.

18 tests, asserting what breaks *silently* rather than "does it render": `aria-expanded` /
`aria-selected`; the Accordion **hiding** its panel rather than unmounting, so a half-typed input
survives a collapse; and every rendered class existing in the sheet beside it. The composed
`rui-stat-pill--${tone}` is checked by enumerating the tone union — a literal that never appears
cannot be grepped, per A1. Mutation-tested: deleting one tone rule fails 1, dropping
`aria-expanded` fails 2.

### A3 — ~~The guard that stops the trap recurring~~ ✅ **SHIPPED 2026-08-30**

`__tests__/research/rendered-classes-are-styled.test.ts`.

**The obvious version of this test is useless, and measuring that was the work.** A naive "is every
rendered class in a .css file" scan reports **959** violations here — and a guard that cries wolf 959
times is a guard nobody runs. The breakdown:

| | |
|---|---|
| Tailwind utilities (`flex`, `h-full`, `md:grid-cols-2`) | **591** — generated on demand, correctly absent from every authored sheet |
| Styled by the component's own `<style>{…}</style>` block | **191** — e.g. `PipelineProgressPanel` defines ~107 of its own |
| **Genuinely unstyled** | **534** |

So the guard excludes Tailwind, reads each component's embedded styles, and applies A1's stem rule.

**534 is real, and one finding stands out:** `ResearchAnalysisPanel` renders 60 classes — `ra-panel`,
`ra-panel__header`, `ra-panel__title` — that appear in **no stylesheet anywhere in the repo**, and it
is mounted by `[projectId]/page.tsx`. That panel is genuinely unstyled on the screen the firm uses
most. It is concrete evidence for *why* the research pages look the way they do, and it is work for
phases B–E rather than for the slice that found it.

**Baselined at 534, may only shrink.** A new unstyled class fails immediately. Re-baselining upward
is not a maintenance step — both times a ratchet was raised in this repo, the breach was a real bug.
Mutation-tested: renaming one rule a primitive depends on fails it.

---

## Phase B — the 3,654-line project page

The screen the firm lives in. Split into tabs, one tab per slice, **behaviour identical throughout**.

### B1 — ~~Tab shell~~ ⛔ **WITHDRAWN 2026-08-30 — the premise was false**

B1 said to add `SegmentedTabs` with Overview · Documents · Boundary · Report. **That navigation
already exists**, and building it again would have produced two competing navs on one screen.

Measured before writing any code:

- `app/admin/research/[projectId]/layout.tsx` hoists `<ResearchProjectNav />` so **every** sub-route
  inherits it — its own comment records why: *"previously only the hub page rendered it, so the
  surveyor lost the nav after the first click."*
- `Documents`, `Boundary` and `Report` are **real routes** with their own `page.tsx`, not panels.

So the 3,654-line file is not a page that needs tabs. It is the **Overview route's content**, and
its size is a maintainability problem rather than a navigation one.

**And `SegmentedTabs` would have been the wrong control anyway** — by the reasoning written into
the primitive itself: *"these switch a panel in place, they do not navigate; announcing them as
links would promise a page change that never comes."* The inverse holds here. These entries DO
navigate, so they must stay `<Link>`s. Buttons would break middle-click, open-in-new-tab, and the
browser's own history.

This is the fifth parked premise in this repo to turn out false when checked. Checking cost one
`cat` of a 24-line file.

### B1a — Split the Overview route by SECTION, not by tab ☐ *(replaces B1)*

Same goal — no file over ~600 lines — reached without inventing a second nav. Extract in place, one
section per slice, each with a wiring test asserting the page mounts it:

`_sections/ProjectHeader.tsx` · `RunControls.tsx` · `DocumentsSummary.tsx` · `AnalysisSection.tsx`

**Done:** behaviour identical; the route renders the same markup; each extraction is separately
revertable.

### B2 — Extract Overview ☐ *(now the first extraction under B1a)*
### B3 — Extract Documents ☐
### B4 — Extract Boundary ☐
### B5 — Extract Report ☐

Each: move the relevant JSX into `[projectId]/_tabs/<Name>Tab.tsx`, no logic changes, and a wiring
test asserting the page imports and mounts it. Target: no file over ~600 lines when B is done.

### B6 — ~~Say which pipeline this page runs~~ ✅ **SHIPPED 2026-08-30**

Per the READ FIRST section. The "Start Analysis" control states plainly that it runs the in-app
analysis, does not purchase documents, and links to the batch form for a worker run.

**Done:** a person on this page can tell what the button will and will not do before clicking it.

---

## Phase C — intake

### C1 — ~~New Research Project modal~~ ✅ **SHIPPED 2026-08-30**

Twelve fields became four. City, ZIP, owner, project name and notes moved behind the A2
`Accordion`; Property ID, address, county and the paid-documents toggle stay in front.

**What stays visible was the actual decision.** Address and county decide whether a run can start
and where it routes. The paid toggle stays because it is the one control that can spend money, and
folding that away would be the worst possible choice of thing to hide.

**The summary counts what is filled** — "city, notes" or "none set" — because a collapsed section
that cannot tell you whether anything is inside makes people open it every time, which is worse
than not collapsing it at all.

**The risk here was silent data loss, not layout.** A hidden field is only safe while it is still
SENT, and these reach the API for exactly one reason: the POST body spreads the whole form state.
Tidying that into an explicit field list would drop every collapsed field while the modal looked
completely correct. 8 tests pin it — including the post-create reset object, since a field omitted
*there* keeps the PREVIOUS project's value, which is worse than losing it because it looks
deliberate. Mutation-tested: replacing the spread fails it.

The `Toggle` primitive was **not** swapped in for the paid-documents control. Its help text changes
with state and carries specific wording about what a run will and will not buy; rewriting that into
the generic primitive would have risked the message for a cosmetic gain. Deferred deliberately, not
missed.

### C2 — ~~Address + county feedback~~ ✅ **SHIPPED 2026-08-30**

They were arriving in **different ambers** — `#FEF3C7` hardcoded on the county note against
`--color-warning-bg` (`#FFFBEB`) on the Places notice. Two shades of warning on one form reads as
two severities, and there is only one. The county note now reads the same tokens.

**And one of those tokens did not exist.** `AddressAutocomplete.css` read
`var(--color-warning-border, #FDE68A)`, and `--color-warning-border` was defined **nowhere**. It
rendered — the fallback saw to that — so nothing ever failed. The token was a fiction, and a theme
change would have moved the notice's background while leaving its border behind. That is the quiet
half of the bug that once had 16 theme tokens read by 159 rules and defined nowhere: the loud half
renders as nothing and gets noticed; this half renders correctly and silently opts out of theming.
All four status-border tokens are now defined, so the set is complete rather than patched at the one
place that happened to be spotted.

**A wider scan was run and deliberately NOT turned into a guard.** Across `app/**.css`: 427 tokens
defined, ~19 read with no fallback, ~38 read with a fallback but never defined. Those counts
over-report — `--p-x` and `--p-y` are set from JS (`'--p-x': p.x` in `EmployeePond.tsx`), and
`--theme-` was a regex artefact. Shipping a noisy token guard would have produced the 959-violation
problem A3 already had to solve. Recorded here as a candidate for **F2** with the caveat attached,
rather than as a check nobody would run.

Mutation-tested: removing `--color-warning-border` fails the guard. The first mutation attempt
silently did **not** apply — CRLF line endings meant `;\n` never matched `;\r\n` — and reported 6
passing, which would have been a green light for an unrun test. Second time today that exact trap
appeared.

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
