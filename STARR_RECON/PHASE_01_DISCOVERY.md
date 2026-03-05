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

## Table of Contents

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

*Next: See `PHASE_02_HARVEST.md` — Free Document Harvesting*
