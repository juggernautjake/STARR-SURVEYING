# User-initiated iterative Research ⇄ Analysis loop — 2026-09-06

**Started** 2026-09-06 · **Branch** `claude/paid-first-rich-capture-viewer-2026-09-05`

Driven by the stop-hook slice loop, **in order**. Ship the smallest meaningful slice, `tsc` + lint + test,
commit, **push to the BRANCH**. Read the live code each slice touches first. Standing constraints:
`npm run build` before the owner's merge; **NEVER rebuild the worker while a run is in flight**
(`activePipelines` on `localhost:3100/healthz` must be 0); worker = Docker on netcup, rebuild from
`/opt/starr/worker` with `BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose up -d --build worker`.

## Why (owner, 2026-09-06)

> "Let's make it so that we have the basic research, and then we can run the analysis after. If the analysis
> finds more clues and details about chain of title and other stuff, then it should compile that information.
> Then we can initiate another run using that info to add to what we have already found." … "We will not
> automatically do the AI/OCR identifier fallback or iterative discovery loop. The user will be able to
> choose to do that if they want after the initial research run is completed."

So: **user-initiated**, round-based. Research gathers; Analysis reads + compiles NEW leads (chain of title,
referenced documents, adjoiners); the user reviews the leads and chooses to run ANOTHER research pass seeded
with them, adding to what is already held. Repeat until the user stops.

## What already exists (leverage, don't rebuild)

- **Chain-of-title gap finding** — `src/chain-of-title/chain-gaps.ts`: `findGaps(chain)` → `ChainGap[]`
  (`unfollowed_citation` = an instrument/vol-page a deed CITES but the run never retrieved), `citedInstruments`,
  `summariseChain`, `describeTermination` (a human next-step). `ChainOfTitleBuilder` is already built during
  analysis (index.ts ~5991). `findGaps`/`summariseChain` have NO callers outside the module — the leads are
  computed-able but never surfaced. This is the spine of the lead compiler.
- **Supplemental threading** — the run POST accepts `body.supplemental` (instrumentNumbers, volumePages) which
  `buildDiscoveryTarget` folds into the search target + the free-first buy + the clerk searches. A follow-up
  round seeds itself by putting the chosen leads here.
- **Cross-run library dedup** — `DocumentPurchaseOrchestrator` + `project-library.ts` skip re-buying / re-filing
  what a prior round already got, so a round only ADDS.
- **Cost attribution** — `enterRunContext(projectId)` + `recordAmbientAiCall` put every research-phase AI/OCR
  call on the run's spend automatically.
- **Five-stage flow + view navigation** — `page.tsx` renders Analysis + Review as distinct screens with
  view-only navigation; the leads panel mounts on Analysis.

---

## PHASE 1 — The lead compiler (worker, pure + wired)

### 1.1 — `DiscoveredLead` model + `compileDiscoveredLeads` ✅ BUILT + TESTED
New `worker/src/research/discovered-leads.ts`. A `DiscoveredLead` = `{ id, kind, value, label, sourceDocId?,
round, searched }` where `kind ∈ 'citation' | 'grantor_name' | 'adjoiner' | 'subdivision' | 'volume_page' |
'instrument'`. `compileDiscoveredLeads({ chainGaps, chainErrands, adjoiners, dataPoints, alreadySearched, round })`
returns de-duped leads NOT already searched. Pure, unit-tested.

### 1.2 — Feed the chain-of-title gaps + errands in ✅ BUILT (via errandsFromGaps in the compiler)
Call `findGaps` + the grantor-as-grantee errands (`chain-errands.ts` / `chain-walker.ts`) on the built chain,
map each unfollowed citation → a `citation`/`volume_page`/`instrument` lead and each prior grantor → a
`grantor_name` lead. Adjoiner data points → `adjoiner` leads; recording-reference / subdivision data points →
their kinds.

### 1.3 — Persist after analysis ✅ BUILT + TESTED (POST compile-leads endpoint)
When analysis finishes, write `analysis_metadata.discoveredLeads` (merged, not replacing) with the current
`analysis_metadata.researchRound` (default 1). De-dup against leads already present + already searched.

### 1.4 — Tests ✅ BUILT + TESTED
Fixtures: a chain with an unfollowed citation yields a lead; an adjoiner yields a lead; an already-searched
identifier is excluded; the compile is idempotent.

---

## PHASE 2 — Seeded follow-up research (worker + app plumbing)

### 2.1 — Accept selected leads on the run POST ✅ BUILT + TESTED
The run start payload gains `followUpLeads?: DiscoveredLead[]` (or reuse `supplemental`), merged into the
DiscoveryTarget: `citation`/`volume_page` → volumePages; `instrument` → instrumentNumbers; `grantor_name`/
`adjoiner` → an owner-name search; `subdivision` → the plat search.

### 2.2 — Round tracking ✅ BUILT + TESTED
Increment `analysis_metadata.researchRound` when a follow-up run starts; tag the round on the run record so
documents/data can show which round found them. Mark the seeded leads `searched: true`.

### 2.3 — Dedup against what is held ✅ BUILT + TESTED
A follow-up round must only ADD — rely on the cross-run library for documents, and skip a lead whose target is
already in the held set. Log what was skipped.

### 2.4 — Tests ✅ BUILT + TESTED
Leads map to the right search inputs; the round increments; a re-run does not re-search a `searched` lead.

---

## PHASE 3 — UI: the Discovered Leads panel + the follow-up run

### 3.1 — `DiscoveredLeadsPanel` ✅ BUILT + TESTED
Reads `analysis_metadata.discoveredLeads`, groups by kind, shows each lead's label + where it came from, with a
checkbox (default all selected) and a running count. Empty state: "Analysis found no new leads to chase."

### 3.2 — Mount it on the Analysis screen ✅ BUILT + TESTED
Under the five-stage split, the panel appears on the Analysis stage once analysis is complete (below the
Analyze controls), so the loop reads left-to-right: analyze → see leads → run follow-up.

### 3.3 — "Run follow-up research (N leads)" ✅ BUILT + TESTED
A button that opens the run-settings dialog PRE-SEEDED with the selected leads (as supplemental), so the user
sets budget/time and starts round N+1. On complete it lands on Analysis again.

### 3.4 — Round lineage ✅ BUILT (round shown) / per-document lineage deferred
The panel surfaces the current research round ("Currently on round N"), and the worker bumps + persists
`researchRound` each follow-up. Tagging each individual DOCUMENT with the round it was found in needs a
`research_round` column on `research_documents` (a schema change) — deferred until the owner wants
per-document provenance; the round-level indicator covers the user's "which round am I on" need today.

### 3.5 — Tests ✅ BUILT + TESTED
The panel renders leads from analysis_metadata; the follow-up button seeds the dialog; the caller wires the
panel (check the CALLER).

---

## PHASE 4 — User-initiated AI/OCR deep-read (the 4.1 fallback, now a button)

### 4.1 — "Deep-read for more clues" action
A user-triggered pass that runs the AI/OCR identifier extraction over the captured deed/plat/GIS documents to
pull subdivision / survey / lot-block / recording references the structured parse missed, appends them to
`discoveredLeads`, and (via `recordAmbientAiCall`) puts the AI cost on the run spend. Bounded + cost-capped.

### 4.2 — Tests
The deep-read adds leads; every AI call lands a usage-ledger row; it is never automatic (only the button runs it).

---

## PHASE 5 — Verification (then owner merge + worker rebuild)

### 5.1 — Green + build
Full worker + app suites green; tsc + lint clean; `npm run build` clean.

### 5.2 — Self-review (check the CALLER)
Analysis actually compiles + persists leads; the panel mounts + reads them; the follow-up run seeds the target;
the deep-read is user-only. No authored-but-not-wired gaps.

### 5.3 — Ready-for-owner note
Annotate READY; owner merges, rebuilds the worker (only when `activePipelines=0`), and drives the loop on 1401
North East St. Then move this doc to `completed/`.
