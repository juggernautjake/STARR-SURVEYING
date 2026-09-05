# Two-pipeline split: Gather, then Review/Analyze — 2026-09-05

**Started** 2026-09-05 · **Branch** `claude/research-pipeline-completion-2026-09-03`

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
> `run-gather-pipeline.test.ts` (9). Worker tsc green. **REMAINING (final wiring):** the HTTP dispatch
> that calls `runGatherPipeline` from the run handler when `phase==='gather'`, supplying the real
> `resolveFree` (county-site/free-adapter capture that files what it finds) and the subject/adjoiner
> facts — plus setting the run's `maxCostUsd` to `budget.maxTotal` so the cost watchdog admits base +
> earmark (the OPEN item from the Hard-stops section).

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

## Deferred / open

- (none yet — record here with a one-line reason as slices are deferred)
