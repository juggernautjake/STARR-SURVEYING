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

### C3 — ~~Batch form parity~~ ✅ **SHIPPED 2026-08-30**

**A $10 slider on a 50-row batch was a $500 decision presented as a $10 one.** Every individual
piece of that was accurate — the slider sets a per-property limit, its hint said so, and the worker
enforces it that way. Nothing was lying. The multiplication was simply never done anywhere the
operator could see it. The form now states the batch ceiling: *"Up to $500.00 — $10.00 × 50
properties."*

Phrased as a ceiling, never a forecast. Most counties in this firm's working area route to a free
portal and spend nothing, so *"estimated cost: $500"* would be wrong for nearly every real batch and
would train people to ignore the line. It reads **$0.00** when purchasing is off — a false alarm on
the default path is how a real alarm gets ignored.

**The county checker now runs per row.** This is the only UI that reaches the worker, so it is the
form where a wrong county costs *money* rather than just time: county picks the clerk portal, and a
county with no adapter falls through to TexasFile at roughly $1–3 a document. It had no check at all
until now — the modal got one in C2 and the form that actually spends money did not.

**One component, not copied JSX.** The batch form asks the same question N times, so the C2 block
became `CountyNote.tsx` and both forms mount it. That is the defect this portal is made of:
`SectionHeader` alone exists five separate times under `app/admin` (CAD ×3, finances,
SurveyPlanPanel), each subtly different. Its styles travel with it rather than living in the
route-scoped sheet — third instance of that bug in this repo.

**Each row needs its own note id.** Duplicate ids would make every row's input point
`aria-describedby` at the *first* row's note, so a screen-reader user filling in row four hears a
warning about row one — confidently, and wrongly. Worse than no note. Pinned by a test.

**And the "ready" count was two expressions for one fact.** The displayed count and the submit
filter were identical but separate, which is how a form comes to say "3 ready" and send two. Now one
`isReadyRow` predicate, with a test asserting exactly one place defines what ready *means*.

Also: `align-items: center` on the batch row meant a county warning appearing visibly nudged the
address field down. Top alignment now.

**The wiring test had to follow the extraction, and got stronger for it.** Moving the render out of
`ProjectsTab` correctly turned the C2 guard red. It now asserts *both* halves — that `CountyNote`
renders the branches AND that the form mounts it — because checking only the component would pass
while nothing mounted it, which is this repo's most common defect one level up.

Mutation-tested five ways: estimate ignoring the purchase toggle, estimate showing the per-property
figure instead of the batch exposure, the two counts drifting apart, every row sharing one note id,
and the check removed from the batch form outright. All five fail.

---

## Phase D — run visibility

### D0 — ~~The skipped list said "unnamed work"~~ ✅ **SHIPPED 2026-08-30** *(found while scoping D1)*

D1/D2 were written to "surface the skipped list". Before splitting 3,292 lines to display it, the
display was checked. **It was already built, already wired end to end, and rendering nothing
usable.**

```
the worker writes   { step, reason, at }        run-budget.ts
the app read        s.what ?? 'unnamed work'    run-console.ts + report-card.ts
```

Nothing has ever written `what`. So every skipped item rendered as **"unnamed work"** — beside a
perfectly real reason like *"the run reached its spending limit ($2.00)"*. **That pairing is what
made it survive.** A blank would have looked broken; a placeholder next to a real sentence looks
like a feature that works and simply has nothing interesting to say.

**Neither side's tests could see it.** `run-budget.test.ts` asserts the worker records `step`. The
app's tests assert the console renders what it is handed. Both were right. The defect lived exactly
in the gap — and `RunFinishInput.skippedWork` was typed **`unknown[]`**, which accepts any shape by
definition, so the compiler had nothing to object to either. That type is now `SkippedWork[]`, and
a control confirmed the fix works: passing a `{ what }` array to `recordRunFinish` is now a
`TS2353` at the call site.

The new test is a round trip rather than a source scan — the worker's literal shape fed through the
app's reader — because the mismatch was invisible in every individual file and existed only between
them. Mutation-tested three ways, including fixing one consumer and leaving the other broken, which
is the likeliest way for half of this to come back.

This is [[project_map_and_surveying_backend_complete]]'s "written in units nobody produces" defect,
and it is the third time this repo has shipped a display that renders a key its producer does not
write.

### D1 — `ResearchRunPanel` (1,771 lines) ☐
### D2 — `PipelineProgressPanel` (1,521 lines) ☐

**Re-scoped by D0.** The reason to split these was to surface run visibility; the visibility turned
out to exist and be broken by one word. What remains is genuine but is now a *size* problem rather
than a *missing feature* problem, and should be prioritised as such.

Split each into a container plus presentational sections; surface phase, elapsed, spend-so-far and
the **skipped list** (`run-budget.ts` records what a run did not do and why — a partial result that
does not say what is missing is indistinguishable from a complete one).

### D3 — Run console + diff ☐

`RunConsoleBar` and `RunDiffPanel` into the tab shell rather than floating.

---

## Phase E — portal-wide consistency

### E1 — ~~Tab bar across all 8 tabs~~ ⛔ **PREMISE FALSE / RE-SCOPED AND SHIPPED 2026-08-31**

**The bar already exists**, and it is already good: `app/admin/research/page.tsx` has a
`role="tablist"` nav with roving `tabIndex`, arrow keys that wrap, focus following selection, and
`aria-controls` pointing at a real `role="tabpanel"`. Nothing to add. **Sixth parked premise in this
repo to be false when checked** — and checking cost one `sed`.

What checking DID turn up is worth more than the slice was. Counted across `app/admin/**/page.tsx`:

> **Seventeen admin portals declare `role="tablist"`. THREE implement no keyboard behaviour at
> all** — `marketing`, `notes`, `employees/manage/[email]/history`. The other fourteen each
> hand-roll the same eight lines, and **not one of them handles Home or End.**

Those three are `SegmentedTabs`' F1 defect, in production, on real navigation: a reader announces
"tab 2 of 7", the user presses an arrow because that is what the role MEANS, and nothing happens —
while every tab is its own Tab stop, so reaching the panel takes eight presses. The markup states
something untrue.

**Shipped instead:** the keyboard half now lives in `lib/admin/portal/tab-keyboard.ts` and is
exposed as `tabKeyDown` from `usePortalTabs` — **the hook all seventeen already call**. Research is
wired to it (this doc's remit), losing its inline copy and gaining Home/End. F1's `nextTabIndex`
moved there too and the research primitive re-exports it: two copies of a keyboard contract is
exactly how one of them ends up without Home/End, which is what had happened seventeen times over.

**Focus is found in the DOM, not by an id convention.** The obvious version focuses
`#${prefix}-${id}` — but the seventeen portals share no id scheme and several put no id on their
tabs at all, and an id lookup that drifts focuses **nothing**, which looks exactly like arrow keys
never having been wired.

**No DOM test environment exists here** — no jsdom, happy-dom or linkedom; this repo renders with
`react-dom/server` under `environment: node` by design. Checked, not assumed. Rather than add one to
cover eight lines, everything that can be wrong in an interesting way moved into a pure
`tabMoveTarget(key, ids, currentId)`: both wraps, Home/End, the one-tab bar, the empty bar
(`% 0` is NaN → `?tab=undefined`), an unknown current id, and role-filtered bars — the visible list
is per-viewer, so indexing the full spec would skip onto tabs that are not on screen. The remaining
query-and-`.focus()` is pinned by source assertions labelled as the weaker thing they are.

Mutation-tested six ways. All six fail.

**FOLLOW-UP, NOT DEFERRED SILENTLY:** sixteen portals still carry their own handler and three carry
none. The shared piece exists and adoption is now one prop each. That is outside this doc's remit —
it is the admin shell, not the research portal — and belongs in its own slice with its own QA.

### E1b — Adopt `tabKeyDown` in the other 16 portals ☐ *(outside this doc — admin shell)*
### E2 — ~~One empty state, one error state, one loading state~~ SHIPPED 2026-08-31

Measured first: **five loading treatments and six error ones** across the seven tabs.
`research-pipeline__loading` / an inline `styles.muted` / a bare `<p>Loading...</p>` / an hourglass
emoji / "Searching...". And for errors, the one that was an actual bug:

> `ProjectsTab` rendered a load **failure** inside `research-page__empty-title` with an inline
> `#DC2626` — so a failed request looked like an empty list wearing red.

Empty, failed and pending are three different answers to "where is my data", and the portal was
blurring the first two. **Empty means the query worked**, so the useful response says what would
put something there. **Failed means we do not know** — it must offer a retry and must never imply
the list is genuinely empty. `PipelineTab` had the same confusion in miniature: "No batch jobs yet"
showed whenever the list was empty, *including* right after a failed fetch, so it displayed two
contradictory messages at once.

`LoadingState` and `ErrorState` join `EmptyState` in the A2 primitives, and `ProjectsTab`,
`PipelineTab` and `SelfHealTab` are wired to them. `role="alert"` on the error and deliberately
nothing on the empty: an empty list is not an interruption, and announcing it as one trains people
to ignore the ones that are. The spinner stops under `prefers-reduced-motion`, and a server message
wraps rather than scrolling the page sideways — those are one unbroken token often enough (a URL, a
stack frame) to matter.

**Two more invented tokens, found on the way.** `--color-danger-text` and `--color-danger-bg` were
read by six rules across jobs, learn, marketing, receipts and research, and defined **nowhere** —
the real family is `--color-error-*`. Bare `--color-danger` IS defined twelve times, which is
exactly what made the invented suffixes look plausible. All six now point at the real family.

So C2 deferred token guard exists after all, in the **narrow** form C2 own reasoning allows:
`__tests__/admin-styling/status-tokens-exist.test.ts` enforces only the closed status grid — four
meanings x four slots. Nothing sets those from JavaScript and none is a prefix of another, so a name
in that shape which nothing defines is unambiguously a typo. The broad scan stays unenforced for the
reasons C2 recorded. It carries its own control, because a guard whose definition-scan silently
breaks passes for ever while measuring nothing.

**A3 guard caught my own new debt within the hour** — `rui-loading__label` rendered with no rule —
which is the entire point of it. And the inline-hex ratchet went red in the GOOD direction: E2
removed four literals, so the baseline tightened (4 to 3, 27 to 24) rather than being re-based.

Mutation-tested seven ways, and **one survived the first pass**: wrapping the error back inside
`<div className="research-page__empty">` and renaming the component to `<ErrorStateX` passed,
because that string still *contains* `<ErrorState`. The assertion now covers the whole branch — an
error rendered inside the empty-state container looks like an empty list again, whatever the
component is called.

### E2b — Re-theme `BillingTab` and `LibraryTab` (open)

**Why they were left out rather than half-fixed.** Both are entirely dark-themed pages —
`min-h-screen bg-gray-950`, their own `<header>` — left from before the portal consolidation, while
the other five tabs use **zero** dark Tailwind (counted, not assumed). Swapping only their *error*
state to the light primitive would make them inconsistent with their own surroundings: worse than
the inconsistency being fixed. They need re-theming wholesale, which is a page rewrite, not a state
consolidation.

A test pins the deferral: if either stops being a dark full-page layout, `one-state-vocabulary`
fails and names this entry. A deferral that no longer applies should not sit silently in a doc.
### E3 — Responsive pass ☐

Measure at **1440 and 390** against a **production build** — dev-server layout differs. Watch for
Tailwind's `svg{display:block}` breaking icon headings. See [[project_ui_fit_sweep_and_preflight]].

---

## Phase F — accessibility

### F1 — ~~Keyboard and focus~~ ✅ **SHIPPED 2026-08-30**

`SegmentedTabs` shipped in A2 with `role="tablist"` and **none of the keyboard behaviour that role
promises**, which is worse than plain buttons would have been. A screen reader announces "tab 2 of
5", so the user reaches for an arrow key — that is what the role MEANS — and nothing happened.
Meanwhile every tab was its own Tab stop, so reaching the panel behind a five-tab bar took six
presses. Nothing rendered wrong, nothing errored, and no existing test could have caught it: the
defect was entirely in what the markup CLAIMED versus what it did.

Now the WAI-ARIA roving-tabindex pattern — one Tab stop, arrows move selection AND focus together,
Home/End, `aria-controls` pointing at a real panel. Automatic activation rather than manual,
because these panels are already mounted, so a second keypress to confirm would be pure ceremony.

**Caught before E1 consumed it.** The primitives still have almost no callers, so fixing the
contract now cost one file; after E1 wires eight tabs it would have been a behaviour change across
the portal.

**The toggle was the focus gap.** A native checkbox inherits the UA ring, which differs per browser
and vanishes under some forced-colour settings — so a keyboard user moving down a form watched the
ring change shape halfway. All three focusable primitives now draw the same one, and a guard fails
on any bare `outline: none`, which is how rings disappear in a "tidy-up" commit.

**There is no @testing-library/react in this repo** (checked, not assumed), so a keydown on a
rendered tablist cannot be asserted. Rather than settle for a regex proving the source *mentions*
`ArrowRight`, the part with real logic was extracted into an exported pure `nextTabIndex` and
tested directly: both wraps, Home/End, the one-tab bar, the empty bar, and every key it must NOT
swallow — returning `0` instead of `null` for Tab would trap focus inside the bar, the
accessibility fix becoming the worse bug. The three unextractable wiring facts are pinned by source
assertions and are labelled in the file as the weaker thing they are.

Mutation-tested four ways — dropped negative wrap (`(0-1)%5 === -1`, focuses nothing, throws
nothing), handling every key, all tabs in the tab order, focus no longer following selection. All
four fail the suite.

### A4 — ~~Three red ratchets, none of them debt~~ ✅ **SHIPPED 2026-08-30** *(found by the full-suite run)*

The whole suite was run before merging, per [[feedback_full_suite_catches_cross_cutting]]. Three
failures the per-directory runs could not see. **All three were real, and two were mine.**

**1. `--theme-bg-subtle` was never a token.** Fifteen rules across three research stylesheets read
it; nothing has ever defined it, so every one painted its literal fallback on all twelve palettes.
It slipped past three separate reviews because **`--theme-bg-subtle-hover` DOES exist** — the name
reads as obviously real, and a `-hover` modifier with no base is itself the tell that the base was
meant to exist. Defined in all twelve blocks rather than rewritten at fifteen call sites, following
the precedent themes.css already sets in its own comment: *"Defined rather than deleted, because
every call site was asking for the right thing."*

`--theme-bg-input` got the opposite treatment: one call site, and 297 rules across the admin sheets
already use `--theme-bg-surface` for an input background. One call site with an established
alternative gets fixed; it does not get a new token.

**2. A3 duplicated fourteen classes that already existed — and lost.** The whole `.ra-live-log`
family was re-authored in `ResearchAnalysisPanel.css` when `AdminResearch.css` already had it. The
pre-existing versions are *more complete* (background, border-bottom, cursor, user-select), and
AdminResearch.css loads **last** on these routes, so the new ones never applied at all
([[feedback_route_scoped_css_swallows_fixes]] again). **A3's premise was partly false**: "78 classes
with no stylesheet anywhere" did not check AdminResearch.css for these fourteen. Duplicates removed;
the genuinely-new variants beside them stay.

**3. The Starr-assumptions ratchet was counting comments.** Red at 165 against a 160 ceiling — and
`scan()` read raw source, so PROSE counted. `arcgis-fields.ts` scored a hit for the sentence
*"context came back empty on every Bell County run"*, in a file whose code names no county at all.

**46 of the 165 were comments.** The real backlog is **119 across 67 files**, so the ceiling came
DOWN — the only direction it is allowed to move. Nothing was paid down: the instrument had been
over-reporting by 38%.

This is the **third** guard here to match its own explanatory text this month
(`derive-portal-tabs.mjs` and the A3 CSS check were the others). Long comments are the house style,
so any scanner over this source must strip them or it is measuring the documentation.

The stripper is load-bearing now — it decides a ratchet's number — so it has its own tests. The
dangerous failure is not missing a comment, which only inflates a count; it is **eating code**: a
naive `//` rule swallows any line holding a URL, and adapter files are full of
`https://esearch.bellcad.org`. Under-counting looks like progress. Its own test then caught a second
case the `:` guard missed — a protocol-relative `"//cdn.example.com"` — before it ever ran in anger.

Mutation-tested three ways (URL guard dropped, strip order reversed, helper unwired from `scan`).

---

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
