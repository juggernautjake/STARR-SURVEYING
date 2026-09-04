# Research platform completion, part 2 — 2026-09-04

The first completion plan (`completed/RESEARCH_PIPELINE_COMPLETION_2026-09-03.md`) closed on the
night of 2026-09-03. Everything the owner asked for after that — across runs 4, 5 and 6 on
1512 Chisholm Trail — is accounted for here: what was fulfilled, with the run that proved it, and
what is still open, as phases and slices the stop hook can work through one at a time.

Main is at `090c2df6e` (worker + Vercel deployed) as this document is written.

## 1. The owner's requests, and where each stands

| # | Request (owner's words, shortened) | Status | Evidence |
|---|---|---|---|
| 1 | Full analysis of the research platform: built / necessary / dead; fix; propose a better shape | **Done** | first plan closed; overview artifact; 40+ commits merged |
| 2 | Keep the stop hook satisfied; ship slices; move the doc when done | **Done** for part 1 | this document continues it |
| 3 | A full list of everything updated, hooked up, synced, removed, created, fixed | **Done** (twice) | delivered 2026-09-03 and 2026-09-04; overview artifact |
| 4 | Merge to main so Vercel redeploys | **Done** | every slice merged; worker + Vercel verified on each sha |
| 5 | Second ultracode evaluation; fix what can be fixed; suggest workflow changes | **Done in part** | 9 reviewers ran; fixers cut off by the spend limit; confirmed findings applied by hand (`8d4392edb`) |
| 6 | "The run just keeps going" | **Done** | watchdog + bounded tail (`583c586c7`); run 4 ended at exactly 900 s |
| 7 | Worker and server/client updates; SSH commands to pull the worker | **Done** | commands delivered; auto-updater verified on every merge |
| 8 | CAD map captures: Playwright + OCR + tools to get past agreement popups and captchas | **Done differently, partly open** | the CAD map is rendered from the parcel layer, so no popup can block it (`76cb555bb`); the viewer fallback dismisses dialogs; no captcha solver is funded (CapSolver rejected) → Phase B |
| 9 | "Something buggy with the logging" (export had only browser lines) | **Done** | `a146af3f0`; the owner's next export carried 1,181 worker lines |
| 10 | Retrieve the plats and drawings, the correct CAD map view, the satellite aerial view | **Done for maps and aerials; plats partly** | run 5: 6 plats + deed chain filed, first aerials ever (`230c3358a`); plat repository still blocked (403 from worker AND Browserbase) → Phase C |
| 11 | Every overhead view centred on the parcel; imagery + at least one lines-only view every run | **Done** | `090c2df6e`: fixed frames centre on the polygon; `cad_parcel_lines` drawn with side lengths in feet |
| 12 | "A run that finished having skipped the deed chain is not a run that finished" | **Done** | run 6: "Stopped mid-step, work kept: clerk deed search (10 document(s) kept; the subject's deed chain finished; the subdivision sweep was cut short)" (`5d327ddf4`); reserve for reading (`4ab36af8e`) |
| 13 | OCR on every image and document, tiled and zoomed, full analysis, summary and results for every file in every run | **Open** | library: 60 documents, 10 with text, 0 with a summary, 0 data points → Phase A |
| 14 | Systematic OCR + DOM atlas of every website; playbooks; navigate perfectly; plats and drawings especially | **Open** | planned below → Phase B and Phase C |
| 15 | Review all requests; a phased planning doc in in-progress for the stop hook | **Done** | this document |

## 2. Facts the phases are built on (2026-09-04, project 741bbd93, 1512 Chisholm Trail)

- Runs 4, 5, 6 each hit the 15-minute floor inside Phase 2. Phase 3 (the AI reading) never ran.
  The reserve (`4ab36af8e`) now holds 30% of the ceiling back for it — untested by a run.
- The tiled, zooming reader exists and works (`adaptive-vision.ts`, used by `ai-extraction.ts`,
  `ai-plat-analyzer.ts`, the capture runner and the post-run re-read). What is missing is
  coverage: a durable list of what has not been read, an order, and continuation across runs.
- The app-side extractor (`analyzeProject`, writes `extracted_data_points`) runs only from the
  Analyze button or the lite pipeline. It is never triggered by a worker run finishing.
- Duplicates: the review page's merge marks older copies `duplicate_of`; the worker library now
  loads those rows too (`090c2df6e`), but the copies already on file (plat 1982002520 ×4, every
  run-5 deed ×2) remain.
- bellcountytx.com refuses the worker's address and Browserbase's. The clerk is the plat source of
  record for Bell; the repository needs an office-side egress or is recorded unreachable.
- Google Maps times out from the worker; Esri tiles carry the aerials (z19, 0.26 m/px here).
- `research_document_purchases` is still 0 rows: a paid path has never executed end to end.

## Progress — 2026-09-04 (append-only)

Shipped and merged since this document was written (worker + Vercel deployed on each):

- **A2, A3 — the reading pass** (`a6c18d2cc`): one tiled reader for every page of every document,
  in surveyor's order, under a cost budget not the clock; queued-and-counted what the allowance
  did not reach; runs on EVERY run (was gated on the ceiling, which every run hit).
- **A5 (summary half)** (`a6c18d2cc`): each document summarised from the text just read, plus a
  sweep that summarises any file with text but no summary; the property summary written from the
  library on every run. The extracted-data-points half of A5 is still open.
- **D1** (already true, confirmed run 6): the clerk runs paths A (instruments) + B (owner) before
  C (subdivision sweep), so the ceiling cuts the sweep and the subject's deed chain finishes.
- **D-adjacent — the runaway** (`39d38c172`): the step deadline now ABORTS the scraper instead of
  only ceasing to wait for it; Path A/D honour the signal; `plat-repo` Browserbase adapter
  registered. Run 7 had reproduced the "keeps going" at 24 min; killed by a container restart.
- **E1 — the parcel polygon is persisted** (this slice): `PipelineResult.parcelBoundary`; the Bell
  path writes `property.parcelBoundary` into the result; the generic path has no polygon source and
  writes null honestly. The review page can now draw the county's lot outline. Guard:
  parcel-boundary-persisted-2026-09-04.test.ts.
- Earlier the same day (part-1 close): centring on the polygon, the lines-only drawing, the
  library seeing marked duplicates, kept-partial wording, year-stamped instrument identity.
- **A5 sweep actually shipped** (`1ee2771d1`): the summary sweep's caller was committed in the
  runaway commit while the function itself sat uncommitted in the working tree — the deployed
  `summariseUnsummarisedDocuments` import resolved to undefined and the sweep threw silently, so
  runs read documents but wrote no per-document summaries. Committed the function; added a callee
  guard to reading-pass-always-runs (imports the symbol, so a missing export fails the run). This
  is the "verify the callee exists, not just the caller string" instance of the wiring pattern.
- **The runaway, fully closed** (`8382b640f`): run 8 proved `39d38c172` was half a fix. The MAIN
  clerk search stopped at the ceiling exactly as designed (629s) — then the run drove the browser
  EIGHT more minutes in the 2B½ deed-chain fetch, because that `scrapeBellClerk` call (and the
  Phase 3B historical one) had neither a deadline nor an abort signal; only the main call did.
  Both are now wrapped in `withStepDeadline` with their own `AbortController` and pass the signal
  into the scraper; a guard counts the three browser-driving clerk calls and asserts every one is
  bounded. Run 8 (28 min, 13 past its ceiling) was stopped by deploying this and marked interrupted;
  its 18 documents are kept. Lesson: fixing the obvious call site is not fixing the defect — every
  call site of a browser-driving function needs the ceiling, and a count-the-call-sites guard is
  what proves it.

Still open and worth doing: A1 (persisted reading_priority — read-time ordering covers the intent
for now), A5 data-points half, A6 proof run (a clean run
now that the runaway is closed and the sweep ships — verify deed chain stops at ceiling, tail runs,
summaries written, polygon persisted), all of Phase B (site atlas + playbooks), Phase C (plat
recipe + repository egress), D2, D3, E2/E3/E5, F. (E1, E4, D4 shipped.)

## 3. Phases

Each slice ends with: worker/app type-check + lint green, a guard test that asserts the CALLER,
a commit, and — where the slice changes a run — a bounded live run whose log line proves it.
Verify in one turn, commit in the next. Build before any merge; merges need the owner's say-so.

### Phase A — Read everything that is found (request 13)

- [ ] **A1 — The reading queue is real.** Every filed document gets `processing_status =
      'queued'` until read; a `reading_priority` (subject deeds → plats → easements/restrictions
      → adjoiner deeds → other) is set at filing. `research_documents` gains nothing new if the
      existing columns carry it; otherwise one seed, applied live, with the CHECK verified.
- [ ] **A2 — One reader, tiled, for every page.** A single `readDocument(doc)` path (adaptive
      vision, tiles + zoom escalation, every page) used by Phase 3, the post-run re-read and the
      backlog job. Writes `extracted_text`, `extracted_text_method`, `ocr_confidence`,
      `ocr_segments`, `analysis_metadata.aiSummary`, `relevance`, `processing_status`. Nothing
      else writes text.
- [ ] **A3 — Order and budget.** Phase 3 and the tail read in priority order, under the analysis
      reserve, asking the budget between pages; what is left is left `queued`, counted, and named
      in the run summary ("read 14 of 31; 17 queued").
- [x] **A4 — Continuation (read-first half).** (`d3f4cc42b`) Before the search dispatch a run reads
      its own project's `queued` documents first — gated on a queue existing (never a first run),
      bounded by a head allowance (a slice of readingAllowanceMs, ≤4 min) and the cost budget, using
      the same reader + summary sweep as the tail, inside the run context. Non-fatal. Guard in
      reading-pass-always-runs. DEFERRED: the review-page "Finish reading" button — it needs an
      authenticated worker endpoint + app UI (a Phase E/route-auth-adjacent surface), disproportionate
      to this slice; the read-first path already works the backlog down on every run.
- [ ] **A5 — Summaries and data points from the same read.** The summary and the extracted data
      points come from the reader's output, not a second pass; the app's `analyzeProject` is
      either called automatically after a worker run when the run's settings allow the spend, or
      retired in favour of the worker's output — one of the two, decided in the slice, not both.
- [ ] **A6 — Proof.** A run whose log shows every filed document read or queued with a reason,
      the library query showing text + summary on each read row, and data points for the project.

### Phase B — Site atlas and navigation playbooks (requests 8, 14)

- [ ] **B1 — The atlas tool.** `worker/src/tools/site-atlas.ts` walks a site's states (entry,
      search, results, viewer, download) and writes per state: full-page screenshot, DOM outline
      (every interactive element with a stable selector and text), accessibility tree, data-carrying
      network calls, and a Vision read ("what is on screen, what blocks the user, what would a
      person click next"). Output under `docs/research/site-atlas/<site>/`, with an `index.md`.
- [ ] **B2 — Bell dossiers.** Atlas runs for Bell CAD eSearch, the GIS viewer, the clerk
      (publicsearch), the plat repository and Google Maps — from the worker AND from an office
      connection, so a block is a recorded fact with the office view beside it.
- [ ] **B3 — Playbooks.** `worker/src/playbooks/<site>.json`: entry, dismissals, search recipe,
      done-signal (an element or text, never a fixed wait), results layout, viewer recipe, download
      recipe, captcha signature, egress requirement. Reviewed by a person; versioned.
- [ ] **B4 — Scrapers read playbooks.** Clerk, CAD and GIS scrapers take selectors, waits and
      done-signals from the playbook and assert the expected state before each step; a mismatch
      names the playbook line.
- [ ] **B5 — Drift watch.** A nightly atlas re-walk diffs each site against its dossier and files
      a health row when a state no longer matches.
- [ ] **B6 — Popups and captchas.** From the dossiers: every dismissal encoded; captcha presence
      detected and reported (with a screenshot) rather than silently timed out; a funded solver or
      an office-side hand-off is the owner's decision, stated in the playbook.

### Phase C — Plats and drawings (requests 10, 14)

- [ ] **C1 — The clerk plat recipe.** From the clerk dossier: the exact search that lists PLAT
      documents for a subdivision (document-type filter, name variants, section suffixes, date
      range), encoded in the playbook and used by 2B before the deed search.
- [ ] **C2 — The repository.** Decide from the dossiers whether any egress reaches
      bellcountytx.com; if none, record the source as unreachable-by-policy and stop asking; if an
      office-side fetch works, a small relay is the slice.
- [ ] **C3 — Drawing hunt on the read text.** The drawing hunt runs on Phase A's text (survey
      references, plat cabinet/slide citations, volume/page) and turns each citation into a clerk
      lookup with a filed result or a stated miss.
- [ ] **C4 — Plat index per county.** The 19 BIS counties' plat sources in the registry with an
      egress note each, so a county without a reachable plat source says so before a run.

### Phase D — The shape of a run (requests 6, 12)

- [ ] **D1 — Order inside Phase 2.** Subject deed chain (instrument + owner) completes before the
      subdivision sweep begins; the sweep is what the ceiling cuts, never the chain.
- [ ] **D2 — Provider health feeds dispatch.** A provider marked down (Google, the repository, a
      dark CAD) is skipped by the next run for the marked period, with the reason in the log.
- [ ] **D3 — Ceiling and reserve tuning from real runs.** Numbers from Phase A6 and three owner
      runs; the 15-minute floor and the 30% reserve revisited with evidence, not taste.
- [x] **D4 — Duplicate identity backfill.** (`ef1300e6c`) `planIdentityBackfill` (tested) keys a
      row with the same refFromRow→identityKey the pipeline uses; the partial unique index makes it
      one operation with duplicate-reconciliation (each key one canonical, the rest duplicate_of it;
      a row already marked duplicate keeps its lineage). Runner `backfill-identity.mjs` applied live:
      157 rows keyed, 8 duplicates reconciled (verified clean, no chains), 611 correctly left
      unkeyable (no instrument number); a re-plan now reports 0 updates. The pre-existing 61
      storage-path duplicate chains are out of D4's scope (not created here) and left untouched.

### Phase E — Remaining audit items

- [ ] **E1 — Parcel polygon persisted** on the project so the review page can draw it.
- [ ] **E2 — Dead surfaces and the Testing Lab** retired through their guards, or wired.
- [ ] **E3 — Route auth** on the research API routes that lack it.
- [x] **E4 — Multi-page OCR segments** carried per page, not first page only. (`ace0f38a9`)
      `mergePageSegments` in artifact-uploader flattens every page's segments tagged by page number;
      both document inserts use it instead of `firstPage.ocrSegments`. The re-read path already
      carried per-page segments; the gap was documents read cleanly at filing (never re-read).
      Guards in ocr-segments-per-page-2026-09-04.test.ts. Proof deferred to the A6/F runs.
- [ ] **E5 — The paid path.** One TexasFile purchase end to end on a document the free path could
      not read, with the purchase row written and the switch proven to stop a second one.

### Phase F — Proof and close

- [ ] **F1 — Three owner-settings runs** (30 minutes, paid off) on three properties, each log read
      end to end, each library queried; every request in §1 re-checked against them.
- [ ] **F2 — Overview artifact and memory updated; this document moved to completed.**

## 4. Ground rules carried from part 1

- "Authored but not wired" is this repo's commonest defect: a wiring test asserts the CALLER.
- A table at zero rows is usually a write that cannot execute: check the CHECK, the columns and
  the conflict target before believing a feature works.
- A verdict nobody acts on is a comment. A ceiling only checked when something reports is not a
  ceiling. Kept work is not skipped work.
- Read the tool's exit, not the wrapper's. Run a control before believing a negative.
- The dossier is the evidence; the playbook is the decision; the scraper is the execution.
