# County curation system — one profile per county, drilled on a schedule (2026-09-09)

Status: **proposal, pending the owner's go.** Written after building the Milam module to Bell's level
(`docs/planning/completed/MILAM_COUNTY_ADAPTER_2026-09-09.md`), which is where the problems below
were measured rather than guessed.

## 1. What we have today, honestly

Two kinds of county exist and the difference is not visible to anyone using the product.

| Kind | Counties | How a run decides what to do |
|---|---|---|
| Dedicated module | Bell, Milam | `counties/<key>/module.ts` — one file names every source, scraper, host and label; the shared orchestrator runs it. Sites were driven by hand before being written down. |
| Generic pipeline | the other ~39 "routed" counties (and the 233 TexasFile fallbacks) | Vendor detection + **nine overlapping registries** that name counties: `BIS_CONFIGS` (104 rows), `KOFILE_CONFIGS` in bell-clerk.ts (75), the Kofile adapter's FIPS table (8), `services/clerk-registry` (22), `adapters/clerk-registry` (22), `cad-registry` (auto-derived + 8), `county-config-registry` (10), `PLAT_REPO_REGISTRY` (8), `research-modes` source lists — plus the app's own `TEXAS_CAD_CONFIGS` (97) and TrueAutomation table (23), plus the live `research_site_adapters` rows (40) with hand-written config JSON that no run reads. |

Milam is the measurement of what that costs: three registries held three different, all-wrong
answers for its appraisal district (a dead BIS host, a 404 GIS viewer, a dead TrueAutomation id),
the 2026-09-02 run spent 147 s on one of them, and nothing could have told us — the registries are
never checked against the sites.

**Testing today.** 3,085 worker tests, most of them pinning wiring and parsers offline: good, and
they catch code drift, not site drift. The live layer exists in outline only:

- `infra/site-health-monitor.ts` probes selectors per site — structural ("is the search box
  still there"). It was reporting Bell as down for a week because of a probe URL and a selector.
- `infra/canary.ts` is a finished comparison framework ("for a property whose facts we know,
  does the adapter still return them") with per-kind tolerances. **The `research_adapter_canaries`
  table holds zero rows.** It has never run.
- `__tests__/regression/regression-runner.ts` is a scaffold with one synthetic fixture and a stub
  runner; "Phase A: 5 real fixtures from Dad's filing cabinet" never happened.
- `services/golden-plat.ts` is the same shape for plat reading; no golden plat has been supplied.

So: excellent bones, no known-good properties to exercise them, and a run can go wrong on a county
for weeks before a person notices.

## 2. The target: one county, one profile, three rings of testing

### 2.1 The profile is the single source of truth

`worker/src/counties/<key>/profile.ts`, typed, reviewed in a diff, one per curated county. It holds
everything that is *about the county* and nothing that is about the code:

```
identity      name, key, FIPS, towns, ZIPs, "Cameron is ambiguous" notes
sites[]       for each of: appraisal district, parcel map/data, clerk, plat source, historic index,
              tax office — vendor, entry URL, egress (direct / app-relay / residential), dismissals,
              search recipe, done-signal, viewer/download recipe, pricing, verifiedAt, verifiedBy
fieldMaps     the county's column names (Milam's DBO.Accounts.*, Bell's prop_id_text …)
capabilities  what exists here: free plat repo? GIS parcel layer? survey layer? historic index?
              which clerk paths matter (Milam: volume/page is THE bridge; Bell: instrument numbers)
recipe        the run order and per-source options the surveyor wants for this county
              (plats first; which Google zoom; whether to photograph the viewer; budgets)
golden[]      2–3 KNOWN PARCELS with the expected answer from every source — the drill's
              questions and the regression harness's fixtures, in one place
```

Every registry in §1 becomes a **derivation** of the profiles — either generated at build time or
asserted equal by a test that fails when a registry says something a profile does not. A county
with no profile gets a **vendor-default profile** (BIS + Kofile + TexasFile shapes) and is labelled
as such. No county has two sources of truth again.

The playbooks (`playbooks/bell.ts`, `playbooks/milam.ts`) already carry the `sites[]` half of this
and should fold in, not stay parallel.

### 2.2 Three tiers, shown on the Coverage page

| Tier | Meaning | Today |
|---|---|---|
| **Curated** | profile + golden parcels + every drill green within 14 days | Bell, Milam (once golden parcels exist) |
| **Vendor-default** | routed by vendor detection; parsers proven on the vendor, not this county; no golden parcel | the ~39 routed counties |
| **Fallback** | TexasFile only | 233 counties |

A surveyor picking a county sees the tier and the last-green date before they spend a run.

### 2.3 Three rings of testing

1. **Offline (every CI run).** Profile schema; registries agree with profiles; each parser against a
   *saved* page/JSON from that county (captured when the county was curated, refreshed by ring 2).
   This is what the Milam test file does today, generalised.
2. **Drill (scheduled, live, polite — weekly per curated county, and on demand).** For each golden
   parcel, exercise the *cheapest* path of every source — CAD JSON search, GIS layer query, clerk
   search by the county's bridge (volume/page or instrument) *without* image capture, viewer deep
   link — and compare to the expected answer by the canary kinds (identifier / name / measure /
   text). Writes `research_adapter_health_checks` + `research_adapter_canaries`; the Coverage page
   shows per county, per source: green / drift / broken and the last-green date. ~30 s and zero
   dollars per county. **This is the canary framework, finally fed.**
3. **Full run (manual, budgeted, quarterly per curated county).** One gather run on a golden
   parcel, reviewed by a surveyor, the result diffed against the golden dossier by the regression
   harness. This is "Phase A" of the regression plan, with the profile supplying the fixtures.

### 2.4 The method for a new county ("the Milam method", one day each)

1. Pick the sites apart live (Playwright + curl), with a control for every negative.
2. Write the profile: sites, field maps, capabilities, recipe, 2–3 golden parcels.
3. Reuse the vendor scrapers with the profile; write county-specific ones only for what differs
   (Milam needed a GIS scraper and two captures; the rest was the profile).
4. Offline tests from saved pages → drill green → one full run → surveyor review → tier = Curated.

## 3. Slices

| # | Slice | Delivers |
|---|---|---|
| 1 | `CountyProfile` type; Bell + Milam profiles; registries asserted equal in CI | one source of truth for the two counties we have — **SHIPPED 2026-09-09** (see §5) |
| 2 | Golden parcels for Bell + Milam (owner supplies 2–3 each, or we pick from surveyed jobs); canary rows seeded | something to drill against |
| 3 | The drill: `npm run drill -- --county milam` on the worker, per-source, no purchases, writes health + canary rows; Coverage page shows tier + per-source drill status | site drift caught in days, not weeks |
| 4 | Generic pipeline reads a vendor-default profile; the duplicate registries (bell-clerk `KOFILE_CONFIGS`, the Kofile adapter table, both clerk registries, `county-config-registry`, the app's CAD tables) become derived or deleted | the nine tables become one |
| 5 | Scheduled drills on the worker (the health monitor's timer); regression harness Phase A on the golden parcels | ring 2 and ring 3 running |
| 6 | Next counties by the Milam method, in the order the OWNER set on 2026-09-09 (§6) | curated coverage grows a county at a time, each proven |

## 4. Decisions needed from the owner

- ~~Which counties matter next~~ — decided 2026-09-09, §6.
- Two or three golden parcels per curated county — ideally jobs Starr has surveyed, so the
  expected answer is known to the foot.
- Drill cadence (weekly is the proposal) and whether the drill may open the clerk's viewer
  (free preview pages) or must stop at the index.

## 5. Shipped 2026-09-09 — slice 1, plus the fallback the owner asked for

> "I want to have one profile per county, but if the profile is not fully built, then it should
> have generic fallback options for research methods so that we can still hopefully get some
> results for counties that we have not fully built out yet."

- `worker/src/counties/profile.ts` — `resolveCountyProfile(county)` answers for all 254 counties
  and never throws. Three tiers: **curated** (`counties/bell/profile.ts`, `counties/milam/profile.ts`:
  sites with `verifiedAt`, capabilities, the recipe in sentences, golden parcels — Bell 405,
  Milam 13824 and 10421 with their known values); **vendor-default** (derived from the registries
  the generic pipeline already reads: BIS row, clerk vendor + that vendor's own URL table, plat
  status; stated as "not curated … nobody has driven its sites"); **fallback** (aggregator only).
- The router dispatches from the resolver: `runCountyResearch` asks the profile for the module,
  the county switch no longer names counties, and `getCountiesWithModules()` is derived from the
  curated list. A profile without a loader falls through to the generic pipeline — the fallback.
- Worker `GET /research/county-profiles` (+ `/:county`), app proxy
  `app/api/admin/research/county-profiles`, and a **County profiles** panel at the top of the
  Coverage tab: tier counts, a filter, one row per county, expandable to sites / recipe / golden
  parcels. The tier a surveyor reads is the tier the router acts on — same function, not a copy.
- `worker/src/__tests__/county-profiles-2026-09-09.test.ts` (12): the 254, curated ↔ module ↔
  registry agreement, Williamson as a vendor-default (BIS + Tyler Eagle at
  `williamsoncountytx-web.tylerhost.net/williamsonweb/`), Loving as a fallback, the caller.
- Found on the way: `lib/research/county-support.ts` still says only Bell — correct, because
  `verify-lot` reads Bell CAD's ArcGIS from the app and has no Milam counterpart. The test now
  asserts the app's list is a SUBSET of the worker's curated list, not equal to it.

Not yet: golden-parcel canary rows, the drill command, scheduled drills (slices 2, 3, 5); the
duplicate registries are still there, only asserted equal (slice 4).

## 6. Priority order for curation (owner, 2026-09-09)

> "Let's work on the counties that have the heaviest population. Williamson for sure. I want all
> of the counties around Austin built out first. Then we will work on the ones around Waco and
> then we will move towards Conroe and Huntsville and College Station. I want Round Rock,
> Georgetown, Taylor, Thorndale, Pflugerville."

1. **Williamson** (Round Rock, Georgetown, Taylor, Pflugerville's Williamson side). Known already:
   BIS eSearch at `esearch.wilcotx.gov`, BIS GIS at `gis.bisclient.com/wilcotx/`, clerk on Tyler
   Eagle at `williamsoncountytx-web.tylerhost.net/williamsonweb/` (driven 2026-08-02). To find:
   the parcel FeatureServer, a free plat source, the deed bridge Tyler exposes. Thorndale is Milam
   — done.
2. **The Austin ring**: Travis (Pflugerville's Travis side, Austin), Hays, Bastrop, Caldwell,
   Burnet, Blanco, Lee.
3. **The Waco ring**: McLennan, Coryell, Falls, Limestone, Hill, Bosque.
4. **Conroe / Huntsville / College Station**: Montgomery, Walker, Brazos, Grimes.
