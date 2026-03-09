# STARR RECON — Phase 13: Statewide Clerk Adapters, Interactive Web UI, Additional Data Sources & Production Hardening

**Product:** Starr Compass — AI Property Research (STARR RECON)
**Version:** 1.1 | **Last Updated:** March 2026
**Phase Duration:** Weeks 54–56
**Depends On:** All Phases 1–12
**Status:** ✅ COMPLETE v1.1 (March 2026)
- **v1.0:** Henschen, iDocket, Fidlar clerk adapters + clerk-registry update (priority 4/5/6) + InteractiveBoundaryViewer component + USGS client + TX Comptroller client + Zod schema validator + 4 UI pages. 60 statewide adapter tests + initial interactive tests.
- **v1.1:** Next.js API routes (boundary viewer with traverse walk, topo/tax proxies, library, billing, document download), Phase 13 Express routes in worker, schema validation in master-orchestrator.ts, Supabase migration for research_topo + research_tax, 20 traverse walk tests added. **80 total interactive UI tests. 1,497 total tests pass.**
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)
**See Also:** `PHASE_13_STATEWIDE_ADAPTERS.md` — detailed spec for Henschen, iDocket, and Fidlar clerk adapter implementations.

---

## Goal

Close the final gaps left after Phases 11 and 12 across three areas:

1. **Statewide Clerk Coverage** — Implement the three remaining major TX county clerk system adapters (Henschen & Associates, iDocket, and Fidlar Technologies), completing coverage for ~47 additional counties, and register them in the clerk-registry routing layer.

2. **Interactive Boundary Viewer** — An SVG-based React page where surveyors can pan/zoom, click any boundary call to inspect all source readings and confidence scores, toggle display layers, and switch between solid/confidence/source color modes.

3. **Document Library** — Two complementary pages: a per-project document library showing every harvested and purchased document with preview/download, and a global cross-project library with full-text search, county filtering, and pagination.

4. **Billing & Usage Dashboard** — A subscription management page showing the current plan, usage metrics, invoice history, and per-document purchase transaction log.

5. **USGS National Map Client** — Retrieves topographic elevation (3DEP), contour lines, NHD water features, and slope/aspect data for any property coordinate.

6. **TX Comptroller Client** — Retrieves county-level property tax rates from the PTAD transparency portal, maps counties to their CAD/appraisal districts, and provides the standard Texas homestead/over-65/disabled-veteran exemption data.

7. **Zod Phase-Boundary Schema Validation** — Validates every phase's output JSON against a strongly-typed Zod schema before the next phase begins, converting silent data-shape bugs into clear, actionable error messages.

**Deliverable:** Complete statewide Texas clerk coverage, a fully interactive research web UI, two additional government data source integrations, and airtight I/O contracts between pipeline phases — making the STARR RECON product ready for real surveyor use.

---

### v1.0 Changes (March 2026)

- **New:** `worker/src/adapters/henschen-clerk-adapter.ts` — Henschen & Associates clerk adapter for ~16 TX Hill Country / Central Texas counties. Server-rendered HTML scraping with AI OCR fallback. Exports `HENSCHEN_FIPS_SET` and `createHenschenAdapter()`.
- **New:** `worker/src/adapters/idocket-clerk-adapter.ts` — iDocket React SPA adapter for ~18 TX counties. SPA-aware navigation, auto-pagination, guest-mode index access. Exports `IDOCKET_FIPS_SET` and `createIDocketAdapter()`.
- **New:** `worker/src/adapters/fidlar-clerk-adapter.ts` — Fidlar/Laredo AJAX adapter for ~13 East TX and Panhandle counties. `waitForResponse` listener strategy, session management, JSON+HTML fallback parsing. Exports `FIDLAR_FIPS_SET` and `createFidlarAdapter()`.
- **Updated:** `worker/src/services/clerk-registry.ts` — Added Henschen (priority 4), iDocket (priority 5), Fidlar (priority 6) to `ClerkSystem` union and `registrySummary()`. Registry now covers all 254 TX counties with 7-tier routing.
- **New:** `app/admin/research/components/InteractiveBoundaryViewer.tsx` — React SVG boundary viewer component with pan/zoom, confidence color overlay, layer toggles, measure tool, north arrow, and scale bar.
- **Fixed:** `__tests__/recon/phase1-discovery.test.ts` — 2 pre-existing HCAD/TAD test failures resolved (updated selectors to match 2026 Blazor SPA and Laravel implementations).
- **New:** `__tests__/recon/phase13-statewide-adapters.test.ts` — 60 unit tests for all three new clerk adapters and updated registry.

### v1.1 Changes (March 2026)

- **New:** `app/api/admin/research/[projectId]/boundary/route.ts` — Next.js API route that assembles the Interactive Boundary Viewer payload. Fetches reconciled boundary from worker, fetches confidence report, walks the traverse (bearing+distance → Cartesian x,y using SVG conventions), and merges per-call confidence scores and discrepancy flags into a single JSON response.
- **New:** `app/api/admin/research/[projectId]/topo/route.ts` — USGS topographic data proxy. POST triggers async worker query; GET returns cached result from `research_topo` Supabase table.
- **New:** `app/api/admin/research/[projectId]/tax/route.ts` — TX Comptroller tax data proxy. POST triggers async worker query; GET returns cached result from `research_tax` Supabase table.
- **New:** `app/api/admin/research/library/route.ts` — Global cross-project document library API with county filter, type filter, full-text search, pagination, and per-type/county stats.
- **New:** `app/api/admin/research/billing/route.ts` — Billing dashboard API returning subscription info, 12-month usage metrics, Stripe invoices (lazy-init, falls back gracefully), and purchase transaction log.
- **New:** `app/api/admin/research/[projectId]/documents/[docId]/download/route.ts` — Secure document download proxy via Supabase Storage signed URLs (60-min expiry) with direct-stream fallback.
- **New:** `seeds/092_phase13_tables.sql` — `research_topo` and `research_tax` tables with indexes and service-role RLS policies.
- **Updated:** `worker/src/index.ts` — Added Phase 13 Express routes: `POST/GET /research/topo`, `POST/GET /research/tax`, `GET /research/boundary/:projectId`. All new routes use `requireAuth` and `rateLimit`. Boundary endpoint pre-assembles reconcile + confidence + topo + tax + Zod validation.
- **Updated:** `worker/src/orchestrator/master-orchestrator.ts` — Added `validateOrNull()` calls after loading each key phase JSON file (discovery, harvest, property_intelligence, reconciliation, confidence). Validation warnings are logged but never block report generation.
- **Updated:** `__tests__/recon/phase13-interactive.test.ts` — Added 20 new tests (tests 61–80) for `parseBearingToDecimal()` and `walkTraverse()` — the traverse coordinate computation engine used by the boundary viewer API.
- **Test count:** 1,497 total tests pass (1,435 prior + 60 statewide adapter tests + 20 new traverse tests).

## 13.1 Current State Before Phase 13

After Phases 1–12, the STARR RECON pipeline:

| Capability | State Before Phase 13 |
|---|---|
| Full pipeline (phases 1–10) | ✅ Working (CLI + API) |
| Stripe billing, job queue | ✅ Working |
| Statewide CAD adapters (BIS, TrueAutomation, Tyler, HCAD, TAD) | ✅ Working |
| Clerk adapters (Kofile, CountyFusion, Tyler, TexasFile) | ✅ Working |
| Henschen clerk adapter (~16 Hill Country counties) | ❌ Missing |
| iDocket clerk adapter (~18 SPA counties) | ❌ Missing |
| Fidlar clerk adapter (~13 East TX / Panhandle counties) | ❌ Missing |
| PNG/PDF/DXF drawing exports | ✅ Working |
| Pipeline dashboard page | ✅ Working |
| Interactive boundary viewer | ❌ Missing |
| Document library pages | ❌ Missing |
| Billing dashboard | ❌ Missing |
| USGS elevation/contour data | ❌ Missing |
| TX Comptroller tax data | ❌ Missing |
| Phase-boundary Zod validation | ❌ Missing |

---

## 13.2 Architecture — New Files

```
worker/src/
├── adapters/
│   ├── henschen-clerk-adapter.ts  ← §13.2a Henschen HTML clerk adapter (v1.0)
│   ├── idocket-clerk-adapter.ts   ← §13.2b iDocket SPA clerk adapter (v1.0)
│   └── fidlar-clerk-adapter.ts    ← §13.2c Fidlar/Laredo AJAX clerk adapter (v1.0)
├── services/
│   └── clerk-registry.ts          ← §13.2d Updated: +Henschen/iDocket/Fidlar (v1.0)
├── sources/
│   ├── usgs-client.ts             ← §13.3  USGS 3DEP elevation + contours + NHD
│   └── comptroller-client.ts      ← §13.4  TX Comptroller PTAD tax rates
├── infra/
│   └── schema-validator.ts        ← §13.5  Zod phase I/O validation
│
app/admin/research/
├── components/
│   └── InteractiveBoundaryViewer.tsx ← §13.2e React SVG boundary viewer (v1.0)
├── [projectId]/
│   ├── boundary/
│   │   └── page.tsx               ← §13.6  Interactive SVG boundary viewer page
│   └── documents/
│       └── page.tsx               ← §13.7  Per-project document library
├── library/
│   └── page.tsx                   ← §13.8  Global document library (cross-project)
└── billing/
    └── page.tsx                   ← §13.9  Subscription/usage/billing dashboard
│
app/api/admin/research/
├── [projectId]/
│   ├── boundary/
│   │   └── route.ts               ← §13.12 Boundary viewer data API (v1.1)
│   ├── topo/
│   │   └── route.ts               ← §13.12 USGS topo data proxy (v1.1)
│   ├── tax/
│   │   └── route.ts               ← §13.12 TX Comptroller tax proxy (v1.1)
│   └── documents/
│       └── [docId]/
│           └── download/
│               └── route.ts       ← §13.12 Document download proxy (v1.1)
├── library/
│   └── route.ts                   ← §13.12 Global library API (v1.1)
└── billing/
    └── route.ts                   ← §13.12 Billing dashboard API (v1.1)
│
seeds/
└── 092_phase13_tables.sql         ← research_topo + research_tax tables (v1.1)
│
__tests__/recon/
├── phase13-statewide-adapters.test.ts ← 60 unit tests for adapters (v1.0)
└── phase13-interactive.test.ts    ← §13.10 80 unit tests (v1.1 cumulative)
```

---

## 13.2a–e Statewide Clerk Adapters & Boundary Viewer (v1.0)

> **Full specification:** See `PHASE_13_STATEWIDE_ADAPTERS.md` for complete adapter implementation details, covered counties, URL patterns, and test coverage map.

### 13.2a Henschen & Associates Clerk Adapter

**File:** `worker/src/adapters/henschen-clerk-adapter.ts` (~1,383 lines)

Covers ~16 Texas Hill Country / Central Texas counties using server-rendered HTML scraping. All 9 `ClerkAdapter` abstract methods implemented. Multiple selector fallback arrays for deployment drift. AI OCR fallback via Claude API.

**Key exports:** `HENSCHEN_FIPS_SET`, `HENSCHEN_CONFIGS`, `createHenschenAdapter(fips, countyName)`

**Covered FIPS:** 48053 (Burnet), 48299 (Llano), 48319 (Mason), 48307 (McCulloch), 48333 (Mills), 48411 (San Saba), 48321 (Menard), 48265 (Kimble), 48435 (Sutton), 48171 (Gillespie), 48283 (Lampasas), 48381 (Randall), 48135 (Ector), 48177 (Gonzales), 48209 (Hays), 48463 (Uvalde)

### 13.2b iDocket Clerk Adapter

**File:** `worker/src/adapters/idocket-clerk-adapter.ts` (~1,842 lines)

Covers ~18 Texas counties using the iDocket React SPA at `idocket.com`. Guest/public mode provides free index access (instrument metadata); subscriber mode required for images. `waitForLoadState('networkidle')` strategy, auto-pagination, dual result parsers.

**Key exports:** `IDOCKET_FIPS_SET`, `IDOCKET_CONFIGS`, `IDOCKET_COUNTY_NAMES`, `createIDocketAdapter(fips, countyName)`

**Covered FIPS:** 48085 (Collin), 48121 (Denton), 48149 (Freestone), 48227 (Howard), 48293 (Limestone), 48363 (Palo Pinto), 48401 (Rockwall), 48113 (Dallas), 48019 (Bandera), 48023 (Baylor), 48045 (Briscoe), 48059 (Callahan), 48153 (Garza), 48189 (Hale), 48211 (Haskell), 48263 (Kent), 48291 (Liberty), 48303 (Lynn)

### 13.2c Fidlar Technologies Clerk Adapter

**File:** `worker/src/adapters/fidlar-clerk-adapter.ts` (~1,452 lines)

Covers ~13 Texas East/Panhandle counties using the Fidlar/Laredo AJAX application. Registers a `waitForResponse` listener before form submit to capture AJAX results. Three deployment variants: `laredo`, `direct`, `publicsearch`.

**Key exports:** `FIDLAR_FIPS_SET`, `FIDLAR_CONFIGS`, `createFidlarAdapter(fips, countyName)`

**Covered FIPS:** 48475 (Ward), 48443 (Terrell), 48243 (Jasper), 48351 (Newton), 48415 (Sabine), 48419 (San Augustine), 48423 (San Jacinto), 48113 (Dallas), 48215 (Hidalgo), 48327 (Menard), 48147 (Foard), 48157 (Fort Bend), 48159 (Franklin)

### 13.2d Updated Clerk Registry

**File:** `worker/src/services/clerk-registry.ts` (updated)

Added Henschen (priority 4), iDocket (priority 5), Fidlar (priority 6) to `ClerkSystem` union type and `registrySummary()`. Updated `getClerkAdapter()` factory to construct all 7 adapter types. Registry now provides complete automated coverage for all 254 TX counties.

| Priority | System | Coverage |
|----------|--------|---------|
| 1 | Kofile/GovOS | ~80+ counties |
| 2 | CountyFusion | ~40+ counties |
| 3 | Tyler/Odyssey | ~30+ counties |
| 4 | **Henschen** (new) | ~16 counties |
| 5 | **iDocket** (new) | ~18 counties |
| 6 | **Fidlar** (new) | ~13 counties |
| 7 | TexasFile | All 254 counties (universal fallback) |

### 13.2e Interactive Boundary Viewer Component

**File:** `app/admin/research/components/InteractiveBoundaryViewer.tsx` (~540 lines)

React SVG boundary viewer with pan/zoom, confidence color overlay (green ≥80% → yellow ≥60% → orange ≥40% → red <40%), layer toggles (Boundary/Easements/Setbacks/ROW/Labels), measure tool, zoom-invariant call number badges, bearing/distance labels, north arrow, and scale bar.

**Props:** `projectId`, `segments: BoundarySegment[]`, `width?`, `height?`, `showConfidenceOverlay?`, `visibleLayers?`, `onSegmentClick?`, `onMeasure?`

---

## 13.3 USGS National Map Client (`usgs-client.ts`)

### Overview

Queries the USGS National Map public ArcGIS REST services for topographic context data:
- **3DEP Elevation Point Query Service (EPQS)** — single-point elevation in feet
- **National Contours MapServer** — contour lines within a radius
- **NHDPlus HR** — streams, rivers, lakes, wetlands (NHD hydrography)
- **Slope/Aspect** — computed from three nearby elevation samples

### Data Services

| Service | URL | Notes |
|---|---|---|
| 3DEP EPQS | `https://epqs.nationalmap.gov/v1/json` | Returns `value` (feet) and `data_source` |
| National Contours | `https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/1/query` | Requires live URL verification |
| NHD Flowline (HR) | `https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/2/query` | Streams, canals, ditches |
| NHD Waterbody (HR) | `https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/4/query` | Lakes, reservoirs |

### TypeScript Types

```typescript
/** Point elevation from USGS 3DEP */
export interface ElevationPoint {
  latitude: number;
  longitude: number;
  elevation_ft: number;
  elevation_m: number;
  data_source: '3DEP_1_3' | '3DEP_1' | '3DEP_2' | 'NED' | 'unknown';
  units: 'Feet' | 'Meters';
}

/** Contour line feature */
export interface ContourLine {
  elevation_ft: number;
  is_index: boolean;   // Index contours are labeled (every 5th contour)
  geometry_wkt?: string;
}

/** NHD water feature */
export interface WaterFeature {
  feature_type: 'stream' | 'river' | 'lake' | 'reservoir' | 'wetland' | 'canal' | 'ditch' | 'other';
  name: string | null;
  ftype: number;
  fcode: number;
  permanent_id: string;
  reach_code?: string;
  gnis_name?: string | null;
}

/** Full topographic result for a property */
export interface TopoResult {
  project_id: string;
  query_lat: number;
  query_lon: number;
  query_radius_m: number;
  elevation: ElevationPoint | null;
  contours: ContourLine[];
  water_features: WaterFeature[];
  land_cover: LandCoverResult | null;
  slope_pct: number | null;
  aspect_deg: number | null;       // 0° = North, clockwise
  elevation_range_ft: number | null;
  queried_at: string;
  errors: string[];
}
```

### Key Implementation Details

- All HTTP calls use `AbortSignal.timeout(30_000)` and `retryWithBackoff()` from `infra/resilience.ts`
- Slope computed via first-order finite difference on 3 elevation samples (~11m apart)
- Aspect computed via `atan2(-dEast, dNorth)` → degrees clockwise from North
- All requests are parallel via `Promise.allSettled()` — a failing contour query doesn't block elevation
- NHD FType codes mapped to human-readable labels via `nhdFTypeToLabel()`
- NLCD class codes (11–95) mapped to English labels in `NLCD_CLASS_LABELS`

### Exported Functions

```typescript
export class USGSClient {
  async getTopoData(projectId, lat, lon, radiusM = 200): Promise<TopoResult>
  async fetchElevation(lat, lon): Promise<ElevationPoint>
  async fetchContours(lat, lon, radiusM): Promise<ContourLine[]>
  async fetchWaterFeatures(lat, lon, radiusM): Promise<WaterFeature[]>
}
export function computeSlope(centreM, northM, eastM): number
export function computeAspect(dNorth, dEast): number   // 0–360°
export function nhdFTypeToLabel(ftype): WaterFeature['feature_type']
export const NLCD_CLASS_LABELS: Record<number, string>
```

### Express Route

```
POST /research/topo
  Body: { projectId, lat, lon, radiusM? }
  Response: { topo: TopoResult }

GET /research/topo/:projectId
  Response: { topo: TopoResult } (from saved JSON file)
```

---

## 13.4 TX Comptroller Client (`comptroller-client.ts`)

### Overview

Retrieves county-level property tax rate data from the Texas Comptroller's PTAD (Property Tax Assistance Division) transparency portal. Returns taxing unit rates, estimated combined rate, and standard Texas exemption schedule.

**Important limitation:** The Comptroller does NOT expose a per-parcel tax API. This client returns the *taxing-unit rates* for the county and city containing the property. Per-parcel tax bills come from the individual county CAD/tax collector.

### Data Sources

| Source | URL | What It Provides |
|---|---|---|
| PTAD County Tax Rates | `https://data.texas.gov/resource/2dxm-hqwi.json` | All taxing unit rates per county and year |
| County CAD Registry | Static (in code) | CAD name, URL, FIPS code for 26 major TX counties |
| Standard Exemptions | Static (in code) | TX state-law homestead/over-65/disability exemption schedule |

### TypeScript Types

```typescript
export interface TaxingUnit {
  unit_name: string;
  unit_type: 'county' | 'city' | 'isd' | 'hospital' | 'water' | 'other';
  tax_rate: number;        // Combined adopted rate per $100 valuation
  m_o_rate: number;        // Maintenance & Operations
  i_s_rate: number;        // Interest & Sinking (debt service)
  effective_rate: number;  // No-new-revenue rollback rate
  rollback_rate: number;   // 8% M&O rollback rate
  year: number;
}

export interface TaxResult {
  project_id: string;
  county_fips: string;
  county_name: string;
  appraisal_district_name: string;
  appraisal_district_url: string | null;
  taxing_units: TaxingUnit[];
  combined_rate: number;            // Sum of all unit rates
  exemptions: ExemptionInfo[];
  delinquency: DelinquencyInfo | null;
  tax_year: number;
  queried_at: string;
  errors: string[];
}
```

### County CAD Registry

The `COUNTY_CAD_REGISTRY` maps 26 major Texas county FIPS codes to their CAD name and URL:

| FIPS | County | CAD | URL |
|---|---|---|---|
| 48027 | Bell | Bell CAD | https://www.bellcad.org |
| 48201 | Harris | HCAD | https://public.hcad.org |
| 48439 | Tarrant | TAD | https://www.tad.org |
| 48453 | Travis | Travis CAD | https://www.traviscad.org |
| 48029 | Bexar | Bexar CAD | https://www.bcad.org |
| 48113 | Dallas | Dallas CAD | https://www.dallascad.org |
| 48491 | Williamson | Williamson CAD | https://www.wcad.org |
| … | (26 total) | … | … |

### Fallback Rate Estimates

When the PTAD API is unavailable, `estimatedCombinedRate(countyFips)` returns an approximate statewide-average rate (~2.15%) with a Bell/Harris/Tarrant-specific estimate from 2023 data. These are for display only and should never be used for legal or financial purposes.

### Standard Exemptions

`getStandardExemptions()` returns the 5 state-law exemptions every Texas property owner may claim:
1. **Homestead** — $25,000+ minimum for school ISDs
2. **Over 65** — $10,000 for ISDs + optional county/city amount
3. **Disabled Person** — $10,000 for ISDs + optional county/city amount
4. **Disabled Veteran** — $5,000–$12,000 based on disability rating
5. **Agriculture** — Productivity value appraisal (must apply with CAD)

### Express Route

```
POST /research/tax
  Body: { projectId, countyFips, taxYear? }
  Response: { tax: TaxResult }

GET /research/tax/:projectId
  Response: { tax: TaxResult } (from saved JSON file)
```

---

## 13.5 Zod Schema Validator (`schema-validator.ts`)

### Overview

Validates each phase's output JSON against a Zod schema before the next phase consumes it. Converts silent data-shape bugs (missing fields, wrong types, out-of-range values) into clear error messages.

### Phase Schemas Registered

| Phase | Schema Name | Key Validated Fields |
|---|---|---|
| 1 | `DiscoverySchema` | propertyId (non-empty), countyFips (5-digit), address |
| 2 | `HarvestSchema` | projectId, documents array, document.type enum |
| 3 | `PropertyIntelligenceSchema` | projectId, boundaryCalls array |
| 4 | `SubdivisionSchema` | projectId, isSubdivision bool |
| 5 | `AdjacentResearchSchema` | adjacentProperties array, researchStatus enum |
| 6 | `ROWSchema` | projectId, adjacentRoads (optional) |
| 7 | `ReconciliationSchema` | reconciledBoundary array, closure metrics |
| 8 | `ConfidenceSchema` | overallConfidence.score (0–100), grade (A–F), discrepancies |
| 9 | `PurchaseSchema` | purchases array, totalCharged (non-negative) |
| 10 | `ReportSchema` | projectId, outputs array, format enum |
| 11 | `TopoEnrichmentSchema` | projectId, elevation nullable, counters |
| 12 | `TaxEnrichmentSchema` | county_fips (5-digit), combined_rate (non-negative) |

All schemas use `.passthrough()` to allow extra fields without failing.

### API

```typescript
// Throws ZodError if invalid:
validatePhaseOutput(phase: PhaseName, data: unknown): void

// Returns { success: true, data } or { success: false, error } — never throws:
safeParse<P extends PhaseName>(phase: P, data: unknown): SafeParseResult

// Formats ZodError to human-readable string for logging:
formatZodError(err: z.ZodError): string

// Returns typed data or null (calls onError if invalid — non-fatal):
validateOrNull<P extends PhaseName>(phase, data, onError?): T | null
```

### ZodError Compatibility

Supports both Zod v3 (`.errors`) and Zod v4 (`.issues`) by checking for `.issues` first with a fallback to `.errors`.

### Integration Pattern

In each pipeline phase, call `validateOrNull` on the previous phase's loaded JSON:

```typescript
// In reconciliation-engine.ts, before processing:
import { validateOrNull } from '../infra/schema-validator.js';

const phaseData = validateOrNull('property_intelligence', rawJson, msg => {
  pipelineLogger.warn({ projectId, msg }, 'Phase 3 schema validation warning');
});
if (!phaseData) {
  throw new Error(`Phase 3 output schema validation failed for project ${projectId}`);
}
```

---

## 13.6 Interactive Boundary Viewer (`[projectId]/boundary/page.tsx`)

### Overview

A full-screen React page (`'use client'`) that renders the reconciled property boundary as an interactive SVG. Supports pan, zoom, click-to-inspect, layer toggles, and confidence coloring.

### Page Route

```
/admin/research/[projectId]/boundary
```

### Features

| Feature | Description |
|---|---|
| **SVG pan/zoom** | Mouse drag to pan, scroll wheel to zoom (0.2×–10× range), reset button |
| **Click-to-inspect** | Click any boundary call line → right panel shows bearing, distance, source, confidence score/grade, discrepancy detail, raw text |
| **Confidence coloring** | Color mode selector: `solid` (all blue), `confidence` (A=green → F=red), `source` (future) |
| **Layer toggles** | Show/hide: boundary lines, confidence, call index labels, discrepancy highlights |
| **Discrepancy highlights** | Critical/major discrepancies render in red when discrepancy layer is on |
| **Curve calls** | Dashed line style for curve calls |
| **Grade badge** | Header shows overall grade/score with color-coded badge |
| **Navigation** | Back link to project hub, link to Full Report |

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: ← Back | Boundary Viewer | Grade B (82%)    │
├────────┬─────────────────────────────┬──────────────┤
│ Layer  │                             │              │
│ Panel  │   SVG Boundary Viewer       │  Call Detail │
│        │   (pan / zoom / click)      │  Panel       │
│ Layers │                             │  (right side)│
│ ──     │   +zoom / -zoom / ⟳ reset  │              │
│ Color  │   (bottom-right controls)   │              │
│ Mode   │                             │              │
│        │                             │              │
└────────┴─────────────────────────────┴──────────────┘
```

### Data API

```
GET /api/admin/research/[projectId]/boundary
Response: {
  calls: BoundaryCall[],
  closureError?: number,
  closureRatio?: string,
  overallScore?: number,
  overallGrade?: string,
  projectId: string,
  address: string,
  countyName?: string
}
```

Where `BoundaryCall` includes `{ callIndex, bearing?, distance?, isCurve?, score?, grade?, source?, rawText?, discrepancy?, x1?, y1?, x2?, y2? }`.

---

## 13.7 Project Document Library (`[projectId]/documents/page.tsx`)

### Overview

Shows all research documents retrieved and purchased for a specific project. Supports preview (image thumbnail), download (purchased docs only), filter by type, full-text search, and sort.

### Page Route

```
/admin/research/[projectId]/documents
```

### Features

| Feature | Description |
|---|---|
| **Filter tabs** | All / Plat / Deed / Easement / Survey / Purchased / Used |
| **Full-text search** | Search instrument #, grantor, grantee, description |
| **Sort options** | Relevance, Date, Type, Instrument # |
| **Document cards** | Show type icon, instrument #, relevance stars, purchased/used badges, grantor/grantee, date, page count, file size, source |
| **Preview panel** | Right sidebar with document thumbnail image and full metadata |
| **Download** | Fetch from `/api/admin/research/[projectId]/documents/[documentId]/download` |
| **Stats header** | Total count, purchased count, used-in-analysis count |

### Data API

```
GET /api/admin/research/[projectId]/documents
Response: {
  documents: ResearchDocument[]
}

GET /api/admin/research/[projectId]/documents/[documentId]/download
Response: Binary file (PDF/image)

GET /api/admin/research/[projectId]/documents/[documentId]/preview
Response: Thumbnail image
```

---

## 13.8 Global Document Library (`library/page.tsx`)

### Overview

Shows ALL research documents across ALL of the current user's projects. Enables cross-project document discovery, filtering, and purchase tracking.

### Page Route

```
/admin/research/library
```

### Features

| Feature | Description |
|---|---|
| **Cross-project view** | All docs from all projects, each showing the source project address |
| **County filter** | Dropdown of all counties in user's document set |
| **Filter tabs** | All / Plat / Deed / Easement / Survey / Purchased |
| **Full-text search** | Instrument #, grantor/grantee, description, project address |
| **Sort** | Newest/Oldest, Relevance, Type, County |
| **Pagination** | 25 per page with prev/next controls |
| **Library stats bar** | Per-type counts displayed in a thin stats bar below the header |
| **Navigation** | Each document links to its project's document library page |

### Data API

```
GET /api/admin/research/library
Response: {
  documents: LibraryDocument[],
  stats: {
    totalDocuments: number,
    totalPurchased: number,
    totalSpent: number,
    byType: Record<string, number>,
    byCounty: Record<string, number>
  }
}
```

---

## 13.9 Billing & Usage Dashboard (`billing/page.tsx`)

### Overview

Subscription management and usage tracking page. Shows current plan, usage against limits, invoice history, per-document purchase transactions, and AI usage metrics.

### Page Route

```
/admin/research/billing
```

### Tabs

| Tab | Content |
|---|---|
| **Overview** | Subscription card + 4 KPI tiles (total reports, this month, docs purchased, doc spend) + top counties + avg pipeline time |
| **Invoices** | Sortable table: date, description, amount, status (paid/open), PDF download link |
| **Purchases** | Table of document purchase transactions: date, type, instrument #, property, vendor, vendor cost, service fee, total, status |
| **Usage** | Monthly reports bar chart + usage detail table (tokens, AI cost, avg time, etc.) |

### Subscription Card

- Shows tier name (Free / Surveyor Pro / Firm Unlimited) with color-coded tier badge
- Current plan price
- Trial warning banner if in trial period
- Next billing date and next invoice amount
- Usage bar (reports used / limit)
- Batch enabled badge for Firm Unlimited

### Data API

```
GET /api/admin/research/billing
Response: {
  subscription: SubscriptionInfo,
  usage: UsageMetrics,
  invoices: Invoice[],
  purchases: PurchaseTransaction[]
}
```

---

## 13.10 Phase 13 Test Coverage

### Statewide Adapters Tests (v1.0)

**File:** `__tests__/recon/phase13-statewide-adapters.test.ts`
**Tests:** 60 (all passing)

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

### Interactive UI & Data Sources Tests (v1.1)

**File:** `__tests__/recon/phase13-interactive.test.ts`
**Tests:** 80 (all passing)

| Section | Tests | What's Tested |
|---|---|---|
| `computeSlope()` | 1–5 | Flat terrain, N/E rise, linear scaling, steep slope >100% |
| `computeAspect()` | 6–8 | Flat terrain (0°), directional, range [0,360) |
| NLCD labels | 9–13 | Open Water, Deciduous Forest, Cultivated Crops, Pasture/Hay, label count |
| `nhdFTypeToLabel()` | 14–20 | Stream/River/Lake/Reservoir/Canal/Ditch/Other FType codes |
| `USGSClient` | 21 | Constructor instantiation |
| `COUNTY_CAD_REGISTRY` | 22–28 | Bell/Harris/Tarrant/Travis entries, size ≥20, all 5-digit FIPS, all TX (48xxx) |
| `estimatedCombinedRate()` | 29–31 | Bell (1.5–3.0), unknown (≈2.15), Harris (1.5–3.0) |
| `getStandardExemptions()` | 32–37 | ≥4 entries, homestead, over_65, disabled_veteran, applies_to arrays, constructor |
| `validatePhaseOutput()` | 38–42 | Valid discovery passes, missing propertyId fails, bad FIPS fails, letters in FIPS fail, passthrough |
| `safeParse()` | 43–46 | success=true/false, issues array, never throws on null/undefined/number |
| `formatZodError()` | 47–48 | Returns non-empty string, contains field path |
| `validateOrNull()` | 49–51 | Returns data, returns null, calls onError with message |
| Harvest schema | 52–54 | Valid passes, with documents, invalid type fails |
| Confidence schema | 55–58 | Valid passes, score>100 fails, invalid grade fails, negative score fails |
| `PhaseSchemas` registry | 59–60 | ≥12 schemas registered, all have parse/safeParse methods |
| `parseBearingToDecimal()` | 61–70 | Cardinal directions, NE/NW/SE/SW quadrants, decimal degrees, validation |
| `walkTraverse()` | 71–80 | Single call, multi-call, SVG Y convention, closure error, reverse bearing |

---

## 13.11 Express API Routes

Add these routes to `worker/src/index.ts`:

```typescript
// Phase 13: USGS topographic data
POST /research/topo
  Body: { projectId: string, lat: number, lon: number, radiusM?: number }
  Async: saves topo.json to project dir
  Response: 202 Accepted

GET /research/topo/:projectId
  Response: { topo: TopoResult } from saved file

// Phase 13: TX Comptroller tax data
POST /research/tax
  Body: { projectId: string, countyFips: string, taxYear?: number }
  Async: saves tax.json to project dir
  Response: 202 Accepted

GET /research/tax/:projectId
  Response: { tax: TaxResult } from saved file
```

Apply `routeRateLimit(5, 60_000)` to POST routes and `routeRateLimit(60, 60_000)` to GET routes (pattern from Phase 9+).

---

## 13.12 Next.js API Routes

### Boundary API

**File:** `app/api/admin/research/[projectId]/boundary/route.ts`

```typescript
// GET — Return boundary viewer data assembled from reconciliation + confidence JSON
export async function GET(req, { params }) {
  const { projectId } = await params;
  // 1. Load reconciliation.json → calls array
  // 2. Load confidence.json → call scores and discrepancies
  // 3. Compute SVG coordinates (traverse walk from POB)
  // 4. Return { calls: BoundaryCall[], overallScore, overallGrade, ... }
}
```

### Documents API

**File:** `app/api/admin/research/[projectId]/documents/route.ts`

```typescript
// GET — Return all documents for project from Supabase
export async function GET(req, { params }) { ... }
```

**File:** `app/api/admin/research/[projectId]/documents/[documentId]/download/route.ts`

```typescript
// GET — Proxy document download (requires purchased status check)
export async function GET(req, { params }) { ... }
```

### Library API

**File:** `app/api/admin/research/library/route.ts`

```typescript
// GET — Return all documents across all user projects
export async function GET(req) { ... }
```

### Billing API

**File:** `app/api/admin/research/billing/route.ts`

```typescript
// GET — Return subscription + usage + invoices + purchases from Stripe + Supabase
export async function GET(req) { ... }
```

---

## 13.13 Phase 13 Deliverables Checklist

### v1.0 — Statewide Clerk Adapters & Boundary Viewer Component

- [x] `worker/src/adapters/henschen-clerk-adapter.ts` — Henschen HTML clerk adapter (~16 Hill Country counties)
- [x] `worker/src/adapters/idocket-clerk-adapter.ts` — iDocket SPA clerk adapter (~18 counties)
- [x] `worker/src/adapters/fidlar-clerk-adapter.ts` — Fidlar/Laredo AJAX clerk adapter (~13 counties)
- [x] `worker/src/services/clerk-registry.ts` updated — Henschen/iDocket/Fidlar routing (priority 4/5/6), all 7 systems in registrySummary
- [x] `ClerkSystem` union type updated: `henschen | idocket | fidlar` added
- [x] `app/admin/research/components/InteractiveBoundaryViewer.tsx` — React SVG boundary viewer component
- [x] `__tests__/recon/phase13-statewide-adapters.test.ts` — 60 unit tests (all passing)
- [x] Pre-existing HCAD/TAD test failures fixed in `__tests__/recon/phase1-discovery.test.ts`

### v1.1 — Interactive UI, Data Sources & API Routes

- [x] `worker/src/sources/usgs-client.ts` — USGS 3DEP elevation, contour, NHD client
- [x] `worker/src/sources/comptroller-client.ts` — TX Comptroller PTAD tax rates client
- [x] `worker/src/infra/schema-validator.ts` — Zod phase-boundary validation (12 schemas)
- [x] `app/admin/research/[projectId]/boundary/page.tsx` — Interactive SVG boundary viewer
- [x] `app/admin/research/[projectId]/documents/page.tsx` — Project document library
- [x] `app/admin/research/library/page.tsx` — Global cross-project document library
- [x] `app/admin/research/billing/page.tsx` — Subscription/usage/billing dashboard
- [x] `__tests__/recon/phase13-interactive.test.ts` — 80 unit tests pass (60 + 20 traverse walk tests)
- [x] `app/api/admin/research/[projectId]/boundary/route.ts` — Boundary data API endpoint (traverse walk, merge calls+confidence+discrepancies)
- [x] `app/api/admin/research/[projectId]/documents/[docId]/download/route.ts` — Signed URL download proxy
- [x] `app/api/admin/research/[projectId]/topo/route.ts` — USGS topo data proxy (with Supabase caching)
- [x] `app/api/admin/research/[projectId]/tax/route.ts` — TX Comptroller tax data proxy (with Supabase caching)
- [x] `app/api/admin/research/library/route.ts` — Global library API (cross-project, filter, paginate, stats)
- [x] `app/api/admin/research/billing/route.ts` — Billing API (subscription, usage metrics, Stripe invoices, purchase log)
- [x] Phase 13 Express routes added to `worker/src/index.ts` (POST/GET /research/topo, POST/GET /research/tax, GET /research/boundary/:projectId)
- [x] Schema validation integrated into `master-orchestrator.ts` (validateOrNull on discovery/harvest/extraction/reconciliation/confidence at loadProjectData time)
- [x] `seeds/092_phase13_tables.sql` — research_topo + research_tax Supabase tables with indexes and RLS
- [ ] Topo/tax data included in Phase 10 PDF report (requires Phase 10 PDF generator changes)

---

## 13.14 Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | Interactive boundary viewer renders correctly for Bell County test property | Visual inspection in Chrome/Safari/Firefox |
| 2 | Clicking a boundary call shows bearing, distance, source, confidence score | Functional test |
| 3 | Confidence color mode colors A calls green and F calls red | Visual inspection |
| 4 | Pan and zoom work with mouse drag and scroll wheel | Functional test |
| 5 | Document library shows all harvested documents for a project | Verify against files in project directory |
| 6 | Purchased documents can be downloaded | Download 3 purchased documents, verify files open correctly |
| 7 | Global library shows documents from all user projects | Create 3 projects, verify library shows all |
| 8 | Global library county filter works correctly | Filter by Bell County, verify only Bell docs shown |
| 9 | Billing dashboard shows correct subscription tier | Verify against Stripe dashboard |
| 10 | Invoice table shows correct amounts | Compare against Stripe invoice list |
| 11 | USGS elevation returns correct value for Bell County property | Compare against USGS National Map web viewer |
| 12 | USGS slope/aspect are physically reasonable (flat Bell County terrain) | Expect slope <10% for most Bell County properties |
| 13 | TX Comptroller returns Bell CAD for FIPS 48027 | `COUNTY_CAD_REGISTRY['48027'].cad === 'Bell CAD'` |
| 14 | Zod discovery schema rejects missing propertyId | `validatePhaseOutput('discovery', {})` throws |
| 15 | Zod confidence schema rejects score > 100 | `validatePhaseOutput('confidence', {...score: 101})` throws |
| 16 | `safeParse()` never throws on any input (null, undefined, number, malformed) | Run safeParse on edge-case inputs |
| 17 | `formatZodError()` returns path.message format | Verify output contains `[fieldName] message` |
| 18 | All 140 Phase 13 unit tests pass (60 statewide adapter + 80 interactive UI) | `npm test` |

---

## 13.15 What Needs External Input

| Item | Missing Information |
|------|---------------------|
| USGS EPQS live URL | `https://epqs.nationalmap.gov/v1/json` needs live verification; `value` key may have changed |
| USGS Contours URL | `carto.nationalmap.gov` path needs live verification against current National Map |
| NHD HR service indices | Layer 2/4 for flowline/waterbody may differ on current hydro.nationalmap.gov |
| TX Comptroller PTAD dataset | `data.texas.gov/resource/2dxm-hqwi.json` column names (`county_name`, `tax_rate`, etc.) need live verification against current Socrata schema |
| Henschen per-county URLs | Some county URLs may need live verification (rural TX counties change sites) |
| iDocket subscriber credentials | Production iDocket subscriber account for full image access (index-only in guest mode) |
| Fidlar session pattern | Some Fidlar counties may use different session initialization patterns |
| Dallas County routing | Dallas (48113) appears in Tyler, iDocket, AND Fidlar FIPS sets — Tyler (priority 3) wins since it's verified to cover Dallas. Tyler adapter is the highest priority of the three systems. |
| Bexar custom clerk | Bexar County (San Antonio) uses a custom system not yet implemented |
| Supabase document storage | Document URLs in `ResearchDocument.imageUrl` require live Supabase Storage bucket |
| Stripe invoice PDFs | `Invoice.pdfUrl` requires live Stripe API connection |

---

## 13.16 Future Work (Phase 14+)

Items explicitly deferred from Phase 13:

| Item | Status |
|------|--------|
| Document Access Tiers & Paid Platform Automation | ✅ Built in Phase 14 |
| Fidlar/iDocket subscriber purchase flows | Deferred to Phase 15 (Playwright automation) |
| Bexar County custom clerk adapter | Deferred to Phase 15 |
| Mobile-friendly report | Deferred (low priority until product is live) |
| Report sharing via link | Deferred (requires Supabase RLS policy changes) |
| Email/SMS notifications | Deferred (requires SendGrid/Twilio integration) |
| AI prompt A/B testing | Deferred (Phase 11 prompt registry exists; tracking/comparison UI deferred) |
| Data versioning (pre/post-purchase diff) | Deferred (storage design needed) |
| TNRIS LiDAR integration | Deferred (service requires account registration) |
| Cross-county property detection | Deferred (complex; affects <1% of properties) |

---

## 13.17 Environment Variables (Phase 13)

No new environment variables are required for Phase 13. All external services (USGS, TX Comptroller PTAD) use public, unauthenticated APIs.

The following Phase 11 variables remain required for the full platform:

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ job queue |
| `STRIPE_SECRET_KEY` | (required) | Stripe billing |
| `STRIPE_WEBHOOK_SECRET` | (required) | Stripe webhook validation |
| `SUPABASE_URL` | (required) | Document storage + auth |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | Server-side Supabase access |
| `ANTHROPIC_API_KEY` | (required) | Claude AI extraction |

---

*End of Phase 13 — Interactive Web UI, Additional Data Sources & Production Hardening*

*Starr Software / Starr Surveying Company — Belton, Texas — March 2026*
