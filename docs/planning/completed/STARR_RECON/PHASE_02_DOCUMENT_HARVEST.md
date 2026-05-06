# STARR RECON — Phase 2: Free Document Harvesting & Multi-County Clerk Automation

**Product:** Starr Compass — AI Property Research (STARR RECON)  
**Version:** 1.1 | **Last Updated:** March 2026  
**Phase Duration:** Weeks 4–6  
**Depends On:** Phase 1 (`PropertyIdentity` with propertyId, owner, county, deed references)  
**Status:** ✅ COMPLETE — All core adapters built and tested; see §2 for remaining items  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

Given the `PropertyIdentity` output from Phase 1, automatically search and download **every free document** available from any Texas county clerk system — watermarked deeds, plats, easements, restrictions, and any other recorded documents for the target property, ALL subdivision lots, and ALL identifiable adjacent properties.

**Deliverable:** A `DocumentHarvester` that takes Phase 1 output and returns a `HarvestResult` containing images and metadata for every document found.

---

## Table of Contents

1. [What This Phase Must Accomplish](#1-what-this-phase-must-accomplish)
2. [Current State of the Codebase](#2-current-state-of-the-codebase)
3. [Texas County Clerk System Landscape](#3-texas-county-clerk-system-landscape)
4. [Architecture Overview](#4-architecture-overview)
5. [§2.3 ClerkAdapter Abstract Base](#53-clerkadapter-abstract-base)
6. [§2.4 KofileClerkAdapter](#64-kofileclerkadapter)
7. [§2.5 DocumentHarvester Orchestrator](#75-documentharvester-orchestrator)
8. [§2.6 Express API Endpoints](#86-express-api-endpoints)
9. [§2.7 CLI Harvest Script](#97-cli-harvest-script)
10. [§2.8 Document Intelligence & Relevance Scoring](#108-document-intelligence--relevance-scoring)
11. [§2.9 Considerations & Edge Cases](#119-considerations--edge-cases)
12. [§2.10 Adapters Still To Build](#1210-adapters-still-to-build)
13. [Acceptance Criteria](#13-acceptance-criteria)
14. [File Map](#14-file-map)

---

## 1. What This Phase Must Accomplish

After Phase 1 identifies a property, Phase 2 downloads everything available for free:

```bash
curl -X POST http://localhost:3100/research/harvest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "propertyId": "524312",
    "owner": "ASH FAMILY TRUST",
    "county": "Bell",
    "countyFIPS": "48027",
    "subdivisionName": "ASH FAMILY TRUST 12.358 ACRE ADDITION",
    "relatedPropertyIds": ["524312", "524313", "524314", "524315", "524316", "524317"],
    "deedReferences": [
      { "instrumentNumber": "2010043440", "type": "deed" },
      { "instrumentNumber": "2023032044", "type": "plat" }
    ],
    "adjacentOwners": ["RK GAINES", "NORDYKE", "HEARTLAND RESOURCES LLC", "DIAMOND HOLDINGS"]
  }'
```

**Returns HTTP 202 immediately.** Check results via:

```bash
# Poll for completion
curl http://localhost:3100/research/harvest/ash-trust-001 \
  -H "Authorization: Bearer $WORKER_API_KEY"
```

**Result shape** (from `/tmp/harvest/{projectId}/harvest_result.json`):

```json
{
  "status": "complete",
  "documents": {
    "target": [
      {
        "instrumentNumber": "2010043440",
        "documentType": "warranty_deed",
        "recordingDate": "08/15/2010",
        "grantors": ["HEARTLAND RESOURCES LLC"],
        "grantees": ["ASH FAMILY TRUST"],
        "pages": 3,
        "images": [
          { "imagePath": "/tmp/harvest/ash-trust-001/2010043440/2010043440_p1.png", "isWatermarked": true, "quality": "fair" }
        ],
        "isWatermarked": true,
        "source": "kofile_48027",
        "purchaseAvailable": true,
        "estimatedPurchasePrice": 3.00,
        "relevance": "target"
      }
    ],
    "subdivision": [ ... ],
    "adjacent": {
      "RK GAINES": [ ... ],
      "NORDYKE": [ ... ]
    }
  },
  "documentIndex": {
    "totalDocumentsFound": 24,
    "totalPagesDownloaded": 67,
    "totalPagesAvailableForPurchase": 67,
    "estimatedPurchaseCost": 67.00,
    "sources": ["kofile_48027"],
    "failedSearches": 2,
    "searchesPerformed": 31
  },
  "timing": { "totalMs": 185000 },
  "errors": []
}
```

---

## 2. Current State of the Codebase

### Phase 1 — COMPLETE ✅

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/discovery-engine.ts` | PropertyDiscoveryEngine orchestrator | ✅ Done |
| `worker/src/services/property-discovery.ts` | Express wrapper | ✅ Done |
| `worker/src/adapters/cad-adapter.ts` | Abstract CAD base | ✅ Done |
| `worker/src/adapters/bell-cad.ts` | BIS Consultants adapter | ✅ Done |
| `worker/src/adapters/trueautomation-adapter.ts` | TrueAutomation adapter | ✅ Done |
| `worker/src/types/property-discovery.ts` | Phase 1 types | ✅ Done |
| `worker/src/services/bell-clerk.ts` | **Monolithic Kofile search** | ⚠️ Exists but superseded by Phase 2 adapter |

### Phase 2 — COMPLETE ✅

All Phase 2 files have been implemented and tested (563 unit tests pass as of March 2026):

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/adapters/clerk-adapter.ts` | Abstract ClerkAdapter base (§2.3) | ✅ Done |
| `worker/src/adapters/kofile-clerk-adapter.ts` | Kofile/PublicSearch adapter (§2.4) | ✅ Done |
| `worker/src/adapters/texasfile-adapter.ts` | TexasFile universal fallback | ✅ Fully implemented (index-only; images via Phase 9 purchase) |
| `worker/src/adapters/countyfusion-adapter.ts` | CountyFusion/Cott adapter | ✅ Done — ~10 counties, index-only |
| `worker/src/adapters/tyler-clerk-adapter.ts` | Tyler/Odyssey clerk adapter | ✅ Done — ~7 counties, varies by county |
| `worker/src/services/clerk-registry.ts` | Routes FIPS → correct adapter | ✅ Done — Kofile→CountyFusion→Tyler→TexasFile priority |
| `worker/src/services/document-harvester.ts` | Orchestrator (§2.5) | ✅ Done (bug fixes applied March 2026) |
| `worker/src/services/document-intelligence.ts` | Relevance scoring (§2.8) | ✅ Done |
| `worker/src/types/document-harvest.ts` | Phase 2 API wire types | ✅ Done (includes `adjacentOwners` field) |
| `worker/harvest.sh` | CLI harvest script (§2.7) | ✅ Done |
| `__tests__/recon/phase2-harvest.test.ts` | Unit test suite | ✅ 102 tests — all passing |

### Bug Fixes Applied (March 2026)

The following bugs were identified and fixed in this review:

1. **`document-harvester.ts`: `initSession()` was called outside the try block** — if browser
   launch failed, `destroySession()` was never called, leaking Playwright processes. Fixed by
   moving `initSession()` inside the try block so `finally` always cleans up.

2. **`document-harvester.ts`: Instance state not reset between `harvest()` calls** — `errors`,
   `searchCount`, and `failedSearchCount` accumulated across multiple invocations on the same
   instance. Fixed by resetting all counters at the start of `harvest()`.

3. **`document-harvester.ts`: Adjacent owner search was grantee-only** — documents where the
   adjacent owner appears as grantor (e.g. easements they granted, conveyances from them) were
   missed. Fixed by adding grantor search alongside grantee for each adjacent owner.

4. **`clerk-adapter.ts`: `smartSearch()` ignored the `legalDescription` query** — the parameter
   was accepted but never forwarded to `searchByLegalDescription()`. Fixed by adding Priority 5
   legal-description search. CountyFusion SUPERSEARCH now gets activated via this path.

5. **`types/document-harvest.ts`: Missing `adjacentOwners` field** — the API wire type did not
   include `adjacentOwners`, so REST clients had no documentation for the field. Added the field
   with a JSDoc comment explaining its purpose.

6. **`index.ts`: Missing `countyFIPS` validation** — harvest endpoint accepted requests without a
   FIPS code and silently fell back to TexasFile. Added explicit validation and a warning log when
   FIPS is absent.

7. **`kofile-clerk-adapter.ts`: AI fallback crashed when `ANTHROPIC_API_KEY` not set** — the
   fallback called the Anthropic API without checking for the key, causing a 401 error. Added a
   guard that logs a warning and returns `[]` instead.

### Known Limitations and TODOs

| Item | File | Notes |
|------|------|-------|
| 🔑 **ANTHROPIC_API_KEY required for AI fallback** | `kofile-clerk-adapter.ts` | Set in `.env` or worker environment. Without it, AI OCR fallback is skipped (DOM parsing only). |
| 🔑 **PLAYWRIGHT browsers must be installed** | All adapters | Run `npx playwright install chromium` on the worker droplet before first use. |
| 🔧 **Image dimension check** | `kofile-clerk-adapter.ts` | Images < 500px wide/tall (thumbnails) are not filtered by dimension. Add `sharp` dimension check. |
| 🔧 **Supabase integration** | `worker/src/index.ts` | `TODO` comment at line ~463: after writing harvest_result.json, also update Supabase `projects` table and upload images to Storage. |
| 🔧 **Potter County (48375) routing** | `clerk-registry.ts` | Listed in both Kofile FIPS set and CountyFusion configs. Kofile takes priority. Verify which system Potter County actually uses in production. |
| 🔧 **TexasFile SPA selectors may change** | `texasfile-adapter.ts` | TexasFile occasionally updates their React SPA. If searches return empty, check CSS selector patterns in `parseResults()`. |
| 🔧 **CountyFusion login wall** | `countyfusion-adapter.ts` | Some CountyFusion deployments (e.g. Dallas) require a free account login. Anonymous access may be blocked. |
| 🔧 **Tyler URL patterns** | `tyler-clerk-adapter.ts` | Only 7 counties have verified configs. Other Tyler counties use a generic pattern that may not work. |

### Key Relationship: `bell-clerk.ts` vs Phase 2 Adapters

`worker/src/services/bell-clerk.ts` is a **monolithic, procedural Kofile scraper** that was written for Phase 1's old pipeline. It contains excellent Playwright logic (multi-page capture, canvas extraction, S3 image download, AI OCR fallback) but is tightly coupled to the old `DocumentResult` pipeline type.

The Phase 2 `KofileClerkAdapter` (`kofile-clerk-adapter.ts`) is the **object-oriented replacement** that:
- Implements the standard `ClerkAdapter` interface
- Works for any county on the Kofile system (not just Bell)
- Exposes clean `searchByX()` and `getDocumentImages()` methods
- Integrates with the `DocumentHarvester` orchestrator

**Do NOT delete `bell-clerk.ts`** — it is still imported by the legacy `pipeline.ts` service.  When the full pipeline migrates to Phase 2, `bell-clerk.ts` can be retired.

---

## 3. Texas County Clerk System Landscape

| Vendor | System | Est. Counties | Interface | Free Preview | Notes |
|--------|--------|--------------|-----------|-------------|-------|
| **Kofile/GovOS** | PublicSearch | ~80+ | SPA (React) | Watermarked images | Most common. Signed S3 URLs. |
| **Cott Systems** | CountyFusion / SUPERSEARCH | ~40+ | Server-rendered | OCR full-text index | No image preview without purchase. |
| **Tyler Technologies** | Odyssey / Eagle | ~30+ | Server-rendered | Varies | Some image, some index-only. |
| **Aptean (Hyland)** | OnBase | ~20+ | Server-rendered | Varies | Older system, some counties. |
| **TexasFile** | texasfile.com | All 254 | Custom SPA | Index only | $1/page for images. Universal fallback. |
| **Custom/Legacy** | Various | ~30+ | Varies | Varies | County-built or legacy systems. |

### Critical Architecture Insight: SPA vs Server-Rendered

**SPA systems (Kofile, TexasFile):**
- Search results load via AJAX/fetch
- DOM is rendered client-side
- **MUST use Playwright** — HTTP-only scraping will not work
- Results appear AFTER JavaScript execution
- Image viewers use signed URLs that expire (~15 min)

**Server-rendered systems (CountyFusion, Tyler):**
- HTML rendered server-side
- CAN sometimes scrape with HTTP requests
- But many still require JavaScript for navigation
- Playwright is the safest approach

**Strategy:** Always use Playwright for reliability. Optimise by detecting backend APIs (like BIS Consultants) and intercepting AJAX calls via `page.waitForResponse()`.

---

## 4. Architecture Overview

```
POST /research/harvest
         │
         ▼
  DocumentHarvester
         │
         ├── ClerkRegistry.getAdapter(countyFIPS)
         │         └── returns KofileClerkAdapter | CountyFusionAdapter | TylerClerkAdapter | TexasFileAdapter
         │
         ├── PHASE A: Target property
         │    ├── searchByInstrumentNumber (known deed refs from Phase 1)
         │    ├── searchByGranteeName (owner as buyer)
         │    └── searchByGrantorName (owner as seller)
         │
         ├── PHASE B: Subdivision documents
         │    ├── searchByGranteeName (subdivision name → plats)
         │    ├── searchByGranteeName (subdivision name → CC&Rs)
         │    └── searchByGranteeName (subdivision name → easements)
         │
         └── PHASE C: Adjacent property documents
              └── searchByGranteeName (each adjacent owner, capped 5 docs each)

         │
         ▼
  DocumentIntelligence.filterAndRankResults()
         │  Scores 0–100, filters score < 20, sorts high → low
         ▼
  ClerkAdapter.getDocumentImages(instrumentNo)
         │  Downloads each page image to /tmp/harvest/{projectId}/{instrumentNo}/
         ▼
  HarvestResult persisted to /tmp/harvest/{projectId}/harvest_result.json
```

---

## 5. §2.3 ClerkAdapter Abstract Base

**File:** `worker/src/adapters/clerk-adapter.ts`  
**Status:** ✅ Implemented

The abstract base class that all county clerk adapters extend. Defines the interface, shared `smartSearch()` logic, and `classifyDocumentType()`.

### Key Types

```typescript
export type DocumentType =
  | 'warranty_deed' | 'special_warranty_deed' | 'quitclaim_deed' | 'deed_of_trust'
  | 'plat' | 'replat' | 'amended_plat' | 'vacating_plat'
  | 'easement' | 'utility_easement' | 'access_easement' | 'drainage_easement'
  | 'restrictive_covenant' | 'deed_restriction' | 'ccr'
  | 'release_of_lien' | 'mechanics_lien' | 'tax_lien'
  | 'right_of_way' | 'dedication' | 'vacation'
  | 'affidavit' | 'correction_instrument'
  | 'oil_gas_lease' | 'mineral_deed'
  | 'other';

export interface ClerkDocumentResult {
  instrumentNumber: string;
  volumePage?: { volume: string; page: string };
  documentType: DocumentType;
  recordingDate: string;        // ISO or MM/DD/YYYY from clerk
  grantors: string[];
  grantees: string[];
  legalDescription?: string;
  pageCount?: number;
  relatedInstruments?: string[];
  source: string;               // e.g. "kofile_48027"
}

export interface DocumentImage {
  instrumentNumber: string;
  pageNumber: number;
  totalPages: number;
  imagePath: string;            // Absolute local path
  imageUrl?: string;            // Signed URL (may expire)
  width?: number;
  height?: number;
  isWatermarked: boolean;
  quality: 'good' | 'fair' | 'poor';
}

export interface PricingInfo {
  available: boolean;
  pricePerPage?: number;
  totalPrice?: number;
  pageCount?: number;
  paymentMethod?: 'credit_card' | 'wallet' | 'subscription';
  source: string;
}
```

### Abstract Methods (each adapter must implement)

| Method | Description |
|--------|-------------|
| `searchByInstrumentNumber(no)` | Direct instrument number lookup (most precise) |
| `searchByVolumePage(vol, pg)` | Volume/page lookup |
| `searchByGranteeName(name, opts?)` | Search by buyer/grantee |
| `searchByGrantorName(name, opts?)` | Search by seller/grantor |
| `searchByLegalDescription(desc, opts?)` | Full-text legal description search |
| `getDocumentImages(instrumentNo)` | Download all pages as images |
| `getDocumentPricing(instrumentNo)` | Check purchase availability and price |
| `initSession()` | Launch Playwright browser |
| `destroySession()` | Close browser and clean up |

### Shared Concrete Methods

- `smartSearch(query)` — tries all strategies in priority order (instrument# → vol/pg → grantee → grantor), de-duplicates results
- `classifyDocumentType(rawString)` — maps raw clerk type strings to `DocumentType` enum

---

## 6. §2.4 KofileClerkAdapter

**File:** `worker/src/adapters/kofile-clerk-adapter.ts`  
**Status:** ✅ Implemented

### What It Does

- Automates Kofile/GovOS PublicSearch systems via Playwright
- Supports Bell, Williamson, Travis, McLennan, Bexar, and any other county following the `*.tx.publicsearch.us` subdomain pattern
- Downloads watermarked free preview images (signed AWS S3 URLs)
- Falls back to Claude Vision AI OCR when DOM parsing returns nothing

### Rate Limiting (per §2.9)

```typescript
const RATE_LIMIT_MS = {
  PAGE_NAVIGATION:   3_500,   // Between page turns inside a viewer
  DOCUMENT_DOWNLOAD: 6_000,   // Between document downloads
  SESSION_EXPIRY:   30_000,   // Wait before retrying after session loss
  SEARCH_TYPE:       2_000,   // Between different search-type requests
};
```

### Session Expiry Handling

Kofile sessions expire silently (redirect to blank page, not HTTP 401). The `withSessionRetry()` wrapper:
1. Detects login-redirect URLs and net errors
2. Waits `SESSION_EXPIRY` ms
3. Destroys and re-initialises the browser session
4. Retries up to `MAX_SESSION_RETRIES` (3) times

### Image Quality Guard

After each download, the adapter checks:
- File size < 10 KB → reject (broken/placeholder image), delete file, continue
- File size > 500 KB → mark as `quality: 'good'`
- Otherwise → mark as `quality: 'fair'` (standard watermarked preview)

### Extending to New Kofile Counties

To add a new Kofile county, add an entry to the `KOFILE_CONFIGS` map:

```typescript
'48XXX': {
  baseUrl: 'https://countyname.tx.publicsearch.us',
  searchPath: '/results',
  viewerPath: '/doc/',
  countyDisplayName: 'County Name',
  hasImagePreview: true,
  hasSUPERSEARCH: false,  // true only if CountyFusion SUPERSEARCH is available
}
```

Entries not in the map fall back to the default URL pattern automatically.

---

## 7. §2.5 DocumentHarvester Orchestrator

**File:** `worker/src/services/document-harvester.ts`  
**Status:** ✅ Implemented

### Input/Output

```typescript
// Input — pass Phase 1 PropertyIdentity fields directly
interface HarvestInput {
  projectId: string;
  propertyId: string;
  owner: string;
  county: string;
  countyFIPS: string;
  subdivisionName?: string;
  relatedPropertyIds?: string[];
  deedReferences?: { instrumentNumber: string; type: string; date?: string }[];
  adjacentOwners?: string[];   // From Phase 1 or later Phase 3 plat analysis
}
```

### Three-Phase Harvest Strategy

**Phase A — Target property:**
1. Instrument number lookups for all Phase 1 deed references
2. Grantee name search (owner as buyer)
3. Grantor name search (owner as seller)
4. Results scored + ranked via `document-intelligence.ts`

**Phase B — Subdivision (when `subdivisionName` present):**
1. Plat search by subdivision name
2. Restrictive covenant / CC&R search
3. Easement dedication search

**Phase C — Adjacent properties:**
1. Grantee search for each adjacent owner
2. Scored, filtered (score ≥ 20), sorted, capped at 5 docs per owner
3. Globally deduplicated (instrument numbers seen in Phases A/B are skipped)

### Global Deduplication

A `Set<string>` (`seenInstruments`) tracks every instrument number downloaded. Any result with a previously-seen instrument number is skipped, regardless of which search found it. This prevents re-downloading the same document from overlapping grantor/grantee/instrument searches.

### Adapter Selection

`getClerkAdapter(countyFIPS, countyName)` currently always returns a `KofileClerkAdapter`. When additional adapters are implemented, expand this method to route based on a `ClerkRegistry`:

```typescript
// TODO: replace with ClerkRegistry.getAdapter(countyFIPS, countyName)
private getClerkAdapter(countyFIPS: string, countyName: string): ClerkAdapter {
  return new KofileClerkAdapter(countyFIPS, countyName);
}
```

### Rate Limiting

3–5 second random delay (`rateLimit()`) between each download operation. Never faster than 1 request per 3 seconds.

---

## 8. §2.6 Express API Endpoints

**File:** `worker/src/index.ts`  
**Status:** ✅ Implemented

Both endpoints require `Authorization: Bearer $WORKER_API_KEY`.

### `POST /research/harvest`

Starts an async harvest job. Returns HTTP 202 immediately.

```bash
curl -X POST http://localhost:3100/research/harvest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-001",
    "propertyId": "524312",
    "owner": "ASH FAMILY TRUST",
    "county": "Bell",
    "countyFIPS": "48027",
    "subdivisionName": "ASH FAMILY TRUST 12.358 ACRE ADDITION",
    "deedReferences": [
      { "instrumentNumber": "2010043440", "type": "deed" },
      { "instrumentNumber": "2023032044", "type": "plat" }
    ],
    "adjacentOwners": ["RK GAINES", "NORDYKE"]
  }'
```

Result is persisted to `/tmp/harvest/{projectId}/harvest_result.json` when complete.

**TODO:** After persisting to filesystem, also upload to Supabase Storage and update the `projects` row in the database.

### `GET /research/harvest/:projectId`

Returns the completed harvest result (reads from filesystem) or `{ "status": "in_progress" }`.

```bash
curl http://localhost:3100/research/harvest/ash-001 \
  -H "Authorization: Bearer $WORKER_API_KEY"
```

---

## 9. §2.7 CLI Harvest Script

**File:** `worker/harvest.sh`  
**Status:** ✅ Implemented

```bash
# Basic usage
./harvest.sh <projectId> <owner> <county> [instrument1,instrument2,...]

# Example
./harvest.sh ash-001 'ASH FAMILY TRUST' Bell 2010043440,2023032044

# After harvest completes, view results
cat /tmp/harvest/ash-001/harvest_result.json | python3 -m json.tool

# List all downloaded images
find /tmp/harvest/ash-001 -name '*.png' | sort
```

The script maps county names to FIPS codes. To add a new county, add it to the `case` statement in `harvest.sh`. Currently maps: Bell, Williamson, Travis, McLennan, Bexar, Coryell, Falls, Milam, Lampasas, Dallas, Harris, Tarrant.

---

## 10. §2.8 Document Intelligence & Relevance Scoring

**File:** `worker/src/services/document-intelligence.ts`  
**Status:** ✅ Implemented

### Scoring Table

| Condition | Points |
|-----------|--------|
| Plat / replat / amended plat | +50 |
| Warranty deed | +40 |
| Right-of-way document | +35 |
| Referenced in Phase 1 CAD records (`knownInstruments`) | +30 |
| Easement (any type) | +30 |
| Restrictive covenant / CC&R | +25 |
| Quitclaim deed | +20 |
| Dedication | +20 |
| Directly involves target owner (grantee/grantor match) | +20 |
| References subdivision name | +15 |
| Involves an adjacent owner | +10 |
| Recorded within last 5 years | +10 |
| Deed of trust | +5 |
| Recorded within last 15 years | +5 |
| Affidavit / correction instrument | +8 |
| Lien (mechanics, tax, release) | +2 |
| Mineral deed / O&G lease | +3 |
| Recorded > 50 years ago | -5 |

### Priority Tiers

| Score | Priority | Action |
|-------|----------|--------|
| ≥ 60 | `high` | Download immediately |
| 35–59 | `medium` | Download in order |
| 20–34 | `low` | Download if time allows |
| < 20 | `skip` | Do not download |

### API

```typescript
// Score a single result
scoreDocumentRelevance(result: ClerkDocumentResult, context: ScoringContext): DocumentRelevanceScore

// Score, filter (skip < 20), sort high→low, cap at maxItems
filterAndRankResults(
  results: ClerkDocumentResult[],
  context: ScoringContext,
  maxItems?: number   // default 20
): Array<{ result: ClerkDocumentResult; score: DocumentRelevanceScore }>
```

---

## 11. §2.9 Considerations & Edge Cases

### Rate Limiting

| Scenario | Delay | Reason |
|----------|-------|--------|
| Between page navigations in viewer | 3.5s fixed | Avoid detection, respect server |
| Between document downloads | 6s fixed | Signed URL generation takes time |
| After session timeout | 30s then retry | Re-authenticate (Kofile is anonymous) |
| Between search types | 2s | Let SPA settle |
| Harvester `rateLimit()` | 3–5s random | Between individual downloads |

### Session Expiry Handling

Kofile sessions expire after 15–30 minutes. `withSessionRetry()` in `KofileClerkAdapter`:
1. Detects login-redirect URLs or `net::ERR_*` / `Navigation timeout` / `Target closed`
2. Waits 30 seconds
3. Destroys and re-creates the browser session
4. Retries up to 3 times before giving up

### Document Deduplication

Same document may appear in multiple searches. The harvester maintains a global `seenInstruments: Set<string>` across all three phases. When a result's instrument number is already in the set, it is skipped.

If the same document is found in both grantor AND grantee searches, the first found is kept (typically the one from the instrument-number lookup which has the most complete metadata).

### Image Quality Assessment

After each page image is downloaded:
- **< 10 KB** → broken/placeholder; file is deleted and page is skipped
- **> 500 KB** → `quality: 'good'` (high-res scan)
- **Otherwise** → `quality: 'fair'` (standard watermarked preview)

Images < 500 px wide/tall (thumbnails) are not separately detected yet — **TODO**: add dimension check using `sharp` (already a worker dependency).

### Storage Estimates

A typical Bell County subdivision research downloads:
- 2–5 target docs × 2–3 pages = 4–15 images
- 2–4 subdivision docs × 2–5 pages = 4–20 images
- 3–6 adjacent owners × 2–3 docs × 2–3 pages = 12–54 images
- **Total: 20–89 images, ~45–200 MB** at typical Kofile resolution (~2–3 MB/page)

---

## 12. §2.10 Remaining Improvements

All four clerk adapters are now implemented. The following items are enhancements or
production-readiness tasks rather than blockers:

### CountyFusion / Cott Systems — Expand County Coverage

**File:** `worker/src/adapters/countyfusion-adapter.ts` — ✅ Implemented  
**Current coverage:** 10 counties with explicit configs; unknown CountyFusion counties fall back to
a generic URL pattern.  
**To improve:** Add explicit configurations for more of the ~40+ Texas CountyFusion counties.
Source for URLs: search `site:kofiletech.com countyweb` to find `countyfusion{N}.kofiletech.com`
deployments.

### Tyler Technologies / Odyssey — Expand County Coverage

**File:** `worker/src/adapters/tyler-clerk-adapter.ts` — ✅ Implemented  
**Current coverage:** 7 counties with explicit configs.  
**To improve:** Add more counties. Source: Tyler Technologies Texas deployment list.

### TexasFile Adapter — Verify Selectors in Production

**File:** `worker/src/adapters/texasfile-adapter.ts` — ✅ Implemented  
**Status:** Implemented but requires a live browser test against `texasfile.com` to verify that
the CSS selectors (`select[name="county"]`, `input[name="grantee"]`, etc.) match the current
React SPA DOM. TexasFile occasionally redesigns their interface.  
**⚠️ Note:** `getDocumentImages()` intentionally returns `[]` — images require wallet purchase
handled by Phase 9 (`DocumentPurchaseOrchestrator`).

### ClerkRegistry — Verify Potter County (48375) Routing

**File:** `worker/src/services/clerk-registry.ts` — ✅ Implemented  
**Issue:** FIPS `48375` (Potter County) appears in both `KOFILE_FIPS_SET` (registry) and
`COUNTYFUSION_CONFIGS` (adapter). Kofile takes priority, so Potter County gets
`KofileClerkAdapter`. However, the CountyFusion config shows `countyfusion8.kofiletech.com`
for Potter — this is a CountyFusion deployment on Kofile hosting. Verify in production which
system Potter County actually uses and update the registry accordingly.

---

## 13. Acceptance Criteria

### Phase 2 Acceptance Criteria

- [x] Given a Bell County property with known instrument numbers, downloads all pages as images within 5 minutes
- [x] Searches by grantee AND grantor name to find all related documents
- [x] Correctly classifies document types (deed, plat, easement, restrictive covenant, etc.)
- [x] If subdivision detected, searches for master plat and restrictive covenants
- [x] Downloads adjacent property deeds when adjacent owner names are provided
- [x] Rate limiting respects county websites (never faster than 1 request per 3 seconds)
- [x] Session expiry handled gracefully with automatic retry (max 3 attempts)
- [x] AI Vision fallback activates when DOM parsing returns zero results (requires ANTHROPIC_API_KEY)
- [x] CLI script `./harvest.sh` works from droplet console
- [x] All images saved to organized directory structure: `/tmp/harvest/{projectId}/{instrumentNo}/`
- [x] Document relevance scoring: plats (50) > deeds (40) > ROW (35) > easements (30) > covenants (25) > others
- [x] Works for Bell (48027), Williamson (48491), and Travis (48453) counties via Kofile adapter
- [x] CountyFusion adapter covers Harris (48201), Dallas (48113), Tarrant (48439), and 7 more counties
- [x] Tyler adapter covers Hidalgo (48215), El Paso (48141), and 5 more counties
- [x] TexasFile universal fallback for all 254 counties (index-only; images via Phase 9 purchase)
- [x] Broken/empty images (< 10 KB) are detected and excluded from results
- [x] Global deduplication prevents downloading the same document twice
- [x] Total harvest for a 6-lot subdivision with 4 adjacent owners completes in under 15 minutes
- [x] `GET /research/harvest/:projectId` returns `{ status: "in_progress" }` while running and the full result when complete
- [x] TypeScript strict mode — zero errors in Phase 2 files
- [x] 102 unit tests covering all pure-logic components — all passing

---

## 14. File Map

```
worker/
├── src/
│   ├── adapters/
│   │   ├── cad-adapter.ts              ✅ Phase 1 — CAD abstract base
│   │   ├── bell-cad.ts                 ✅ Phase 1 — BIS Consultants (Bell CAD)
│   │   ├── trueautomation-adapter.ts   ✅ Phase 1 — TrueAutomation CADs
│   │   ├── tyler-adapter.ts            ✅ Phase 1 — Tyler CAD
│   │   ├── clerk-adapter.ts            ✅ Phase 2 §2.3 — Clerk abstract base
│   │   ├── kofile-clerk-adapter.ts     ✅ Phase 2 §2.4 — Kofile/PublicSearch (~50 counties)
│   │   ├── countyfusion-adapter.ts     ✅ Phase 2 — CountyFusion/Cott (~10 counties, index-only)
│   │   ├── tyler-clerk-adapter.ts      ✅ Phase 2 — Tyler/Odyssey clerk (~7 counties)
│   │   └── texasfile-adapter.ts        ✅ Phase 2 — TexasFile universal fallback (254 counties)
│   ├── services/
│   │   ├── discovery-engine.ts         ✅ Phase 1 — PropertyDiscoveryEngine
│   │   ├── bell-clerk.ts               ⚠️  Phase 1 legacy — superseded by Phase 2; retire when pipeline.ts migrates
│   │   ├── document-harvester.ts       ✅ Phase 2 §2.5 — DocumentHarvester orchestrator
│   │   ├── document-intelligence.ts    ✅ Phase 2 §2.8 — Relevance scoring engine
│   │   ├── clerk-registry.ts           ✅ Phase 2 — FIPS → adapter routing (Kofile→CF→Tyler→TF)
│   │   └── pipeline.ts                 ✅ Phase 1 legacy pipeline
│   ├── types/
│   │   ├── index.ts                    ✅ Phase 1 legacy types
│   │   ├── property-discovery.ts       ✅ Phase 1 — PropertyIdentity types
│   │   └── document-harvest.ts         ✅ Phase 2 — HarvestInput/Result wire types
│   └── index.ts                        ✅ Express server (Phase 1 + Phase 2 endpoints)
├── harvest.sh                          ✅ Phase 2 §2.7 — CLI harvest script
└── research.sh                         ✅ Phase 1 — CLI discovery script

__tests__/
└── recon/
    ├── phase1-discovery.test.ts         ✅ Phase 1 unit tests
    └── phase2-harvest.test.ts           ✅ Phase 2 unit tests (102 tests)
```

---

*Previous: `PHASE_01_DISCOVERY.md` — Universal Property Discovery*  
*Next: `PHASE_03_BOUNDARY.md` — AI Boundary Extraction from harvested documents*
