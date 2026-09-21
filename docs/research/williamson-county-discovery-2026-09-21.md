# Williamson County — site discovery

**Driven by hand on 2026-09-21** with a real browser, against the live sites. Every endpoint below
was called and its response read; nothing here is inferred from a vendor pattern or copied from
another county.

Prompted by job 26144's research run, which spent twelve minutes and concluded nothing about
1007 Cushing Dr, Round Rock. The answer took **0.16 seconds** once the right host was found.

---

## The headline: the configured CAD host has never existed

`worker/src/services/bis-cad.ts` points Williamson at **`esearch.wilcotx.gov`**.

```
$ nslookup esearch.wilcotx.gov 8.8.8.8
  ** server can't find esearch.wilcotx.gov: NXDOMAIN
```

It is not blocked, not firewalled, not geo-fenced. **It does not resolve.** That single fact
explains both errors the run reported and which I had earlier attributed to a proxy:

| Log line | Real cause |
|---|---|
| `Stage1A: [network] fetch failed` | NXDOMAIN on a direct fetch |
| `Stage1B: net::ERR_TUNNEL_CONNECTION_FAILED` | The proxy cannot open a tunnel to a host that does not resolve either |

A proxy refusing a tunnel and a hostname not existing look identical from inside Playwright. They
are not the same problem, and the cheaper one was the real one.

**Williamson's appraisal district is WCAD, on its own domain:**

| Host | Resolves | What it is |
|---|---|---|
| `esearch.wilcotx.gov` | **NXDOMAIN** | configured, fictional |
| `search.wcad.org` | 207.207.29.141 | **the property search** |
| `propaccess.wcad.org` | 199.16.172.87 | alternate front door |
| `www.wcad.org` | 199.16.172.87 | the district's site |
| `data.wcad.org` | Socrata | **97 open datasets — see below** |
| `gisweb.wcad.org` | resolves | **expired TLS certificate** |
| `williamsoncountytx-web.tylerhost.net` | 3.18.125.236 | the clerk |

## The vendor is wrong too

The profile resolver reports Williamson's appraisal vendor as **BIS**. It is not.
`search.wcad.org` serves `PublicAccess > Home` — **True Automation / Tyler PublicAccess**, on DNN
(DotNetNuke) with ASP.NET WebForms and Kendo UI. Different vendor, different URL shapes, different
everything. A run using "the vendor's shapes" was using the wrong vendor's shapes.

---

## 1 · The appraisal district — search.wcad.org

### 1.1 Quick search — a clean JSON API, no auth, no browser

```
GET https://search.wcad.org/ProxyT/Search/Properties/quick/
      ?f=<text>&pn=1&st=4&so=desc&pt=RP;PP;MH;NR&ty=<taxYear>
```

| Param | Meaning |
|---|---|
| `f` | free text — name, address or property id, any combination |
| `pn` | page number, 1-based |
| `st` / `so` | sort field / direction (`4` / `desc` as the site sends) |
| `pt` | property types — `RP` real, `PP` personal, `MH` mobile home, `NR` |
| `ty` | tax year — **2027** as of this writing |

Measured: **200 in 0.164s**, no cookie, no token, no referer check.

Response for `f=1007 CUSHING`:

```json
{"ResultList":[{
  "PropertyQuickRefID":"R075105",
  "PartyQuickRefID":"O011710",
  "PropertyNumber":"R-16-5591-EX00-0001",
  "OwnerName":"CITY OF ROUND ROCK",
  "SitusAddress":"1007 CUSHING DR, ROUND ROCK, TX  78664"
}],"RecordCount":1,"TotalPageCount":1,"TaxYear":2027}
```

**This is the single most valuable endpoint in the county.** It replaces the entire Stage 1
address-variant dance: one call, free text, and it tolerates the partial "1007 CUSHING" without any
variant generation at all.

### 1.2 Property detail — server-rendered, read by label

```
GET https://search.wcad.org/Property-Detail
      ?PropertyQuickRefID=R075105&PartyQuickRefID=O011710
```

ASP.NET WebForms; the content is in the HTML, not an API. Fields confirmed present:

- **Legal Description** — `VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82`
- **Account** — `R-16-5591-EX00-0001`
- **Map Number** — `3-5927`
- Property Status, Property Type (`C3`), Neighborhood code
- Owner name, **Mailing Address**, Exemptions, Percent Ownership, Agent
- Full value breakdown; Entities & Exemptions (seven taxing units)
- **Improvements** — `24,420 Sq. Ft`, year built `2002`
- **Land Segments** — `122,839 Sq. ft / 2.820000 acres`
- **Value history** — five years

### 1.3 Two more ProxyT endpoints, found by watching the detail page

```
GET /ProxyT/properties/{quickRefId}/primaryimage/{taxYear}
GET /ProxyT/properties/{quickRefId}/{improvementId}/sketch/{taxYear}
```

The second is a **building sketch** — a dimensioned outline of the improvement. That is directly
useful to a surveyor and has no equivalent in the Bell profile. Both returned 500 on this
particular parcel, which is exempt city property with no photo on file; they need testing against an
ordinary residential parcel before being relied on.

---

## 2 · data.wcad.org — 97 open datasets, and nobody knew

This is the largest find. WCAD runs a **Socrata** open-data portal with a full SODA API: JSON,
SQL-like `$where` / `$select` / `$group`, no key required for public data.

```
GET https://data.wcad.org/resource/{id}.json?$where=...&$limit=...
GET https://data.wcad.org/api/catalog/v1?search_context=data.wcad.org&domains=data.wcad.org
```

### The datasets that matter

| Id | Name | Confirmed fields |
|---|---|---|
| `an3x-cnmw` | **Parcels** | `parcelid, siteaddress, ownernme1, cnvyname, pstladdres, bldgarea, resflrarea, resyrblt, lndvalue, nghbrhdcd, usecd, usedscrp` |
| `em3v-vwsk` | **Subdivisions** | `name, scode, type, acres, numberlots, filedate, geometry` |
| `2k72-e257` | **Sale — Certified** | `propertyid, book, page, deeddate, instrumenttypecode, transfervaliditydesc` |
| `pvyy-mm8r` | Sale — PropertyDataExport | sales export |
| `bbia-wsxs` | Owner | ownership |
| `ij43-xknu` | Property — PropertyDataExport | full property export |
| `ai3c-c9pf` / `553d-hn26` | Property — Certified / Preliminary | |
| `2ckt-cqwj` | Land — PropertyDataExport | land segments |
| `4d8i-sgri` | Improvement — PropertyDataExport | improvements |
| `cvyp-ab5t` | Property Characteristics | |
| `nbn7-h4pp` | Exemptions | |
| `fqhf-gyjx` | Building Permits | |
| `hfe8-ht8p` | Document Info | see the caveat below |
| `vgnm-5xkr` / `636c-i7s2` | MUD / ESD | special districts |
| `iwdk-wcuk` / `mnjq-32wk` | Cities / County Boundary | **the towns list, authoritatively** |

### Two things proven against the job's own parcel

**Subdivisions carries geometry.** The run reported *"No subdivision name yet … this is a
metes-and-bounds parcel."* It is not — it is Lot 1 of a platted subdivision, and the subdivision is
in the dataset with a polygon:

```
name "VILLAGE GREEN SUB"  scode S4892  type Subdivision  geometry: yes
```

**Sales carries the clerk bridge.** Sample row: `book 1539, page 526, deeddate 1987-06-05,
instrumenttypecode Conv`. So for Williamson the CAD→clerk bridge is **volume/page**, not the
instrument number Bell uses. That is a `capabilities.clerkBridge` difference and the reason a
Bell-shaped run would not have found deeds here even with a working clerk.

### The caveat on Document Info

`hfe8-ht8p` looks like a deed index and is not. Grouping its 30 most common types returns
`System Value Notice` (8.9M), `MV IMP PHOTO` (2.2M), `APEX`, `NOTICE OF HEARING LETTER PDF`,
`APPEAL PACKET PDF`, homestead applications, protest PDFs. It is the **appraisal district's internal
workflow archive** — valuable for a protest history, useless for a chain of title. Recorded here so
nobody wires it up as a deed source and reports "108 documents found" about a property, as its 108
rows for R075105 would invite.

---

## 3 · The clerk — Tyler Eagle, and it works

`https://williamsoncountytx-web.tylerhost.net/williamsonweb/` — **Tyler Technologies Self-Service,
version 2024.1.33**.

### 3.1 The gate

A disclaimer page at `/user/disclaimer` with a single **`I Accept`** button. Nothing works until it
is clicked; the acceptance rides in the session.

### 3.2 The search form

```
Page:  /williamsonweb/search/DOCSEARCH149S1
POST:  /williamsonweb/searchPost/DOCSEARCH149S1
```

Complete field map, read off the live form:

| Field id | Purpose |
|---|---|
| `field_BothNamesID` | grantor **or** grantee |
| `field_GrantorID` | grantor only |
| `field_GranteeID` | grantee only |
| `field_RecDateID_DOT_StartDate` / `…_EndDate` | recording date range |
| `field_DocNumID` | **instrument number** |
| `field_BookVolPageID_DOT_Book` / `…_Volume` / `…_Page` | **book / volume / page** |
| `field_selfservice_documentTypes` | document type filter |
| `field_UseAdvancedSearch` | advanced name matching (checkbox) |

Submit by clicking **`#searchButton`** — an `<a>`, not a submit input. Calling `form.submit()`
directly bypasses the page's own handler and returns *"An error has occurred"* with a support GUID;
verified by doing exactly that.

### 3.3 Coverage, stated by the site

> **Recorder Deeds/Official Records indexed from Dec 8, 1838 through Sep 14, 2026**

Full historical depth. Nothing about this county requires a paid aggregator for the index.

### 3.4 The rule that breaks naive scrapers — quoted from the page

> *"Note: In the Both Names field, Grantor field or Grantee field, the searcher needs to **either tab
> out of the field or click on a name in the drop down** after you search on the name."*

A name typed and submitted without that interaction returns *"We're sorry. Your search could not be
completed."* — **not** "no results". Confirmed by doing it. A scraper that fills and submits will
report a property has no deeds when the search never ran.

Two more stated conventions:

- **Individual names: `Last First`** — "Smith James". A broader search uses last name + first initial.
- **Organisational names as spelled** — "Texas Bank".
- **Instrument ranges:** `[2016073774 2016073800]` — square brackets, one space.

### 3.5 Instrument search works with a plain fill — proven

`field_DocNumID = 2002019648`, click `#searchButton`:

```
2002019648  •  RELEASE  •  03/12/2002 02:34 PM
Book/Page      B: NONE B: 0 P: 0
Grantor        BOMAR CHARLES
Grantee (2)    PETERSON PRESTON ORN, PETERSON BARBARA
Legal Description   18.308 AC GARCIA M SVY ABST 246
```

Results carry grantor, grantee, **legal description**, book/page, date and document type, plus
facet counts by description and by name. **The instrument and book/page paths need no autocomplete
interaction** — only the name fields do. Since the CAD's Sales dataset hands us book/page, the
reliable route into this clerk is:

> quick search → property id → Sales dataset → book/page → clerk book/page search

and the name search is the fallback rather than the first attempt. That is the reverse of Bell.

---

## 4 · GIS — the one genuine gap

- `gis.bisclient.com/wilcotx/...` — the configured path 404s. The BIS host answers but has no
  Williamson service tree; this is a leftover from the wrong-vendor assumption.
- `gisweb.wcad.org` — **expired TLS certificate** (`ERR_CERT_DATE_INVALID`). It hosts `MarketApp`
  and `EquityApp`, both keyed `?pin=<quickRefId>`.
- `wcad.maps.arcgis.com` — an ArcGIS Online organisation exists, but `portals/self` returns no id
  anonymously and an org search returns nothing, so its items are not public.
- ArcGIS Experience Builder apps are public and reachable:
  `https://experience.arcgis.com/experience/98d2c1d229244fdabe86b6bd9eb3fcae/page/Market-Sales/?pin=<id>`

**No public parcel FeatureServer was found.** This was listed as unknown #1 in the curation plan and
it remains partly open — but it matters far less than expected, because the **Socrata `Parcels`
dataset supplies parcel attributes and the `Subdivisions` dataset supplies polygons**, both without
ArcGIS at all.

---

## 5 · What this means for job 26144

The run reported nothing. Every one of these was available the whole time:

| | |
|---|---|
| Property id | **R075105** |
| Account | **R-16-5591-EX00-0001** |
| Owner | **CITY OF ROUND ROCK** — not Ebby Green, not the Housing Authority |
| Owner mailing | 221 MAIN ST, ROUND ROCK, TX 78664-5299 |
| Legal description | **VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82** |
| Subdivision | VILLAGE GREEN SUB, code **S4892**, polygon on file |
| Acreage | 2.82 ac / 122,839 sq ft |
| Improvement | 24,420 sq ft, built 2002 |
| Map number | 3-5927 |
| Neighborhood | R20QARR — EAST RRISD RENT RESTRICTED APTS |
| Exemption | Exempt Property (active) |

The neighbourhood code corroborates the housing-authority connection, and the exempt status
explains why: it is city-owned, rent-restricted housing. **It is not a metes-and-bounds parcel** —
it is Lot 1 of a recorded subdivision, which is exactly the case the free-plat path is for.

---

## 6 · Golden parcel

`R075105` is a poor regression fixture — exempt, no market value, no photo, no sketch. A curated
profile needs an ordinary residential parcel with a homestead exemption, a real sale and a deed.
**Open: pick one and read its answers off the live pages**, the way Bell's parcel 405 was done.

## 7 · Still open

1. A public **parcel polygon service**. Socrata `Parcels` may carry geometry — its field list was
   read but not its geometry column; `Subdivisions` definitely does.
2. **A free plat repository.** Not yet located. Bell's is a county-portal PDF index by subdivision
   name; Williamson's equivalent, if it exists, is probably under the clerk's plat records.
3. The **name-autocomplete interaction** on the clerk, driven end to end. The instrument and
   book/page paths are proven; the name path is understood but not yet automated.
4. `primaryimage` and `sketch` against a non-exempt parcel.
5. Whether `gisweb.wcad.org`'s certificate is permanently broken or a transient lapse.
