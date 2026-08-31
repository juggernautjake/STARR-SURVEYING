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

**Review → Survey SHIPPED 2026-08-31.** 3,254 → 3,234 lines, and it came with the guard this
repository has needed for a while.

That panel opened with a **25-line cast** declaring 29 keys across four nested structures. The
worker builds that object by hand in `worker/src/index.ts`; the panel declared by hand what it
expected to find; nothing connected the two. A cast is a claim, not a check — TypeScript will
happily let the panel read `result.platSummaries` from an object whose key is `platSummary`, and
**an empty "Plat Analyses" section looks exactly like a deed that had no plats.**

All 29 are produced. `review-reads-what-the-worker-writes.test.ts` keeps it that way, because the
next key added is the one that will not be.

### Verifying it took three tries, and the first two were the probe

1. Accepting `foo,` **anywhere** reported all 29 produced — it matches any variable in an argument
   list, so the sweep could not have returned a negative. A probe that cannot fail is a green light.
2. Rejecting that form reported `platAnalyses` as never produced, when `worker/src/index.ts:475`
   writes exactly that — in shorthand, on its own line. A false negative sends somebody to fix
   working code.

The rule is now three explicit forms with the shorthand **anchored to its own line**, and it is
tested against a synthetic corpus rather than the real one: measured against the real corpus, the
anti-control could not tell the anchored and unanchored versions apart, because the fake key it
looks for appears nowhere either way. That mutation survived the first pass for exactly that
reason.

### And a `&&` that was standing in for a boolean

`const hasBoundary = boundary && (…)` evaluates to its LEFT operand when that is falsy — so with
no boundary at all `hasBoundary` was `null`, not `false`. It happened to work, and it doubled as a
type narrowing that `tsc` immediately missed once it became a real boolean. Both sites use optional
chaining now.

The empty-call-list case alone does **not** distinguish the two forms — that mutation survived the
first pass too. It is the no-boundary case that separates them.


**Review → Property SHIPPED 2026-08-31.** 3,283 → 3,254 lines. The field PRECEDENCE moved to
`_sections/property-review-fields.ts`, where it can be asserted: every field has a fallback, and
which side wins is the only thing in that block a surveyor would notice being wrong — a stale
intake address beating a researched one, or an owner name the run found hidden behind an empty
column. The address prefers intake; the legal description prefers the run. Those are opposite, and
both are deliberate.

Two shortcuts went with it: whitespace-only values reached the grid as labelled blank rows, and
`result.acreage ? …` dropped a genuine `0` — the same shortcut that hid a zero document count two
components away, where it mattered a great deal.

**Review → Summary SHIPPED 2026-08-31.** 3,254 → 3,232 lines. The widest cast on the page — 26 keys
off `analysis_metadata.result` plus three counts from the stats row — moved to
`_sections/summary-review-data.ts` and joined the same contract test. This is the first screen a
surveyor sees when a run finishes and the screen they sign off from, which is what makes the two
defects it carried worth the slice.

**"0 documents" was invisible.** The stat rendered behind `docCount > 0`, so a run that retrieved
**nothing** showed no Documents row at all — indistinguishable from a run where the count was never
reported. `hasDocCount` now separates *absent* from *zero*, and zero renders as **"none retrieved"**
with the warn treatment. Third instance of this exact shortcut in two days.

**And the flood zone was signalled in two colours nobody could read.** `#f87171` / `#4ade80` inline —
**2.77:1 and 1.74:1** on white, and red-green, so the one distinction on the row was carried by the
channel a colour-blind reader does not have. The words carry it now; the colour only reinforces it.

#### The extraction quietly narrowed a fatal-error count, and the test caught it

Worth recording because it is the exact failure B1a's "compare against `HEAD`" rule exists to catch,
and it was introduced by the extraction itself, not found in the original:

```
HEAD:      errors.filter(e => !e.recovered)        ← missing flag counts as FATAL
extracted: errors.filter(e => e.recovered === false) ← missing flag counts as RECOVERED
```

An error that never said whether it was recovered is not the same as one that said it was, and the
safe reading is the one that surfaces it. `tsc` was clean on both — `recovered?: boolean` admits
either — the page rendered identically on every run that sets the flag, and the difference only
appears on the malformed payload nobody has yet produced. **A behaviour change with no failing
symptom is precisely what a byte-for-byte comparison is for.** Reverted to `HEAD`'s reading.

84 tests on the contract file; full suite **27,148 pass**; `tsc` 0; production build green.

Same goal — no file over ~600 lines — reached without inventing a second nav. Extract in place, one
section per slice, each with a wiring test asserting the page mounts it:

~~`_sections/ProjectHeader.tsx` · `RunControls.tsx` · `DocumentsSummary.tsx` · `AnalysisSection.tsx`~~

⚠ **That list was a sketch, and three of its four names were never real.** `ProjectHeader` shipped;
`RunControls`, `DocumentsSummary` and `AnalysisSection` match **nothing** in `page.tsx` — they were
invented at planning time and then quoted back as remaining work in the status table for a day. The
extractions that actually shipped are the eleven files in `_sections/`, named after the sections that
exist. Do not plan the next one from a name that has not been grepped.

**Done:** behaviour identical; the route renders the same markup; each extraction is separately
revertable.

### B1a — thirteenth extraction: `_sections/easements-review-data.ts` — SHIPPED 2026-08-31

**The last cast on the Review tab.** Twenty-seven keys off `analysis_metadata.result` across four
nested structures — FEMA, TxDOT, the clerk's recorded easements, and two lists the plat analyser
hangs off `boundary`. Held against `worker/src` by the existing contract test, unlike the coherence
panel, whose producer is a prompt.

#### The tab said "no data" while showing data

```
hasData = fema || txdot || easements.length > 0 || covenants.length > 0
```

Four of the six sections it renders. `rowWidths` and `platEasements` both come from the plat
analyser rather than from the courthouse, so a run that read the plats and found nothing at the
clerk listed the right-of-way widths, listed the plat easements, and then printed

> No easement or encumbrance data found. Run the full research pipeline to populate this section.

underneath them. Not a hidden section this time — a **contradiction**, on the tab whose entire job
is to say what encumbers the tract. `EASEMENT_DATA_SOURCES` now enumerates all six and the test
asserts the shaping returns every one, so a seventh section cannot be added without being counted.

Also: `result.fema = {}` counted as a FEMA reading and rendered a grid of six blank fields under a
heading claiming the data was there. An empty object is not a reading; the empty state — *"requires
valid coordinates from geocoding"* — is the true answer and the one a surveyor can act on.

And `location` was in the cast, is produced by the worker, and appeared in no JSX. Same shape as
G10's owner name: collected, typed, never shown. It says *where on the tract* the easement runs. It
renders now — the one deliberate behaviour change in this slice.

#### The tab was a dark island in a light portal

`#0f172a` cards with light-theme greys on them. Four of its five text colours failed AA against its
own background:

| | |
|---|---|
| `#4B5563` | **2.36:1** — all three "no data available" lines, and the DESCRIPTION of every recorded easement |
| `#B91C1C` | **2.76:1** — "YES — flood insurance required" |
| `#047857` | 3.26:1 — the not-in-SFHA reading |
| `#64748b` | 3.75:1 — every field label on the tab |

Re-themed to the same light card treatment as the Property and Survey tabs, in
`AdminResearch.css`, rather than to lighter text on the dark card: a lone dark island inside a
light portal is what produced this, and — see below — it produced it twice on one screen.

`page.tsx` is **3,222 → 3,289**. Up, and honestly so: the cast came out, but the re-theme turned
dense inline-styled one-liners into structured class-based markup. Line count is a proxy for the
thing this doc is after, not the thing itself.

---

## G15 — the colour and the surface are almost never on the same element (2026-08-31)

Every inline measurement so far compared a `color` with a `background` in the **same style object**.
That is not how these screens are built. A card sets the background; its children set the text.

So the common shape was unmeasurable — and the fallback made it worse. "The page, if the file
paints nothing dark" was a **file-level** fact, so one dark card blinded 3,200 lines. `page.tsx`
has dark `#0f172a` cards on two tabs. That single fact skipped every unpaired inline colour in it,
including this, on the Survey Data tab:

```tsx
<table className="review-table">                        {/* defined in NO stylesheet */}
  <td style={{ color: '#e2e8f0' }}>{link.instrumentNumber}</td>
```

`.review-table` and `.review-data-section` are two of the 534 in the unstyled-class baseline, so the
table has no background of its own and sits straight on `.review-summary-panel` — `#fff`.

**1.23:1.** The date, the grantor, the grantee and the instrument number of **every link in the
chain of title** have been rendering white on white. Not dim. Gone.

Two ratchets were measuring the same defect from opposite sides and neither could see it: the
unstyled-class guard knew `.review-table` had no rule, and the contrast guard knew nothing about
what that implied.

### What the walk does

`jsxTags` walks the tags; `ancestorSurfaces` keeps a stack of backgrounds; a colour is measured
against the nearest ancestor that paints one. `null` means an ancestor paints something unreadable —
skip, never guess, which is the rule that kept the 61 false findings from coming back. The
file-level check now covers only **class**-painted darkness, which is the part a stack cannot
resolve.

`styleObjects` replaced the `[^{}]*` matcher at the same time, and had to: a style object containing
a template literal with `${…}` was invisible *entirely*. SurveyPlanPanel's done/not-done checkbox is
one, and the run reported its tick as white-on-white when the real surface was `#059669`. The
finding was right and the surface was wrong, and a checker that names the wrong surface gets argued
with rather than fixed.

### The sweep

**Nineteen findings, all real.** Skipped fell 278 → 120; checked rose 809 → 930.

| Where | What |
|---|---|
| `page.tsx` ×4 | **The chain of title at 1.23:1** — white on white |
| `page.tsx` ×2 | The plat cards' AI narrative at 2.36:1 and adjacent references at 3.75:1 |
| `page.tsx` | The empty-documents icon at 2.85:1 |
| `SurveyPlanPanel` ×6 | Deed closure, completed count, "If Found", potential conflicts, the no-discrepancies state, the checkbox tick |
| `report/page.tsx` ×4 | **The field report** — the page a crew opens on a phone standing on the tract. "Loading field report…" at 2.43:1, "✓ Boundary verified" and "✓ Resolved" at 2.99:1, the footer at 2.31:1 |
| `ExportPanel` | The export confidence readout, `#F59E0B` at **2.15:1** |
| `ResearchRunPanel` | The elapsed timer — 1.1rem/600 is 17.6px, just under the 18.66px large-bold floor, so 4.5:1 applies |

All fixed to the hexes `AdminResearch.css:12` had already retired to. The unstyled-class ratchet
came down 461 → 454 in the same pass, because defining `.review-table` was part of the fix.

**Mutations:** never popping the stack on a close tag → red (3). A self-closing sibling pushing its
background → red. An unreadable ancestor falling through to the page → red. `styleObjects`
collapsing at the first nested brace → red.


### B1a — twelfth extraction: `_sections/coherence-review-data.ts` — SHIPPED 2026-08-31

The Review → Summary tab's **Quality & Coherence Review** panel: seventeen keys read off
`analysis_metadata.coherence_review` through an unchecked cast, plus the four colour maps that turn
a verdict into something a reader sees. `page.tsx` **3,232 → 3,222**.

**Its producer is not the worker, and that is the whole story of this slice.** Every other
extraction in `_sections/` is held against `worker/src` by `review-reads-what-the-worker-writes`.
This one cannot be: `coherence_review` appears **nowhere** in `worker/src` — checked with a control,
because a bare negative from a grep is how this repository has been wrong ten times now. It is
written by `lib/research/analysis.service.ts`, the **app-side** pipeline, and its shape is declared
by the `COHERENCE_SYNTHESIS` prompt's JSON block in `lib/research/prompts.ts`.

That is READ FIRST's "there are TWO research pipelines" made concrete, and it is the worse of the
two positions: **the contract for this panel lives in a prompt.** A prompt is edited far more
casually than a type, and no compiler reads it. So `coherence-review-contract.test.ts` holds the
seventeen keys against the prompt text — sliced to that one prompt, because `summary`, `severity`,
`title` and `description` appear in a dozen others and a whole-file sweep reports every key as
present no matter what this prompt says. 44 keys inside the slice, 297 in the file; the control key
is `chord_bearing`, which the curve extractor declares and this one does not.

`_pass_count` is deliberately outside the key list: `analysis.service.ts` attaches it *after* the
model responds, so a test that looked for it in the prompt would fail for the wrong reason. It is
asserted the other way — present in the service, absent from the prompt.

#### Zero deeds found is the finding

`deedDetail && (chain_summary || deeds_found)`. `deeds_found: 0` is falsy, so a chain where the
pipeline found **no deeds** hid the entire box — and with it `complete: false`, the break count, and
the list of missing instruments. The one state a surveyor most needs to see was the one state that
rendered nothing.

**Fifth instance of this exact shortcut in the research portal in two days** — the run panel's
document count, the Summary tab's document count, `result.acreage ? …` on the property tab, and the
boundary box in this same component, whose guard read only `traverse_summary || closure_status` and
so hid a traverse reporting `call_count: 0`. `!= null` throughout: absent hides the box, zero shows
it.

#### The composite fixture that proved nothing

Worth recording, because the test looked thorough and was not. The first version asserted on
`{ deeds_found: 0, complete: false, breaks: 0 }` — all three at once — and putting `deeds_found !=
null` back to a bare `deeds_found` **did not turn it red**: `complete != null` carried the case on
its own. A composite fixture proves the OR, not the clause. Now one field per case, five cases, and
each of the five mutations checked individually.

#### And a `passComparison` that was never returned

The interface declared it; the shaping function did not return it. `tsc` caught it the moment the
page consumed the module — which is the point of extracting a cast into a typed function, and is
exactly what nothing caught while the same seventeen keys were inline.

---

## G14 — a ternary is two colours, and only one of them was ever measured (2026-08-31)

**Found by the slice above, not by the auditor.** The coherence test asserts `#059669` is gone from
`page.tsx`; it went red against a line the panel does not own:

```tsx
style={{ background: isVerifying ? '#6B7280' : '#059669', color: '#fff', fontSize: '0.82rem' }}
```

The research project page's **Run Verification** button. White on `#059669` is **3.77:1** at 0.82rem
— not large text, so 4.5:1 applies. It has rendered that way for the button's whole life.

### Why F2 reported clean over it

Not an oversight — a rule, working exactly as written. `inlinePair` matched `background: '<literal>'`.
Here the value is a ternary, so no literal matched, but a background key was *present*, so
`declaresBackground` was true and the pair was counted as **skipped**. And skipping was the right
call: assuming white behind an unresolvable background is what produced 61 false findings on the
first inline sweep.

The conservative rule stays. It was simply too coarse. **A ternary between two literals is not
unresolvable — it is two known answers, and the honest reading is the worse of them.**

### What widening it found

`valueSourceOf` now reads the whole value expression (quote- and bracket-aware, so a comma inside
`'rgba(0, 0, 0, .4)'` does not end it) and `literalColoursIn` resolves every literal in it. Both
branches of a ternary `color` too. The audit measures the worst combination and reports **one**
finding per style object, because a button that fails in both states is one thing to fix.

First run: **three more real failures**, all of them ternaries, none previously visible.

| | |
|---|---|
| `AnalysisSummary.tsx:175` | Monument condition — `#F59E0B` at **2.15:1**, the worst in the portal. `found` / `not found` on a monument is a fact a surveyor acts on. |
| `DocumentDeepAnalysisPanel.tsx:359` | Run log lines: `warn` at 3.19:1 and `success` at 3.77:1. |
| `FinalDocumentTab.tsx:333` | Document status "Analyzed" at 3.77:1. |

All four fixed to the hexes `AdminResearch.css:12` had already retired these to (`#047857`,
`#B45309`). 799 pairs → **809 checked, no failures.**

### The tenth time a check read its own prose

The retired-hex assertion went red on its *second* run too — this time against the comment that
explains the retirement, which names the hex. Blanked with `stripJs` before scanning, and the
control asserts both directions: the raw file still contains the string (so the control is not
vacuous) and the stripped file does not.

**Mutations:** taking the first branch instead of the worst → red. Anchoring the literal matcher so
ternaries stop resolving → red (3 tests). Restoring the falsy-zero deed guard → red. Putting
`#059669` back on the button → red in both files.


### B2 — ~~First extraction~~ SHIPPED 2026-08-31 — `_sections/ProjectStats.tsx`

The quick-stats grid: 49 lines out of `page.tsx`, **3,680 to 3,637**.

**Chosen because it is the smallest honest one.** Four tiles, one object, two callbacks. A first
extraction that has to reason about auto-save, CAD annotation state and the beforeunload handler is
a first extraction that gets abandoned halfway.

**Callbacks, not the router.** The original read `router.push` and `scrollToReview` directly.
Passing `router` down would let the section navigate anywhere and would need a router to test; two
named callbacks say exactly what it may do. It holds no state.

**The markup was verified to have moved unchanged** — the 49 lines compared byte-for-byte against
`HEAD`, with only the two inline handlers normalised into named callbacks. Not "looks the same":
compared, mechanically, at extraction time.

**Mutation-tested six ways, and TWO survived the first pass.** Both mattered:

1. `{false && <ProjectStats ...}` passed the "is it rendered?" assertion — **the exact failure this
   test file exists to catch.** A section that is imported, referenced, and never on screen is a
   deletion with extra steps. The check now requires it to render unconditionally.
2. `type="button"` to `type="submit"` passed a test that only counted `<button>` elements. It
   changes nothing today, because these tiles sit outside a form — but the day one moves inside
   one, a click meant to scroll submits the form, and the bug looks like the form misbehaving.

**And the guard matched its own comment for the fifth time this month.** `ProjectStats.tsx`
explains that the original read `router.push`, so an assertion forbidding `router.push` matched the
sentence describing the rule. Fixed by reusing the hardened `stripComments` from
`audit-starr-assumptions.mjs` — which has its own tests, including that it does not eat a URL —
rather than writing a sixth ad-hoc stripper. It runs behind a control, since a stripper returning
`''` would make every assertion after it vacuous.

**Remaining under B1a:** `ProjectHeader`, `RunControls`, `DocumentsSummary`, `AnalysisSection`.
Same shape each time: move, compare against `HEAD`, assert the page still mounts it.
### B3 — ~~Second extraction~~ SHIPPED 2026-08-31 — `_sections/ProjectHeader.tsx`

Title, address line, description and the two project-level actions. 37 lines out; **3,637 to 3,607**.

**The inline hexes came across unchanged, on purpose.** `#D1D5DB`, `#FECACA` and `#DC2626` are
inline here and tokens exist for all three. Tidying them in the same commit would turn the diff
from *"these lines moved"* into *"these lines moved AND something changed"* — the shape a real
regression hides in — and destroy the byte-for-byte comparison against `HEAD` that makes each
extraction trustworthy. The inline-hex ratchet is per-file, so the count moves with the code and
the total is unchanged; nothing is lost by tokenising in a separate pass.

**B2's lesson carried forward.** The "renders it unconditionally" assertion was written into this
slice from the start, because `{false && <ProjectHeader ...}` satisfies a naive is-it-rendered
check while putting nothing on screen.

The address line has two mutually exclusive branches — county-as-badge, or a bare state — and both
are pinned, along with the case where neither is known. Collapsing them would print the state twice.

Mutation-tested six ways; all six fail.
### B4/B5 — ~~Third extraction~~ SHIPPED 2026-08-31 — `_sections/EditProjectModal.tsx`

81 lines out; **3,621 → 3,549**. Three sections extracted now (`ProjectStats`, `ProjectHeader`,
`EditProjectModal`), and the page is down 131 lines from where B2 started.

**The fix landed first, in its own commit, with its own guard — then the code moved.** This modal
had a live bug in it an hour earlier (G9: the overlay dismissed on an outside click and discarded
every edit). Doing both at once would have turned the diff from *"these lines moved"* into *"these
lines moved AND something changed"*, which is the shape a regression hides in — and here the
change was the whole point, so burying it would have been worse than usual.

79 moved lines compared byte-for-byte against `HEAD`, allowing only the prop renames.

**The open/closed decision moved INSIDE the component.** The page passes `open` and the modal
returns `null` itself, so the page has no condition left to get wrong — a stronger answer to B2's
`{false && <X />}` lesson than asserting the mount line has no `&&`. A test pins that a closed
modal renders *nothing*: an overlay that stays mounted while invisible covers the page with a
layer that swallows every click, and that reads as "the page stopped responding".

**The G9 guard went red, correctly.** It asserted `page.tsx` contained the Escape handler, and
the handler moved. A guard that asserts on a FILE has to follow the code out of it — the
alternative is one that silently stops covering anything, which is exactly what the reachability
check did when `.tsx` fell outside its filter. Third time today an extraction moved a guard's
subject, and the third time the red was the guard working.

Mutation-tested six ways, including restoring the overlay `onClick` — which fails both this file
and the G9 guard, from two directions.

**Remaining under B1a:** `RunControls`, `DocumentsSummary`, `AnalysisSection` — the three big
ones. Same shape each time: move, compare against `HEAD`, assert the page still mounts it.
### B1a — fifth extraction: `_sections/UploadStagePanel.tsx` — SHIPPED 2026-08-31

Stage 1, where documents go in and the property is described. 61 lines out; **3,569 → 3,526**.
Five sections extracted; the page is **154 lines lighter** than when B2 started.

The two panels shared one reload — both inlined `() => { loadDocuments(); loadProject(); }` — so
they now take one `onDocumentsChanged`. Two copies of one reload is how they drift into reloading
different things.

51 normalised lines compared byte-for-byte against `HEAD`.

### The guard that moved with it was passing vacuously — and had been

`pipeline-note-is-present` protects the sentence telling an operator this button starts the
**in-app** analysis and cannot buy a document. It followed the note into the section, and a
mutation deleting `className="research-pipeline-note"` from the note's own `<div>` **still
passed**.

Not a comment problem — that file already strips comments. The assertion was
`toContain('research-pipeline-note')`, and the button inside the note carries
`research-pipeline-note__link`, which CONTAINS that string. The note could render completely
unstyled with the check green.

**Exactly the flaw C2 found in the county-check guard**, where `research-modal__county-note`
matched while the `--warn` variant had been renamed away. Caught by mutation both times, and the
fix both times is to assert the attribute rather than a substring of it.

I also added a comment-stripper to that guard before realising it already had one — removed, and
the real cause recorded instead. A wrong diagnosis left in place as a "fix" is worse than the bug,
because the next reader trusts it.

### Two probe bugs in one test, both caught by absurd answers

The ordering check asked where four things appear in the section. `DocumentUploadPanel` matched
the IMPORT at the top, so the panels appeared to precede the header; then
`research-pipeline-note` matched the section's own header COMMENT. Eighth guard today to trip over
the house style of long comments — neither was noticed by reading, only by the numbers being
impossible.

### B1a — fourth extraction: `_sections/ResearchStagePanel.tsx` — SHIPPED 2026-08-31

Stage 2, the screen an operator watches while a run is going. 52 lines out; **3,586 → 3,569**.
Four sections extracted now.

**The four search fields were a decision hiding in markup.** Each was a three-way fallback inline
in the JSX — `pendingSearchParams?.county ?? project.county ?? ''` — repeated four times with a
different field. **That is exactly the line G10 got wrong**: the owner fell back to a project
column that does not exist, and the repetition is what made one wrong entry among four invisible.
They are resolved on the page now and passed in as four plain strings.

30 normalised lines compared byte-for-byte against `HEAD`, with the substitutions enumerated
explicitly rather than waved at: four resolved strings, one rename, four callbacks moved to the
caller.

### Three existing guards went red, and that is four times today

`report-card`, `run-console` and `run-diff` each assert their panel is *actually mounted* — the
check that exists because `PipelineDiffEngine` was once invisible. All three named
`[projectId]/page.tsx`, and the panels moved.

Pointing them at the section alone would be **weaker than what they replaced**: a section nothing
mounts satisfies that just as well. Each now asserts BOTH halves — the section renders the panel,
AND the page mounts the section — which is the shape the county-check guard took when C3 extracted
`CountyNote`. Verified from both directions: unmounting the section fails all three; removing one
panel from the section fails only its own.

**A guard that names a file has to follow the code out of it.** The alternative is one that
silently stops covering anything, which is what the reachability check did when `.tsx` fell
outside its filter this morning.

### And the mount guard needed a narrower rule here

B2's "the mount line has no `&&`" does not work for this one — it legitimately lives inside
`{currentStage === 'research' && (`. A mutation adding `{false && ` to the same line passed every
other assertion. The check is now that the element's own line carries the element and nothing
else.

Each: move the relevant JSX into `[projectId]/_tabs/<Name>Tab.tsx`, no logic changes, and a wiring
test asserting the page imports and mounts it. Target: no file over ~600 lines when B is done.

## G12 — four hand-written copies of one list, and a test that broke another test (2026-08-31)

### The sweep

Chasing the D0 defect pattern — *a display that renders a key its producer does not write*. Every
`data_category` value the research pipeline can emit, checked across all four places the set is
written down: the TypeScript union, the extraction prompt, the table's `CHECK` constraint, and the
UI. **The prompt and the constraint agree on all 26** — clean, and the third clean sweep on this
axis.

The probe was wrong twice before it was right, in both directions. A bare-word match made every
category look produced (`area`, `other`, `symbol` and `coordinate` are ordinary English and appear
in prose). Tightening to quoted-only then reported `boundary_description` and `date_reference` as
never produced — they are listed **unquoted** inside the prompt's bracketed list. Neither reading
was a finding.

### What it did find

`zoning`, `utility_info`, `annotation` and `symbol` were in the prompt and in the constraint but in
neither of the UI's two lists. The prompt asks the model for all four; the constraint accepts all
four. They rendered with a lowercased auto-label and the generic paperclip, sorted last — degraded
rather than broken, only because a `info?.label || cat.replace(...)` fallback happened to be there.

The map was typed `Partial<Record<DataCategory, …>>`, which is what allowed it. It is now a plain
`Record`, so **adding a member to `DataCategory` is a typecheck failure at the point that needs to
know**. `__tests__/research/data-categories-agree.test.ts` covers the other three lists, which tsc
cannot see into: SQL, a prompt string, and an ordering array.

The pair whose drift would be invisible is the prompt against the constraint. PostgREST returns
`{ error }` rather than throwing, so a category the prompt asks for that the table rejects does not
fail the run — the insert is refused and the data point is simply absent from the report.

### And a bug this work introduced, found by the full-suite run

The suite failed in `__tests__/saas/starr-assumptions.test.ts` with
`ENOENT: … lib/research/__filter_probe_jsonb__.ts` — a file belonging to a completely different
suite.

Nine self-checks in `writes-hit-real-columns.test.ts` wrote a temporary `.ts` **into**
`lib/research/`, scanned it, and deleted it in a `finally`. Vitest runs test files in parallel
worker threads, and the assumptions audit walks `lib/` — it caught a probe between the `readdirSync`
that listed it and the `readFileSync` that opened it.

> Each probe passed alone. Each passed when its own file ran alone. The failure surfaced in an
> unrelated suite, only in the whole-suite run, and did not reproduce on a rerun.

Fifteen probes across four files now pass their source **in memory**; the scanners take an optional
`sources` map. Two of the four files were found by the guard, not by me:
`worker-endpoint-contract.test.ts`, `modals-do-not-close-on-outside-click.test.ts` and
`supabase-errors-are-read.test.ts` all had the same pattern.

`__tests__/research/tests-do-not-write-into-source.test.ts` is the general form — no test may create
a file inside a tree the repo's own scanners walk. Its first version paired "this file contains a
write" with "this file mentions a path in a scanned tree" and reported
`worker-endpoint-contract.test.ts → worker/src/index.ts`, a path that file only **reads**. The
finding was real; the evidence named the wrong line, which is the sort of report that sends someone
to change working code. It now resolves the variable from `path.join(ROOT, …)` to the write call,
and two tests pin both directions.

### Mutation-tested

Six mutations against the category guard — a category the prompt asks for that the constraint
rejects, one the constraint accepts unasked, one dropped from each UI list, `Partial<Record>`
restored, and a parser regex broken so it returns an empty set. **All six caught**, the last by the
control: an empty set agrees with everything, which is how a check like this passes while enforcing
nothing. Two more against the moved probes confirmed they still fail when their scanner is broken.

## G13 — the contrast pass said "clean" while 131 inline styles went unmeasured (2026-08-31)

Found while extracting the Review tab's Property panel for B1a. Its empty state was
`style={{ color: '#94a3b8', fontStyle: 'italic' }}` — **2.56:1 on white**, sitting inside a block
F2 had just declared clean.

> F2 measured **stylesheets**. No stylesheet contains an inline style, so 131 of them were never
> looked at. A green tick that covers less than the reader assumes is worse than no tick.

### The first sweep of them was wrong, in the now-familiar way

Assuming white behind every inline colour produced **64 findings, 61 of them wrong**:
`style={{ background: '#059669', color: '#fff' }}` is a green button with white text, reported at
1:1. And the scratch probe collapsed each block comment to a single space before counting lines, so
every line number after one was wrong — the offset-misalignment `writes-hit-real-columns` already
records in its header, reproduced exactly.

What the auditor measures now is a **real pair** in the same style object, or the page background
when the file paints nothing dark anywhere — and nothing else. A background that is declared but
unresolvable (`background: severity.color`) is not the page either, which is the same rule the
stylesheet side already had. **Three genuine failures** survived that, and are fixed.

### The new check read its own prose — and its own control caught it

`paintsDark` used the shared `stripComments`, which removes CSS `/* */` only, because in a
stylesheet `//` is not a comment. Over TSX that left every `// … bg-gray-900 …` line standing, so a
comment **explaining** that a file used to be dark marked the file as dark — and every unpaired
colour in it went unmeasured.

Ninth instance of a check in this repository matching its own prose. The first one it did not take
a human to notice: the control asserting exactly this failed on the first run.

### Fourteen more in the Review tab

`page.tsx` carries fourteen inline `#94a3b8` text colours. The tool **skips that file** — it paints
something dark somewhere, so it cannot honestly assume the page behind them. They are raised to
`#4B5563` (2.56:1 → 6.90:1) on the strength of reading the panel, and that distinction is stated
rather than blurred: the tool did not verify these.

`verify:contrast` now measures 799 pairs and skips 271. The skip ratio moved from 12% to 25% by
design — most inline colours have no paired background — and the control's threshold moved with it,
to 0.4, with the reason written down rather than the number quietly raised.


## G11 — `N 30° 15' E` did not parse (2026-08-31)

Found by sweeping for duplicated geometry *after* the previous slice duplicated some itself. The
sweep was meant to be housekeeping. It turned up a defect.

`lib/cad/geometry/bearing.ts` **required seconds**. A quadrant bearing written to the minute — an
entirely ordinary deed call — returned `null`.

The research boundary route had grown its **own** parser accepting `(d{0,2})` seconds, precisely
because the shared one would not take them. And that route collapses an unparseable leg to a
zero-length segment:

> **A plat with minute-precision calls drew a boundary with sides missing, and said nothing.**

On the CAD side the same input is rejected at entry, by five components.

### Two parsers that disagreed, and the narrower one was the shared one

That is the worst arrangement of the two: only one of them ever gets fixed, and it is not the one
that quietly works around the gap. The second, unintended difference was that the route's regex
was **unanchored** — `N 30°15'20" E and more` parsed happily, taking the prefix. Consolidating
makes that stricter, which is right: silently accepting the prefix of a mis-OCR'd call is how a
confident wrong number gets into a report.

### Widened, not replaced

Every string that parsed before parses identically; the only new acceptances are ones that should
always have worked. **The existing 35 bearing tests passing unchanged is the evidence** — that is
what made it safe to touch code five CAD components depend on.

Mutation-tested four ways: reverting the widening, defaulting missing seconds to something other
than zero, dropping the anchor, and unwiring the route. The last one **survived the first pass** —
the test checked that the route imported the shared parser and no longer held its own quadrant
arithmetic, but not that it CALLED it. Replacing the body with `bearing ? 0 : null` passed both:
every leg would have come out due north.

### B1a — ninth slice: **correcting the eighth** — SHIPPED 2026-08-31

The eighth slice extracted the traverse maths and tested it. The maths was right and the tests
were good. **The module was still a mistake**: `lib/cad/geometry/bearing.ts` already had
`forwardPoint`, `inverseBearingDistance`, `azimuthToQuadrant` and `formatBearing` — with its own
tests, used by five CAD components.

So that slice fixed *untested* by introducing *duplicated*, which is the worse of the two. **Its
own commit message warned about exactly this**, about `azimuthToBearingSimple`, in the same
breath.

### How it was found, and when it should have been

By grepping `Math.sin(rad)` across the repo while chasing a **third** copy of the same maths
inside `handleUpdateVertex` — editing a vertex by bearing and distance had its own implementation
all along. That grep is the one that should have run *before* writing any of it. "Check whether
this already exists" is a rule this doc records four times about parked plan items; it applies to
library code too.

### What the correction did

- **Three call sites onto one implementation** — add-leg, close-traverse and edit-vertex all go
  through `forwardPoint` / `inverseBearingDistance` now.
- **`traverse-geometry.ts` kept only what is genuinely this page's**: `needsClosing`, which is a
  decision (at least three vertices, and not already closed) rather than geometry. 47 lines.
- **One bearing format.** The page rendered `N 30° 0' 0" E`; every CAD surface renders the
  survey-standard zero-padded `N 30°00'00" E`. **One product showing a bearing two ways is a
  defect of its own**, and this is a visible change — the traverse panel's bearings now match the
  drawing's.

Mutation-tested five ways, including both attempts to regrow a local copy — in the module and in
the page. All five fail.

The test file shrank from 17 assertions to 10, deliberately: the maths is covered by
`__tests__/cad/geometry/bearing.test.ts` where it belongs, and duplicating those assertions here
would be the same mistake in the test layer. What stayed is `needsClosing`, the round-trip
property, and guards that the page has not grown a fourth copy.

### B1a — eighth slice: the traverse GEOMETRY — SHIPPED 2026-08-31

`_sections/traverse-geometry.ts`. Second state-first slice, and the most consequential one: this
is **surveying**, not UI plumbing, and it shipped with no test of any kind.

It was three closures inside a 3,300-line component — unreachable, therefore uncalled by anything.
Each rule is a convention that is easy to get backwards and impossible to notice from the code:

| | Why it is a trap |
|---|---|
| `sin` on easting, `cos` on northing | Azimuth is from **north**, not from the x-axis. Swapping them mirrors the whole traverse about the 45° line — and the result still looks like a plausible parcel. |
| `Math.atan2(dx, dy)` | `atan2` is conventionally `(y, x)`. The usual order rotates **every closing leg by 90°**. |
| `S 30° E` is azimuth **150** | Two of the four quadrants measure *back* from south. A reversed subtraction gives a bearing that reads correctly and points somewhere else. |

**A wrong closing leg does not throw.** It closes the parcel to the wrong corner by a few feet —
the size of error a surveyor might blame on the record rather than on the software.

Seventeen tests now pin it, including the property that matters: closing a leg and then walking it
must land back on the first corner. Any sign or argument-order slip breaks that even when the
individual numbers look reasonable.

Mutation-tested seven ways — swapped sin/cos, `atan2` reversed, normalisation dropped, quadrant
arithmetic reversed, a two-point traverse allowed to close, the already-closed check removed, and
the page unwired from the module. All seven fail.

The page **shrank 13 lines** this time, and its own `azimuthToBearingSimple` is gone. Two
implementations of a coordinate convention is how they drift, and the page's copy is the one that
would have run.

### B1a — seventh slice: the undo/redo RULES — SHIPPED 2026-08-31

`_sections/annotation-history.ts`. Not a component: the mechanical extractions have run out.

Measured — the two stage blocks still inline reference **90 identifiers** (`review`) and **75**
(`jobprep`) from the page. A 90-prop component moves complexity without reducing it. **What blocks
those extractions is not markup, it is state.**

### It shipped untested, because it could not be reached

Undo/redo was four `useState`s and four closures inside a 3,600-line component. There was no way
to call it, so there were no tests — and it is exactly the kind of logic that looks obvious and is
not:

- **a new edit must DISCARD the redo stack.** Without that, undo → edit → redo restores a state
  that never followed the edit, and the drawing silently regains annotations the surveyor deleted.
- **the 50-entry cap must trim the OLDEST.** `slice(0, 50)` keeps the fifty oldest and throws away
  everything recent — one character from the opposite of an undo stack.
- **a drag must not commit.** Every mouse-move calls the silent path; committing would make one
  drag a hundred undo steps.

All three are now pinned, and all three fail under mutation.

### A `useAnnotationHistory` hook was written first and DELETED unshipped

Swapping the page onto it meant rewriting **83 references** in a 3,278-line file with no way to run
the result — and until every one of them moved, the hook would have been **dead code**.

**That is the exact defect this session spent the day fixing**, and a rules module is an especially
easy place to commit it: it compiles, its own tests pass, and the page carries on with the logic it
always had. So the rules came out and the state stayed. The page's four handlers call them, the
inline `MAX_UNDO_HISTORY` is gone, and a guard asserts all of that — including that `applyHistory`
writes all four pieces, since setting only `annotations` would make undo appear to work once and
then repeat the same state for ever.

The page grew 17 lines. That is the honest cost of the seam, and it buys logic that can be tested
at all.

### B1a — sixth extraction: `_sections/FinalDocumentTab.tsx` — SHIPPED 2026-08-31

The Final Job Package tab — the deliverable a surveyor hands over. 271 lines out;
**3,526 → 3,278**. Six sections; the page is **402 lines lighter** than when B2 started.

### The whole-stage approach stopped working, and that was measured first

The four earlier extractions each took a stage. `jobprep` will not go that way: it references
**79 identifiers** from the page — the CAD canvas, annotation history, the undo stack, tool
settings, layer state. **A component with a 79-prop interface moves the complexity without
reducing any of it** and adds a prop-drilling layer on top. Counted before attempting it, which is
why it was not attempted.

So the stage comes apart from the inside, largest coherent piece first. This tab is display plus
three actions and holds no state.

**The Drawing tab is where the other seventy-odd live.** Its state wants extracting into a hook
*before* its markup moves — a different technique from the six mechanical moves so far, and its
own slice rather than something smuggled into this one.

### A placeholder type is a cast wearing an interface

The first draft guessed the prop shapes: `{ id?: string; name?: string }` for the drawing,
`{ overall_confidence?: number }` for the comparison, `() => void` for the export. **`tsc`
rejected four of them across three rounds**, and the fix each time was to use the type the CHILD
already declares — `RenderedDrawing`, `ComparisonResult`,
`(format: ExportFormat, viewMode: ViewMode) => Promise<void>`.

Guessing a type to make an extraction compile is the same mistake as G10's cast: both tell the
compiler to stop asking a question that had a real answer. `onChangeTab: (tab: string) => void`
would have accepted `'finaldocument'` with no type error anywhere; it is the three-value union now.

### The inline-hex ratchet caught the move and was told the truth

It went red in both directions: `page.tsx` improved (141 → 123) and a new file appeared
(0 → 18). **Exactly balanced — a move, not an improvement**, and the baseline records it as that.
The totals were reconciled before re-baselining rather than after, because a "1 file improved"
message on a pure move is precisely the shape of false progress.

### The substring flaw, for the third time today

`toContain('<SurveyPlanPanel')` passed a mutation renaming it to `<SurveyPlanPanelX`. Same shape
as C2 (`research-modal__county-note` matched while `--warn` was renamed away) and as the
pipeline-note guard an hour ago (`research-pipeline-note` matched the button's
`research-pipeline-note__link`). **An element has to END somewhere** — matching the name alone
matches every name that starts with it.

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

### D1 — `ResearchRunPanel` — first extraction SHIPPED 2026-08-31, and it found a defect

The size problem is barely dented — 1,771 → 1,747 lines. **What came out of it is the point.**

### `Stage 3.5` reported itself as stage 3, for as long as the panel has existed

`inferMicroStage` ran its checks in source order, testing for stage 3 before stage 3.5:

```ts
if (/stage\s*3/i.test(message) || …) { … return 'extracting'; }
if (/stage\s*3\.5/i.test(message) || /reconcil/i.test(lower)) return 'validating_data';
```

`/stage\s*3/` matches inside `"Stage 3.5"`, so **the second line could not be reached by stage
number at all**. `worker/src/services/pipeline.ts:2023` posts exactly `Stage 3.5: Geometric
reconciliation…`, and "reconciliation" contains none of `validat`/`summar`/`compil` — so the
stage-3 block fell through to its default:

> The panel displayed **"Extracting Data"** for the whole of geometric reconciliation — a stage
> that runs for minutes on a plat with many curves. The progress bar sat on the extraction step,
> and an operator watching a long run had no way to tell it had moved on.

The `/reconcil/` half of that dead line would have caught it. It never got the chance.

Specific before general is the rule it violated. Both halves of the fix are in: the 3.5 test runs
first, **and** the general stage-3 pattern refuses a decimal, so a future `Stage 3.7` cannot
reintroduce the same bug through a reorder.

### The test is written against the worker's real strings

Including a check that the worker still posts them. An inference over a message another service
produces is only as good as the strings it is tested with — and a suite that keeps passing against
messages nothing sends any more is how a progress display drifts away from the pipeline it claims
to describe. That is [[project_map_and_surveying_backend_complete]]'s defect pattern, pointed at
the test rather than the code.

### One mutant survived, and it is genuinely equivalent

`progressPercent` clamps to 6–96. The ceiling binds; **the floor cannot** — eight stages put the
first at 13%, so `Math.max(6, …)` never changes a returned value. Mutating it to `Math.max(0, …)`
survives, correctly. It is written down in both the function and the test rather than papered over
with a contrived assertion, so nobody later reads the surviving mutant as a missing test. The
clamp stays: it starts mattering at four stages or fewer.

Four of five mutations caught, including restoring the original ordering — which is what proves
the defect was real rather than a reading of the code.

### D2 — `PipelineProgressPanel` — first extraction SHIPPED 2026-08-31, with two defects

1,521 → 1,470 lines. As with D1, the extraction is the excuse; what it exposed is the value.

### "Done" was defined twice, differently, and agreed only by coincidence

This panel had an allowlist:

```ts
status === 'success' || status === 'partial' || status === 'failed' || status === 'complete'
```

`ResearchRunPanel`, polling the **same endpoint**, had a denylist:

```ts
normalizedStatus !== 'running' && normalizedStatus !== 'starting'
```

They agree today because the worker returns exactly four statuses. They fail in **opposite
directions** the moment that set grows:

· a new **non-terminal** status (`queued`, `retrying`) is *done* to the denylist — the run panel
  stops polling and reports the run finished — and *running* to the allowlist, so the panel beside
  it goes on spinning;
· a new **terminal** status (`cancelled`, `timeout`) is *done* to the denylist and *still running*
  to the allowlist, so the progress panel spins forever on a run that has stopped.

One definition now, naming both sets explicitly, and **an unknown status counts as still
running** — the safe direction, because declaring a run finished when it is not is the error that
loses the rest of the log.

### A run that retrieved nothing did not say so

```ts
result.documentCount != null && result.documentCount > 0 && (…)
```

The `> 0` hid the row entirely, so a run that found **nothing** rendered identically to one where
the field was never reported — "we looked and found none" against "we do not know". That is the
distinction this portal keeps losing, and the repo's own `SegmentedTab.count` already states the
rule: *0 renders — "0 documents" is information, not absence.* It reads **"none retrieved"** now.

A smaller one alongside it: `verified` was a bare `✓` carrying the entire meaning, announced as
"check mark" or as nothing. The word is the signal now; the glyph decorates it.

### A `try`/`catch` that could never fire

`formatTimestamp` wrapped `toLocaleTimeString` in a catch. It does not throw on an Invalid Date —
it **returns the string `"Invalid Date"`**, which went straight into the copied diagnostic log. An
explicit `Number.isNaN(d.getTime())` check replaces a guard that had never once run.

Eight mutations, all caught — including the unknown-status direction, the two lists overlapping,
the denylist returning, and the zero-document row being hidden again.


**Re-scoped by D0.** The reason to split these was to surface run visibility; the visibility turned
out to exist and be broken by one word. What remains is genuine but is now a *size* problem rather
than a *missing feature* problem, and should be prioritised as such.

Split each into a container plus presentational sections; surface phase, elapsed, spend-so-far and
the **skipped list** (`run-budget.ts` records what a run did not do and why — a partial result that
does not say what is missing is indistinguishable from a complete one).

### D3 — Run console + diff ✅ **ALREADY SHIPPED — closed 2026-08-31**

Checked rather than built. `_sections/ResearchStagePanel.tsx` mounts `RunConsoleBar` and
`RunDiffPanel` in flow, above the run panel — which is exactly what this item asked for. The B1a
extraction did it in passing and nobody wrote it down.

**Seventh parked premise in this repo to be stale when checked, and the second to be stale
because the work was already done.** Checking cost one `sed`.

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

### E2b — Re-theme `BillingTab` and `LibraryTab` ✅ **BOTH SHIPPED 2026-08-31**

`LibraryTab` is re-themed. 36 dark Tailwind utilities → **zero in live code**: the portal's
`research-page` shell, the shared primitives for the three data states, and a new
`research-library__*` block for what is genuinely specific to a document list.

Inside a tab panel `min-h-screen` fills nothing — it just wrapped the portal's own chrome around a
black rectangle. That is why E2 declined to fix only the error state here.

**Not just a repaint.** Four things were wrong under the paint:

· The two selects had **no labels at all** — "All Counties" and "Newest First" were the only clue
  what each controlled, and a screen reader got neither.
· Rows styled `hover:border-blue-600` and nothing for focus, so tabbing through 25 documents moved
  an invisible cursor.
· Counts carried meaning in colour alone (`text-green-400`, `text-yellow-400`); they are `StatPill`
  tones with words now.
· The empty state told **everyone** to "run a research project to harvest documents" — wrong advice
  for somebody with 900 documents behind an active county filter.

### The tripwire for this entry passed for the wrong reason

`one-state-vocabulary` existed precisely to fail when this deferral stopped applying. It ran
`read(f).includes('min-h-screen bg-gray-950')` over the raw file — and after the re-theme it still
counted LibraryTab as dark, **because the comment explaining the re-theme quotes the string being
searched for**.

> A deferral tripwire went green on a file with no dark utilities left in it. Ninth time a guard in
> this repository has matched its own prose.

Comments are stripped now, with a control proving the stripper did not simply blank the file.

### And `panel-contrast` failed a file for being fixed

Its `DARK_SURFACES` was six hardcoded paths, despite its own comment saying the list came from a
sweep. It demanded an explicit colour on an `<h1>` that now correctly inherits the light global —
failing LibraryTab for no longer being dark.

The list is swept now. Same count, different membership: it had **never included
`InteractiveBoundaryViewer.tsx`**, a dark panel whose headings and labels went unchecked for as
long as the list was typed by hand. That is the drift that mattered — the stale entry was noisy,
the missing entry was silent.

One more thing fell out: the per-file "no headings found" control failed a panel for legitimately
having none. It is corpus-wide now, which is the level it was actually protecting.

### The empty-state decision is a function, not three JSX props

Mutation testing drove this. A mutation that flipped **one** of three inline copies of the
`filtersNarrowed` condition passed every text-based check: all the copy was still in the file, the
component simply disagreed with itself about which state it was in. `emptyLibraryCopy()` is pure
and exported, so a logic change is one call away instead of invisible.

Two more survivors on the way: `toContain('<ErrorState')` also matches `<ErrorStateX` (**fourth**
time that substring flaw has got through here), and testing the helper is not testing the caller —
hard-coding `title={'Your document library is empty.'}` left every string the helper returns still
sitting in the file. Thirteen mutations in total, all caught.

### `BillingTab` — the second half, shipped the same day

63 dark utilities → **zero in live code**. But the paint was the least of it; three things were
wrong underneath, and none of them were about colour:

· **"Manage Subscription ↗" had no `onClick` at all.** It rendered an external-link arrow and
  swallowed every click. `/api/admin/billing/customer-portal` has existed the whole time — it opens
  a Stripe portal session when configured and otherwise returns a **503 whose message explains that
  billing is still being finalised**. That 503 is the answer most operators get today, because
  Stripe is deliberately off, and it is a far better answer than silence: the old behaviour was
  indistinguishable from a broken page.
· **The four sub-tabs were plain `<button>`s** — no `role="tablist"`, no `aria-selected`, no arrow
  keys — in a portal that has carried `SegmentedTabs`, with the whole keyboard contract, all along.
· **Every table was bare markup**: no caption, no `scope` on any header. A screen reader read eight
  columns of purchase figures with nothing tying them together.

Two colour-as-meaning maps went with it. `STATUS_COLORS` painted subscription status in five hex
values — "past due" is not a thing to say in amber alone — and `TIER_COLORS` coloured both the tier
heading and the usage meter per plan, decoration standing where a reader expects meaning. Status is
a `StatPill` tone with the word beside it; `TIER_COLORS` is deleted, not merely unused. The monthly
chart's figures were carried by `title=` alone, which never appears on a touch device and is not
announced; they are text now.

### The tripwire fired, hours after being fixed

The previous slice found this entry's own deferral test passing for the wrong reason — it matched
the comment explaining the re-theme. Fixed, it then **failed the moment BillingTab was re-themed**,
which is exactly what writing a deferral down as an executable claim is for. It is inverted now:
it holds both tabs light, and checks the tablist, the wired button, the tones and the captions.

`panel-contrast` needed no edit at all — the swept `DARK_SURFACES` dropped BillingTab by itself.
That is the derived list paying for itself one slice after it replaced six typed paths.

Seven mutations: a dark utility restored, the tabs un-primitived, the button unwired, the 503
swallowed, `scope` removed, captions dropped, and `role="status"` swapped for `alert`. One survived
first time — asserting `portalNote` was *present* passed while `{false && (` stopped it rendering,
because the name still sat in the state declaration. Testing for a name is not testing for a
render.



**Why they were left out rather than half-fixed.** Both are entirely dark-themed pages —
`min-h-screen bg-gray-950`, their own `<header>` — left from before the portal consolidation, while
the other five tabs use **zero** dark Tailwind (counted, not assumed). Swapping only their *error*
state to the light primitive would make them inconsistent with their own surroundings: worse than
the inconsistency being fixed. They need re-theming wholesale, which is a page rewrite, not a state
consolidation.

A test pins the deferral: if either stops being a dark full-page layout, `one-state-vocabulary`
fails and names this entry. A deferral that no longer applies should not sit silently in a doc.
### E3 — Responsive pass ✅ **SHIPPED 2026-08-31** — `e2e/research-responsive.spec.ts`

The last open slice on this doc, and the only one a browser rather than a test had to settle. It is
a browser now, driven, against a **production** build on `next start -p 3050` — not a person
scrolling and forming an opinion.

**Twenty-six checks: twelve routes × two widths, plus the eight Review tabs at each.** Every one
passes.

#### What it asks

The existing `mobile-overflow-audit.spec.ts` covers twenty-two admin routes at 360px and asserts one
thing. **Not one research route is in its list** — this portal has been outside every responsive
measurement the repo has. This adds them, at both widths the doc names, and asks three questions:

1. does the page scroll sideways — what a reader actually sees;
2. is any control unreachable because something is parked on it — measured with `elementFromPoint`
   at the *end* of the page, not from a screenshot, for the reason that file already records;
3. at 1440, does the content collapse into a narrow column of a wide empty page.

(3) is the desktop half, and it is why "responsive" is not a synonym for "works on a phone". A
portal that lays out a 600px column in a 1440px window has failed no assertion and is still the
wrong answer for a screen whose job is reading a deed beside a plat. Floor: two thirds of the
window. Worst measured is `/self-heal` at 1036 of 1440.

The probes moved to `e2e/_responsive-probes.ts`. Importing them from a `.spec` **executes** it, so
every test that file registers would run again under the importing one; copying them would be G12
with a longer fuse, because the copy that stops being maintained is the one that goes on reporting
clean.

#### G16 — the reset-view button could not be clicked

`/admin/research/[projectId]/boundary`. The boundary viewer's zoom stack is `absolute bottom-4
right-4`; `.fab-menu` is `position: fixed; bottom: 1.5rem; right: 1.5rem` at z-index 90. The
bottom-most of the three — **reset view** — sat under the pill, and the tap landed on the FAB. Moved
to `bottom-28`, which clears it with room for the shadow.

Found by the occlusion probe, which is the whole argument for asking `elementFromPoint` rather than
looking: two rectangles overlapping is not the defect, the click landing on the wrong one is.

#### The Review tabs are state, not routes — so they are driven

Nothing route-based ever renders `easements`, `survey` or the coherence panel: they are behind a tab
bar that only appears at `status: 'review'`, and the one project on this account sits at `upload`. A
responsive pass that measured the default tab would have measured one eighth of the screen — the
seven eighths this doc spent the day rewriting being the other seven.

Two ways forward and only one acceptable: advance the owner's real project through the pipeline, or
hand the page a project. The first writes to live data to make a layout test pass, which is how a QA
suite gets banned. So `page.route` replaces exactly one response and everything else stays live.

**And the fixture is deliberately verbose.** These panels render nothing when their data is absent,
so an empty run would have measured eight empty tabs and pronounced the portal responsive. It
carries a three-pass coherence review, a four-link chain of title with a real break, a plat
analysis, FEMA and TxDOT readings, two recorded easements and two covenants — with real instrument
numbers and real bearings, because overflow is a function of content length and `"foo"` in every
field is how a layout audit passes a layout that breaks.

Measured content per tab at 390: Summary 3,732 chars, Survey Data 1,790, Easements 1,656. None
scrolls sideways at either width.

#### Two instrument failures worth keeping

Both cost a wrong answer before they cost a fix.

**A stale server serves 400s for its own assets.** `next build` replaced `.next` under a running
`next start`, the second `next start` could not bind the port and exited quietly, and the first went
on serving HTML that referenced chunk files the rebuild had deleted. Every asset 400'd, React never
hydrated, and the page sat on the admin shell's *"⏳ Loading…"* — which reads exactly like a broken
session cookie. `pkill -f` does not kill it on Windows; `Get-NetTCPConnection -LocalPort 3050 |
Stop-Process` does.

**A Playwright URL glob does not match a query string** the way its path part suggests.
`**/api/admin/research?id=…` matched nothing, silently. A predicate on `url.pathname` and
`url.searchParams` does. The assertion that caught it — *"the review panel did not render; the
fixture is not reaching the page"* — is an `expect`, not a `test.skip`, precisely so a fixture that
stops arriving turns the file red rather than quietly measuring air.

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

### F2 — Contrast ✅ **BOTH HALVES SHIPPED 2026-08-31**

The static half was already done. The browser half is now done too, and it starts with an
instrument failure rather than a finding.

#### The first three runs reported "clean" and were measuring nothing

`check-portal-themes.mjs` was run against the research routes and printed *"Every theme tested
holds up"* three times. All three were **vacuous**. `next build` had replaced `.next` under a
running `next start`; the second `next start` could not bind the port and exited quietly; the first
went on serving HTML that referenced chunk files the rebuild had deleted. Every asset returned 400,
React never hydrated, and the checker measured an empty page. A page that renders nothing scrolls
sideways zero pixels and has no unreadable text.

The same failure had already produced one wrong answer that day — E3's fixture assertion caught it
as *"the review panel did not render"*. It is worth stating as a rule: **`pkill -f` does not kill
`next start` on Windows.** `Get-NetTCPConnection -LocalPort 3050 | Stop-Process` does, and any
browser check that follows a rebuild has to prove the page rendered before it reports clean.

Against a live server: **76 problems.** The default theme was clean; all 76 were on the other ten
palettes, plus eight on the Review screen that no route-walking checker can reach.

#### The eight on the Review screen — the only place they get measured

The Review tabs are STATE, not routes. `check-portal-themes.mjs` walks routes, so it has never
rendered the coherence panel, the Survey tab or the Easements tab. E3's spec drives them, so the
same probe now runs there — extracted to `scripts/_contrast-audit-probe.mjs` rather than copied,
because a probe carrying five hard-won corrections is the worst possible thing to have two of.

Seven were in `PipelineProgressPanel`'s own `<style>` block, which `verify:contrast` reads none of:
the run log's timestamps at **2.40:1**, its warning count at **2.91:1**, the layer chip, the
footer, the filter chip. One was the inactive Review tab label at 4.34:1. All fixed.

And one false positive, fixed in the probe rather than in the app: `.pipeline-stepper__stage-icon`
renders 📋 and reported **1.62:1** on every one of the eight tabs. A colour emoji is a glyph with
its own palette; the CSS `color` never reaches a pixel. Sixth time an instrument here has reported
its own blind spot as a property of the app. Text that is *entirely* pictographs is skipped — "⚠
Warnings" is still measured, and was a real finding in the same run.

#### `--recon-card: #FFFFFF` — one literal, most of the white panels

Declared once on bare `:root`, so no theme could reach it. `.research-pipeline__section` stayed
white under starr-dark while its heading followed `--theme-fg-primary` to `#F1F5F9`: **1.1:1**, a
section title that is not there. Pointing `--recon-card` and `--recon-bg` at the tokens is two lines
and fixes every panel that uses them; the literal stays as the fallback, so the default palette is
byte-identical.

#### The rule this pass kept re-learning

**An element that brings its own background brings its own foreground.** Three separate defects were
the same half-themed shape:

| | |
|---|---|
| Coverage tone cards | Pale green/amber/red panels whose hint line alone read `--theme-fg-secondary` — `#CBD5E1` on `#F0FDF4`, **1.42:1** |
| `.research-county-badge`, active project-nav link | Fixed `#EEF2FF` chips reading `--recon-brand`: mint on pale indigo under forest-dark (1.56:1), **yellow on near-white under high-contrast-dark (1.04:1)** |
| The testing lab badge | White on `--lab-accent`, which this pass had just lightened for the dark palettes — the fix breaking its own neighbour, until `--lab-accent-fg` made the pair move together |

#### The two Tailwind-dark pages, and a specificity fight worth recording

The boundary viewer and the documents page are dark applications built with Tailwind inside a light
admin shell. Under a theme they came apart — `A.text-gray-400` rendering at **1.61:1**, `LABEL` at
2.34:1 — and the cause is one step past what `panel-contrast.test.ts` records. `globals.css` sets
`a`, `p`, `label` and `h1–h6` by element selector and the themes re-point `--brand-red` /
`--brand-dark` at the palette's LIGHT-PAGE values. **An element rule outside `@layer` beats a
Tailwind utility inside one**, so `text-gray-400` on that anchor never applied — on any theme,
including the default.

`.research-dark-app` is the route-scoped answer, and it is the one block in `AdminResearch.css` that
uses `!important`. Not to beat `a { }`, but `AdminLayout.css:86` — `.admin-layout a:not(.btn):not(…)`
at specificity **0,6,1**, which is right for the light admin. Out-specifying it means repeating the
class seven times or copying six `:not()` clauses, both of which encode the number 6 in a second
place where it will rot; lowering it with `:where()` changes the cascade for every admin page to fix
two. `!important` on one class across two pages says what it means.

The container also declares `background: #030712` rather than leaving it to `bg-gray-950` — which
`verify:contrast` immediately needed, because without it the checker read
`.research-dark-app .text-white` as white on the page and reported 1:1.

#### `--recon-subtle`, and one pair that genuinely needs two values

Nine rules hard-coded `#FAFAFA` for inset panels. Pointing them straight at `--theme-bg-elevated`
would have worked *and* moved the default from `#FAFAFA` to `#F1F5F9` — a bluer, darker grey that
drops the deed-chain break count from 4.73:1 to **4.41:1**. So the default keeps its exact value and
only a non-default palette follows the token.

`--recon-danger-text` is the same shape and the honest exception to "one token, one value": a red
dark enough for a white page (`#B91C1C`, 6.47:1) is **2.9:1** on a black one. Two values, stated.

#### And a fix applied to the wrong theme

`plum` went into the dark-palette list on the strength of its name. Its page is `#FAF5FF`, so the
lightened lab accent measured **2.54:1** on it. Caught on the next sweep, which is the argument for
re-measuring every palette after every change rather than the two you were looking at.

#### The reporter was miscounting its own output

`check-portal-themes.mjs` printed up to 40 findings and then announced *"…and `size - 10` more"* —
so a run that printed all 25 of its findings told the reader to go looking for fifteen more that
were already on the screen. The cap and the count are one constant each now.

**Final:** 11 palettes × 12 research routes, **no unthemed surfaces and no unreadable text on any of
them**; `verify:contrast` clean over 938 static pairs; the eight Review tabs clean at both widths.

---

#### The static half, as originally recorded

**28 real failures found and fixed** across the research stylesheets, plus a new checker that runs
with no server: `npm run verify:contrast`.

`check-portal-themes.mjs` is still the real instrument — eleven palettes across twenty-five routes,
rendered — and its 232 problems remain a programme rather than a slice. What ships here is the
cheap half: every rule in the three research stylesheets that sets a literal `color`, paired with
the background it will actually sit on, on the **default theme only**. It cannot see cascade,
inheritance across components, or what a themed token resolves to in the other ten palettes.

> A clean run of this does **not** mean the browser check is clean. It is a floor.

### The auditor was wrong four times before it was right

Each wrong version produced a confident list of findings, and each one was worth writing down:

1. **Siblings read as ancestors.** "The longest selector in the same BEM block that declares a
   background" is almost always a *sibling* — it measured `.research-page__title` against a blue
   chip elsewhere on the page and called a heading a 2.84:1 failure. **Twenty of the first
   twenty-two findings were that artefact.**
2. **An unresolvable background read as white.** `background: var(--recon-brand)` has no hex
   fallback, so fifteen perfectly legible buttons reported white-on-white at 1:1.
3. **A defined token read as its fallback.** `color: var(--theme-fg-muted, #9CA3AF)` appears 45
   times; the token is declared on bare `:root`, so the fallback never renders. Measuring it
   produced **58 false failures — a fifth of the whole run**.
4. **"First definition wins" across a themed sheet.** `themes.css` declares every token once per
   palette, so the first match came out of a DARK block and the checker reported white-on-white
   headings across the entire portal.

**158 findings became 28 once the instrument was correct.** Reading the fallback is right for a
token defined nowhere and wrong for one that is defined; both cases exist here, which is why the
definitions are gathered first and the fallback consulted only on a miss.

### What the 28 actually were

Nothing exotic — Tailwind ramp values typed into a rule because they looked right on a white card:
`#059669` at 3.77:1, `#DC2626` at 3.95:1 on its own pale-red badge, `#93C5FD` at 1.8:1, and a
canvas tooltip **value** at 1.13:1, which is the one that was genuinely unreadable.

Fixes are per-context, never global. `#DC2626` clears 4.83:1 on white and fails only on the pale
red and slate surfaces — a blanket substitution would have darkened rules that were already
correct, and no measurement justifies that. Two came out better as **token** changes:
`--recon-success` is one value behind four failing text uses and two decorative connectors, so
darkening it once fixed all four; and two count pills were using `--theme-fg-muted`, which is
calibrated against the page rather than against the grey chip they sit on (4.12:1) — they use
`--theme-fg-secondary` now, and stay themed rather than pinning a literal.

One safety rail earned its place mid-slice: a scripted edit asserted its pattern would match
**exactly two** rules, found five, and aborted before writing. Three of those five sit on the page
and were already fine.

Six mutations, all caught — including a broken luminance curve, and the parser silently matching
nothing, which would otherwise report zero failures and pass.


---

## G1 — Two working API routes nothing could reach (2026-08-31)

Not a planned slice. Found by sweeping the research path for the defect this repository keeps
producing, rather than by refactoring more of it.

**`BoundaryCallsPanel.tsx`** — 596 lines, styled, its classes defined and its stylesheet loaded on
the route — was mounted by nothing. It was the **only caller** of two live API routes:

- `/api/admin/research/[projectId]/boundary-calls` — *"Fetch boundary calls from county CAD"*
- `/api/admin/research/[projectId]/browser-fetch`

Both routed. Both working. Neither reachable from the product. **That is not dead UI, it is dead
capability** — reading a boundary out of the county record is close to the centre of what this
software is for.

Now mounted on the boundary page, behind a disclosure in the Field Work group: that page is already
showing the calls, and *"where do these come from, and can I get the rest?"* is asked looking at
them, not from a menu two routes away. `onImported` re-runs the loader the page already has, so an
import appears in the viewer without a reload.

### Why nothing caught it — and the guard that was supposed to

`research-modules-are-reachable.test.ts` exists precisely for this, and lists ten prior instances.
It missed this one twice over:

1. It did not scan `app/admin/research/components`. Its own header warns *"a guard is only as good
   as its coverage, and the directories it skips are exactly where the next orphan will be."*
2. **It filtered `f.endsWith('.ts')`, so `.tsx` was excluded — it has never been able to see a
   React component, anywhere.** Adding the directory appeared to surface nothing, which was the
   giveaway: 43 components there, not one `.ts` file among them.

And `path.basename(p, '.ts')` leaves `.tsx` intact, so the caller search hunted for
`'…CountyNote.tsx'` — a string no import contains. Every component read as an orphan, including
ones with three importers. Caught because the result was absurd, not because the code looked wrong.

### The guard now proves its own coverage

Reverting the `.tsx` filter made the whole file **pass again, silently**: the orphan check found
nothing because components were no longer scanned, and the stale-entry check found nothing because
it only flags listed modules that *have* a caller. Coverage vanished and every assertion stayed
green — the same failure as a search that cannot return a positive.

So it now asserts it can see `.ts`, `.tsx`, and that directory, before reporting on any of them.

### Two owner calls, recorded rather than resolved

- **`InteractiveBoundaryViewer.tsx` (689 lines)** — superseded. `boundary/page.tsx` is a 472-line
  re-implementation rendering its own SVG inline. The live route works. Delete it, or replace the
  page with it — keeping both means the next person edits whichever they find first.
- **`TemplateManager.tsx` (335 lines)** — the same shape as the boundary panel: the **only** caller
  of `/api/admin/research/templates` (GET, POST, DELETE), which is routed and works, so analysis
  and drawing templates cannot be managed from anywhere in the product. **Not** wired, because
  unlike the boundary panel it has no obvious home, and picking one is a design decision rather
  than a fix.

### Mutations

Both survived the first pass and both mattered. `{false && <BoundaryCallsPanel …}` passed the
reachability chain — the exact state the slice was undoing, and a lesson B2 had already learned and
this file had not carried over. And reverting the `.tsx` filter passed everything, which is what
produced the coverage control above.

## G2 — The API surface, swept (2026-08-31)

G1 found two working routes nothing could reach. The obvious next question is how many more there
are, so all **80** research API routes were checked for a caller.

**Eleven have none.** They fall into four honest categories, which is the point — a flat list of
eleven "unreachable endpoints" would be alarming and mostly wrong:

| | Routes | What it means |
|---|---|---|
| **Called from elsewhere** | `requests`, `requests/claim` | The WORKER calls these to claim queued work. In daily use. |
| **Operator-triggered by design** | `self-heal/evaluate` | Its own module says admin-triggered. SelfHealTab wires the other three. |
| **Redundant** | `flood-zone`, `bell-cad-gis` | The data reaches the user another way — flood zone via the pipeline results, ArcGIS via `arcgis-fields.ts`. Nobody is missing anything. |
| **Dead capability** | `document-access`, `deep-lot-analysis`, `topo`, `verify-lot`, `templates/drawing/[id]/thumbnail` | Owner calls. Built, working, unreachable, with no equivalent. |

The distinction that took the most work is **redundant vs dead**. `flood-zone` looks identical to
`topo` from the route list — both Phase-11/13 proxies with no caller — but the worker computes FEMA
flood zone during every run and it lands in the results, while topo reaches the user nowhere at
all. One is a spare door; the other is a missing one.

### The matcher was wrong twice, in opposite directions

Both were caught by controls rather than by review, and both would have been damaging:

1. **False negative.** Including `worker/src` as a caller directory made every proxy look called —
   *by its own mirror image*. The worker serves `/research/flood-zone`; the app proxies it at
   `/api/admin/research/[projectId]/flood-zone`. Same tail segment, different service.
2. **False positive.** A tail-only match reported `/templates/analysis` as unreachable when
   `TemplateManager` fetches `/templates/${type}` — the segment never appears as a literal because
   it is a variable. Then the fix for that was too loose: with `research` allowed as a parent,
   `/research/${projectId}/…` matched everything, including a deliberately fake endpoint.

A false positive is the worse direction here. It invites somebody to "fix" a route that already
works, or to write a permanent exception for a lie.

So the guard carries **four controls**: it finds routes, it finds callers, it reports a route known
to be called as called, and it reports a route known NOT to exist as uncalled. The last one is what
caught the loose parent rule. Mutation-tested three ways, including collapsing the caller
directories — which the coverage controls fail on, rather than passing in silence.

## G3 — "no time limit is configured for this run" (2026-08-31)

The run console showed that sentence for **every run it has ever displayed**, while the limit was
configured and being enforced — the worker winds a run down when it reaches the ceiling and says so
in the budget summary two lines below on the same panel.

```
the worker persists  { maxWallClockMs, maxCostUsd, maxPaidPages }
the app read         run.limits?.maxMinutes  /  maxUsd
```

Nothing has ever written `maxMinutes` or `maxUsd`. So `budgetMs` was permanently null, which made
`fractionUsed` permanently null — any indicator showing budget used showed nothing — and sent the
headline down its "no limit" branch every time.

**This is D0 again, four fields further down the same file.** `run-store.ts` typed `skippedWork` as
`unknown[]` and every skipped step rendered as "unnamed work"; `limits` was
`Record<string, unknown>`, and `index.ts` wrote it through
`budgetLimits as unknown as Record<string, unknown>` — a **double cast that erases the type on
purpose**. `unknown` accepts any shape by definition, so the compiler had nothing to say either
time. Both are typed now and the cast is gone; producer and consumer are bound by the compiler.

**Found by asking what caused D0 rather than what D0 looked like.** A sweep for the SYMPTOM —
placeholder fallbacks like `?? 'unnamed'` across the research code — came back clean: all of them
are honest null-handling. Sweeping for the CAUSE instead — `unknown` / `any` on payload types that
cross the worker/app boundary — found this in the fifth line of output.

Mutation-tested five ways. One is an equivalent mutant and stayed green correctly: `> 0` to `>= 0`
changes nothing because the `&&` already short-circuits on zero. Untyping the payload again is
caught by `tsc` rather than by a test, which is the right mechanism for it.

## G4 — Every full extraction has been throwing its report away (2026-08-31)

The full-extract route persists its extraction report like this:

```ts
await supabaseAdmin.from('research_documents')
  .update({ analysis_metadata: { full_extraction_report, extraction_atoms_count, … } })
```

`analysis_metadata` is a column on **research_projects**. `research_documents` has never had one.
PostgREST rejects the update — and the call sat inside a bare `try { … } catch { }`, so nothing
was logged, nothing failed, and the route went on returning 200 with the report in the response.
Only the saved copy was lost, every time, since the route was written.

This is the `activity_log` defect again: that one wrote `action`/`details` to a table whose columns
are `action_type`/`metadata`, and recorded nothing for as long as it existed.

**Seed 621 adds the column** — per-document, not per-project, because writing to
`research_projects.analysis_metadata` would have each document overwrite the last: a quieter bug
in place of a loud one. **⚠ It must be applied to the live database**; until then the route now
says so in its log instead of swallowing it.

**The `catch` was never going to work anyway.** The Supabase client does not throw on a rejected
write — it returns `{ error }`. So the error had to be read, not caught. Both are fixed.

### The check took five attempts, and four of them reported ZERO

Every one of those zeros looked like good news:

1. **136 findings**, including columns literally named `null` and `false`, and one table's columns
   attributed to another.
2. **0** — offsets taken from a comment-STRIPPED source were used to index the ORIGINAL. Stripping
   changes lengths, so the two stopped lining up.
3. **0** — `after.slice(0, op.index)`, where `after` starts AT the `.from(`, so the "no other
   `.from()` in between" guard matched itself and skipped every candidate.
4. **0**, still, because that fix was applied to a mangled regex.
5. **4**, of which three were false positives: a ternary's true-branch
   (`storage_path: ok ? storagePath : null` read as a column called `storagepath`) and a
   multi-column `ALTER TABLE … ADD COLUMN a, ADD COLUMN b` where only the first was parsed.

It was caught each time by **injecting a fake column and requiring the probe to see it** — never by
reading the code, which looked correct at every step. That control is now the first assertion in
the shipped guard, and its probe file deliberately carries block comments, a line comment and a
URL: without something ahead of the call for offsets to drift over, breaking the blanker goes
unnoticed. That mutation survived the first pass.

**A structural check that cannot fail is worse than no check — it is a green light.**

## G5 — Every share link has returned 404 for its entire life (2026-08-31)

G4 guarded the columns research code WRITES. The read side had the same exposure and worse
consequences: PostgREST fails the **whole query** when a select names a column that does not
exist, so the caller gets no row at all. Five instances, and the damage depended entirely on how
each caller treated the error.

| Route | Asked for | What the user saw |
|---|---|---|
| `/api/share/[token]` | `legal_description`, `confidence_score`, `boundary_summary` | **404 on every share link** |
| `export-to-cad` | `address`, `owner_name` | **"Project not found" for every project** |
| self-heal proposals, sweep, cron | `name` on a table whose column is `display_name` | every proposal listed **without its vendor** |

**The share link is the one surface a CUSTOMER sees**, which is the worst place for a silent
break. And `export-to-cad` survived because of its error message: a 404 saying *"Project not
found"* reads as a bad id or a deleted record, so anyone chasing it goes looking at the project
rather than at the query.

### What the columns actually are

- `address` → **`property_address`**. `owner_name` does not exist on the table at all, and was
  never used — only the address and parcel id reach the CAD title block — so it is dropped rather
  than mapped to a guess.
- `legal_description` → **`legal_description_summary`**, aliased so the share page's response
  shape is unchanged.
- `confidence_score` belongs to **`drawing_elements`**, not to a project.
- **`boundary_summary` is defined nowhere at all** — invented, and read only by the share route
  and its page.

The last two are dropped rather than sourced from somewhere plausible. Both are optional and
already guarded on the share page, so their absence is handled — where inventing a source would
not be. They are also removed from the response builders: forwarding `undefined` while *looking*
like it carries a value is how the next reader concludes the data exists and hunts for why it is
blank.

**Three copies of the vendor bug.** The first sweep deduplicated by `table.column` and showed one;
the guard, which does not, found it in the proposals route, the sweep route AND the cron route.

The guard now covers reads as well as writes, with the same self-check — it must SEE a select for
a column that does not exist — plus two false-positive probes: an alias
(`legal_description:legal_description_summary`, which is the fix for this very bug and must not
read as a new defect) and an embedded resource. The embedded-resource skip is documented as
**redundant rather than load-bearing**, because a mutation proved the name-shape test already
rejects those fragments.

## G6 — The third way to name a column, and it was clean (2026-08-31)

There are three ways research code names a database column, and each fails the same way — the
whole query, not the one field:

| | Found |
|---|---|
| **write** — `.insert({ col: … })` | 1 bug: the extraction report thrown away (G4) |
| **select** — `.select('col')` | 5 bugs: every share link 404, CAD export dead, 3× vendor (G5) |
| **filter** — `.eq('col')`, `.order('col')` | **0** |

**Clean is a result, and it is only worth having because the controls make it mean something.**
Two of them: an injected `.eq()` on a fake column, and an injected `.order()`. Both are seen. A
zero from a probe that cannot fail is a green light, and this check has produced four of those
already today.

Guarded anyway. A check written only after something breaks arrives one incident late, and this
one costs the same nine lines whether or not it ever fires.

**A mutation found the guard lying about its own coverage.** Removing the JSONB-path split
(`limits.maxCostUsd` → the column is `limits`) survived — because the op regex was
`[a-z0-9_.]` and could not match the uppercase in `maxCostUsd` **at all**. Every camelCase JSONB
filter was invisible, and the test asserting "JSONB paths are handled" passed without ever
matching one. Widened to `[A-Za-z0-9_.]`; the mutation now fails, and no new findings appeared.

That is the second vacuous test caught by mutation today. Both looked like passing assertions.

## G7 — A full extraction wiped the project's spend record (2026-08-31)

G4 and G5 were both hidden by the same mechanism, so this slice went after the mechanism instead
of another instance:

```ts
try {
  await supabaseAdmin.from('research_projects').update({ … });
} catch {
  // Non-fatal
}
```

**The Supabase client does not throw on a rejected write — it returns `{ error }`.** So that catch
cannot fire. Not "rarely": cannot. The error sits in a value nobody read, and the shape gives every
appearance of having been considered.

### And behind one of them was a real bug

`[projectId]/full-extract` stored its synthesis by writing a **fresh object** to
`analysis_metadata`. Writing to a JSONB column REPLACES it — and that column is a shared bag:
`analysis.service.ts` keeps the run logs there, the recorded error and error_category, and (its own
comment, line 560) **the per-project API spend tracking.**

So running a full extraction destroyed the project's logs and its cost record. `analysis.service`
already had the correct shape — read, spread, write — so this was two writers to one bag, one
merging and one overwriting. Now both merge.

`lite-pipeline` had the same inert catch around its `parcel_id` save: a failure there is invisible,
and every downstream service then works without a parcel id.

### Narrowing the rule was most of the work

A first sweep said **126 of 195** research writes discard their error. Too many to be a defect
list, and a guard at that number is the noisy check nobody runs. Tightening to "result bound to
nothing" gave 79 — still debt, not bugs.

The rule that works is narrow: **a `try` whose only awaited calls are Supabase, with a catch that
does nothing.** There, the catch is unreachable by construction. Two catches in the research code
match "does nothing" and are CORRECT — `requests/claim` wraps `notify()`, which really throws, and
`analysis.service` wraps a network fetch — so they are not flagged. Having a comment is not the
discriminator either: both bugs said `// Non-fatal`.

### The guard looked broken and was not

A mutation that hand-rewrote the fixed route back into its old shape did **not** fail the check.
The obvious conclusion was "the guard is broken", and acting on it would have meant loosening a
correct rule. Running the rule over the **original file content from git** reported exactly what it
should — handler empty, awaits `["supabaseAdmin"]`, all Supabase. The reconstruction was wrong, not
the guard.

## G8 — The app/worker HTTP contract, checked (2026-08-31)

The last boundary in the research stack that nothing was checking. The app and the worker are
separate processes, deployed separately, in separate directories, with separate test suites. They
agree on a set of HTTP paths and **nothing enforced that agreement**: `tsc` sees two unrelated
string literals, both suites pass, the production build is happy, and a drifted path is a 404 at
runtime — on the machine that spends money.

Same shape as three defects found today: `skipped_work` (`{step}` written, `{what}` read), `limits`
(`maxWallClockMs` written, `maxMinutes` read), and five selects naming columns that do not exist.
Each lived only in the gap between a producer and a consumer.

**19 paths called, 69 served, 0 mismatches.** Clean — the third clean sweep today, after filters
and the placeholder scan, and worth as much as the ones that found bugs precisely because it might
not have been.

### A line-based grep would have made this check dangerous

**Twelve of the seventy worker registrations put the path on the NEXT line:**

```ts
app.post(
  '/research/flood-zone',
  requireAuth,
```

A line-anchored scan sees 58 of 70 and silently under-counts what the worker serves — which
produces **false positives**, the direction that sends somebody to "fix" a route that already
works. My own `grep -c` reported 58 and briefly convinced me the probe was broken; it was the grep
that was line-based, not the probe, whose `s*` spans newlines. Verified by asking the served set
directly for `/research/flood-zone` rather than reasoning about the regex.

Mutation-tested four ways: renaming a real worker route (its caller surfaces), dropping the
parameter normalisation (`:projectId` vs `${projectId}` — every parameterised route would read as a
mismatch), keeping the query string, and narrowing the scan to one line. All four fail.

## G9 — The owner's own request was half applied (2026-08-31)

> *"make it so that clicking off of the modal or window that takes all of the info does not close
> it. We should be required to actually click the exit button."* — 2026-08-30

Applied to the **New Research Project** modal. Not to the **Edit Project** modal on
`[projectId]/page.tsx`, which kept `onClick={() => setShowEditProject(false)}` on its overlay — so
a stray click beside it still threw away every edit, with no confirmation and no undo.

**The half that survived is the worse half**: the data being lost there is edits to a record that
already exists. Found a day later by reading the second modal rather than assuming a request had
been applied everywhere it applied.

And a **third** one: `TemplateManager`. Nothing mounts it (recorded as an owner call in the module
guard) so nobody has lost a template to it, but fixing it costs a line and means it does not arrive
with the bug already in it if the owner decides where it belongs.

The `stopPropagation` on each inner modal went too. It existed only to stop a click INSIDE the form
reaching the overlay's close handler; with no handler there it guards nothing, and a stray
`stopPropagation` makes the next reader wonder what it was protecting.

### The guard is about FORM modals, not every dialog

`ResearchRunPanel`'s *"Stop Research Pipeline?"* overlay also closes on an outside click, and that
is **right**: clicking away from a confirmation means "no", and nothing is lost by reading it that
way. The safe interpretation of a stray click is the opposite for the two cases.

So the check flags an overlay that closes on click **and contains a form**. A guard that failed on
both would be wrong about half of what it flagged, and a guard that is wrong is one people learn to
override. Both directions are pinned by probes, and removing the form check makes the confirm
dialog fail — which is how that distinction stays real rather than decorative.

Mutation-tested four ways, including removing the Escape handler: closing a door must not trap
anyone behind it.

## G10 — The owner name was collected, saved, displayed, and never used (2026-08-31)

Found while scoping the next extraction, in the line the extraction would have moved.

```ts
ownerName={pendingSearchParams?.ownerName
  ?? (project as unknown as { owner_name?: string }).owner_name ?? ''}
```

**`research_projects` has no `owner_name` column.** The create route stores it inside
`analysis_metadata` and says so in its own comment. So that expression was always `undefined` and
the owner fell through to `''`.

Not cosmetic. `ResearchRunPanel` sends `ownerName` with the run, and the worker's clerk scraper
branches on `if (input.ownerName)` to run its owner-based searches — one of the main ways
documents are found for a property. **Every project created through the form ran with that search
path switched off.** Nothing indicated it: the field accepted the name, saved it, and showed it
back.

**Four sites, not one.** Two seed `pendingSearchParams` on the auto-start and re-run paths; one
feeds the run panel; one displays it. A fifth read the RIGHT place already, through a
`((project as unknown as Record<string, unknown>).analysis_metadata as ...)` cast chain — so
somebody had worked this out before and fixed only the site in front of them.

### The cast is what hid it, and there were three more in the same object

`as unknown as { owner_name?: string }` tells the compiler to stop asking. `ResearchProject` does
not declare `owner_name` **precisely because the column does not exist** — the type was right and
the cast overrode it.

The same file cast a project to an object claiming `owner_name`, `legal_description` AND `acreage`.
None is a column; the real ones are `analysis_metadata.owner_name` and
`legal_description_summary`, and acreage only ever comes from a run result. All three had working
fallbacks, so those displays were correct and the first operand of each `||` was simply dead —
harmless there, and the identical cast on the same field was doing real damage a few hundred lines
up. The cast is narrowed to the fields that exist.

Read through a typed accessor now, which is what makes it checkable at all. A blank or whitespace
owner is treated as absent rather than passed on: `'   '` would satisfy `if (input.ownerName)` and
run an owner search for nothing.

**A mutation blanking the two re-run seeds passed every other assertion** — the re-run path is
exactly where an operator lands after a disappointing run, and `pendingSearchParams` takes
precedence over the project value there. Now covered.

## Status 2026-08-31 — why this doc stays in `in-progress/`

**Planned and shipped:** A1 A2 A3 A4 · B2 B3 B4/B5 B6 · C1 C2 C3 · D0 · E1 E2 · F1.
**Withdrawn as false premises:** B1, E1 (both replaced by what checking them revealed).

**Unplanned, and the reason this doc grew:** G1–G16. Sixteen findings, none of them on the plan,
all in the property-research software. Thirteen were live defects:

| | What it was |
|---|---|
| G1 | Two working API routes nothing could reach — `/boundary-calls` and `/browser-fetch` |
| G3 | The run console said *"no time limit is configured"* on every run that had one |
| G4 | Every full extraction discarded its report — a column that does not exist |
| G5 | **Every share link returning 404**, CAD export dead, three copies of a vendor bug |
| G7 | A full extraction wiped the project's logs and API spend record |
| G9 | The owner's own "do not close on outside click" applied to one modal of three |
| G10 | **The owner name was collected, saved, displayed, and never used** — the worker's owner-based clerk search never ran |
| G11 | `N 30° 15' E` did not parse, and the boundary silently lost that leg |
| G12 | Four hand-written copies of one list |
| G13 | The contrast pass said *"clean"* while 131 inline styles went unmeasured |
| G14 | **A ternary background was never measured at all** — four buttons and labels down to 2.15:1 |
| G15 | **The chain of title rendered white on white** — 1.23:1, plus 18 more the ancestor-blind scanner could not reach |
| G16 | The boundary viewer’s **reset-view button sat under the floating dock** and could not be clicked |

Three came back clean (filters, the placeholder scan, the app/worker HTTP contract) and each now
has a guard so it stays that way. Plus a live Chromium leak and bounded concurrent capture in the
worker doc.

**The pattern, stated once:** every single one lived in a gap between a producer and a consumer —
a column written under one name and read under another, a route with no caller, a component
nothing mounts, a cast claiming a field that does not exist. None was visible to `tsc`, to either
test suite, or to the production build. All of them were found by comparing two sides that no
check compared.

### What is left

Not deferred, and must not be marked so. Every remaining item is real work with real value; none is
blocked; none costs more than it is worth. They are simply not done.

> ⚠ **This table was itself stale, and was re-measured against the repository on 2026-08-31.**
> Four of its seven rows had already shipped, and the B1a row named three sections that **do not
> exist in `page.tsx` under any name** — `RunControls`, `DocumentsSummary` and `AnalysisSection`
> return zero matches. That is the sixth parked premise in this repository to be false when
> checked, and the first one where the false premise was written by this doc about its own work.
> The rows below are what `grep`, `wc -l` and the test run actually say.

| Item | State, measured 2026-08-31 |
|---|---|
| **B1a remainder** | ✅ **CLOSED 2026-08-31.** Thirteen extractions live in `_sections/`, every one verified imported by `page.tsx`. Every cast on the Review tab is now extracted and contract-tested — `summary`, `property`, `survey`, the coherence review (against a PROMPT) and the easements. The three named targets in the original row never existed. |
| **D1 / D2** | ✅ **SHIPPED 2026-08-31**, and each found a live defect — the Stage 3.5 label and the two disagreeing definitions of "done". Both panels remain large (`ResearchRunPanel` 1,753, `PipelineProgressPanel` 1,481); that is a size question, not an open slice. |
| **D3** | ✅ **CLOSED 2026-08-31** — already shipped. |
| **E1b** | ☐ Open, and correctly outside this doc — admin shell, not the research portal. |
| **E2b** | ✅ **BOTH SHIPPED 2026-08-31** — `BillingTab` and `LibraryTab` re-themed; the Billing pass found a button with no `onClick` at all. |
| **E3** | ✅ **SHIPPED 2026-08-31** — `e2e/research-responsive.spec.ts`: 12 routes × 2 widths plus the 8 Review tabs at each, 26 checks, all green against a production build. Found G16, a reset-view button under the floating dock. |
| **F2** | ✅ **BOTH HALVES SHIPPED 2026-08-31.** Static: 51 failures fixed, `verify:contrast` clean over 938 pairs. Browser: 76 more, found only after discovering the first three "clean" runs were measuring an unhydrated page. 11 palettes × 12 research routes now report no unthemed surfaces and no unreadable text. |

### And the thing no amount of this can settle

Three of today's fixes change what a run actually **finds** — the owner-based clerk search, 
Browserbase on the CAD adapter, and bounded concurrent capture. None is verifiable from here.
`research_document_purchases` still has **0 rows**: no run has ever bought a document.

**One real run is worth more than the next ten slices.**
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
