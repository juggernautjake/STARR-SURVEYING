# Research: two more counties, every source, and a run that tells the truth end to end

**Started** 2026-09-02 · **Branch** `main` (small slices, merged as they land)

Successor to `completed/RESEARCH_RERUN_AND_CAPTURE_2026-09-01.md`. That plan fixed the re-run, the
progress bar's 92% jump, the TexasFile switch, and imagery capture. This one carries the requests
made after it, most of which came with **real run logs**, which is why almost every item below cites
measured evidence rather than a theory.

---

## The owner's requests, in their words

> "Please make sure we have everything built so that we can run at least two different property
> researches at the same time without conflict. Please make sure that when one completes it doesn't
> kill the other."

> "Make sure the system/worker knows to check each document found to see if it is a duplicate or
> not… it should immediately be formatted and uploaded to the research platform and made available
> to view. I don't want the research worker to compile the files/documents all slowly over time and
> then upload them in a big group."

> "It seemed like documents were still uploading even after the run was self reporting to be
> complete… I want it so that the run is not complete until all documents have been uploaded and the
> full review is available."

> "We really need to be able to pull from TexasFile and from every source we can."

> "For google maps and satellite, I want it so that we have a zoomed out view, a medium zoom view,
> and then a closer up zoom view. Please make this happen for every run we do."

> "Please account for all of this in the speed and percentage of the loading bar visual. Make sure we
> can choose how long the run is. 30 mins can be the default. 15 is the minimum, and 60 is the max."

> "I do not think that we have made it so that when the user is typing in the address that the
> system autocompletes it. We need to make sure we are integrating google places and whatever else
> is needed so that it can figure out exactly what property the user is inputting and format
> everything correctly. We need the address number with road, and we need a city field, and a
> county field and a state field."

> "Also make sure we can upload images and files to start the run so that it has as much info to go
> off of before the run begins."

> "All of my requests should be recorded in the planning doc in the in progress folder so
> everything can get built out and be permanently recorded somewhere."

> "Please start working on building out an adapter for milam county and coryell county. Please make
> sure those adapters are fully built. Look at how I have built and integrated adapters for other
> counties and then build those two counties out and integrate them fully. Test them and all of
> that."

---

## 1. What the two run logs of 2026-09-02 actually prove

Both exported by the owner. Nothing here is inferred.

### 1.1 Concurrency already works — measured, not assumed

The two runs **overlapped**:

| Run | Started | Finished |
|---|---|---|
| Bell — 16991 Pecan School Rd | 04:58:34 | 05:23:48+ |
| Milam — 309 Gibson Thorndale | 05:06:30 | 05:15:58 |

Milam started 8 minutes into the Bell run, ran to completion, and finished while Bell was still
capturing maps. Neither killed the other. The worker reports `maxConcurrentPipelines: 6`.

That is real evidence, and it is the *strongest* answer to the concurrency question. What it does
**not** prove is that the isolation is guaranteed rather than lucky — see slice **C1**.

### 1.2 The progress ladder would have parked on one rung

The whole 25-minute Bell run emits three phase names: `Validation | Phase 1 | Phase 2`.
`Phase 2` alone spans **1,433 s — 24 of the 25 minutes**. Fixed in
`f3cc53831` by resolving the sub-phase from the message; recorded here because the next person to
touch the ladder needs to know the phase field is not granular enough to key on.

### 1.3 The run reported complete with five minutes of work left

```
[00:10:53] Pipeline: Pipeline FAILED in 261.9s
[00:11:02] AdaptiveVision: County GIS map — Milam CAD: …     ← work continues
[00:15:57] AdaptiveVision: complete — 44 API calls, 294.1s
[00:15:58] [Library]: 0 new document(s) filed. 1 could not be written.
[00:15:58] [Pipeline Lifecycle] | Pipeline Complete
```

Fixed in `f3cc53831`. Two things in that excerpt are still open: the run says **FAILED** and then
**Complete** (D2), and **"1 could not be written"** (B1).

### 1.4 The AI address-variant generator returns truncated JSON — in BOTH runs

```
Bell:  ✕ Stage1D | Claude | ai-variant-generation — Unterminated string in JSON at position 1452
Milam: ✕ Stage1D | Claude | ai-variant-generation — Unexpected end of JSON input
```

Two different properties, two different counties, the same failure: the model's JSON is cut off
mid-string. That is a `max_tokens` ceiling, not a prompt problem. And it is not cosmetic — Bell then
logged:

```
✕ Stage1: All CAD search layers exhausted — property not found. Tried 0 variants.
```

**Tried 0 variants**, immediately after announcing "Searching Bell CAD with 14 variants". The
variant generator is a real part of finding a property and it has been failing on every run.

### 1.5 Both counties' CAD sites were unreachable

Bell's `esearch.bellcad.org` timed out repeatedly; every Milam ArcGIS layer timed out (12 queries,
10 s each = 120 s of the 147 s Stage 1). The circuit breaker worked — it skipped the browser rather
than launching one against a dead host, and said so. Not our bug, but see **A3**: Milam spent
**147 seconds** discovering that a host was down, which is most of a 15-minute run's Stage 1 budget.

---

## 2. Slices

Ship in order within a phase. Each is independently useful and independently revertible.

### Phase A — Milam and Coryell adapters

- [x] **A1** Read the existing adapter pattern end to end before writing anything: `BIS_CONFIGS`
      (`services/bis-cad.ts`), `cad-registry.ts`, `clerk-registry.ts`, `counties/router.ts`, and one
      worked example. Both counties are already **partly** present — Milam and Coryell both have
      `esearch.*` and `gis.bisclient.com/*` entries in `BIS_CONFIGS` — so the premise "build an
      adapter from scratch" is probably wrong and the real work is completing and testing what is
      registered. **Check this first; the last four parked premises in this repo were false.**

      **Premise confirmed — both counties were already routed.** `services/clerk-registry.ts` is the
      registry that actually routes, and it routes by FIPS: Milam (48331) is in `KOFILE_FIPS_SET`,
      Coryell (48099) in `EDOCTEC_FIPS_SET`. Both have `BIS_CONFIGS` entries for CAD and GIS. So
      there was never an adapter to build; the work is making the searches return something.

      Worth knowing for anyone reading these files: `adapters/clerk-registry.ts` is a DIFFERENT and
      largely descriptive table of 21 counties that does not include Milam at all, and it is the one
      that had Coryell wrong. Two files with nearly the same name, only one of which decides
      anything.
- [x] **A2** Milam: confirm the clerk is Kofile at `milam.tx.publicsearch.us` (the log says so), the
      CAD is BIS at `esearch.milamcad.org`, and the GIS is `gis.bisclient.com/milamcad/`. Make the
      address-based clerk search work — the log shows six address variants tried and
      `0 total, 0 deed-relevant`, with a failure dump that captured the HTML.

      **DONE, and the premise was half wrong in an instructive way.** There IS an address-based
      clerk search — `Stage2-Addr` in `services/bell-clerk.ts`, which is generic despite its name
      (`KOFILE_CONFIGS` is keyed by county). It was not broken so much as pointed at the wrong
      index: `buildTylerUrl` sent `searchType=quickSearch`, the indexed PARTY-NAME search, and a
      street address is not a party name. Six variants, six wrong questions, and the result
      rendered as "0 total, 0 deed-relevant" — indistinguishable from a county with no records.

      `buildTylerUrl` now takes a mode, and the address search runs the whole variant list against
      the name index first, then the broad keyword sweep — the mode that can match an address
      sitting in a legal description or in OCR text. `kofile-clerk-adapter.ts` had already measured
      the two on this exact county (5,484 against 220,777 for one term) and recorded that they are
      different questions; nothing had connected that finding to the address path.

      The keyword pass is skipped outright once anything has been captured, so a county that
      answers the narrow search still costs six page loads. The extra six are spent only in the
      case that previously returned nothing at all.

      Note the interaction with §1.5: Milam CAD was unreachable during the reference run, so no
      owner name or legal description was available and the address search was the only one with
      anything to go on. That is precisely when it needs to work.
- [x] **A3** The 147-second dead-host discovery. Milam's Stage 1 spent 12 sequential ArcGIS layer
      queries at 10 s each against a host that never answered. The circuit breaker exists and did not
      cover the ArcGIS path. One unreachable host should cost one timeout, not twelve.
      **DONE.** `worker/src/infra/dead-host.ts` — a gate keyed by HOSTNAME, checked inside
      `queryArcGisLayer`, the single funnel all five service x layer x field loops pass through.
      The existing `infra/resilience.ts` breaker could not cover this: it is keyed by a fixed set of
      VENDOR names declared up front, and county GIS hosts are discovered at runtime from
      `BIS_CONFIGS`, so there is no name to declare.

      The hinge is that **an HTTP 404 proves the host is alive**. Those loops walk candidate service
      and layer names and most do not exist, so a 404 is how a live server says "not that one, keep
      going" — it clears the host rather than condemning it. Bell finds its own parcel layer partway
      down that list, and a gate that tripped on 404 would cancel the search one probe early.
      Connection errors gate on the first strike (unambiguous); timeouts take two, because one 10 s
      timeout on a live-but-slow county server is not evidence. Milam: ~147 s -> ~20 s.

      17 tests, including a mutation control: moving `noteHostAnswered` behind the `resp.ok` check
      makes the wiring test fail, and restoring it makes it pass. A wiring test that cannot fail is
      the defect this repo keeps rediscovering.
- [x] **A4** Coryell: same treatment. `esearch.coryellcad.org` + `gis.bisclient.com/coryellcad/`.
      **Registry half done.** The two registries contradicted each other: `adapters/clerk-registry.ts`
      had Coryell as `system: 'kofile', status: 'stub'` on a dead county-website URL, while
      `services/clerk-registry.ts` has routed it to eDocTec since plan R39 (12,705 documents). The
      entry was wrong about the VENDOR, not just the address — confirmed with a control:
      `milam.` and `bell.tx.publicsearch.us` answer 200 while `coryell.tx.publicsearch.us` does not
      resolve at all, identically to a deliberately nonexistent subdomain. So swapping in a Kofile
      address would have been the wrong fix. `'edoctec'` was never in the `ClerkSystem` union, which
      is why the correct value could not be written; adding it made the app typecheck fail on a
      `Record<ClerkSystem, string>` label map that had no eDocTec entry — the type system finding the
      second half of the same gap.
- [x] **A5** Register both in the GIS-capture path so `capture-plan.ts` can photograph their viewers
      (it reads `BIS_CONFIGS[county].gisBaseUrl`; confirm both counties resolve).
      **Already true, now proven — and checking it meant checking the right file.**
      `capture-plan.ts` does not read `BIS_CONFIGS`; it takes `gisBaseUrl` as an input. The caller
      is `index.ts:gisBaseUrlFor()`, which lowercases and strips a trailing " county" before the
      lookup, and both keys exist (`gis.bisclient.com/milamcad/`, `gis.bisclient.com/coryellcad/`).
      A6 asserts a `cad_gis` capture is actually PLANNED for each, not that a config holds a string.
- [x] **A6** Tests: the adapter registry answers for both counties, the router routes to them, and
      the capture plan produces a `cad_gis` capture for each. Structural tests only — a live portal
      test is not reproducible and the portals were down during the reference runs.
      **DONE** — `milam-coryell-coverage.test.ts`, 12 tests. Each county is checked at every layer
      a run touches: a CAD entry with a GIS viewer, the clerk vendor it is really served by, its
      FIPS set, a planned `cad_gis` capture, and three distinct satellite zoom bands. Plus the
      county-name normaliser, so a county arriving as "Milam County" does not silently lose its
      GIS viewer.

      It opens with a CONTROL: an unconfigured county resolves to `undefined` and routes to the
      `texasfile` fallback. Without that, every assertion in the file would pass equally against a
      registry that answered yes to everything.

### Phase B — every document, filed once, immediately

- [x] **B1** `[Library]: 0 new document(s) filed. 1 could not be written.` A document was captured
      and could not be persisted, and the run completed anyway. Find out why one row failed, and make
      the reason reach the screen — "could not be written" with no cause is the shape of the
      22-documents-advertising-a-missing-file defect.

      **DONE, and the cause was never missing.** `FilingTally.record()` has been storing the actual
      error string since it was written, and `describe()` printed `.length` and threw the string
      away one line before it would have been useful. The count with no cause was not a gap in what
      the code knew — it was a gap in what it said.

      `describeFailures()` now names the distinct reasons, counted where they repeat, capped at
      three with the remainder stated rather than dropped. Distinct reasons and not one line per
      document, because a portal that times out fails every document in a batch identically and
      fifty copies of one message is how a log stops being read.

      The second half was worse than the first: the call site logged `info` and `.success()`
      unconditionally, so `1 could not be written` reached the screen as a SUCCESSFUL step. It now
      branches on `hasFailures` and warns. A run that captured a document and then lost it has not
      succeeded at filing.

      11 tests, with a control that a clean tally is unchanged (otherwise "always append a warning"
      would pass everything) and a mutation control on the warn branch. The ordering assertion
      strips comments first — this block's own comment quotes the code it replaced, and the probe
      matched the prose on the first run. Fifth time in this repository.
- [x] **B2** Verify the immediacy guarantee holds for the GENERIC pipeline as well as Bell. The nine
      guards in `documents-are-filed-immediately.test.ts` cover the Bell orchestrator's seven
      incremental call sites; the generic pipeline's path is not yet asserted.

      **DONE — and verification FAILED, so this was a fix and not a test.** The guarantee did not
      hold. The generic pipeline, which serves every routed county that is not Bell, accumulated
      documents in an array and left the writing to the caller, which waited for the run to end,
      **DELETED** the project's previous `property_search` rows, and bulk-inserted.

      Two defects, and the delete is the worse of them:

      1. Batching — nothing viewable until the run finished, the exact thing the owner asked us to
         stop. Bell had honoured that since it was written, at seven incremental call sites.
      2. The delete — every re-run destroyed what the previous run found, and a run that crashed
         after it left the project with FEWER documents than it started with. That is the precise
         opposite of the supersede-not-delete rule the cross-run library was built on.

      Worth noting how it stayed invisible: `documents-are-filed-immediately.test.ts` passes, and
      always did. It guards Bell. The guarantee held for the one county with a guard and did not
      hold for the other forty, and the green test is what made that look fine.

      Now: `PipelineInput.onDocument` is called the moment a document is found, through `fileNow`,
      which every one of the seven push sites goes through — so a push site added later cannot
      silently revert to batching. The router supplies it, and filing goes through
      `resilientInsertDocument`, the same duplicate check Bell uses, because "check each document
      to see if it is a duplicate" was the same sentence as "immediately" and a bare insert would
      have satisfied one half while dropping the other.

      The end-of-run block is now a SWEEP: no delete, and it skips anything already filed this run.
      It exists so a transient Supabase failure mid-run does not cost the document.

      18 tests, with three controls and a mutation control — adding a raw `documents.push()` back
      makes the suite fail, which is the regression this is actually guarding against.
- [x] **B3** TexasFile and every other source. `purchase-gate.ts` now decides *whether* a run may
      buy; what is not yet proven is that the paid path RUNS when allowed —
      `research_document_purchases` is still **0 rows**, and a free Bell run cannot prove the
      purchase path. Needs one deliberate paid run against a real property.

      **The recordable half is DONE. The paid run itself is DEFERRED to the owner — see below.**

      Investigating why `research_document_purchases` had 0 rows turned up something bigger than
      "no paid run has happened yet". The explanation path existed at both ends and nothing joined
      them in the middle:

      | piece | state |
      | --- | --- |
      | `lib/research/paid-documents.ts: skipStatusFor()` | produces the statuses — **zero callers** |
      | `purchase-ledger.ts: recordFailedPurchase()` | writes a row — **zero callers**, and its hardcoded `status: 'failed'` is not one the route counts |
      | the analyze route | counts rows with a skip status |
      | `paidDocumentsNotice()` | returns **null** when that count is zero |

      So the sentence "N documents behind a paywall were not retrieved" was unreachable BY
      CONSTRUCTION. Not "no run has produced one yet" — no run ever could. That also means the
      notice restored to the run view earlier today was inert: correct, wired, and fed by a number
      that could only ever be 0.

      Now: `PurchaseDecision` carries a machine-readable `skipStatus`, the refusal site writes one
      `research_document_purchases` row per recommended document, and the analyze route also counts
      `permission_unreadable` — a THIRD state kept separate on purpose, because "you told us not to
      spend" is finished and "we could not find out whether you had" is worth re-running.

      12 tests, with a control that a run which MAY buy has no skip status — without it,
      "always return paid_disabled" would pass everything and record skips for runs that bought fine.

      **DEFERRED, owner-gated:** proving the PAID path end to end still needs one deliberate paid
      run against a real property. It spends real money at a live vendor and picks a real address —
      both are the owner's call, not something to do unasked. Everything up to the point of spending
      is now covered. When you want it, say the word and name a property.

### Phase C — concurrency, guaranteed rather than observed

- [x] **C1** Audit every piece of worker state for per-project keying. `activePipelines`,
      `runProgress`, `completedResults`, `completedLogs`, `filingContexts` and the spend ledger are
      all `Map`s keyed by `projectId`; the risk is anything that is NOT — a module-level singleton, a
      shared browser, a global tracing flag (`disableTracing()` takes no project argument), or a
      fixed `/tmp` path. Write the audit as a test that fails if a new global appears.

      **DONE — and the audit found the worst bug in this plan.**

      `gis-viewer-capture.ts` kept the parcel centroid at module scope as a LAZY CACHE:
      `if (_parcelCenterLon === 0 && _parcelCenterLat === 0)` computes it, otherwise reuses it. The
      entry function reset it on the way in, which makes sequential captures correct and does
      nothing for concurrent ones:

      ```
      run A  resets, computes its centre, starts capturing
      run B  resets (clobbering A), computes ITS centre
      run A  next zoom level → finds a centre already set → uses B's
      ```

      Run A then photographs run B's property, at run A's zoom levels, and files the images under
      run A's project. Nothing errors and the screenshots look completely normal. For a surveying
      deliverable that is close to the worst kind of silent bug, and it sits directly under the
      owner's request for concurrent runs. Five values moved into an `AsyncLocalStorage` store
      scoped to one capture — the file has a single entry point, which is the shape ALS is for.

      The audit is a scan over every non-test worker file: any module-level `let`/`var` must be on
      an ALLOWED list with a written reason. Eleven are, each either a genuine process singleton or
      global by the nature of the thing (`credit-guard` is right to be process-wide — an Anthropic
      account is depleted for the worker, not for a project; making it per-run would let run B keep
      spending after run A proved the account empty).

      Mutation-controlled: adding a new module-level `let` to a fresh file fails the scan by name.

      **Known limit, stated rather than hidden:** the scan catches `let`/`var`, not a mutated
      `const` array or object. `_captureLog` in that same file was exactly that and the scan would
      have missed it — it was found by reading the file, not by the guard. Widening it means
      deciding which `const` collections are configuration and which are state, which is a real
      piece of work rather than a tighter regex.
- [x] **C2** A completing run must not tear down a live one. Check the completion path for anything
      global: `disableTracing()`, `globalStepGate`, browser teardown, and the queue poller's capacity
      accounting.

      **DONE, and it found a real one.** `trace.ts` held `let tracingEnabled` for the whole
      process, and `disableTracing()` runs on the completion AND failure path of every run. Any run
      finishing turned tracing off for all of them, so the Testing Lab watching a live run went
      silent mid-run — which reads as a stalled run, not as another run reaching into it. Tracing is
      now a `Set` of project ids and the three call sites name their project.

      The others in the list were already fine, and it is worth saying why rather than just ticking:
      `globalStepGate` takes a `projectId` on every method despite the name; the browser pool is
      shared deliberately and reference-counted, with its own header documenting the launch race it
      closes; capacity is `activePipelines.size`, so a finished run frees exactly its own slot; the
      `/tmp` paths are all project-scoped.
- [x] **C3** Concurrency test at the shape level: two projects, interleaved lifecycle calls, asserting
      one's completion leaves the other's state intact.
      **DONE.** `concurrent-runs-do-not-share-state.test.ts`. The run registries — `activePipelines`,
      `runProgress`, `completedResults`, `completedLogs` — are each asserted to be a `Map` and
      asserted never to be `.clear()`ed, because clearing one wipes every OTHER live run, which is
      the literal shape of "a completing run tears down a live one". Capacity is asserted to come
      from `activePipelines.size` rather than a hand-kept counter, since a counter is how a crashed
      run permanently consumes a slot.

### Phase D — the screen keeps telling the truth

- [ ] **D1** The bar's new pacing needs browser QA against a real run. A green suite has missed
      rendering bugs in this repo repeatedly.
- [x] **D2** A run that reports **FAILED** and then **Pipeline Complete** in the same log (Milam,
      10:53 → 15:58). Decide which it is and say it once.

      **DONE.** Neither line was lying, which is why it survived. `pipeline.ts` reported the
      RESULT (`status: failed` — no boundary, no property id, no documents); `index.ts` reported
      the LIFECYCLE (the function resolved rather than threw) and called `.success()` regardless of
      what was found. Two true statements about different things, neither saying which.

      There was a THIRD phrasing on the county path, which would have been the one place still able
      to announce "Pipeline Complete" about a run carrying errors. One exception is all it takes
      for two logs to disagree again, so it uses the shared wording too.

      `run-outcome.ts` is now the single vocabulary. It also fixes the word: `status: failed` means
      the run executed correctly and found nothing, which is a FINDING and a different one from the
      pipeline throwing. "Research Found Nothing" says so and points at the next action; "Research
      Failed" is reserved for a crash. `partial` is deliberately not a problem — flagging a usable
      answer red teaches an operator to ignore red.
- [x] **D3** Surface the chosen run length on the run view — "24 of 30 minutes" is only meaningful
      when the 30 is visible.

      **DONE.** The "N of M minutes" line existed and rendered only when the run-console had
      supplied a `budgetMs` — which arrives after the console is fetched and only when the run
      record carries a ceiling. So for the opening stretch of every run, and for any run whose
      console read failed, the screen showed a clock counting up against nothing.

      The chosen length is known from the moment the run starts, so it stands in until the console
      catches up, and the ceiling now appears on the ELAPSED COUNTER itself — the place a person
      actually looks for the time — as `12:34 / 30:00`.

      An out-of-range settings value is treated as ABSENT rather than clamped: settings are data
      off the wire, and rendering "of 60 minutes" for a run configured at 600 is a confident wrong
      number that would make an operator stop waiting early. No ceiling is the honest answer.

### Phase E — the AI variant generator

- [ ] **E1** Fix the truncated JSON (§1.4). Raise the token ceiling, and make a parse failure
      degrade to the deterministic variants rather than to zero — Bell reported "Tried 0 variants"
      after generating 14, which means a parse failure discarded the deterministic list too.
- [ ] **E2** A parse failure must be visible as a *capability* loss, not a log line. It silently
      halved address matching on both reference runs.

---

### Phase F — the address intake

**Check the premise first — most of this is already built.** `AddressAutocomplete.tsx` exists, uses
Google Places `AutocompleteService` + `PlacesService`, extracts county / city / state / ZIP from the
address components, degrades to plain typing when the key is absent, and **is already mounted in the
research intake** (`_tabs/ProjectsTab.tsx:19`). The form already carries `city`, `county`, `state`
and `zip`. So the request as stated — "we do not have autocomplete" — is not what is wrong.

- [ ] **F1** Find out whether it WORKS in production, in a browser. A server-side probe cannot tell
      you: the key is referer-restricted, so `curl` against the Places REST API returns
      `REQUEST_DENIED — API keys with referer restrictions cannot be used with this API`, which is
      the correct and expected answer for a browser key and says nothing about the browser path.
      **Verify by typing in the field on the deployed site.** This repo has fixed a Maps referer
      allowlist four times, most recently for a missing `www`.
- [ ] **F2** If it is denied in the browser, the fix is the GCP key configuration (referer
      allowlist + which APIs are enabled on the project), not the component. Record which it was.
- [ ] **F3** Confirm every structured field the owner asked for actually lands on the project:
      street number + road, city, county, state. `county` is the one that matters most — it routes
      the whole run, and a wrong county researches the wrong courthouse.
- [ ] **F4** The same treatment for the RE-RUN dialog, which today offers four free-text fields with
      no autocomplete at all. A corrected address typed there should be structured the same way.

### Phase G — give the run what the operator already knows, before it starts

- [ ] **G1** Files and images attached BEFORE the run. The plumbing exists and is unused: the worker
      has accepted `userFiles` since it was written, the pipeline route now forwards them, and
      `useRunState.start()` puts them in the POST body — but nothing in the UI collects them at
      start time. `DocumentUploadPanel` uploads to an EXISTING project; this is the pre-run case.
- [ ] **G2** The re-run dialog gains the same: attach a file, and free-text notes already exist
      there. A survey the client emailed is the single most useful thing a run can be given.
- [ ] **G3** Whatever is attached must reach the extraction pass, not merely be stored. Storing a
      file the AI never reads is the shape of defect this plan is full of — assert the caller.

---
## 3. Things this work must not do

- **Do not tune a percentage.** The ladder derives every share from a duration; a percentage that
  disagrees with its duration is how a bar starts lying. Change `expectedSec`, measured from a real
  log, and let the shares follow.
- **Do not let an unrecognised phase name move the bar.** That inversion is the whole fix for the
  92% class of bug.
- **Do not claim a county is supported because a registry entry exists.** `research-modes.ts` carries
  `notWiredYet` for exactly this reason.
- **Do not report a run complete before its documents are written.** That is now enforced; keep it.

## 4. Verification

- `npm run type-check`, `npm run lint`, worker `vitest run`, app `vitest run __tests__/research`.
- `npm run build` before any merge — tsc and the suite have both been green while the production
  build was broken.
- Browser QA before any UI slice is called done.
- The worker auto-deploys from `main` (systemd timer, ~15 min). Confirm with `buildSha` on
  `/healthz` — health alone is not proof, a stale container answers happily on the old build.

## 5. Slice log

- **2026-09-02** — Progress pacing rebuilt from two real logs, three satellite zoom bands, run length
  15/30/60 with the bar paced to it, and completion that waits for documents (`f3cc53831`).
  Worker 1,925 tests green.

- **2026-09-02** — A3 (dead-host gate) and the Coryell registry correction. Plus an orphan-guard
  breach that turned out to be about this plan's own subject:

  `npm run verify:orphans` had been red at 63 against a ceiling of 61 since `1499ca1cb`, the commit
  that rebuilt Research & Analysis as one view. Walking main commit by commit found the crossing
  exactly there: the rebuild replaced four panels with `ResearchRunView` and left the old ones in the
  tree. Not the usual "authored but never wired" — this was code wired, then UNWIRED by its own
  replacement. Same signature at the scan, opposite cause.

  **Re-pointing the guards found two features that had already been silently dropped**, and this is
  the part worth keeping:

  - `paidDocumentsNotice` — the analyze route still computed "why this run could not buy documents"
    and put it on the response, and after the rebuild **nothing fetched that route at all**. The
    reachability guard was independently reporting the route as dead. Two guards describing one lost
    feature from opposite ends, and it is the exact question the TexasFile work exists to answer.
  - `usageFailed` — the run-console route still sent "the spend read errored" and nothing read it, so
    a run whose usage query failed displayed a confident total instead of admitting the gap.

  Both restored through `useRunState` -> `run-state.ts` -> `ResearchRunView`, then all five guards
  re-pointed at the live code, then the dead files deleted — in that order, because the note in
  `research-modules-are-reachable.test.ts` had set exactly that condition: deleting first "would not
  remove a vacuous guard, it would remove the guard entirely".

  **OWNER CALL, still open:** `ResearchAnalysisPanel.tsx` (1,298 lines) was deleted and then put
  back. Its own registry entry marks removing it an owner decision — its subject is the Review stage,
  not the run, and it was already dead before the rebuild. That is why the orphan ceiling reads 61
  and not 60. Its one unique feature, the paid-documents notice, no longer depends on it, so deleting
  it is now a clean removal rather than a loss. Say the word and it goes.

  App 27,899 tests green; worker 1,942 green; both typechecks clean; orphan and hex ratchets green.
