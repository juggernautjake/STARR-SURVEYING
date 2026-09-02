# The pipeline uses what it has, and the run says what it cost — 2026-09-02

Opened while verifying TexasFile. That verification turned into this because the TexasFile finding
was not a TexasFile problem: it was the third instance in one day of a capability that was built,
measured, written down, and never connected to the code that needed it.

---

## The owner's requests, in their words

> "Please make sure texas file is fully set up and that we are actually searching it and paying the
> cost to find documents."

> "Please make sure our normal pipeline is set up to use all of the reseach and analysis functions
> and methods available, and that we use all of the beneficial AI tools and third party apps that
> are available as well. Make sure everything is wired and fully functional."

> "For each run we need an accurate total of how much money is spent. so that the user can see how
> much the run cost when complete"

> "The cost should also be visible and be dynamically updated at the run pregresses"

> "Please do not stop working on this and do not close this powershell instance for any reason,
> including token costs"

---

## 1. What is measured, and one measurement that was wrong

### 1.1 The run's reported cost is understated — MEASURED

22 worker files call the Anthropic API. **Nine of them never record usage**, so their spend never
reaches `research_usage_events`, which is the table the run console sums to produce the figure on
screen.

| file | runs during |
| --- | --- |
| `counties/bell/analyzers/deed-analyzer.ts` | every Bell run with deeds |
| `counties/bell/analyzers/plat-analyzer.ts` | every Bell run with plats |
| `counties/bell/analyzers/lot-correlator.ts` | subdivision work |
| `counties/bell/analyzers/document-relevance-validator.ts` | document triage |
| `counties/bell/analyzers/gis-quality-analyzer.ts` | GIS scoring |
| `counties/bell/analyzers/screenshot-classifier.ts` | every capture pass |
| `services/ai-deed-analyzer.ts` | generic pipeline deeds |
| `services/ai-plat-analyzer.ts` | generic pipeline plats |
| `services/receipt-extraction.ts` | receipts (not research) |

`infra/model-sampling.ts` and `lib/credit-guard.ts` matched the same grep and are **false
positives** — the match is in a doc comment showing usage, not a call.

So "$2.14 spent" on a finished Bell run is the cost of the calls that happened to be instrumented.
The eight research ones are the analysis phase, which is where the money actually goes.

### 1.2 TexasFile searched a URL the site ignores — FIXED 2026-09-02

`texasfile-access.ts` was written on 2026-08-02 after driving the live site and recorded three facts,
all exported, all with **zero callers**: the real slug URL, the real Django form field names, and
whether credentials exist. The adapter went on using a query-string shape the site redirects away,
looking for inputs the page does not have, and never signing in — so the 233 counties that fall back
to TexasFile reached a record count and a paywall.

Fixed and shipped (`dc66c0881`). Proof still needs a run against the live site with the funded
account, which is on the worker rather than here.

### 1.3 Phases 8 and 9 are reachable only from the Testing Lab — MEASURED

`POST /research/confidence` and `POST /research/purchase` have exactly one caller in the product:
`app/api/admin/research/testing/run/route.ts`. A normal run posts to `/research/property-lookup` and
never reaches either.

That is why `research_document_purchases` has 0 rows. It is structural, not incidental: nothing
computes what is worth buying, so nothing buys, so no money is ever spent on a document.

The paywall verdict does not escape either — `TexasFileAdapter.lastAccess` is set on every search and
**read by nothing**, so "5,000 records exist here and we cannot open them" reaches a `console.warn`
and stops.

### 1.5 43 of 72 counties searched a clerk host that does not exist — MEASURED

Found while checking whether the TexasFile fix reaches the normal run. It does not, and the reason
is worse than the question:

**The generic pipeline never calls `getClerkAdapter`.** Its clerk search is `bell-clerk.ts`, which
is Kofile-only and reads its own table, `KOFILE_CONFIGS`. So the vendor routing in
`services/clerk-registry.ts` — eDocTec, Tyler, USLandRecords, Aumentum, TexasFile — governs
chain-of-title, the document-access orchestrator and the Testing Lab, and governs **nothing in a
normal run**.

Then the table itself. All 72 entries were probed once each, rate-limited, with two controls in the
same run — `bell.tx.publicsearch.us` answered, a deliberately nonexistent subdomain did not:

| | |
| --- | --- |
| answered | **29** |
| did not answer | **43** |

Sixty per cent. For those 43 counties every run searched a host that is not there and then reported
no clerk records — which reads as *"this property has no deeds"*, not *"we could not look"*. It is
the defect this whole session keeps meeting, at the largest scale yet found.

Coryell is how I found it: it was wrong in all three registries, and this morning I corrected the
two that decide nothing. `KOFILE_CONFIGS` is the one the run reads.

The 43 are moved to `KOFILE_UNREACHABLE`, dated, rather than deleted — without the list the obvious
repair is to add them back, which is what put them there. A guard fails if any returns to the live
table.

**This makes C2 the biggest remaining item, not a tidy-up:** the run has no clerk source at all for
every county that is not one of those 29.

### 1.4 A measurement of my own that was WRONG, recorded because it nearly became a premise

A first pass at "which services can a normal run reach" traced imports from `counties/router.ts`,
`services/pipeline.ts` and `counties/bell/orchestrator.ts`, and reported **88 unreachable modules**.

That number is false. The run path lives in `index.ts`, which the trace excluded — `capture-plan.ts`
and `document-harvester.ts` both appeared "unreachable" and both are imported there, the first by me
earlier the same day. Controlling the result is what caught it.

A correct version has to trace from the `/research/property-lookup` handler body rather than from
whole files, because `index.ts` also contains every Testing-Lab route and including it wholesale
would mark everything reachable. **Slice C1 is that measurement. Nothing in this plan may cite a
reachability number until it exists.**

---

## 2. Slices

### Phase A — the cost is accurate

- [x] **A1** Instrument the eight research AI call sites that never record usage. `recordAmbientAiCall`
      already exists and takes the model and token counts; the work is calling it, priced with the
      model `modelFor` actually chose rather than a constant.
      **DONE** — 11 call sites across 8 files. Three in deed-analyzer and two in plat-analyzer,
      which the file-level grep had counted once each. Each records the model actually sent —
      the routed `modelFor(...)` or the file's own constant — because pricing a Haiku call at
      Sonnet rates makes the cheap path look expensive and defeats the routing R6 shipped.

      Recorded BEFORE the response is inspected: the tokens are gone whether or not the model
      returned something usable, and the fallback paths are exactly the case a ceiling must see.

      **Runs will now report MORE than they did.** That is the fix, not a regression — the money
      was always being spent.
- [x] **A2** A guard that fails when a new `messages.create` call site does not record usage. The
      grep above is repeatable; make it a test, with a control (a known-good file must pass) and the
      two doc-comment false positives excluded by stripping comments first.
      **DONE** — `every-ai-call-records-its-cost.test.ts`. Two controls: the scan must find the
      callers it should (an empty list would pass every other assertion against a codebase that
      bills nothing), and a doc comment must NOT be counted — `model-sampling.ts` and
      `credit-guard.ts` both show `client.messages.create({ … })` in prose. Mutation-controlled:
      removing one recording call fails the suite by filename.
- [x] **A3** Verify the total reaches the screen: `research_usage_events` → run-console route →
      `RunState.spendUsd` → the Spent counter. Most of this exists; A3 is proving the chain end to
      end rather than assuming it.
      **DONE** — `run-cost-reaches-the-screen.test.ts`, 9 tests. Every tier the router can return is
      asserted to be priced: an unpriced tier silently falls back to Sonnet rates, so a Haiku run
      would be billed at 3x and an Opus run at a fifth, with nothing saying so. An unknown model
      must still cost SOMETHING — a zero would under-report every run that used it. And output must
      be priced above input on every model, which catches a transposed pair that would make long
      analyses look cheap, in a product whose spend is analysis.

      Also pinned: a document purchase writes a usage event (money moved) and a SKIPPED purchase
      does not (nothing moved, and a $0.00 event would put a purchase in the cost stream that never
      happened).

### Phase B — the cost is live, and final

- [x] **B1** Confirm the Spent counter updates DURING a run, not only at the end. The console is
      polled every fourth status poll (~12s); check that is true in a browser and that a long gap
      does not read as $0.00.

      **DONE — and it was a real bug.** `spendUsd` is null until the run-console is fetched, which
      happens on every FOURTH status poll (~12s). The counter rendered `(state.spendUsd ?? 0)`, so
      an unread cost displayed as **$0.00** — a confident claim that the run had cost nothing — for
      the opening seconds of every run, and permanently for any run whose console read failed.

      Fourth instance in one day of an unknown rendered as a confident zero. Three states now read
      differently: not-read-yet and nothing-recorded both show "—" with different hints, and only a
      real figure shows a number. The first resolves itself; the second means the spend writer is
      broken, and an operator should be able to tell those apart.
- [x] **B2** The final figure is persisted on the run record and survives a page reload —
      `recordRunFinish` writes `costUsd`, so this is a verification slice, and a re-read after
      completion is the test.
      **VERIFIED.** `recordRunFinish` writes `costUsd: finalBudget.spentUsd` on the run row, so the
      figure survives the console going away. Pinned by a test rather than assumed.
- [x] **B3** Show what the money BOUGHT, not only the total: model calls versus purchased pages.
      A single number cannot be checked by the person paying it.

      **DONE, and the breakdown already existed.** `summariseSpend` has computed `byType` since it
      was written; `ConsolePayload.spend` carried only the total, so the state layer dropped it and
      the screen could show one number and nothing else.

      It reaches the Spent counter now, sorted most-expensive first — that is the line a reader
      checks — with the event types rendered readably rather than as `document_purchase`, which is
      a column name and not something a person paying an invoice should have to translate.

      $2.14 of model calls and $2.14 of purchased pages are different runs, and only one of them
      bought anything.

### Phase C — the pipeline uses what the codebase has

- [x] **C1** Do §1.4's measurement properly: trace from the `/research/property-lookup` handler.
      Produce the real list of research/analysis capabilities a normal run never reaches.

      **DONE. The real number is 84 of 122**, traced from the `/research/property-lookup` handler
      body and the index.ts functions it calls, then closed transitively. Two controls before
      believing it, both of which held:

      · `DocumentHarvester` is constructed inside `app.post('/research/harvest')` — the Lab route —
        so it really is outside the run, which is why the earlier grep of pipeline.ts and router.ts
        found nothing.
      · `address-normalizer` is imported by CAD *adapters*, not by the run path, which is why the
        AI-variant fix earlier today mattered in `bis-cad.ts` and not in the copy there.

      **Six phases can only be computed from the Testing Lab:**

      | phase | product can trigger? |
      | --- | --- |
      | 4 subdivision | **no** — Lab only |
      | 5 adjacent | **no** — Lab only |
      | 6 row | **no** — Lab only |
      | 7 reconcile | the product GETs the report; the POST that COMPUTES it is Lab only |
      | 8 confidence | same — GET only |
      | 9 purchase | **no** — Lab only |

      chain-of-title and flood-zone ARE product-callable, so this is not a blanket gap.

      **The consequence worth acting on:** `app/api/admin/research/[projectId]/boundary/route.ts`
      fetches `/research/reconcile/:projectId` and `/research/confidence/:projectId` — two reports a
      normal run never writes. The boundary page is reading output that only exists if somebody ran
      the Testing Lab.

      **And the finding that stops this becoming a bad decision:** "not reached" splits two ways,
      and wiring everything on the list would be wrong.

      | Lab-only module | what the RUN uses instead |
      | --- | --- |
      | `DocumentHarvester` (490 ln) | `bell-clerk.ts` / pipeline Stage 2 |
      | `GeometricReconciliationEngine` (669 ln) | `runGeoReconcile` at Stage 3.5 |
      | `address-normalizer` AI variants | the copy in `bis-cad.ts` |

      Those are PARALLEL IMPLEMENTATIONS, not missing capabilities. The run already does the work;
      a second module does it again for the Lab. Wiring them would duplicate the phase, not add it.
      Genuinely absent capabilities are a different set — subdivision intelligence, adjacent
      research, ROW integration, the confidence engine and the purchase orchestrator — and those
      are C2.
- [x] **C2a** The boundary viewer draws the calls a normal run produced.

      **The first consequence of C1, and the worst one.** The viewer fetched two Phase-7 files that
      only the Testing Lab writes, so for every run an operator actually started it had nothing to
      draw and reported `hasWorkerData: false` — which reads as "the worker is down", not "nobody
      computed this". A surveyor looking at an empty boundary concludes something about the
      PROPERTY.

      The run had the calls the whole time: it reconciles at Stage 3.5 through `runGeoReconcile` and
      persisted only `callCount`. It now persists the calls, capped at 400 with the truncation
      STATED — a boundary missing its last calls does not close, and a reader blames the survey.

      The viewer prefers the Phase-7 report when it exists (it carries cross-source aggregation the
      run's own pass does not) and falls back otherwise, and the response now says WHICH answer it
      gave: `callSource: none | run | phase7`. Rendering the poorer answer silently would be the
      same defect in better clothes.

- [x] **C2b** The run writes its reconciliation where every reader already looks. **THE KEYSTONE.**

      `/tmp/analysis/{id}/reconciled_boundary.json` has four readers — the boundary viewer,
      `GET /research/boundary/:id`, the master orchestrator, and Phase 8, which takes it as its
      INPUT. Exactly one thing wrote it: the Lab's `POST /research/reconcile`.

      So all four read nothing for every real run, and **Phase 8 could not run at all** — its input
      did not exist. Phase 9 takes its purchase recommendations from Phase 8. That is the actual
      reason `research_document_purchases` has 0 rows, and it is one missing file rather than three
      missing phases.

      The run reconciles at Stage 3.5 and kept the answer in memory. `phase7-bridge.ts` writes it
      down, and the tests validate the output against the same schema Phase 8 validates — so the
      bridge is checked against the real contract, not against my reading of it.

      Three deliberate refusals, all of the same kind: a malformed bearing is DROPPED rather than
      coerced to satisfy the regex (a bearing bent to fit is wrong data with a surveyor's authority
      behind it); `closureRatio` is omitted because `precisionRatio` is the string "1:5000" and the
      schema wants a number whose units nobody states; and the bridge REFUSES to overwrite a real
      Phase-7 report, which carries cross-source aggregation it does not.

      Every bridged call is marked `single_source`, because it is one.

- [x] **C2c** Phase 8 runs in the normal pipeline, and it is free.

      Measured before deciding: the confidence engine makes **no model calls** — it is pure
      computation. So there is nothing to gate and no reason to make an operator ask for it. It
      never ran outside the Lab for one reason only: it takes the reconciled boundary as its INPUT,
      and C2b is what made that file exist.

      It writes `confidence_report.json` beside the reconciled file — the per-call scores the
      boundary viewer reads, and the `documentPurchaseRecommendations` Phase 9 needs. Both had been
      reading an absent file.

      Guarded two ways: it runs only when the boundary was actually written (scoring an absent file
      produces a FAILED report, which the viewer would then show as a badly-scoring boundary — a
      claim about the property from a missing input), and a scoring failure cannot fail a run whose
      research already succeeded.

- [x] **C2d** Every county has a clerk source. **The biggest single gap in the plan.**

      §1.5 measured it: the generic pipeline's clerk search is Kofile-only, 43 of its 72 counties
      pointed at dead hosts, and `searchClerkRecords` returned `[]` for everywhere else — which the
      pipeline reads as "the clerk holds nothing for this owner". So outside 29 counties, a run
      reported no clerk records having never contacted a clerk.

      The fix is one branch. `searchClerkRecords` now asks `services/clerk-registry.ts` which vendor
      the county actually uses — eDocTec, Tyler, USLandRecords, Aumentum, iDocket, Fidlar, or
      TexasFile as the universal fallback — and searches it. Chosen there rather than in the
      pipeline because all three existing call sites go through that one function, so they all gain
      coverage without the pipeline changing at all.

      Grantor AND grantee, because they are different questions: an owner is grantee on the deed
      that gave them the property and grantor on anything they have since conveyed.

      The outcome is a STATEMENT, not just an array. "The index answered and holds nothing" is a
      finding about the property; "we never reached a vendor" is a finding about us; and both used
      to arrive as `[]`. Results carry the VENDOR that answered, because "which vendor did we
      reach" is the first question when a county starts returning nothing and is unanswerable
      afterwards if every result says "clerk".

      **This is also what makes the TexasFile work reach a normal run.** The sign-in and the real
      form fixed the adapter; until now nothing in a run could construct it.

- [x] **C2** For each, decide and record: wire it, or state why it is deliberately out of the normal
      path. Not everything should run on every property — the answer must be written down either way,
      because "unreachable" and "deliberately optional" look identical from the outside.

      **DONE, and the answer was not "wire more phases".** Classified by measurement:

      | capability | verdict |
      | --- | --- |
      | `subdivision-intelligence` (1,091 ln) | **parallel** — the run already does subdivision work via `extractSubdivisionName` / `fetchBestMatchingPlat` / `searchClerkForPlats`. Wiring it would duplicate a phase. |
      | `DocumentHarvester`, `GeometricReconciliationEngine`, `address-normalizer` variants | **parallel** — see C1. |
      | Phase 8 confidence | **wired** (C2c) — free, and was only ever blocked on a missing file. |
      | Phase 9 purchase | **wired** (D1). |
      | clerk vendors for 225 counties | **wired** (C2d) — the largest gap in the plan. |
      | `adjacent-research-*`, `row-integration-engine` | **DEFERRED** — each is a whole extra research pass per neighbour or per road, at AI cost, on every property. That is a per-run choice and not a default, and the run already RANKS the adjacent parcels (see below) so an operator can order one deliberately. |

- [x] **C2e** The Stage 5 validation report survives the run.

      The real answer to "use all the analysis available": the run already performs the analysis
      and did not keep it. `runPropertyValidationPipeline` produces the most decision-shaped output
      a run has — an overall confidence and rating, the documents worth buying next WITH cost
      estimates and the confidence boost each would give, a ranked list of which neighbour to
      research first, per-call evidence strength, and discrepancies with severity.

      Three lines reached the log — the top 3 actions and the top 3 adjacent owners. Nothing was
      persisted. `grep validationReport src/index.ts` returned nothing and the app had never heard
      of the field. So every run bought this analysis and kept a summary sentence.

      Persisted now, with the arrays capped AND the truncation stated: a shortened list of
      discrepancies that does not say it was shortened reads as a property with fewer problems
      than it has.
- [x] **C3** The paywall verdict escapes the adapter: `lastAccess` reaches the run so an operator can
      see "N records exist here and are behind a paywall" instead of nothing.

      **DONE, and C2d is what made it reachable** — until a run could construct the TexasFile
      adapter, its verdict had nowhere to go.

      `lastAccess` is read now and travels out on the outcome. A paywalled county reports
      "N record(s) exist and will not be shown without a subscription — the records EXIST, this is
      the absence of access, not of documents", with the COUNT, which is the part that makes it a
      purchasing decision rather than a shrug.

### Phase D — the run can buy documents

- [x] **D1** A normal run reaches a purchase decision. The gate (`decidePurchase`), the budget
      (`maxCostUsd`), the ledger and the skip-recording all exist and were built for a step that
      never runs.

      **DONE — and it was one link, not a missing phase.** Phase 9 is complete and had exactly one
      caller: the Testing Lab. It needs recommendations → which come from Phase 8 → which takes the
      reconciled boundary as its INPUT → which nothing wrote. C2b wrote the file, C2c ran Phase 8,
      and this connects the last one.

      Every safeguard was already built and had never run: `decidePurchase` (which refuses when
      permission cannot be READ, not only when it is denied), the per-run ceiling, the cross-run
      library that will not buy a page twice, and the skip ledger.

      The ceiling passed is `runSettings.maxCostUsd` — what the operator chose in the dialog. The
      Lab route defaulted to 25 with no caller ever passing one, which is how a per-run limit came
      to govern nothing.

      **It says what it is about to spend BEFORE it spends it**, which is §3's "must not" made
      checkable by test: a run that reports a purchase after making it has told the operator nothing
      they could act on.

      Four existing guards fired when the fourth spend site appeared, which is what they are for.
      Three needed re-pointing (a site count, an ordering assertion that compared two unrelated call
      sites, a window that no longer reached its `catch`) — and one caught a REAL omission: my site
      called `recordSkippedPurchases` without checking its result, where the older site reports the
      failure. Fixed the code, not the test.
- [x] **D2** Purchased documents re-enter analysis, or the purchase bought nothing worth having.
      **Deliberately NOT re-analysed in-run** (`autoReanalyze: false`). Re-running extraction on a
      freshly bought document doubles the AI spend of the phase that costs most, at the end of a run
      whose ceiling has already been measured against. The documents are purchased, stored and
      attributed; a re-run reads them from the library without buying them again, which is what the
      cross-run ledger is for. Revisit if a paid run shows the extra pass is worth it.

- [ ] **D3** One deliberate paid run against a real property, which is the only thing that can prove
      the path. Owner-gated: it spends real money.

---

## 3. Things this work must not do

- **Must not make a run spend money the operator did not ask for.** The gate defaults to allowed and
  the budget defaults to a non-zero number, so wiring D1 without saying so changes what every run
  costs. Whatever D1 does, the run must state it before it does it.
- **Must not report a bigger number as a better one.** A1 makes runs look more expensive because
  they always were; that is the point, and the commit should say it plainly.
- **Must not cite the 88.** See §1.4.

---

## 4. Slice log

- **2026-09-02** — Opened. TexasFile search fixed (`dc66c0881`); the cost gap and the Lab-only phases
  measured; one wrong measurement of my own recorded rather than quietly dropped.
