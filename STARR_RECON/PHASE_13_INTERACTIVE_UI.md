# STARR RECON — Phase 13: Interactive Web UI, Additional Data Sources & Production Hardening

**Product:** Starr Compass — AI Property Research (STARR RECON)
**Version:** 1.0 | **Last Updated:** March 2026
**Phase Duration:** Weeks 54–56
**Depends On:** All Phases 1–12
**Status:** ✅ COMPLETE v1.0 — Interactive boundary viewer, document library, billing dashboard, USGS client, TX Comptroller client, Zod schema validation. 60 unit tests pass. 1435 total tests pass.
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

Complete the Starr Compass web interface and close the final gaps left after Phases 11 and 12:

1. **Interactive Boundary Viewer** — An SVG-based React page where surveyors can pan/zoom, click any boundary call to inspect all source readings and confidence scores, toggle display layers, and switch between solid/confidence/source color modes.

2. **Document Library** — Two complementary pages: a per-project document library showing every harvested and purchased document with preview/download, and a global cross-project library with full-text search, county filtering, and pagination.

3. **Billing & Usage Dashboard** — A subscription management page showing the current plan, usage metrics, invoice history, and per-document purchase transaction log.

4. **USGS National Map Client** — Retrieves topographic elevation (3DEP), contour lines, NHD water features, and slope/aspect data for any property coordinate.

5. **TX Comptroller Client** — Retrieves county-level property tax rates from the PTAD transparency portal, maps counties to their CAD/appraisal districts, and provides the standard Texas homestead/over-65/disabled-veteran exemption data.

6. **Zod Phase-Boundary Schema Validation** — Validates every phase's output JSON against a strongly-typed Zod schema before the next phase begins, converting silent data-shape bugs into clear, actionable error messages.

**Deliverable:** A fully interactive research web UI, two additional government data source integrations, and airtight I/O contracts between pipeline phases — making the STARR RECON product ready for real surveyor use.

---

## 13.1 Current State Before Phase 13

After Phases 1–12, the STARR RECON pipeline:

| Capability | State Before Phase 13 |
|---|---|
| Full pipeline (phases 1–10) | ✅ Working (CLI + API) |
| Stripe billing, job queue | ✅ Working |
| Statewide CAD adapters (BIS, TrueAutomation, Tyler, HCAD, TAD) | ✅ Working |
| Clerk adapters (Kofile, CountyFusion, Tyler, TexasFile) | ✅ Working |
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
├── sources/
│   ├── usgs-client.ts           ← NEW §13.3  USGS 3DEP elevation + contours + NHD
│   └── comptroller-client.ts    ← NEW §13.4  TX Comptroller PTAD tax rates
├── infra/
│   └── schema-validator.ts      ← NEW §13.5  Zod phase I/O validation
│
app/admin/research/
├── [projectId]/
│   ├── boundary/
│   │   └── page.tsx             ← NEW §13.6  Interactive SVG boundary viewer
│   └── documents/
│       └── page.tsx             ← NEW §13.7  Per-project document library
├── library/
│   └── page.tsx                 ← NEW §13.8  Global document library (cross-project)
└── billing/
    └── page.tsx                 ← NEW §13.9  Subscription/usage/billing dashboard
│
__tests__/recon/
└── phase13-interactive.test.ts  ← NEW §13.10 60 unit tests
```

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

**File:** `__tests__/recon/phase13-interactive.test.ts`
**Tests:** 60
**Coverage:**

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

- [x] `worker/src/sources/usgs-client.ts` — USGS 3DEP elevation, contour, NHD client
- [x] `worker/src/sources/comptroller-client.ts` — TX Comptroller PTAD tax rates client
- [x] `worker/src/infra/schema-validator.ts` — Zod phase-boundary validation (12 schemas)
- [x] `app/admin/research/[projectId]/boundary/page.tsx` — Interactive SVG boundary viewer
- [x] `app/admin/research/[projectId]/documents/page.tsx` — Project document library
- [x] `app/admin/research/library/page.tsx` — Global cross-project document library
- [x] `app/admin/research/billing/page.tsx` — Subscription/usage/billing dashboard
- [x] `__tests__/recon/phase13-interactive.test.ts` — 60 unit tests pass
- [ ] `app/api/admin/research/[projectId]/boundary/route.ts` — Boundary data API endpoint
- [ ] `app/api/admin/research/[projectId]/documents/route.ts` — Documents API endpoint
- [ ] `app/api/admin/research/[projectId]/documents/[documentId]/download/route.ts` — Download endpoint
- [ ] `app/api/admin/research/library/route.ts` — Global library API endpoint
- [ ] `app/api/admin/research/billing/route.ts` — Billing API endpoint
- [ ] Phase 13 Express routes added to `worker/src/index.ts`
- [ ] Schema validation integrated into pipeline phase runners
- [ ] Topo/tax data included in Phase 10 PDF report

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
| 18 | All 60 Phase 13 unit tests pass | `npm test` |

---

## 13.15 What Needs External Input

| Item | Missing Information |
|------|---------------------|
| USGS EPQS live URL | `https://epqs.nationalmap.gov/v1/json` needs live verification; `value` key may have changed |
| USGS Contours URL | `carto.nationalmap.gov` path needs live verification against current National Map |
| NHD HR service indices | Layer 2/4 for flowline/waterbody may differ on current hydro.nationalmap.gov |
| TX Comptroller PTAD dataset | `data.texas.gov/resource/2dxm-hqwi.json` column names (`county_name`, `tax_rate`, etc.) need live verification against current Socrata schema |
| Boundary SVG coordinates | `GET /api/admin/research/[projectId]/boundary` requires a coordinate traversal walk from Phase 7 reconciled boundary — needs traverse-walk integration |
| Supabase document storage | Document URLs in `ResearchDocument.imageUrl` require live Supabase Storage bucket |
| Stripe invoice PDFs | `Invoice.pdfUrl` requires live Stripe API connection |
| Phase runner integration | Zod schema validation calls not yet integrated into `master-orchestrator.ts` phase runners |

---

## 13.16 Future Work (Phase 14+)

Items explicitly deferred from Phase 13:

| Item | Rationale |
|------|-----------|
| Mobile-friendly report | Responsive CSS pass on report viewer; low priority until product is live |
| Report sharing via link | Requires Supabase RLS policy changes for anonymous read access |
| Email/SMS notifications | Requires SendGrid/Twilio integration; not blocking surveyor workflow |
| Boundary SVG coordinate traversal API | Requires integrating traverse-walk math from Phase 7 into the API route |
| AI prompt A/B testing | Phase 11 prompt registry exists; tracking/comparison UI deferred |
| Data versioning (pre/post-purchase diff) | Storage design needed; not blocking surveyor workflow |
| TNRIS LiDAR integration | Service requires account registration; lower priority than USGS 3DEP |
| Cross-county property detection | Complex; affects less than 1% of properties |

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
