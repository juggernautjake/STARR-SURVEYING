# Bell County — Complete Data Source Registry

> Master list of every website/API for property research in Bell County, TX.
> Status: ✅ = scraper built, 🔧 = partial, ❌ = not yet built

---

## 1. COUNTY CLERK / OFFICIAL RECORDS

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 1 | 🔧 | **Bell County Clerk — PublicSearch (GovOS/Kofile)** | `https://bell.tx.publicsearch.us` | Deeds, liens, plats, easements, ROW, judgments (React SPA) |
| 2 | 🔧 | **PublicSearch SuperSearch API** | `https://bell.tx.publicsearch.us/supersearch` | Full-text OCR search (POST endpoint) |
| 3 | ❌ | **Henschen & Associates Recorder** | `https://www.bellcountytx.com/recorder` | Alternative clerk portal, instrument lookup (15 RPM limit) |
| 4 | ❌ | **Bell County Clerk — Recorded Searches Page** | `https://www.bellcountytx.com/county_government/county_clerk/recorded_searches.php` | SuperSearch & CountyFusion links, filing info |
| 5 | ❌ | **Bell County Clerk — Plats Page** | `https://www.bellcountytx.com/county_government/county_clerk/plats.php` | Plat filing requirements, recorded plat info |
| 6 | ❌ | **Bell County Clerk — Real Estate Page** | `https://www.bellcountytx.com/county_government/county_clerk/real_estate.php` | Deed recording info, filing guidance |
| 7 | ❌ | **TexasFile — Bell County** | `https://www.texasfile.com/search/texas/bell-county/county-clerk-records/` | Deeds, liens, O&G leases, mineral deeds, ROW, plats, probates (free index; per-doc fee) |
| 8 | ❌ | **CourthouseDirect — Bell County** | `https://www.courthousedirect.com/PropertySearch/Texas/Bell` | Scanned indexes + images, historical records (subscription) |

---

## 2. TAX APPRAISAL / CAD (Bell CAD)

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 9 | ✅ | **Bell CAD eSearch** | `https://esearch.bellcad.org` | Property search, owner, legal desc, values, deed history |
| 10 | ✅ | **Bell CAD eSearch API** | `https://esearch.bellcad.org/search/result` | GET with session token — keyword search |
| 11 | ✅ | **Bell CAD Property Detail** | `https://esearch.bellcad.org/Property/View/{propId}` | Full property detail page |
| 12 | ❌ | **Bell CAD Main Site** | `https://bellcad.org/` | Exemptions, ARB info, forms, tax rates |
| 13 | ❌ | **Bell CAD Data Portal** | `https://bellcad.org/data-portal/` | Downloadable appraisal data files (bulk) |
| 14 | ❌ | **Bell CAD Online Forms** | `https://forms.bellcad.org/` | Exemption applications, protest forms |
| 15 | 🔧 | **Tax Records (from CAD detail)** | `https://esearch.bellcad.org/Property/View/{propId}` | Tax year, appraised/assessed values, exemptions (improvements + valuation history TODO) |

---

## 3. GIS / MAPPING

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 16 | ✅ | **Bell CAD ArcGIS FeatureServer** | `https://utility.arcgis.com/usrsvcs/servers/6efa79e05bde4b98851880b45f63ea52/rest/services/BellCADWebService/FeatureServer/0` | Parcel boundaries, spatial queries, adjacent parcels |
| 17 | ❌ | **BIS Consultants — Bell CAD GIS Viewer** | `https://gis.bisclient.com/bellcad/` | Interactive parcel map, aerial overlay, measurements (nightly data updates) |
| 18 | ❌ | **TrueAutomation — Bell CAD Map Search** | `https://propaccess.trueautomation.com/mapSearch/?cid=66` | Interactive parcel map with property data overlay |
| 19 | ❌ | **Bell County Engineer's Office Maps** | `https://www.bellcountytx.com/departments/engineer/maps.php` | County maps in ArcGIS format |
| 20 | ❌ | **Regrid — Bell County** | `https://app.regrid.com/us/tx/bell` | Nationwide parcel data, ownership boundaries (free tier + paid) |
| 21 | ❌ | **TaxNetUSA — Bell County** | `https://www.taxnetusa.com/texas/bell/` | Interactive GIS map, parcel data (subscription) |
| 22 | ❌ | **Acres — Bell County Plat Maps** | `https://www.acres.com/plat-map/map/tx/bell-county-tx` | 162K parcel records, ownership, soil maps, elevation |
| 23 | ❌ | **AcreValue — Bell County** | `https://www.acrevalue.com/map/TX/Bell/` | Farmland values, soil productivity, crop mix |
| 24 | ❌ | **ESRI World Imagery Tiles** | `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer` | Free base imagery tiles |

---

## 4. FEMA / FLOOD

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 25 | ✅ | **FEMA NFHL MapServer — Layer 28** | `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28` | Flood Hazard Areas (zones A, AE, X, etc.) |
| 26 | ✅ | **FEMA NFHL MapServer — Layer 3** | `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/3` | FIRM Panels |
| 27 | ❌ | **FEMA NFHL MapServer — All 28 Layers** | `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer` | Floodways, base flood elevations, CBRS, coastal zones, cross-sections |
| 28 | ❌ | **FEMA Flood Map Service Center** | `https://msc.fema.gov/portal/search` | FIRMette generation, LOMA/LOMR letters, map amendments |
| 29 | ❌ | **FEMA MSC — Advanced Search** | `https://msc.fema.gov/portal/advanceSearch` | Download full NFHL data by county, FIRM panels |
| 30 | ❌ | **FEMA NFHL ArcGIS Viewer** | `https://www.arcgis.com/apps/webappviewer/index.html?id=8b0adb51996444d4879338b5529aa9cd` | Interactive flood map |
| 31 | ❌ | **FEMA Estimated BFE Viewer (USGS)** | `https://webapps.usgs.gov/infrm/estbfe/` | Estimated base flood elevations |
| 32 | ❌ | **Bell County Floodplain Management** | `https://www.bellcountytx.com/departments/engineer/floodplain_management.php` | Local floodplain regulations, contacts |

---

## 5. TxDOT (Texas Dept. of Transportation)

Bell County is in **TxDOT Waco District**.

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 33 | ✅ | **TxDOT ROW Parcels FeatureServer** | `https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_ROW/FeatureServer/0` | ROW parcels, widths, CSJ numbers |
| 34 | ✅ | **TxDOT Roadway Centerlines FeatureServer** | `https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0` | Highway centerlines, classifications |
| 35 | ❌ | **TxDOT Open Data Portal** | `https://gis-txdot.opendata.arcgis.com/` | All TxDOT GIS layers (bridges, ROW, functional class) |
| 36 | ❌ | **TxDOT ROW Maps Archive** | `https://tsl.access.preservica.com/tda/reference-tools/txdot-row/` | ROW conveyances, maps, titles (1913-2017), search Waco District |
| 37 | ❌ | **TxDOT Statewide Planning Map** | `https://www.txdot.gov/projects/planning/statewide-planning-map.html` | Project planning, future ROW acquisitions |
| 38 | ❌ | **TxDOT Reference Maps (County)** | `https://www.txdot.gov/data-maps/reference-maps.html` | County and district maps |
| 39 | ❌ | **TxDOT Roadway Inventory** | `https://www.txdot.gov/data-maps/roadway-inventory.html` | Annual roadway data by county |

---

## 6. AERIAL / SATELLITE IMAGERY

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 40 | ❌ | **TNRIS/TxGIO DataHub — NAIP** | `https://data.geographic.texas.gov/?pg=1&inc=24&category=Imagery` | NAIP imagery tiles by county (0.6m, 2018-2024 cycles) |
| 41 | ❌ | **TNRIS NAIP 2018 Image Server** | `https://imagery.tnris.org/server/rest/services/NAIP/NAIP18_NCCIR_60cm/ImageServer` | ArcGIS Image Server endpoint (0.6m, 4-band RGBIR) |
| 42 | ❌ | **TNRIS Historical Imagery Archive** | `https://tnris.org/research-distribution-center/historical-imagery-archive` | Historical aerial photos dating to 1920s |
| 43 | ❌ | **USGS EarthExplorer** | `https://earthexplorer.usgs.gov/` | NAIP, Landsat, historical aerials (free, requires account) |
| 44 | ❌ | **NAIP Hub (USDA)** | `https://naip-usdaonline.hub.arcgis.com/` | NAIP browser + WMS/WMTS services |
| 45 | ❌ | **USGS NAIP Imagery Server** | `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer` | National NAIP image service endpoint |
| 46 | ❌ | **Google Earth Pro** | `https://www.google.com/earth/` | Historical satellite timeline (back to 1984) |
| 47 | ❌ | **Nearmap** | `https://www.nearmap.com` | Very high-res (5.8-7.5 cm), 2-3x/year capture (paid) |
| 48 | ❌ | **ESRI World Imagery** | `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer` | Free base imagery tiles |
| 49 | ❌ | **USGS National Map Viewer** | `https://apps.nationalmap.gov/viewer/` | Topo, elevation, hydrography, land cover |

---

## 7. GLO (Texas General Land Office)

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 50 | ❌ | **GLO Land Grant Database Search** | `https://www.glo.texas.gov/archives-heritage/search-our-collections/land-grant-search` | 37M docs: original grants, patents, field notes, abstracts (from 1720) |
| 51 | ❌ | **GLO — Search All Collections** | `https://www.glo.texas.gov/archives-and-heritage/search-our-collections` | Full archive (6M+ digitized documents) |
| 52 | ❌ | **GLO Surveying Division** | `https://glo.texas.gov/land/surveying` | PSF land boundaries, county boundary surveys |
| 53 | ❌ | **GLO Historic County Maps** | `https://texashistory.unt.edu/explore/collections/GLOHCM/` | Cadastral (ownership) maps showing original surveys per county |
| 54 | ❌ | **Bell County Historic Survey Map (1896)** | `https://texashistory.unt.edu/ark:/67531/metapth493301/` | Rivers, creeks, original land grants, cities, roads, railroads |
| 55 | ❌ | **Historic Texas Maps** | `https://historictexasmaps.com/` | GLO map store, searchable historic maps |

---

## 8. TCEQ (Texas Commission on Environmental Quality)

Bell County is in **TCEQ Region 9** (Waco office).

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 56 | ❌ | **TCEQ GIS Data Hub** | `https://gis-tceq.opendata.arcgis.com/` | Air monitors, water bodies, permits, waste sites |
| 57 | ❌ | **TCEQ Superfund Sites — Bell County** | `https://www.tceq.texas.gov/remediation/superfund/sites/county/bell.html` | Current/former Superfund sites |
| 58 | ❌ | **TCEQ Water Districts Viewer** | `https://www.tceq.texas.gov/gis/iwudview.html` | Interactive map of all water districts |
| 59 | ❌ | **TCEQ Download Raw Datasets** | `https://www.tceq.texas.gov/agency/data/lookup-data/download-data.html` | Bulk data: air, water, compliance, enforcement |

---

## 9. RAILROAD

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 60 | ❌ | **TxDOT Texas Railroads GIS** | `https://gis-txdot.opendata.arcgis.com/datasets/texas-railroads` | Active, industrial, abandoned rail lines (filterable to Bell) |
| 61 | ❌ | **TxDOT 2025 Railroad Map (PDF)** | `https://www.txdot.gov/content/dam/docs/division/rrd/2025-dept-railroad-map.pdf` | BNSF, UP, CPKC routes with county boundaries |
| 62 | ❌ | **Texas Railroad Commission GIS Viewer** | `https://gis.rrc.texas.gov/GISViewer/` | Oil/gas wells, pipelines, pipeline easements |
| 63 | ❌ | **RRC Pipeline System Maps** | `https://www.rrc.texas.gov/resource-center/research/gis-viewers/` | Pipeline corridor data |
| 64 | ❌ | **BNSF Network Map** | `https://www.bnsf.com/bnsf-resources/pdf/ship-with-bnsf/maps-and-shipping-locations/bnsf-network-map.pdf` | BNSF system map |
| 65 | ❌ | **Union Pacific Engineering Maps** | `https://www.uprr.com/emp/engineering/apps/efms/map_store/index.cfm` | UP subdivision maps |
| 66 | ❌ | **FRA Grade Crossing Inventory** | `https://safetydata.fra.dot.gov/OfficeofSafety/publicsite/Crossing/Crossing.aspx` | All railroad crossings with locations |

---

## 10. UTILITY / EASEMENT SOURCES

### Electric

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 67 | ❌ | **Oncor Service Area Map** | `https://www.oncor.com/content/oncorwww/us/en/home/about-us/service-area-map.html` | Electric service territory (serves Killeen/Bell) |
| 68 | ❌ | **Oncor Transmission Projects** | `https://www.oncor.com/content/oncorwww/us/en/home/about-us/transmission-systems/current-transmission-line-projects.html` | Active transmission line projects |
| 69 | ❌ | **LCRA Interactive Map** | `https://maps.lcra.org/interactive.aspx` | LCRA TSC transmission lines, substations |
| 70 | ❌ | **LCRA Transmission Services Map** | `https://maps.lcra.org/default.aspx?MapType=Transmission+Services` | Transmission line routes (~80 counties) |
| 71 | ❌ | **LCRA Bell Co East–Big Hill 765kV Project** | `https://www.lcra.org/energy/electric-transmission/transmission-line-routing/bell-county-east-to-big-hill-765-kv-transmission-project/` | Route map with aerial + parcel boundaries |
| 72 | ❌ | **PUC Texas Electric Service Viewer** | `https://experience.arcgis.com/experience/366445b63acd4dbda6d60f9244e89c23` | ArcGIS viewer for all TDU service territories |

### Water / Sewer

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 73 | ❌ | **Bell County WCID No. 1** | `https://wcid1.org/` | Primary water provider (Fort Cavazos, Killeen, Belton, Harker Heights) |
| 74 | ❌ | **Bell County WCID No. 3 (Nolanville)** | `https://wcid3.com/` | Water/wastewater for Nolanville area |
| 75 | ❌ | **Bell County WCID No. 5** | `https://bellcowcid5.com/` | Water services in their district |

### Gas

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 76 | ❌ | **Atmos Energy** | `https://www.atmosenergy.com` | Gas pipeline easements (check clerk records) |
| 77 | ❌ | **Texas 811 / Dig Tess** | `https://www.texas811.org` | Underground utility locates |

---

## 11. CITY-LEVEL PORTALS

### Killeen

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 78 | ❌ | **Killeen GIS Web App** | `https://killeengis.killeentexas.gov/gis/apps/webappviewer/index.html?id=9597858aa6464f9f92aae98f010442d6` | Parcels, infrastructure |
| 79 | ❌ | **Killeen Zoning GIS Map** | `https://killeengis.killeentexas.gov/gis/apps/webappviewer/index.html?id=b721ae8cf54a41c4a3700468c0399250` | Zoning map |
| 80 | ❌ | **Killeen Planning** | `https://www.killeentexas.gov/230/Planning` | Planning & zoning info |
| 81 | ❌ | **Killeen Permits** | `https://www.killeentexas.gov/207/Permit-Applications-Forms-Reports-Refund` | Permit forms, MGO online portal |

### Temple

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 82 | ❌ | **Temple Interactive Map (ArcGIS)** | `https://arcgisportal.ci.temple.tx.us/portal/apps/webappviewer/index.html?id=080744930f4143179f8c9361713aaded` | Interactive city map |
| 83 | ❌ | **Temple Map Gallery** | `https://www.arcgis.com/apps/PublicGallery/index.html?appid=478aac1c5c814d8eb75f1754b21d24de` | Collection of GIS apps |
| 84 | ❌ | **Temple Planning & Development** | `https://www.templetx.gov/departments/city_departments/planning___development/index.php` | Permits, zoning |

### Belton

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 85 | ❌ | **Belton GIS Mapping** | `https://www.beltontexas.gov/services/gis_mapping.php` | Comprehensive map, floodplain, thoroughfare plan |
| 86 | ❌ | **Belton Zoning & Land Use Maps** | `https://www.belton.org/edo/Site-Location-Development/Zoning-Land-Use-Maps` | Interactive zoning, future/existing land use |
| 87 | ❌ | **Belton Planning & Zoning** | `https://www.belton.org/Government/Departments/Community-Development/Planning-Zoning` | Development standards |

### Other Cities

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 88 | ❌ | **Harker Heights** | `https://www.harkerheights.gov` | Zoning, planning, utilities |
| 89 | ❌ | **Copperas Cove** | `https://www.copperascovetx.gov` | Planning, zoning maps |

### Regional

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 90 | ❌ | **KTMPO Maps & Data** | `https://ktmpo.org/roadway/maps-and-data/` | Killeen-Temple MPO transportation GIS |
| 91 | ❌ | **CTCOG GIS & Mapping** | `https://ctcog.org/public-safety/gis-mapping/` | Central TX COG regional GIS (7-county) |

---

## 12. FEDERAL — CENSUS / TIGER / OTHER

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 92 | ❌ | **Census TIGER/Line Shapefiles** | `https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html` | County/city/tract boundaries, roads (2025 avail) |
| 93 | ❌ | **Census Geocoder** | `https://geocoding.geo.census.gov/geocoder/` | Address geocoding + reverse + county FIPS |
| 94 | ❌ | **National Wetlands Inventory** | `https://fwsmapping.wim.usgs.gov/wetlands/apps/wetlands-mapper/` | Wetlands boundaries |
| 95 | ❌ | **EPA NEPAssist** | `https://nepassisttool.epa.gov/nepassist/nepamap.aspx` | Superfund, brownfields screening |
| 96 | ❌ | **USACE Section 404 Permits** | `https://permits.ops.usace.army.mil/orm-public` | Wetland permits near waterways |

---

## 13. BELL COUNTY — GENERAL

| # | Status | Source | URL | Data |
|---|--------|--------|-----|------|
| 97 | ❌ | **Bell County Official Site** | `https://www.bellcountytx.com` | Departments, court records, permits |
| 98 | ❌ | **Bell County Tax Office** | `https://www.bellcountytx.com/tax_assessor_collector/` | Tax payment status, delinquencies |
| 99 | ❌ | **Bell County Utility Info** | `https://www.bellcountytx.com/departments/auditor/departments/utility_information.php` | County utility reporting |

---

## TOTALS

- **99 distinct sources identified**
- **7 fully working** scrapers (✅)
- **3 partially built** (🔧)
- **89 not yet built** (❌)

---

## DATA COLLECTION WORKFLOW

For each site, collect this bundle before building a scraper:

```
📁 site-{number}-{name}/
├── 01-landing.html              ← Full page source (Ctrl+U or Save As Complete)
├── 01-landing-screenshot.png
├── 02-search-form.html          ← The input/search page
├── 02-search-screenshot.png
├── 03-results.html              ← Results after a sample search
├── 03-results-screenshot.png
├── 04-detail.html               ← Single record detail page
├── 04-detail-screenshot.png
├── network-log.har              ← DevTools → Network → Export HAR (with content)
├── api-calls.txt                ← XHR/Fetch calls (Copy as cURL from Network tab)
└── notes.txt                    ← Observations: login? CAPTCHA? rate limits? SPA?
```

### Collection steps:
1. Open DevTools (F12) → Network tab → Check "Preserve log"
2. Navigate the site naturally (land → search → results → detail)
3. Right-click Network → "Save all as HAR with content"
4. Filter by Fetch/XHR → right-click each → "Copy as cURL" → paste into api-calls.txt
5. Save each page's HTML source
6. Take screenshots at each step
7. Note any issues in notes.txt

### Priority order:
- **Tier 1** (API/REST — easy): #33-34, #25-26, #16, #62-63, #45, #48
- **Tier 2** (HTML with patterns): #3, #7, #9-11, #12-13, #50-51
- **Tier 3** (SPA/Playwright): #1-2, #17-18, #78-79, #82
- **Tier 4** (Reference/manual): #40-77 (utility/railroad)
