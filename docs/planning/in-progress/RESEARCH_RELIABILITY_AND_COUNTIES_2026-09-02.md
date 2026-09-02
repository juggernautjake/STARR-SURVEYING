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
- [ ] **A4** Coryell: same treatment. `esearch.coryellcad.org` + `gis.bisclient.com/coryellcad/`.
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
- [ ] **A5** Register both in the GIS-capture path so `capture-plan.ts` can photograph their viewers
      (it reads `BIS_CONFIGS[county].gisBaseUrl`; confirm both counties resolve).
- [ ] **A6** Tests: the adapter registry answers for both counties, the router routes to them, and
      the capture plan produces a `cad_gis` capture for each. Structural tests only — a live portal
      test is not reproducible and the portals were down during the reference runs.

### Phase B — every document, filed once, immediately

- [ ] **B1** `[Library]: 0 new document(s) filed. 1 could not be written.` A document was captured
      and could not be persisted, and the run completed anyway. Find out why one row failed, and make
      the reason reach the screen — "could not be written" with no cause is the shape of the
      22-documents-advertising-a-missing-file defect.
- [ ] **B2** Verify the immediacy guarantee holds for the GENERIC pipeline as well as Bell. The nine
      guards in `documents-are-filed-immediately.test.ts` cover the Bell orchestrator's seven
      incremental call sites; the generic pipeline's path is not yet asserted.
- [ ] **B3** TexasFile and every other source. `purchase-gate.ts` now decides *whether* a run may
      buy; what is not yet proven is that the paid path RUNS when allowed —
      `research_document_purchases` is still **0 rows**, and a free Bell run cannot prove the
      purchase path. Needs one deliberate paid run against a real property.

### Phase C — concurrency, guaranteed rather than observed

- [ ] **C1** Audit every piece of worker state for per-project keying. `activePipelines`,
      `runProgress`, `completedResults`, `completedLogs`, `filingContexts` and the spend ledger are
      all `Map`s keyed by `projectId`; the risk is anything that is NOT — a module-level singleton, a
      shared browser, a global tracing flag (`disableTracing()` takes no project argument), or a
      fixed `/tmp` path. Write the audit as a test that fails if a new global appears.
- [ ] **C2** A completing run must not tear down a live one. Check the completion path for anything
      global: `disableTracing()`, `globalStepGate`, browser teardown, and the queue poller's capacity
      accounting.
- [ ] **C3** Concurrency test at the shape level: two projects, interleaved lifecycle calls, asserting
      one's completion leaves the other's state intact.

### Phase D — the screen keeps telling the truth

- [ ] **D1** The bar's new pacing needs browser QA against a real run. A green suite has missed
      rendering bugs in this repo repeatedly.
- [ ] **D2** A run that reports **FAILED** and then **Pipeline Complete** in the same log (Milam,
      10:53 → 15:58). Decide which it is and say it once.
- [ ] **D3** Surface the chosen run length on the run view — "24 of 30 minutes" is only meaningful
      when the 30 is visible.

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
