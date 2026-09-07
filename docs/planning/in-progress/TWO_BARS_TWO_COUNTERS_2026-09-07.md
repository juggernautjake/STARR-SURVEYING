# Two loading bars, two cost counters — research vs. AI review (2026-09-07)

**Owner's ask (verbatim):** "Please make it so that there is one loading bar for the research stage that
just deals with file/doc/image retrieval, and then a seperate loading bar for the analysis stage. There
also needs to be two seperate cost counters for each stage as well." Earlier the same day: "We should have
a seperate counter for the AI review and a seperate cost counter too for that as well."

**Standing permissions for this job (owner, 2026-09-07):** create planning docs here so the stop hook can
build step by step; merge to main (redeploys + worker rebuilds); up to three more runs at TexasFile $20 /
other $5 (run 6 is the last); delete the old project and do a fresh run each time; apply SQL seeds.

## What is wrong today

| Screen | Today | Wanted |
|---|---|---|
| Research stage bar | `percent` = max(cost ÷ cap, time ÷ cap) — "cost proximity" (owner, 2026-09-04). It says nothing about retrieval. | Retrieval progress: identify → plats → imagery → clerk → context → report, from the worker's phase ladder. |
| Research stage SPENT | Scoped to the run's own window since 0912adc32 (done). | Keep. |
| Analysis stage | One text line (T′): "AI review running — 12:34 elapsed · $3.42 of $7.00 spent". No bar, no counters. | Its OWN bar (documents read → analysed → finalize stages) and its OWN counters: Documents, Elapsed, Spent of cap. |
| Analysis progress source | Nothing records where the review is; the status route only counts `analyzed` rows. | The worker stamps `analysis_metadata.review.progress` as it goes; the app's coherence finalize stamps `finishedAt`. |

## Slices

| # | Slice | Where | Status |
|---|---|---|---|
| X0 | Hotfix: 0912adc32 failed the worker's Docker build (`result.completedAt` on PipelineResult); host rolled back to f62eb4c63. | worker/src/index.ts | ✅ 67bcbb32c |
| X1 | Research bar = retrieval: status endpoint + `recordRunPhase` use the phase tracker's percent, not cost proximity. Ladder retuned for a gather run (no AI phases: ocr/extraction/reconciliation/validation shrink; reporting absorbs the final purchase pass + filing). Bar labelled "Retrieval progress". | worker/src/index.ts, research/run-phases.ts, app StatusCard | ✅ built (deploy pending) |
| X2 | The worker stamps the review's progress: `analysis_metadata.review.progress = { stage: reading|analyzing|finalizing|done, documentsDone, documentsTotal, label, at }` from the read pass (per document), the driven analysis (per document) and the three finalize stages; `finishedAt` stamped by the app's coherence finalize and by `unparkAnalyzing`. | worker/src/index.ts, research/reanalyze-documents.ts, research/drive-app-analysis.ts, lib/research/analysis.service.ts | ✅ built (deploy pending) |
| X3 | App: `getAnalysisStatus` returns `review.progress` + `review.percent` (pure `reviewPercent()`); `RunAiReviewControl` draws the review's bar and its Documents / Elapsed / Spent-of-cap counters. | lib/research/review-progress.ts, app/admin/research/components/RunAiReviewControl.tsx, AdminResearch.css | ✅ built (deploy pending) |
| X4 | Log-review fixes from run 5's log (owner sent the full export): L1 completeness said "NOT FOUND [plat]" though the early pass had filed the TexasFile plat (count the project's filed plat); L2 "Cheapest-first not honoured … TxDOT Right-of-Way Document Library covers this county at $0.00" fired for a plat and deeds (TxDOT carries ROW only — the policy choice is now type-aware); L3 "bought under uncertainty — could not be identified" fired for every `search_required` want (a search want has no identity yet; not uncertainty); L4 "Property summary skipped — ANTHROPIC_API_KEY is not set" on a gather run (the key is blanked on purpose; say so); L5 lifecycle handshake "Finished in 0.0s with 0 documents" for county results (use the county result's counts and duration). | worker | ✅ built (deploy pending) |
| X5 | Merge → deploy both → delete 74dc0e02 → fresh run 6 (TexasFile $20 / other $5) → AI review (cap $7) → verify both bars + both counters live, plat at full resolution (V), no duplicate rows (Q/R) → Discovered Leads → one follow-up round → move this doc + PLATS_FIRST + BOUGHT_DOCUMENTS_SURVIVE to completed/. | live | ⏳ |

## Run 5 log review (2026-09-07 06:51–07:02 CDT, project 74dc0e02) — findings

- Research run: 581 s, $0.02 AI (address variants), $0.00 purchases. Plat re-opened at $0 by the EARLY pass
  (06:53:39) — filed. Bell CAD eSearch and BIS GIS did not answer (fetch failed / 45–60 s timeouts) — external;
  GIS came from the FeatureServer, aerials/CAD map rendered from tiles + the parcel layer (as designed).
- Duplicates on the project (19 rows): the plat filed TWICE (06:53 early pass, 07:01 final pass — Q fixes the
  re-buy, R the duplicate row); Google Maps satellite/place rows twice (page_count null + 1 — R); three
  "Screenshot: research: /results" rows.
- The TexasFile plat AND the TexasFile deed (5 pages) were rated `unreadable` by the review — both were the
  940×612 preview PNGs (V fixes: viewer PDF). A fresh run 6 on the deployed build is the proof.
- Noise to remove (X4): L1–L5 above. "Deed Relevance error (recovered): REMOVED …" is an info logged into the
  errors list — left as is (it is the relevance verdict, and recovered:true).

## Run 6 (project `a7ef8036-2c01-4b03-b6d6-3b11a559d364`, 2026-09-07 10:17 CDT) — what it proved and exposed

- Research run: 586 s, $0.01 (AI address variants), $0.00 purchases. The plat was re-opened at $0 by the EARLY
  pass and filed from the viewer PDF at 200 dpi (1,788 KB, V ✓); the final pass said "the plat want is
  satisfied" (Q ✓) and re-opened the TexasFile deed (5 pages, 200 dpi) at $0; 16 rows, NO duplicates (R ✓);
  completeness "✓ FOUND [plat]: Filed from a paid source earlier in this run" (L1 ✓); "Property summary
  deferred" (L4 ✓); lifecycle "Finished in 586.2s with 1 document" (L5 ✓). The research bar walked the
  ladder (2% "Identifying the property" → 100%) and its counters froze at $0.01 / 10:46 of 25:00 (X1 ✓).
- The review read the TexasFile deed at "good" (37,533 chars) — the same document was `unreadable` on run 5's
  preview PNGs.
- Exposed (fixed in `b19e284b3` + `28faae520`, pushed after the review ended): the page showed the finished
  RESEARCH run while the worker held the review (`analyzing` maps to the research stage) — now a stamped,
  unfinished review puts the page on the Analysis stage and `onFinished` reloads it; the route's review stamp
  raced the worker's first progress stamp (progress without startedAt) — stamped BEFORE the hand-off now;
  "Cheapest-first … TxDOT" still fired for the easement want — TxDOT carries right-of-way only; a review in
  flight was invisible to `/research/active`, so the host updater could rebuild over it — counted now.
- The dialog's "How long this run may take: 30" is ignored by design for a gather run (25-minute cap,
  owner B2.3) — the run view's "/ 25:00" is right; the dialog copy is not (left for a later slice).
- Run 6's AI review (cap $7): read pass 4 documents at "good" (the plat 11,110 chars, the TexasFile deed 37,533,
  the clerk deed 25,404), 11 already had text; 15 of 15 analysed; finalize chain ✓ crossref ✓ — the 3-pass
  COHERENCE stage returned HTTP 504 (Vercel's 300 s) and the unpark stamped the review `stopped` with its clock;
  the project came back to `review` with its data points. Review spend $0.63 (52 AI calls) vs run 5's $3.42.
  Fixed: each coherence pass is its own finalize stage (`coherence1` → `coherence2` → `coherence3`), the earlier
  passes carried on `analysis_metadata.coherence_passes`; the worker drives five finalize stages.
- The Analysis stage now shows the LAST review's bar, clock and spend on open (not only while it runs).
