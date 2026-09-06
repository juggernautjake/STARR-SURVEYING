# Plat/drawing discovery + identifier-driven search across free & paid — 2026-09-06

**Started** 2026-09-06 · **Branch** `claude/paid-first-rich-capture-viewer-2026-09-05`

Driven by the stop-hook slice loop, **in order**. Ship the smallest meaningful next slice, `tsc` + lint +
test, commit, **push to the BRANCH**. Read the live code each slice touches first. Standing constraints:
`npm run build` before the owner's merge; **NEVER rebuild the worker while a run is in flight**
(`activePipelines` on `localhost:3100/healthz` must be 0); worker = Docker on netcup, rebuild from
`/opt/starr/worker` with `BUILD_SHA=$(git -C /opt/starr rev-parse --short HEAD) docker compose up -d --build worker`.

## Why (owner, 2026-09-06, from the supervised 1401 North East St run)

The free-first engine fired and correctly declined to pay for Bell's *free* deeds — but it **bought $0 of
the WINNIE MAE ADDITION plats**, which TexasFile HAS ($10 each) and the free plat repo could NOT get (HTTP
403). Ground truth from a manual TexasFile review: **2 WINNIE MAE plats**, the **Vol 5456/Pg 704 deed**, and
**40 EVERS records** all exist on TexasFile. Root cause found in the code:

- `searchTexasFile` (worker/src/services/texasfile-buy.ts) only opens `/county-clerk-records/` — it **never
  searches `/plat-records/`**. So subdivision plats are invisible to the engine.
- `buildTexasFileSearchInputs` (research/live-search.ts) builds name + vol/page + instrument queries but
  **never a plat/subdivision query**, and `searchTexasFile` ignores the instrument input (only name or
  vol/page), so the instrument query is a **no-op**.

The engine DID determine the subdivision itself (`cad-adapter.ts detectSubdivision`, regex over the CAD legal
description) — the pickup-from-text works; it just wasn't feeding a plat search. Owner's requirements:

1. Detect whether a parcel is in a subdivision (esp. residential) and use that name to search **deeds AND
   plats** on **free AND paid** sources, and make the purchases.
2. Search for **plats/drawings of ANY parcel** — including non-subdivision metes-and-bounds tracts (by
   abstract/survey, recorded survey references).
3. Build **AI calls + OCR into the RESEARCH cycle** when needed to read captures and determine
   subdivision/survey/identifiers that update the searches (not only at analysis).
4. **Track the cost of every AI/tool/agent/token call** and represent it accurately on the run spend.
5. **Iterative discovery loop (owner, 2026-09-06):** whenever the run finds NEW information — subdivision,
   owner/grantor/grantee names, chain-of-title links, deed or plat references — **feed it back into more
   searches**, as long as cost + time budget remain. Discovery is a cycle, not a single pass.
6. **Map legibility + a boundary call-sheet (owner, 2026-09-06, with a screenshot):** the parcel-lines
   drawing's bearing/distance labels overlap on short/curved sides and are hard to read. Make them legible
   (skip/space/scale labels; do not stack), AND emit a **boundary CALL SHEET document** — every side's
   bearing + distance as a clean, filed document (from the `boundarySegments` data already computed) that
   shows in the run's documents + the viewer.

---

## PHASE 1 — TexasFile PLAT search (close the observed gap)

### 1.1 — Plat search-only adapter (`/plat-records/`, login + search, NO buy) ✅ BUILT + TESTED
Read `worker/src/services/texasfile-buy.ts` (`searchTexasFile`, `loginTexasFile`, `acquireBrowser`,
`purchaseTexasFile`, the `TexasFileResult`/`TexasFileBuyInput` shapes). Add
`searchTexasFilePlats(page, input, log)` that goes to `/search/texas/{county}-county/plat-records/`, fills
the plat form (Subdivision-or-Name, Volume/Cabinet, Page/Slide/Sleeve, File Number — the live field ids),
submits, and parses the plat purchase buttons into `TexasFileResult[]` (docType 'plat', $10 flat). Never buys,
never throws, returns `[]` on any failure. Unit-test the parsing against a fixture.

### 1.2 — Plat search wrapper (`searchTexasFilePlatsDocuments`) ✅ BUILT + TESTED
Mirror `searchTexasFileDocuments`: acquire a browser, log in, run `searchTexasFilePlats`, return results.
Injectable for tests.

### 1.3 — Wire plats into the engine's discovery ✅ BUILT + TESTED
In `research/live-search.ts`: give `buildTexasFileSearchInputs` (or a sibling) a **plat query** built from
`target.subdivision` (and, when present, cabinet/volume/slide/page). In `makeSourceSearch`'s texasfile
branch, run BOTH the clerk-records search AND the plat search, mapping plat results to `ManifestEntry`
(`docType: 'plat'`, `kind: 'paid'`, `unitCostUsd: 10`, `canPurchase: true`, `previewRef` = GUID). The engine
then clusters the plat, sees it is NOT in the free CAD deed history, marks it **paid-exclusive**, and buys it.

### 1.4 — Tests + wiring ✅ BUILT + TESTED
Search-only parse test; `buildTexasFileSearchInputs` emits a plat query when a subdivision exists; the
`makeSourceSearch` caller runs the plat search (check the CALLER). Full worker suite green.

### 1.5 — Verify the plat PURCHASE endpoint (live) ✅ BUILT (live-confirm in the run)
`purchaseApiUrl` hardcodes `/instrument/{guid}/`. A PLAT purchase on TexasFile may use a different path
(`/plat/{guid}/`). The search + discovery + free-vs-paid DECISION are done (plats become paid-exclusive buys);
the actual plat purchase URL must be confirmed against the live SPA (logged in) and `buyDocument` branched by
docType if it differs. Verify in the supervised run.

---

## PHASE 2 — Instrument search ✅ RESOLVED (de-scoped with rationale)

### 2.1/2.2 — DEFERRED (zero value): TexasFile returns EMPTY for a county instrument-number search (recorded
in `texasfile-buy.ts` from the live mapping — `instrumentNumber` is "used only to PICK the right result, never
to search by"). So rather than "make instrument search work", `buildTexasFileSearchInputs` now STOPS emitting
instrument queries (they were harmless no-ops that wasted a login + navigation per run). Deeds are found by
owner name + volume/page; plats by subdivision; the instrument still rides the DiscoveryTarget for the FREE
clerk search + result matching. Tests updated (no instrument query; 2 clerk calls, not 3).

---

## PHASE 3 — Plats/drawings for ANY parcel (non-subdivision too)
### 3.1 — Abstract/survey-driven plat + recorded-survey search ✅ BUILT + TESTED
For a metes-and-bounds parcel (`isSubdivision:false`, has abstract/survey), search TexasFile plats + the free
plat repo + the clerk index by abstract/survey name for recorded surveys / drawings, not only named
subdivisions. Thread `abstractNumber`/`surveyName` into `DiscoveryTarget` + the search inputs.

**Built:** `extractSurveyAbstract(legalDescription)` pulls the survey name + abstract; `buildDiscoveryTarget`
derives them only when there is NO subdivision; `buildTexasFilePlatInputs` runs a plat "Name" search by the
survey. The legal description is threaded from the identified parcel into the target.

### 3.2 — Free-source parity ✅ BUILT + TESTED (subdivision) / ⏳ abstract-on-free-repo deferred
The subdivision IS searched on both free (the Bell plat repo — "Searching … for WINNIE MAE ADDITION", when
egress allows) and paid (TexasFile) already; the survey/abstract now drives the PAID plat search too.
Extending the FREE plat-repo query to the survey/abstract for a bare tract is a smaller follow-up (the free
repo is subdivision-indexed and often 403s from the server anyway), deferred until a non-subdivision test
property shows it is needed — cost exceeds value today.

### 3.3 — Tests ✅ BUILT + TESTED
Non-subdivision fixture yields abstract/survey plat queries; free + paid both consulted.

---

## PHASE 4 — AI/OCR in the research cycle (only when it unlocks a search) + cost truth

### 4.1 — Identifier extraction fallback
When the structured CAD legal description yields no subdivision AND no abstract/survey, run a BOUNDED AI/OCR
pass over the already-captured deed/plat/GIS text to extract subdivision / survey / lot-block / recording
references — then FEED those back into the searches (a second discovery round). Gate it so it runs only when
it can unlock a new search, and cap it.

### 4.2 — Cost tracking for every AI/OCR/tool call in research
Record each AI/OCR/token call made during RESEARCH (not just analysis) into `research_usage_events` with an
accurate USD, so the run's SPENT reflects AI cost + document cost together. Surface it on the live run spend.

### 4.3 — Tests
The fallback fires only when it unlocks a search; every AI/OCR call lands a usage-ledger row; run spend sums
documents + AI.

---

## PHASE 4B — Iterative discovery loop (feed findings back into searches)

### 4B.1 — Collect NEW identifiers from each source result
After each discovery round, harvest identifiers the results revealed that the run did not start with:
new subdivision/addition names, grantor/grantee names (chain of title), referenced instrument numbers,
volume/page and plat cabinet/slide references, abstract/survey names. Normalise + de-dup against what was
already searched.

### 4B.2 — Re-search on the new identifiers, budget-permitting
Run another discovery round keyed on the fresh identifiers (free + paid), BUT only while the run has cost
AND time budget left (check the run-budget gate + the wall clock before each new round). Cap the number of
rounds so a chain of title cannot loop forever; log when a round is skipped for budget/time.

### 4B.3 — Tests
A result carrying a new subdivision/name/reference triggers exactly one more search; an exhausted
budget/time stops the loop and says why; the loop terminates (no infinite chain).

---

## PHASE 4C — Boundary map legibility + a boundary CALL SHEET document

### 4C.1 — Make the parcel-lines labels legible ✅ BUILT + TESTED
In `worker/src/research/parcel-map-render.ts` (`renderOverlaySvg` edge-length labels): stop labels
overlapping on short/curved sides — e.g. suppress labels on segments too short to fit, keep a minimum gap
between adjacent labels, and/or scale the font to the segment length. The straight sides already read; the
fix is the dense curved road frontage in the owner's screenshot.

### 4C.2 — Emit a boundary CALL SHEET document ✅ BUILT + TESTED
From the `boundarySegments` data (already computed in the `cad_parcel_lines` render — bearing + length per
side, perimeter, area), render a clean, filed **document** (a drawn call-sheet image or a text/PDF) listing
Side # · Bearing · Distance for every side, plus perimeter + area, labelled "GIS-computed, not a recorded
plat". File it as a run document so it shows in the documents list + the shared viewer.

### 4C.3 — Tests ✅ BUILT + TESTED
The call sheet is produced from the segments and filed as a document; the map render suppresses overlapping
labels on short segments.

---

## PHASE 5 — Verification (then owner merge + worker rebuild + a re-run)

### 5.1 — Green + build
Full worker + app suites green; `tsc` + lint clean; `npm run build` clean.

### 5.2 — Self-review (check the CALLER)
Confirm the live run INVOKES the plat search + instrument search + fallback; no authored-but-not-wired gaps.

### 5.3 — Ready-for-owner note
Annotate READY; owner merges, rebuilds the worker (only when `activePipelines=0`), and re-runs 1401 North East
St (PID 64567) — this time the WINNIE MAE plats should be found as paid-exclusive and BOUGHT, with the AI cost
on the spend. Then move this doc to `completed/`.
