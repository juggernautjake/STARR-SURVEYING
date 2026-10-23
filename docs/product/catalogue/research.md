# Research engine (Starr Recon): catalogue overview

Catalogue entries: `research.json` (37 entries, `area: "research"`). Everything below is read from code and seeds; nothing was run. County counts come from counting entries in the cited tables (accurate to about one county; the sets are hand-edited and a few sit behind comments).

## 1. What it is for

Given an address, a job, a parcel id or an owner, the engine finds the property at the appraisal district, pulls the recorded documents (deeds, plats, easements, liens) from the county clerk or a paid aggregator, adds free map, flood and road-right-of-way data, reads the documents with OCR and AI, reconciles the calls into a closing boundary, scores confidence, and hands a surveyor a dossier, drawing and field packet. The owner's goal is that this works for all 254 Texas counties, and later for other states.

Today it works well for exactly one county (Bell), reasonably for two more (Milam, Williamson) and, for the rest, it is a set of registries that say which vendor each county probably uses. Several of those registries have been shown to be wrong when someone drove the real site.

## 2. How the parts fit together

```
Next.js app (Vercel)                         Worker (Docker, rented box)
/admin/research  (portal, 7 tabs)            Express index.ts (8,776 lines)
 project hub (5 stages) ---HTTP proxy--->      counties/router.ts -> profile.ts (254 profiles)
 /api/admin/research/[projectId]/* (~55)         |- curated module: Bell, Milam, Williamson
 lib/research "lite" pipeline (duplicate)        '- generic services/pipeline.ts (stages 0-5)
                                               adapters/ (CAD + clerk vendors), sources/ (free data)
                                               services/ (AI, reconcile, confidence), reports/
                                               infra/ (queue, budget, circuits, health, canary)
```

- Two pipelines exist: the worker (declared canonical in `docs/platform/RECON_INVENTORY.md:23`) and the in-app lite pipeline in `lib/research`. The lite one is still reachable (`app/api/admin/research/[projectId]/lite-pipeline/route.ts`).
- The router asks `resolveCountyProfile` for one of three tiers: curated (dedicated module), vendor-default (generic pipeline with that vendor's shapes), fallback (aggregator only) (`worker/src/counties/profile.ts:114`, `router.ts:519`).
- Nine overlapping registries still name counties (curation plan section 1). They are asserted equal in CI for the curated counties only.
- Deploy: a systemd timer runs `worker/deploy/auto-update.sh` (lock, skip while a run is in flight, health check, rollback). Docs disagree on the host (Hetzner or droplet in RECON_INVENTORY, netcup in the owner-actions plan).

## 3. Main user journeys

1. Office or party chief opens a job, presses Research this Property, confirms inherited fields, picks free or paid mode and a budget, and starts a gather run (20 to 30 minutes, free sources first).
2. Watches progress (a duration-weighted bar; fixed after the "92% in seconds" bug), then reviews the documents list and starts AI review as a separate, estimated step.
3. Reviews data points, discrepancies and the boundary view, buys missing documents if offered, and exports DXF, PDF or a field packet.
4. Operator checks Coverage, runs the self-heal sweep, registers or probes a county site.

## 4. Coverage matrix (Texas, 254 counties)

State definitions: works = driven end to end on the live site and used by a run; partial = code exists and some counties proven, or reachable only for some inputs; missing = nothing queries it. "Configured" means a table names the county; it does not mean the site was driven.

| Source | Status | Counties covered (of 254) | Where the list lives | Notes |
|---|---|---|---|---|
| Appraisal district, BIS eSearch | partial | about 104 configured (103 keys in `BIS_CONFIGS`); driven: Bell, Milam (host corrected 2026-09-09) | `worker/src/services/bis-cad.ts:47`, `worker/src/lib/county-fips.ts` | One DOM pattern verified on one county then applied to 100+. Williamson's configured BIS host never existed. Bell CAD is geo-blocked from the server, so Bell CAD data is missing from runs. |
| Appraisal district, TrueAutomation / Tyler PublicAccess | partial | 3 in the FIPS table; Williamson (WCAD, curated, verified 2026-09-21); Bexar, Dallas explicit | `worker/src/lib/county-fips.ts`, `worker/src/services/cad-registry.ts:281`, `counties/williamson/wcad.ts` | RECON_INVENTORY says 15 verified; code does not show 15. |
| Appraisal district, custom (HCAD, TAD, DCAD, Travis, Hays, Comal) | partial | 6 explicit entries | `cad-registry.ts` (`reg(...)` calls) | Configured; not shown driven. |
| Appraisal district, no adapter | missing | about 145 (`texasfile_fallback`) | `county-fips.ts` | Fall back to Google plus a vision model (`generic-cad-adapter.ts`), which the code header itself calls unverified. |
| CAD discovery directory | works (data) | 241 of 254 have a website, 13 have none | `worker/src/research/cad-directory.ts:23` | Scraped from the Comptroller 2026-08-03; the right input for classifying the missing counties. |
| County clerk, Kofile / GovOS PublicSearch | works | 22 | `worker/src/services/clerk-registry.ts:58` | Cut from 53 to 22 after probing found 32 dead portals. Bell previews are 2550x3300 and free. |
| County clerk, Tyler Eagle | works | 9 (McLennan, Burnet, Hamilton, Hill, Mills, Erath, Navarro, Somervell, Williamson) | `worker/src/adapters/tyler-eagle-discovery.ts:63` | Driven 2026-08-02. |
| County clerk, Avenu 20/20 (uslandrecords) | works | about 19 (Madison also in Kofile) | `worker/src/adapters/uslandrecords-discovery.ts:102` | Falls and Robertson driven end to end; others listed. |
| County clerk, eDocTec | works | 2 (Coryell, Lampasas) | `clerk-registry.ts:144` | Fully open, driven. |
| County clerk, Aumentum (Bastrop) | partial | 1 | `worker/src/adapters/aumentum-clerk-adapter.ts:29` | Located; search button never driven to results (seed 557). Index only from 1973. |
| County clerk, iDocMarket (Bosque) | partial | 1 | `clerk-registry.ts:114` | Paid, $5/day plus $1/page; free 1847-1905 index has no adapter. |
| County clerk, CountyFusion | partial | about 10 configured, 12 hosts alive | `worker/src/adapters/countyfusion-adapter.ts:147` | Hosts answer on .us but every county needs a login; not routed. |
| County clerk, Henschen | missing | 16 configured | `henschen-clerk-adapter.ts:153` | All hosts ENOTFOUND (`scripts/check-adapter-hosts.mjs`). Not routed. |
| County clerk, Fidlar | missing | 6 configured | `fidlar-clerk-adapter.ts:220` | All hosts ENOTFOUND. Not routed. |
| County clerk, iDocket | missing | configured set exists | `idocket-clerk-adapter.ts:200` | Not routed; a paid subscription may still be billing. |
| County clerk, TexasFile (aggregator) | partial | all 254 by routing; 201 counties rely on it | `clerk-registry.ts:244` | Paywalled, $1/page; funded but no purchase has ever executed. Not a free path. |
| No online portal | missing | at least Lee, San Saba (paper only) | seed 557, `remaining-counties-survey.ts` | Distinct state `no_online_portal`. Others unhunted: Hays clerk not found. |
| Plat repositories (free) | partial | Bell (8,077 plats, 18.9 GB), Hays via CAD (about 8,051 TIFs) | `docs/tx-county-records-survey.html` | Only 4 of 254 survey rows filled. Bastrop is a viewer, not files. |
| County GIS parcels | partial | Bell (ArcGIS, works), Milam (scraper); BIS gis.bisclient.com probes for other BIS counties | `counties/bell/scrapers/gis-scraper.ts`, `counties/milam/scrapers/` | Williamson parcel layer not found; Williamson's gisweb has an expired certificate. |
| FEMA NFHL flood | works (statewide) | all (national service) | `worker/src/sources/fema-nfhl-client.ts`, `index.ts:7180`, Bell `fema-scraper.ts` | Wired on demand and in Bell; generic pipeline coverage not confirmed. |
| TxDOT right-of-way (RPAM) | partial (statewide) | all in principle | `worker/src/services/txdot-rpam-client.ts`, `row-integration-engine.ts:267` | Used in Bell scraper and Phase 6; weight 25 in call confidence. |
| Texas GLO land grants | missing | 0 | `sources/glo-client.ts`, `adapters/glo-land-grant-adapter.ts` | Written and tested, never called. The run plan claims `original_survey` is covered anyway (`research-modes.ts:89`, test `glo-is-planned-but-never-run`). |
| TCEQ | missing | 0 | `worker/src/sources/tceq-client.ts` | Imported at `index.ts:78`, never instantiated. |
| Railroad Commission (wells, pipelines) | missing | 0 | `worker/src/sources/rrc-client.ts` | Imported, never instantiated. |
| NRCS soils | missing | 0 | `worker/src/sources/nrcs-soil-client.ts` | Imported, never instantiated. |
| USGS topo | partial | all (national), on demand | `index.ts:7435` (`/research/topo`) | Separate endpoint, not part of the run. |
| Comptroller tax | partial | all, on demand | `index.ts:7525` (`/research/tax`) | Separate endpoint. |
| TNRIS LiDAR | partial | all, on demand | `index.ts:8371` | Separate endpoint. |

Roll-up from the code:

- Clerk records reachable by a proven free adapter: **53 of 254 counties** (22 Kofile + 9 Tyler Eagle + about 19 Avenu + 2 eDocTec + Bastrop + Bosque, minus the Madison overlap). The other 201 route to TexasFile (paid).
- Appraisal data with some adapter: about **109 of 254** configured (104 BIS + HCAD + TAD + 3 TrueAutomation); about 145 have none. Only Bell, Milam and Williamson are known to work end to end.
- Counties with neither a CAD adapter nor a free clerk adapter: about **130** (computed by overlapping the two sets).
- Curated profiles: **3** (Bell, Milam, Williamson). Vendor-default counties are those the registries mention; fallback is the rest.

## 5. The pipeline

Stage order is the owner's: drawings and plats first, overhead views second, other documents last (`worker/src/research/run-order.ts`). The generic pipeline is `worker/src/services/pipeline.ts`; the 13-rung progress ladder is `worker/src/research/run-phases.ts:88`.

| Stage | Produces | Failure modes seen |
|---|---|---|
| 0 Normalise address (`pipeline.ts:593`) | Structured address parts, road-name variants, county capabilities | AI variant generator returned truncated JSON; unparsed street names were typed into CAD search boxes |
| 1 Identify property (`:630`) | Parcel id, owner, legal description, acreage, coordinates from the CAD | Dead or geo-blocked CAD host (Bell geo-block; Williamson NXDOMAIN; Milam dead host cost 147 s); surfaced as "no records" instead of "could not reach" |
| 1.5 Visual evidence (`:955`) | Aerial and GIS captures, free plat lookup | Run has no coordinates when the CAD failed, found only at minute 23 before the reorder |
| 2 Retrieve documents (`:1010`) | Deeds, plats, easements, with identity dedupe | Wrong or dead portal URL (32 dead Kofile hosts), CAPTCHA or Cloudflare walls (no solver wired), paywall, 160-minute owner-name grinds before budgets existed |
| 3 OCR and AI read (`:1919`) | Calls, monuments, owners, references, multiple readings per call | Illegible scans, truncated model JSON; AI is a separate review step in the gather/review split |
| 3.5 Reconcile (`:2642`) | Closed boundary model, closure ratio, chain of title | Missing plat or deed data; only Bell routinely gets here |
| 4 and 5 Validate and synthesise (`:2752`, `:2782`) | Validation results, report, deliverables | Closure failure blocks the final report |
| Purchase (Phase 9, separate call) | Bought documents filed under identity | Unreadable settings are treated as deny; zero purchases ever executed |

**Confidence scoring** (two independent models):

- Worker, per call 0-100 (`call-confidence-scorer.ts:12`, `:149`): source multiplicity (1 source 5 up to 5 sources 25), source agreement (bearing and distance spread), source reliability (TxDOT ROW 25, deed extraction 22, reversed adjoiner call 19, plat segment 16, subdivision interior 14, adjoiner chain 10, plat overview 8, plat geometric 6, county-road default 4) and reading clarity. Grades A at 93 or more, A- 88, B+ 83, B 78 and so on, F below 43. Rolled up to lot, side and overall by `confidence-scoring-engine.ts:172`.
- App, per drawing element (`lib/research/confidence.ts:16`): source quality 20 percent, extraction certainty 25, cross-reference match 25, geometric consistency 20, closure 10; document tiers survey 95, plat 88, deed 85, appraisal 55, aerial 50.
- Closure tiers (`worker/src/lib/closure-tolerance.ts:8`): at least 1:10,000 excellent, at least 1:5,000 acceptable with warning, at least 1:2,500 marginal (reviewer click-through), below 1:2,500 hard fail. RECON_INVENTORY says the hard-fail line is 1:5,000, so the doc and code disagree.
- None of these weights is calibrated. The regression set holds one synthetic fixture and the canary table held zero rows.

## 6. Biggest problems

1. Configured is read as working. Nine registries, several wrong; the 2026-09 sweeps found 32 of 53 Kofile hosts dead, all Henschen and Fidlar hosts dead, and a CountyFusion typo that hid a live vendor.
2. Unknown rendered as an answer. "No records" for an unreachable portal; GLO listed as covered while nothing queries it.
3. Only Bell is deep, and Bell CAD is geo-blocked from the server.
4. Two pipelines, two AI clients, two confidence models, two orchestrators, two clerk registries.
5. No ground truth. No golden parcels, canaries or drills, so site drift is found by a bad run weeks later.
6. TCEQ, RRC, NRCS and GLO are written and unused; no purchase has ever run; CapSolver has no key and no caller.
7. The UI is large (3,545-line hub, 2,678-line canvas, 8,776-line worker file) and mixes operator tools with field results.
8. Texas is hard-coded: 254-county table, `'TX'` literals (about 46 in worker and lib), "Texas RPLS" prompts, TxDOT, GLO, Texas closure constants.

## 7. Rebuild recommendation

Keep the spine and the engineering discipline; rebuild the edges.

- Keep: county profile resolver, free-first ordering and purchase gate, dead-host and circuit guards, the "proven by driving" rule, the Milam onboarding method, reconciliation and closure, safe auto-deploy.
- Merge or delete: lite pipeline, second orchestrator, drawing canvas (send to CAD), the testing lab, the duplicate registries.
- Rebuild: one run-oriented API with events; a single result dossier screen (timeline, evidence, boundary, confidence with reasons); CAD layer built on a statewide parcel baseline plus verified adapters.
- Add first: golden parcels and drills, because every other improvement is unmeasurable without them.

## 8. What it takes to reach full Texas coverage

"Full" has to be defined honestly. Recommended definition: every one of 254 counties returns a parcel match or an explicit reason, at least one document path (free, paid or paper with a courthouse instruction), and the free statewide layers, with a last-green date per county and source. Estimates are rough, one experienced engineer plus owner decisions.

| Step | Work | Rough effort |
|---|---|---|
| 1 | Make coverage honest: one county profile per county as the source, generate all registries from it, CI fails on disagreement, three states (works, partial, missing) plus paid-only, login-only, paper-only (curation slice 4) | 1-2 weeks |
| 2 | Run `check-adapter-hosts` on every configured host (BIS 104, Kofile, Avenu, Eagle, CountyFusion), drive one known parcel per vendor, mark each county proven or not | 2-3 weeks |
| 3 | Wire the free statewide layers into Stage 1.5: GLO (adapter exists), TCEQ, RRC, NRCS, FEMA and TxDOT confirmed in the generic pipeline; show "queried, nothing found" | 2-3 weeks |
| 4 | Parcel baseline for all 254: add a statewide parcel dataset (for example TxGIO/StratMap land parcels; my recommendation, not in the code) for geometry, owner and legal text; CAD sites become enrichment | 2-3 weeks |
| 5 | Classify the remaining ~145 CADs by vendor from the Comptroller directory (241 websites) with a probe, then add vendor templates (not county code) for any vendor covering 5 or more counties | 3-4 weeks |
| 6 | Big metros by hand, Milam method (about 1 day each, more for custom systems): Harris, Dallas, Tarrant, Bexar, Travis, Collin, Denton, Fort Bend, El Paso, Hidalgo (the seed 372 tier-1 list), plus the owner's order: Austin ring, Waco ring, Conroe/Huntsville/College Station | 4-6 weeks |
| 7 | Clerk gaps: decide CountyFusion credentials, rediscover Henschen and Fidlar counties (Burnet turned out to be Tyler Eagle), drive Bastrop, adapter for Bosque free index, mark Lee and San Saba as paper-only; define paper-only output (courthouse instruction, TexasFile index) | 4-6 weeks |
| 8 | Drills, canaries and golden parcels: 2-3 known parcels per curated county, scheduled weekly polite drill, Coverage page reads results (curation slices 2, 3, 5) | 3-4 weeks |
| 9 | Egress and CAPTCHA policy: Browserbase for Bell CAD, per-county solver policy, `automation_posture` per county | owner decisions plus 1-2 weeks |
| 10 | Rural long tail: about 120 small counties with a TexasFile path only; accept "index plus purchase" as the product for them and say so | ongoing, small per county |

Realistic outcome: step 1 to 4 (about 7 to 11 weeks) gives an honest, statewide baseline with proven metros partly missing; steps 5 to 8 (about 4 to 5 more months) bring the top 50 or so counties to curated quality; the rural tail never needs more than a clear paper or paid path. A working claim of "all 254, proven" is on the order of 6 to 9 months.

Owner decisions that block work: Browserbase for Bell CAD, CapSolver key and which counties may be solved, authorising the first real paid TexasFile purchase, iDocket and Mapbox billing.

## 9. Making it multi-state

What carries over: the three-tier county profile, free-first ordering, the dead-host and circuit guards, the confidence and closure machinery, and the vendor adapters (Kofile/GovOS, Tyler, Fidlar, Avenu, CountyFusion, BIS and TrueAutomation operate in many states). `research_counties` already has a `state` column (seed 370:40), and `lib/research/white-label.config.ts` already defines jurisdiction and terminology settings.

**Source adapter pattern.** Every external source implements one interface and declares what it can answer and where.

```ts
interface SourceAdapter {
  id: string;                      // 'kofile', 'bis-cad', 'fema-nfhl'
  kind: 'appraisal' | 'recorder' | 'plat' | 'gis-parcel' | 'hazard' | 'row' | 'land-office' | 'environmental' | 'minerals' | 'imagery';
  coverage: { state?: string; fips?: string[]; geometry?: GeoJSON };   // statewide, county list or polygon
  cost: 'free' | 'paid' | 'login';
  posture: 'allowed' | 'unknown' | 'forbidden';                         // automation terms, per vendor and per county
  probe(ctx): Promise<Health>;                                          // cheap; feeds Coverage and drills
  search(query): Promise<Result | Unreachable | NoneFound>;             // three outcomes, never conflated
  fetchDocument?(ref): Promise<Document>;
}
```

The pipeline stages ask the registry "which adapters cover this parcel and capability" instead of naming vendors. A county profile lists adapter instances (vendor, base URL, field map, verifiedAt, goldens) as data.

**State config.** One `StateConfig` per state: FIPS table and county names; land-survey system; recorder and assessor terminology (CAD in Texas, assessor or auditor elsewhere); units and coordinate system (US survey foot, State Plane zones); closure standards by survey class; statutory lookups (adverse possession, recording acts); state agencies (DOT, land office, environmental, oil and gas); prompts as templates filled from the config, not "Texas RPLS" literals; road-name variant rules.

**Legal and structural differences that change the engine.**

- Metes and bounds versus PLSS. Texas (like the original colonies, Kentucky, Tennessee and others) describes land by metes and bounds tied to abstracts and surveys; Texas has its own vara units and GLO original grants. PLSS states (most of the West and Midwest) describe parcels by meridian, township, range, section and aliquot parts. The engine needs a `LegalDescription` union: `metesAndBounds` (calls, curves, POB, ties) and `plss` (meridian, T, R, section, aliquot, special surveys, government lots). Extraction prompts, the reconciler (a PLSS description closes against section corners and the GLO/BLM notes, not a traverse) and the chain builder must branch on it. Several states mix both (Texas and Louisiana have arpent and other systems; Ohio and others have their own survey systems).
- Original-survey source: GLO in Texas, BLM GLO records for PLSS states, state land offices elsewhere. These are the same capability (`original_survey`) with different adapters.
- Public-records access: Texas county clerks hold land records and are not centralised; other states use registers of deeds, recorders or town clerks, some by town (New England), and some states have statewide indexes. Recording acts, indexing (grantor/grantee versus tract) and fees differ.
- Appraisal: CAD in Texas; assessor, auditor or property appraiser elsewhere; some publish parcel layers statewide (which makes the baseline-first approach easier).
- Mineral and easement context (RRC in Texas) changes by state; water rights are major in the West.
- Surveyor practice standards differ (Texas TBPELS rules, ALTA/NSPS national): closure constants (`TEXAS_MIN_RURAL_RATIO`, `TEXAS_MIN_URBAN_RATIO`) become per-state defaults.
- Egress and terms of service: automation posture per vendor and per state; scraping posture must be recorded per source.

**Concrete steps.** (1) Add `state` to `CountyRecord`, `resolveCountyProfile` and every registry key (FIPS is already 5-digit, so keys stay stable). (2) Extract `TEXAS_COUNTIES`, prompts and closure constants into `states/TX.ts`. (3) Introduce `LegalDescription` with a PLSS branch before adding the first PLSS state. (4) Pick a pilot state whose recorders use vendors already supported (for example a Kofile or Tyler state next to Texas such as Oklahoma or Louisiana's parishes with care, because Louisiana's legal system differs). (5) Build state-level golden parcels before claiming support. (6) Per-firm tenant data (org_counties seed 519, vendor accounts, egress allow-list) must become per-firm configuration; today the worker is single-tenant and the billing is a single Starr TexasFile account.
