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
- [x] **A3. A run without its primary source says so — and stops only when it must.** — shipped
      2026-09-03. **Written as "a dead primary source ends the run early", and that turned out to be
      too blunt.** Checked against the actual run: the FM 2484 project carried `parcel_id: 42156`. A
      parcel ID identifies one parcel exactly. Aborting on the outage would have discarded 16 real
      deeds over a failure that never stopped the run knowing which property it was about.
      `research/run-degradation.ts` grades by what is still KNOWN rather than by what failed:
      `ok` (the record answered) · `degraded` (it did not, but a Property ID or coordinates still
      name the parcel — continue, and mark every finding unconfirmed against the appraisal record,
      because that is exactly what it is) · `cannot_attribute` (nothing names the parcel — stop,
      because a document found by owner name would be attached to a property nobody can name, and an
      empty result is more honest than a populated wrong one). It also keeps "the district could not
      be reached" distinct from "the district returned no record" — a finding about us versus a
      finding about the property, which is the conflation this codebase keeps unpicking. Assessed
      once Phase 1 resolves, reported through `progress` either way.
- [x] **A4. The rate was never the problem — and four constants said otherwise.** — shipped
      2026-09-03. **Third premise in a row that did not survive checking.** 224 requests over 163
      minutes is one every **43.7 seconds**, which is extremely polite. `infra/politeness.ts`
      already serialises per host and spaces with jitter, and the Bell clerk path reaches it
      transitively: `fetchInstrumentDocument` (clerk-scraper.ts:341) delegates to
      `searchByInstrument` (bell-clerk.ts:3219) and `fetchDocumentImages` (:2747), and both wrap
      their navigation in `withPoliteness`. Wiring `rate-limiter.ts` would have added a THIRD
      mechanism over a path already covered. The run's problem was VOLUME, not rate, and A2 bounds
      that.
      What the check did find: **four of Bell's six rate constants had zero uses** —
      `clerkImageDownload: 6000`, `clerkMaxConcurrent: 3`, `henschenRpm: 15`, `aiCallDelay: 200`.
      They read as settled policy ("we wait six seconds between clerk image downloads") and nothing
      waited. A constant stating a rule the code does not follow answers "are we being polite to
      this host?" with a confident yes. Removed, with the two that ARE applied documenting where.
      **`rate-limiter.ts` itself is left to the C1 dead-code pass** — the ultracode audit launched
      2026-09-03 is judging it against `politeness.ts` and `withRetry` right now, and deleting it
      mid-audit would race that verdict. Evidence gathered here: it duplicates spacing/concurrency
      (politeness) and backoff (`withRetry`, 4 users), and its unique exports — `isCaptchaError`,
      `isSessionExpiredError`, `SessionHeartbeat` — have zero users each.
- [x] **A5a. An abort says who aborted it.** — shipped 2026-09-03. The owner's dispute — *"it is
      saying it stopped because it reached its time limit, and it is also saying it stopped because
      I cancelled it. I did not cancel it"* — was correct. `index.ts:1341` aborts the run when the
      BUDGET is exhausted, and `orchestrator.ts:108` threw
      `DOMException('Pipeline cancelled by user')` for any abort, because `signal.aborted` is a
      boolean and a boolean cannot say who set it.
      **The instructive part: this had already been fixed once, for half the surfaces.** Both abort
      sites already set `stopReason` on the `activePipelines` entry, with comments describing this
      exact defect — which fixed the STATUS endpoint. It did not fix the thrown exception, because
      the orchestrator cannot see that map, and the exception's message is what reaches
      `research_runs.message` and the Activity log the owner was actually reading. The fix reached
      the surface that was checked, not the one displayed.
      `research/abort-reason.ts` carries the cause ON THE SIGNAL (`abort(new BudgetAbort(...))`),
      readable anywhere the signal is. Three abort sites now name themselves; a bare `abort()` is
      guarded against. An unattributed abort says it does not know rather than blaming anyone —
      "we do not know why this stopped" looks worse and does not send anyone to argue with the
      operator. The router also stops calling an expected stop a crash: `phase: 'Stopped'` rather
      than `'Failed'`, which was appearing beside `status: "complete"` on the same row.
      One existing guard re-pointed: it pinned the literal bare `abort()`, which is now the defect.
      It asserts the reason is carried.

- [x] **A5b. The clock stops, and an aborted run reports what it did.** — shipped 2026-09-03.
      **`8:14:36 / 25:00`** — three numbers on one line, none of them true. The run started 03:58:07Z
      and finished 06:41:23Z (163 minutes); the screen was read at 12:12, and `run-state.ts:464`
      computed `now - startedMs` unconditionally. Its own comment shows the START was corrected once
      — the clock used to begin at component mount — and the END was never considered, so a finished
      run counted forever. `run-console.ts:114` had it right all along
      (`run.finished_at ? Date.parse(...) : now`): two implementations of one measurement, and only
      one stopped. Same shape as the two log writers and the two analysis systems.
      The API had been **selecting `finished_at` since that query was written and never returning
      it**, so the client could not have stopped the clock had it tried. Fixed at all three links.
      **"Duration 0.0s" and "Documents: none retrieved" beside a panel reading 19** came from the
      same object: the abort/crash path builds a result with `duration_ms: 0` and `documents: []`
      hardcoded, because it has no document objects to put there. `endFiling(projectId)` was already
      being called on the very next line and its return value discarded — it returns the tally that
      knows how many were filed. Real duration from the run's start; `filedDocumentCount` carries the
      count the operator can check against the Documents panel.
      **And a control of mine was wrong**: `readCode`'s guard asserted every file contains `import`,
      and fired on `run-state.ts`, which has none. A guard against false negatives producing one. It
      checks for any of several code markers and a survival fraction now.

### Phase B — the run can find the property

- [x] **B1. Google Geocoding as the third provider.** — shipped 2026-09-03.
      `research/google-geocode.ts`, wired as Layer 0C in `normalizeAddress` after Nominatim (0A) and
      Census (0B). Third and not first is deliberate: the two above are free and Google bills per
      call, so this costs nothing on the addresses that already work and rescues the ones that do
      not — which for rural Texas FM and ranch roads is the important minority.
      **Verified against the live API through the real module**, not a stub: the exact address that
      killed the 2026-09-03 run —
      `Google resolved "11780 FM 2484, Belton, TX 76513" to 11780 FM2484, Salado, TX 76571, USA at
      30.997170, -97.626234 (rooftop)` — with `county: "Bell"` already stripped of the word "County"
      so it matches our routing, and the real city and ZIP surfaced so the operator's Belton/76513
      mismatch is visible rather than inferred.
      Uses `GOOGLE_MAPS_SERVER_KEY` / `GOOGLE_MAPS_API_KEY` and never the browser key — the public
      one is referrer-restricted, a server sends no referrer, and falling back to it would turn a
      clear "not configured" into a confusing permission error while putting a billed API behind a
      key that ships in the page source. It also keeps `ZERO_RESULTS` (a finding about the address)
      distinct from `REQUEST_DENIED` (a finding about our key), which is how a misconfiguration
      would otherwise hide behind a plausible story about a rural address.
      It does NOT overwrite the parsed street parts — the operator's own fields (seed 624) beat any
      geocoder's guess, which is the whole reason they are stored separately. Google supplies the
      coordinates, and coordinates are what was missing.
- [x] **B2. Coordinates from the parcel, not only the address.** — shipped 2026-09-03.
      **The coordinates were in memory the whole time.** `lat`/`lon` are resolved by GEOCODING,
      before the GIS runs; when both geocoders failed on 2026-09-03 they stayed null and every
      aerial, satellite, GIS, FEMA and TxDOT lookup was skipped. But the GIS scraper had ALREADY
      fetched that parcel's polygon by property ID — from `utility.arcgis.com`, **a different host
      from the `esearch.bellcad.org` that was down** — and `computeCentroid` has existed in
      `analyzers/adjacent-analyzer.ts` since it was written. One function call apart, and nothing
      joined them.
      Verified against the live service for prop_id 42156: a 20-point ring whose centroid is
      `30.996905, -97.626639` — **49 metres** from Google's rooftop point on a 22.5-acre tract.
      Guarded on `!lat || !lon`, because a geocoded rooftop beats a centroid for a long thin tract:
      this is a fallback, not a replacement. Placed BEFORE `assessDegradation`, or a run rescued by
      it would still be reported as having no location — an assessment describing a state that no
      longer existed.
      A control asserts an empty boundary yields null rather than `0,0`, which is in the Gulf of
      Guinea: a fallback that invents a point off the coast of Africa is worse than no point, because
      every downstream lookup would then run and return confident nonsense.
- [x] **B3. The entered address is compared against where the parcel actually is.** — shipped
      2026-09-03. **Written as an intake-time city/ZIP check, and that would not have caught the
      case that prompted it.** The operator entered `Belton 76513`; the parcel is `Salado 76571`.
      Belton IS a Bell County city and 76513 IS a Bell County ZIP — the pair is internally
      consistent, geographically sensible, and passes every check writable against the data
      available at intake. It is simply not this property's address, and nothing typed into a form
      can be validated into correctness.
      Only a source that knows where the parcel IS can tell you, and two became available in this
      same session: Google geocoding (B1) and the parcel centroid (B2).
      `research/address-discrepancy.ts` compares entered against resolved at the Google layer. A
      differing ZIP is a **warning** (a different postal area is a materially different place); a
      differing city at the same ZIP is a **note** (rural Texas routinely carries one town's mailing
      address and another's situs). It names both readings — a typo, meaning the run is about the
      wrong property, or a naming convention, meaning nothing — and picks neither, because it cannot
      tell them apart and a system that guessed would eventually guess wrong on somebody's boundary
      survey. Silent when the operator entered no city or ZIP: they have not disagreed with anything,
      and warning them anyway trains people to ignore the real ones.
- [x] **B4. A second door into Bell CAD.** — resolved 2026-09-03 by DELETING the module, because
      the premise was false in the way that matters: **the second door already exists and was used.**
      The recovered log (`/root/run-ce843899.log` on the worker host, lines 21–132) shows the run
      started WITH `propertyId="42156"` as input; the ArcGIS parcel layer on `utility.arcgis.com`
      (`BELL_ENDPOINTS.gis.parcelLayer`, a different host from `esearch.bellcad.org`) answered
      *"Found 1 parcel(s) by property ID"* at **[1s]**, and Phase 1 finished at [78s] with owner,
      22.495 acres, the legal description and 34 sibling lots — all while esearch was dark.
      Re-proven today: the layer's `situs_num='11780' AND situs_street LIKE 'FM 2484%'` query
      returns prop 42156 (owner GOODNIGHT, deed 10/14/1988), and `gis-scraper.ts` Approach 1B
      already issues exactly that query when there is no ID. What the outage actually cost was
      the CAD detail page's deed history — and the *"skipped — no property ID or coordinates"*
      at [1377s] was the COORDINATES half (`orchestrator.ts` requires `propertyId && (lat ||
      lon)`), which B2 fixed by taking the centroid of the parcel the GIS had already returned.

      The data-portal client itself would have added nothing: its hardcoded links had moved
      (the portal now serves `2026_..._Condensed_20260821.xlsx`), its header's *"scraped from
      bellcad.org/data-portal on each request"* was false (it did a HEAD and returned the list),
      and the export it meant to buffer in memory is **239 MB**, not *"typically < 20 MB"* — a
      single-sheet XLSX of 193,243 parcels whose columns (prop_id, owner, situs, legal_desc,
      subdiv, land_acres, deed_num) the GIS layer already serves per parcel in one request.
      Deleted with its 14 test cases in `__tests__/recon/bell-county-sources.test.ts` (Module A;
      B–D stay) and its `KNOWN_UNREACHABLE` entry, with the reason left in that file's comments.
      If a bulk roll is ever wanted (e.g. for an offline county index), the portal page is the
      manifest and the XLSX needs a streaming zip reader, not a Buffer.

### Phase B* — what the eight-lens audit found, which reorders everything after it

An ultracode audit of the whole platform ran on 2026-09-03: eight independent lenses, each finding
adversarially verified by a second agent. **118 findings survived verification; 21 were refuted.**
Full overview in the task output for run `wf_fc5cdf63-490`.

It found something bigger than anything left in this plan, and it changes the order of the rest.

- [x] **B*1. Three of the four document row builders could not execute.** — shipped 2026-09-03,
      seed 626. Confirmed independently against the live database before acting on it.
      `capture-runner.ts` failed FOUR ways in a single statement: `source_type: 'pipeline_capture'`
      (23514 — the CHECK admitted only four values), `public_url` (42703 — the column is
      `storage_url`), `ocr_text` (42703 — it is `extracted_text`), `processing_status: 'stored'`
      (23514), and **13 of its 14 `document_type` values** (23514). `harvest-supabase-sync.ts` wrote
      `harvest_metadata`, which did not exist. `project-library.ts` SELECTED the same column,
      PostgREST rejected the whole query, and the error was downgraded to a `console.warn` that
      returned an **empty library** — so cross-run deduplication has been off for every run ever
      made, silently.
      The proof it had never worked: **0 of 697** rows carry `source_type = 'pipeline_capture'`, and
      **0 of 697** have `content_sha256` — and `capture-runner.ts` is its only originating writer.
      Every satellite view, oblique, street view, GIS capture and generated drawing this system has
      ever taken went to storage and was then dropped on the way to the row that would let anyone
      find it.
      **This is why the owner's first priority produces nothing.** Reordering the pipeline to do
      plats and imagery first, without this, is a run that does the right work in the right order
      and discards two thirds of it. Verified after the fix with rolled-back INSERTs: all fourteen
      capture kinds, the harvest writer, and the library read now execute.

**The audit's remaining findings, in its recommended order** — these supersede the C/D/E ordering
below where they conflict, because several are prerequisites for it:

- [x] **B*2. Patch the row after extraction.** — shipped 2026-09-03.
      **The row id was discarded at TWO layers**, which is the real reason nothing could patch:
      `resilientInsertDocument` returned `{ error }` while holding a `FileOutcome` that carried the
      id, and `fileGenericDocumentNow` returned `void`. Neither could have patched anything, because
      neither knew what it had written. Both return it now, and it rides back on the document object
      as `documentRowId` rather than threading a map through six call sites.
      `patchDocument(db, rowId, fields)` added, and wired at Stage 3 — where the OCR text and its
      method were being computed and thrown away for every county. Live evidence for the gap: 610
      rows carry text and 315 carry a method, so **295 rows of text have no recorded origin**, and
      `extracted_text_method` had **zero** worker writes before this line.
      It **refuses** `extracted_text` without `extracted_text_method`. That pairing is the point:
      the column has held raw OCR, an AI summary, a legal description and a JSON blob at different
      times, all rendered identically as "Extracted Text", with no way to tell which. A control
      asserts a patch with no text needs no method, so "always refuse" cannot satisfy the guard.
      Fire-and-forget by the same rule as filing — a document whose analysis cannot be recorded must
      not fail a run that is otherwise succeeding — but the count is logged, so a silent failure is
      still a visible one.



- [x] **B*3a. Six counties were unreachable because of a space.** — shipped 2026-09-03.
      Every config table is keyed snake_case — `fort_bend`, `tom_green`, `van_zandt`, `san_saba`,
      `palo_pinto`, `san_jacinto` — and every lookup read `TABLE[county.toLowerCase()]`.
      `"Fort Bend".toLowerCase()` is `"fort bend"`, with a space. It has never once matched. Six
      counties with fully configured appraisal districts and clerk portals returned "no config for
      this county" — a finding about our table, reported as a finding about the county. Verified with
      a control: `Bell`, a single word, matches, which proves the lookup works and the misses are
      real.
      **And one the audit did not find: `"Bell County"` misses too**, because the raw lookup never
      strips the word — and `CountyNote` in the create form suggests canonical names that operators
      reasonably type that way. `research/county-key.ts` applies `resolveCounty`'s own normalisation
      at all eight lookup sites across `bis-cad.ts`, `bell-clerk.ts` and `pipeline.ts`.
      Also fixed: `getClerkByCountyName` returned `fips: '000'` for any unregistered county. There is
      no county 000, and every consumer keying on FIPS got a value that cannot identify a place from
      a function whose job is to identify one. **My first fix introduced a bug the compiler could not
      catch** — `resolveCounty` returns five-digit FIPS and this table stores three-digit and
      compares with `===`, so the "fix" would have matched nothing. Caught by reading
      `getClerkByFIPS`'s own normalisation rather than assuming both halves agreed.
      One guard re-pointed: it pinned the literal raw lookup, which is now the defect. It asserts the
      normalised call AND that the raw one has not returned.

- [x] **B*3c. Five more sites of the same defect, and the guard that finds the sixth.** — shipped
      2026-09-03, while starting Phase C.
      B*3a fixed eight lookup sites by **listing them**. That is not a guard, and the proof arrived
      the next hour: `index.ts`'s `gisBaseUrlFor` — the function that decides whether a county's CAD
      GIS map gets photographed at all — read

      ```js
      const key = county.trim().toLowerCase().replace(/\s+county$/, '');
      const cfg = (BIS_CONFIGS as any)[key];
      ```

      It handled the *word* "County" and not the *space*, so six of the nineteen counties carrying a
      GIS viewer were told they had none. Invisible to the earlier tests because it does not spell
      `.toLowerCase()` at the index: it wrote its own normaliser two lines up.
      Four more, all found by the new guard rather than by reading: `hasKofileConfig` (the same
      defect as a `hasOwnProperty` call, missed by a sweep that searched for brackets),
      `county-plats.ts` ×2 — the **free** plat repository, whose header promises "add one entry, no
      pipeline code changes required", one two-word county away from being false — `getCountyFIPS`
      in `county-adapter.ts` and `discovery-engine.ts`, which are the *mirror image*: they collapse
      the space correctly and do not strip the word, so `"Bell County"` returns `'00000'`.
      **The guard asks the data, not the syntax.** Its first version looked for
      `TABLE[…toLowerCase()…]` and hand-rolled `replace(/\s+county$/)`, and was wrong in both
      directions at once — it flagged `SOURCE_FILE_MAP`, which maps log sources to file paths, and
      twelve files legitimately building a URL slug. A guard that noisy gets baselined and stops
      meaning anything. It now identifies county-keyed tables *by their keys being Texas counties*
      and requires every one of them to be reached through the helper, in all three syntactic forms.
      A file declaring its own table of the same name is skipped — `kofile-clerk-adapter.ts` has a
      FIPS-keyed `KOFILE_CONFIGS`, and indexing that with a FIPS is correct.
      **And one more guard pinning the defect.** `milam-coryell-coverage.test.ts` asserted that
      `gisBaseUrlFor` *contains* `toLowerCase()` and `county$/, ''` — the literal text of the broken
      normaliser — and its own loop re-implemented the same broken rule, so it could not have
      disagreed with the code. Both halves go through the helper now, with a two-word county as the
      control. That is the fifth guard in this plan found pinning the thing it was guarding against.

- [ ] **B*3b. Williamson, and CAD dispatch for the big four.** Two claims from the audit not yet
      acted on. **Williamson** — its Kofile host answers 200, but the live page advertises no real
      property or land records where Bell's advertises five mentions (control: the same fetch detects
      Bell's). Suggestive, not conclusive from a shell fetch of an SPA — and removing it is not the
      safe move it appears, because the registry entry it would fall back to is `status: 'stub'` with
      `baseUrl: null`, which is worse. Needs a live search against that portal to settle.
      **CAD dispatch** — the run uses `BIS_CONFIGS` while `CAD_REGISTRY` holds 108 counties including
      Harris, Tarrant, Dallas and Travis. Routing through `getCADConfig` is a real widening, but it
      changes which adapter runs for the largest counties in the state and deserves its own slice
      rather than being appended to a key-normalisation fix.



- [x] **B*4. `operatorNotes` and the abort signal were dropped at the last hop.** — shipped
      2026-09-03. Landed rather than deleted, because the thing being promised is worth having.

      **The notes.** `operatorNotes` had three occurrences in the entire worker: a type, and two
      places that copy it into a record of what the operator *sent*. It was never written onto
      `researchInput`, which is the only object the research code ever sees. So "the fence is not
      the line" and "seller says 2.3 acres" were typed into the create form, stored, displayed back,
      and read by nothing that could act on them — while the form said "Sent to the AI with the
      run" and this route's own comment called `operatorNotes` "the channel that already reaches the
      AI briefing". Both were written in good faith and both were false.
      It now lands in the two places on each path where an AI actually reads context: Bell's
      deed-summary prompt (`generateDeedSummary`, both call sites including the historical pass) and
      the generic pipeline's Stage 5 synthesis, which is that path's only AI pass over everything
      the run found. Both paths also print it, in full, on the run log the operator is watching —
      a hint reading "notes present" proves a field was set; it does not show a surveyor that their
      own sentence is what the model was told.
      **Framed as a claim, never as a fact.** An operator's "seller says 2.3 acres" repeated back as
      though a deed carried it is worse than not passing the notes at all: it launders a belief into
      the record. Both prompts say so explicitly, and the Stage 5 key is literally named
      `operatorContext_unverifiedClaimsToCheckNotFacts`.
      **`specialInstructions` was left alone on purpose.** The obvious shortcut was to reuse it. It
      is the same defect one layer deeper — declared on three types, passed at the Bell dispatch, and
      read only by `generateSurveyPlan`, which no run calls. Quietly repurposing it would have hidden
      a second dead channel inside the fix for the first. Its doc comment now says it is unread, and
      a test asserts that.

      **The stop button.** `runCountyResearch` has taken an `AbortSignal` since it was written and
      Bell has been handed it since it was written. The generic pipeline — every *other* routed
      county — was called without one. Pressing Cancel on a Travis County run, and the budget ceiling
      firing on a Harris County run, both had nothing to abort; the only thing the stop produced was
      a message saying it had stopped. `stopIfAborted()` now runs at all eight stage boundaries —
      between stages, never inside one, the same reasoning as Bell's `checkAborted`: stopping between
      leaves a coherent partial result, stopping inside leaves half a chain of title.
      An expected stop is rethrown rather than turned into a failed result, and the router's generic
      branch now draws the same `Stopped` vs `Failed` distinction Bell's already draws — otherwise a
      run that ended exactly where its operator told it to would report `status: 'failed'` with
      `documents: []`, which is §1.4 all over again on forty counties instead of one.

      Twelve tests, all asserting the **caller** — a field on an interface is precisely the state
      that produced this defect — with a control that finds `instrumentNumber`, a value this codebase
      already threads by the same route, so a miss means something.
- [x] **B*5a. `parseSiteId` parsed an ID format nothing produces.** — shipped 2026-09-03.
      Measured, not inferred. `buildCheckList` is the only thing in the worker that makes a site ID,
      it emits exactly three shapes, and every one resolved wrongly:

      | Emitted | Resolved to | Then looked up as |
      |---|---|---|
      | `cad-48027-bis` | county `"48027"` | `.ilike('name', '48027')` |
      | `clerk-kofile-bell` | county `"Clerk"` | a county that does not exist |
      | `clerk-texasfile` | county `"Clerk"` | a county that does not exist |

      So every probe missed its adapter and was counted "unmatched", nothing was written to
      `research_adapter_health_checks`, and the self-heal pipeline that reads that table has never
      seen a row — the exact gap `health-persistence.ts` was written to close, left open by the one
      function standing between the two halves.
      **The control is what makes this certain.** The two IDs in the function's own doc comment —
      `kofile-bell`, `bell-bis` — parse correctly, and they are the only two the test file ever
      checked. The parser worked; it worked on inputs nothing produces. A green test that invents its
      own inputs is worth exactly nothing, which is this repo's signature defect wearing a lab coat.
      A five-digit FIPS is now returned **as a FIPS** and matched against `research_counties.fips`,
      which is UNIQUE — an exact match instead of a case-insensitive comparison against free text.
      `clerk`, `county`, `gis` and `portal` joined the structural-word list. A statewide vendor
      returns `statewide: true` rather than null, so "belongs to no county" is distinguishable from
      "could not parse".
      The new test extracts every `siteId:` literal **out of `site-health-monitor.ts`** and asserts
      each one resolves, so a fourth ID shape fails here rather than emptying the table for another
      six months. Mutation-checked: removing `clerk` from the word list fails four tests, and the
      mutation aborts if the text does not change.

- [ ] **B*5b. A run that got 0 documents from a 200-OK portal is the strongest breakage signal
      there is, and it is thrown away.** Deliberately split from B*5a rather than bolted onto it:
      the sensing half was a provable defect with a measured fix, and this half is a *judgement* —
      a search returning nothing is sometimes a broken selector and sometimes a parcel with no
      recorded deeds, and a system that confuses the two will mark working counties broken. Needs a
      rule that separates them (a control search whose result is known non-empty is the obvious
      candidate) before anything writes a health row from a run.
- [x] **B*6. Repair the guards before sweeping dead code.** The orphan guard's `hasCaller` matches a
      basename inside ANY quoted string, comments included, and scans 7 of the worker's directories
      — `sources/`, `adapters/`, `counties/`, `exports/`, `ai/` and `billing/` are unscanned. The
      "Review reads what the worker writes" test concatenates every producer into one corpus, so
      `fema` — written only by Bell — "passes" for all 254 counties. `adjoiner-persistence.test.ts`
      mocks the `upsert` and asserts the option string, so it passes while the real statement fails
      42P10 and `research_adjoiners` holds **0 rows**. Do not sweep before the guard is honest.

      **Guard half shipped 2026-09-03** (the ratchet and adjoiner halves shipped earlier, below).
      `research-modules-are-reachable.test.ts` now strips comments with a quote-aware walker before
      matching — a backtick in prose is no longer an import — and scans all 24 worker source
      directories (was 5) plus `worker/package.json`, so a CLI reached only by an npm script counts
      as wired. Premise correction: the prose blind spot was real but had hidden NOTHING in the
      five directories already scanned. Widening the scan surfaced **14 orphans**, every one
      confirmed by an import-statement grep with a control: `bexar-clerk-adapter` (335 lines for
      a publicsearch.us host the kofile adapter already speaks; the registry calls Bexar a stub),
      `ai/prompt-registry`, `billing/stripe-billing` + `subscription-tiers` (a SaaS that does not
      exist), `cli/starr-research` (not in package.json scripts), Bell's own `export-service`,
      `plat-drawing-generator`, `html-parser`, `session-manager` (all superseded by the live
      `reports/` and scraper code), the three `exports/` writers (CSV, Trimble JobXML, Carlson
      RW5 — real value, no home), `sources/bell-cad-data-portal` (390 lines; deleted under B4
      the same day once the run log showed the GIS layer already is the second door) and
      `sources/txdot-roadways-client` (the live ROW path uses
      `txdot-row` + `txdot-rpam-client`). Each is recorded in `KNOWN_UNREACHABLE` with that
      verdict; wire-or-delete belongs to the platform audit, which is what this inventory is for.
      The test has a control (`some-orphan` named only in a comment is NOT wired; in an import it
      IS; a `//` inside a URL literal survives) and a 30 s timeout because the scan quadrupled.
- [x] **B*7. Two confidence scales in one column, and two viewers each assuming a different one.**
      — shipped 2026-09-03.

      | | Scale | Evidence |
      |---|---|---|
      | `lib/research/analysis.service.ts` | 0–100 | `prompts.ts` asks for `"overall_confidence": 0-100` |
      | `lib/research/document.service.ts` | 0–100 | same prompt |
      | `worker/.../file-generic-document.ts` | 0–1 | `ai-extraction.ts`: *"Set confidence per-call (0.0-1.0)"* |
      | `SourceDocumentViewer.tsx` | reads as 0–100 | `{doc.ocr_confidence}%` → a worker row shows **"0.92%"** |
      | `ReviewDocCard.tsx` | reads as 0–1 | `Math.round(x * 100)}%` → an app row shows **"9000%"** |

      One document could be 92% confident on one screen and 0.92% on another, with nothing on either
      screen to say which number was the lie. `lib/research/confidence-scale.ts` is now the one rule
      at every read and every write; the worker's writer finally calls the `normaliseConfidence`
      that has carried a comment describing this exact hazard, with no callers outside its own
      module, since it was written. Seed 627 brings the stored rows onto the 0–1 scale, adds the
      column comment, and adds a `NOT VALID` check so anything written from here on obeys it.
      The genuinely ambiguous value — exactly `1`, which is 100% on one scale and 1% on the other —
      is read as 100%, and the tie-break is stated in both the module and the seed rather than left
      as silent behaviour.
      **The "6800%" claim I could not reproduce.** The audit attributed it to `boundary.confidence`
      being 0–100 from Bell and 0–1 from generic. The Bell status response carries no `boundary`
      key at all, and the Bell metadata branch writes `boundary: null`, so I could not find the path
      that produces it. What is true and worth guarding: `confidence: number` on
      `ExtractedBoundaryData` declares no scale and has more than one producer, and the panel
      multiplied it by 100 on trust. It normalises now. Recorded as a guard against an unproven
      claim rather than as a fix for a confirmed defect.

- [x] **B*8. The review page passed the literal `status="success"`.** — shipped 2026-09-03.
      Every project, forever, regardless of what its run did: "✓ Research complete" above the logs
      of a run that had crashed, with an operator signing off from it.
      Not one word, in the end. The page could not have known better — the outcome was the one thing
      the worker did **not** persist into `analysis_metadata.result`. Owner, boundary, documents and
      the entire validation report were written down; whether any of it could be trusted was not.
      The worker now writes `status`, `stopReason` and `failureReason`, the page reads them, and
      where they are absent — every project that ran before this change — the panel is given
      `archived`, which claims nothing and titles itself "Run log". `stopReason` leads the failure
      banner, because "reached the ceiling you set" is a more useful sentence than a generic failure
      line and is the one the 2026-09-03 run needed.

- [x] **B*6 (part). The ratchet flagged the explanation, not the code.** — shipped 2026-09-03,
      out of order, because B*5a tripped it. `writes-hit-real-columns` scanned raw source in
      `badFilters` and `badSelects`, so a doc comment quoting a fixed bad filter was read as a live
      call — and it fired on precisely that, in the commit that fixed the defect the comment was
      describing. `badWrites` had blanked comments since it was written; the other two had not,
      which is the divergence three copies of one idea always produce.
      `blankComments` also had the `Accept: */*` hazard: an unanchored block opener would blank
      every line to the next real `*/`, hiding real filters — and a scanner that cannot see a defect
      reports none, which reads exactly like a clean file. The opener is anchored to a line start
      now, and three controls prove it: a filter inside a comment is not flagged, the same filter
      outside one still is, and a `*/` inside a string literal does not blank what follows.
      The rest of B*6 — the orphan guard's `hasCaller`, the seven unscanned worker directories, and
      the concatenated-corpus "review reads what the worker writes" test — is still open below.

- [x] **B*6 (part 2). `research_adjoiners` has never held a row, and the test said it was fine.**
      — shipped 2026-09-03. The mocked-upsert finding turned out to be a live data-loss bug.

      ```
      adjoiner-persistence.ts   onConflict: 'research_project_id,parcel_id,owner_name,identified_by'
      seed 539                  UNIQUE INDEX ON (research_project_id, COALESCE(parcel_id, ''),
                                                 COALESCE(owner_name, ''), identified_by)
      ```

      The index is on **expressions**. Postgres matches an `ON CONFLICT (a, b, c)` inference target
      against an index's expressions, and `parcel_id` is not `COALESCE(parcel_id, '')`, so nothing
      matched and every call raised **42P10 — "there is no unique or exclusion constraint matching
      the ON CONFLICT specification"**. Not a duplicate-key warning; the whole statement failed. So
      every neighbour every run has identified was discarded at the database boundary while
      `describePersist` reported "0 neighbour(s) recorded" — a fact about our SQL, rendered as a
      finding about the property, which is the exact failure the adjoiner register's own header
      warns against.
      The COALESCE was right and is kept: NULLs are distinct in a plain unique index, so dropping it
      would fix the write by breaking the deduplication it exists for. Seed 628 adds `parcel_key`
      and `owner_key` — the same COALESCE, `GENERATED ALWAYS … STORED` — so the rule survives and the
      target is nameable, and drops the now-redundant expression index.
      **And a second one the audit did not find.** The new guard checks every research `onConflict`
      against the unique indexes in the seeds, and immediately turned up
      `lite-pipeline/route.ts` upserting `research_documents` on
      `(research_project_id, source_url)` — under a comment reading *"It is created by the seeds
      that set up the research_documents table (seeds/001... or equivalent)"*. No seed creates it.
      "or equivalent" was the tell: nobody had looked. Every link that pipeline discovered failed the
      same 42P10 into a `console.warn` and a `return 0`, which on screen is indistinguishable from
      "the search found nothing". Fixed by asking instead of asserting — read what the project
      already has, insert the rest — rather than migrating a 697-row table onto an index it may
      already violate.
      The old test mocked `upsert` and asserted the option string, so it agreed with the code about a
      string they were both wrong about; a mock cannot raise 42P10. The string is still pinned, and
      what makes the pin worth anything is the new seed-reading guard beside it.
      Seeds 626, 627 and 628 applied to production and **verified live**: `harvest_metadata` and
      `content_sha256` present, `pipeline_capture` in the source-type CHECK, zero `ocr_confidence`
      rows above 1, `parcel_key`/`owner_key` `GENERATED ALWAYS`, `idx_adjoiners_conflict_target`
      present and `idx_adjoiners_unique` gone.
      *(The verification probe itself was wrong once — it asked `research_projects` for
      `address_street`/`address_city`/`address_zip`, and seed 624 names them `street_number`,
      `street_name`, `city`, `zip`. `intake_notes` from the same ALTER answered, which is what proved
      the seed applied rather than the probe.)*



### Phase C — the order the owner asked for

- [x] **C1. The prioritisers cannot be the run's sequencer, and the premise said otherwise.**
      — settled 2026-09-03, by measurement rather than by choosing.
      C3 as written said "sequence the Bell orchestrator and the generic pipeline by the table".
      Both prioritisers live in `lib/research/`; the orchestrator and the pipeline live in
      `worker/src/`; and `worker/tsconfig.json` sets `"rootDir": "./src"`. **The worker cannot
      import them.** (The `worker/src/lib/…` imports that look like counter-evidence are the
      worker's own `lib`, not the repo root's — checked before concluding.) So the whole of
      Phase C had to be built worker-side, which is what C3 below does.
      **They are also not near-duplicates**, which is how the audit described them.
      `prioritized-pipeline.ts` DRIVES analysis — it imports `resource-analyzer` and `callAI` and
      fetches each resource. `prioritized-pipeline.service.ts` CONSUMES analysis — it takes
      pre-extracted atoms and only orders and cross-validates them, on `criteria-triggers` rather
      than `analysis-triggers`. One is a producer and one is a consumer of the same idea.
      **Their dependency sets each match a live route exactly**: `full-extract/route.ts` uses
      `resource-analyzer` + `cross-validation.service` + `extraction-objectives`, and
      `deep-lot-analysis/route.ts` uses `criteria-triggers` + `cross-validation.service` +
      `pipeline-logger`. Each prioritiser is a plausible extraction of one of those routes' inline
      loops. That is a real question with a real answer, and it is an **app-side refactor question**
      with nothing to do with the run order the owner asked for — so it moves to C1b rather than
      being answered here on a guess. Deleting them on the strength of "zero callers" would have
      been wrong: the strongest evidence says they are unfinished, not dead.
- [ ] **C1b. Adopt or delete the two prioritisers, from the routes' side.** Read
      `full-extract/route.ts` and `deep-lot-analysis/route.ts` and decide whether either
      re-implements its prioritiser's loop inline. If one does, adopt it there and delete the other;
      if neither does, both are speculative and go. Not urgent, and explicitly not blocking Phase C.
- [x] **C2 + C3. Drawings and overhead views run BEFORE the documents.** — shipped 2026-09-03.
      C2 as written was moot: the app-side table it describes cannot reach the run (see C1). What
      the owner asked for is a **run order**, not a scoring table, so it is one —
      `worker/src/research/run-order.ts`, four steps as data with the reason each sits where it
      does, printed to the run log before the run starts so an operator can see the order they were
      promised rather than infer it from timestamps.
      **The ordering could not simply be reversed.** An aerial needs coordinates and a plat needs a
      subdivision name, and both come from identifying the parcel — so the real order is "visuals
      first among the things possible once the parcel is known". Both paths already have that
      moment (Bell's "Phase 1 complete", the generic pipeline's Stage 1/2 boundary) and neither had
      any way to tell a caller about it. `onPropertyIdentified` is that hook, **awaited** by both —
      fire-and-forget would let the deeds start immediately and restore the old order in all but
      name, and a test asserts the await.
      **What this would have changed on 2026-09-03.** Captures were a post-processing step in
      `index.ts`, running after `runCountyResearch` returned. The run reached them at **[1377s]** —
      23 of its 25 budgeted minutes gone, 163 actual minutes and $29.19 spent — and printed
      *"Direct map screenshots skipped — no property ID or coordinates"*. Under this order it learns
      that in the first minute, which is a far more useful failure.
      The end-of-run capture stays as a **fallback**, because a run can finish without ever having
      identified a parcel and the finished result may carry a centroid Phase 1 lacked. It skips when
      the early pass ran, and the flag clears on re-run — otherwise a second run would skip its own
      fallback on the first run's flag.
      `visualReadiness()` reports which half is missing, because "no coordinates" and "no
      subdivision name" have different fixes, and a stage that says only "skipped" leaves an
      operator nowhere to go. Neither is ever reported as the property having no plat or no imagery.
      Sixteen tests, all asserting the CALLERS, including that the fire point precedes the clerk
      search and Stage 2 in the source. Mutation-checked: turning the `await` into `void` fails two.
- [x] **C4. The plat gets the money first.** — shipped 2026-09-03, and not in the form the item
      described. Premise checked before building, as usual, and half of it was wrong.
      **What is not there:** "the plat/drawing stage tries TexasFile and Kofile FIRST" presupposes a
      paid plat SEARCH. There is none. TexasFile appears nowhere in either path's plat stage; the
      only paid step in the whole worker is the end-of-run `DocumentPurchaseOrchestrator`, and it is
      instrument-driven — it buys against `documentPurchaseRecommendations`, not against a
      subdivision name. Building a TexasFile plat-by-subdivision search is real work and real value,
      and it is C4b, not a note appended to a sort order.
      **What was there, and was wrong:** the recommender sorted by ROI and then **overwrote
      `priority` with the ROI rank** — discarding Rule 1's deliberate `priority: 1` on the
      unwatermarked plat two lines after it was written, under a comment saying an unwatermarked
      plat "is almost always the highest-ROI purchase".
      That is not academic. `DocumentPurchaseOrchestrator` spends in `priority` order and stops at
      the ceiling, recording everything past it as `budget_exceeded`. So on a run whose money could
      buy two documents, **a deed with a marginally better ratio took it and the plat was skipped** —
      the exact inverse of what the owner asked for, decided by an arithmetic ratio rather than by a
      judgement anyone made. Tiered now: visual documents lead, ROI orders within a tier. ROI still
      decides between two plats; it no longer decides between a plat and a deed.
      **The first version of the test proved nothing.** It used a 2-page plat, whose ROI (2.5)
      already beat the deed's (0.8), so it passed identically with the tiering removed. Found with a
      probe rather than assumed. The fixture is now an eight-sheet subdivision plat — an ordinary
      thing to find — priced at $16 for a gain of 6 (0.4) against a deed search at $6 for a gain of
      3 (0.5), so the deed genuinely wins on the ratio and loses on the judgement. A CONTROL asserts
      that inversion holds before the ordering is asserted. Mutation-checked.
- [ ] **C4b. A paid plat search, by subdivision.** TexasFile and Kofile can be searched for a
      subdivision's recorded plat directly, without waiting for an instrument number to come out of
      the confidence report. That is the "start there when payment is on" half of the owner's
      request, and it needs a real search + purchase + page-fetch path rather than a reordering.
- [x] **C5. Free adapters lead for everything else — now asserted rather than merely true.**
      — shipped 2026-09-03. Measured first: this was **already the behaviour**. County CAD, the free
      plat repository and the clerk's free index and watermarked previews all run in Stages 1–2, and
      the only paid step runs at the very end, after the confidence report says which documents are
      worth money. `pipeline.ts` does not contain the string `DocumentPurchaseOrchestrator` at all.
      Nothing asserted any of that, which is how it would silently invert — and C4 makes that more
      likely, not less, by giving the paid path a promotion. Three guards now: the free visual pass
      precedes the purchase in `index.ts`, the generic pipeline consults the free plat repository and
      never buys anything, and every spend still passes `resolvePurchasePermission` first — because
      making the paid tier lead must not make it easier to reach.

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

      **Shipped 2026-09-03 — and §1.5b's description of Bell was wrong, in Bell's favour.**
      The plan said Bell "sends WHOLE page images to Claude". It does not: `splitImageIntoRegions`
      has always split. What it produced was three fixed regions on every page — the full image, the
      top half and the bottom half, at 15% overlap, with no grid selection, no per-segment confidence
      and no escalation. Two horizontal strips are not quadrants; a "half" of a 24×36 sheet is
      eighteen inches of drawing in one Vision call, which is the resolution problem
      `adaptive-vision.ts` exists to solve.
      `selectOptimalGrid`, `computeCropBoxes` and `analyzeImageDimensions` are exported now — they
      are pure functions over dimensions — and Bell uses them, keeping its own deed prompt for what
      each segment MEANS. One segmentation rule, two prompts, rather than two of each.

- [x] **D1b. A deed page was costing 32 Vision calls, and nobody had measured it.** — shipped
      2026-09-03. Found by probing the planner *before* wiring Bell to it, rather than after.
      Three defects compounding in the module every non-Bell county already uses:

      1. **`analyzeImageDimensions` never searched.** It reads as "match to closest standard sheet
         by aspect ratio". `bestDiff` started at `Infinity`, so the first candidate always satisfied
         `diff < bestDiff` — and the body `return`ed *inside* the loop. Every image ever measured
         was called a 24×36 sheet, because 24×36 is first in the list. The other entries were
         unreachable and `bestDiff` was assigned once and read never.
      2. **Letter and legal were not in the sheet table**, and deeds are the majority of what this
         system reads.
      3. **The grid test did not mention the grid.** `fineTextPx = dpi × 0.07` is constant across
         all four options, so the loop could only return 2×2 on the first pass or fail all four —
         **2×4 and 4×4 have never been selected in the history of this module.** The surrounding log
         messages computed the same quantity *with* the API downscale factor, so the log and the
         decision were different numbers and only one of them was printed.

      Compounded: a 2550×3300 scan — letter at a perfectly good 300 DPI — was computed as
      3300/36 ≈ **92 DPI**, its fine text estimated at 6.4px against a 13px floor, every grid
      failed, and the selector fell through to its finest: **4×8, thirty-two Vision calls for one
      deed page** — each able to escalate to four more, and those to four more again. On the
      2026-09-03 run's 16 deeds that is the shape of a $29.19 bill against a $2 ceiling.
      **The fallback was also backwards.** A finer grid helps only by avoiding downscale, so "no
      grid reaches the floor" means the scan lacks the resolution — the ink is not there. Cutting a
      120 DPI page into 32 pieces buys 32 calls to read the same blur. The floor is 2×2 now, which
      is the quadrant split the owner asked for, and rating the paper is `ocr-legibility.ts`'s job
      (D5).
      Measured after: letter/legal/11×17/24×36 all identify correctly, and every one of them selects
      2×2 — **four calls per page instead of thirty-two**, with escalation still firing on a
      quadrant that scores under 60, which is the owner's "zoom in and get an even better
      understanding" driven by evidence rather than by a DPI miscalculation. No plat regresses: a
      24×36 at 300 DPI chose 2×2 before and chooses 2×2 now. Fourteen tests; mutation-checked.
- [ ] **D2. Every page, whole and quartered.** The whole page stays exactly as it is stored today —
      that half already works and must not regress. Each page additionally goes through grid
      selection, cropping and per-segment analysis, and the per-segment findings are stored against
      the page so a reader can see which quadrant a fact came from. `ocr_segments` already exists as
      a column on `research_documents`.
- [x] **D3. Escalation fires — and Bell did not have it at all.** — shipped 2026-09-03.
      D1 gave Bell the same *grid* as the generic pipeline. It did not give Bell the **sixth
      phase**, which is the one that matters when a page is hard to read: a segment scoring under 60
      is cut into four and read again at higher resolution. So a watermarked quadrant on a deed was
      read once and accepted. That is the "zoom in and get an even better understanding" half of the
      owner's request, and it was missing from the county with the dedicated orchestrator.
      Bell escalates now, through the same `scoreConfidence` the generic path uses.
      **Driven by evidence, not by page size.** `needsZoom` requires `dataPoints > 0`: a region that
      found bearings and then hedged about them has more to find; a blank margin does not, and four
      more calls on a blank margin is four more calls. A text-only region — dedications,
      certifications — scores 50 by design and is correctly left alone.
      **Re-cut from the ORIGINAL page, not from the region's already-resized crop.** Enlarging a
      downscaled image cannot recover detail, and recovering detail is the entire mechanism.
      `cropRegionFromPage` was lifted out of `splitImageIntoRegions` so both the primary split and
      the escalation can reach it, and each region carries the box it came from.
      Asserted on text shaped like what a watermarked county scan actually produces — `[?]` markers,
      "possibly", "partially obscured" — with a CONTROL that a clean read of the same quadrant scores
      ≥60 and does not zoom, so "the bad one zooms" is not true merely because everything zooms.
      Nine tests; mutation-checked.
- [x] **D4. `extracted_text` stopped meaning "the AI summary".** — shipped 2026-09-03.
      A summary is a **conclusion**, not an extraction. `extracted_text` was
      `deed.aiSummary ?? deed.legalDescription ?? null`, so when the AI stage was skipped or failed
      — and the 2026-09-03 log says plainly *"No master report text — Stage 5/6 may have been
      skipped or failed"* — the column went in NULL, `assessArtifact` read that as *"No text was
      extracted from this document at all"*, and the document was stamped **unreadable**. Verified
      against the live database: all 16 deeds from that run, `extracted_text` NULL and
      `extracted_text_method` NULL, with their page images stored correctly at 2550×3300. A fact
      about our pipeline, rendered on screen as a fact about the paper.
      `analyzeDeedException` now returns what it READ alongside what it concluded, and that text
      exists whether or not the reconciliation pass runs — which is the entire point. `ocrText` goes
      to `extracted_text`, the summary to `analysis_metadata.aiSummary`, and `legalDescription`
      survives only as a last resort under its own honest method name, `cad-legal-description`.
      **The method now travels with the text**, at both insert sites. A populated `extracted_text`
      beside a NULL `extracted_text_method` is a row nobody can audit — is that OCR, a PDF text
      layer, or a summary wearing the wrong hat? Every Bell deed ever filed was that row.
      `patchDocument` already refused the combination; the inserts supply it rather than relying on
      the refusal.
      **D2's storage half came with it**: `ocr_segments` has existed as a column since seed 570 and
      nothing wrote it here. Each region's label and character count is filed, so a fact can be
      traced back to the quadrant it came from.
- [x] **D5a. One set of numbers for how tall readable text is.** — shipped 2026-09-03. The premise
      was wrong: `ocr-legibility.ts` is not unimported — `choose-tiles` and `finding-confidence` use
      it, and `survey-reading` reasons over its verdict. What was true and worse: it declares
      `FINE_TEXT_HEIGHT_IN = 0.07`, `MIN_FINE_TEXT_PX = 13` and `API_MAX_PIXELS = 8_000`, and
      `adaptive-vision.ts` **declared the same three numbers for itself**. They happened to agree.
      Nothing made them agree, and a grid selector and a legibility rater disagreeing about how tall
      readable text is would be a very quiet way to be wrong — especially given D1b, where those
      exact constants decided between 4 Vision calls and 32. Imported now, one direction only,
      because `ocr-legibility.ts` imports nothing by design.
- [x] **D5b. "Unreadable" means the paper.** — shipped 2026-09-03.
      D4 stopped `extracted_text` holding a conclusion where an extraction belonged. It did not, on
      its own, let anyone tell these two apart — and they have **opposite fixes**:

      | What happened | Whose problem | What to do |
      |---|---|---|
      | The scan is too poor for any model to read | the DOCUMENT | buy a better copy, or go to the courthouse |
      | The scan is fine and our extraction produced nothing | **ours** | re-run the analysis — buying another copy wastes money |

      On screen they were the same word. `assessLegibility` answers the second question from the
      image's own dimensions — no model, no text — which is the independent signal
      `project_receipt_confidence_and_editing` records: faded ink gives a **confident wrong**
      answer, so legibility has to be rated on its own.
      A legible scan with no text is now `pending` with a reason saying so in words an operator can
      act on, not `unreadable`. The scan's verdict, effective DPI and modelled fine-text height are
      stored in `readability_signals`, a column that has existed since the readability slice and
      held `[]` here.
      **An unmeasurable image means "we do not know", never "the scan is fine"** — `scanLegibility`
      returns null and the old text-only judgement stands, which is a fallback rather than a claim.
      The physical sheet comes from the same estimator the grid selector uses, so the rater and the
      splitter cannot disagree about what they are looking at (and that estimator was wrong until
      D1b, which is exactly why they should not have been separate).
      Also fixed in passing: `assessArtifact` was called **three times with identical arguments** at
      each insert site. Harmless while it was pure; rating the scan reads the image, so it is now
      called once.
      Ten tests including a CONTROL that the two scan fixtures really do produce different verdicts,
      and one pinning the old collapse-to-unreadable behaviour as the no-information fallback.
      Mutation-checked.
- [x] **D6. Every document on file, not every document a stage touched.** — shipped 2026-09-03.
      Measured against the live database over 697 filed documents, and it is worse than the plan's
      16:

      | | Count | What that is |
      |---|---|---|
      | No extracted text at all | **87** | 50 deeds, 26 plats, 9 untyped, 2 easements |
      | Text with a NULL `extracted_text_method` | **295** | text nobody can weigh |
      | NULL `readability` | **663** | never rated |

      Every one of the 87 has its page images in storage — found, fetched, paid for where the county
      charged, uploaded, and never read. Analysis happened where a **stage** touched a document, so
      a deed retrieved by a path with no analyser attached was a deed nobody ever read.
      `research/reanalyze-documents.ts` asks the one question that matters — *is there a document on
      file we have not read?* — of the place that knows, the rows themselves. Adding "and also
      analyse it" to the clerk path, the plat path, the capture path and the upload path would have
      given four places to forget.
      **Three answers, and the difference between them is the point.** No pages is a *retrieval*
      gap and says so — re-running an analyser cannot fix it. Text with a method is left alone, or
      the pass would spend money on all 697 documents every run. Text *without* a method is re-read,
      because `extracted_text` has held raw OCR, an AI summary, a legal description and a JSON blob
      at different times and unweighable text is barely better than none.
      It reads with `adaptiveVisionOcr` — the same quadrant pass the run itself uses — so a
      re-read document is read exactly as well as one read the first time, escalation included. The
      five-page cap is stated rather than silent, and a failed listing is reported rather than
      passing for "nothing to do".
      Eighteen tests, with a CONTROL that a document already read is left alone; mutation-checked.
- [x] **D7. The 16 FM 2484 deeds are covered by D6, and so are 71 more.** — 2026-09-03.
      They were the plan's proof case and they turned out to be a fifth of the problem. The pass in
      D6 runs at the end of every run, so re-running that project re-reads them with no special
      case; the pages are already bought and stored, so it costs model time and nothing else. Left
      to the owner to trigger, because it spends model budget on a project they may not want spent
      on today — the code is in place and needs no further work.
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

- [x] **F1. The merged log writer landed** — commit `cbcfeee21`, 2026-09-03. One function merges
      every source, de-duplicates, orders by time and reads-before-writing, so a thin write can
      never shrink a full one. Two writers were racing; one wrote the crash line and discarded
      1,529 lines into a memory map that dies with the process.
      *(This item said "not yet committed" — it was, on the same day. Corrected by checking
      `git log` rather than the doc.)*
- [x] **F2. The view-side merge landed** — same commit. The panel picked one source whole, so any
      re-render — the copy button's own `setAllCopied` included — swapped a live log for the single
      persisted entry, which is precisely what the owner saw: *"whenever I clicked the copy all logs
      button, they went away"*. Merge instead of swap, and one Copy All Logs button instead of
      three.
- [x] **F3. The diary is written while the run is still alive.** — shipped 2026-09-03.
      Both writers fired at completion, so a run that is killed — process restarted, container
      replaced, box rebooted — lost everything it had learned. The 163-minute run of 2026-09-03
      survived only because it happened to finish; killed at minute 160, the whole diary would have
      gone with it. That is what *"there are no logs really"* was, on the other side of the same
      coin from F1.
      **Safe by construction, not by care** — and that is the reason F1 was worth building as a
      merging read-before-write: a mid-run flush can only ever GROW the stored log, and two flushes
      racing produce the union rather than the shorter one. The test that asserts this is in the F3
      block, because F3 is what now depends on it.
      Throttled by elapsed time rather than run on a timer: a timer has to be created, cleared and
      remembered per run, and a forgotten one writes to a project that finished an hour ago. This
      fires from the progress callback, which only ticks when there is something new, is **not
      awaited** (research must not wait on its diary), and writes nothing at all when the live log
      is empty. The clock resets at both ends of a run, so a re-run does not spend its first thirty
      seconds — the window a crash is most likely to fall in — waiting on the previous run's clock.
      Ten tests; mutation-checked.
- [x] **F4. Both logs, in the one viewer.** — shipped 2026-09-03.
      Everything the browser knew about a run — the POST that started it and what it answered, every
      poll and its status, a failed fetch, a console error thrown while rendering the result — lived
      in a buffer that surfaced only if somebody filed an error report.
      **Not cosmetic.** Several of the contradictions reported on 2026-09-03 were disagreements
      *between* the two halves: a panel latching "Research Failed" while the worker went on
      retrieving seventeen documents; a poll landing on a previous run's cached result. Neither is
      visible in a worker log, because neither happened in the worker — and there was nowhere to
      look at the other one.
      Adapted into `PipelineLogEntry` rather than given its own panel, so it inherits the filter,
      the ordering, the de-duplication and the Copy All Logs export the owner actually uses. A
      parallel viewer would need its own four and they would drift. Every entry is stamped
      `layer: 'Browser'` — the one thing this must never do is let a browser entry pass for a worker
      one.
      Bounded by the run's `startedAt`, **which the worker has always sent and nothing read**: the
      buffers are session-wide and hold the last 30 actions and 20 console lines, so without the
      bound a five-minute run is shown beside whatever the operator did before starting it.
      Details that took thought: a 3xx is `partial`, not success, because a redirect on an API call
      is usually an auth bounce and reading it as success is how a signed-out session looks like a
      working one; a console *warning* stays a warning, because burying warnings under Errors makes
      both filters lie; `console.error` had to be added to the Errors filter, which was written
      against worker sources only; and the browser half is recomputed each render because the
      buffers are module-level mutable state — a memo keyed on anything stable would show a stale
      browser half beside a live worker one.
      One guard re-pointed: it pinned the exact two-argument `mergeLogEntries(logProp, loadedLog)`.
      The property it exists for is that the view MERGES rather than picks, so it asserts that shape
      now and a fourth source will not fail it while removing the merge still will.
      Fifteen tests, with a CONTROL that the bound is what excludes an entry rather than the
      function returning nothing; mutation-checked.
- [x] **F5. Live streaming.** — shipped 2026-09-03. Read before deciding: the 379-line
      `worker/src/websocket/progress-server.ts` spoke a projectId protocol on `/ws/research` that
      no client anywhere used, while the repo already has a complete WS stack (`server/ws.ts` via
      `npm run ws`, `/api/ws/ticket`, the `useResearchProgress` hook, one shared signer). A second
      server was a fork, not the missing half. "Immediately retrievable" is met by F3+F4: the panel
      polls the status endpoint, which returns the live merged log, and the diary persists mid-run.
      So: DELETED, together with its only test (`progress-server-auth.test.ts`) — but its one idea
      the live stack lacked, the ping/pong heartbeat that terminates a half-open socket so the
      fan-out stops serialising for listeners that are gone, was merged into `server/ws.ts`.
      Guards: `__tests__/research/ws-heartbeat.test.ts` (8, with a control), and
      `warnings-are-about-this-process.test.ts` now asserts the worker reads `WS_TICKET_SECRET`
      nowhere. Worker + app `tsc` green.

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
