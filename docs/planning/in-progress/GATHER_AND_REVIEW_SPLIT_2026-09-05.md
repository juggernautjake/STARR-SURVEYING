# Two-pipeline split: Gather, then Review/Analyze — 2026-09-05

**Started** 2026-09-05 · **Branch** `claude/research-pipeline-completion-2026-09-03`

<!-- HOOK:BLOCKED Awaiting the SUPERVISED BENCHMARK SESSION (owner-driven, 2026-09-05). Everything is built + tested (31 slices). The plan now waits on a real run the owner runs with me: (1) a GATHER run to fetch pages, then (2) the BENCHMARK analyze run (POST /analyze {benchmark:true}, no cost cap, 30-60s/page) which reports benchmark_usd_per_page = total cost / total pages; the owner sets ANALYSIS_RATE_USD_PER_PAGE to it. See the "Benchmark session runbook" section below. This needs the branch deployed (worker rebuild + app deploy / merge to main — owner's call) and the funded TexasFile wallet. After the benchmark: the two live-wiring slices (selections->acquisition feed; estimate-and-warn into the purchase path), verified against that run. Remove this marker when the session is scheduled/underway to resume the loop. -->


## CONSOLIDATED STATUS + REMAINING WIRING — owner review 2026-09-05 (evening)

Every request across the whole effort, and where each stands. The two things the owner is emphasizing
now — **TexasFile actually wired** and **the user setting what to search for** — are the W-slices.

### BUILT + LIVE (working on main, deployed)
- Two-pipeline split; TexasFile purchase PATH (login→search→purchase API→file to Review, G1) — it
  works, but is only exercised when the pipeline decides to buy and a doc isn't free.
- Two metered budgets model (TexasFile min $10 / other min $2, B2.1); 25-min gather cap (B2.3); hard
  budget + duration watchdogs; no-AI-in-gather gate (G6).
- Analyze run with its own cost cap (R1/R3); fixed $/page estimator + quote endpoint + per-file
  "Analyze this" (E1/E2/E3); benchmark calibration mode (BM1).
- Persistent-zoom document viewer (U3); TexasFile cost disclosure in the re-run dialog (U2).

### BUILT but NOT WIRED into the live run (the gaps the owner caught)
- **The "what to find" checklist (S1/S2/S3)** exists and maps to wants — BUT it lives only in the
  **re-run dialog**, is NOT in the **create-project / run-start** flow, and nothing sends
  `gatherSelections` or `phase:'gather'` to a run. So it does not yet drive what is searched.
- **`selectionsToWants` (S2)** and **`gather-cost-estimate` (B2.2)** are pure + tested but have no
  live caller — they are allowlisted as staged. The run still buys the OLD discrepancy-driven way.
- **The two budgets are not separately enforced live** — the purchase orchestrator uses one
  `config.budget`; there is no dedicated TexasFile allocation coming from the UI.

### STILL TO BUILD — the live wiring (W-slices, now the priority)
- **W1 — Run-start UI: search parameters + dedicated TexasFile budget.** Put the checklist
  (Everything / All Plats / All Deeds / Most-recent plat / Most-recent deed / easement / maps —
  and any combination) + a **dedicated TexasFile budget** ($10 default, raisable) + the other-sources
  budget into the **create-project modal AND the re-run dialog**, and SEND `gatherSelections`,
  `phase:'gather'`, and the two budgets with the run.
- **W2 — Selection → acquisition feed (TexasFile-first).** Wire `selectionsToWants` into the live
  purchase/acquisition path so the checklist DRIVES what is fetched: for each selected item, try free
  first, then **buy from TexasFile within the dedicated budget**, plats/drawings + most-recent deeds
  first. This is the "actually go to TexasFile and get the plat/recent deed" behavior.
- **W3 — Two-budget enforcement + estimate-and-warn.** Enforce the TexasFile ($10) and other ($2)
  budgets independently in the run; before spending, estimate the selection's cost and warn if over,
  offering proceed-within-cap / raise-to-estimate (B2.2 wired in).
- **W4 — Plat/drawing from TexasFile.** Make the "most-recent plat/drawing" want actually search
  TexasFile (by subdivision + book/vol/page) and buy it — the document this benchmark run could not
  produce from free Bell sources.
- **BM/proof — the benchmark session** (in progress): finish the current free gather run, note the
  gather spend (~$0, free Bell), run the uncapped benchmark analyze for the $/page rate, set
  `ANALYSIS_RATE_USD_PER_PAGE`. Then a TexasFile-budget run to prove W1–W4 and produce a real plat.

---

This plan is driven by the stop-hook slice loop (`.claude/hooks/continue-until-planning-done.sh`).
Ship the smallest meaningful slice, typecheck + lint + test, commit, push, annotate the slice with
its completion note, and move this doc to `completed/` only when every action item is shipped or
explicitly deferred with a one-line reason. **Every slice starts by reading the live code it
touches** — this repo's dominant defect is "authored but not wired," so each slice ends by asserting
a real caller, not just that the new code imports its helpers.

**Standing constraints (do not violate):**
- Ask the owner before every merge to `main`; one approval never carries to the next.
- Run `npm run build` (app) before any merge.
- NEVER rebuild the worker while a run is in flight — it kills the run. Rebuild:
  `BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose up -d --build worker`, verify
  `buildSha` on `localhost:3100/healthz`.
- Worker runs in Docker on netcup `root@152.53.48.240`, repo at `/opt/starr`.

---

## The owner's request, in their words (2026-09-05)

> "for the TexasFile, the docs that we need the most are any drawings or plats of the property that
> can be found. Then I also want to grab any of the most recent deeds with bearings and calls and
> stuff on them. I also want to grab the plats/drawings and most recent deeds for the adjoiner
> properties too. Once we have those, we should not use texasfile anymore. We should then move
> straight to the county website to find any available files and record them."

> "I want it so that this is just the gathering information phase. This will just gather the files,
> but we will not actually have AI analyze them yet. So the entire budget will go towards just
> finding and purchasing files and capturing images and stuff."

> "Then, the user can review all of the documents themselves. There will be an option in the review
> section to then run an AI review, and that will have it's own seperate cost limit that the user
> can set. This will make it so that OCR and any other tools and methods will be used to evaluate
> all of the images and files ... to extract ... bearings and distances and information and build
> summaries and note anything that is of interest."

> "So now we are talking about two pipeline runs. One is just for gathering the docs and images. The
> other is for actually reviewing and analyzing everything and building the summaries and stuff.
> Please refactor everything to use this new system. Rebuild the UI and reformat it and style it to
> work perfectly with this new system."

> "Make sure we are taking into account the cost budget for each texasfile purchase."

> "3/4 of the budget is alloted to retrieving files on TexasFile, and the other 1/4 is used for
> retreiving files from other sites. The minimum run cost should be $7."

> (earlier, still in force) full-size render on open in the Review viewer, with zoom that PERSISTS
> across next/previous page navigation and changes only on manual zoom.

---

## What this changes

The run is currently one pass: research → (paid purchase) → OCR/vision analysis → reconcile →
summary, with analysis auto-running. **This splits it into two independent runs:**

| | **GATHER run** | **REVIEW/ANALYZE run** |
|---|---|---|
| Purpose | find, buy, capture files/images | OCR + extract + summarize the gathered files |
| AI analysis | **none** — budget is 100% acquisition | **all of it** — OCR, vision, summaries |
| Budget | one cap, min **$7**; **¾ TexasFile / ¼ other sites** | a **separate** cap the user sets in Review |
| Trigger | user starts it from Configure | user clicks "Run AI Review" in Review |
| Output | `research_documents` rows + images for Review | extracted data, summaries, flags on those docs |

The earlier "auto-run AI analysis every run" decision is **superseded** — see memory
`project_two_pipeline_gather_then_review`.

---

## Grounding — what already exists (read before building)

- `worker/src/services/texasfile-buy.ts` — **built + unit-tested 2026-09-05**, compiles clean. The
  working TexasFile purchase module (login modal → search by name / book-vol-page → purchase API →
  download page images as base64). Its pure helpers are pinned by
  `worker/src/__tests__/texasfile-buy-helpers.test.ts` (7 tests). **Zero callers yet — wiring it in
  is slice G1.**
- `worker/src/services/document-purchase-orchestrator.ts` — the paid dispatch (`executePurchases`).
  Held-index + `findOwned` dedupe, `recordPurchase` ledger, per-vendor branch at ~`:384` that still
  calls the BROKEN old `TexasFilePurchaseAdapter`. Invoked from `POST /research/purchase`
  (`worker/src/index.ts:4803`).
- `worker/src/services/purchase-ledger.ts` — `findOwned(countyFips, instrument)`,
  `recordPurchase(PurchaseRecord)` (writes `research_document_purchases`, calls `notePaidPages` +
  `recordUsage({eventType:'document_purchase', costUsd})`). Cross-vendor library, `0` rows today.
- `worker/src/services/artifact-uploader.ts` — `uploadDocumentIncremental(supabase, projectId,
  pages: ArtifactPageImage[])` uploads page PNGs to the `research-documents` bucket and inserts a
  `research_documents` row. This is what makes a doc appear in Review. The purchase path does NOT
  currently call it (old adapter saved to `/tmp` only — a second reason nothing reached Review).
- `worker/src/infra/run-budget.ts` — `limitsFor`, `checkBudget`, `notePaidPages`, `spendForRun`,
  `maxCostUsd` clamp (`MAX_COST_CEILING_USD`). `worker/src/infra/usage.ts` — `recordUsage`.
- `worker/src/research/run-settings.ts` — `RunSettings { mode:'free'|'paid', maxCostUsd,
  allowPaidDocuments }`; `worker/src/research/purchase-gate.ts` — `resolveEffectiveSettings` /
  `decidePurchase`.
- Adjoiner extraction already exists (memory `project_research_pipeline_completion`) — the gather
  run reuses whatever identifies adjoiner parcels to build its acquisition list.
- App UI under `app/admin/research/` (`ResearchPortal.css`, `pipeline/`, `library/`, `[projectId]/`).
  The Review-stage viewer request is still open.

---

## 2026-09-05 (evening) — the owner's refined spec (SUPERSEDES the budget + want-list model below)

The owner extended the design after the core shipped. Decisions confirmed via Q&A. This section is
the current source of truth; earlier budget/want-list notes below are kept for history but the specs
here win where they differ. New work is **Phase S** (selection), **Phase B2** (two-budget rewrite),
**Phase E** (the analysis estimator), and the **25-min gather cap**.

**S — "What to find" selector (Configure).** The user chooses which items to gather from a checklist:
*Most Recent Deed · Most Recent Easement · Most Recent Plat · Google Map View · GIS overhead
(satellite) · GIS parcel map · All Deeds · All Plats · All Files.* A **"research adjoining properties"
toggle** reveals a duplicate checklist for adjoiners. **Defaults: adjoiners OFF, all-info/"All Files"
ON, TexasFile ON.** Saved as run settings; these drive the gather want-list (replacing the
auto-derived one, G3). Google/GIS items are free captures (screenshots/tiles), not purchases.

**B2 — Two separate METERED budgets (replaces the refundable-$10 earmark, G2).** Confirmed: TexasFile
is metered ($1/page), the budget is only the ceiling.
- **TexasFile budget** (when on): min **$10**, raisable. Pay only for pages actually bought.
- **Other-sources budget** (county/GIS/free): min **$2**, raisable.
Tracked independently, real per-item cost. **Over-budget (confirmed):** estimate first and **warn** if
the selection would exceed the cap; then the user chooses (a) proceed within the cap — buy in priority
order (plats/drawings → most-recent deeds → rest) until it runs out — or (b) raise the cap to the
estimate and pay the full estimated price.

**Gather time:** a hard **25-minute** wall clock for the gather run (search/purchase/download only).

**E — Analysis estimator + per-file analysis (Review).** Confirmed: **fixed standardized $/page quote.**
A dedicated processor counts total pages across all gathered files and shows a **firm total cost +
estimated time** for a full analysis, at a set $/page rate (charged regardless of real token cost).
The user can run the **full analysis** (total quote) or analyze **one file at a time** — every file in
Review carries an **"Analyze this" button showing that file's price** (its pages × the rate).

---

## Cost-management strategy — the determination (owner asked 2026-09-05: "get everything we need from TexasFile but save as much money as possible using other sites")

Synthesizing every cost idea the owner gave (hard cost cap; cost-primary; two pipelines; min $7;
per-purchase checks; the refundable $10 TexasFile add-on; "TexasFile first" vs "save money with
other sites"), the cost-optimal design is **free-first, TexasFile gap-fills, capped + refundable:**

1. **Build the want-list** — the documents we actually need: subject plats/drawings + most-recent
   deed(s), and each adjoiner's plats/drawings + most-recent deed(s). (G3)
2. **Free pass first** — try to satisfy each want from **free** county sources / capture at $0. The
   county website, free adapters, and image capture cost nothing, so anything they yield is money
   saved. (G5, run *before* spending TexasFile money.)
3. **TexasFile gap-fill** — only for wants the free pass could NOT get, and only if the owner toggled
   TexasFile on, buy from TexasFile, **priority-ordered** (plats/drawings first, then most-recent
   deeds), each purchase gated to stay within the earmarked **$10** (real wallet spend ≤ $10). Stop
   as soon as the want-list is satisfied. (G1 buy + G2 cap + G4 stop.)
4. **Settle** — if TexasFile obtained ≥1 file, the flat **$10 is charged**; if it obtained nothing,
   the **$10 is refunded**. The base budget (floor **$7**) covers the free pass's incidental costs.

This reconciles "TexasFile first" with "save money": TexasFile is still the reliable source for the
critical plats/deeds (the county plat repo is IP-blocked), but we spend its money **only on the gaps
free sources leave**, never on a document we could capture for nothing. The earlier ¾/¼ split is
retired in favor of this — the $10 earmark is the TexasFile budget, and free-first is the saver.

---

## Hard stops — budget AND duration (owner asked 2026-09-05: "really make sure")

**Verified + hardened 2026-09-05.** Both hard stops exist at the run level and are pinned by tests;
this section is the audit trail so nobody loosens them.

- **Duration** — `limitsFor` ignores the requested minutes and returns a fixed **60-minute** wall
  clock (env can only *lower* it; a 90-min env is clamped to 60). A `setTimeout` watchdog fires a
  `BudgetAbort` at `maxWallClockMs + 30s` grace; the tail honours the abort. Pinned by
  `run-budget.test.ts` + `run-cannot-outlive-its-ceiling.test.ts`.
- **Cost** — `maxCostUsd` is clamped to `MAX_COST_CEILING_USD = 10` (a requested 0 survives as
  "free only"). A cost watchdog polls `spendForRun` every **500 ms** and fires the same `BudgetAbort`
  the instant spend crosses the cap, so overshoot ≤ one in-flight call. TexasFile spend flows through
  `recordUsage('document_purchase')`, so it counts toward this cap; each buy is additionally gated by
  the $10 earmark (G2).
- **The gather loop now honours the signal (this fix).** `runGatherAcquisition` takes the run's
  `AbortSignal` and, before each want *and* before each paid buy, stops and marks the rest `stopped`
  when it is aborted — so both watchdogs halt a gather run to within one in-flight want, not a whole
  want-list. Pinned by `gather-orchestrator.test.ts`.
- **OPEN (entrypoint/U2):** the run cost cap ($10 ceiling) vs. the gather model (base up to $10 + a
  $10 TexasFile earmark = up to ~$20). The gather-run entrypoint must set the run's `maxCostUsd` to
  `gatherBudget.maxTotal` and the ceiling must accommodate base + addon, or a legitimate base+$10 run
  is hard-stopped early. Tracked with U2.

---

## Architecture finding (2026-09-05): TexasFile-in-gather is already LIVE via the existing pipeline

Verified while wiring the gather dispatch: the `DocumentPurchaseOrchestrator` is **auto-invoked
inside the main run pipeline** (`index.ts` ~2194), gated by the purchase-permission gate and bounded
by the run's ceiling — not only by the separate `POST /research/purchase` endpoint. So the full
gather-purchase chain is already wired and test-asserted end to end:

> main pipeline → purchase gate → `DocumentPurchaseOrchestrator.executePurchases` → TexasFile adapter
> → `buyDocument` → filed to `research_documents` for Review

`the-run-can-buy-documents.test.ts` pins the pipeline→orchestrator half; `texasfile-buy-is-wired.test.ts`
pins the orchestrator→`buyDocument` half. With **G1** (buyDocument + file-to-Review), **G2** (the $10
refundable earmark + per-buy gating), and **G6** (no AI), a run with paid documents on **already**
scrapes free county sources, buys the recommended documents from TexasFile within the earmark, files
everything for Review, and runs zero AI — i.e. it is a working Gather run.

**What this means for `runGatherPipeline` (the want-list engine, G3–G7):** it is an **enhancement, not
a blocker.** The existing path buys what the discrepancy-driven `PurchaseRecommender` recommends; the
want-list engine additionally *guarantees* the subject's + adjoiners' plats and most-recent deeds are
sought whether or not a discrepancy flags them. Wiring it in (replacing or augmenting the recommender
feed) is a live-tested enhancement slice, deliberately staged (recorded in the orphan allowlist), not
required for TexasFile-in-gather to work.

---

## Phase G — the Gather pipeline (backend)

### G1 — Wire `buyDocument` into the TexasFile purchase path, filing to Review
Replace the broken `TexasFilePurchaseAdapter` dispatch with `buyDocument` from `texasfile-buy.ts`.
On success: build `ArtifactPageImage[]` from the returned base64 pages and call
`uploadDocumentIncremental` so the doc lands in `research_documents` for Review; return a
`DocumentPurchaseResult` so the orchestrator's existing dedupe + `recordPurchase` ledger + budget
recording all still fire. Widen the adapter/dispatch to pass the recommendation's `book`/`page`
(and any grantor/grantee name) through — TexasFile's instrument-number search returns empty, so
book/vol/page + name are the reliable keys. **End with a caller-asserting test** that the texasfile
branch invokes `buyDocument` and files via `uploadDocumentIncremental`.

> **SHIPPED 2026-09-05.** `texasfile-purchase-adapter.ts` rewritten as a thin seam over
> `buyDocument`: it writes pages to `outputDir` (the `downloadedImages` contract) AND files them into
> `research_documents` via `uploadDocumentIncremental` so they appear in Review — the step the old
> adapter never did. `initSession`/`destroySession` are now no-ops (buyDocument self-manages its
> browser). The orchestrator threads `{ book, page }` into all four `purchaseDocument` call sites.
> Guarded by `texasfile-buy-is-wired.test.ts` (caller-asserting) + `texasfile-buy-helpers.test.ts`.
> Worker tsc green; 49 purchase/texasfile tests pass. Per-purchase budget `maxUsd` and the ¾/¼ split
> are G2.

### G2 — Budget model: base (min $7) + refundable $10 TexasFile add-on
**Revised 2026-09-05 (replaces the earlier ¾/¼ split).** In Configure the user sets a **maximum base
budget (floor $7)** for general gathering, and toggles **TexasFile on/off**. Turning TexasFile on
adds a **flat $10 upcharge earmarked for TexasFile**. That $10 is **conditional**: if TexasFile finds
NO files it is **not spent and is reported as refunded**; if any files are found the **$10 is charged**
(kept, added to the cost). Backend work for this slice:
- a pure `gather-budget.ts`: `MIN_GATHER_BUDGET_USD=7`, `TEXASFILE_ADDON_USD=10`; `gatherBudget({
  baseCap, texasfileOn })` → `{ baseCap≥7, texasfileAddon, maxTotal }`; `settleTexasfileAddon({
  filesFound, addon })` → `{ charged, refunded }`. Unit-tested.
- wire into the purchase orchestrator: gate every TexasFile buy against the **$10 add-on cap**
  (texasFileSpend + docCost ≤ 10), pass `maxUsd` to `buyDocument` per document ($1/page), track
  whether any TexasFile file was obtained, and surface `texasfileAddonCharged`/`texasfileAddonRefunded`
  in the purchase report. Kofile/other paid vendors still gate on the base budget.
The refund is *represented* in the UI (U-phase); the backend just reports charged-vs-refunded.

> **SHIPPED 2026-09-05.** `research/gather-budget.ts` (pure): `MIN_GATHER_BUDGET_USD=7`,
> `TEXASFILE_ADDON_USD=10`, `gatherBudget`, `remainingTexasfileAllowance`, `mayBuyFromTexasFile`,
> `settleTexasfileAddon`. Wired into the purchase orchestrator: all TexasFile buys route through one
> gated `buyFromTexasFile()` closure that refuses a doc over the remaining $10, passes `maxUsd` to
> `buyDocument`, and books spend + file-count; the report's billing summary now carries
> `texasfileAddonUsd/FilesFound/AddonCharged/AddonRefunded/WalletSpend`, and `settleTexasfileAddon`
> charges $10 if any file was found else refunds it. `gather-budget.test.ts` (10) +
> `texasfile-buy-is-wired.test.ts` updated; worker tsc green, 357 purchase/texasfile tests pass.
> **NOTE:** the orchestrator's base budget still reads `config.budget` (default 25) from the purchase
> request; making Configure send the user's base cap + TexasFile toggle is a U-phase slice (U2), and
> reconciling the base floor with the run-level `MAX_COST_CEILING_USD` is tracked there.

### G3 — Acquisition priority list (subject + adjoiners)
Build the ordered want-list the gather run works through:
1. subject property plats / drawings,
2. subject most-recent deed(s) with bearings & calls,
3. each adjoiner's plats / drawings,
4. each adjoiner's most-recent deed(s).
Derive search keys (book/page, name, subdivision/lot) from the parcel + adjoiner data already
extracted. Most-recent-deed selection = newest recording date. Test the ordering + key derivation.

> **SHIPPED 2026-09-05.** `research/acquisition-wantlist.ts` (pure): `buildWantList({ subject,
> adjoiners })` → an ordered `Want[]` — subject plat, subject most-recent deed, then all adjoiner
> plats, then all adjoiner deeds (plats outrank deeds globally, subject before adjoiners). Keys come
> from a known plat/deed citation when present, else `parseSubdivisionLot(legalDescription)` +
> owner name; `mostRecentDeed` picks the newest deed by ISO/US date. `acquisition-wantlist.test.ts`
> (12) covers ordering, key derivation, and the deed pick. Worker tsc green. **Consumed by G5 (free
> pass) + G4 (TexasFile gap-fill) — the next slices; the caller-assertion lands with G4/G5 when the
> gather orchestrator that walks this list is built.**

### G5 — Free pass FIRST: county-website + free-adapter capture (no purchase)
**Runs before any TexasFile spend.** For every want on the G3 list, try the **free** sources — county
website, free clerk adapters, image capture — and file whatever they yield into `research_documents`
for Review at $0. Mark each want satisfied-free vs still-missing. This is the money-saver: TexasFile
only ever sees the gaps this pass leaves. No AI.

> **Orchestration core SHIPPED 2026-09-05** (shared by G5+G4). `research/gather-orchestrator.ts`:
> `runGatherAcquisition({ subject, adjoiners, budget, resolveFree, buyFromTexasFile })` builds the
> want-list (this is G3's `buildWantList` caller), walks it **free-first**, and only falls through to
> TexasFile where free found nothing. The `resolveFree` and `buyFromTexasFile` side effects are
> **injected**, so the free-first rule, the $10 gate, the per-buy `maxUsd`, the stop-when-spent, and
> the refund settlement are all unit-tested with fakes (`gather-orchestrator.test.ts`, 6). Worker tsc
> green. **REMAINING for G5:** the real `resolveFree` — county-website / free-adapter capture that
> files what it finds (detail below).

### G4 — TexasFile gap-fill, then stop
Only for wants the free pass (G5) did NOT satisfy, and only if TexasFile is toggled on, buy from
TexasFile in priority order (plats/drawings, then most-recent deeds), each buy gated by the $10
add-on cap (G2). Stop issuing TexasFile purchases as soon as the want-list is satisfied or the $10 is
spent. Record charged-vs-refunded (G2 settlement). Guard with a test that free-satisfied wants are
never bought from TexasFile and that TexasFile is not queried past the stop condition.

> **SHIPPED 2026-09-05** as the orchestration core above. `runGatherAcquisition` never asks TexasFile
> for a free-satisfied want (tested), stops once the $10 is spent (`skipped_budget`), passes the
> remaining allowance as each buy's `maxUsd`, and settles charged-vs-refunded.
>
> **Real buyer SHIPPED 2026-09-05.** `research/texasfile-want-buyer.ts`: `makeTexasFileWantBuyer({
> county, projectId })` returns the `buyFromTexasFile` effect — `purchaseArgsForWant` maps a Want's
> keys onto the adapter's `purchaseDocument` (book→volume, name, `maxUsd`), and `buyResultFromPurchase`
> maps the result back (`purchased`→bought+cost; `budget_exceeded`→budget skip; else miss). Adapter
> call injected for tests (`texasfile-want-buyer.test.ts`, 6). **REMAINING:** the gather-run
> entrypoint that supplies this buyer + the real `resolveFree` (with G6).

### G6 — Make the Gather run carry NO AI analysis
Gate every analyzer/OCR/vision/summary step out of the gather run: the whole budget is acquisition.
The run ends when the want-list is done or the budget is reached, leaving documents/images filed and
unanalyzed. Guard with a test asserting the gather path calls no analysis entrypoint.

> **Gate SHIPPED 2026-09-05.** `run-settings.ts` gains `phase?: 'gather' | 'analyze'` (parsed,
> clamped, in `RUN_SETTING_KEYS`) plus two single-source gates: `shouldRunAnalysis(settings)` (false
> for a gather run, true for analyze/legacy) and `shouldGatherDocuments(settings)` (false for an
> analyze run). The auto-analysis trigger in the run-finish tail now fires
> `triggerAppAnalysis(projectId, { allow: shouldRunAnalysis(runSettings) })`, so a **gather run runs
> no AI** — `triggerAppAnalysis`'s `allow:false` path returns "not auto-run". `run-phase-gates.test.ts`
> (6) + updated `trigger-app-analysis` test; worker tsc green, 632 index-reading tests pass.
> **REMAINING:** the gather-run entrypoint uses `shouldGatherDocuments`/`shouldRunAnalysis` to run
> acquisition-only (it walks the want-list via `runGatherAcquisition` and never calls the inline
> analyzers) — completes with the entrypoint slice.

> **Worker tail gated too, 2026-09-05.** G6 first gated only the app-side analysis trigger, but the
> worker's own run tail reads documents with adaptive-vision OCR (the biggest spender) and summarises
> them — analysis that must not run in a gather run. Both are now gated by
> `shouldRunAnalysis(runSettings)`: `mayRead` returns false for a gather run (so the reading pass
> reads nothing) and the summary sweep is skipped, while imagery/drawing **capture** still runs
> (gathering, not analysis). So a gather run files documents and runs **zero AI** end-to-end.
> `gather-run-skips-reading.test.ts` (3); worker tsc green.

---

### G7 — The Gather-run entrypoint (composition)
Tie the pieces into one runnable Gather pass.

> **SHIPPED 2026-09-05.** `research/run-gather-pipeline.ts`: `runGatherPipeline({ projectId, county,
> subject, adjoiners, settings, signal, resolveFree, buyFromTexasFile? })` composes the whole Gather
> run — `gatherBudgetForSettings` (base = the run's cost cap floored at $7 + a $10 earmark when
> `texasfileEnabledFor` says paid is permitted), the want-list, `runGatherAcquisition` (free-first +
> the $10 gate + hard-stop signal), and the real `makeTexasFileWantBuyer` by default. Runs **no AI**,
> and refuses to gather for an `analyze` run (`shouldGatherDocuments` guard). This is the concrete
> caller for `runGatherAcquisition`, the TexasFile buyer, the budget model and the want-list.
> `run-gather-pipeline.test.ts` (9). Worker tsc green. **REMAINING (ENHANCEMENT, not required):** see
> the Architecture finding above — TexasFile-in-gather is already live via the main pipeline's
> auto-purchase (G1/G2/G6), locked by `texasfile-gather-chain-is-live.test.ts`. Wiring this want-list
> engine to feed/augment the recommender (guaranteeing the subject/adjoiner plat+deed priority) is a
> live-tested enhancement, plus setting the run's `maxCostUsd` to `budget.maxTotal` so the watchdog
> admits base + earmark (the Hard-stops OPEN item — needs the owner's max-run-spend decision).

---

## Phase R — the Review/Analyze pipeline (backend)

### R1 — A separate "analyze" run with its own cost cap
Add an analyze run kind (distinct from gather) that the user triggers from Review with a cost limit
they set. It reads the already-gathered `research_documents` for the project — it does not gather or
buy. Its budget is independent of the gather run's spend. Reuse `run-budget`/`usage` keyed to this
run. Test the settings/kind plumbing (caller-asserting).

> **SHIPPED 2026-09-05.** The app-side analysis (`lib/research/analysis.service.ts`, which reads the
> already-gathered `research_documents` and does not gather) now honours its OWN cost cap:
> `AnalysisConfig.maxCostUsd`, read as `analyzeCostCapUsd`. After each document, the run estimates its
> spend from the token accumulator via `estimateAnalysisCostUsd` (priced at the DEAREST model, so the
> estimate is an upper bound and the real spend never exceeds the cap) and **breaks the document loop**
> when it reaches the cap, logging "stopped at the $X cost limit you set". The analyze route accepts +
> clamps `maxCostUsd` (0–100) from the body — this is the separate cap the Review "Run AI Review"
> action sends. `analyze-cost-cap.test.ts` (6); app tsc clean. It already has a 30-min analysis
> watchdog, so both its stops (cost + duration) are covered. Independent of the gather run's spend
> (different run, its own token accumulator). **REMAINING for R2/R3:** the Review "Run AI Review"
> control (U4) sends this cap; progress/cost reporting against it is R3.

### R2 — OCR + extraction + summaries over gathered docs
Run OCR + the existing vision/extraction over every gathered image/file: bearings, distances, calls,
subdivision/lot, adjoiner ids/addresses; build the in-depth property summary with document-link
references; flag anything of interest and anything that looks unrelated/incorrect. This is the
existing analysis stack, now invoked only in the analyze run and bounded by R1's cap.

> **SHIPPED 2026-09-05 (existing stack, now correctly scoped).** `analyzeProject` already reads the
> project's gathered `research_documents` and runs the full analysis over them: vision/OCR
> (`callVision` + `extractFromDocument` with `ocrResult`), category extraction (bearings/distances,
> monuments, curves, POB, etc.), and a 3-pass `runFinalCoherenceReview` producing the executive
> summary + coherence/consistency flags. This slice's work was making it a SEPARATE run rather than a
> monolithic tail: G6 gates it out of a gather run (`shouldRunAnalysis`), and R1 bounds it with its
> own cost cap. No new extraction code was needed — the stack was already there; the split is what
> makes it "the analyze run." Nothing deferred.

### R3 — Analyze-run progress + cost reporting
Report the analyze run's progress and cost against its own cap (its own progress bar / status), the
same way the gather run reports against its cap. Two runs, two independent cost views.

> **Backend SHIPPED 2026-09-05.** `analyzeProject` now writes `estimated_cost_usd` (upper-bound
> estimate from the token accumulator) and `cost_cap_usd` into `analysis_metadata` — at completion,
> at the cap-break (with `stopped_at_cost_cap: true`), and per-document while a cap is set (folded
> into the existing per-doc persist, no extra write). The analysis status endpoint returns
> `analysis_metadata`, so the UI can render a cost bar for the analyze run against its own cap.
> `analyze-cost-cap.test.ts` extended; app tsc clean. **REMAINING for R3:** the UI cost bar that reads
> these fields — folds into U1/U4 (the two-run layout + "Run AI Review").

---

## Phase U — the UI rebuild

### U1 — Two-run model in the portal
Reformat the research portal around Gather vs Analyze: a project shows its gather run (files found /
purchased / captured, cost vs the ¾/¼ split) and, separately, its analyze runs (summaries, cost vs
the user-set cap). Restyle to fit — `app/admin/research/`, `ResearchPortal.css`.

### U2 — Configure stage → gather budget ($7 min)
The Configure stage sets the gather cap (enforced ≥ $7) and starts the gather run. Show the TexasFile
toggle (+$10 earmark, refunded if nothing found) so the user sees where the money goes.

> **Settings mirror groundwork SHIPPED 2026-09-05.** The client `RunSettingsInput`
> (`useRunState.ts`) gained `phase?: 'gather' | 'analyze'`, so the two-run model can flow from
> Configure to the worker (`normaliseRunSettings` already reads it, G6). `run-settings-mirror.test.ts`
> asserts the app mirror carries every worker `RUN_SETTING_KEYS` entry — closing the client/worker
> drift gap the worker's run-settings comment names, so a future setting can't be added on one side
> only. **REMAINING for U2:** the Configure form controls — a base-cap input (≥$7) and an explicit
> TexasFile toggle showing the +$10 refundable earmark — plus sending `phase:'gather'` and
> `maxCostUsd = gatherBudget.maxTotal`; UI work best done with browser QA (needs the two-run layout,
> U1).
>
> **TexasFile cost disclosure SHIPPED 2026-09-05.** The paid-documents toggle in `RerunDialog` now
> states the cost model at the control: on adds a flat **$10 earmarked for TexasFile**, spent only on
> gaps free sources can't get, **refunded if TexasFile finds nothing**, charged if it finds anything —
> so the operator sees where the money goes before starting. `rerun-is-editable.test.ts` pins the
> disclosure (19 pass); app tsc clean. Still remaining: the distinct base-cap input + sending
> `phase:'gather'` and `maxCostUsd = gatherBudget.maxTotal` (with U1).

### U3 — Review stage: dedicated document viewer
A full document/page viewer in Review matching the earlier request: **full-size render on open**;
next/previous page navigation; **zoom PERSISTS across page navigation and changes only on manual
zoom.** Renders every gathered image/file/page.

> **Persistent zoom SHIPPED 2026-09-05.** `SourceDocumentViewer` already renders full-size on open
> (fit-to-window) with page nav; it was *re-fitting on every page change*, discarding the user's zoom.
> Fixed: `lib/viewers/viewer-fit.ts` gains `shouldRefitOnPageChange(zoom, fitZoom)` (re-fit only when
> at fit); the viewer's page-change effect now defers to it, and `onLoad` calls a new `measureFit`
> (updates the Reset target without touching the user's zoom) when not re-fitting. So once the user
> zooms in, next/previous keeps that zoom; it changes only on a manual zoom/Reset. `viewer-fit.test.ts`
> updated (95 pass, incl. the new rule + a caller assertion); app tsc clean. **REMAINING for U3:**
> surfacing this viewer on the gather-review surface is folded into U1's two-run UI (same component).

### U4 — "Run AI Review" in Review, with its own cost-limit input
A control in the Review section that starts the analyze run (Phase R) with a user-set cost limit,
then shows the analyze run's progress/cost and, when done, the extracted data + summaries against
each document.

> **SHIPPED 2026-09-05 (owner browser-QA pending).** `RunAiReviewControl.tsx`: a cost-limit input +
> "Run AI Review" button that POSTs `analyzeRequestBody(maxCost)` (clamped 0–100) to the analyze
> route, which enforces the cap (R1) and reports spend-vs-cap (R3). Mounted in the review stage
> (`page.tsx`, after the nav bar) — the analysis is now a deliberate, separate, operator-started run
> with its own budget, not an auto-tail. `run-ai-review-control.test.ts` (5) pins the cap payload +
> the mount wiring; app tsc clean. **Owner to browser-QA the render/flow.** The live progress/cost bar
> for the running analyze run (reading R3's `analysis_metadata`) folds into U1's two-run layout.

### U5 — Restyle + reflow for the two-phase system
Final consistency pass: labels, states, empty states, and the loading/cost bars all speak the
two-run language (gathering vs analyzing). Drive the browser to verify render before calling it done.

---

## Phase P — proof

### P1 — Tests green + full suite
Unit + caller-asserting tests for G1–G6, R1–R3; run the full worker + app suites before any
cross-cutting merge.

> **SHIPPED 2026-09-05.** Full worker suite green — **2654 passed / 188 files**. The full run caught
> one real thing the targeted runs could not: the orphan guard (`research-modules-are-reachable`)
> flagged `run-gather-pipeline.ts` as built-ahead-of-its-caller — exactly its job. Recorded in
> `KNOWN_UNREACHABLE` with a reason naming the pending HTTP-dispatch slice (to be removed when that
> lands), the sanctioned path for a deliberately-staged module. App-side: all 27 test files touching
> this session's changes (analysis.service, useRunState, viewer-fit, analyze route, run-settings
> mirror, gather modules) pass — **698 tests**. Worker + app tsc green throughout the session.

### P2 — Supervised proof run
A real Gather run on a Bell property that buys the subject's plat + most-recent deed (and an
adjoiner's) from TexasFile, files them into Review, respects the ¾/¼ split and $7 floor, and runs NO
analysis — verified in `research_document_purchases` (first real rows) and the Review viewer. Then a
separate Analyze run on those docs with its own cap. Owner supervises; needs the funded TexasFile
wallet.

---

## Phase S — the "what to find" selector (new spec)

### S1 — Selection schema + defaults (worker + client mirror)
Add a `gatherSelections` shape to `RunSettings` (worker) + `RunSettingsInput` (client mirror, guarded
by run-settings-mirror.test): a set of item keys (`recent_deed`, `recent_easement`, `recent_plat`,
`google_map`, `gis_satellite`, `gis_parcel`, `all_deeds`, `all_plats`, `all_files`) plus
`adjoiners: { enabled: boolean; selections: <same set> }`. Defaults: adjoiners off, `all_files` on,
TexasFile on. Pure normaliser + tests (unknown keys dropped; default when absent).

> **SHIPPED 2026-09-05.** `run-settings.ts`: `GATHER_SELECTION_KEYS` (the 9 item keys),
> `GatherSelections { items, adjoiners:{enabled,items} }`, `DEFAULT_GATHER_SELECTIONS` (all_files, no
> adjoiners), `normaliseGatherSelections` (drops unknown keys, de-dups, undefined when nothing usable),
> `resolveGatherSelections`, and `gatherSelections` in `RUN_SETTING_KEYS`. Client mirror
> (`useRunState.ts`) carries it; the drift guard passes. `gather-selections.test.ts` (7) + mirror.
> Worker + app tsc green. Consumed by S2 (want-list mapping) + S3 (UI).

### S2 — Selections drive the want-list
Map the selections onto the gather want-list: each selected item → a want (with its documentType +
whether it's a paid-TexasFile candidate or a free capture). "All Files/All Deeds/All Plats" expand to
the broad fetch; "Most Recent X" to the single newest. Adjoiner selections repeat per adjoiner. Feed
this into the acquisition path (recommender feed or `runGatherAcquisition`). Unit-test the mapping.

> **Mapping SHIPPED 2026-09-05.** `research/selection-wants.ts`: `selectionsToWants(selections)` →
> `SelectionWant[]` — each carries `documentType`, `scope` (recent/all/single), and **`paid`** (true =
> TexasFile candidate → TexasFile budget; false = free map/GIS capture → other budget), plus
> `captureKind` for maps. `all_files` expands to every doc type at full scope + all three captures,
> de-duped, in the owner's priority order (plats/visuals → deeds → easements); adjoiner selections
> repeat with `target:'adjoiner'`. `paidWants`/`captureWants` split for the two-budget accounting.
> `selection-wants.test.ts` (7); worker tsc green. **REMAINING for S2:** feeding these into the live
> acquisition path (recommender feed / `runGatherAcquisition`) — a live-integration slice; the module
> is allowlisted with the staged gather cluster until then.

### S3 — Configure UI: the checklist + adjoiner section
Render the checklist in Configure with the defaults; the "research adjoining properties" toggle
reveals the duplicate adjoiner checklist. Save into the run settings the pipeline sends. Source-assert
the wiring; owner browser-QAs the render.

> **SHIPPED 2026-09-05 (owner browser-QA pending).** `GatherSelectionsField.tsx`: the grouped
> checklist (Documents: all_files, plats, deeds, easement; Maps & imagery: google/GIS) + a "research
> adjoining properties" toggle that reveals a duplicate adjoiner checklist. Pure `toggleKey` +
> `SELECTION_OPTIONS` + `DEFAULT_GATHER_SELECTIONS_VALUE` (all_files, no adjoiners). Wired into
> `RerunDialog`: form state seeded with the default, rendered after the paid-documents toggle, and
> **sent as `gatherSelections`** in the run settings the pipeline receives (which `normaliseRunSettings`
> reads, S1). `gather-selections-field.test.ts` (5, options + toggle + dialog wiring); app tsc clean.
> Owner to browser-QA the render.

## Phase B2 — two metered budgets (rewrite of G2)

### B2.1 — `gather-budget.ts` → two independent budgets
Replace the single-cap + refundable-$10 earmark with `texasfileBudgetUsd` (min $10) and
`otherBudgetUsd` (min $2), both raisable, both metered. `mayBuyFromTexasFile` gates on the TexasFile
budget's remaining; free/GIS work draws on the other. Remove the flat-fee/refund settlement. Rewrite
gather-budget.test + the orchestrator wiring + the billing-summary fields (spend per budget, not
charged/refunded). Keep it green.

> **SHIPPED 2026-09-05.** `gather-budget.ts` rewritten: `MIN_TEXASFILE_BUDGET_USD=10`,
> `MIN_OTHER_BUDGET_USD=2`; `gatherBudget({ texasfileOn, texasfileBudgetUsd?, otherBudgetUsd? })` →
> `{ texasfileOn, texasfileBudgetUsd (0 off / ≥10 on), otherBudgetUsd (≥2) }`;
> `remainingTexasfileAllowance`/`remainingOtherAllowance`; `mayBuyFromTexasFile` gates on the metered
> TexasFile budget. **Removed** the flat-fee/refund model (`settleTexasfileAddon`, `TEXASFILE_ADDON_USD`,
> `MIN_GATHER_BUDGET_USD`, `AddonSettlement`). The live orchestrator now builds the TexasFile budget
> from `config.budget` and reports **metered** billing (`texasfileBudgetUsd`, `texasfileFilesFound`,
> `texasfileWalletSpend` — no charged/refunded); `PurchaseBillingSummary` updated. The staged gather
> engine (`gather-orchestrator`, `run-gather-pipeline`) + all four affected tests rewritten. Worker tsc
> green; 100 budget/gather/purchase tests pass. **REMAINING for B2:** thread the SEPARATE other-sources
> budget into the free/capture path (today only the TexasFile budget is enforced, in the orchestrator).

### B2.2 — Estimate-and-warn over budget
Before buying, estimate the selected items' cost; if over the relevant cap, return a warn state with
the estimate and the two choices (proceed within cap in priority order / raise to the estimate). Pure
estimator + test; the UI presents the choice (S3/U-phase).

> **Estimator SHIPPED 2026-09-05.** `research/gather-cost-estimate.ts`: `estimateItemCostUsd(type,
> scope, paid)` (typical pages × $1/page; free captures $0) + `assessGatherCost(itemCostsUsd, budget)`
> → `{ estimateUsd, budgetUsd, overBudget, overageUsd, coverableCount, totalCount }` — how much the
> selection would cost, whether it's over, and how many items fit in priority order within the budget.
> Pure (the estimate warns; the real charge is metered). `gather-cost-estimate.test.ts` (6); worker tsc
> green. **REMAINING for B2.2:** the warn flow itself — returning the assessment to the operator before
> a gather run buys and honouring their choice (proceed-within-cap / raise-to-estimate); a
> UI + endpoint slice (with S3). Estimator allowlisted with the staged cluster until then.

### B2.3 — 25-minute gather wall clock
Set the gather run's `maxWallClockMs` to 25 min (the watchdog already enforces a wall clock; this
sets the value for a gather run). Test the limit.

> **SHIPPED 2026-09-05.** `limitsFor` now takes `phase`; `GATHER_MAX_MINUTES = 25` caps a gather run's
> `maxWallClockMs` at 25 min (never above the general one-hour clock, so a lowered `RUN_MAX_MINUTES`
> still wins). The index.ts caller passes `runSettings.phase`, so the existing wall-clock watchdog
> fires the gather run's hard stop at 25 min. `run-budget.test.ts` extended (26 pass); worker tsc green.

## Phase E — the analysis cost estimator (new spec)

### E1 — Page-count + fixed-rate estimator (pure)
`analysis-estimate.ts`: a set `$/page` rate constant; `estimateAnalysis(pages)` → `{ costUsd,
etaSeconds }`; `estimateForDocuments(docs)` sums pages across files. Pure + fully unit-tested. This is
the "standardized cost" processor.

> **SHIPPED 2026-09-05.** `lib/research/analysis-estimate.ts`: `ANALYSIS_RATE_USD_PER_PAGE` (the one
> business knob, default **$0.25/page** — owner to confirm the final rate), `estimateAnalysis(pages)`
> → `{ pages, costUsd, etaSeconds }`, `pageCountOf` (missing/0 → 1 page), `estimateForDocuments(docs)`
> summing `page_count`, plus `formatEta`/`formatUsd` label helpers. Pure so the total quote, each
> file's price, and the per-file button's cap all come from one place. `analysis-estimate.test.ts`
> (8). **Rate is a placeholder** pending the owner's number. Consumed by E2 (endpoints) + E3 (UI).

### E2 — Per-project + per-file estimate endpoints
An endpoint (or fields on the existing status) that returns the total-analysis quote (sum of all
gathered files' pages × rate) and each file's own quote, reading `page_count` off `research_documents`.
Caller-asserted.

> **SHIPPED 2026-09-05.** `GET /api/admin/research/[projectId]/analysis-estimate`: reads
> `research_documents` (`page_count`, label, type), returns `ratePerPageUsd`, a `total`
> ({pages, costUsd, etaSeconds}) and a `perFile[]` breakdown (each with `documentId`, `pages`,
> `costUsd`, `etaSeconds`) via the shared E1 estimator. This is E1's real caller — its orphan-allowlist
> entry was removed (now genuinely wired). `analysis-estimate-endpoint.test.ts` (4, caller-asserted);
> app tsc green. Consumed by E3 (per-file "Analyze this" price + the full-analysis quote in Review).

### E3 — Per-file "Analyze this" button + price; full-analysis quote in Review
Each file row in Review shows its price and an "Analyze this" button that POSTs a single-document
analyze with that file's cost as the cap; the Review header shows the full-analysis total quote next to
"Run AI Review" (U4). Single-doc analyze path in `analyzeProject` (a `documentId` filter). Owner
browser-QAs.

> **Single-document backend (E3a) SHIPPED 2026-09-05.** `AnalysisConfig.documentId`; `analyzeProject`
> narrows to that one document (`onlyDocumentId`), erroring clearly if it isn't available; the analyze
> route accepts `documentId` from the body. So a per-file "Analyze this" can POST `{ documentId,
> maxCostUsd }` and analyse just that file at its E2-quoted price. `analyze-cost-cap.test.ts` extended
> (9); app tsc green.
>
> **E3b UI SHIPPED 2026-09-05 (owner browser-QA pending).** `AnalysisEstimatePanel.tsx`: fetches the
> E2 estimate, shows the **full-analysis total** ($X for N pages, ETA, $/page) and a **per-file list**
> where each file carries its price and an **"Analyze this"** button that POSTs `analyzeFileBody(id,
> price)` → the E3a single-document analyze at that file's quoted cap. Mounted in the review stage
> below "Run AI Review". `analysis-estimate-panel.test.ts` (4, payload + mount wiring); app tsc clean.
> Owner to browser-QA the render/flow.

## Benchmark session runbook (owner + Claude, supervised)

The one-off calibration that sets the standardized $/page analysis rate.

### BM1 — Benchmark analyze mode (SHIPPED 2026-09-05)
> `AnalysisConfig.benchmark`; a benchmark analyze run has **NO cost cap** (`analyzeCostCapUsd`
> forced undefined), gives each page up to **60 s** (`BENCHMARK_MS_PER_PAGE`; per-document timeout
> scales to `pageCountOf(doc) × 60 s`), analyses every page, and at the end writes
> `benchmark_total_pages`, `benchmark_cost_usd`, `benchmark_usd_per_page` into `analysis_metadata`
> and logs the rate. `benchmarkResult(docs, cost)` = cost ÷ pages. The analyze route accepts
> `{ benchmark: true }`. `analysis-benchmark.test.ts` (7); app tsc green.

### The session, step by step
1. **Deploy the branch** (owner's call on merge-to-main):
   - Worker (netcup `root@152.53.48.240`): `BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose -f /opt/starr/worker/docker-compose.yml up -d --build worker`, verify `buildSha` on `localhost:3100/healthz`. **NOT while a run is in flight.**
   - App (Vercel): the analyze/benchmark code is app-side (`lib/research/analysis.service.ts`), so it goes live when this branch is deployed / merged to main.
2. **Gather run** — pick a Bell property with real records; Configure with TexasFile **on**, "All Files", adjoiners off; start it. Confirm pages/files land in Review (`research_documents`), and the first real `research_document_purchases` rows appear.
3. **Benchmark analyze** — from Review, `POST /api/admin/research/<projectId>/analyze` with body `{ "benchmark": true }`. It runs uncapped until every page is analysed.
4. **Read the rate** — from the run logs (a `BENCHMARK: $X over N pages = $Y/page` line) or `research_projects.analysis_metadata.benchmark_usd_per_page`.
5. **Set the rate** — put that number (with whatever margin the owner wants) into `ANALYSIS_RATE_USD_PER_PAGE` in `lib/research/analysis-estimate.ts`; the estimator, the quote endpoint (E2) and the per-file buttons (E3) all read it.

### After the benchmark — the two live-wiring slices
- Feed `selectionsToWants` (S2) into the live acquisition path so the checklist drives what is bought/captured.
- Wire the estimate-and-warn (B2.2) into the purchase path so an over-budget selection warns before spending.
Both verified against the benchmark run rather than shipped blind.

## Deferred / open

- (none yet — record here with a one-line reason as slices are deferred)
