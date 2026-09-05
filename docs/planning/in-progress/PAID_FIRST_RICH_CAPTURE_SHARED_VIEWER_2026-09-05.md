# Paid TexasFile-first · rich parcel capture · shared in-progress viewer — 2026-09-05

**Started** 2026-09-05 · **Branch** `claude/paid-first-rich-capture-viewer-2026-09-05`

Driven by the stop-hook slice loop. Ship the smallest meaningful slice, `tsc` + lint + test, commit,
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
  completion handler. The abort catch (`worker/src/index.ts` ~2809) runs no purchase. So a paid run's
  purchase must move to the FRONT of the run, not the end. This is exactly the owner's requirement #1.

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

## PHASE A — Paid = TexasFile-FIRST (fixes the blocker + owner #1)

Goal: a paid run buys the most-recent PLAT then most-recent DEED from TexasFile FIRST — right after
Phase 1 identifies the owner/subdivision, BEFORE the free clerk/plat scrape — then buys further docs
in priority order until the TexasFile budget is spent, then falls back to free sources for the rest.
Because the buy is early, it fires long before any stall/60-min cap.

### A1 — An early TexasFile-first acquisition step in the Bell orchestrator
Read `worker/src/counties/bell/orchestrator.ts` (Phase 1 identify → Phase 2 scrape) and how
`orchestrateBellResearch` receives run settings. After Phase 1 has the owner/subdivision/lot but
BEFORE the Phase-2 free clerk/plat scrape, when the run is paid (`mayRunBuyDocuments`) and
`gatherSelections` is set, run the checklist purchase: build recs via `wantsToPurchaseRecommendations`
(plats first, then most-recent deed) keyed on the DISCOVERED owner, and call the orchestrator within
the TexasFile ceiling. Emit progress + file each purchased doc to Review immediately.

### A2 — Buy in priority order until the TexasFile budget is spent
After the most-recent plat + most-recent deed, if TexasFile budget remains, continue buying further
priority docs (deed chain) until `remainingTexasfileAllowance` is exhausted. Respect the existing
per-buy budget gate (`mayBuyFromTexasFile`) so real wallet spend never exceeds the ceiling.

### A3 — Free sources cover ONLY the remainder, after the paid pass
Read `worker/src/research/research-modes.ts` and the Phase-2 free scrape. For a paid run, the free
clerk/plat/portal scrape must run AFTER the TexasFile pass and skip anything already bought (the
cross-run library + `heldDocuments` dedup). A free-only run is unchanged (free is the whole run).

### A4 — Retire the post-run completion-handler purchase for county-specific runs
Once A1-A3 buy early, the county-specific completion-handler purchase (added in `ed1049322`) is
redundant for paid runs and must not double-buy. Keep it only as a fallback for the generic pipeline,
or gate it so it does not re-run when the early pass already executed. Update
`purchase-gate.test.ts`'s spend-site count if the site moves.

### A5 — Source-plan default + labels for paid runs
Update the run-settings "Source plan" so a paid run defaults to "TexasFile first, then free". Reflect
in `worker/src/research/run-settings.ts` and the run-start / re-run dialog copy
(`app/admin/research/components/RerunDialog.tsx`). "Free first, then escalate" stays available.

### A6 — Wiring test (assert the CALLER)
A test that the Bell orchestrator itself invokes the TexasFile-first purchase before the free scrape
for a paid run — assert something in `orchestrator.ts` calls the purchase, not that the purchase file
imports its helpers.

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

## PHASE D — Google Map deep zooms 25 & 30 (owner #4)

### D1 — Add the requested Google zooms (with honest clamping)
Read `worker/src/research/capture-plan.ts` `ZOOM_BANDS` / `MAX_ZOOM` and
`worker/src/counties/bell/scrapers/map-screenshot-capture.ts` (`GOOGLE_MAPS_ZOOM=20`, place `19`).
Add capture requests at the owner's zoom 25 and 30 in addition to the existing levels. Since Google
clamps ~21, capture at Google's deepest real level and label the requested-vs-actual zoom honestly.

### D2 — Deep parcel-layer (ArcGIS) zoom where 25/30 are meaningful
Where a deeper-than-Google view is wanted, add ArcGIS/parcel-layer captures at the deep levels (the
parcel-line render is vector, so it stays crisp) so "zoom 25/30" yields a genuinely deeper image, not
a clamped duplicate.

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
