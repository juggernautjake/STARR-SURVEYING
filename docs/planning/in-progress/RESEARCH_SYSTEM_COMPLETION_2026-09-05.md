# Research system completion — everything left, in phases — 2026-09-05

**Started** 2026-09-05 · **Branch** `claude/research-system-completion-2026-09-05`

Driven by the stop-hook slice loop. Ship the smallest meaningful slice, `tsc` + lint + test, commit,
push, annotate. Move to `completed/` only when every item is shipped or explicitly deferred with a
reason. **Every slice starts by reading the live code it touches.** Standing constraints: ask before
each merge to `main`; `npm run build` before a merge; **NEVER rebuild the worker while a run is in
flight** (`activePipelines` on `localhost:3100/healthz` must be 0); worker = Docker on netcup
`root@152.53.48.240`, repo `/opt/starr`, rebuild `BUILD_SHA=$(git -C /opt/starr rev-parse --short
HEAD) docker compose up -d --build worker`.

This doc is the single, comprehensive plan for finishing the two-pipeline research system. It absorbs
the remaining items from `GATHER_AND_REVIEW_SPLIT_2026-09-05.md` (whose SHIPPED slices stand) plus the
new findings from the 2026-09-05 supervised benchmark session. Memories:
`project_two_pipeline_gather_then_review`, `project_analysis_runs_on_worker_not_vercel`,
`project_texasfile_purchase_flow`.

---

## What already works (do not rebuild — verify before touching)
- Gather run on the worker: parcel resolve → capture plats/overhead/aerials → county clerk → files
  documents to `research_documents`. TexasFile purchase PATH (login→search→purchase→file) works (G1).
- Two-budget model, 25-min gather cap, budget/duration watchdogs, no-AI-in-gather gate, analyze cost
  cap, fixed $/page estimator + quote endpoint + per-file "Analyze this", persistent-zoom viewer — all
  built + unit-tested (see the other doc). **Not yet wired:** the checklist→acquisition feed, the
  two-budget UI in the run-start flow, and `phase:'gather'` is never sent.

## What the 2026-09-05 benchmark session proved is BROKEN
1. **Long analysis does not complete on Vercel** — app `analyzeProject` is fire-and-forget; the
   serverless function freezes after the response. 7+ min, 1 log, 0 progress.
2. **Deeds stall at `processing_status:'pending'`** and are then excluded from analysis (query filters
   `extracted|analyzed`). The run's 3 deeds (20 of 27 pages) were never OCR'd/analysed.
3. **Run stalled in Phase 3** at 91% and had to be stopped by hand.
4. **Cost-tracking undercount** — UI "SPENT" $1.82 vs the `research_usage_events` ledger $3.13.
5. **No plat produced** — free Bell had none purchasable and no TexasFile budget was dedicated.

---

## PHASE F — Foundational fixes (these undermine every run + every measurement)

### F1 — Deeds must not stall at `pending`; the OCR reading pass must reach them
Read `worker/src/index.ts` run tail (`reanalyseProjectDocuments`, `mayRead`) + how a captured deed's
`processing_status` moves `pending → extracted → analyzed`. Ensure captured deeds are reliably OCR'd
out of `pending` (the worker reading pass), and that a stall/abort does not leave the substance
documents unprocessed and invisible to analysis. Add a guard/test.

### F2 — Cost tracking = the ledger, not an undercount
The run UI "SPENT" showed $1.82 while `research_usage_events` summed $3.13 for the same project. Find
what the UI/report reads for "spent" vs. what `recordUsage` writes to `research_usage_events`, and make
the reported spend equal the ledger (the ledger is truth). Cover every cost source (AI calls, OCR,
purchases). Test the reconciliation.

> **Root cause found + helper SHIPPED 2026-09-05.** `recordUsage` (worker) increments the in-process
> `runSpend` map AND writes the ledger — but the **app-side** analysis (`lib/ai/usage.ts`) writes the
> same `research_usage_events` ledger WITHOUT touching the worker map, so the UI's live "SPENT" (worker
> `spendForRun`) misses app-phase cost. Added `ledgerSpendForRun(projectId, load?)` to `infra/usage.ts`
> — the TRUE all-phases spend, summed from the ledger (`load` injectable for tests). `ledger-spend.test.ts`
> (3) incl. the $1.82+$1.31=$3.13 case. Worker tsc green.
>
> **Per-project ledger endpoint SHIPPED 2026-09-05.** `GET /api/admin/research/[projectId]/cost` sums
> `research_usage_events` for the project (all phases — gather + analyze) and breaks it down by
> `event_type`, so the true total is queryable rather than the worker-phase-only $1.82. (The global
> Billing tab already sums the ledger by user; this adds the missing per-project total.)
> `project-cost-route.test.ts` (3); app tsc green. **REMAINING for F2:** surface this per-project total
> in the run/project UI (a display slice — folds into Phase U); the live per-run bar rightly stays on
> the fast in-memory `spendForRun`. The two-run model shows gather + analyze as separate run costs,
> which is correct; this endpoint is the combined project truth.

### F3 — The Phase 3 stall + a real stall watchdog
The run hung in Phase 3 (deed/plat extraction) at 91% with "nothing heard for 10 min", `activePipelines`
stuck at 1. Diagnose the hang (an un-timed-out AI/extraction call, most likely) and ensure a stall
watchdog fires: a step that emits no progress for N minutes must abort the run, file what it has, and
free the pipeline slot. Test the watchdog path.

> **Stall watchdog SHIPPED 2026-09-05.** `ActivePipeline` gains `lastProgressAt` (stamped at run start
> and on every progress callback) + `stallWatchdog`. A 30s-interval watchdog aborts the run when no
> progress has been reported for `STALL_MS` (env `RUN_STALL_MINUTES`, default **12 min** — just above
> the UI's 10-min "stalled" notice and a slow per-doc read), sets an `error` stop reason, frees the
> slot, and keeps whatever was retrieved; cleared on finish at both terminal sites. `stall-watchdog.test.ts`
> (5) + `run-cannot-outlive-its-ceiling` still green; worker tsc green. **Note:** this stops a *hung*
> run; the underlying Phase-3 hang (an un-timed-out extraction call) is best fixed at its source too —
> tracked with A1 (analysis reliability), where per-step timeouts belong.

---

## PHASE A — Analysis where it belongs (the worker, not Vercel)

### A1 — Route long analysis to the worker
Long/full analysis (and the benchmark) must run where it completes. Options to evaluate in-slice:
(a) a worker endpoint that runs the analysis over a project's documents (reusing the worker reading
pass + the app extractors), or (b) make the app `analyzeProject` chunked/resumable so each invocation
finishes a bounded batch within Vercel's limit and re-schedules. Pick the smaller reliable path; the
constraint is *it must finish a 27-page project without freezing*. Caller-asserted + a completion test.

### A2 — Include `pending` (freshly captured) documents in analysis
Analysis currently only sees `extracted|analyzed`. Ensure the analyze path OCRs/промotes `pending`
documents first (or widens the selection with an OCR step) so the deeds are actually analysed. Test.

---

## PHASE BW — Worker-side benchmark (rebuild BM1 where analysis runs)

### BW1 — Benchmark mode on the worker analysis
Move the benchmark from the app to the worker analysis (Phase A path): **no cost cap**, **30–60 s per
page**, OCR + extract every page including the deeds, then compute **total cost ÷ total pages** from
`research_usage_events` (the ledger) and write `benchmark_usd_per_page`. Retire/redirect the app-side
`benchmark` flag (BM1) — keep the pure `benchmarkResult` helper. Unit-test the arithmetic.

### BW2 — Run the benchmark, set the rate
Re-run the benchmark on the Nolan Creek project (deeds now OCR'd) or a fresh property; read
`benchmark_usd_per_page` from the ledger; set `ANALYSIS_RATE_USD_PER_PAGE` in
`lib/research/analysis-estimate.ts` (owner confirms the final number + margin). Supervised.

---

## PHASE W — TexasFile wired + the user sets what to search for (owner's priority)

### W1 — Run-start UI: the "what to find" checklist + a dedicated TexasFile budget
Put the checklist (Everything / All Plats / All Deeds / Most-recent plat / deed / easement / Google &
GIS maps — any combination, `GatherSelectionsField`) AND a **dedicated TexasFile budget** ($10 default,
raisable) AND the other-sources budget into the **create-project modal** (currently the old form) AND
the re-run dialog, and SEND `gatherSelections`, `phase:'gather'`, and the two budgets with the run.
Source-assert the wiring; owner browser-QAs.

### W2 — Selections drive acquisition (TexasFile-first for the selected items)
Wire `selectionsToWants` (S2) into the live purchase/acquisition path so the checklist DRIVES what the
run fetches: for each selected item, try free first, then **buy from TexasFile within the dedicated
budget** — plats/drawings + most-recent deeds prioritised. Remove `selection-wants` + `run-gather-
pipeline` from the orphan allowlist as they gain live callers. Caller-asserted.

### W3 — Two budgets enforced independently + estimate-and-warn
Enforce the TexasFile ($10) and other-sources ($2) budgets separately in the run (today the orchestrator
uses one `config.budget` + `this.billing` caps at that single number). Before spending, estimate the
selection's TexasFile cost (`gather-cost-estimate`, B2.2) and warn if over — proceed-within-cap
(priority order) or raise-to-estimate. Wire `gather-cost-estimate` in. Test.

### W4 — Actually buy the most-recent plat/drawing from TexasFile
Make the "most-recent plat/drawing" want search TexasFile by subdivision + book/vol/page and buy it —
the document this session's free run could not produce. Verified against a live TexasFile-budget run.

---

## PHASE U — UI for the two-run model + review

### U1 — Two-run portal + cost bars
Reformat the portal around Gather vs Analyze with their own states + cost bars (gather budget vs spend;
analyze cost vs cap, reading R3's `analysis_metadata`). Fold in the built controls (Run AI Review,
per-file Analyze, cost disclosure). Browser-QA.

### U2 — Review viewer coverage
Surface the persistent-zoom `SourceDocumentViewer` on the gather-review surface for every gathered
image/file/page (it already renders full-size with zoom persisting across pages). Browser-QA.

---

## PHASE P — Proof

### P1 — Full suite green before any cross-cutting merge (worker + app).
### P2 — Supervised proof run: a TexasFile-budget gather run driven by the checklist that BUYS a plat +
most-recent deeds, files them, then a worker-side full analysis with the benchmarked rate. First real
`research_document_purchases` rows + a plat in Review.

---

## Deferred / open
- (record here with a one-line reason as slices are deferred)
