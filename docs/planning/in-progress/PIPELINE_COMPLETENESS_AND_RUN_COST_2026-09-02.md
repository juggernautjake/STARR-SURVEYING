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
- [ ] **A3** Verify the total reaches the screen: `research_usage_events` → run-console route →
      `RunState.spendUsd` → the Spent counter. Most of this exists; A3 is proving the chain end to
      end rather than assuming it.

### Phase B — the cost is live, and final

- [ ] **B1** Confirm the Spent counter updates DURING a run, not only at the end. The console is
      polled every fourth status poll (~12s); check that is true in a browser and that a long gap
      does not read as $0.00.
- [ ] **B2** The final figure is persisted on the run record and survives a page reload —
      `recordRunFinish` writes `costUsd`, so this is a verification slice, and a re-read after
      completion is the test.
- [ ] **B3** Show what the money BOUGHT, not only the total: model calls versus purchased pages.
      A single number cannot be checked by the person paying it.

### Phase C — the pipeline uses what the codebase has

- [ ] **C1** Do §1.4's measurement properly: trace from the `/research/property-lookup` handler.
      Produce the real list of research/analysis capabilities a normal run never reaches.
- [ ] **C2** For each, decide and record: wire it, or state why it is deliberately out of the normal
      path. Not everything should run on every property — the answer must be written down either way,
      because "unreachable" and "deliberately optional" look identical from the outside.
- [ ] **C3** The paywall verdict escapes the adapter: `lastAccess` reaches the run so an operator can
      see "N records exist here and are behind a paywall" instead of nothing.

### Phase D — the run can buy documents

- [ ] **D1** A normal run reaches a purchase decision. The gate (`decidePurchase`), the budget
      (`maxCostUsd`), the ledger and the skip-recording all exist and were built for a step that
      never runs.
- [ ] **D2** Purchased documents re-enter analysis, or the purchase bought nothing worth having.
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
