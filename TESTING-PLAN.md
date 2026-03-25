# STARR Surveying — Modular Testing Lab & Production UI Plan

> **Date:** 2026-03-25
> **Branch:** `claude/add-zoom-logging-Wd5jt`
> **Status:** Planning — awaiting approval before implementation

---

## 1. Goals

| # | Goal | Why |
|---|------|-----|
| 1 | Keep the **production UI** (`/admin/research`) unchanged | Clients/admins can still run the full pipeline end-to-end |
| 2 | Build a **Testing Lab UI** (`/admin/research/testing`) | Admin-only; lets you run any scraper, analyzer, or pipeline phase in isolation |
| 3 | Keep the **full pipeline runnable** from the Testing Lab too | "Run All Phases" button so you can still test the whole thing |
| 4 | Make every piece **independently testable** | Each scraper and analyzer gets its own card with inputs, run button, and output viewer |
| 5 | Show **real-time logs** for every operation | Stream worker logs into the UI so you can see exactly what's happening |

---

## 2. Architecture Overview

```
/admin/research/                  ← PRODUCTION (unchanged)
  page.tsx                        ← Project list
  [projectId]/page.tsx            ← Project hub (all-in-one pipeline)
  [projectId]/boundary/page.tsx   ← Boundary viewer
  [projectId]/documents/page.tsx  ← Document manager
  pipeline/page.tsx               ← Batch pipeline dashboard
  billing/page.tsx                ← Billing
  library/page.tsx                ← Document library

/admin/research/testing/          ← NEW: TESTING LAB
  page.tsx                        ← Testing Lab dashboard
  layout.tsx                      ← Lab layout with nav + admin guard
```

### Testing Lab Sections (all on one page, tab-based)

```
┌─────────────────────────────────────────────────────────────┐
│  STARR Research Testing Lab                    [Admin Only] │
├─────────────────────────────────────────────────────────────┤
│  [Scrapers] [Analyzers] [Pipeline Phases] [Full Pipeline]   │
│  [Health Check] [Logs]                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Property Context ─────────────────────────────────────┐ │
│  │ Project: [dropdown / create-new]                       │ │
│  │ Property ID: [R12345________]  County: [Bell___]       │ │
│  │ Address:    [123 Main St___]   Lat/Lon: [31.05/97.47] │ │
│  │ Owner:      [Smith, John___]                           │ │
│  │                                         [Load Project] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Scraper Card: CAD Scraper ────────────────────────────┐ │
│  │ Status: idle  |  Runtime: --  |  Browser: Yes          │ │
│  │ Inputs: address ✓  propertyId ✓  (from context above)  │ │
│  │                                          [Run] [Clear] │ │
│  │ ┌─ Output ───────────────────────────────────────────┐ │ │
│  │ │ (collapsed until run)                              │ │ │
│  │ │ JSON result tree / error / screenshots             │ │ │
│  │ └───────────────────────────────────────────────────┘ │ │
│  │ ┌─ Logs ─────────────────────────────────────────────┐ │ │
│  │ │ [timestamp] Layer 1: REST API query...             │ │ │
│  │ │ [timestamp] Layer 2: HTML fallback...              │ │ │
│  │ └───────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  (repeat for each scraper/analyzer/phase)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Complete Inventory of Testable Modules

### 3A. Scrapers (Bell County)

| # | Module | Worker Function | Endpoint | Required Inputs | Browser | API Key | Est. Runtime |
|---|--------|----------------|----------|-----------------|---------|---------|-------------|
| 1 | **CAD Scraper** | `scrapeBellCad` | `POST /research/discover` | address OR propertyId OR ownerName | Yes | No | 5–15s |
| 2 | **GIS Scraper** | `scrapeBellGis` | `POST /research/discover` | propertyId OR lat/lon OR address | No | No | 2–5s |
| 3 | **Clerk Scraper** | `scrapeBellClerk` | `POST /research/harvest` | instrumentNumbers OR ownerName OR subdivisionName | Yes | No | 15–45s |
| 4 | **Plat Scraper** | `scrapeBellPlats` | `POST /research/harvest` | subdivisionName OR instrumentNumbers | Yes | No | 5–30s |
| 5 | **FEMA Scraper** | `scrapeBellFema` | `POST /research/flood-zone` | lat, lon | No | No | 3–5s |
| 6 | **TxDOT Scraper** | `scrapeBellTxDot` | `POST /research/row` | lat, lon | No | No | 3–5s |
| 7 | **Tax Scraper** | `scrapeBellTax` | `POST /research/tax` | propertyId | No | No | 5–15s |
| 8 | **Map Screenshot** | `captureMapScreenshots` | (via harvest phase) | propertyId, lat, lon | Yes | Optional | 20–40s |
| 9 | **GIS Viewer Capture** | `captureGisViewerScreenshots` | (via harvest phase) | lat, lon, boundary | Yes | No | 30–90s |
| 10 | **Screenshot Collector** | `captureScreenshots` | (via harvest phase) | URL list | Yes | No | 7s + 5–10s/ea |

### 3B. Analyzers

| # | Module | Worker Function | Required Inputs | Browser | API Key | Est. Runtime |
|---|--------|----------------|-----------------|---------|---------|-------------|
| 1 | **Deed Analyzer** | `analyzeBellDeeds` | deedRecords array | No | Yes (Claude) | 10–30s |
| 2 | **Plat Analyzer** | `analyzeBellPlats` | platRecords array | No | Yes (Claude) | 5–20s |
| 3 | **Lot Correlator** | `correlateTargetLot` | lot/block/boundary/coordinates | No | Yes (Claude) | 5–10s |
| 4 | **Discrepancy Detector** | `detectDiscrepancies` | CAD/GIS/deed/plat descriptions | No | No | <1s |
| 5 | **Confidence Scorer** | `scoreDataItem` / `scoreOverallConfidence` | data items array | No | No | <1s |
| 6 | **Relevance Validator** | `validateDeedRelevance` | deeds + property info | No | Optional | 1–5s |
| 7 | **GIS Quality Analyzer** | `analyzeGisQuality` | screenshots array | No | Yes (Claude) | 2–5s/ea |
| 8 | **Screenshot Classifier** | `classifyScreenshots` | screenshots array | No | Optional | 1–3s |

### 3C. Pipeline Phases (Orchestrated)

| Phase | Name | Worker Endpoint | Critical | Depends On |
|-------|------|-----------------|----------|------------|
| 1 | Property Discovery | `POST /research/discover` | Yes | (entry point) |
| 2 | Document Harvesting | `POST /research/harvest` | Yes | Phase 1 |
| 3 | AI Extraction | `POST /research/analyze` | Yes | Phase 2 |
| 4 | Subdivision Intelligence | `POST /research/subdivision` | No | Phase 3 |
| 5 | Adjacent Properties | `POST /research/adjacent` | No | Phase 3 |
| 6 | TxDOT ROW | `POST /research/row` | No | Phase 1 (lat/lon) |
| 7 | Boundary Reconciliation | `POST /research/reconcile` | Yes | Phases 3–6 |
| 8 | Confidence Scoring | `POST /research/confidence` | Yes | Phase 7 |
| 9 | Document Purchase | `POST /research/purchase` | No | Phase 3 |

### 3D. Supplementary Endpoints

| Module | Worker Endpoint | Purpose |
|--------|-----------------|---------|
| Flood Zone | `POST /research/flood-zone` | FEMA flood zone lookup |
| Chain of Title | `POST /research/chain-of-title` | Deep chain-of-title analysis |
| Topographic | `POST /research/topo` | USGS elevation/topo data |
| Tax Rates | `POST /research/tax` | TX Comptroller tax data |
| Cross-County | `POST /research/cross-county/detect` | Multi-county property detection |
| LiDAR | `GET /research/lidar/:projectId` | LiDAR elevation data |
| Batch | `POST /research/batch` | Multi-property batch processing |
| Health Check | `GET /admin/health/sites` | All site health status |
| Address Validation | `POST /research/validate-address` | Verify address/county match |

---

## 4. File Plan — What to Create

### 4A. Testing Lab Page

```
app/admin/research/testing/
  layout.tsx               ← Admin guard + lab chrome
  page.tsx                 ← Main testing lab (tabs for each section)
```

### 4B. Testing Lab Components

```
app/admin/research/testing/components/
  PropertyContextBar.tsx   ← Shared property inputs (ID, address, lat/lon, etc.)
  TestCard.tsx             ← Reusable card: title, inputs, Run/Clear, output, logs
  ScrapersTab.tsx          ← Tab content: all 10 scraper cards
  AnalyzersTab.tsx         ← Tab content: all 8 analyzer cards
  PhasesTab.tsx            ← Tab content: all 9 pipeline phase cards (run individually)
  FullPipelineTab.tsx      ← Tab content: run full pipeline with phase checkboxes
  HealthCheckTab.tsx       ← Tab content: worker & site health status
  LogViewerTab.tsx         ← Tab content: aggregated log viewer across all runs
  OutputViewer.tsx         ← JSON tree viewer + screenshot gallery + error display
  LogStream.tsx            ← Real-time log stream component (reused in every card)
```

### 4C. Testing Lab CSS

```
app/admin/styles/TestingLab.css   ← All styles for the testing lab
```

### 4D. API Route (Proxy to Worker)

```
app/api/admin/research/testing/
  run/route.ts             ← POST: proxy any scraper/analyzer/phase to worker
                              Body: { module, phase, inputs }
                              Returns: { result, logs, duration, screenshots }
```

> **Note:** Most worker endpoints already exist. The testing API route is a thin
> proxy that normalizes the interface so the UI can call any module uniformly.

---

## 5. Detailed Component Specs

### 5A. `PropertyContextBar`

**Purpose:** Shared input bar at the top of the Testing Lab. All test cards read from this context.

```typescript
interface PropertyContext {
  projectId: string | null;      // existing project or null for ad-hoc
  propertyId: string;            // e.g. "R12345"
  address: string;               // e.g. "123 Main St, Belton, TX 76513"
  county: string;                // e.g. "Bell"
  state: string;                 // e.g. "TX"
  lat: number | null;
  lon: number | null;
  ownerName: string;
  subdivisionName: string;
  instrumentNumbers: string;     // comma-separated
}
```

- Dropdown to select an existing project (populates all fields)
- Or fill in manually for ad-hoc testing
- "Load from Project" button fills fields from project data
- Context is passed via React context to all child cards

### 5B. `TestCard` (Reusable)

**Purpose:** Generic card that wraps any testable module.

```typescript
interface TestCardProps {
  title: string;                 // e.g. "CAD Scraper"
  description: string;           // e.g. "Searches Bell County Appraisal District"
  module: string;                // e.g. "cad-scraper"
  requiresBrowser: boolean;
  requiresApiKey: boolean;
  estimatedRuntime: string;      // e.g. "5–15s"
  requiredInputs: string[];      // e.g. ["propertyId", "address"]
  optionalInputs: string[];      // e.g. ["ownerName"]
  overrideInputs?: Record<string, unknown>;  // card-specific extra inputs
}
```

**States:**
- `idle` — default, shows Run button
- `running` — shows spinner + elapsed time + streaming logs
- `success` — green border, shows output viewer + duration
- `error` — red border, shows error message + logs

**Features:**
- Reads required inputs from PropertyContext automatically
- Shows warning badges for missing required inputs
- "Override Inputs" collapsible section for advanced usage
- Output section: collapsible JSON tree, screenshot thumbnails, raw text
- Log section: scrollable log stream with timestamps

### 5C. `FullPipelineTab`

**Purpose:** Run the full 9-phase pipeline (same as production) but with:
- Phase checkboxes (skip/include each phase)
- Resume-from-phase dropdown
- Budget input for Phase 9
- Real-time phase progress stepper (reuses `PipelineStepper` component)
- Per-phase expandable output sections
- Aggregated log stream

### 5D. `HealthCheckTab`

**Purpose:** Check worker connectivity and all external site health.

- Worker health: `GET /health`
- All sites: `GET /admin/health/sites`
- Per-vendor: `GET /admin/health/sites/:vendor`
- Trigger check: `POST /admin/health/check-all`
- Shows site status grid with green/yellow/red indicators

---

## 6. API Route Design

### `POST /api/admin/research/testing/run`

Thin proxy that routes to the appropriate worker endpoint based on module type.

```typescript
// Request body
interface TestRunRequest {
  module: string;           // "cad-scraper" | "gis-scraper" | "phase-1" | etc.
  inputs: Record<string, unknown>;  // Module-specific inputs
  projectId?: string;       // Optional project context
}

// Response
interface TestRunResponse {
  success: boolean;
  duration: number;         // ms
  result: unknown;          // Module-specific output
  logs: LogEntry[];         // Captured log lines
  screenshots: string[];    // Screenshot URLs (if any)
  error?: string;           // Error message (if failed)
}
```

**Module → Worker endpoint mapping:**

```typescript
const MODULE_ENDPOINTS: Record<string, { method: string; path: string }> = {
  // Scrapers (mapped to individual phase endpoints)
  'cad-scraper':       { method: 'POST', path: '/research/discover' },
  'gis-scraper':       { method: 'POST', path: '/research/discover' },
  'clerk-scraper':     { method: 'POST', path: '/research/harvest' },
  'plat-scraper':      { method: 'POST', path: '/research/harvest' },
  'fema-scraper':      { method: 'POST', path: '/research/flood-zone' },
  'txdot-scraper':     { method: 'POST', path: '/research/row' },
  'tax-scraper':       { method: 'POST', path: '/research/tax' },

  // Analyzers (mapped to analyze phase with analyzer param)
  'deed-analyzer':     { method: 'POST', path: '/research/analyze' },
  'plat-analyzer':     { method: 'POST', path: '/research/analyze' },
  'discrepancy':       { method: 'POST', path: '/research/analyze' },
  'confidence':        { method: 'POST', path: '/research/confidence' },

  // Full phases
  'phase-1-discover':  { method: 'POST', path: '/research/discover' },
  'phase-2-harvest':   { method: 'POST', path: '/research/harvest' },
  'phase-3-analyze':   { method: 'POST', path: '/research/analyze' },
  'phase-4-subdivision': { method: 'POST', path: '/research/subdivision' },
  'phase-5-adjacent':  { method: 'POST', path: '/research/adjacent' },
  'phase-6-row':       { method: 'POST', path: '/research/row' },
  'phase-7-reconcile': { method: 'POST', path: '/research/reconcile' },
  'phase-8-confidence': { method: 'POST', path: '/research/confidence' },
  'phase-9-purchase':  { method: 'POST', path: '/research/purchase' },

  // Full pipeline
  'full-pipeline':     { method: 'POST', path: '/research/run' },

  // Supplementary
  'flood-zone':        { method: 'POST', path: '/research/flood-zone' },
  'chain-of-title':    { method: 'POST', path: '/research/chain-of-title' },
  'topo':              { method: 'POST', path: '/research/topo' },
  'cross-county':      { method: 'POST', path: '/research/cross-county/detect' },
  'validate-address':  { method: 'POST', path: '/research/validate-address' },
};
```

---

## 7. Existing Components to Reuse

These components from the production UI can be imported directly into the Testing Lab:

| Component | Source Path | Reuse In |
|-----------|------------|----------|
| `PipelineStepper` | `research/components/PipelineStepper.tsx` | FullPipelineTab |
| `PipelineProgressPanel` | `research/components/PipelineProgressPanel.tsx` | FullPipelineTab, individual phase cards |
| `ArtifactGallery` | `research/components/ArtifactGallery.tsx` | OutputViewer (screenshot results) |
| `DataPointsPanel` | `research/components/DataPointsPanel.tsx` | Analyzer output display |
| `DiscrepancyPanel` | `research/components/DiscrepancyPanel.tsx` | Discrepancy detector output |
| `BoundaryCallsPanel` | `research/components/BoundaryCallsPanel.tsx` | Reconciliation phase output |
| `InteractiveBoundaryViewer` | `research/components/InteractiveBoundaryViewer.tsx` | Reconciliation phase output |
| `SourceDocumentViewer` | `research/components/SourceDocumentViewer.tsx` | Clerk/plat scraper outputs |
| `ResearchRunPanel` | `research/components/ResearchRunPanel.tsx` | FullPipelineTab |

---

## 8. Test Fixtures — Known Good Properties

Pre-loaded property data for quick testing (Bell County, TX):

```typescript
const TEST_FIXTURES = [
  {
    label: 'Residential — Belton',
    propertyId: 'R12345',
    address: '123 Main St, Belton, TX 76513',
    county: 'Bell',
    state: 'TX',
    lat: 31.0561,
    lon: -97.4642,
    ownerName: '',
    subdivisionName: '',
  },
  // Additional fixtures will be populated with real Bell County data
  // during implementation after verifying which property IDs return
  // good test data from the CAD and GIS APIs.
];
```

> Fixtures will be validated against live APIs during implementation to ensure
> they return meaningful results for each scraper.

---

## 9. CSS Strategy

- **New file:** `app/admin/styles/TestingLab.css`
- **Naming convention:** BEM, prefixed with `testing-lab__` to avoid collisions
- **Color palette:** Same admin theme variables already in use
- **Key classes:**

```css
.testing-lab                      /* page wrapper */
.testing-lab__header              /* page title + description */
.testing-lab__tabs                /* tab bar */
.testing-lab__tab                 /* individual tab button */
.testing-lab__tab--active         /* active tab */
.testing-lab__context-bar         /* PropertyContextBar wrapper */
.testing-lab__grid                /* card grid (CSS grid, 1-2 columns) */

.test-card                        /* individual test card */
.test-card--idle                  /* default state */
.test-card--running               /* spinning state */
.test-card--success               /* green border */
.test-card--error                 /* red border */
.test-card__header                /* card title row */
.test-card__badges                /* browser/api-key/runtime badges */
.test-card__body                  /* card content */
.test-card__actions               /* Run/Clear buttons */
.test-card__output                /* collapsible output section */
.test-card__logs                  /* collapsible log section */

.output-viewer                    /* JSON tree + screenshots */
.output-viewer__json              /* formatted JSON */
.output-viewer__screenshots       /* screenshot thumbnails */
.output-viewer__error             /* error display */

.log-stream                       /* scrollable log container */
.log-stream__entry                /* single log line */
.log-stream__timestamp            /* timestamp portion */
.log-stream__message              /* message portion */
.log-stream__level--info          /* blue */
.log-stream__level--warn          /* yellow */
.log-stream__level--error         /* red */
```

---

## 10. Implementation Order

### Step 1: Infrastructure (no UI changes to production)
1. Create `app/admin/research/testing/layout.tsx` with admin guard
2. Create `app/api/admin/research/testing/run/route.ts` (proxy route)
3. Create `app/admin/styles/TestingLab.css`

### Step 2: Core Components
4. Build `PropertyContextBar.tsx` with context provider
5. Build `TestCard.tsx` (reusable)
6. Build `OutputViewer.tsx` (JSON tree + screenshots)
7. Build `LogStream.tsx` (real-time log display)

### Step 3: Tab Content
8. Build `ScrapersTab.tsx` — 10 scraper cards
9. Build `AnalyzersTab.tsx` — 8 analyzer cards
10. Build `PhasesTab.tsx` — 9 pipeline phase cards
11. Build `FullPipelineTab.tsx` — full pipeline with phase selection
12. Build `HealthCheckTab.tsx` — worker/site health
13. Build `LogViewerTab.tsx` — aggregated log viewer

### Step 4: Main Page
14. Build `app/admin/research/testing/page.tsx` — tab navigation + all tabs

### Step 5: Validation
15. Verify production UI (`/admin/research`) is completely unchanged
16. Test each scraper card individually
17. Test full pipeline from Testing Lab
18. Verify admin-only access guard

---

## 11. What Does NOT Change

- `app/admin/research/page.tsx` — **no changes**
- `app/admin/research/[projectId]/page.tsx` — **no changes**
- `app/admin/research/[projectId]/boundary/page.tsx` — **no changes**
- `app/admin/research/[projectId]/documents/page.tsx` — **no changes**
- `app/admin/research/pipeline/page.tsx` — **no changes**
- `app/admin/research/billing/page.tsx` — **no changes**
- `app/admin/research/library/page.tsx` — **no changes**
- `app/admin/research/components/*` — **no changes** (only imported, never modified)
- `app/admin/styles/AdminResearch.css` — **no changes**
- All existing API routes — **no changes**
- Worker code — **no changes**

---

## 12. Security

- Testing Lab is **admin-only** (enforced in `layout.tsx` via session check)
- API proxy route checks `session.user.role === 'admin'`
- Worker auth via existing `WORKER_API_KEY` Bearer token
- No new secrets or environment variables required
- No changes to existing auth or permissions

---

## 13. Summary

| Aspect | Production UI | Testing Lab |
|--------|--------------|-------------|
| **URL** | `/admin/research` | `/admin/research/testing` |
| **Access** | Admin | Admin |
| **Pipeline** | All-in-one, guided workflow | Individual modules + full pipeline option |
| **Inputs** | Per-project (address, owner, etc.) | Shared context bar + per-card overrides |
| **Output** | Integrated into project views | Per-card JSON/screenshot/log viewers |
| **Logs** | Pipeline progress panel | Per-card + aggregated log viewer |
| **Existing code** | Unchanged | Reuses components, adds new ones |
| **Worker** | Unchanged | Uses existing endpoints via new proxy route |
