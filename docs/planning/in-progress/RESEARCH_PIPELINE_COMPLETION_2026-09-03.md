# Research pipeline completion — 2026-09-03

Everything the owner asked for on 2026-09-03, measured against what the code actually does, and
sliced so each piece ships on its own.

**The finding that shapes this whole plan:** most of it is already written. Ninety-four modules in
this repository have zero importers — 60 app-side, 34 in the worker — and a dozen of them implement
exactly what is being asked for. The dominant work here is connection, not construction. Every
slice below therefore starts by reading what exists before writing anything.

---

## The owner's requests, in their words

> "the order should be, drawings/plats, then the overhead views, then the rest of the documents"

> "Whenever we have the payment option turned on for kofile and texasfile or anything else, I want
> the pipeline to start there and look for documents about the property, espeically the
> drawings/cad maps/plats etc. Something visual to go off of and as recent as is available."

> "It should look for those documents on the regular adapters and county portals and stuff as much
> as possible, and if it cannot find what it is looking for, then it should use texasfile and
> kofile for those too."

> "as the run progresses it should capture all logs to the pipeline log viewer and they should be
> saved and persist with the research run"

> "the analysis should run on each document to get a comprehensive idea of each one"

> "the AI should review all results and determine which documents provide the most useful info and
> should create a full and in depth summary of the property using document link references"

> "It should try and see if any of the documents are incorrect or not actually related to the
> property in question."

> "It should also extract information about the surrounding properties. What are the property id
> numbers and addresses for the adjoiner properties? What is the information about the subdivision
> or the plat or the lot or the tact of land."

> "We need to be able to immediately retreive the worker and frontend logs. Really, both logs
> should be displayed in the pipeline log viewer."

> "the AI analysis system that we have built seems to think that the documents are unreadable. We
> need it so that with ocr and whatever other image/document analysis tools we can extract as much
> info as possible from each document."

> "it is saying it stoped because it reached its time limit, and it is also saying it stopped
> because I cancelled it. I did not cancel it. Also, the timer/run seems like it went waaay over
> the time limit"

---

## 1. What the 2026-09-03 run proves

Project `ce843899-010e-4fec-9211-d22a339fff35`, 11780 FM 2484, run 03:58–06:41Z. Measured against
the live database and the recovered 1,529-line worker log.

### 1.1 One transient outage cascaded into everything

`esearch.bellcad.org` was unreachable for the whole run. It answers in 150 ms today — three probes,
HTTP 200. During the run:

```
Session acquisition failed: fetch failed
Failed to acquire Bell CAD session — falling through to Layer 3
Skipping CAD HTTP / CAD Playwright / OwnerName / StreetNumber-only / StreetName-only
GET-keyword-search → CAD-HTTP (26001ms) fail — Failed to acquire session token
```

`dead-host.ts` did its job — it noticed and stopped re-trying. Nothing above it decided that a run
without its primary source was not worth continuing for another two and a half hours.

### 1.2 The imagery stage was SKIPPED, not attempted

With no CAD record there were no coordinates, and the geocoders could not supply them either:

```
geocode → Nominatim (192ms) fail — No results
geocode → Census (553ms) fail — No matches
✗ Geocoder returned no result — FEMA/TxDOT spatial queries will be skipped
[1377s] Direct map screenshots skipped — no property ID or coordinates
```

Verified independently: Nominatim genuinely returns `[]` for that address. **Google Geocoding
resolves it instantly** — `11780 FM2484, Salado, TX 76571` at `30.9971703, -97.626234` — and
`GOOGLE_MAPS_SERVER_KEY` already works for Geocoding and Static Maps. It is simply not in the chain.

Note also: the address was wrong. Google places it in **Salado 76571**, not Belton 76513.

### 1.3 163 minutes, $29.19, no ceiling ever consulted

```
limits       {"maxCostUsd":2,"maxPaidPages":20,"maxWallClockMs":1500000}
cost_usd     29.190966          paid_pages 0        ← model spend, not documents
started 03:58:07Z  finished 06:41:23Z              ← 163 min against a 25-min limit
```

`checkBudget` is called twice in the entire worker, both in `index.ts`, both OUTSIDE the county
pipelines. The Bell path never checks it — zero hits across `src/counties/`. And `mayRun()`, whose
own doc comment reads *"callers ask `mayRun(...)` before starting expensive work"*, **has no
callers at all**.

With its primary source dead, the run made **224 requests** to `bell.tx.publicsearch.us`, including
one owner search that took **697,641 ms — 11.6 minutes**.

### 1.4 Four contradictory explanations, none of them the true one

| Surface | Says | True? |
|---|---|---|
| Headline | "Finished early at the ceiling you set" | vaguely |
| Subtitle | "reached its 25-minute time limit" | no — 163 min |
| Progress bar | "reached its 149-minute time limit" | no such limit exists |
| Activity | "Pipeline cancelled by user" | no — the owner did not |
| `stop_reason` | `budget_reached` | **yes — and it is the one not shown** |

Plus: `status "complete"` with `phase "Failed"`; elapsed shown as `8:14:36 / 25:00`; "Documents:
none retrieved" beside "Documents & Sources 19"; "Duration 0.0s"; document count 19 in one place
and 16 in another.

### 1.5 "Unreadable" means the AI step did not run

`worker/src/index.ts:654`:

```js
const deedText = deed.aiSummary ?? deed.legalDescription ?? null;
```

A document's `extracted_text` is the **AI summary**, not text read off the page. No OCR runs on the
stored page images anywhere in this path. When the AI stage is skipped — and the log says
*"No master report text — Stage 5/6 may have been skipped or failed"* — that is null, and
`assessArtifact(null, …)` stamps the document unreadable with reason *"No text was extracted from
this document at all."*

All 16 deeds: `extracted_text` NULL, `extracted_text_method` NULL. The page images are stored
correctly at 2550×3300 and nothing ever reads them.

### 1.5b There are TWO analysis systems, and Bell uses the weaker one

This is the structural finding behind "the documents are unreadable" and behind "we had it built
before".

**System 1 — the shared stack**, wired to `index.ts` and the generic pipeline:

| Module | Importers |
|---|---|
| `services/adaptive-vision.ts` | 4 — `index.ts`, `ai-extraction`, `ai-plat-analyzer`, `subdivision-lot-isolator` |
| `services/ai-extraction.ts` | 3 |
| `services/ai-document-analyzer.ts` | 1 |
| `services/ai-deed-analyzer.ts` / `ai-plat-analyzer.ts` | 2 each |

`adaptive-vision.ts` is the six-phase **quadrant OCR** the owner remembers building:

1. image analysis — dimensions, DPI estimation, sheet-size matching
2. grid selection — the smallest of 2×2 / 2×4 / 4×4 / 4×8 where fine text stays ≥ 13px
3. crop — `sharp.extract()` with 5% overlap between segments
4. **a Claude Vision call per segment**
5. confidence scoring per segment
6. **escalation** — any segment scoring under 60 is re-split 2×2 with 8% overlap

**System 2 — the Bell stack**: `counties/bell/analyzers/deed-analyzer.ts`, which calls
`analyzeDeedException` and sends **whole page images** to Claude. It reaches NONE of the modules
above — grepped across `src/counties/bell/`, zero hits for any of them.

So Bell — the best-supported county, and the one the owner actually runs — gets whole-page vision
with no tiling, no enlargement, no per-quadrant confidence and no escalation. The quadrant system
runs only on the generic path.

And on the 2026-09-03 run it produced nothing at all, because `analyzeDeedException` returns an
empty summary when it has no images or no key, and — the actual cause here — the run spent 163
minutes in Phase 2 and **never reached the analysis phase**. Empty `aiSummary` → null
`extracted_text` → "Unreadable" on all 16 deeds.

### 1.6 The current order is the inverse of what was asked

`worker/src/counties/bell/orchestrator.ts`:

| Line | Step |
|---|---|
| 281 | Appraisal district + GIS, in parallel |
| 526 | **Clerk deed search** |
| 609 | **Plats** |
| 690 | Deed documents |
| 812 | **Screenshots and imagery — last** |

### 1.7 What IS working, and must not regress

- **Multi-page capture and viewing.** 101 documents carry a real page list and `page_count` matches
  the stored URL count in all 101. A 10-page deed was driven in a browser: all ten pages navigable,
  zoom, fit, actual size, rotate, pan, full screen, markup, keyboard shortcuts.
- **The clerk path.** 16 deeds across 46 pages, correctly multi-page.
- **The dead-host gate**, the stage sequence through Phase 3, cost accounting (144 events summed
  correctly), and the run-readiness gate built 2026-09-03.

---

## 2. Slices

Ship in this order. Each is independently mergeable and each ends with typecheck + both suites +
`npm run build`.

### Phase A — the ceilings hold

Nothing else is safe to build until a run cannot spend fifteen times its cap.

- [x] **A1. Give `mayRun()` its callers.** — shipped 2026-09-03, commit `c662512fe`.
      `research/budget-gate.ts` gives county code one import and one call (`mayStart`), because
      `mayRun(projectId, step, spendSoFar)` needed two imports and knowledge that `spendForRun` was
      the right source — friction that was the whole difference between a guard that exists and one
      that runs. Wired at the clerk deed search and the plat search in the Bell orchestrator (the
      steps that consumed 163 minutes) and at all three clerk owner searches in the generic pipeline.
      A skipped step reports itself through `progress`. Guarding the BLOCK rather than the
      assignment — the compiler pointed out that everything after the clerk call reads `clerk.*`.
      Mutation-tested: removing the guard fails the caller test, restoring it passes.
      **Also fixed here**, same file and same defect class: `reasonText` reported ELAPSED time as
      though it were the limit, which is where "its 149-minute time limit" came from. `BudgetStatus`
      now carries `limitMs` / `limitUsd` / `limitPaidPages` and every message names the ceiling AND
      the figure that crossed it. That closes the fabricated-number half of A5.
- [x] **A2. Bound a STEP, not just the gaps between steps.** — shipped 2026-09-03.
      **The premise as written was false and checking it saved building the wrong thing:**
      `checkBudget` already tests wall-clock first (`run-budget.ts:169`), and A1's gate therefore
      already enforces the clock between steps. The real gap is that a step is unbounded — one clerk
      owner search took 697,641 ms (11.6 minutes). Its inner operations are all bounded (page loads
      60s, image fetches 30s, visibility probes 1s); the loop over owner-name variants exits only on
      a document count. Two such steps exhaust a 25-minute run on their own, and the gate before the
      third one is then correct and far too late.
      `withStepDeadline` bounds a step by the run's OWN remaining time rather than a fixed number —
      four minutes left means no step gets more than four, which makes the wall-clock limit mean what
      it says without picking a per-step figure that would be wrong for some other county. Wrapped
      around the Bell clerk and plat searches. It does NOT claim to cancel the underlying work: a
      Playwright navigation in flight keeps going until its own timeout: the run stops WAITING, which
      is what bounds the run, and the comment says so rather than implying a cancellation that never
      happens. The compiler caught the consequence twice — the fallback makes `clerk`/`plats` genuinely
      null, and both paths are now reported rather than assumed away.
- [ ] **A3. A dead primary source ends the run early.** When `dead-host.ts` has marked the county
      CAD unreachable AND no coordinates could be resolved, stop with a status that says so rather
      than falling through to hours of owner-name grinding. "Bell CAD is down, try again later" at
      minute five is the honest outcome.
- [ ] **A4. Rate-limit the clerk portal.** 224 requests to one host in one run, one search taking
      11.6 minutes. `worker/src/lib/rate-limiter.ts` (291 lines) exists with zero importers — read
      it first and wire it if it fits; write nothing new if it does.
- [ ] **A5. One true completion message.** Four surfaces gave four different reasons and none
      matched `stop_reason`. One function derives the sentence from `stop_reason` + `limits` +
      actual duration, and every surface uses it. Fix alongside: `status "complete"` with
      `phase "Failed"`, the `8:14:36 / 25:00` elapsed, "Duration 0.0s", "none retrieved" beside 19
      documents, and 19-vs-16 counts.

### Phase B — the run can find the property

- [ ] **B1. Google Geocoding as the third provider.** Nominatim and Census both miss rural Texas
      FM roads; Google resolves them instantly and `GOOGLE_MAPS_SERVER_KEY` already works. Add it
      after the two free providers (free first is deliberate — Google costs per call). This one
      change un-gates coordinates, which un-gates the entire imagery stage.
- [ ] **B2. Coordinates from the parcel, not only the address.** When a Property ID is known, the
      county ArcGIS parcel geometry gives a centroid directly. `resolveParcelDetails` already talks
      to Bell's FeatureServer. A parcel we can name is a parcel we can locate.
- [ ] **B3. Warn when city and ZIP disagree.** The run's address said Belton 76513; the parcel is in
      Salado 76571. `assessRunReadiness` rates street + city as strong — a WRONG city is worse than
      none. Check the ZIP against the county's known ZIP list (`BELL_COUNTY_ZIPS` already exists in
      the pipeline route) and say so at intake.
- [ ] **B4. A second door into Bell CAD.** `worker/src/sources/bell-cad-data-portal.ts` (391 lines,
      zero importers) is an alternative data source for the site that was down. Read it, verify it
      still resolves, wire it as a fallback — or delete it and say why.

### Phase C — the order the owner asked for

- [ ] **C1. Decide the fate of the prioritiser.** `lib/research/prioritized-pipeline.ts` (379) and
      `prioritized-pipeline.service.ts` (387) are near-duplicates with zero callers, and all six of
      their dependencies are live and used elsewhere. Determine which is real, merge or delete the
      other, and record the decision. This is the long-open owner call in `project_orphan_guard`.
- [ ] **C2. Re-tier the priority table to the requested order.** It currently scores plat 90,
      survey 88, deed 85, gis_map 75, aerial 70, tax 55, easement 50 — plats already above deeds,
      imagery already above secondary records. The requested order needs the imagery tier lifted
      ABOVE deeds: drawings/plats → overhead → everything else.
- [ ] **C3. Give it a caller.** Sequence the Bell orchestrator and the generic pipeline by the
      table instead of by source order. The wiring test must assert the CALLER — that the
      orchestrator imports and invokes the prioritiser — not that the prioritiser imports its
      helpers.
- [ ] **C4. Paid sources lead for plats when purchasing is on.** When `allow_paid_documents` is
      true, the plat/drawing stage tries TexasFile and Kofile FIRST, because a bought plat is the
      visual the run is built around. Newest available first.
- [ ] **C5. Free adapters lead for everything else.** Deeds, affidavits and easements try the county
      portal and free adapters first; paid vendors are the fallback when those return nothing. This
      is the inverse of C4 and deliberately so.

### Phase D — every page analysed whole AND in quadrants

The owner's requirement, in their words:

> "Each page should be saved as a whole page, but each page should also be split up into quadrants
> and then enlarged and reviewed/analyzed individually."

That system exists — `services/adaptive-vision.ts`, six phases, `sharp.extract()` crops with
overlap, a Vision call per segment, and re-splitting of any segment scoring under 60. Bell does not
use it (§1.5b). The work is to make one analysis path serve every county, not to build a second one.

- [ ] **D1. One analysis path, not two.** Route the Bell deed and plat analyzers through
      `adaptive-vision` instead of their own whole-page Vision call. The Bell analyzer already
      collects `pageImages`; it hands them to a whole-page prompt. Read
      `counties/bell/analyzers/deed-analyzer.ts` and `services/adaptive-vision.ts` together before
      changing either — the goal is that Bell gains quadrant analysis, not that anything already
      working loses its behaviour.

      **Scoped 2026-09-03 — this is smaller than it sounds, and the architecture is already right.**
      The owner asked to "make sure that all of the adapters such as Bell and the other counties are
      configured to integrate all of the tools, such as the OCR analyzer". Measured: all **35**
      adapters — Kofile, TexasFile, Tyler, Fidlar, eDocTec, USLandRecords, Aumentum, iDocket and the
      rest — import ZERO analysis modules. That is correct and should stay that way: an adapter
      fetches pages, an analyser analyses them, and putting OCR inside 35 adapters would give 35
      copies of it to keep in step.

      The real divergence is narrower. `src/counties/` contains exactly **one** directory — `bell/`.
      Every other county runs the generic pipeline, which DOES reach `ai-extraction` →
      `adaptive-vision`. So there is one orchestrator that grew its own analysis layer, not a fleet
      of adapters to retrofit. Unify that one and every county is served by the same tools.
- [ ] **D2. Every page, whole and quartered.** The whole page stays exactly as it is stored today —
      that half already works and must not regress. Each page additionally goes through grid
      selection, cropping and per-segment analysis, and the per-segment findings are stored against
      the page so a reader can see which quadrant a fact came from. `ocr_segments` already exists as
      a column on `research_documents`.
- [ ] **D3. Escalation is the point, so verify it fires.** A segment scoring under 60 is re-split
      2×2 at 8% overlap. That is the "zoom in and get an even better understanding" the owner
      described. Assert it on a real low-confidence scan, not only in principle.
- [ ] **D4. `extracted_text` stops meaning "the AI summary".** Today it is
      `deed.aiSummary ?? deed.legalDescription ?? null` (`index.ts:654`), so a skipped analysis
      reads as an unreadable document. Store the extracted TEXT, with `extracted_text_method` set,
      and keep the summary in its own field.
- [ ] **D5. Wire `ocr-legibility.ts`.** 404 lines, zero importers, and it exists to rate whether a
      scan CAN be read — separately from what it says. After D4, "Unreadable" must mean the paper.
      Follow `project_receipt_confidence_and_editing`: faded ink gives a confident WRONG answer, so
      legibility is rated on its own.
- [ ] **D6. Analysis per document, not per run.** "A comprehensive idea of each one" means every
      filed document goes through it, not just the ones a stage happened to touch.
- [ ] **D7. Backfill the 16 deeds from the FM 2484 run.** Real documents, 46 real pages, no text.
      Once D1–D4 work they are the proof, and they cost nothing to re-analyse — the pages are
      already bought and stored.

### Phase E — the AI reads the whole picture

- [ ] **E1. Rank documents by usefulness.** The prioritiser's cross-validation loop already scores
      each resource's contribution. Surface that ranking.
- [ ] **E2. A property summary with document references.** Every claim links to the document it came
      from. The run currently produces no master report at all.
- [ ] **E3. Flag documents that do not belong.** `multi-source-confidence.ts` (322 lines, zero
      importers) scores agreement across sources — read it before writing anything. A document whose
      legal description does not match the subject parcel is the case to catch.
- [ ] **E4. Adjoiner property IDs and addresses.** `infra/adjoiner-persistence.ts` is live and
      already writes `parcel_id` and `owner_name`. `lib/research/spatial-filter.ts` (253 lines, zero
      importers) is the geometric way to find them. County ArcGIS returns neighbours for a parcel
      centroid directly.
- [ ] **E5. Subdivision, plat, lot and tract.** The run detected the gap itself — *"appears to be a
      subdivision property but no lot number was resolved"*. Lot correlation exists in
      `counties/bell/analyzers/lot-correlator.ts`; `golden-plat.ts` (318) and
      `plat-drawing-generator.ts` (402) do not run.
- [ ] **E6. Text segmentation for multi-parcel documents.**
      `lib/research/document-segmentation.ts` (288 lines, zero importers) splits a large document's
      TEXT into candidate parcel segments and scores each for relevance to the subject — a
      100-lot subdivision plat or a multi-tract deed otherwise bleeds unrelated parcels into the
      boundary. Distinct from D2, which splits the IMAGE; both are wanted, on different axes. Its
      dependency `adjoiner-extraction` also feeds E4.

### Phase F — logs you can actually read

- [ ] **F1. Land the merged log writer.** Written and green on 2026-09-03, not yet committed: one
      function merges every source, de-duplicates, orders by time and reads-before-writing so a thin
      write can never shrink a full one. Two writers were racing; one wrote the crash line and
      discarded 1,529 lines into a memory map.
- [ ] **F2. Land the view-side merge.** The panel picked one source whole, so any re-render — the
      copy button's `setAllCopied` included — swapped a live log for the single persisted entry.
      Also written and green: merge instead of swap, and one Copy All Logs button instead of three.
- [ ] **F3. Persist DURING the run, not only at the end.** Both writers fire at completion. A run
      that is killed loses everything, which is exactly what happened. Flush periodically so a
      crashed run still has its diary.
- [ ] **F4. Frontend logs in the same viewer.** The owner asked for both. `usePageError` already
      collects client-side errors; the viewer shows worker entries only.
- [ ] **F5. Live streaming.** `worker/src/websocket/progress-server.ts` (379 lines, zero importers)
      exists for this. Read it, wire it or delete it — "immediately retrievable" is the requirement.

---

## 3. Things this work must not do

- **Do not re-baseline a guard to make it pass.** Both 2026-08-12 ratchet breaches were real bugs.
  If a guard fires, read it first.
- **Do not delete an orphan without reading it.** Several of these modules encode real domain
  knowledge. Wire, merge, or delete with a stated reason — never delete to make a count go down.
- **Do not break multi-page capture or the viewer.** They work today, verified in a browser. They
  are the one part of this the owner has confirmed is right.
- **Do not spend money to test.** Bell is a free county. A paid run against TexasFile is owner-gated
  and stays that way.
- **Do not report a guess as a fact.** Three separate defects on 2026-09-03 were an absence rendered
  as a specific finding: the auto-updater blaming a rewritten history for an expired credential, the
  schema audit naming a table that never existed, and seed 213 announcing data loss that could not
  happen. Say what is known and what is not.

---

## 4. Verification

Every slice ends with all of these green:

```bash
npx tsc --noEmit                      # app
cd worker && npx tsc --noEmit         # worker
npx vitest run                        # both suites
npm run build                         # the production build, which tsc does not stand in for
npm run verify:orphans                # the count must go DOWN, never up
```

And for anything with a screen: **drive it in a browser before calling it done.** Three real bugs on
2026-09-03 were invisible to 1,837 green test files — a grid overflow, a `??` that could never fall
back, and a street field that reproduced the exact defect it was built to prevent.

Unregister the admin PWA service worker first (`starr-admin-v1-static`); it serves stale chunks and
survives a dev-server restart.

---

## 5. Owner-gated

Not blocked, but they need a decision rather than code:

- **The prioritiser duplicate (C1).** Two near-identical files. If neither is wanted, say so and
  both get deleted.
- **A paid run against a real property.** `research_document_purchases` still has zero completed
  rows. The purchase path has never been proven end to end because a free Bell run cannot prove it.
- **Google Places.** The autocomplete stays a convenience until Places is added to the browser key's
  API restriction list. The form works fully without it.
