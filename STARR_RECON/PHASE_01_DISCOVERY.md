# STARR RECON — Phase 1: Universal Property Discovery & CAD Integration

**Product:** Starr Compass — AI Property Research (STARR RECON)  
**Version:** 1.0 | **Last Updated:** March 2026  
**Phase Duration:** Weeks 1–3  
**Depends On:** Nothing (this is the starting phase)  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

Given **ANY** Texas property address, find the property ID, owner, legal description, acreage, subdivision/plat membership, and all associated records across **any county's CAD system** in Texas.

**Deliverable:** A `PropertyDiscoveryEngine` that takes an address string and returns a comprehensive `PropertyIdentity` object, working across all 254 Texas counties.

---

## Current State of the Codebase

**Phase Status: ✅ COMPLETE**

All Phase 1 code has been implemented. The following files exist and are production-ready:

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/discovery-engine.ts` | `PropertyDiscoveryEngine` — multi-vendor CAD search orchestrator | ✅ Complete |
| `worker/src/services/property-discovery.ts` | Express route handler (`POST /research/discover`) | ✅ Complete |
| `worker/src/services/cad-registry.ts` | CAD vendor registry mapping FIPS codes to adapter configs | ✅ Complete |
| `worker/src/services/address-utils.ts` | Address parsing, normalization, variant generation, geocoding | ✅ Complete |
| `worker/src/services/address-normalizer.ts` | Address normalization (Census geocoder integration) | ✅ Complete |
| `worker/src/adapters/cad-adapter.ts` | Abstract `CadAdapter` base class | ✅ Complete |
| `worker/src/adapters/bis-adapter.ts` | BIS Consultants adapter (Bell, McLennan, Coryell, Lampasas, ~60 counties) | ✅ Complete |
| `worker/src/adapters/trueautomation-adapter.ts` | TrueAutomation adapter (Travis, Dallas/DCAD, Bexar, Fort Bend, ~80 counties) | ✅ Complete |
| `worker/src/adapters/tyler-adapter.ts` | Tyler/Aumentum adapter (Williamson, Hays, Comal, Guadalupe, ~50 counties) | ✅ Complete |
| `worker/src/adapters/generic-cad-adapter.ts` | AI-assisted generic Playwright fallback | ✅ Complete |
| `worker/src/lib/county-fips.ts` | Texas county FIPS lookup table (all 254 counties) | ✅ Complete |
| `worker/src/types/property-discovery.ts` | Phase 1 TypeScript types | ✅ Complete |

### API Endpoint

`POST /research/discover` — live in `worker/src/index.ts`

### Still Missing / Not Yet Built

| Item | Notes |
|------|-------|
| `worker/src/adapters/hcad-adapter.ts` | Harris County (Houston) custom CAD adapter — needed for statewide coverage |
| `worker/src/adapters/tad-adapter.ts` | Tarrant County (Fort Worth) custom CAD adapter — needed for statewide coverage |
| `GET /research/discover/:projectId` status endpoint | Phase 1 uses `/research/status/:projectId` instead |

### Notes on Legacy Files

`worker/src/services/bell-cad.ts` — the original monolithic BIS CAD scraper. This file still exists and is still used by the older `pipeline.ts` service. It is functionally superseded by `bis-adapter.ts` but has not been deleted. Future cleanup should migrate any remaining callers to the adapter-based `discovery-engine.ts` and remove `bell-cad.ts`.

---

1. [What This Phase Must Accomplish](#1-what-this-phase-must-accomplish)
2. [Architecture Overview](#2-architecture-overview)
3. [CAD System Landscape](#3-cad-system-landscape)
4. [Detection Strategy — CAD Registry](#4-detection-strategy--cad-registry)
5. [Address Normalization Engine](#5-address-normalization-engine)
6. [Acceptance Criteria](#6-acceptance-criteria)

---

## 1. What This Phase Must Accomplish

By the end of Phase 1, running this command on the droplet:

```bash
curl -X POST http://localhost:3100/research/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "address": "3779 FM 436, Belton, TX 76513",
    "county": "Bell",
    "state": "TX"
  }'
```

…should return a structured response like:

```json
{
  "status": "complete",
  "property": {
    "propertyId": "524312",
    "geoId": "02135-00524312",
    "owner": "ASH FAMILY TRUST",
    "ownerAddress": "PO Box 123, Belton TX 76513",
    "legalDescription": "ASH FAMILY TRUST 12.358 ACRE ADDITION, LOT 1",
    "acreage": 12.358,
    "assessedValue": 285000,
    "propertyType": "real",
    "county": "Bell",
    "countyFIPS": "48027",
    "cadSystem": "bis_consultants",
    "isSubdivision": true,
    "subdivisionName": "ASH FAMILY TRUST 12.358 ACRE ADDITION",
    "totalLots": 6,
    "lotNumber": null,
    "abstractSurvey": "WILLIAM HARTRICK SURVEY, A-488",
    "relatedPropertyIds": ["524312", "524313", "524314", "524315", "524316", "524317"],
    "adjacentOwners": [],
    "taxYear": 2025,
    "deedReferences": [
      { "instrumentNumber": "2010043440", "type": "deed", "date": "2010-08-15" },
      { "instrumentNumber": "2023032044", "type": "plat", "date": "2023-04-12" }
    ]
  },
  "sources": [
    { "name": "Bell CAD eSearch", "url": "esearch.bellcad.org", "method": "bis_api", "success": true },
    { "name": "Bell CAD Property Detail", "url": "esearch.bellcad.org/Property/View/524312", "method": "playwright", "success": true }
  ],
  "timing": { "totalMs": 8450, "stage1_geocode": 320, "stage2_cad_search": 4200, "stage3_detail_scrape": 3930 },
  "errors": []
}
```

This must work for **any address in any Texas county**, not just Bell County.

---

## 2. Architecture Overview

```
INPUT: Address string + optional county hint
  │
  ├── STEP 1: ADDRESS NORMALIZATION & GEOCODING
  │   ├── Parse raw address into components
  │   ├── Geocode to lat/lon via Census Bureau API
  │   ├── Reverse-geocode to get county FIPS code
  │   └── Generate address variants for search
  │
  ├── STEP 2: CAD SYSTEM DETECTION
  │   ├── Look up county in CAD system registry
  │   ├── Select appropriate adapter (BIS, Tyler/Aumentum, TrueAutomation, Harris HCAD, etc.)
  │   └── Initialize adapter with county-specific config
  │
  ├── STEP 3: PROPERTY SEARCH
  │   ├── Try address search variants (most specific → least specific)
  │   ├── Fallback: owner name search if address fails
  │   ├── Fallback: AI screenshot OCR if DOM parsing fails
  │   ├── Filter results: real property only, match acreage/location
  │   └── Return best-match Property ID
  │
  ├── STEP 4: PROPERTY DETAIL ENRICHMENT
  │   ├── Navigate to property detail page
  │   ├── Extract: owner, legal desc, acreage, value, abstract/survey
  │   ├── Extract: deed references, plat references
  │   ├── Detect subdivision membership (legal desc patterns)
  │   ├── If subdivision: find all related lot Property IDs
  │   └── Build PropertyIdentity object
  │
  └── STEP 5: CROSS-REFERENCE & VALIDATION
      ├── Verify acreage matches across CAD fields
      ├── Validate Property ID format for county
      ├── Flag any inconsistencies
      └── Return final PropertyIdentity
```

---

## 3. CAD System Landscape

Texas has 254 counties, but they use only a handful of CAD website vendors. By building adapters for the top 5–6 vendors, we cover 90%+ of Texas properties.

### CAD Vendor Market Share (Approximate)

| Vendor | System Name | Est. Counties | Major Counties Using It |
|---|---|---|---|
| BIS Consultants | eSearch / BIS | ~60+ | Bell, McLennan, Coryell, Lampasas, Milam |
| Tyler Technologies | Aumentum / iasWorld | ~50+ | Williamson, Hays, Comal, Guadalupe |
| TrueAutomation | TrueSearch / TAWeb | ~80+ | Travis, Dallas (DCAD), Bexar, Fort Bend |
| Harris County (HCAD) | Custom (hcad.org) | 1 | Harris (Houston — largest TX county) |
| Tarrant County (TAD) | Custom (tad.org) | 1 | Tarrant (Fort Worth) |
| Capitol Appraisal Group | Custom | ~20+ | Various rural counties |
| Pritchard & Abbott | Custom | ~30+ | Various rural/mid-size counties |

---

## 4. Detection Strategy — CAD Registry

The CAD registry maps county FIPS codes to their CAD system configuration. Adapters read this registry to know which URLs and selectors to use.

### 4.1 `CADConfig` Interface

```typescript
// worker/src/adapters/cad/cad-registry.ts

interface CADConfig {
  vendor: 'bis' | 'tyler' | 'trueautomation' | 'hcad' | 'tad' | 'capitol' | 'pritchard' | 'generic';
  searchUrl: string;
  apiUrl?: string;           // If backend API discovered
  detailUrlPattern: string;  // URL pattern for property detail page
  searchMethod: 'api' | 'playwright' | 'hybrid';
  addressField: string;      // Form field name for address search
  ownerField: string;        // Form field name for owner search
  resultSelector: string;    // CSS selector for search results
  propertyIdField: string;   // Where to find the Property ID in results
  customNotes?: string;      // County-specific quirks
}
```

### 4.2 `CAD_REGISTRY`

```typescript
const CAD_REGISTRY: Record<string, CADConfig> = {
  // BELL COUNTY — BIS Consultants (FULLY TESTED)
  '48027': {
    vendor: 'bis',
    searchUrl: 'https://esearch.bellcad.org/Search/Result',
    apiUrl: 'https://esearch.bellcad.org/api/search',
    detailUrlPattern: 'https://esearch.bellcad.org/Property/View/{propertyId}',
    searchMethod: 'hybrid',  // API first, Playwright fallback
    addressField: 'situs_street',
    ownerField: 'owner_name',
    resultSelector: '.search-result-row',
    propertyIdField: 'PropertyId',
    customNotes: 'BIS API discovered at /api/search endpoint. Address search may return personal property (vehicles) — filter by property_type=R for real property. FM roads may be indexed without FM prefix.'
  },

  // WILLIAMSON COUNTY — Tyler/Aumentum
  '48491': {
    vendor: 'tyler',
    searchUrl: 'https://search.wcad.org/Search',
    detailUrlPattern: 'https://search.wcad.org/Property-Detail/PropertyQuickRefID/{propertyId}',
    searchMethod: 'playwright',
    addressField: 'txtAddress',
    ownerField: 'txtOwnerName',
    resultSelector: '.property-results tbody tr',
    propertyIdField: 'data-quickrefid'
  },

  // TRAVIS COUNTY — TrueAutomation (TCAD)
  '48453': {
    vendor: 'trueautomation',
    searchUrl: 'https://travis.trueautomation.com/clientdb/PropertySearch.aspx',
    detailUrlPattern: 'https://travis.trueautomation.com/clientdb/Property.aspx?prop_id={propertyId}',
    searchMethod: 'playwright',
    addressField: 'ctl00$ContentPlaceHolder1$TextBoxAddress',
    ownerField: 'ctl00$ContentPlaceHolder1$TextBoxOwner',
    resultSelector: '#ctl00_ContentPlaceHolder1_GridViewSearchResults tr',
    propertyIdField: 'prop_id'
  },

  // HARRIS COUNTY — Custom HCAD
  '48201': {
    vendor: 'hcad',
    searchUrl: 'https://public.hcad.org/records/quicksearch.asp',
    detailUrlPattern: 'https://public.hcad.org/records/details.asp?cession=1&search={propertyId}',
    searchMethod: 'playwright',
    addressField: 'search_str',
    ownerField: 'search_str',
    resultSelector: '.searchResults tr',
    propertyIdField: 'acct',
    customNotes: 'HCAD uses account numbers. Address format: 1234 MAIN ST. No geocoding needed — just street number + name.'
  },

  // MCLENNAN COUNTY — BIS Consultants (Waco area)
  '48309': {
    vendor: 'bis',
    searchUrl: 'https://esearch.mclennancad.org/Search/Result',
    apiUrl: 'https://esearch.mclennancad.org/api/search',
    detailUrlPattern: 'https://esearch.mclennancad.org/Property/View/{propertyId}',
    searchMethod: 'hybrid',
    addressField: 'situs_street',
    ownerField: 'owner_name',
    resultSelector: '.search-result-row',
    propertyIdField: 'PropertyId',
    customNotes: 'Same BIS platform as Bell CAD. Same adapter should work with URL swap.'
  },

  // BEXAR COUNTY — TrueAutomation (San Antonio)
  '48029': {
    vendor: 'trueautomation',
    searchUrl: 'https://bexar.trueautomation.com/clientdb/PropertySearch.aspx',
    detailUrlPattern: 'https://bexar.trueautomation.com/clientdb/Property.aspx?prop_id={propertyId}',
    searchMethod: 'playwright',
    addressField: 'ctl00$ContentPlaceHolder1$TextBoxAddress',
    ownerField: 'ctl00$ContentPlaceHolder1$TextBoxOwner',
    resultSelector: '#ctl00_ContentPlaceHolder1_GridViewSearchResults tr',
    propertyIdField: 'prop_id'
  },

  // DALLAS COUNTY — Custom DCAD system
  '48113': {
    vendor: 'trueautomation',
    searchUrl: 'https://www.dallascad.org/SearchAddr.aspx',
    detailUrlPattern: 'https://www.dallascad.org/AcctDetailRes.aspx?ID={propertyId}',
    searchMethod: 'playwright',
    addressField: 'txtAddress',
    ownerField: 'txtOwnerName',
    resultSelector: '.datagrid tr',
    propertyIdField: 'ID'
  },

  // TARRANT COUNTY — Custom TAD
  '48439': {
    vendor: 'tad',
    searchUrl: 'https://www.tad.org/property-search/',
    detailUrlPattern: 'https://www.tad.org/property/{propertyId}/',
    searchMethod: 'playwright',
    addressField: 'address',
    ownerField: 'owner_name',
    resultSelector: '.search-results-table tr',
    propertyIdField: 'account_num'
  },

  // HAYS COUNTY — Tyler/Aumentum
  '48209': {
    vendor: 'tyler',
    searchUrl: 'https://esearch.hayscad.com/Property/Search',
    detailUrlPattern: 'https://esearch.hayscad.com/Property/View/{propertyId}',
    searchMethod: 'playwright',
    addressField: 'situs_address',
    ownerField: 'owner_name',
    resultSelector: '.search-results tr',
    propertyIdField: 'PropertyId'
  },

  // COMAL COUNTY — Tyler/Aumentum
  '48091': {
    vendor: 'tyler',
    searchUrl: 'https://esearch.comalcad.org/Property/Search',
    detailUrlPattern: 'https://esearch.comalcad.org/Property/View/{propertyId}',
    searchMethod: 'playwright',
    addressField: 'situs_address',
    ownerField: 'owner_name',
    resultSelector: '.search-results tr',
    propertyIdField: 'PropertyId'
  },

  // CORYELL COUNTY — BIS Consultants
  '48099': {
    vendor: 'bis',
    searchUrl: 'https://esearch.coryellcad.org/Search/Result',
    apiUrl: 'https://esearch.coryellcad.org/api/search',
    detailUrlPattern: 'https://esearch.coryellcad.org/Property/View/{propertyId}',
    searchMethod: 'hybrid',
    addressField: 'situs_street',
    ownerField: 'owner_name',
    resultSelector: '.search-result-row',
    propertyIdField: 'PropertyId'
  },

  // LAMPASAS COUNTY — BIS Consultants
  '48281': {
    vendor: 'bis',
    searchUrl: 'https://esearch.lampasascad.org/Search/Result',
    apiUrl: 'https://esearch.lampasascad.org/api/search',
    detailUrlPattern: 'https://esearch.lampasascad.org/Property/View/{propertyId}',
    searchMethod: 'hybrid',
    addressField: 'situs_street',
    ownerField: 'owner_name',
    resultSelector: '.search-result-row',
    propertyIdField: 'PropertyId'
  }
};
```

### 4.3 Fallback Strategy (Unknown Counties)

For counties not in the registry, use AI-assisted discovery:

```typescript
const FALLBACK_STRATEGY = {
  step1: 'Google search: "{county} county Texas appraisal district property search"',
  step2: 'Navigate to result, screenshot, AI-identify search form',
  step3: 'AI fills form and parses results',
  step4: 'Cache the discovered config for future use'
};
```

---

## 5. Address Normalization Engine

Texas addresses have many quirks that cause search failures. The normalization engine handles all of them by generating multiple search variants, trying from most specific to least specific.

### 5.1 Common Texas Address Quirks

| Issue | Example | Solution |
|---|---|---|
| FM/RM prefix stripping | `"3779 FM 436"` indexed as `"3779 436"` | Try with and without FM/RM prefix |
| Directional abbreviation | `"N Main St"` vs `"North Main St"` | Generate both variants |
| Highway naming | `"US 190"` vs `"US Hwy 190"` vs `"Highway 190"` | Generate all highway variants |
| Suite/Unit stripping | `"100 Main St Suite 200"` | Try with and without unit |
| Rural route | `"RR 1 Box 234"` | May not be in CAD at all — use owner name fallback |
| Street suffix | `"Drive"` vs `"Dr"` vs `"DR"` | Generate abbreviated and full forms |
| County road format | `"CR 123"` vs `"County Road 123"` | Generate both |
| Apt/Lot/Space | `"123 Main St Lot 5"` | Strip lot/space for address search |

### 5.2 Normalization Algorithm

```typescript
// worker/src/pipeline/phase-1-discovery/address-normalizer.ts

interface AddressComponents {
  streetNumber: string;
  streetName: string;
  streetSuffix?: string;
  directional?: string;
  unit?: string;
  city: string;
  state: string;
  zip?: string;
}

interface NormalizedAddress {
  raw: string;
  components: AddressComponents;
  variants: string[];          // All search variants, most specific first
  countyFIPS?: string;         // Set after geocoding
  lat?: number;
  lon?: number;
}

/**
 * Generates all viable search variants for a Texas address.
 * Variants are ordered from most specific (exact) to least specific (number + street name only).
 */
function generateAddressVariants(components: AddressComponents): string[] {
  const variants: string[] = [];
  const { streetNumber, streetName, streetSuffix, directional } = components;

  // Normalize FM/RM roads
  const fmMatch = streetName.match(/^(FM|RM|Farm\s+to\s+Market|Farm\s+Road)\s+(\d+)$/i);
  if (fmMatch) {
    const roadNum = fmMatch[2];
    variants.push(`${streetNumber} FM ${roadNum}`);
    variants.push(`${streetNumber} RM ${roadNum}`);
    variants.push(`${streetNumber} Farm to Market ${roadNum}`);
    variants.push(`${streetNumber} Farm Road ${roadNum}`);
    variants.push(`${streetNumber} ${roadNum}`);   // Stripped prefix fallback
    return variants;
  }

  // Normalize County Roads
  const crMatch = streetName.match(/^(CR|County\s+Road)\s+(\d+)$/i);
  if (crMatch) {
    const roadNum = crMatch[2];
    variants.push(`${streetNumber} CR ${roadNum}`);
    variants.push(`${streetNumber} County Road ${roadNum}`);
    variants.push(`${streetNumber} ${roadNum}`);
    return variants;
  }

  // Normalize US/State Highways
  const hwMatch = streetName.match(/^(US|SH|TX|IH|Highway|Hwy)\s+(\d+\w*)$/i);
  if (hwMatch) {
    const roadNum = hwMatch[2];
    const prefix = hwMatch[1].toUpperCase();
    variants.push(`${streetNumber} ${prefix} ${roadNum}`);
    variants.push(`${streetNumber} ${prefix} Hwy ${roadNum}`);
    variants.push(`${streetNumber} Highway ${roadNum}`);
    variants.push(`${streetNumber} ${roadNum}`);
    return variants;
  }

  // Standard street with directional
  const base = [streetNumber, directional, streetName, streetSuffix]
    .filter(Boolean)
    .join(' ');
  variants.push(base);

  // Without suffix
  if (streetSuffix) {
    variants.push([streetNumber, directional, streetName].filter(Boolean).join(' '));
  }

  // Without directional
  if (directional) {
    variants.push([streetNumber, streetName, streetSuffix].filter(Boolean).join(' '));
    variants.push([streetNumber, streetName].filter(Boolean).join(' '));
  }

  // Abbreviated suffix variants (Dr ↔ Drive, St ↔ Street, etc.)
  const SUFFIX_MAP: Record<string, string> = {
    'DRIVE': 'DR', 'STREET': 'ST', 'AVENUE': 'AVE', 'BOULEVARD': 'BLVD',
    'ROAD': 'RD', 'LANE': 'LN', 'COURT': 'CT', 'CIRCLE': 'CIR',
    'TRAIL': 'TRL', 'PLACE': 'PL', 'WAY': 'WAY', 'LOOP': 'LOOP',
  };
  if (streetSuffix) {
    const upper = streetSuffix.toUpperCase();
    const alt = SUFFIX_MAP[upper] ?? Object.keys(SUFFIX_MAP).find(k => SUFFIX_MAP[k] === upper);
    if (alt && alt !== upper) {
      variants.push([streetNumber, directional, streetName, alt].filter(Boolean).join(' '));
    }
  }

  return [...new Set(variants)]; // deduplicate
}
```

### 5.3 Geocoding Integration

The Census Bureau Geocoder API is used as the primary geocoding source (free, no API key required, authoritative for US addresses):

```typescript
const CENSUS_GEOCODER_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; countyFIPS: string } | null> {
  const params = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    format: 'json',
  });
  const res = await fetch(`${CENSUS_GEOCODER_URL}?${params}`);
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];
  if (!match) return null;

  const { x: lon, y: lat } = match.coordinates;
  // State FIPS (48) + county FIPS (3 digits) = 5-digit FIPS
  const countyFIPS = match.geographies?.['Counties']?.[0]?.GEOID ?? '';
  return { lat, lon, countyFIPS };
}
```

---

## 6. Acceptance Criteria

- [ ] `POST /research/discover` returns HTTP 200 with a valid `PropertyIdentity` for `3779 FM 436, Belton, TX 76513` (Bell County — BIS adapter)
- [ ] Same endpoint works for a Travis County address (TrueAutomation adapter)
- [ ] Same endpoint works for a Williamson County address (Tyler adapter)
- [ ] Same endpoint works for a Harris County address (HCAD adapter)
- [ ] FM/RM address variants are tried automatically when the exact form fails
- [ ] County road (`CR 123`) and highway (`US 190`) variants are generated correctly
- [ ] Geocoding correctly identifies county FIPS from raw address string
- [ ] Unknown county falls back to AI-assisted discovery (`FALLBACK_STRATEGY`)
- [ ] `propertyType` filter removes personal property (vehicles, etc.) from results
- [ ] Subdivision membership is detected and `relatedPropertyIds` are populated when applicable
- [ ] Response includes `sources[]` with each system queried and whether it succeeded
- [ ] Response includes `timing` object with per-stage millisecond breakdowns
- [ ] Total discovery time for a Bell CAD property is under 15 seconds

---

## 7. Property Discovery Orchestrator

The `PropertyDiscoveryEngine` in `worker/src/services/property-discovery.ts` ties together all steps above.

```typescript
const engine = new PropertyDiscoveryEngine();
const result = await engine.discover("3779 FM 436, Belton, TX 76513", "Bell", "TX");
```

It selects the adapter via `getCADConfig(countyFIPS)`, runs address-variant search, fetches detail, cross-validates, and always calls `adapter.destroy()` in the `finally` block.

---

## 8. Express API Endpoints

Both endpoints require `Authorization: Bearer $WORKER_API_KEY`.

### `POST /research/discover`

Synchronous. Returns a `DiscoveryResult` when complete.

```bash
curl -X POST http://localhost:3100/research/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{ "address": "3779 FM 436, Belton, TX 76513", "county": "Bell", "state": "TX" }'
```

### `POST /research/full-pipeline`

Asynchronous. Returns HTTP 202 immediately; poll `/research/status/:projectId` for progress.

```bash
curl -X POST http://localhost:3100/research/full-pipeline \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{ "projectId": "proj_abc123", "address": "3779 FM 436, Belton, TX 76513" }'
```

---

## 9. CLI Script

`worker/research.sh` — run property research directly from the droplet console:

```bash
# Single address
./research.sh "3779 FM 436, Belton, TX 76513"

# With explicit county hint (skips geocoding)
./research.sh "3779 FM 436, Belton, TX 76513" Bell
```

Output is pretty-printed JSON and also saved to `/tmp/discovery_<timestamp>.json`.

---

## 10. Testing Checklist

| Test Case | Address | County | Expected Result |
|---|---|---|---|
| Bell County FM road | `3779 FM 436, Belton TX 76513` | Bell | ASH FAMILY TRUST, subdivision detected |
| Bell County standard | `3424 Waggoner Dr, Belton TX 76513` | Bell | Residential property found |
| Bell County rural | `15000 FM 93, Temple TX 76504` | Bell | Large tract, possibly standalone |
| Auto county detection | `1100 Congress Ave, Austin TX 78701` | (auto) | Travis County detected, TCAD searched |
| Unknown county | `123 Main St, Small Town TX 79999` | (auto) | Generic adapter with AI assist |
| Highway format | `100 US Hwy 190, Belton TX 76513` | Bell | Tests highway variant generation |
| Subdivision lot | `1234 Oak Dr, Nolanville TX 76559` | Bell | Lot detected, subdivision name extracted |

### Phase 1 Acceptance Criteria

- [ ] Given a Bell County address, returns `PropertyDetail` within 15 seconds
- [ ] Correctly identifies subdivisions from legal description
- [ ] Finds all lots in a subdivision when one lot is searched
- [ ] Auto-detects county from address (geocoding)
- [ ] Works for at least 3 CAD vendors (BIS, Tyler, TrueAutomation)
- [ ] Falls back to AI screenshot OCR when DOM parsing fails
- [ ] Generates correct address variants for FM/SH/US/CR roads
- [ ] CLI script works from droplet console
- [ ] All results logged and saved to `/tmp` for review
- [ ] Error messages are descriptive (not just "search failed")

---

*Next: See `PHASE_02_HARVEST.md` — Free Document Harvesting*
