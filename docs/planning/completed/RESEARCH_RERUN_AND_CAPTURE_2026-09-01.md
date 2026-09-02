# Research: a clean re-run, an honest screen, and imagery that counts as evidence

**Started** 2026-09-01 · **Branch** `claude/research-rerun-clean-2026-09-01`

The owner asked for five things in one sitting. They are one piece of work, because four of them
are downstream of the same missing fact: **nothing in this system knows which run produced which
document.**

> "If the run is stopped for some reason, and the user goes back and restarts the same research
> project from the beginning, it should reset the pipeline and research everything again from
> scratch. We should still keep the files from the first run saved, but then as we get files coming
> in, there should be a very clear and detailed check to determine if the information/documents are
> being duplicated over multiple runs so that we can eliminate duplicates."

> "We need to make sure that when we do the rerun we are able to fully edit the run by adding or
> removing information, or changing the settings of the run, such as whether or not it uses
> texasfile."

> "Please really work on making it so that the research completeness loading bar actually accurately
> represents the completeness of the run, even when doing a rerun. Right now there is a weird thing
> where when we do a rerun of research, sometimes the loading bar and stuff shows that the run
> failed, but really the AI is still working in the background collecting info."

> "We need to condense/combine the elements on this page so that we can see all of the results…
> Please rebuild the look of the research & analysis part of the research pipeline so that it is
> more intuitive and user friendly and better displays the info."

> "We need to work especially hard on finding drawings and cad work for properties that we research,
> and we need to make sure we are collecting and saving screenshots of satellite and eagle eye views
> of properties and their surrounding properties if possible, as well as screenshots of the relevant
> CAD GIS maps that show the land."

---

## 1. What is actually true today

Everything in this section was measured on 2026-09-01, against the live database and the code on
`main` at `1500ac0a3`. None of it is inferred.

### 1.1 A re-run deletes the files and duplicates them anyway

`PATCH /api/admin/research` with `clear_pipeline_documents: true` runs a hard delete:

```sql
DELETE FROM research_documents
 WHERE research_project_id = $1 AND source_type <> 'user_upload'
```

The confirmation dialog says so plainly — *"All data from the previous run will be permanently
deleted"* — which is the exact opposite of the requirement. And the storage objects are not removed
with the rows, so the files stay in the bucket with nothing pointing at them.

Meanwhile nothing stops a re-run writing the same document again. Both persistence paths end in a
bare insert with no check of any kind:

| Path | Line |
|---|---|
| `worker/src/services/harvest-supabase-sync.ts` | `.from('research_documents').insert(row)` |
| `worker/src/services/artifact-uploader.ts` | `resilientInsertDocument()` → `.insert(row)` |

Measured in production, before any of this shipped:

```
671  research_documents rows across 57 projects
 25  duplicate groups by (project, document_label, recording_info) — every one exactly 2 rows
 19  groups of rows pointing at the SAME storage_path, 53 redundant rows between them
  2  research_runs rows, total
```

That last number is why it is invisible. With two run rows for 671 documents, almost no document can
say which run produced it — so nothing can tell a duplicate from a document two different sources
legitimately found.

The app already admits this in its own UI. The run report card renders, in production:

> *"Which run produced which fact — nothing tags a document or fact with its run, so the counts
> above are for the whole project, not this run alone."*

And the run-diff panel, on a project with 17 documents, reports *"17 change(s) since 2026-08-31: 17
new document(s)"* with every single one labelled *"New deed — it was not in the previous run."*

### 1.2 The dedupe logic exists, is careful, and is not used for this

`worker/src/research/document-identity.ts` is a thorough cross-vendor identity model — normalised
instrument numbers, lettered volumes kept as strings, dates in the key because instrument numbers
restart across years, and a deliberate asymmetry (*when identity is uncertain, buy*). It is 275
lines of exactly the right thinking.

It is used in **one place**: `worker/src/index.ts:3233`, inside `POST /research/purchase`, seeded
from the current run's free harvest only. It has never touched the persistence path, and it has
never seen what a previous run already holds.

### 1.3 The progress bar measures a regex, not the run

`app/admin/research/components/run-progress.ts` infers the stage by matching regexes against the
worker's free-text status *message*, then turns the matched label's index in a list of eight into a
percentage. Consequences, all reproducible:

- It cannot move within a phase. Retrieval is roughly a third of a run and contributes one eighth.
- Bell County runs emit `GIS`, `Clerk`, `Plats`, `Deed Analysis`, `FEMA`, `TxDOT`, `Tax`,
  `Adjacent`, `Map Capture`, `Survey Plan` — not one contains the word "stage". They all fall to the
  final `return 'analyzing'`.
- It goes backwards, because enrichment re-enters retrieval after extraction by design.
- `CountyResearchProgress.pct` has existed on the type since the router was written and **nothing
  has ever set it**. The field the worker was meant to answer with was declared and left empty.

### 1.4 Three components on one screen disagree about one run

Captured from the live page on 2026-09-01, all at the same moment, all about the same run:

| Element | What it said |
|---|---|
| Stage panel | "AI analysis is running — live progress is shown below." |
| Run console bar | "Finished in 2 minutes for $0.02. · 2 / 25 min (9%)" |
| Run panel | "**Research Failed** · 00:00 elapsed · Compiling Resources · **13%**" |
| Failure text | "Bell County research failed: Pipeline cancelled by user" |
| Documents tile | 17 |

Five disagreements in one screenshot: running vs finished vs failed; 9% vs 13%; 00:00 elapsed vs 2
minutes; "Compiling Resources" for a run that had already retrieved 17 documents; and a failure
reason blaming a person.

### 1.5 A budget wind-down is reported as a user cancellation, and as a failure

There is one `AbortController` per run and two call sites abort it:

- `worker/src/index.ts:1208` — the run reached its cost or time ceiling. A normal, deliberate,
  successful early finish.
- `worker/src/index.ts:2092` — a person pressed cancel.

`GET /research/status/:projectId` can see only `signal.aborted`, so it answers both with
`{ status: 'failed', failureReason: 'Pipeline cancelled by user' }`, which
`counties/router.ts:526` wraps into `Bell County research failed: Pipeline cancelled by user`.

### 1.6 The stale-result race that latches "failed"

`GET /research/status/:projectId` consults `completedResults` **before** `activePipelines`. On a
re-run, every poll between the operator pressing the button and `property-lookup` executing returns
the *previous* run's terminal result. `ResearchRunPanel.pollStatus` sets state from whatever it
receives, and `isDoneStatus` then calls `stopPolling()` — permanently. The panel has stopped asking
before the new run even registers.

### 1.7 The TexasFile switch is not wired to anything that spends money

`research_projects.allow_paid_documents` exists (seed 620), the create-project modal sets it, and
`lib/research/paid-documents.ts` has a careful `mayBuyDocuments()` with its own test file.

`mayBuyDocuments` is called from exactly one place: `app/api/admin/research/[projectId]/analyze/route.ts`
— the app-side lite pipeline. **The worker, which is what actually buys documents, never reads the
column and is never told the value.** `PATCH` does not accept the field either, so it cannot be
changed after creation.

### 1.8 The pipeline POST drops most of what a run could be given

`app/api/admin/research/[projectId]/pipeline/route.ts` builds its worker payload as a literal:

```ts
const payload = { projectId, address, county, state, propertyId, ownerName };
```

`userFiles` is accepted by the worker and never sent. `maxResearchTimeMinutes` and `maxCostUsd`
exist on the worker's input type and no caller has ever passed one, so every run gets the defaults
whatever the operator chose. There is no field for operator notes at all.

### 1.9 Imagery is planned but not fetched

`worker/src/services/imagery-plan.ts` computes the zoom that actually frames a parcel — the previous
code used a fixed zoom 19, about 330 m of ground, to identify parcels up to 900 m across. Its own
header states the limit:

> *"It deliberately does NOT fetch: the fetchers need provider credentials and licensing decisions
> that are the owner's."*

What does exist: `map-screenshot-capture.ts` (840 lines) and `gis-viewer-capture.ts` (1,665 lines)
capture BIS GIS and Google Maps — **for Bell County only**. There is no oblique / bird's-eye capture
anywhere, no systematic capture of surrounding parcels, and no county-general CAD GIS capture.

---

## 2. The shape of the fix

One idea carries four of the five requests:

> **A research project owns a LIBRARY of documents that accumulates across runs. Every document
> says which run first produced it and which run last saw it. A re-run researches everything again
> from scratch and files what comes back into a library that already knows what it holds.**

"Keep the old files" and "do not duplicate" are only compatible once a document can name its run.
An honest progress bar needs the same fact, because "how complete is this run" is unanswerable while
the counters are per project.

Two rules govern every judgement call below, and they point in opposite directions on purpose:

- **Deciding whether to SPEND** — when identity is uncertain, buy. A false match silently omits a
  document we do not have; a false miss costs a few dollars and shows up in the ledger. This is the
  existing rule in `document-identity.ts` and it does not change.
- **Deciding whether to DELETE** — never. A duplicate is *pointed at* the row it duplicates, with a
  reason in readable text, and can be un-marked. Deleting is the one action that looking again
  cannot undo.

---

## 3. Slices

Ship in order. Each slice is independently useful and independently revertible.

### Phase A — a run is a first-class thing

- [x] **A1** Seed `623_research_run_lineage.sql`: `research_runs` gains `run_number`, `trigger`,
      `settings`, `inputs`, `supersedes_run_id`, `progress_percent`, `stop_reason`;
      `research_documents` gains `research_run_id`, `last_seen_run_id`, `run_seen_count`,
      `identity_key`, `content_sha256`, `duplicate_of`, `duplicate_reason`, `superseded_at`; plus
      indexes, a unique backstop on `(project, identity_key)` for live rows, and a guarded
      one-time pass marking the 53 + 25 existing duplicates rather than deleting them.
- [x] **A2** `infra/run-store.ts`: `recordRunStart` returns `{ runId, runNumber }`; `closeOpenRuns`;
      phase and finish writes keyed by run id; `stop_reason` and `progress_percent` persisted.
- [x] **A3** `research/run-phases.ts`: the weighted, ordered phase ladder and a **monotonic**
      `RunProgressTracker`. Every phase name in it was taken from a live `onProgress` call or
      `updateStatus` message in this repo.
- [x] **A4** `property-lookup` creates the run before it answers, closes stale open runs, attaches
      the tracker, and returns `runId` + `runNumber` in its 202.
- [x] **A5** `GET /research/status/:projectId` prefers a **live pipeline over any cached result**,
      and reports `runId`, `runNumber`, `percent`, `phaseId`, `phaseLabel`, `startedAt`, `stopReason`.
- [x] **A6** Distinguish the two aborts. A budget wind-down finishes `complete` /
      `stop_reason = budget_reached`; a cancel finishes `cancelled` / `cancelled_by_user`. Neither
      is `failed`, and neither is described as the other.
- [x] **A7** `POST /research/reset/:projectId` on the worker: abort anything live, clear
      `completedResults`, `completedLogs`, the live log, the timeline tracker and the progress
      tracker, so a re-run cannot inherit the previous run's outcome.

### Phase B — documents belong to runs, and duplicates are found

- [x] **B1** `research/project-library.ts`: load what a project already holds from Supabase, build a
      `DocumentIndex` from it, and classify a candidate as `new` / `already-held` / `uncertain`,
      with a readable reason for each. SHA-256 of the stored bytes catches what the citation cannot.
- [x] **B2** Wire it into both insert paths. A re-found document **updates** `last_seen_run_id` and
      increments `run_seen_count` — no second row. A near miss inserts and records `duplicate_of`
      with its reason. Every new row is stamped with `research_run_id`.
- [x] **B3** The purchase path seeds its held index from the project library, not only from this
      run's free harvest, so a re-run never re-buys what run 1 already paid for.
- [x] **B4** The app's reset **supersedes** instead of deleting: pipeline documents get
      `superseded_at`, derived rows (`extracted_data_points`, `discrepancies`) are cleared because a
      fresh run regenerates them, and the storage objects are left in place.
- [x] **B5** Duplicates are visible and reversible in the UI: what was merged, into what, and why.

### Phase C — a re-run is fully editable

- [x] **C1** `PATCH /api/admin/research` accepts `allow_paid_documents` and per-run settings.
- [x] **C2** The pipeline POST forwards everything a run can be given: address, county, parcel,
      owner, operator notes, attached files, time and cost ceilings, and the paid-documents switch.
- [x] **C3** The worker **honours** `allowPaidDocuments`. `mayBuyDocuments` is currently never
      called anywhere that spends money.
- [x] **C4** A real re-run dialog: edit every input and setting, see what run 1 used, and see what
      is about to change — replacing today's two-button "same / update" confirm.

### Phase D — the screen tells the truth

- [x] **D1** One status source. The stage panel, the console bar and the run panel read the same
      run state instead of each deriving their own.
- [x] **D2** The server's `percent` replaces the client's regex inference; the old inference stays
      only as a fallback for a worker that has not been redeployed.
- [x] **D3** Stale-run guard: the panel records the `runId` it started and ignores any payload for a
      different run. A terminal status for a run we did not start can never stop the poll.
- [x] **D4** The elapsed clock reads the run's real `startedAt`. It showed `00:00` beside a console
      bar reading 2 minutes.
- [x] **D5** The report card and run-diff are scoped to a run, and the disclaimers that say they
      cannot be come out — because by then they can be.

### Phase E — rebuild Research & Analysis

- [x] **E1** One `ResearchRunView`: status header, honest progress, live counters, the documents as
      they arrive, and the logs — in one place instead of five panels that disagree.
- [x] **E2** Absorb or retire the panels it replaces; nothing is left rendering a second opinion.
- [x] **E3** Responsive at 1440 and 390, theme tokens not literal hex, and keyboard reachable.
      Measured against a production build per `project_ui_fit_sweep_and_preflight`.

### Phase F — imagery, CAD and drawings that count as evidence

- [x] **F1** A fetcher behind `frameParcel`, so satellite imagery is captured at the zoom that
      actually frames the parcel, with capture date, scale, source and licence recorded. Without
      provenance an aerial can illustrate a packet but can never support a conclusion in one.
- [~] **F2** Oblique / bird's-eye capture where licensing allows, recorded with the same
      provenance. **DEFERRED — owner-gated, not unbuilt.** The capture plan produces the oblique
      request, the tilted URL and the provenance record, and the runner will execute it the
      moment `OBLIQUE_IMAGERY_PROVIDER` is set. Bird's-eye coverage is licensed, and choosing a
      provider is a spending and licensing decision only the owner can make. Until then the plan
      records "no oblique provider is configured for this worker" — a gap in this firm's imagery
      accounts — rather than implying the county has no oblique coverage. Those are different
      facts and only one is about the land.
- [x] **F3** Surrounding parcels captured deliberately, not incidentally — the adjoiner's fence and
      the road are usually the point of looking.
- [x] **F4** CAD GIS map capture generalised beyond Bell County, driven by `cad-registry.ts`.
- [x] **F5** OCR over captured imagery so a legend, a scale bar or a lot number in a map image
      becomes searchable text rather than pixels.
- [x] **F6** An explicit hunt for drawings and CAD work: recorded surveys, plats with dimensions,
      and any CAD or drawing file the county publishes.
- [x] **F7** Every capture becomes an attributed, deduplicated `research_document` like everything
      else — so re-running does not re-file the same screenshot, which is 19 of the 53 duplicate
      rows measured above.

---

## 4. Things this work must not do

- **Do not delete a document to remove a duplicate.** Mark it, explain it, keep it reversible.
- **Do not let dedupe skip a purchase under uncertainty.** The spending asymmetry in
  `document-identity.ts` stays exactly as it is.
- **Do not report a budget wind-down as a failure.** It is a successful early finish and the
  operator's own ceiling caused it.
- **Do not let the progress bar reach 100 while work continues**, and do not let it go backwards.
  Both read as "it died", which is the complaint this exists to fix.
- **Do not claim a capability the code does not reach.** `research-modes.ts` already carries
  `notWiredYet` and `wiredCounties` for exactly this reason; imagery work must respect it rather
  than listing a source as covered because an adapter exists.

## 5. Verification

- `npm run type-check` and `npm run lint` on every slice.
- `npm run verify:worker` for the worker build.
- `npm run build` before any merge — tsc and the test suite have both been green while the
  production build was broken.
- Browser QA against a real run before Phase D or E is called done. A green suite has missed
  rendering bugs in this repo before, and "authored but not wired" is its most common defect.
- Seeds applied and verified against Supabase per `project_apply_seeds_to_supabase`.

## 6. Slice log

- **2026-09-01** — **Phase A complete.** Seed 623 applied to production: 8 new columns on
  `research_documents`, 7 on `research_runs`, and the pre-existing duplicates marked rather than
  deleted — **78 rows** (53 byte-identical, 25 by label + recording reference) pointed at 44
  keepers, leaving 593 live documents and nothing removed. Worker typechecks clean, verified with a
  deliberate-error control.

- **2026-09-01/02** — **Phases B, C, D, E and F complete.** Everything the owner asked for in the
  five requests at the top of this document is shipped, except F2, which is deferred above with
  its reason.

  **The re-run is editable** (C1–C4). `RerunDialog` edits every input and every setting —
  including the TexasFile switch, which was write-once at project creation. It seeds from what
  the PREVIOUS RUN was told, via a new `GET .../runs`, not from the project's current values;
  those differ exactly when somebody has edited the project between runs, which is when getting
  it wrong matters.

  **The TexasFile switch now stops a purchase** (C3). `mayRunBuyDocuments` was correct, careful,
  and called from no line of code in the worker — a switch wired to a bulb in a different
  building. `purchase-gate.ts` is consulted at all three spend sites. An UNREADABLE permission
  refuses, because an unspent dollar is recoverable and a spent one is not.

  **The screen tells the truth** (D1–D5). `lib/research/run-state.ts` is the single source; the
  stale-run guard uses the `runId` the POST had been returning and the panel had been discarding;
  the percentage comes off the wire instead of from a regex over prose; the clock reads the run's
  real start. The report card is scoped to the run, and the disclaimer saying it never could be
  has been removed — with a fallback for the 671 documents that predate attribution, because a
  run-scoped count of zero would be a worse lie than the one being fixed.

  **One view** (E1–E3). `ResearchRunView` replaces the four-panel stack. The diff and report card
  survive as tab bodies, where they can no longer sit beside a status they are not describing.

  **Imagery, CAD GIS and drawings** (F1, F3–F7). `planImagery()` had no caller outside its own
  tests, Bell's capture took Google satellite at a FIXED zoom 20, and `BIS_CONFIGS` carried a
  `gisBaseUrl` for 19 counties used only to query features. `capture-plan.ts` +
  `capture-runner.ts` join them, county-general, running before `endFiling` so every capture is
  deduplicated and attributed like a deed. `drawing-hunt.ts` recognises the drawings a five-value
  `DocumentType` had been filing as `other` — "MAP OF SURVEY", the most useful document a
  surveyor can find, was indistinguishable from a power of attorney.

  **Browser QA found three bugs the suite could not** (the plan's own verification step): the
  re-run dialog rendered no fields at all (an object-literal prop in a dependency array made the
  seeding effect cancel itself every render), the dialog overflowed its card by 56px at 390px (a
  `<fieldset>`'s intrinsic `min-width`), and the action bar still claimed "AI analysis is running"
  above a view reading "No run has started yet" — a fifth opinion derived from the workflow stage.

  **And 362 tests were not running.** Six research test files had been failing to parse with
  "SyntaxError: Invalid or unexpected token" — they import a script that began with a shebang,
  which vitest's transform rejects, taking each whole file out of the suite. Confirmed against a
  clean tree, so it predates this work. The suite goes from 1,818 to 2,180.

  Worker: 119 files, 1,874 tests. App research: 120 files, 2,183 tests. `npm run build` green.

## 7. What still needs the owner

- **Deploy the worker.** Every worker change here — the purchase gate, the progress tracker, the
  capture phase, the drawing hunt, the live-pipeline status ordering — is in the repository and
  NOT running. The worker is a Docker image:
  `BUILD_SHA=$(git rev-parse --short HEAD) docker compose build worker`. Until that happens the
  screen fixes are talking to the old worker, which still reports a budget stop as
  "failed: Pipeline cancelled by user".
- **F2** — name an oblique imagery provider, or confirm we are not buying one.
- **Retire three superseded components.** `ResearchRunPanel.tsx` (1,774 lines),
  `RunConsoleBar.tsx` and `ResearchAnalysisPanel.tsx` are mounted by nothing. Deleting the first
  needs `run-progress`, `pipeline-log` and `stored-file` repointed at `useRunState` first —
  otherwise the deletion removes those guards rather than a vacuous one.
- **A blind spot in the orphan guard.** `research-modules-are-reachable` counts a BACKTICK-quoted
  mention in a comment as a caller, so any module this codebase discusses in prose looks wired.
  Fixing it will surface a batch of newly-visible orphans across the repo — worth its own slice.
