# Phase 13: Statewide Clerk Adapters & Interactive Boundary Viewer

**Starr Software — AI Property Research Pipeline Phase**

**Status:** ✅ COMPLETE v1.0 (March 2026)

**Goal:** Complete statewide Texas county clerk coverage by implementing the three remaining major clerk system adapters (Henschen & Associates, iDocket, and Fidlar Technologies), register them in the clerk-registry routing layer, and deliver the long-awaited interactive boundary viewer React component for surveyors to visually inspect and annotate research results.

---

## What Was Built

### v1.0 (March 2026)

| Module | File | Status | Tests |
|--------|------|--------|-------|
| Henschen Clerk Adapter (Module A) | `worker/src/adapters/henschen-clerk-adapter.ts` | ✅ Complete | Tests 1–20 |
| iDocket Clerk Adapter (Module B) | `worker/src/adapters/idocket-clerk-adapter.ts` | ✅ Complete | Tests 21–35 |
| Fidlar Technologies Adapter (Module C) | `worker/src/adapters/fidlar-clerk-adapter.ts` | ✅ Complete | Tests 36–48 |
| Clerk Registry Routing (Module D) | `worker/src/services/clerk-registry.ts` | ✅ Updated | Tests 49–60 |
| Interactive Boundary Viewer (Module E) | `app/admin/research/components/InteractiveBoundaryViewer.tsx` | ✅ Complete | N/A (React component) |
| Phase 1 HCAD/TAD Selector Fixes | `__tests__/recon/phase1-discovery.test.ts` | ✅ Fixed | 2 previously failing tests |

---

## Module A: Henschen & Associates Clerk Adapter

**File:** `worker/src/adapters/henschen-clerk-adapter.ts`  
**Lines:** ~1,383  
**Counties:** ~16 Texas Hill Country / Central Texas counties

### Overview

Henschen & Associates is the second most common Texas county clerk system, covering approximately 40 counties. This adapter handles Henschen's server-rendered HTML interface — the most straightforward to scrape since it doesn't rely on JavaScript frameworks.

### Covered Counties (HENSCHEN_CONFIGS)

| FIPS | County | Has Image Access |
|------|--------|-----------------|
| 48053 | Burnet | ✅ |
| 48299 | Llano | ✅ |
| 48319 | Mason | ✅ |
| 48307 | McCulloch | ✅ |
| 48333 | Mills | ✅ |
| 48411 | San Saba | ✅ |
| 48321 | Menard | ❌ (Index only) |
| 48265 | Kimble | ✅ |
| 48435 | Sutton | ❌ (Index only) |
| 48171 | Gillespie | ✅ |
| 48283 | Lampasas | ✅ |
| 48381 | Randall | ✅ |
| 48135 | Ector | ✅ |
| 48177 | Gonzales | ✅ |
| 48209 | Hays | ✅ (partial) |
| 48463 | Uvalde | ✅ |

> **Note:** Some counties appear in both HENSCHEN_FIPS_SET and KOFILE_FIPS_SET (e.g., Burnet, Randall, Lampasas). The clerk-registry routes to Kofile first (higher priority), which is correct since Kofile provides richer watermarked previews. Henschen is used for counties NOT covered by higher-priority systems.

### Henschen System Characteristics

- **Technology:** Server-rendered HTML (no SPA framework)
- **URL Pattern:** `https://{county}.co.texas.us/ClerkInquiry/` OR `https://records.{county}countyclerk.com/`
- **Search Form:** Dropdown `select#SearchType` → options: `LastName`, `InstrumentNumber`, `VolumePage`
- **Result Table:** `table.ResultTable` or `table#tblResults`
- **Image Access:** Some counties charge per page; others provide free image access
- **Rate Limiting:** 4,000ms between requests

### Features

- All 9 `ClerkAdapter` abstract methods implemented
- Multiple selector fallback arrays (3-4 per field) for deployment drift
- AI OCR fallback via Anthropic Claude API (`claude-sonnet-4-20250514`)
- `createHenschenAdapter(fips, countyName)` factory function
- `HENSCHEN_FIPS_SET` exported for clerk-registry routing

---

## Module B: iDocket Clerk Adapter

**File:** `worker/src/adapters/idocket-clerk-adapter.ts`  
**Lines:** ~1,842  
**Counties:** ~14+ Texas counties

### Overview

iDocket is a modern React SPA used by approximately 20 Texas counties. The public/guest mode provides free access to document indexes (instrument number, parties, recording date, volume/page). Full document images require a paid subscriber account.

### Covered Counties (IDOCKET_CONFIGS)

| FIPS | County | URL Slug | Guest Images |
|------|--------|----------|-------------|
| 48085 | Collin | Collin | ❌ |
| 48121 | Denton | Denton | ❌ |
| 48149 | Freestone | Freestone | ❌ |
| 48227 | Howard | Howard | ❌ |
| 48293 | Limestone | Limestone | ❌ |
| 48363 | Palo Pinto | PaloPinto | ❌ |
| 48401 | Rockwall | Rockwall | ❌ |
| 48113 | Dallas | Dallas | ❌ |
| 48019 | Bandera | Bandera | ❌ |
| 48023 | Baylor | Baylor | ❌ |
| 48045 | Briscoe | Briscoe | ❌ |
| 48059 | Callahan | Callahan | ❌ |
| 48153 | Garza | Garza | ❌ |
| 48189 | Hale | Hale | ❌ |
| 48211 | Haskell | Haskell | ❌ |
| 48263 | Kent | Kent | ❌ |
| 48291 | Liberty | Liberty | ❌ |
| 48303 | Lynn | Lynn | ❌ |

> **Note:** Collin (48085) and Denton (48121) appear in both IDOCKET_FIPS_SET and COUNTYFUSION_FIPS_SET. The clerk-registry routes to CountyFusion first (higher priority). Counties like Rockwall (48401), Baylor (48023), and Palo Pinto (48363) are not in higher-priority sets and will use iDocket.

### iDocket System Characteristics

- **Technology:** React SPA at `idocket.com`
- **URL Pattern:** `https://idocket.com/TX/{CountySlug}/`
- **Authentication:** Public/guest mode for index search; subscriber required for images
- **Pagination:** 20 results per page with AJAX loading
- **Rate Limiting:** 5,000ms between requests (stricter than other systems)

### Features

- All 9 `ClerkAdapter` abstract methods implemented
- SPA-aware navigation with `waitForLoadState('networkidle')`
- Tab-click helpers for switching between search modes
- Auto-pagination across all result pages
- Dual result parsers (table-row + card/div strategies)
- AI OCR fallback via Anthropic Claude API
- `IDOCKET_COUNTY_NAMES` map for URL slug lookups
- `createIDocketAdapter(fips, countyName)` factory function

---

## Module C: Fidlar Technologies Clerk Adapter

**File:** `worker/src/adapters/fidlar-clerk-adapter.ts`  
**Lines:** ~1,452  
**Counties:** ~11+ Texas counties

### Overview

Fidlar Technologies' Laredo product is an AJAX-heavy web application used primarily by East Texas and Panhandle counties. It submits search requests asynchronously and requires Playwright to intercept the XHR network response.

### Covered Counties (FIDLAR_CONFIGS)

| FIPS | County | Variant | Has Images |
|------|--------|---------|-----------|
| 48475 | Ward | laredo | ✅ |
| 48443 | Terrell | laredo | ✅ |
| 48243 | Jasper | laredo | ✅ |
| 48351 | Newton | laredo | ✅ |
| 48415 | Sabine | laredo | ✅ |
| 48419 | San Augustine | laredo | ✅ |
| 48423 | San Jacinto | laredo | ✅ |
| 48113 | Dallas | direct | ❌ (index) |
| 48215 | Hidalgo | direct | ❌ (index) |
| 48327 | Menard | laredo | ✅ |
| 48147 | Foard | laredo | ✅ |
| 48157 | Fort Bend | laredo | ✅ |
| 48159 | Franklin | laredo | ✅ |

### Fidlar System Characteristics

- **Technology:** AJAX-heavy web application (Laredo product)
- **URL Pattern:** `https://laredo.fidlar.com/TX_{County}/` OR `https://{county}.fidlar.com/`
- **Search Types:** GV (grantor), GP (grantee), IN (instrument#), VP (vol/page), LD (legal desc)
- **Session:** Requires session cookie from initial page load
- **Rate Limiting:** 3,500ms between requests

### Features

- All 9 `ClerkAdapter` abstract methods implemented
- `waitForResponse` listener registered before submit (avoids race conditions)
- Three deployment variants: `laredo`, `direct`, `publicsearch`
- Session management via cookie initialization
- AJAX response parsing with JSON and HTML fallbacks
- AI OCR fallback via Anthropic Claude API
- `createFidlarAdapter(fips, countyName)` factory function

---

## Module D: Updated Clerk Registry Routing

**File:** `worker/src/services/clerk-registry.ts` (updated)

### Priority Order (updated)

| Priority | System | Set Size | Description |
|----------|--------|----------|-------------|
| 1 | Kofile/GovOS | ~80+ | `*.tx.publicsearch.us` |
| 2 | CountyFusion | ~40+ | Kofile-hosted CountyFusion |
| 3 | Tyler/Odyssey | ~30+ | Tyler Technologies |
| 4 | **Henschen** (NEW) | 16 | Hill Country / Central TX |
| 5 | **iDocket** (NEW) | 18 | React SPA counties |
| 6 | **Fidlar** (NEW) | 13 | East TX + Panhandle |
| 7 | TexasFile | All 254 | Universal fallback |

### Updated API

```typescript
// New systems added to ClerkSystem type
export type ClerkSystem = 
  'kofile' | 'countyfusion' | 'tyler' | 
  'henschen' | 'idocket' | 'fidlar' | 
  'texasfile';

// registrySummary now includes all 7 systems
registrySummary() → Record<ClerkSystem, number>

// getClerkSystem now identifies henschen/idocket/fidlar
getClerkSystem('48265') → 'henschen'
getClerkSystem('48401') → 'idocket'
getClerkSystem('48475') → 'fidlar'
```

---

## Module E: Interactive Boundary Viewer

**File:** `app/admin/research/components/InteractiveBoundaryViewer.tsx`  
**Lines:** ~540

### Overview

A React SVG-based interactive viewer that renders STARR RECON boundary data as a zoomable, pannable, clickable diagram. Surveyors can click boundary calls to see source readings, toggle confidence color overlays, show/hide layers, and measure distances.

### Props Interface

```typescript
interface BoundaryViewerProps {
  projectId: string;
  segments: BoundarySegment[];        // Boundary call geometry
  width?: number;                     // Default: 800px
  height?: number;                    // Default: 600px
  showConfidenceOverlay?: boolean;    // Color segments by confidence
  visibleLayers?: LayerType[];        // Toggle layer visibility
  onSegmentClick?: (segment) => void; // Called when a call is clicked
  onMeasure?: (distanceFt) => void;   // Called with measured distance
  className?: string;
}
```

### Features

| Feature | Description |
|---------|-------------|
| **Pan** | Mouse drag to pan the drawing |
| **Zoom** | Scroll wheel + toolbar ± buttons |
| **Auto-fit** | Auto-scales to fit all segments on mount |
| **Segment click** | Highlights segment, fires `onSegmentClick`, shows detail bar |
| **Hover tooltip** | Bearing, distance, confidence %, sources, discrepancy flag |
| **Confidence overlay** | Green (≥80%) → Yellow (≥60%) → Orange (≥40%) → Red (<40%) |
| **Layer toggles** | Boundary, Easements, Setbacks, ROW, Labels |
| **Measure tool** | Click two points to calculate distance in feet |
| **Call number badges** | Zoom-invariant numbered circles at segment midpoints |
| **Bearing labels** | Auto-rotated bearing/distance text per segment |
| **North arrow** | Fixed screen-space SVG indicator |
| **Scale bar** | Dynamic scale bar showing current zoom |
| **Discrepancy indicator** | Red dot above segments with flagged discrepancies |

### Confidence Color Scale

| Confidence | Color | Hex |
|------------|-------|-----|
| ≥ 80% | Green | `#16a34a` |
| ≥ 60% | Yellow | `#ca8a04` |
| ≥ 40% | Orange | `#ea580c` |
| < 40% | Red | `#dc2626` |
| No overlay | Slate | `#475569` |

### Supported Feature Classes

- `property_boundary` → Boundary layer
- `easement` → Easement layer
- `setback` → Setback layer
- `right_of_way`, `road` → ROW layer
- Labels rendered on Labels layer
- `other` → always visible

---

## Bug Fixes

### Pre-existing HCAD/TAD Test Failures (phase1-discovery.test.ts)

Two tests in `__tests__/recon/phase1-discovery.test.ts` were failing due to outdated selector expectations. The HCAD and TAD CAD registry entries were updated in a previous phase (HCAD rebuilt as Blazor SPA; TAD redesigned as Laravel app), but the tests were not updated to match.

**HCAD (Harris County):**
- Old expected `addressField`: `search_str` → **Actual**: `inputSearch` (Blazor SPA CSS class)
- Old expected `resultSelector` contained: `searchResults` → **Actual**: `tr.resulttr.dataTableGridText` (jQuery DataTables)

**TAD (Tarrant County):**
- Old expected `addressField`: `address` → **Actual**: `query` (Laravel `input#query[name="query"]`)
- Old expected `resultSelector` contained: `search-results-table` → **Actual**: `tr.property-header`

Both tests updated to reflect the verified 2026-03-07 implementations.

---

## Test Coverage

**File:** `__tests__/recon/phase13-statewide-adapters.test.ts`  
**Tests:** 60  
**All passing:** ✅

### Test Coverage Map

| Module | Tests | Coverage |
|--------|-------|---------|
| Henschen config coverage | 1–9 | FIPS set size, key/value integrity, factory function |
| Henschen document types | 10–14 | WD, PLT, ESMT, ROW, unknown |
| Henschen smartSearch | 15–16 | Hit path, empty path |
| Henschen misc | 17–20 | Constructor fields, imageAccess flag, Randall county |
| iDocket config coverage | 21–28 | FIPS set size, URL integrity, slug-in-URL, factory |
| iDocket document types | 29–31 | QCD, DOT, OGL |
| iDocket smartSearch | 32 | Grantee fallback |
| iDocket county names | 33–35 | COUNTY_NAMES map, display names |
| Fidlar config coverage | 36–43 | FIPS set size, variants, URLs, paths, factory |
| Fidlar document types | 44–48 | GWD, SWD, REL, MD, REPLAT |
| Routing: instance type | 49–51 | Henschen, iDocket, Fidlar getClerkAdapter |
| Routing: getClerkSystem | 52–54 | String identifiers for each new system |
| Routing: priority | 55 | Higher-priority systems take precedence |
| Routing: registrySummary | 56–60 | All new systems in summary, correct counts |

---

## Phase 13 Deliverables Checklist

- [x] Henschen & Associates clerk adapter — fully implemented with AI OCR fallback
- [x] iDocket clerk adapter — SPA-aware with pagination and AI OCR fallback
- [x] Fidlar Technologies clerk adapter — AJAX-aware with session management
- [x] Services clerk-registry updated with Henschen/iDocket/Fidlar routing (priority 4/5/6)
- [x] `ClerkSystem` union type updated to include `henschen | idocket | fidlar`
- [x] `registrySummary()` includes all 7 systems
- [x] Interactive Boundary Viewer React component with pan/zoom/click/measure/layers/confidence overlay
- [x] 60 unit tests covering all Phase 13 modules
- [x] Pre-existing HCAD/TAD test failures fixed (2 tests)
- [x] Phase documentation (this file)

### Deferred to Phase 14

- [ ] Fidlar online account purchase flow (images require paid subscription)
- [ ] iDocket subscriber authentication for full document image download
- [ ] County-specific Henschen URL verification (some county URLs may have changed)
- [ ] Statewide coverage gap analysis dashboard (visualize % of TX counties covered)
- [ ] Document library UI (browse/preview/download all retrieved documents)
- [ ] Mobile-responsive report viewer

---

## What Needs External Input

| Item | What's Needed |
|------|---------------|
| Henschen per-county URLs | Some county URLs may need live verification (rural TX counties change sites) |
| iDocket subscriber auth | Production iDocket subscriber credentials for full image access |
| Fidlar session pattern | Some Fidlar counties may use different session initialization |
| Dallas County routing | Dallas (48113) appears in Tyler, iDocket, AND Fidlar FIPS sets — highest priority (Tyler) wins |
| Bexar custom clerk | Bexar County (San Antonio) uses a custom system not yet implemented |

---

## Setup for Phase 14

Next phase candidates (in priority order based on remaining gaps):

1. **Document Library UI** — React component for browsing/searching/previewing all retrieved documents per project
2. **Statewide Coverage Dashboard** — Admin page showing which counties are covered, which are stub-only, and download progress
3. **Bexar County Custom Clerk Adapter** — San Antonio is the 4th largest TX metro (Bexar County uses its own web portal)
4. **Notifications** — Email/SMS when research pipeline completes
5. **Mobile-Responsive Report Viewer** — Phase 10 PDF is desktop-only; need responsive web report
6. **Report Sharing** — Share research results with clients via link (view-only, download, annotate)
