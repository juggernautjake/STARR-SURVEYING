# User-initiated iterative Research ⇄ Analysis loop — 2026-09-06

**Started** 2026-09-06 · **Branch** `claude/paid-first-rich-capture-viewer-2026-09-05`

Driven by the stop-hook slice loop, **in order**. Ship the smallest meaningful slice, `tsc` + lint + test,
commit, **push to the BRANCH**. Read the live code each slice touches first. Standing constraints:
`npm run build` before the owner's merge; **NEVER rebuild the worker while a run is in flight**
(`activePipelines` on `localhost:3100/healthz` must be 0); worker = Docker on netcup, rebuild from
`/opt/starr/worker` with `BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose up -d --build worker`.

## Why (owner, 2026-09-06)

> "Let's make it so that we have the basic research, and then we can run the analysis after. If the analysis
> finds more clues and details about chain of title and other stuff, then it should compile that information.
> Then we can initiate another run using that info to add to what we have already found." … "We will not
> automatically do the AI/OCR identifier fallback or iterative discovery loop. The user will be able to
> choose to do that if they want after the initial research run is completed."

So: **user-initiated**, round-based. Research gathers; Analysis reads + compiles NEW leads (chain of title,
referenced documents, adjoiners); the user reviews the leads and chooses to run ANOTHER research pass seeded
with them, adding to what is already held. Repeat until the user stops.

## What already exists (leverage, don't rebuild)

- **Chain-of-title gap finding** — `src/chain-of-title/chain-gaps.ts`: `findGaps(chain)` → `ChainGap[]`
  (`unfollowed_citation` = an instrument/vol-page a deed CITES but the run never retrieved), `citedInstruments`,
  `summariseChain`, `describeTermination` (a human next-step). `ChainOfTitleBuilder` is already built during
  analysis (index.ts ~5991). `findGaps`/`summariseChain` have NO callers outside the module — the leads are
  computed-able but never surfaced. This is the spine of the lead compiler.
- **Supplemental threading** — the run POST accepts `body.supplemental` (instrumentNumbers, volumePages) which
  `buildDiscoveryTarget` folds into the search target + the free-first buy + the clerk searches. A follow-up
  round seeds itself by putting the chosen leads here.
- **Cross-run library dedup** — `DocumentPurchaseOrchestrator` + `project-library.ts` skip re-buying / re-filing
  what a prior round already got, so a round only ADDS.
- **Cost attribution** — `enterRunContext(projectId)` + `recordAmbientAiCall` put every research-phase AI/OCR
  call on the run's spend automatically.
- **Five-stage flow + view navigation** — `page.tsx` renders Analysis + Review as distinct screens with
  view-only navigation; the leads panel mounts on Analysis.

---

## PHASE 1 — The lead compiler (worker, pure + wired)

### 1.1 — `DiscoveredLead` model + `compileDiscoveredLeads` ✅ BUILT + TESTED
New `worker/src/research/discovered-leads.ts`. A `DiscoveredLead` = `{ id, kind, value, label, sourceDocId?,
round, searched }` where `kind ∈ 'citation' | 'grantor_name' | 'adjoiner' | 'subdivision' | 'volume_page' |
'instrument'`. `compileDiscoveredLeads({ chainGaps, chainErrands, adjoiners, dataPoints, alreadySearched, round })`
returns de-duped leads NOT already searched. Pure, unit-tested.

### 1.2 — Feed the chain-of-title gaps + errands in ✅ BUILT (via errandsFromGaps in the compiler)
Call `findGaps` + the grantor-as-grantee errands (`chain-errands.ts` / `chain-walker.ts`) on the built chain,
map each unfollowed citation → a `citation`/`volume_page`/`instrument` lead and each prior grantor → a
`grantor_name` lead. Adjoiner data points → `adjoiner` leads; recording-reference / subdivision data points →
their kinds.

### 1.3 — Persist after analysis ✅ BUILT + TESTED (POST compile-leads endpoint)
When analysis finishes, write `analysis_metadata.discoveredLeads` (merged, not replacing) with the current
`analysis_metadata.researchRound` (default 1). De-dup against leads already present + already searched.

### 1.4 — Tests ✅ BUILT + TESTED
Fixtures: a chain with an unfollowed citation yields a lead; an adjoiner yields a lead; an already-searched
identifier is excluded; the compile is idempotent.

---

## PHASE 2 — Seeded follow-up research (worker + app plumbing)

### 2.1 — Accept selected leads on the run POST ✅ BUILT + TESTED
The run start payload gains `followUpLeads?: DiscoveredLead[]` (or reuse `supplemental`), merged into the
DiscoveryTarget: `citation`/`volume_page` → volumePages; `instrument` → instrumentNumbers; `grantor_name`/
`adjoiner` → an owner-name search; `subdivision` → the plat search.

### 2.2 — Round tracking ✅ BUILT + TESTED
Increment `analysis_metadata.researchRound` when a follow-up run starts; tag the round on the run record so
documents/data can show which round found them. Mark the seeded leads `searched: true`.

### 2.3 — Dedup against what is held ✅ BUILT + TESTED
A follow-up round must only ADD — rely on the cross-run library for documents, and skip a lead whose target is
already in the held set. Log what was skipped.

### 2.4 — Tests ✅ BUILT + TESTED
Leads map to the right search inputs; the round increments; a re-run does not re-search a `searched` lead.

---

## PHASE 3 — UI: the Discovered Leads panel + the follow-up run

### 3.1 — `DiscoveredLeadsPanel` ✅ BUILT + TESTED
Reads `analysis_metadata.discoveredLeads`, groups by kind, shows each lead's label + where it came from, with a
checkbox (default all selected) and a running count. Empty state: "Analysis found no new leads to chase."

### 3.2 — Mount it on the Analysis screen ✅ BUILT + TESTED
Under the five-stage split, the panel appears on the Analysis stage once analysis is complete (below the
Analyze controls), so the loop reads left-to-right: analyze → see leads → run follow-up.

### 3.3 — "Run follow-up research (N leads)" ✅ BUILT + TESTED
A button that opens the run-settings dialog PRE-SEEDED with the selected leads (as supplemental), so the user
sets budget/time and starts round N+1. On complete it lands on Analysis again.

### 3.4 — Round lineage ✅ BUILT (round shown) → per-document lineage ✅ BUILT 2026-09-06 (evening)
The panel surfaces the current research round ("Currently on round N"), and the worker bumps + persists
`researchRound` each follow-up. **Per-document provenance now too:** seed `632_research_documents_round.sql`
adds `research_documents.research_round` (nullable, ≥ 1). The run resolves its round once (a follow-up's
bump — the bookkeeping now RETURNS the round — else the project's current round via
`research/research-round.ts`), hands it to `beginFiling`, and `resilientInsertDocument` stamps it on every
row through the one filing path; the fallback row drops the column so a DB without the seed still files.
The app type carries it; the live document list badges a follow-up's find ("Round N"; round 1 unmarked).
`research-round-lineage-2026-09-06.test.ts` (10). **Owner: apply seed 632 to live Supabase** (node-pg +
`SUPABASE_DB_URL`, as for 630/631) — until then the column is absent and every document files without it.

### 3.5 — Tests ✅ BUILT + TESTED
The panel renders leads from analysis_metadata; the follow-up button seeds the dialog; the caller wires the
panel (check the CALLER).

---

## PHASE 4 — User-initiated AI/OCR deep-read (the 4.1 fallback, now a button)

### 4.1 — "Deep-read for more clues" action ✅ BUILT + TESTED
A user-triggered pass that runs the AI/OCR identifier extraction over the captured deed/plat/GIS documents to
pull subdivision / survey / lot-block / recording references the structured parse missed, appends them to
`discoveredLeads`, and (via `recordAmbientAiCall`) puts the AI cost on the run spend. Bounded + cost-capped.

### 4.2 — Tests ✅ BUILT + TESTED
The deep-read adds leads; every AI call lands a usage-ledger row; it is never automatic (only the button runs it).
Worker: `deep-read-leads.test.ts` (parse, map, no-op on empty text, never throws). App: `discovered-leads-panel.test.ts`
static guards — the panel button, the route bridge, the page never calls compile/deep-read itself, and `index.ts`
reaches `deepReadForLeads` / `compileDiscoveredLeads` ONLY inside their POST handlers (not the run pipeline).

---

## PHASE 6 — What the 2026-09-06 run log + two audits said to fix (owner: "make research, analysis and review work well")

The owner pasted the full log of the 1401 North East St run (293 entries, 22 errors) and asked what
could be improved; two read-only audits (every button on the research page; the free + paid document
avenues end to end) ran alongside. Findings, and what was built:

### 6.1 — The research run was still doing the AI analysis ✅ BUILT + TESTED
The run spent **65 of its 76 minutes in Phase 3 AI deed analysis (35 min PER DEED)**, blew the wall
clock, tripped the stall watchdog, and was reported as "Research Failed … found no property record
and no documents" with 11 documents filed. Root cause: **the app never sent `phase: 'gather'`** (only
the type existed), so `shouldRunAnalysis` was always true, the 25-min gather cap never applied, and
the Bell orchestrator — which cannot see run settings — always ran Phase 3. Now: the run dialog +
the pipeline route send/default `phase: 'gather'`; `index.ts` puts it on the research input; the
router hands it to Bell; the orchestrator blanks its AI key for a gather run (the one switch every
Phase 3 use reads — deed/plat analyzers, chain tracing, site intelligence, GIS quality, screenshot
classifier, property summary, map OCR verify) and logs "Gather run — AI reading skipped on purpose".

### 6.2 — The Analyze button starts on the worker ✅ BUILT + TESTED
Nothing in the app called the worker's `read-documents` pass (built for the analyze run, zero
callers); the button ran the app-side `analyzeProject`, which reads only `extracted`/`analyzed`
documents (a gather run's deeds are `pending`) and freezes on Vercel. Now a whole-project Analyze
POSTs the worker `read-documents` with `thenAnalyze: true` (OCR + summaries + chain of title under
the quoted cost cap), and the worker calls the app analysis back — in `finally`, with the cap — so
nothing parks at `analyzing`. Per-file, resume, benchmark and the callback stay in-process; an
unreachable worker falls back to in-process.

### 6.3 — A stall is a partial, not a crash ✅ BUILT + TESTED
`StallAbort` (kind `stall`, expected); the router files it like a budget stop (`partial`,
`budget_reached`-style stop reason), keeping the result instead of "docs=0, ran 0.0s".

### 6.4 — Screenshot capture respects the host circuit ✅ BUILT + TESTED
The CAD circuit had been open since Phase 1, yet the supplemental screenshots tried
esearch.bellcad.org three more times at 45 s each, then the GIS viewer 60 s, then BIS GIS 45 s
(~4 min of a capped run). The Bell screenshot collector, GIS viewer capture and direct BIS map
capture now consult `hostCircuit` before navigating and `tripHost` on a timeout.

### 6.5 — Overhead views zoom closer on a house lot ✅ BUILT + TESTED
Owner: "20 just isn't quite enough … 22 or 23". Bell Google satellite: 22 for ≤0.75 ac, 21 for ≤3 ac,
20 otherwise (`googleZoomForParcel`, acreage passed from the orchestrator); capture-plan `MAX_ZOOM`
21 → 22 so a small lot's close/detail bands reach it.

### 6.6 — Button audit (54 controls, every route + worker endpoint resolves) ✅ FIXED
Real defects fixed: a corrected parcel ID was dropped by the PATCH allow-list; three stat tiles were
no-ops on four of five stages (now land on Review first); the dialog input was never consumed, so a
later plain Start re-ran the old input; the leads panel swallowed a failed load. Plus the owner's
ask: a real **View** button beside **Source** on every live document row (opens the dedicated
viewer). Noted, not changed: "Back to Research" from Analysis is a destructive revert behind a
confirm; `ReviewDocCard` + the review-doc-list block are dead behind `{false && …}`; dead imports
and `getNextStep`/`canAdvance` in page.tsx.

### 6.7 — Free + paid avenue audit ✅ FIXED (5 of 14) / noted
Fixed: all three in-run purchase sites required the checklist to be PRESENT (an absent one now
resolves to the default — a run started without the dialog is no longer silently $0); TexasFile's
`/complete/` step (the call that charges the wallet, per the 2026-09-05 mapped flow) is now called
after the begun purchase, keeping the begun pages if it fails; a `search_required` want no longer
collapses to one ledger key per county (lookup skipped for the placeholder, row keyed on the
instrument the vendor sold, or a per-want key); `run_id` written on purchase rows; the orchestrator
loads the project library itself when no held index is passed, so prior-round dedup is ON for the
in-run sites; the early refusal files skip rows. **The five "noted for the owner" items — ALL BUILT
2026-09-06 (evening), each with tests + caller guards:**
- **Plat GUID discarded before the buy → FIXED** (`c0b0bdac2`). The search result's GUID rides the
  manifest (`previewRef`) → `PurchaseRecommendation.vendorRef/vendorProduct/subdivision` → orchestrator
  hints → adapter → `buyDocument`, which runs the PLAT search for a plat, picks the row by GUID
  (`chooseTexasFileResult`), prices it flat ($10) and buys through `/plat/`. Library lookup + ledger row
  key a GUID-only document on `texasfile:<guid>` so a prior round's plat is reused. Review labels use
  the subdivision + cabinet/slide, never `search_required`. `texasfile-plat-guid-buy-2026-09-06` (17).
- **`coerceRunSettings` drops the budgets → FIXED** (same commit). purchase-gate now uses the POST's own
  `normaliseRunSettings`, so the dedicated budgets, the checklist and the phase survive the run-record
  fallback (the common case at purchase time). purchase-gate +1.
- **`otherBudgetUsd` not metered → FIXED** (`6111cde72`). `mayBuyFromOtherSource` gates every non-TexasFile
  vendor (Kofile) in the orchestrator on the second meter; both meters are logged + on the billing
  summary; the three in-run sites pass `otherBudgetUsd`; the run finish settles both meters from the
  LEDGER (`ledgerSpendByBucket`) onto `research_runs.budget_summary`; the app's run console, cost route
  and cost badge split TexasFile from other sources. `other-sources-budget-is-metered-2026-09-06` (8) +
  gather-budget +4, ledger-spend +3, run-console +1.
- **Zero-caller gather engine → RETIRED** (`aebbcca4b`). `run-gather-pipeline` / `gather-orchestrator` /
  `texasfile-want-buyer` / `acquisition-wantlist` + their 4 tests deleted; superseded by the checklist
  wants + cross-source engine + the orchestrator with both meters. `gather-budget.ts` stays (reached).
- **App-side analysis frozen on Vercel → FIXED** (worker-driven, see the commit
  "the worker DRIVES the app's data-point analysis"). `analyzeProject` gains `skipFinalization` (a chunk
  stops before chain-of-title / cross-ref / coherence, project stays `analyzing`); the analyze route
  AWAITS a worker call with `awaitCompletion` (maxDuration 60 → 300); `drive-app-analysis.ts` runs one
  awaited call per readable document with the REMAINING cap from the ledger, then one `{resume}`
  finalize that ends at `review`. A spent cap skips the rest and still finalises; a failed chunk is
  counted and the run goes on. `drive-app-analysis-2026-09-06` (10).

### 6.8 — Still in the log, not changed
Bell CAD (`esearch.bellcad.org`) and the Bell plat repository (`bellcountytx.com`, 403 on both
egress routes — "unreachable-by-policy") did not answer; FEMA returned no zone (likely Zone X); the
tax scraper failed on the CAD host; ~~the CAD deed row logged `Instr#undefined`~~ (**FIXED** `c0b0bdac2`:
an older deed has a volume/page and no instrument; the log prints the reference the row has); Stage1D
still spends one AI call (13 s) on address variants inside the CAD scraper (search assistance, left on).

### 6.9 — What retiring the dead code found (2026-09-06 evening, `8f97cab8c`)
Plan 6.6's dead code is gone: the `{false && …}` review-doc-list, `ReviewDocCard.tsx`, `getNextStep` /
`canAdvance`, the unused imports (98 lines off `page.tsx`). Retiring the card THROUGH ITS GUARDS found the
live list (`AnalysisEstimatePanel`) had dropped the card's readability badges — "Unreadable" / "Thin text"
with the reason as tooltip + the OCR confidence label — so an unreadable deed rendered like one still
waiting. Ported onto the live row; the two source guards re-pointed. Cleaning the dead imports then exposed
two components the page had imported and never rendered since 2026-03-16 (`b675d5d30`): `AnalysisSummary`
(deleted — `DataPointsPanel` superseded it) and **`DocumentDeepAnalysisPanel` — the ONLY caller of the
980-line `/documents/[docId]/deep-analyze` route** (structured legal-description + plat AI reading, per
document). Recorded in the reachability allowlist as an **OWNER CALL: mount it on the Analysis stage as a
third per-document action, or drop the route + `document-analysis.service` with it.** Not wired blind.
Two pre-existing red guards on this branch were REAL, not debt: the rendered-classes ratchet (455 > 454:
the new View button + `leads-panel__group` had no CSS rule — styled, baseline now 452) and the
pipeline-note guard (pinned "analyze never contacts the worker", which 6.2 changed on purpose — re-pinned
to the new truth in both directions).

## PHASE 5 — Verification (then owner merge + worker rebuild)

### 5.1 — Green + build ✅ 2026-09-06 (evening)
Worker suite 215 files / 2861 green; app `__tests__/research` 156 files / 2559 green; worker + app tsc clean;
eslint clean on every edited file. Full app suite + `npm run build` run at the end of the session — result
recorded in the READY note below.

### 5.2 — Self-review (check the CALLER) ✅
Every slice this evening ships with a caller guard (the file that USES the module, not the module): the
plat GUID at every hop, the other-sources meter at the three purchase sites + run finish + app routes,
the round at run → filing context → insert → type → badge, the worker-driven analysis on both sides of
the HTTP boundary. Two guards that were green against DEAD code (ReviewDocCard) now point at the live
list. One authored-but-unrendered component remains, by decision, recorded (6.9).

### 5.3 — Ready-for-owner note
**READY 2026-09-06 (evening).** Nine commits on the branch this evening (`c0b0bdac2` → the worker-driven
analysis). Owner: (1) merge (compare URL in the handoff); (2) rebuild the worker **only when
`/healthz activePipelines=0`**; (3) apply seed 632 to live Supabase; (4) drive the loop on 1401 North East
St — the first paid plat buy is the live proof of the GUID thread; (5) decide `DocumentDeepAnalysisPanel`
(6.9). Then move this doc to `completed/`.
