# Cross-source cost-optimal acquisition · rich parcel capture · shared in-progress viewer — 2026-09-05

**Started** 2026-09-05 · **Branch** `claude/paid-first-rich-capture-viewer-2026-09-05`

Driven by the stop-hook slice loop.

**A7 decision (owner 2026-09-05): build the FULL cross-source engine early-wiring** — real Bell-clerk
free-search + TexasFile search adapters, the free-capture + buyDocument effects, and the driver that
runs discover→match→decide→buy-paid-only from `onPropertyIdentified` (early), with the `documentRelevance`
filter and the C5 test updated to "buy paid-only early". Then deploy + supervised run on 64567. Ship the smallest meaningful slice, `tsc` + lint + test, commit,
push, annotate. **Every slice starts by reading the live code it touches.** Standing constraints: ask
before each merge to `main`; `npm run build` before a merge; **NEVER rebuild the worker while a run is
in flight** (`activePipelines` on `localhost:3100/healthz` must be 0); worker = Docker on netcup
`root@152.53.48.240`, repo `/opt/starr`, rebuild from `/opt/starr/worker` with
`BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose up -d --build worker`, then
verify `buildSha` on `http://localhost:3100/healthz`.

This is the plan for the owner's 2026-09-05 supervised-session requirements. Memories:
`project_dedicated_county_runs_never_bought`, `project_texasfile_purchase_flow`,
`project_two_pipeline_gather_then_review`, `project_analysis_runs_on_worker_not_vercel`,
`project_research_pipeline_completion`.

## Why this plan exists (the 2026-09-05 findings)
- **Dedicated-county (Bell) runs never bought from TexasFile.** The purchase block lived only in the
  `generic-pipeline` branch of `worker/src/index.ts`; a `county-specific` result skipped it. FIXED +
  DEPLOYED (`ed1049322`): the county branch now runs the checklist purchase keyed on the discovered
  owner. **But** it runs in the post-run completion handler, which only executes on a CLEAN finish.
- **The purchase never fires for a heavy property.** 2417 Stoneham's owner is the subdivision
  developer (LHCS LLC, 30+ deeds); the deed sweep alone runs ~35 min and the run is cut short by the
  12-min stall watchdog / 60-min hard cap (`HARD_WALL_CLOCK_MS`, not raisable above 60) BEFORE the
  completion handler. The abort catch (`worker/src/index.ts` ~2809) runs no purchase. So acquisition
  must move to the FRONT of the run — which Phase A's discover→decide→**buy-early** does, retiring this
  blocker.
- **Refined owner requirement (2026-09-05):** don't just buy blindly — SEARCH every free and paid
  source, COMPARE what each offers, and acquire each document from its cheapest source (free when
  available, purchase only paid-exclusive / illegible-free). Phase A is that engine.

## What already works (verify before touching — do NOT rebuild)
- TexasFile buy path: `worker/src/services/texasfile-buy.ts` (`buyDocument` → login → `searchTexasFile`
  by **name** (`name-0-name`) or vol/page → `purchaseTexasFile` → download → `fileForReview`).
  `searchName` now threads the owner name from `wantsToPurchaseRecommendations`
  (`worker/src/research/selection-purchases.ts`) through `DocumentPurchaseOrchestrator.executePurchases`
  (`worker/src/services/document-purchase-orchestrator.ts`) into the buy.
- Capture-plan pipeline: `worker/src/research/capture-plan.ts` (plan) → `worker/src/index.ts`
  `runCapturePlan` (~4471) → `worker/src/research/parcel-map-render.ts` (`renderParcelMap`). `cad_gis`
  = imagery basemap; `cad_parcel_lines` = `basemap:'none'`, `edgeLengths:true` (lines only, NO
  overhead — KEEP this). Esri World Imagery tiles for aerials.
- Parcel geometry: `worker/src/counties/bell/scrapers/gis-scraper.ts` (`scrapeBellGis`,
  `findAdjacentParcels` line 240, `discoverSiblingLots`) returns WGS84 `[lon,lat]` rings per parcel.
  Edge LENGTHS computed in `parcel-map-render.ts::renderOverlaySvg` (378-394); per-segment BEARINGS
  already computed in `worker/src/counties/bell/analyzers/adjacent-analyzer.ts::computeSharedBoundary`
  (146-200). So bearings on the drawing reuse existing math.
- Review viewer: `app/admin/research/components/SourceDocumentViewer.tsx` (modal; multi-page via
  `ocr_regions.pageUrls`; zoom via `lib/viewers/viewer-fit.ts`; rotate/pan/PDF-iframe; clickable
  "Source ↗" from `ResearchDocument.source_url`). Opened from the Review list via `setViewerDoc(doc)`.
- `ResearchDocument` (`types/research.ts` 129-160) carries `source_url`; DB column
  `research_documents.source_url` exists (`seeds/090_research_tables.sql` 192).

## Feasibility notes (read before building the affected slice)
- **Google Maps zoom caps ~21-22.** `@…,{z}z` will clamp; literal 25/30 do not render deeper on
  Google. Capture-plan clamps `MAX_ZOOM=21`. So D-slices request 25/30 AND capture the deepest real
  Google level, and add deep ArcGIS/GIS parcel-layer zooms where 25/30 ARE meaningful. Document the
  clamp in the label, never silently pretend a z30 Google image exists.
- **GIS bearings are parcel-fabric geometry, not recorded plat calls** (`parcel-map-render.ts:528`
  already says so). Label them as "GIS-computed" so a surveyor never mistakes them for record calls.
  Compute in true grid azimuth (reproject rings to State Plane WKID 2277) OR keep the existing
  `cos(lat)` lon/lat correction — state which in the label.
- **Adjoiner capture here is GIS-only** (boundary screenshots from geometry already fetched), NOT deed
  purchasing. The owner's earlier "don't search adjoiner properties this run" was about paid deed
  research; this is the cheap GIS boundary drawing. Keep the paid adjoiner-deed toggle OFF/separate.

---

## PHASE A — Cross-source discovery, comparison & cost-optimal acquisition (owner #1, refined 2026-09-05)

The engine: SEARCH every free and paid source for the checklist targets, build a per-source
availability MANIFEST, MATCH the same document across sources, then ACQUIRE each document from its
cheapest viable source — free capture when a free source has it, PURCHASE only what is paid-exclusive
(or the paid copy when the free one is illegible), within the paid budget and in survey priority order.
Each purchase fires EARLY (right after its per-document decision), so it happens long before any
stall/60-min cut-short — which also RETIRES the "purchase only on clean completion" blocker that
stopped the 2026-09-05 supervised run from ever buying.

**Owner decisions (2026-09-05):** matching = **metadata first, AI only to resolve ambiguous** (hybrid);
free-vs-paid = **prefer free, buy the paid copy only when the free one is illegible**; paid sources =
**TexasFile now, a config-driven framework for more** (Kofile/Tyler later); buy priority when the paid
budget is tight = **most-recent plat → most-recent deed → older deeds/easements**.

This supersedes the earlier blunt "TexasFile-first" framing: free is preferred whenever a free source
has the same document; paid spend is reserved for paid-exclusive (or illegible-free) documents.

### A0 — Source registry (free vs paid, cost, coverage), scoped by the checklist
A registry describing each source: `{ id, kind:'free'|'paid', countyCoverage, costModel, search(),
acquire() }`. Free: Bell CAD, Bell County Clerk plat repo, Tyler/publicsearch clerk, Avenu, …; Paid:
TexasFile (enabled/funded), Kofile/Tyler (framework, disabled). What to look for comes from the run's
`gatherSelections` (plats/deeds/easements). Read `worker/src/research/research-modes.ts` (source
catalogue) and `worker/src/services/clerk-registry.ts` FIRST — reuse, do not duplicate the source list.

> **SHIPPED 2026-09-05.** `worker/src/research/acquisition-sources.ts` — `acquisitionSourcesFor(county,
> wants, {paidEnabled})` reuses the existing `SOURCE_CATALOGUE` (no second list): every WIRED source
> serving the county whose capabilities cover the checklist's paid wants (`capabilityForWant`:
> deed/easement→conveyances, plat→plats; maps are free captures, not clerk sources), free sources
> ordered before paid. Exported `isSourceWired` from `research-modes.ts` so the engine and `buildPlan`
> share one "wired" definition. Tests: `acquisition-sources.test.ts` (6). Suite green, tsc clean. A1
> (discovery pass) iterates this registry.

### A1 — Discovery pass: search every in-scope source, build an availability MANIFEST (no downloads yet)
For each source, run its search for the checklist targets (owner name, subdivision, lot, instrument,
book/page) and record every FOUND document as a manifest entry: `{ sourceId, docType, instrument?,
book?, page?, recordingDate?, grantor?, grantee?, pageCount?, unitCostUsd, previewRef?, canFreeCapture,
canPurchase }`. Metadata + availability ONLY — cheap; no capture/purchase here. Emit progress so the
operator sees the cross-source search happening.

> **SHIPPED 2026-09-05.** `worker/src/research/cross-source-discovery.ts` —
> `discoverAcrossSources(county, wants, target, search, {paidEnabled, log})` iterates the A0 registry
> (free sources before paid), collects a flat `ManifestEntry[]` plus a per-source `searched[]` outcome
> list, and isolates a failing source (recorded, others still run). The per-source `SourceSearchFn` is
> injected — the real adapters (Bell clerk, TexasFile search) are supplied by the A7 live wiring. This
> made A0 reachable (moved the orphan-guard entry up to this module). Tests:
> `cross-source-discovery.test.ts` (4). tsc + guard green. A2 (matching) consumes `ManifestEntry[]`.

### A2 — Cross-source MATCHING: cluster the same document across sources (hybrid)
Group manifest entries into CLUSTERS that are the same underlying instrument. Metadata match first —
normalised instrument (strip non-digits: `2019-3389` ≡ `20193389`), or book+page, or recording date +
grantor/grantee; reuse the cross-vendor identity logic (`DocumentIndex.decide`, S-13/S-14). For
ambiguous / near-miss pairs ONLY, run a single AI image comparison to confirm sameness (the hybrid the
owner chose). Output: one cluster per real document → the set of sources offering it + each cost.

> **SHIPPED 2026-09-05.** `worker/src/research/cross-source-match.ts` — `clusterEntries(entries,
> judge?)` groups the manifest into one cluster per real document. The cross-check weighs every signal
> a record carries (owner 2026-09-05: "names, dates, location and instrument number and anything
> else"): instrument or book+page is a DEFINITE match (`metaKey`); otherwise `matchConfidence` scores
> recording-date + grantor + grantee + legal-location agreement (`matchSignals`), merging at
> `CONFIDENT_SAME` (0.7) on metadata alone and deferring only `NEEDS_JUDGE` (0.4–0.7) borderlines to the
> injected AI judge; fails toward NOT merging. Added location fields (legalDescription/subdivision/lot/
> block/situsAddress) to `ManifestEntry`. Helpers `hasFreeSource`/`cheapestSource` feed A3. Tests:
> `cross-source-match.test.ts` (12); orphan guard + tsc green. A3 (decision) consumes the clusters.

### A3 — Acquisition DECISION: cheapest viable source per cluster
For each cluster choose a source: any FREE source → free-capture from the best free source; else
paid-exclusive → purchase (TexasFile), subject to the paid budget and priority (most-recent plat →
most-recent deed → rest). Emit an explicit per-document decision + REASON (`free: on Bell clerk`,
`paid-only: TexasFile $5`, `skipped: over budget`). NEVER plan a purchase for a document a free source
already has — that is the whole point.

> **SHIPPED 2026-09-05.** `worker/src/research/cross-source-acquire-plan.ts` — `planAcquisition(clusters,
> {paidBudgetUsd, paidEnabled})` returns an `AcquisitionAction[]` (`free_capture` | `purchase` | `skip`),
> each with a reason: free-available documents capture from the cheapest free source (never bought);
> paid-exclusive documents are ranked by `priorityTier` (plat→deed→easement→rest, most-recent first
> within a tier) and bought within `paidBudgetUsd`, the rest skipped `over budget`. Returns
> `plannedPaidUsd` + `skippedOverBudget`. Wires A2. Tests: `cross-source-acquire-plan.test.ts` (6);
> guard + tsc green. A4 executes these actions (free capture + real TexasFile buy) early in the run.

### A4 — ACQUIRE early + resilient: run the plan, buy as soon as decided, file immediately
Execute the decisions: free captures + TexasFile purchases. Fire each PURCHASE the moment its decision
is made (early, right after discovery/match), not in a post-run handler — a stall/cap must not rob the
run of a buy it already decided on. Skip re-buying anything a prior run owns (cross-run library). File
every acquired document to Review as it lands.

> **SHIPPED (orchestration) 2026-09-05.** `worker/src/research/cross-source-acquire.ts` —
> `executeAcquisitionPlan(plan, {capture, purchase, paidBudgetUsd, log})` walks the A3 actions, runs the
> INJECTED free-capture / purchase effects, gates each buy on the REAL remaining budget (so wallet spend
> can't exceed the ceiling even if a doc has more pages than estimated), isolates a failing
> capture/buy, and returns `{acquired[], spentUsd, freeCaptured, purchased, failed}`. Wires A3 (keeps the
> whole A1→A4 chain reachable). Tests: `cross-source-acquire.test.ts` (4); guard + tsc green. **A7
> supplies the real effects** (Bell free-capture + `buyDocument`) and files each doc to Review + skips
> library-owned docs — the live-integration piece.

### A5 — Legibility override: buy the paid copy when the free one is unreadable (owner Q2)
After a free capture, run the readability check (reuse the existing readability/legibility scoring). If
the free copy is illegible AND a paid source in the cluster has it AND budget remains, buy the paid
copy and supersede the free one; state the reason in the manifest.

> **SHIPPED (decision) 2026-09-05.** `decideLegibilityRebuy(cluster, freeReadability, {legibilityThreshold,
> remainingBudgetUsd})` in `cross-source-acquire-plan.ts`: re-buys the paid copy only when the free
> readability is below threshold AND a paid source has the document AND its cost fits the remaining
> budget; otherwise returns why not. Tests: +4 in `cross-source-acquire-plan.test.ts` (10 total). tsc
> green. **A7 wires it**: feed the real readability score after each free capture and run the buy +
> supersede when `rebuy` is true.

### A6 — Surface the SOURCE-COMPARISON manifest in the UI ("detailed analysis of what all sources provide")
Render the manifest as a visible comparison: one row per document (cluster) × the sources that have it
× each cost × the CHOSEN source × the reason. Show it in the run panel (live) and in Review. This is
the "detailed cross comparison" the owner asked to SEE, not just an internal structure.

### A7 — Resolve the dual Bell path, wire the engine into the LIVE run, fire after Phase 1

> **DUAL PATH RESOLVED 2026-09-05.** The live Bell run is `index.ts → counties/router.ts` (switch
> `case 'bell'`) `→ runBellCountyResearch` (`counties/bell/index.js`) `→ orchestrateBellResearch`
> (`counties/bell/orchestrator.ts`) — the "dedicated research module", producing a `county-specific`
> result. `services/pipeline.ts::runPipeline` is the GENERIC path the router uses for non-dedicated
> counties. The clean early seam is the **`onPropertyIdentified` hook** (index.ts ~1243), which fires
> right after Phase 1 identifies the parcel, IN `index.ts` scope (runSettings + all purchase helpers
> available) — no orchestrator signature change needed.
>
> **CONFLICT FOUND 2026-09-05 — a naive early buy is WRONG.** A first attempt fired the checklist
> purchase from `onPropertyIdentified` and broke the C5 invariant
> (`purchase-order-visuals-lead.test.ts`: "free sources lead; the paid step runs AFTER the free
> stages") — because buying the general checklist EARLY, before the per-source free check, would pay
> for a deed the free county clerk was about to return. That is the exact waste the owner's own
> "prefer free" rule forbids. **So A7 must fire the CROSS-SOURCE ENGINE early (discover free+paid →
> match → buy paid-ONLY / operator-supplied targets), not a blind early buy.** That needs the real
> free-source `SourceSearchFn` adapter (Bell clerk → `ManifestEntry`) + the TexasFile search adapter,
> wired into `onPropertyIdentified`, and the C5 test updated to reflect "buy paid-only, early" rather
> than "all paid after all free". Two proven runs (2417 Stoneham, 1401 North East) confirm the buy MUST
> be early: both reached ~99% and were cut short before the end-of-run purchase, TexasFile $0. The
> attempt was reverted (tree clean); this is the remaining integration + a supervised run to validate.
Determine which Bell path the live run uses — `worker/src/counties/bell/orchestrator.ts`
(`orchestrateBellResearch`) vs the Bell handling in `worker/src/services/pipeline.ts` — by reading the
router/dispatch, THEN wire the engine into the live one, running after Phase 1 identifies the
owner/subdivision and before the old ad-hoc free scrape. Retire or gate the old scattered acquisition
and the `ed1049322` completion-handler purchase so nothing double-acquires; update
`purchase-gate.test.ts`'s spend-site count if a site moves.

### A8 — Wiring tests (assert the CALLER) + settings/labels
Tests that the live Bell path INVOKES the engine and that a decision prefers free / buys paid-exclusive
/ respects budget + priority — assert the caller runs it, not that the engine imports its helpers.
Update the run-settings + dialog copy to describe "search everywhere, buy only what's paid-only," and
keep the paid budget inputs.

---

## PHASE B — GIS parcel boundary with bearings + distances (owner #2)

Keep the imagery-off `cad_parcel_lines` capture; add each side's BEARING alongside its length, and
emit the segments as structured data.

### B1 — Label each parcel side with bearing + distance
Read `worker/src/research/parcel-map-render.ts::renderOverlaySvg` (edge-length labels, 378-394).
Compute each segment's bearing/azimuth from the ring vertices (reuse the `computeSharedBoundary` math
from `adjacent-analyzer.ts`) and render "N45°12'E · 120.4 ft"-style labels on the lines-only drawing.
Mark them GIS-computed (see feasibility note).

> **SHIPPED 2026-09-05.** New pure module `worker/src/research/parcel-geometry.ts`
> (`segmentLengthFt`, `segmentAzimuthDeg`, `azimuthToBearing`, `parcelSegments`, `perimeterFt`) is the
> single source of truth for side geometry; `renderOverlaySvg` now labels each subject side
> `"<bearing> · <length>′"` (e.g. `N90°00′E · 94.3′`) via that module, replacing the inline length
> math. Tests: `parcel-geometry.test.ts` (5) + updated `parcel-lines-and-centred-frames` parser.
> Full worker suite green (2710), tsc clean. `parcelSegments`/`perimeterFt` are the ready-made
> structured-data source for **B2** and the per-adjoiner geometry for **C1/C2**.

### B2 — Emit the parcel's boundary segments as structured data
Alongside the image, emit a `{ segments: [{ bearing, azimuthDeg, lengthFt, from, to }], perimeterFt,
areaAc }` payload from the subject parcel geometry so it is usable downstream (report, viewer, future
CAD import), not only baked into a PNG. Persist where the run's other structured data lives.

### B3 — Keep it imagery-off; do not regress the aerials
Confirm `cad_parcel_lines` stays `basemap:'none'` and the separate aerial captures are untouched.

---

## PHASE C — Surrounding-parcel boundary capture (owner #3)

For each adjoining parcel, produce the same lines-only boundary drawing (with bearings/distances), not
just the existing satellite aerial.

### C1 — A per-adjoiner `cad_parcel_lines`-style capture
Read `worker/src/research/capture-plan.ts` §3 (neighbour planning, `aerial_neighbours`,
`MAX_NEIGHBOUR_CAPTURES=6`) and `findAdjacentParcels`. For each adjoiner (using the rings already
returned by the spatial query), add a lines-only boundary capture via `renderParcelMap({
basemap:'none', edgeLengths:true })` with bearings (Phase B). Label
"Adjoiner parcel lines — <owner/id> (<direction>)".

### C2 — Structured boundary data per adjoiner
Emit the same `{ segments, perimeterFt, areaAc }` payload for each adjoiner (Phase B shape), keyed to
the adjoiner register (`worker/src/infra/adjoiner-persistence.ts` / `research_adjoiners`).

### C3 — Cap + toggle
Respect a sensible cap (reuse `MAX_NEIGHBOUR_CAPTURES` or a dedicated one) and a checklist toggle so
the surrounding-parcel capture can be turned off. GIS-only; no adjoiner DEED purchasing here.

---

## PHASE D — Adaptive Google-map zoom by parcel size (owner #4, refined 2026-09-05)

Capture Google-map images at the RIGHT zoom for the parcel's size: a big parcel framed wide enough to
show the whole boundary, a small subdivision lot deep enough to actually see detail (owner: "zoom 20 is
not quite enough" for some lots). Capture 3–4 adaptive levels so at least one is always a good frame.

### D1 — Acreage-adaptive Google zoom band, 3–4 levels, small lots reach the deepest
Read `worker/src/research/capture-plan.ts` `ZOOM_BANDS` (offsets from an acreage-derived `framedZoom`;
`MIN_ZOOM=14`, `MAX_ZOOM=21`) and how `framedZoom` is computed from acreage/bbox. Produce 3–4 Google
captures spanning "whole parcel visible" → "close detail", derived from the parcel's ACTUAL size
(acreage, or the parcel polygon's bbox), so a 50-acre tract and a 0.15-acre lot each get an appropriate
spread. Push the deep end to Google's real ceiling (~21–22; it clamps beyond that) so small lots get as
close as Google renders.

### D2 — Vector parcel render for genuinely deeper-than-Google detail (small lots)
For a lot where even Google's max is not close enough, add an ArcGIS/parcel-layer vector render (crisp
at any scale) framed tight to the lot, so "really see everything" is satisfied without Google's imagery
ceiling. Reuse `renderParcelMap` at a deep frame.

### D3 — Frame from the parcel's true extent, not a fixed radius
Base framing on the parcel polygon's bounding box (already fetched) so the whole boundary fits with a
small margin at the widest level — not a fixed half-width that clips large parcels or over-zooms tiny
ones. This is what makes "get the right zoom every time" true across parcel sizes.

---

## PHASE E — Shared dedicated viewer in the in-progress (Stage 2) phase (owner #5)

The live run panel's document list must use the SAME `SourceDocumentViewer` as Review, with a
clickable source URL.

### E1 — `RunDocument` carries `source_url`
Read `app/admin/research/components/useRunState.ts` (`RunDocument` 50-68) and the API that fills
`run.documents`. Add `source_url` to `RunDocument` and select it in the run-documents query (the DB
column + `ResearchDocument.source_url` already exist).

### E2 — Open `SourceDocumentViewer` from the in-progress `DocumentList`
Read `app/admin/research/components/ResearchRunView.tsx` (`DocumentList` 370-510). Replace the plain
`<a target=_blank>` row action with an in-app open that mounts `SourceDocumentViewer` (the Review
modal), mapping a `RunDocument` to the `ResearchDocument` shape the viewer needs (or fetch the full
`ResearchDocument` by id on open). Multi-page click-through + zoom must work identically to Review.

### E3 — Clickable "Source ↗" per row in the in-progress list
Render each file's `source_url` as a "Source ↗" link (opens a tab with the origin URL) in the
in-progress `DocumentList`, matching the viewer's header link behaviour.

### E4 — Parity check
A slice that confirms the in-progress viewer opens, zooms, and pages through a multi-page doc exactly
like Review (shared component, not a second implementation). Prefer reusing `SourceDocumentViewer`
directly over cloning it.

---

## PHASE G — Five-stage pipeline: Research and Analysis split; viewer + source links everywhere (owner 2026-09-05)

The pipeline goes from FOUR stages to FIVE: **1. Property Information → 2. Research** (find + download
the docs/files/images from the sources — NO analysis) **→ 3. Analysis** (OCR + extract + summarise every
document) **→ 4. Review** (full review of the data + each document's detailed analysis results) **→ 5.
Job Prep**. The current "Research & Analysis" stage splits into separate Research and Analysis stages.
The dedicated `SourceDocumentViewer` is usable in Research (as files land dynamically), Analysis, AND
Review. Every extracted DATA POINT gets a button that opens a new tab to the source URL/page it came
from. This makes the two-pipeline gather/analyze model (`phase:'gather'|'analyze'`) explicit in the UI.

### G1 — Split the stage model 4 → 5 (Research | Analysis separate)
Read the pipeline stage definitions + the "RESEARCH PIPELINE" stepper + the run-status→stage mapping
(`app/admin/research/[projectId]/page.tsx`, the stage constants, and any shared stage enum). Insert an
**Analysis** stage between Research and Review. Research maps to the gather phase (`phase:'gather'`),
Analysis to the analyze phase (`phase:'analyze'`). Update the stepper to show five, and every
status→stage and "Restart from here"/"Continue to …" control.

### G2 — Research stage = gather only (dynamic download + the source-comparison manifest)
The Research stage shows documents as they download (the in-progress list from Phase E, mounting the
shared viewer) plus the A6 source-comparison manifest. NO analysis controls here — gather only. The
"Start" control launches a gather run.

### G3 — Analysis stage = run + watch the analysis, per document
A dedicated Analysis stage: launch + monitor the analysis via the WORKER read endpoint (the app
analyze route freezes on long jobs — `project_analysis_runs_on_worker_not_vercel`), show per-document
OCR/extract progress + running cost, the fixed $/page quote, and per-file "Analyze this". Any document
opens in the shared viewer here too.

### G4 — Review stage = full review of the results
Review shows the finished data points, discrepancies, and each document's analysis/summary, with the
shared viewer — the "full reviewing of the data and the results of the detailed analysis" the owner
described. (Largely the existing Review, now fed by a completed Analysis stage rather than a combined
one.)

### G5 — Shared `SourceDocumentViewer` mounted in Research, Analysis, AND Review
One component, three stages. Phase E mounts it in Research; extend to Analysis; Review already has it.
Multi-page click-through + zoom identical in all three. Do not clone the viewer — reuse it.

### G6 — Every DATA POINT links to its source URL/page
Read the data-point model (`ResearchDataPoint`/equivalent in `types/research.ts`) and where a data
point records the document/source it was extracted from. Add a button on each data point that opens a
new tab to that source URL/page (the document's `source_url`, or the data point's own citation). Show
it wherever data points render (Analysis + Review).

### G7 — Wire + tests + browser QA
Assert the stepper renders five stages in order, the run status maps to the right stage, the shared
viewer mounts in Research/Analysis/Review, and a data point's source button opens the recorded URL.
Browser-QA the five-stage flow (this repo's #1 defect is authored-but-not-wired UI).

---

## PHASE H — Supplemental property inputs + relevance semantics (owner 2026-09-05)

The property-info input modal gains fields for INSTRUMENT NUMBERS, KEY NAMES, VOLUME/PAGE, and PLAT
CABINET/SLIDE via a "+ Add more info" progressive-disclosure control (add several of each). The MAIN
search keys are the **property ID and the address**; everything else is SUPPLEMENTAL — used to search
and to raise confidence but "taken with a grain of salt": the more the user enters, the more chance some
of it won't line up, so a document is NEVER rejected for lacking supplemental info. A document that
matches the correct property ID and/or address is relevant and viable; a supplemental match is a bonus,
a supplemental mismatch is not a veto.

### H1 — Property-search input model + relevance (pure, worker-side)
A `PropertySearchInputs` type (main: propertyId, address, county; supplemental: instrumentNumbers[],
ownerNames[], volumePages[], cabinetSlides[], subdivision, lot, block) and a pure `documentRelevance(doc,
inputs)` returning relevant iff the doc matches a MAIN key (property id / address) OR an exact
supplemental identifier (instrument / vol-page / cabinet-slide); supplemental fields only add confidence
and never reject. Feeds the discovery target (A1) + the A7 relevance filter.

> **SHIPPED 2026-09-05.** `worker/src/research/property-search-inputs.ts` — `PropertySearchInputs` +
> `documentRelevance(doc, inputs)`: property id / tolerant address (St≡Street, ignores city/zip) are the
> MAIN keys; instrument / volume-page / cabinet-slide (suffix-tolerant, e.g. `166-APR`) are exact
> supplemental identifiers that make a doc relevant on their own; name / subdivision / lot only ADD
> confidence; a supplemental MISMATCH never vetoes an id/address match. Tests:
> `property-search-inputs.test.ts` (8); guard + tsc green. H3/A7 import it.

### H2 — Input modal fields via a "+ Add more info" CATEGORY PICKER (owner 2026-09-05)
Each "+ Add more info" click first asks the user to CHOOSE A CATEGORY (key name · volume/page ·
instrument number · plat cabinet/slide); picking one appends a matching info LINE with the right fields —
a name field, or a `volume "/" page` pair, or an instrument field, or a `cabinet + slide` pair. The user
can add as many lines as they want, remove any line, and mix categories. Add this to the New-Research-
Project modal (`app/admin/research/_tabs/ProjectsTab.tsx`) and the re-run dialog (`RerunDialog.tsx`).
RENDER it (this repo's #1 defect is authored-but-not-wired UI). Persist onto the project + thread into
the run input.

> **SHIPPED (create modal) 2026-09-05.** `app/admin/research/components/SupplementalInfoFields.tsx` —
> the "+ Add more info" category picker: click → choose category (Key name · Volume/Page · Instrument
> number · Plat cabinet/slide) → appends a line with the right field(s) (`volume "/" page`,
> `cabinet "/" slide`); add/remove any number of lines, mixed categories. Pure `linesToSupplemental`
> folds them into `{instrumentNumbers, ownerNames, volumePages, cabinetSlides}`. Wired into
> `ProjectsTab.tsx` (state + render before Spending + into the create POST + reset). The create API
> (`app/api/admin/research/route.ts`) persists it under `analysis_metadata.supplemental` (only when
> non-empty). Tests: `supplemental-info-fields.test.ts` (3); app tsc clean. **Remaining:** the same
> control in `RerunDialog.tsx`, and H3-thread (pipeline route → worker run input → DiscoveryTarget/A7).

### H3 — Thread supplemental inputs through the run → the engine
Carry the supplemental identifiers into `BellResearchInput` / run settings → the cross-source
`DiscoveryTarget` (A1) so every source is searched by them, and into A7's relevance filter so a document
matching ID/address is kept even when it lacks the supplemental fields.

---

## PHASE F — Verification, deploy, supervised paid run

### F1 — Green + build
Worker suite + app research/viewer suites green; `tsc` clean; `npm run build` clean before any merge.

### F2 — Browser QA
Drive the browser: the in-progress viewer (open/zoom/page/source link), the parcel-lines-with-bearings
image, the surrounding-parcel captures, the deep-zoom Google/ArcGIS images. (This repo's most common
defect is "authored but not wired" — QA the rendered UI, not just the tests.)

### F3 — Supervised paid run (owner-gated)
After the owner approves merge + worker redeploy (with `activePipelines=0`), a supervised paid run on
2417 Stoneham (or another Bell property): confirm TexasFile buys the most-recent plat + deed EARLY,
within the $15 budget, before any free scrape; confirm the ledger shows `document_purchase` events;
confirm the rich captures + shared viewer render. Then the $10 analysis (plats/drawings first, then
deeds, chain of title) on the gathered set.

---

## Deferred / out of scope (say the word to pull in)
- Raising the 60-min hard cap (capped at 60 by design; Phase A makes it moot for the purchase).
- Making the ABORT path buy (Phase A's early buy removes the need; revisit only if a use case needs a
  late-run purchase).
- Survey-grade State Plane reprojection for bearings if the `cos(lat)` correction proves insufficient.
