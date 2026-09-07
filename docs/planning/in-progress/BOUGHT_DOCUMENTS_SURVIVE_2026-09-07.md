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

### F — Verify, merge, deploy ⏳
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
| F verify + merge + deploy | ⏳ |
| G run 4 + the loop | ⏳ |
