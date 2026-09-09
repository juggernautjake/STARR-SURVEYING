# Milam County adapter — built to the Bell level (2026-09-09)

Branch `claude/milam-county-adapter-2026-09-09`. Status: **built, typechecked, unit-tested, driven
live from the office against a real parcel; not yet merged, not yet run end to end on the worker.**

## 1. What the sites are (picked apart live, 2026-09-09)

Every address below was driven before it was written down. The registry entry this replaces was
wrong on both counts (see §3).

| Source | Where | What it is | How the adapter reads it |
|---|---|---|---|
| Appraisal district | `https://esearch.milamad.org` | BIS Consultants eSearch **v2.0.9734** — same vendor family as Bell's | The BIS scraper (`counties/bell/scrapers/cad-scraper.ts`) pointed at Milam's host. Search goes to the JSON results API (`POST /search/SearchResults` with a token from `GET /search/requestSessionToken`) — the HTML route returns the grid shell only. The detail page is read by its own `<th>Label:</th><td>` markup (owner, situs, type, mailing, legal, land-table acreage, deed history by header). |
| Parcel map | `https://maps.pandai.com/milamad/` | ArcGIS **Web AppBuilder 2.18** (JS API 3.34) by Pritchard & Abbott — **not** BIS | `?find=<propertyId>` deep-links to the parcel (the appraisal page's "Interactive Map" button). `window._viewerMap` exposes zoom and layer switches. |
| Parcel data | `https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer` (+ FeatureServer) | Plain ArcGIS REST. Layer 0 = parcels **joined to the appraisal accounts** (owner, legal 1–4, acres, situs parts, deed volume/page, account code). Layer 3 = original surveys (412; abstract number + grantee + GLO acreage). Layer 5 = subdivisions (673; name + S-code). `/export` renders any bbox. | `counties/milam/scrapers/gis-scraper.ts` — by property id, situs, geocode point, owner; reads the survey and the subdivision at the parcel centroid; siblings + adjacents. 21,465 parcels. |
| County clerk | `https://milam.tx.publicsearch.us` | Kofile/GovOS PublicSearch, department **RP**, 1983 → certified 2026-09-04, `year-instNum` numbers ("2009-109100"). $1/page + $2/document at the cart; the viewer serves watermarked page images free. Plats are their own group **PL** (PLAT, SURVEY PLAT, AMENDMENT TO PLAT, PLAT VACATE AND REPLAT, RATIFICATION OF PLAT). | The Bell clerk/plat scrapers through `services/bell-clerk.ts` with county key `milam`. **Volume/page → instrument** works through the advanced search (`results?department=RP&searchType=advancedSearch&volume=1093&page=560&recordedDateRange=…` → 2009-109100); the appraisal district cites every deed by volume/page and none by instrument, so this is the bridge. |
| Historic index | `https://kofilequicklinks.com/Milam/` | Kofile QuickLink — deed / deed-of-trust **index books 1874–1982** and a Book/Volume/Page viewer (`Viewer.aspx?ImageId=N`, one id per page, tiled TIFF). ASP.NET WebForms postbacks. | Recorded as a playbook (`playbooks/milam.ts`, `milam-quicklink`); **not automated** — the recipe is written down for the pre-1983 volume/page references a chain of title reaches. |
| Free plat portal | none | bellcountytx.com has no Milam equivalent; the county and clerk sites list none. | The plat scraper says so in the log and skips Layer 1; plats come from the clerk's PL group (free preview) or TexasFile ($10 flat). |
| TexasFile | `texasfile.com/search/texas/milam-county/county-clerk-records/` | Index 1838 → 2026-07; DR volumes A–484, OPR 485–1348. | The generic paid pass; nothing Milam-specific needed. |
| Appraisal rolls | `https://milamad.org/data-downloads/` | Certified 2026 roll (all types) and mineral roll as ZIP; GIS shapefiles are sold via countydatasource.com. | Not used by a run; recorded in `config/endpoints.ts`. |
| FEMA NFHL, TxDOT ROW | statewide | | The Bell readers as they are (coordinate in, result out). |

Dead ends checked with a control: `propaccess.trueautomation.com/clientdb/?cid=26` (the app's old
entry) answers an ASP.NET error page; `esearch.milamcad.org` does not resolve;
`gis.bisclient.com/milamcad/` is 404 while `…/bellcad/` is 200.

## 2. What was built

**One orchestrator, many counties.** `counties/bell/orchestrator.ts` now exports
`orchestrateCountyResearch(county: CountyModule, …)`; `orchestrateBellResearch` passes
`BELL_MODULE`. The module (`counties/county-module.ts`) is the county-shaped part — name, key,
FIPS, log labels, the two hosts the dead-host gate watches, one function per source, two captures.
The file keeps its name and place so the ~40 tests that pin its wiring keep pointing at it.

**Scrapers parameterised, not copied.** The BIS CAD, Kofile clerk, plat and tax scrapers take a
profile (an `AsyncLocalStorage` scope inside each file — one entry point, one file, the shape
`gis-viewer-capture.ts` already uses). `services/bell-clerk.ts` takes the county on the two
searches that had `'bell'` hardcoded. The AI analyzers take `countyName` (the prompts said
"Bell County, Texas" for any county). `captureMapScreenshots` takes the county's own map frame and
keeps the Google frames.

**Milam's own:** `counties/milam/` — `config/endpoints.ts`, `config/field-maps.ts`,
`scrapers/gis-scraper.ts`, `scrapers/gis-viewer-capture.ts` (six **rendered** frames — parcel /
neighbours / subdivision × aerial+lines / lines-only, composed from the county's `/export` over
Esri World Imagery with the subject outlined — plus the viewer **photographed** at three zoom
levels and, when the map allows, aerial with and without lines), `scrapers/map-screenshot-capture.ts`,
thin `cad-`/`clerk-`/`plat-`/`tax-scraper.ts`, `module.ts`, `index.ts`, `playbooks/milam.ts`.

**Wiring:** router (dedicated-module arm shared by Bell and Milam; `isMilamCountyAddress`;
`detectCountyFromAddress` → 'Milam'), `BIS_CONFIGS.milam` corrected (+ parcel layer, so the generic
path's GIS query and the rendered parcel map work for Milam too), Kofile adapter row 48331,
`research-modes` GLO wired for Milam, site-health probes for 48331, the app's CAD tables.

## 3. Defects found on the way (fixed)

- `BIS_CONFIGS.milam` pointed at two dead hosts — the 147-second dead-host of the 2026-09-02 run.
- The BIS detail-page parser matched **nothing** on either site's `<th>Label:</th><td>` markup:
  the HTTP path returned no owner, no situs, NaN acreage, and dropped every deed row cited by
  volume/page and every modern twelve-digit Bell instrument. Now label-first and header-aware;
  proven on the saved Milam 13824 and Bell 405 pages.
- The BIS HTML search route carries no rows on v2.0.9734; the JSON results API is now Layer 2
  (0.4 s to the parcel on Milam; the same call works on Bell).
- A directional typed into the street field ("N Travis") was searched as the street name;
  BIS indexes it separately. Split off; `309 TRAVIS` finds the parcel.
- The site-health monitor probed BIS sites at `/Search/Result`, which redirects to
  `/Search/Expired` (no form) and stalled the worker for 30 s per check; the Kofile probe's
  selectors matched nothing on the current GovOS skin; and a missing required selector was
  persisted as "did not respond". All three are what the Coverage page was showing (owner's
  screenshot, 2026-09-09). Fixed: BIS probed at the home page, Kofile selectors updated
  (`input#basicSearchInputBox`), required-missing → `broken` with the selector named, and the
  panel says "not checked yet" instead of the raw `no_record` for an adapter no check has run on.
- Esri's imagery cache refuses a bbox tighter than ~0.15 m/px (HTTP 500): the subject-parcel aerial
  is requested at a servable size and scaled.

## 4. Live evidence (office machine, 2026-09-09)

Parcel 13824, 309 N Travis, Cameron: CAD Layer 2 → 13824 (owner WANBOB LC, 0.46 ac, situs,
mailing, 4 deeds by volume/page); GIS → same parcel with survey **Daniel Monroe (A-38)** and
subdivision **FREEMAN (S09200)**, 40 sibling lots, 57 adjacent parcels; rural control 600 W Main,
Buckholts → A-430 **J A DE PENA**, no subdivision; tax → 1 improvement, 9 valuation years
(the tax-info block's own pattern is Bell-shaped and returns null on Milam — see §6); rendered maps
→ five of six on the first run (the tight aerial fixed since), examples in the session scratchpad.

## 5. Ledger

| # | Slice | State |
|---|---|---|
| 1 | Sites picked apart; endpoints recorded | done |
| 2 | County module + orchestrator parameterised | done |
| 3 | Scrapers/analyzers parameterised; Bell behaviour unchanged | done (suite green) |
| 4 | Milam GIS scraper (parcels, surveys, subdivisions, siblings, adjacents) | done, driven live |
| 5 | Milam CAD via BIS (JSON API + label parser) | done, driven live |
| 6 | Milam clerk + plats via Kofile (vol/page bridge) | done; **not driven end to end from the worker yet** |
| 7 | Rendered + photographed maps | rendered driven live; photographed — see the maps probe |
| 8 | Router, registries, health probes, app tables | done |
| 9 | Tests (`milam-county-module-2026-09-09.test.ts`) | done |
| 10 | Merge, deploy the worker, one gather run on a Milam address | **owner's call** |

## 6. Left open

- `parseTaxInfo` (exemptions / taxing units block) is Bell-shaped; returns null on Milam. The
  valuation history and improvements parse. Worth a label-first pass like the detail parser.
- QuickLink (1874–1982) is a playbook, not a scraper.
- The clerk's PL group could be searched by `docTypes` directly (advanced search takes it); today
  plats surface through the quick search's type column, as on Bell.
