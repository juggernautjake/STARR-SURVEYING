# Bought documents survive the run; a plat want buys a plat; the loop runs — 2026-09-07

**Started** 2026-09-07 · **Branch** `claude/review-documents-tab-2026-09-07` (continues from
`PLATS_FIRST_AND_VIEWER_2026-09-07.md`, Phase 8) · **Owner's standing permissions for this doc
(2026-09-07, verbatim):** *"Please fix any issues you find and correct them. You have my permission to
create planning documents in the in progress folder as needed so that the stop hook can build everything
step by step. Then you also have my permission to merge the changes. Then you have my permission to do up
to three more runs with the aforementioned budget if you need to. The main goal is to get the subdivision
plat and most recent deeds and anything with meets and bounds. … You also have permission to automatically
apply any sql seed files on supabase if needed."* And: *"Everytime you do a run again, please delete the old
one and do a fresh run."* Budgets: **TexasFile $20, everything else $5** (RerunDialog opens on these).

Driven by the stop-hook slice loop, **in order**. Ship the smallest meaningful slice, `tsc` + lint + test,
commit, push to the branch. `npm run build` before each merge. Merges to `main` are AUTHORISED for this
work (the netcup timer rebuilds the worker; **never while `/healthz activePipelines` > 0**). Live probes:
`ssh root@152.53.48.240`, `docker exec -w /app starr-research-worker-1 node <script>` importing
`/app/dist/...`. Supabase: PostgREST + service key from `.env.local`; seeds via node-pg + `SUPABASE_DB_URL`.

## What run 3 (project `d799e026…`, 2026-09-07) established — measured, not inferred

- The plats-first path works live (buy order → plat search → owned plat re-opened at $0 → "Plat verified"
  → filed → rendered from the PDF). The viewer's ‹ › arrows and Copy-all work on production.
- **The plat and the bought deed are GONE from `research_documents`** (11 rows for the project, none
  labelled WINNIE MAE, none for 2020064728; the filing tally said "13 new document(s) filed"). Cause: the
  county-specific completion step (`index.ts` "2. Delete previous property_search document rows") DELETES
  every `property_search` row for the project and step 4 re-creates only what the county RESULT carries —
  the TexasFile plat and TexasFile deeds are not in the county result, so they are destroyed at the end
  of every dedicated-county run. (The generic branch had this exact defect removed on 2026-09-02 — B2.)
- The final pass's **"All plats" want bought a DEED** (2020064728, on another property) and the ledger
  recorded it as `document_type: 'plat'`: `wantsToPurchaseRecommendations` gives a plat want no
  `vendorProduct: 'plat'`, so the adapter ran the deed search by owner name.
- The early pass's plat is unknown to the final pass (`knownDocuments` is built from the county result
  + CAD deed history only), so a plat want could re-buy/re-open it instead of reporting "already held".
- The worker-driven Analyze skipped every document: the container had no `APP_BASE_URL` (now set on
  the host, `/opt/starr/worker/.env`, container recreated). And when the drive fails, nothing restores
  the project's status — it stays parked at `analyzing` (the analyze route then answers 409).
- The relevance validator "REMOVED" the affidavit 2015014567 (EVERS JONATHAN → PALOMBI, heirship?) as
  unrelated. Today that removal only trims the in-memory list; the row was then swept by the delete
  above. With the delete gone, an "unrelated" document needs an honest marker, not silent deletion —
  it may well be part of this lot's chain (Adrianne Caffrey EVERS is on the CAD owner line).

## Slices

### A — Stop deleting what the run filed ✅
Remove step 2 (the `property_search` delete) from the county-specific persist. Step 4's
`uploadPipelineArtifacts` already goes through the project library (instrument in `recording_info`/label,
content sha) and answers `merged` for a row filed during the run, so nothing double-files. Guard: no
`.delete()` on `research_documents` scoped to a whole project remains in `index.ts`.

### B — A plat want searches PLAT records ✅
`wantsToPurchaseRecommendations`: a `plat` want carries `vendorProduct: 'plat'`, its search key is the
subdivision (`searchName` stays undefined), and the ledger/label say plat only when a plat was sold.

### C — The final pass knows what the early pass bought ✅
`listRunPurchases(projectId, runId)` on the ledger; `finalPurchasePass` seeds the orchestrator's
`boughtThisRun` (instruments + GUIDs) and the wants' `knownDocuments` from it, so a plat already re-opened
this run answers "already held by this run", never a second re-open.

### D — A failed worker-driven Analyze does not strand the project ✅
`read-documents` `thenAnalyze`: when the drive did not finalize, set `research_projects.status = 'review'`
and say so in the log. (The app parks `analyzing` on the worker's 202; only the worker can un-park it.)

### E — Unrelated documents are MARKED, not deleted ✅ (seed 631 was already live: relevance + relevance_classification; no new seed)
Seed 631 (already live) carries `relevance` (`subject | adjoiner | unrelated | unknown`) and
`relevance_classification` ({ by, at, reason }). The validator returns what it removed (instrument + reason)
as `summary.unrelated`; Bell carries it on `deedsAndRecords.unrelated`; the persist step marks those rows
`relevance = unrelated` with the reason. UI: an "Unrelated" badge (tooltip = reason) on the Research list,
the Analysis rows and the Review Documents tab; the whole-project quote and the worker's read pass leave
them out (`relevance.is.null,relevance.neq.unrelated`).

### F — Verify, merge, deploy ✅ (main c55ae3ff9, 2026-09-07)
Worker + app suites, tsc both, `npm run build`, merge to `main`, watch Vercel (`/api/app/version`) and the
worker (`/healthz buildSha`, timer defers while a run is in flight).

### G — Run 4: fresh project, the loop (up to three runs authorised) ⏳
Archive `d799e026…`; New project (1401 North East, Belton, Bell, parcel 64567, owner "EVERS, JONATHAN");
run: paid on, All files, TexasFile $20, other $5, 30 min. Watch: plats first → owned plat $0 → verified →
name search refuses the FRENCH ADDITION row ("no TexasFile results on WINNIE MAE ADDITION among N row(s)")
→ the second want says "already held by this run" → spend line + "Research complete" only AFTER the
purchase pass → the plat/deed rows SURVIVE (query `research_documents`) → Analyze (worker-driven, now with
APP_BASE_URL) → Discovered Leads → one follow-up round. Goal: the subdivision plat, the most recent deeds,
anything with metes and bounds.

## Status
| Slice | State |
|---|---|
| A stop deleting filed rows | ✅ built + tested |
| B plat want → plat search | ✅ built + tested |
| C final pass knows the early buys | ✅ built + tested |
| D failed Analyze restores `review` | ✅ built + tested |
| E unrelated = marked + badge (seed 631 already live — no new seed) | ✅ built + tested |
| F verify + merge + deploy | ✅ main c55ae3ff9 → d319e8dc0 (H–N) → f62eb4c63 (O, P); Q/R committed on the branch, merge after the run-5 loop |
| G run 4 ✅ (2321a1f7, archived) → run 5 ✅ (74dc0e02: H–P proved at $0) → Analyze (in progress: deeds read by the tiled reader, staged finalize) → leads → follow-up | ⏳ |

## Run 4 (project `2321a1f7…`, 2026-09-07, 558 s, TexasFile $8 of $20, other $0.02 of $5) — proved and exposed

**Proved:** A–E live. The purchase pass ran BEFORE the tally ("14 new document(s) filed"), the meters and
"Research Complete"; the plat re-opened with "Re-opened 1 page(s) … at no charge"; "Plat verified"; the
affidavit was "marked 2015014567 unrelated" and kept; the table holds 19 rows INCLUDING the plat (with its
PDF) and the deeds; the Analysis quote lists 18 files (the unrelated one left out); the worker-driven
Analyze runs document by document on the app (APP_BASE_URL). The Review Documents tab and its viewer
walk work on production.

**Exposed (slices H–M, built + tested on the branch):**

### H — A document held by ANOTHER project is re-opened and filed here ✅
The early pass said "search_required is already in the library (bought … for $0.00) — not buying it
again" — the plat was owned by the archived project, so nothing was filed on this one until the final
pass's plat want. TexasFile re-opens an owned document for $0, so `heldElsewhere` (owner ≠ this project,
platform TexasFile) now proceeds to the vendor with the library's GUID as `vendorRef`; only a document THIS
project holds is skipped.

### I — What the project already HOLDS is excluded from the vendor search ✅
The "all deeds" want paid $3 for 2004034968, which the free clerk pass had captured. The orchestrator now
seeds the chooser's exclusions with the held index's identifiable instruments (`heldDocuments.all()`), not
only the run's ledger.

### J — The chooser knows what the want is FOR ✅
The easement want bought a deed; the deed want a five-page unknown with a blank legal. `wantType` rides
orchestrator → adapter → chooser: an easement want takes only easement/right-of-way rows; a deed want only
a conveyance (never a lien/deed of trust), and a blank-legal row only when its type is a deed; nothing
left → null with a sentence naming the kind wanted.

### K — The ledger keys a GUID-only document by its GUID ✅
"search_required:plat" → `texasfile:<GUID>`: the adapter returns `vendorRef` (the GUID sold), the
orchestrator keys the ledger and the exclusions on it.

### L — The end-of-run artifact step files inside a filing context ✅
With the blanket delete gone, step 4 (outside the run's filing window) wrote a second row for every
screenshot and for the clerk deed. `persistCountyResults(projectId, r, runId, county)` opens a filing
context (`beginFiling` with the run id + round) around step 4 and closes it with the tally, so the library
answers "merged" for what the run already filed.

### M — The read pass takes deeds, plats and easements before screenshots ✅
Rows came back in filing order (aerials first); a cap now lands on the aerials, not the instruments.

**Still to prove live (run 5, fresh project):** H (plat filed by the EARLY pass on a project that does not
own it), I (no $3 re-buy of the clerk deed), J (easement want → "no TexasFile results … of
easement/right-of-way type"), L (no duplicate rows), then Analyze → leads → follow-up.

### N — The review's read pass caps on ITS spend, not the project's ✅
Run 4's review: "0 document(s) read … 8 left unread because the run reached its ceiling" — `spendForRun`
(the worker's per-project accumulator) still carried the research run's $8 of purchases against the $7
review cap, so the deeds and the plat stayed `pending` and only the aerials were analysed. The cap is
now measured from the review's own start (`spendAtStart`), as the driver already did.

### O — The finalize runs in STAGES, each under one Vercel invocation ✅
Run 4's review: 14 awaited per-document chunks completed, then the ONE finalize call (chain of title,
cross-reference + discrepancies, 3-pass coherence review) hit Vercel's function limit → HTTP 504; the
worker's un-park (slice D) put the project back at `review` with no chain of title. The worker now asks
for the finalize a stage at a time — `finalizeStage: 'chain' → 'crossref' → 'coherence'` — each an
awaited call; only the last ends the project at `review`. A person's button still runs the whole
finalize (the gates are open when no stage is named). Route accepts a stage only from the worker.

### P — "Mark unrelated" is a SELECT then an UPDATE by id ✅
The repo guard `update-filters-cannot-use-or` (PostgREST rejects `.or()` on an UPDATE) caught slice E's
update; it happened to work on run 4 but the rule stands. Rows are found with the `.or()` on a SELECT and
updated by id.

## Run 5 (project `74dc0e02…`, 2026-09-07, 581 s, TexasFile $0.00 of $20, other $0.02 of $5) — proved

H: "in the firm's library (bought … by another project) — re-opening it at no charge to file it on this
project" → the plat filed by the EARLY pass. I: the clerk-held deed 2004034968 was NOT re-bought. J: the
easement want → "no TexasFile results on WINNIE MAE ADDITION of easement/right-of-way type among 39 row(s)
… neither is bought"; the deed want took the blank-legal DEED row, which TexasFile named as an existing
purchase → re-opened at $0. L: "artifact step — 4 new document(s) filed. 1 were already held". P: "marked
2015014567 unrelated (1 row(s))". 19 rows, wallet unchanged at $46.

Two $0 leaks remained → **Q** (the final pass re-opened + re-filed the plat: the ledger's unique key is
county + instrument, so the early re-open on a project that does not own it writes no row and
`listRunPurchases` cannot see it — now a plat want is dropped when the project's own rows already hold the
subdivision's plat) and **R** (the artifact step re-filed both Google Maps captures: a re-encoded screenshot
has a different hash and no instrument — now the same label + source on the same project is the same
document). Both built + tested; not yet merged.

### S — The read pass leaves unrelated documents out ✅
Run 5's review read the FERRELL deed (163k chars, "good") and then spent its tiles on the ten-page
affidavit the relevance check had rejected, ahead of the plat and the bought deed. The re-read selection
now carries the same `relevance.is.null,relevance.neq.unrelated` filter as the chunk list and the quote.
