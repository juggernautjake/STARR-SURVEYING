# Research flow, scope guard, and the UI audit — 2026-08-31

**Status:** IN PROGRESS · opened 2026-08-31 · built one slice per pass.

Follows `RESEARCH_UI_OVERHAUL_2026-08-30.md`, which closed the same day. That doc was about how the
research pages *look and are built*. This one is about what a person can actually **do** with them,
end to end, and about the one thing the platform currently cannot say: **"this property is not
somewhere we can research."**

---

## The owner's ask, in their words

> *"input information, choose the settings for the research run, link the research to a specific job
> if they want, navigate back and forth throughout the research flow, check all retrieved files and
> stuff, view all images, upload their own files and images, write notes and stuff, see the logs and
> all of that. But the basics are just, input information, hit the research button, wait for it to
> finish, review results."*

> *"The system should also have sanity checks so that it can tell when a property is not within the
> scope that we have set for the research platform. Like, if we are researching a property in a state
> we have not built the system for yet, then it should realize that and tell the user and not
> actually run the research. But if the address/property is within an area that we have scoped the
> software for, then it should proceed."*

> *"a thorough audit of all of the pages and UI and styling and formatting with playwright … screenshot
> all of the pages and then evaluate them all … Make sure the new UI elements and pages can use all of
> the predefined styling themes."*

---

## ⚠ READ FIRST — what is actually true today, measured 2026-08-31

Every row below was checked against the repository, not remembered. The previous doc recorded six
parked premises that turned out to be false when finally checked; this table exists so this one does
not add a seventh.

| Claim | Measured |
|---|---|
| The platform is Texas-only | **True, and nothing says so.** `getClerkByFIPS()` strips a leading `48` — the Texas state FIPS — and `getClerkByCountyName()` matches against `TEXAS_COUNTIES`. There is no other state's registry. |
| An unknown county is rejected | **False.** Both lookups fall through to a TexasFile entry with `fallback: true`, and the run proceeds. A New Mexico address gets a "county not in registry" note and then a real, billable run. |
| The county field is validated | **Partly.** `lib/research/county-input.ts` + `CountyNote` warn on the *typed string* — and deliberately do not block, for a reason worth keeping: the check fires while somebody is halfway through typing, and a form that refuses at "Bel" teaches people to fight it. It is **client-side, and it never runs at the moment a run starts.** |
| The state field is validated | **Not at all.** `state` is stored (`'TX'` on the one live project) and read by nothing that gates a run. |
| Adapter coverage is known | **Yes, and it is finer than yes/no.** 25 counties in `CLERK_REGISTRY`: **2 implemented, 18 stub, 3 unavailable**. The Coverage tab already renders this. Nothing consults it before a run. |
| A project can be linked to a job | **Column only.** `research_projects.job_id` exists and is `null`; **zero `.tsx` under `app/admin/research` mentions it.** |
| There are two run-start paths | **Yes** — `app/api/admin/research/[projectId]/analyze` (in-app) and `app/api/admin/research/batch` (worker). The previous doc's READ FIRST is still the single biggest source of confusion here, and **a scope guard has to sit on both or it is not a guard.** |

**The consequence, stated plainly:** the one defect the owner described is real and is currently
unguarded. A run on an out-of-state property does not fail fast — it geocodes, routes to a Texas
aggregator, and spends money finding nothing.

---

## How to work this doc

Same rules as the doc it follows, and they are not ceremony — they are what produced sixteen
findings there:

1. Behaviour-preserving unless the slice says otherwise.
2. `npm run type-check`, `npm run lint`, `npm run build` — **exit codes read unpiped.**
3. Every slice carries a test that asserts the **caller**, not just the unit.
4. Every guard is **mutation-tested**: break the thing it guards and watch it go red.
5. Every new surface is checked against **all eleven palettes**, not just the default. F2 shipped
   that instrument; using it is now the standard, not an extra.
6. Annotate this doc with what shipped and what it cost.

---

## Phase S — the scope guard *(first, because it is the one that spends money)*

### S1 — What "in scope" means, as data ✅ **SHIPPED 2026-08-31** — `lib/research/scope.ts`

One module, `lib/research/scope.ts`, that answers one question: **can this platform research this
property, and how well?** It is the only place the answer lives, and both run paths and the UI read
it.

```
inScope(state, county) → { verdict, reason, adapter }
```

Four verdicts, because two is not enough to be useful:

| Verdict | When | What the UI does |
|---|---|---|
| `supported` | A county with an `implemented` adapter | Run. |
| `degraded` | A Texas county whose adapter is `stub` — the aggregator will be used, documents cost money | Run, **after saying what it will cost and getting a click.** |
| `unavailable` | A Texas county whose adapter is `unavailable` — no online portal known | **Do not run.** Say what is missing and what the manual path is. |
| `out-of-scope` | Any state that is not Texas | **Do not run.** Say so plainly, and say which states we do cover. |

**The state check is the new thing and it is the whole point.** The county half already has a
registry; the state half has never existed, and `getClerkByFIPS`'s `.replace(/^48/, '')` is the
proof — it is Texas-only by construction and by accident at the same time.

**Derived, not typed.** The verdict comes from `CLERK_REGISTRY` and `TEXAS_COUNTIES`, so adding a
county to the registry moves it into scope with no second list to update. A hand-maintained list of
supported counties beside a registry of adapters is G12 waiting to happen.

### S2 — The guard on both run paths ✅ **SHIPPED 2026-08-31**

`analyze/route.ts` and `batch/route.ts` both call `inScope` before doing anything expensive, and
return a **422 with a structured body** — verdict, reason, and what the operator can do — not a bare
500. A guard that only lives in the browser is a guard the batch form walks around.

The test asserts the **route** refuses, not that the function returns the right string.

### S3 — Say it before they click, not after ✅ **SHIPPED 2026-08-31** — `ScopeNotice`

The New Research Project modal and the batch form already have `CountyNote`. They gain the scope
verdict beside it: state and county resolved together, with the adapter's real status named. The
distinction the existing note draws — **warn while typing, decide at submit** — is kept, because it
was right.

And the project page's run button carries the verdict too. A button that starts a run it knows will
be refused is worse than a disabled one.

### S4 — Degraded is a price, so show the price ☐

A `stub` county means TexasFile at roughly $1–3 a document. `research_document_purchases` still has
**0 rows**, so no run has ever bought one — which means this is the first time the number will be
real. The confirmation says the county, the adapter, and the spend limit that will apply.

---

## Phase J — the job link

### J1 — Link a research project to a job ☐

`job_id` exists on the row and nothing writes it. The project header gets a job picker; the job page
gets the reverse link. Two screens, one column, and the reason it matters: research that is not
attached to a job is research nobody bills for.

### J2 — Carry the job's property into the form ☐

Creating a research project *from* a job should pre-fill the address, county and state from the job
rather than asking twice. This is where the scope check earns its keep silently — the address is
already known to be one we work.

---

## Phase N — navigation, notes, files, images

### N1 — Move backwards and forwards through the stages ☐

Today `currentStage` is derived from `project.status` and the only way back is `holdOnResearchStage`,
a boolean that exists to keep somebody on Stage 2 after the DB has moved to `review`. That is a
workaround, not navigation.

The stepper becomes real: any stage that has been *reached* is clickable, forward and back, without
mutating `status`. Status is what the pipeline did; the stage you are looking at is a view.

### N2 — Notes that survive ☐

`analysis_metadata.job_notes` and `user_notes` both exist. Notes get a real surface — per project,
and per document — that autosaves and says when it saved. "Write notes and stuff" is the owner's
phrase for the thing that makes a research packet usable by the person who did not run it.

### N3 — Every retrieved file, and every image ☐

The documents page lists what was retrieved. Images need a **viewer**: full-size, zoomable,
keyboard-navigable, with the document's own metadata beside it. A plat you cannot read at full size
is a plat you have not checked.

### N4 — Upload your own files and images ☐

`DocumentUploadPanel` exists and works. What it lacks is parity with the retrieved list: an upload
should land in the same place, be viewable the same way, and be distinguishable by `source_type`.

### N5 — The logs, where you are ☐

The run console exists and is good. It is reachable from one screen. It should be reachable from the
review stage too, because the question "why does this section say nothing?" is asked *while reading
the results*, not while watching the run.

---

## Phase U — the UI audit

### U1 — Screenshot every research page, at both widths, on every palette ☐

E3 already drives the routes and the Review tabs and measures overflow, occlusion and contrast. It
does not **look** at them. This adds capture: every route × 2 widths, plus the eight Review tabs,
written to `docs/planning/qa-evidence/` with a manifest.

The point is not the pictures. It is that a person can look at forty images in two minutes and see
what forty assertions cannot: alignment, rhythm, density, whether a screen reads as one thing or as
ninety separately authored ones.

### U2 — Read the shots and write down what is wrong ☐

Findings go in this doc as a table with a file name against each, so the next slice fixes a list
rather than an impression.

### U3 — Fix what U2 found ☐

One slice per cluster, not one per screenshot.

### U4 — Every new surface, on every palette ☐

Anything this doc adds is checked with `check-portal-themes.mjs` across all eleven palettes before
it is called done. F2 established that this is cheap once the instrument exists; the cost of not
doing it was 76 findings.

---

## Deliberately NOT in scope

- **A second state.** The guard's job is to *say* we do not cover New Mexico, not to start covering
  it. Adding a state is a registry, an adapter and a county list — a programme, and a different one.
- **`DrawingCanvas.tsx`.** Still its own project, as the previous doc said.
- **Rewriting the run pipeline.** The two-pipeline split is stated, guarded and surfaced; unifying
  it is not this doc's slice.

---

## Known traps, carried forward

1. **Route-scoped CSS.** `AdminResearch.css` loads last on research routes; a shared-class fix made
   elsewhere misses these pages.
2. **Authored but not wired.** Assert something imports *your* file.
3. **A probe can be the bug.** Strip comments; run a control that should fail.
4. **Two pipelines.** Any run-starting UI must name its engine — and now, check its scope.
5. **`$?` after a pipe** is the pipe's status.
6. **A stale `next start` serves 400s for its own assets** after a rebuild, and the page then sits on
   the admin shell's "⏳ Loading…" — which reads exactly like a broken session cookie. `pkill -f`
   does not kill it on Windows; `Get-NetTCPConnection -LocalPort 3050 | Stop-Process` does. Three
   "clean" theme runs were measuring an unhydrated page before this was found.

---

## Slice log


| Date | Slice | What shipped |
|---|---|---|
| 2026-08-31 | S1 · S2 · S3 | `lib/research/scope.ts` — four verdicts derived from `CLERK_REGISTRY`, never a second list. Guards on **both** run paths, 422 with a renderable body. `ScopeNotice` on all three surfaces that start a run. 66 tests; eleven mutations, two of which survived the first round. |

### S1–S3 — the scope guard, shipped 2026-08-31

#### Two mutations survived, and both were the ones that mattered

`checkScope` imported, ordered before `analyzeProject`, and a `scopeRefusal(` somewhere in the file
— all asserted, all true, and all satisfied by a guard whose condition is `if (false)`. Replacing
`if (!scope.canRun)` with exactly that left **all 46 tests green**. The check was present, imported,
ordered correctly, and did nothing.

Renaming the batch route's filtered list survived the same way: `.filter((r) => !r.scope.canRun)`
was still in the file and `rows:` was still in the file, so both assertions passed while nothing was
checked. `tsc` would have caught that particular slip — and a guard that leans on the compiler to
notice is one refactor away from not being a guard.

Both read the **condition** now rather than the presence: the nearest `if (…)` above the refusal has
to mention `scope.canRun`, and the list the batch route builds has to be the list it tests. Seven
more mutations across the module and the three UI surfaces, all red.

#### What the guard refuses, and what it deliberately does not

| | |
|---|---|
| `out-of-scope` | A state we have not built — **the case the owner asked for**, and there was no state check anywhere in the system before this. Also a string that is not one of Texas's 254 counties. |
| `unavailable` | One of the three counties whose clerk has no online system at all. An automated run returns nothing, so it does not start, and the message says what has to happen instead. |
| `degraded` | **Not refused.** 18 of the 25 registry entries are stubs, and the other 229 counties route the same way — refusing them would refuse most of Texas. It is a price, so the notice states the price. |
| `unknown` | A blank form. Renders nothing: a form somebody has not filled in yet is not a problem to report at them. |

The only hand-written list in the module is `SUPPORTED_STATES`, and it has one entry. A
`SUPPORTED_COUNTIES` array beside `CLERK_REGISTRY` would be G12 with money attached: it would go
stale the first time somebody built an adapter, and it would go stale **silently**, because the run
would still be refused and nobody would find out why.

#### Ordering, which is most of the message

The state is answered before the county. Checking the county first reports *"Sandoval is not a Texas
county"* for a New Mexico property — true, useless, and it points the operator at the wrong field.

#### Three surfaces, one function

The project page's run button is `disabled` on `!scope.canRun` and points `aria-describedby` at the
notice, so a disabled button is never a dead end for somebody not looking at the amber box. The
batch form blocks submit on any refused row and names the rows, because the API returns 422 for the
whole batch and a form that let you send one would be a guaranteed round trip to a red banner. The
create modal **warns and does not block** — recording a property we cannot research is reasonable,
and what is refused is the run.

The batch form and the batch route both default a blank state column to `TX`, and the test asserts
them against each other. Two defaults that disagree is how a form comes to promise what the API
refuses.

#### And a token that did not exist

`ScopeNotice.css` was first written against `--color-danger-text` and `--color-danger-bg`. Those
names are defined nowhere; the real ones are `--color-error-*`. It would have rendered perfectly
through its fallbacks and quietly opted the whole notice out of theming — the exact defect
`tokens.css:110` records in its own words. The test now asserts that every token the sheet reads is
defined somewhere.

Driven in a browser on `starr-default` and `starr-dark`, and checked on all eleven palettes: no
unthemed surfaces, no unreadable text.
