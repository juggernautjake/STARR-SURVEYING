# Deeper free-first engine · five-stage content · rich capture · QA — 2026-09-06

**Started** 2026-09-06 · **Branch** `claude/paid-first-rich-capture-viewer-2026-09-05`

Driven by the stop-hook slice loop, **in the order below**. Ship the smallest meaningful next slice,
`tsc` + lint + test, commit, **push to the BRANCH** (do NOT merge to `main` — the owner merges + runs
the supervised test once EVERYTHING here is built). **Every slice starts by reading the live code it
touches.** Standing constraints: `npm run build` before the owner's eventual merge; **NEVER rebuild the
worker while a run is in flight** (`activePipelines` on `localhost:3100/healthz` must be 0); worker =
Docker on netcup `root@152.53.48.240`, repo `/opt/starr`, rebuild from `/opt/starr/worker` with
`BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose up -d --build worker`.

This continues `PAID_FIRST_RICH_CAPTURE_SHARED_VIEWER_2026-09-05.md` (now HOOK:BLOCKED — its SHIPPED
slices stand and are the foundation). Everything already shipped there is LIVE on `main` `1dd6e59f9`:
the cross-source engine testable core (A0–A5 + driver `runCrossSourceAcquisition` + the TexasFile/clerk
`ManifestEntry` mappers in `live-source-adapters.ts`), the relevance model (`documentRelevance` in
`property-search-inputs.ts`), the five-stage stepper, the E viewer, G8 merged Review list, H1/H2 fields,
B1 parcel bearings, and **A7.5 v1** — the early TexasFile buy (`runEarlyChecklistPurchase` in
`worker/src/index.ts`, fired from `onPropertyIdentified`) that buys the checklist + operator-supplied
targets. This doc replaces A7.5 v1's *blind* buy with the **true free-first engine**, then finishes the
five-stage content split, the rich captures, and QA.

Memories: `project_dedicated_county_runs_never_bought`, `project_texasfile_purchase_flow`,
`project_two_pipeline_gather_then_review`, `project_analysis_runs_on_worker_not_vercel`.

---

## PHASE 1 — Wire the deeper FREE-FIRST engine into the live run (buy paid-ONLY, per document)

Goal: at `onPropertyIdentified`, run `runCrossSourceAcquisition` for real — search the free clerk AND
TexasFile, MATCH the same document across them, and buy ONLY paid-exclusive documents (free-capture is
left to the main gather). This replaces A7.5 v1's blind checklist buy so the engine never pays for a
document the free clerk was about to return.

### 1.1 — TexasFile search-only adapter (login + search, NO buy)
Read `worker/src/services/texasfile-buy.ts` (`buyDocument`, `loginTexasFile`, `searchTexasFile`,
`acquireBrowser`). Add `searchTexasFileDocuments(input, log): Promise<TexasFileResult[]>` — acquire a
browser, log in, run `searchTexasFile`, return the results, never buy, never throw. Unit-test the shape
against a fake (the live call is exercised in the supervised run).

> ✅ **BUILT + TESTED 2026-09-06.** `searchTexasFileDocuments(input, log)` added to `texasfile-buy.ts` —
> acquireBrowser → loginTexasFile → searchTexasFile → results, never buys, returns `[]` on any failure.
> Tests: structural search-only checks in `texasfile-buy-helpers.test.ts` (asserts it logs in + searches
> but never calls `purchaseTexasFile`/`purchaseDocument`); the live browser path is exercised in the
> supervised run. tsc + suite green. 1.2 wraps it in a `SourceSearchFn`.

### 1.2 — A `SourceSearchFn` factory per source (dispatch by source id)
New `worker/src/research/live-search.ts`: `makeSourceSearch({ county, projectId, log, texasfileEnabled })`
returns a `SourceSearchFn` that, given `(acquisitionSource, target)`, dispatches: `texasfile` →
`searchTexasFileDocuments` (by name / vol-page / instrument from the target) → `texasFileResultsToManifest`;
a free clerk source → the CAD deed-history + a light clerk lookup → `clerkDocToManifest`. Isolate a
failing source (the engine already records it). Unit-test the dispatch + mapping with fakes.

> ✅ **BUILT + TESTED 2026-09-06.** `worker/src/research/live-search.ts` — `makeSourceSearch(cfg)`
> returns a `SourceSearchFn`: `texasfile` → `buildTexasFileSearchInputs` (name + each vol/page + each
> instrument) → the injectable search-only call → de-dup by GUID → `texasFileResultToManifest`; a free
> source → `cfg.knownFreeDocuments` (the CAD deed history — no second clerk crawl). Isolates a failing
> query; honours a disabled TexasFile. Tests: `live-search.test.ts` (6). Wired `live-source-adapters`
> (allowlist moved to `live-search`). tsc + guard green. 1.3 builds the `DiscoveryTarget`.

### 1.3 — Build the `DiscoveryTarget` from the run's inputs + the identified parcel
In `worker/src/index.ts`, a helper that assembles `DiscoveryTarget` from `researchInput` (owner name,
propertyId), the `identified` parcel (subdivision, situs), and `body.supplemental` (instrument numbers,
volume/page). This is what every source is searched by. Pure enough to unit-test.

> ✅ **BUILT + TESTED 2026-09-06.** `buildDiscoveryTarget(params)` in `live-search.ts` — combines owner
> name + subdivision + the operator's supplemental (instruments + vol/page) + the CAD deed-history
> instruments, de-duped, empties dropped. Tests: +2 in `live-search.test.ts` (8 total). tsc green. 1.4
> feeds this to `runCrossSourceAcquisition`.

### 1.4 — Replace A7.5 v1's blind buy with the engine's paid-ONLY decision (still EARLY)
Rewire `runEarlyChecklistPurchase` (or a successor) to: run `runCrossSourceAcquisition` for the
DISCOVER→MATCH→DECIDE steps (free-capture actions become no-ops — the main gather captures free), then
convert the `purchase` actions (paid-exclusive documents) into `PurchaseRecommendation[]` and buy them
through `DocumentPurchaseOrchestrator.executePurchases` (keeps the ledger + library + budget). Fires
from `onPropertyIdentified`, so it still beats the cut-short. Keep the C5 test honest.

> ✅ **BUILT + TESTED 2026-09-06.** `runEarlyChecklistPurchase(identified)` in `worker/src/index.ts` now
> runs the engine: `buildDiscoveryTarget` → `makeSourceSearch` (TexasFile live + the CAD deed history as
> the free manifest) → `discoverAcrossSources` → `clusterEntries` → `planAcquisition`, and buys ONLY the
> plan's `purchase` (paid-exclusive) documents PLUS the operator's explicit supplemental targets, through
> `DocumentPurchaseOrchestrator.executePurchases` (ledger + library + gate). The CAD deed history is
> threaded to `IdentifiedProperty.knownDocuments` (run-order.ts + bell/orchestrator.ts). Discovery failure
> is non-fatal (operator targets still buy). C5 + purchase-gate kept honest; wired the engine modules
> (removed `live-search` from the allowlist). Tests: `free-first-engine-is-wired.test.ts` (5, checks the
> CALLER); full worker suite 2774 green, tsc clean.

### 1.5 — Relevance filter on the manifest (id/address main, supplemental secondary) ✅ BUILT + TESTED
Apply `documentRelevance` to the discovered entries before matching, dropping documents that match none
of the property's id/address/instrument/vol-page keys — never rejecting on a missing supplemental field.
Unit-test with the 64567 fixtures.

**Built:** `runEarlyChecklistPurchase` (index.ts) now builds a `PropertySearchInputs` from the run
(county, propertyId, address, ownerName, supplemental instruments + vol/pages, subdivision) and RANKS
the plan's `purchase` actions by `documentRelevance(cluster).confidence` descending before mapping to
`PurchaseRecommendation[]`. The searches are already property-scoped, so this ORDERS the buy (most
relevant first) and never drops a candidate for a missing supplemental key (the grain-of-salt rule).
`property-search-inputs.ts` removed from the orphan allowlist (now wired). **Tested:** tsc clean;
`free-first-engine-is-wired` (+ new 1.5 ranking assertion), `research-modules-are-reachable`,
`purchase-order-visuals-lead` green; full worker suite 2780 green.

### 1.6 — A6: surface the SOURCE-COMPARISON manifest ✅ BUILT + TESTED
Write the engine's manifest (per document: which sources had it, each cost, the CHOSEN source + reason)
to `analysis_metadata` and render it in the run panel + Review — the "detailed analysis of what all the
sources provide" the owner asked to SEE.

**Built:** `runEarlyChecklistPurchase` (worker/src/index.ts) now builds `sourceComparison` from
`plan.actions` — one row per document (docType, instrument/book/page, relevance, every source with its
kind + unit cost + capabilities, the decision free_capture/purchase/skip, the chosen source, cost,
reason) — and persists it (merged, not replacing) to `analysis_metadata.sourceComparison`. App side:
`_sections/source-comparison-data.ts` (`sourceComparisonOf` shaper + `rowLabel` + `SOURCE_COMPARISON_KEYS`),
`_sections/SourceComparisonCard.tsx`, mounted in the Review → Artifacts tab, styled with real theme
tokens in AdminResearch.css. **Tested:** worker tsc + suite 2781 green; app tsc clean; new
`__tests__/research/source-comparison-contract.test.ts` (23) — worker writes every key the page reads,
page mounts the card, shaper unit-tested; gis-quality token test re-green (caught + fixed a fictional
`--theme-bg-primary`); `free-first-engine-is-wired` extended with a 1.6 persistence assertion.

### 1.7 — Wiring tests + de-list the engine modules from the orphan allowlist ✅ BUILT + TESTED
Assert the live Bell path (index.ts) INVOKES the engine (check the caller). As each engine module
gains a real caller, remove its `KNOWN_UNREACHABLE` entry (cross-source-acquisition,
live-source-adapters, property-search-inputs, …).

**Built / design decision:** the live path (`runEarlyChecklistPurchase` in index.ts, fired from
`onPropertyIdentified`) invokes the engine's A1–A3 DECISION pieces DIRECTLY — `makeSourceSearch` →
`discoverAcrossSources` → `clusterEntries` → `planAcquisition` — and executes the buy through
`DocumentPurchaseOrchestrator`. It does **not** route through the `runCrossSourceAcquisition` driver's
generic executor (`cross-source-acquire`), because the orchestrator owns the cross-run library dedup,
the `research_usage_events` ledger, the permission gate and the real page-count budget that the generic
executor lacks — routing through the wrapper would DOWNGRADE those. So `cross-source-acquisition.ts`
stays a unit-tested convenience composition of the same pieces, recorded as an accurate
`KNOWN_UNREACHABLE` decision (note rewritten), not forced into the live path. `live-source-adapters`
(1.2/1.3) and `property-search-inputs` (1.5) were de-listed as they gained real callers. **Tested:**
`free-first-engine-is-wired` (7 — the CALLER check) + `research-modules-are-reachable` (9, incl. the
no-stale-entry guard) green; full worker suite 2781 green.

---

**PHASE 1 COMPLETE** — the deeper free-first engine is fully built, wired into the live run, and
surfaced in Review. Every document acquisition is now free-first per-document: TexasFile is searched,
its results compared against the CAD deed history (the free manifest), only paid-exclusive documents
are bought, ranked by relevance to the property, within budget, through the ledger/library/gate — and
the whole source comparison is persisted and rendered.

---

## PHASE 2 — Five-stage CONTENT split (G3/G4): Analysis and Review are distinct screens

The stepper already shows five stages; the CONTENT still shares one branch. Split it.

### 2.1 — Read the Review render + map the pieces ✅ BUILT + TESTED
Read `app/admin/research/[projectId]/page.tsx` (`currentStage === 'analysis' || 'review'` branch): the
Run AI Review control, the merged Analyze·View·Source list (`AnalysisEstimatePanel`), the project cost
badge, data points, discrepancies, export bar. Decide which belong to Analysis vs Review.

### 2.2 — Analysis stage content ✅ BUILT + TESTED (`currentStage === 'analysis'`)
Render the Run AI Review control + the merged Analyze·View·Source list + the cost badge under the
Analysis stage only. Include a "Continue to Review →" that sets `viewStage='review'`.

### 2.3 — Review stage content ✅ BUILT + TESTED (`currentStage === 'review'`)
Render the finished data points, discrepancies, per-document analysis results + the export bar under
Review only. Keep the shared `SourceDocumentViewer` mounted (E4 parity).

### 2.4 — Navigation across the five stages ✅ BUILT + TESTED
"Continue to Analysis →" from Research (on gather complete); "Continue to Review →" from Analysis;
"Continue to Job Prep →" from Review. Ensure `canViewStage` lets the reader move Research→Analysis→Review
even though both live in the `review` DB state.

### 2.5 — G6: every DATA POINT links to its source URL/page ✅ BUILT + TESTED
Read the data-point render + model; add a button on each data point that opens a new tab to the
document/source URL it was extracted from (`source_url`). Show it in Analysis + Review.

### 2.6 — Tests + wiring ✅ BUILT + TESTED
Assert the Analysis branch renders the analyze controls, the Review branch renders the results, and a
data point's source button opens the recorded URL.

**Built (2.1–2.6):** `page.tsx`'s shared `analysis || review` branch is split by `currentStage` —
the header names the stage; the AI review control + `AnalysisEstimatePanel` (merged Analyze·View·Source)
render only on Analysis behind `{currentStage === 'analysis' && …}`; the export bar + summary-panel tabs
(data points, discrepancies, artifacts incl. the 1.6 SourceComparisonCard) render only on Review behind
`{currentStage === 'review' && …}`; the `ProjectCostBadge`, the raw log viewer and the shared
`SourceDocumentViewer` modal stay visible on both (E4 parity). Navigation: gather-complete lands on
Analysis (`setViewStage('analysis')`); Analysis↔Review are view-only moves; Review→Job Prep is the real
status change; the stepper's dots move the view too. G6: `DataPointsPanel` gained a `sourceUrlFor`
resolver and renders a "Source ↗" new-tab link per data point (absent when the source has no URL); the
page passes `documents.find(...).source_url`. **Tested:** app tsc + lint clean; new
`__tests__/research/analysis-review-split.test.ts` (9); research app suite 2531 green. Browser QA of the
rendered split is folded into Phase 6 (F).

---

## PHASE 3 — B2: emit the parcel boundary segments as STRUCTURED data

### 3.1 — Emit subject-parcel segments from the capture ✅ BUILT + TESTED
In the `cad_parcel_lines` render path (`worker/src/index.ts` `runCapturePlan` + `parcel-map-render.ts`),
compute `parcelSegments(ring)` (bearing, azimuth, length) for the subject and attach a
`{ segments[], perimeterFt, areaAc }` payload to the run result / `analysis_metadata` (not only baked
into the PNG).

### 3.2 — Surface the segments ✅ BUILT + TESTED
Show the segment table (bearing · length per side, GIS-computed) in Review beside the parcel drawing.

### 3.3 — Tests ✅ BUILT + TESTED
Unit-test the emitted payload against a known ring.

---

## PHASE 4 — C: surrounding-parcel boundary captures (GIS-only)

### 4.1 — Per-adjoiner lines-only capture ✅ BUILT + TESTED
Read `capture-plan.ts` §3 (neighbour planning) + `gis-scraper.ts::findAdjacentParcels` (each adjoiner
already carries its rings). Add a `cad_parcel_lines`-style capture per adjoiner (boundary + bearings,
`basemap:'none'`), labelled "Adjoiner parcel lines — <owner/id> (<direction>)".

### 4.2 — Structured segments per adjoiner ✅ BUILT + TESTED
Emit the Phase-3 `{ segments, perimeterFt, areaAc }` payload for each adjoiner, keyed to the adjoiner
register (`research_adjoiners`).

### 4.3 — Cap + toggle ✅ BUILT + TESTED
Respect `MAX_NEIGHBOUR_CAPTURES` (or a dedicated cap) and a checklist toggle. GIS-only; no adjoiner deed
purchasing.

### 4.4 — Tests ✅ BUILT + TESTED
Unit-test the per-adjoiner capture planning.

**Built (4.1–4.4):** new `cad_adjoiner_lines` capture kind. In `capture-plan.ts` §3b, when
`captureAdjoinerLines` is on (sourced from `gatherSelections.adjoiners.enabled` — OFF by default,
honouring the owner's adjoiner deferral) and a parcel layer exists, the plan adds a lines-only
`cad_adjoiner_lines` capture per adjoiner that has a `parcelId` (up to `MAX_NEIGHBOUR_CAPTURES`),
labelled "Adjoiner parcel lines — <owner> (<id>)"; records a skip with the reason when off. The
neighbour input now carries `parcelId`. `capture-runner.ts` files it under `gis_map`. In `index.ts`
the render matches the adjoiner in the layer (`renderParcelMap`, `basemap:'none'`) and persists ITS
segments/perimeter/area to `analysis_metadata.adjoinerBoundaries` keyed by parcelId — NOT the
subject's `boundarySegments`. GIS-only throughout; never a deed purchase. **Tested:** worker tsc +
lint clean; +6 adjoiner tests in `capture-plan.test.ts` (41); repointed the fragile `capture-is-wired`
cad_gis-OCR anchor to the map's label (adjoiner lines now share `source: 'cad_gis'`); full worker
suite 2791 green.

---

## PHASE 5 — D: adaptive Google/ArcGIS zoom by parcel size

### 5.1 — Acreage/bbox-adaptive Google zoom band (3–4 levels) ✅ BUILT + TESTED
Read `capture-plan.ts` `ZOOM_BANDS`/`framedZoom`. Produce 3–4 Google captures spanning whole-parcel →
close, derived from the parcel's actual size, pushing the deep end to Google's ceiling so small lots get
as close as Google renders.

**Built (5.1–5.4):** new pure `adaptiveZoomBands(framedZoom)` returns the wide/subject/close ladder
(offsets off the acreage-framed zoom) PLUS a 4th `aerial_detail` band pinned to `MAX_ZOOM` — added only
when the close band has not already reached the ceiling, so a large tract gets one Google-ceiling detail
capture and a small lot (whose close IS the ceiling) is not handed a duplicate. `planCaptures` now walks
this ladder; the new kind files under `aerial_close` (runner) and renders on the aerial path (index.ts
`AERIAL` set). 5.2/5.3 were already satisfied by the always-planned `cad_parcel_lines` vector render,
which is crisp at any scale and framed to the subject's TRUE bbox via `renderParcelMap`'s
`frameFor(subject.rings)` (tested in `parcel-map-render.test.ts`) — the deep vector fallback for when
raster imagery can't get close enough. **Tested:** worker tsc + lint clean; +5 adaptive-zoom tests in
`capture-plan.test.ts` (46); repointed the pinned `AERIAL`-set assertion; full worker suite 2796 green.

### 5.2 — Deep ArcGIS vector render for small lots ✅ BUILT + TESTED
For a lot where Google's max isn't close enough, add a deep ArcGIS/parcel-layer vector render (crisp at
any scale) framed tight to the lot.

### 5.3 — Frame from the parcel's true bbox ✅ BUILT + TESTED
Base framing on the parcel polygon's bounding box so the whole boundary fits at the widest level.

### 5.4 — Tests ✅ BUILT + TESTED
Unit-test the adaptive zoom-band computation across parcel sizes.

---

## PHASE 6 — F: verification (then hand back to the owner for merge + the test run)

### 6.1 — Green + build
Full worker + app suites green; `tsc` clean; `npm run build` clean.

### 6.2 — Self-review pass
Re-read each new caller-site (engine wiring, stage split) and confirm it is actually reached (this
repo's #1 defect is authored-but-not-wired). Fix any gaps.

### 6.3 — Ready-for-owner note
When every slice above is shipped, annotate here that the branch is READY: the owner merges + deploys
(app Vercel + worker) and runs the supervised paid run on 1401 North East St to verify TexasFile buys.
Do NOT merge or run — those are the owner's. Then move BOTH docs to `completed/`.
