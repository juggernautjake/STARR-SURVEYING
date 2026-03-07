# STARR RECON — Phase 6: TxDOT ROW & Public Infrastructure Integration

**Product:** Starr Compass — AI Property Research (STARR RECON)
**Version:** 1.4 | **Last Updated:** March 2026
**Phase Duration:** Weeks 16–18
**Depends On:** Phase 1 (`PropertyIdentity` with coordinates), Phase 3 (`property_intelligence.json` with road list), Phase 4 (`subdivision.json` with road dedications)
**Status:** ✅ COMPLETE v1.4 (March 2026) — All 6 new service files built, `txdot-row.ts` updated, routes added to `index.ts`, `row.sh` CLI script created, **65 unit tests pass**. v1.4 changes: `AbortSignal.timeout(30_000)` added to all AI fetch calls in `road-boundary-resolver.ts` and `txdot-rpam-client.ts` (spec §6.11 requirement); dead `export { path }` removed from `texas-digital-archive-client.ts`; indentation bug fixed in `row-integration-engine.ts`; `runROWIntegration()` now validates empty `projectId` (throws with clear message); 25 additional unit tests added (tests 36–60) covering: acceptance-criteria road classifier paths (`Kent Oakley Rd`, `SL`, `CO RD`, `Loop`), additional county defaults (McLennan, Bexar), orchestrator no-roads path, error-handling (missing file, empty projectId), and resolver no-API-key fallback. See §Known Limitations for items requiring live testing.
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

For every road that borders or passes through the subject property, pull right-of-way data from TxDOT (for state-maintained roads) and apply county-standard assumptions (for county roads). Retrieve ROW width, centerline geometry, acquisition history, and road boundary calls. Resolve the recurring problem of **deed-says-straight vs plat-says-curved** road boundaries by obtaining authoritative ROW geometry.

**Deliverable:** A `ROWIntegrationEngine` orchestrator class (and supporting service classes) that takes Phase 3 output, queries TxDOT ArcGIS and optionally the RPAM viewer, and returns a `ROWReport` saved as `row_data.json` with authoritative road boundary data for every bordering road.

---

## Table of Contents

1. [What This Phase Must Accomplish](#1-what-this-phase-must-accomplish)
2. [Current State of the Codebase](#2-current-state-of-the-codebase)
3. [Architecture Overview](#3-architecture-overview)
4. [ROWReport Data Model](#4-rowreport-data-model)
5. [§6.3 Road Classifier](#53-road-classifier)
6. [§6.4 Coordinate Transformation — ALREADY BUILT](#54-coordinate-transformation--already-built)
7. [§6.5 TxDOT ArcGIS REST Client — UPDATE EXISTING](#55-txdot-arcgis-rest-client--update-existing)
8. [§6.6 TxDOT RPAM Playwright Fallback](#56-txdot-rpam-playwright-fallback)
9. [§6.7 Texas Digital Archive Client](#57-texas-digital-archive-client)
10. [§6.8 Road Boundary Conflict Resolver](#58-road-boundary-conflict-resolver)
11. [§6.9 County Road Default ROW Widths](#59-county-road-default-row-widths)
12. [§6.10 ROW Integration Engine Orchestrator](#510-row-integration-engine-orchestrator)
13. [§6.11 Express API & CLI](#511-express-api--cli)
14. [File Map](#14-file-map)
15. [Acceptance Criteria](#15-acceptance-criteria)

---

## 1. What This Phase Must Accomplish

Phase 3 identified roads bordering the property (e.g., FM 436, Spur 436, County Road 234) in `property_intelligence.json`. Phase 6 queries TxDOT's public data systems and applies county-standard assumptions to return authoritative boundary geometry.

```bash
curl -X POST http://localhost:3100/research/row \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "intelligencePath": "/tmp/analysis/ash-trust-001/property_intelligence.json"
  }'
```

Returns HTTP 202 immediately. Poll for results:

```bash
curl http://localhost:3100/research/row/ash-trust-001 \
  -H "Authorization: Bearer $WORKER_API_KEY"
```

Result is saved to `/tmp/analysis/{projectId}/row_data.json` (canonical Phase 6 output name per master roadmap §16).

```json
{
  "status": "complete",
  "roads": [
    {
      "name": "FM 436",
      "txdotDesignation": "FM 0436",
      "type": "farm_to_market",
      "maintainedBy": "txdot",
      "district": "Waco",
      "controlSection": "0436-01",
      "rowData": {
        "source": "txdot_arcgis",
        "rowWidth": 80,
        "rowWidthUnit": "feet",
        "centerlineGeometry": {
          "type": "LineString",
          "coordinates": [
            [-97.482, 31.065],
            [-97.481, 31.064],
            [-97.480, 31.063]
          ]
        },
        "rowBoundaryGeometry": {
          "type": "Polygon",
          "coordinates": ["...GeoJSON polygon of ROW boundary..."]
        },
        "boundaryType": "curved",
        "curves": [
          {
            "radius": 2865.0,
            "arcLength": 520.0,
            "direction": "right",
            "startStation": "42+00",
            "endStation": "47+20"
          }
        ],
        "acquisitionHistory": [
          {
            "csj": "0436-01-123",
            "date": "1952-06-15",
            "type": "original_acquisition",
            "width": 60,
            "instrument": "Vol 234, Pg 567"
          },
          {
            "csj": "0436-01-456",
            "date": "1998-03-20",
            "type": "widening",
            "width": 80,
            "instrument": "199803456"
          }
        ]
      },
      "propertyBoundaryResolution": {
        "deedDescription": "Three straight line segments along FM 436",
        "platDescription": "Curved boundary along FM 436 with R=2865, curves",
        "txdotConfirms": "curved",
        "explanation": "TxDOT ROW centerline shows curves through this segment (R≈2865'). The 1971 deed predates the 1998 road widening. The 2020 plat correctly shows curves matching the current ROW geometry.",
        "confidence": 95,
        "recommendation": "Use plat curves, not deed straight lines, for FM 436 boundary"
      },
      "rpamScreenshot": "/tmp/harvested/ash-trust-001/txdot/rpam_fm436.png"
    },
    {
      "name": "CR 234",
      "type": "county_road",
      "maintainedBy": "county",
      "rowData": {
        "source": "county_defaults",
        "rowWidth": 60,
        "rowWidthUnit": "feet",
        "boundaryType": "straight",
        "notes": "Typical Bell County road ROW — 60' total (30' each side of centerline)"
      },
      "propertyBoundaryResolution": null
    }
  ],
  "resolvedDiscrepancies": [
    {
      "discrepancyId": "DISC-002",
      "originalDescription": "FM 436 boundary: deed shows straight lines, plat shows curves",
      "resolution": "TxDOT ArcGIS confirms curved ROW boundary. Plat is correct.",
      "newConfidence": 95,
      "previousConfidence": 45
    }
  ],
  "timing": { "totalMs": 65000 },
  "sources": [
    { "name": "TxDOT ArcGIS REST API", "success": true },
    { "name": "TxDOT RPAM Map Viewer", "success": true },
    { "name": "Texas Digital Archive", "success": false, "reason": "No digitized records for FM 436 in Bell County" }
  ],
  "errors": []
}
```

---

## 2. Current State of the Codebase

### Phases 1–5 — Status

| Phase | Key Files | Status |
|-------|-----------|--------|
| 1 — Discovery | `discovery-engine.ts`, `property-discovery.ts`, `bis-adapter.ts`, `trueautomation-adapter.ts`, `tyler-adapter.ts`, `generic-cad-adapter.ts`, `cad-registry.ts` | ✅ Complete |
| 2 — Harvest | `document-harvester.ts`, `kofile-clerk-adapter.ts`, `texasfile-adapter.ts`, `clerk-adapter.ts`, `document-intelligence.ts` | 🟠 In Progress — `clerk-registry.ts` missing |
| 3 — Extraction | `ai-extraction.ts`, `adaptive-vision.ts`, `geo-reconcile.ts`, `property-validation-pipeline.ts` (foundation only) | 🟠 In Progress — orchestrator layer (`ai-document-analyzer.ts`) not yet built |
| 4 — Subdivision | `subdivision-intelligence.ts`, `subdivision-classifier.ts`, `lot-enumerator.ts`, `interior-line-analyzer.ts`, `area-reconciliation.ts`, `adjacency-builder.ts` | ✅ Complete |
| 5 — Adjacent | `adjacent-research.ts` (foundation), `adjacency-builder.ts` (foundation) | 🟠 In Progress — 4 orchestrator files missing |

### Phase 6 — PARTIALLY BUILT

#### What Already Exists and Must NOT Be Rewritten

**File 1: `worker/src/services/txdot-row.ts`**

This file contains a **working foundation** for Phase 6 that must be preserved and extended — not replaced. The following are fully implemented:

| Export | Description | Status |
|--------|-------------|--------|
| `TxDOTRowFeatureProperties` | ArcGIS feature attribute interface (CSJ, HWY, ROW_WIDTH, ACQUISITION_DATE, DEED_REF, DISTRICT, HWY_TYPE) | Done |
| `TxDOTRowFeature` | GeoJSON Feature wrapper with Polygon or MultiPolygon geometry | Done |
| `TxDOTRoadSummary` | Per-road summary (name, hwyType, csjNumbers, estimatedRowWidth_ft, district, acquisitionDates, deedReferences, hasCenterlineGeometry) | Done |
| `TxDOTRowResult` | Full result container (queried, features[], roads[], foundROW, queryMethod, errorMessage) | Done |
| `classifyRoad(roadName)` | Returns TxDOT prefix type ('FM', 'SH', etc.) or `null`. **Basic implementation** — checks only exact prefix match (e.g., `"FM 436"` → `"FM"`). Used by Phase 6 and Phase 5 "roads excluded from adjacent queue" logic. | Done — extend in Phase 6 |
| `getTxDOTRoads(roadNames[])` | Filters array to TxDOT-maintained roads only | Done |
| `queryTxDOTRow(bounds, logger)` | Main export. Calls ArcGIS REST API; RPAM fallback stub returns empty result with `queryMethod: 'arcgis_rest'` even when no data found. | Partial — RPAM not implemented |
| `buildBoundsFromCenter(lat, lon, bufferDeg)` | Builds WGS84 bbox from lat/lon center + degree buffer | Done |
| ArcGIS URL | `https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_ROW/FeatureServer/0` | Done — may need validation |

**Critical Note for Phase 6 implementers:** The `queryMethod` field in `TxDOTRowResult` already declares `'playwright_fallback'` as a valid value — this was reserved for Phase 6. The current implementation always returns `queryMethod: 'arcgis_rest'` even when falling back. Phase 6 must implement the real Playwright RPAM fallback and set this field correctly.

**File 2: `worker/src/lib/coordinates.ts`** — **COMPLETE — DO NOT MODIFY**

Full Lambert Conformal Conic implementation for NAD83 Texas Central State Plane ↔ WGS84. The new Phase 6 services described in §6.4 of the original design spec (which called for `proj4js`) are **not needed** — this native implementation already provides equivalent functionality at better accuracy.

| Export | Description | Status |
|--------|-------------|--------|
| `nad83TexasCentralToWGS84(easting_ft, northing_ft)` | State plane (US survey feet) → WGS84 lat/lon | Done |
| `wgs84ToNad83TexasCentral(lat, lon)` | WGS84 → state plane | Done |
| `buildWGS84BoundsFromNAD83(easting_ft, northing_ft, buffer_ft)` | Bbox from state plane center, buffer in feet | Done |
| `buildWGS84BoundsFromLatLon(lat, lon, buffer_ft)` | Bbox from lat/lon center, buffer in feet | Done |

**File 3: `worker/src/types/index.ts`** — Has relevant types (do not duplicate)

| Type/Constant | Description | Relevant to Phase 6 |
|---|---|---|
| `BoundaryCall` | Full typed boundary call with curve support | Used to identify road boundary calls |
| `STORAGE_PATHS.txdotScreenshot(projectId)` | Storage path for RPAM screenshots | Use for Supabase upload |
| `STORAGE_PATHS.txdotRowMap(projectId)` | Storage path for ROW map PDFs | Use for Supabase upload |
| `STORAGE_PATHS.txdotGeoJSON(projectId)` | Storage path for ROW parcel GeoJSON | Use for Supabase upload |

**File 4: `worker/src/services/property-validation-pipeline.ts`** — Has `RoadInfo` type used by Phase 3 output

```typescript
export interface RoadInfo {
  name: string;
  type: 'state_highway' | 'farm_to_market' | 'county_road' | 'private' | 'unknown';
  txdotClassification: string | null;
  estimatedRowWidth_ft: number | null;
  notes: string | null;
}
```

The Phase 3 `property_intelligence.json` file contains a `roads: RoadInfo[]` array. Phase 6 reads this array as input. Import `RoadInfo` from this file — do not duplicate the type.

#### What Is Missing — New Service Files to Create

| New File | Class(es) / Exports | Status |
|----------|---------------------|--------|
| `worker/src/services/road-classifier.ts` | `ClassifiedRoad`, `RoadType`, `classifyRoadEnhanced(rawName)`, `TXDOT_PREFIXES_MAP` | ✅ COMPLETE |
| `worker/src/services/txdot-rpam-client.ts` | `TxDOTRPAMClient`, `RPAMResult` | ✅ COMPLETE (Playwright impl; needs live testing) |
| `worker/src/services/texas-digital-archive-client.ts` | `TexasDigitalArchiveClient`, `DigitalArchiveResult`, `ArchiveRecord` | ✅ COMPLETE (Playwright impl; TDA URL may need verification) |
| `worker/src/services/road-boundary-resolver.ts` | `RoadBoundaryResolver`, `RoadBoundaryResolution` | ✅ COMPLETE |
| `worker/src/services/county-road-defaults.ts` | `CountyROWDefaults`, `getCountyROWDefaults(countyName)`, `COUNTY_ROW_DEFAULTS` | ✅ COMPLETE (17 counties + state default) |
| `worker/src/services/row-integration-engine.ts` | `ROWIntegrationEngine`, `ROWReport`, `ROWRoadResult`, `ROWAcquisitionRecord`, `runROWIntegration()` | ✅ COMPLETE |

#### What Is Partially Built and Must Be Extended

| File | What Must Change | Status |
|------|-----------------|--------|
| `worker/src/services/txdot-row.ts` | Add centerline query (`queryTxDOTCenterlines()`), update `classifyRoad()` to delegate to `road-classifier.ts`, fix `queryMethod` flag, add `TxDOTCenterlineFeature` types | ✅ COMPLETE |
| `worker/src/index.ts` | Add `POST /research/row`, `GET /research/row/:projectId`. Add `ROWIntegrationEngine` import. Add Phase 6 to startup log. | ✅ COMPLETE |
| `worker/row.sh` | CLI script for Phase 6 | ✅ COMPLETE |

#### Known Limitations (requiring more information or live testing)

- **TxDOT ArcGIS URL**: `TXDOT_ROW_FEATURE_SERVER` and `TXDOT_CENTERLINE_FEATURE_SERVER` constants must be verified. TxDOT occasionally moves their ArcGIS services. If the URL is wrong, the engine logs a clear error message with the service name.
- **RPAM Playwright**: Requires `npx playwright install chromium` on the droplet. The RPAM web app structure may change; layer panel selectors (`button[aria-label="Layers"]`) need verification against the live RPAM viewer.
- **Texas Digital Archive**: The TDA URL (`tsl.access.preservica.com`) needs verification. Many rural Bell County roads have no digitized records — empty results are expected and normal.
- **Deed/plat BoundaryCall extraction**: `ROWIntegrationEngine.processRoad()` passes empty `deedCalls[]` and `platCalls[]` to `RoadBoundaryResolver.resolve()` because the full Phase 3 `BoundaryCall[]` arrays are not threaded through. A future enhancement should pass them from `property_intelligence.json`.
- **PDF download from TDA**: When a ROW map PDF is found in TDA, the download URL is noted but the actual PDF is not downloaded. Implement with Phase 7 if needed.

#### v1.3 Changes (March 2026)

- **PipelineLogger in index.ts**: `POST /research/row` now uses real `PipelineLogger` (dynamic import, same pattern as adjacent/analyze routes) instead of a bare `console.log` wrapper. This aligns with spec §6.11 implementation rule: "All Phase 6 service code: use PipelineLogger — no bare console.log".
- **Error detail in failed response**: `GET /research/row/:projectId` now returns `errors[]` array when status is `failed`, making it easier to diagnose failures without checking PM2 logs.
- **`BoundaryCall.callId` optional field**: Added `callId?: string` to `BoundaryCall` in `worker/src/types/index.ts`. Used by Phase 7 `reading-aggregator.ts` for cross-source call matching. When present, used as the call identifier; when absent, falls back to `call_${sequence}`.
- **`county_road_default` source in ReadingAggregator**: `worker/src/services/reading-aggregator.ts` now generates `county_road_default` readings for county-maintained roads from Phase 6 ROW report (when `maintainedBy === 'county'` and `rowData.rowWidth` is set). This closes a gap in the Phase 7 data flow.
- **`ROWReportInput.maintainedBy`**: Added `maintainedBy` field to `ROWReportInput` interface in `reading-aggregator.ts` so Phase 7 can distinguish TxDOT vs county roads from the Phase 6 output.

#### v1.4 Changes (March 2026)

- **`AbortSignal.timeout(30_000)` on all AI HTTP calls**: Added 30-second timeout to the `fetch()` call in `road-boundary-resolver.ts` (`runAIResolution`) and `txdot-rpam-client.ts` (`aiAnalyzeRPAM`). This was a spec §6.11 requirement ("All external HTTP requests use `AbortSignal.timeout(30000)`") that was previously unimplemented, which could cause the worker to hang indefinitely if the Anthropic API was slow or unresponsive.
- **Removed dead `export { path }` from `texas-digital-archive-client.ts`**: The bottom of the file was exporting Node's `path` module. This export was never used by any consumer (row-integration-engine.ts imports `path` directly) and could confuse developers.
- **Fixed indentation bug in `row-integration-engine.ts`**: Lines 407-410 (`buildROWDataFromFeatures` call inside `processRoad`) had incorrect 4-space indentation instead of 8 spaces. No runtime impact, but fixed for code clarity.
- **Empty `projectId` validation in `runROWIntegration()`**: The standalone `runROWIntegration()` function now throws `Error('runROWIntegration: projectId must be a non-empty string')` when called with an empty string. The API route (`index.ts`) already validated this via regex, but the underlying function had no guard.
- **25 additional unit tests (tests 36–60)**: Extended `__tests__/recon/phase6-row.test.ts` from 40 to 65 tests. New coverage: acceptance-criteria road names (`Kent Oakley Rd → city_street`, `SL 340 → spur`, `CO RD 45 → county_road`, `Loop 121 → LP`), additional county defaults (McLennan, Bexar, empty string), `getTxDOTRoads` edge cases, `buildBoundsFromCenter` edge cases (zero buffer, ordering), `analyzeTxDOTGeometry` edge cases (2-vertex path, 2° boundary), `resolve()` no-API-key fallback, `analyze()` no-roads path, `runROWIntegration()` error handling (missing file, empty projectId), and `ROWDataSource` shape.

---

## 3. Architecture Overview

```
INPUT: property_intelligence.json (Phase 3 output)
       → reads: intelligence.roads[] (RoadInfo[])
       → reads: intelligence.pointOfBeginning.northing/easting (NAD83 state plane)
       → reads: intelligence.discrepancies[] (for road-related conflict IDs)
  │
  ├── STEP 1: ROAD CLASSIFICATION (road-classifier.ts)
  │   ├── FM/RM/SH/US/IH/SL/BS/SPUR/PR/RE → TxDOT maintained
  │   ├── CR / "County Road" → County maintained
  │   ├── Named street (Oak Dr, Main St) → City or private
  │   └── Unnamed → Likely private or internal
  │
  ├── STEP 2: COORDINATE CONVERSION (coordinates.ts — ALREADY BUILT)
  │   ├── Input: NAD83 Texas Central Zone (US Survey Feet)
  │   ├── Use: buildWGS84BoundsFromNAD83() or buildWGS84BoundsFromLatLon()
  │   └── Output: WGS84 lat/lon for TxDOT API queries
  │
  ├── STEP 3: TxDOT ArcGIS REST API (txdot-row.ts — UPDATE EXISTING)
  │   ├── ROW FeatureServer by geometry (property bounding box)
  │   ├── Centerline FeatureServer (new — add to txdot-row.ts)
  │   ├── Extract: ROW parcels, centerline, width, CSJ numbers
  │   ├── Parse GeoJSON response
  │   └── Match features to identified roads
  │
  ├── STEP 4: TxDOT RPAM Viewer — Playwright Fallback (txdot-rpam-client.ts — NEW)
  │   ├── Only if ArcGIS returns insufficient detail
  │   ├── Navigate to property location in RPAM
  │   ├── Activate ROW map layers
  │   ├── Screenshot the ROW overlay
  │   └── AI analysis: width, curved/straight, monuments
  │
  ├── STEP 5: Texas Digital Archive (texas-digital-archive-client.ts — NEW)
  │   ├── Search for ROW maps by highway and county
  │   ├── Download scanned historical ROW plans
  │   ├── AI extract acquisition dates, widths, monuments
  │   └── Build ROW acquisition timeline
  │
  ├── STEP 6: COUNTY ROAD RESOLUTION (county-road-defaults.ts — NEW)
  │   ├── Standard Texas county ROW assumptions (40–60')
  │   ├── County-specific overrides (Bell, Travis, Williamson)
  │   └── Source note cites Texas Transportation Code §251.003
  │
  └── STEP 7: ROAD BOUNDARY CONFLICT RESOLUTION (road-boundary-resolver.ts — NEW)
      ├── Compare deed road calls vs plat road calls vs TxDOT geometry
      ├── AI determines: straight or curved?
      ├── Explain WHY sources differ (widening, re-survey, datum shift)
      ├── Update confidence scores on road-boundary discrepancies
      └── Generate resolution recommendation

OUTPUT: row_data.json (ROWReport)
        → consumed by Phase 7 geometric reconciliation
        → resolves road-related entries in discrepancies[]
```

---

## 4. ROWReport Data Model

```typescript
// worker/src/services/row-integration-engine.ts

export interface ROWReport {
  status: 'complete' | 'partial' | 'failed';
  roads: ROWRoadResult[];
  resolvedDiscrepancies: ROWDiscrepancyResolution[];
  timing: { totalMs: number };
  sources: ROWDataSource[];
  errors: string[];
}

export interface ROWRoadResult {
  /** Road name as extracted from property_intelligence.json (e.g., "FM 436") */
  name: string;
  /** Padded TxDOT designation (e.g., "FM 0436") or null if not TxDOT */
  txdotDesignation: string | null;
  type: RoadType;                              // from road-classifier.ts
  maintainedBy: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
  district: string | null;
  controlSection: string | null;               // TxDOT CSJ (e.g., "0436-01")
  rowData: ROWData | null;
  propertyBoundaryResolution: RoadBoundaryResolution | null;  // from road-boundary-resolver.ts
  /** Local path to RPAM screenshot (in /tmp/harvested/{projectId}/txdot/) */
  rpamScreenshot: string | null;
  /** Local path to downloaded ROW map PDF, if found */
  rowMapPdf: string | null;
}

export interface ROWData {
  source: 'txdot_arcgis' | 'txdot_rpam' | 'county_records' | 'county_defaults' | 'deed_only';
  rowWidth: number | null;
  rowWidthUnit: 'feet' | 'meters';
  /** GeoJSON LineString of road centerline */
  centerlineGeometry: GeoJSONGeometry | null;
  /** GeoJSON Polygon of full ROW boundary */
  rowBoundaryGeometry: GeoJSONGeometry | null;
  boundaryType: 'straight' | 'curved' | 'mixed' | 'unknown';
  curves: ROWCurve[];
  acquisitionHistory: ROWAcquisitionRecord[];
  notes: string | null;
}

export interface ROWCurve {
  radius: number;        // feet
  arcLength: number;     // feet
  direction: 'left' | 'right';
  startStation?: string; // e.g., "42+00"
  endStation?: string;
}

export interface ROWAcquisitionRecord {
  csj: string;
  date: string | null;
  type: 'original_acquisition' | 'widening' | 'easement' | 'other';
  width: number | null;
  instrument: string | null;  // deed reference, Vol/Pg or instrument number
}

export interface ROWDiscrepancyResolution {
  discrepancyId: string;
  originalDescription: string;
  resolution: string;
  newConfidence: number;
  previousConfidence: number;
}

export interface ROWDataSource {
  name: string;
  success: boolean;
  reason?: string;
}

// Minimal GeoJSON type (avoid external dependency)
export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };
```

---

## 5. §6.3 Road Classifier

**New file: `worker/src/services/road-classifier.ts`**

The enhanced road classifier replaces the basic prefix-check in `txdot-row.ts`. It adds: padded TxDOT route numbers (required for API queries), route number extraction, full county road matching, and named street detection.

```typescript
// worker/src/services/road-classifier.ts
//
// Enhanced road classifier for Phase 6.
// The basic classifyRoad() in txdot-row.ts checks only exact prefix match.
// This version adds: padded route numbers, routeNumber extraction, county road matching.
//
// After Phase 6 is implemented, txdot-row.ts should import ClassifiedRoad from here
// and provide a thin backward-compat wrapper for its existing classifyRoad() export.

export interface ClassifiedRoad {
  name: string;
  displayName: string;
  /** Padded TxDOT designation for API queries (e.g., "FM 0436", "SH 0190") */
  txdotDesignation?: string;
  type: RoadType;
  maintainedBy: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
  queryStrategy: 'txdot_api' | 'county_records' | 'deed_only' | 'skip';
  highwaySystem?: string;    // "FM", "SH", "US", "IH", etc.
  routeNumber?: string;      // "436", "190", "35", etc. (unpadded)
}

export type RoadType =
  | 'farm_to_market' | 'ranch_to_market' | 'state_highway' | 'us_highway'
  | 'interstate' | 'spur' | 'loop' | 'business' | 'park_road'
  | 'recreational_road' | 'county_road' | 'city_street' | 'private_road'
  | 'unknown';

/**
 * TXDOT_PREFIXES_MAP — maps every TxDOT highway prefix to its canonical system
 * code, road type, and the zero-padding width used in TxDOT database queries.
 *
 * Exported so txdot-row.ts can use it for the TXDOT_PREFIXES constant.
 */
export const TXDOT_PREFIXES_MAP: Record<string, {
  type: RoadType;
  system: string;
  padWidth: number;
}> = {
  'FM':   { type: 'farm_to_market',    system: 'FM',   padWidth: 4 },
  'RM':   { type: 'ranch_to_market',   system: 'RM',   padWidth: 4 },
  'SH':   { type: 'state_highway',     system: 'SH',   padWidth: 4 },
  'US':   { type: 'us_highway',        system: 'US',   padWidth: 4 },
  'IH':   { type: 'interstate',        system: 'IH',   padWidth: 3 },
  'I':    { type: 'interstate',        system: 'IH',   padWidth: 3 },
  'SPUR': { type: 'spur',              system: 'SP',   padWidth: 4 },
  'SP':   { type: 'spur',              system: 'SP',   padWidth: 4 },
  'LOOP': { type: 'loop',              system: 'LP',   padWidth: 4 },
  'LP':   { type: 'loop',              system: 'LP',   padWidth: 4 },
  'BUS':  { type: 'business',          system: 'BS',   padWidth: 4 },
  'BS':   { type: 'business',          system: 'BS',   padWidth: 4 },
  'SL':   { type: 'spur',              system: 'SL',   padWidth: 4 },
  'PR':   { type: 'park_road',         system: 'PR',   padWidth: 4 },
  'RE':   { type: 'recreational_road', system: 'RE',   padWidth: 4 },
};

const COUNTY_PREFIXES = ['CR', 'COUNTY ROAD', 'COUNTY RD', 'CO RD', 'CO. RD'];

const STREET_SUFFIXES = [
  'DR', 'DRIVE', 'ST', 'STREET', 'AVE', 'AVENUE', 'BLVD', 'BOULEVARD',
  'LN', 'LANE', 'CT', 'COURT', 'WAY', 'TRL', 'TRAIL', 'RD', 'ROAD',
  'PKWY', 'PARKWAY', 'CIR', 'CIRCLE', 'PL', 'PLACE', 'TERRACE', 'TER',
];

/**
 * Classify a road name into its type, maintainer, and TxDOT designation.
 *
 * This is the enhanced version for Phase 6. txdot-row.ts should continue to
 * export its own `classifyRoad()` for backward compatibility with Phase 5,
 * but should internally delegate to this function after Phase 6 is built.
 *
 * Examples:
 *   "FM 436"         → type: 'farm_to_market', txdotDesignation: 'FM 0436'
 *   "SH 195"         → type: 'state_highway',  txdotDesignation: 'SH 0195'
 *   "Spur 436"       → type: 'spur',            txdotDesignation: 'SP 0436'
 *   "CR 234"         → type: 'county_road'
 *   "County Road 45" → type: 'county_road'
 *   "Oak Drive"      → type: 'city_street'
 */
export function classifyRoadEnhanced(rawName: string): ClassifiedRoad {
  const upper = rawName.toUpperCase().trim();

  // --- TxDOT highway prefixes ---
  for (const [prefix, info] of Object.entries(TXDOT_PREFIXES_MAP)) {
    // Match "PREFIX NNN" or "PREFIX-NNN" or "PREFIXNNN"
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}[\\s\\-]*(\\d+[A-Z]?)`, 'i');
    const match = upper.match(pattern);
    if (match) {
      const routeNum = match[1];
      const paddedNum = routeNum.padStart(info.padWidth, '0');
      return {
        name: rawName,
        displayName: `${info.system} ${routeNum}`,
        txdotDesignation: `${info.system} ${paddedNum}`,
        type: info.type,
        maintainedBy: 'txdot',
        queryStrategy: 'txdot_api',
        highwaySystem: info.system,
        routeNumber: routeNum,
      };
    }
  }

  // --- County road prefixes ---
  for (const prefix of COUNTY_PREFIXES) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}[\\s]*(\\d+[A-Z]?)`, 'i');
    const match = upper.match(pattern);
    if (match) {
      return {
        name: rawName,
        displayName: `CR ${match[1]}`,
        type: 'county_road',
        maintainedBy: 'county',
        queryStrategy: 'county_records',
        routeNumber: match[1],
      };
    }
  }

  // --- Named city/subdivision streets ---
  for (const suffix of STREET_SUFFIXES) {
    if (upper.endsWith(` ${suffix}`)) {
      return {
        name: rawName,
        displayName: rawName,
        type: 'city_street',
        maintainedBy: 'city',
        queryStrategy: 'deed_only',
      };
    }
  }

  // --- Private/unnamed ---
  if (/INTERNAL|PRIVATE|ACCESS ROAD|UNNAMED/i.test(upper)) {
    return {
      name: rawName,
      displayName: rawName,
      type: 'private_road',
      maintainedBy: 'private',
      queryStrategy: 'deed_only',
    };
  }

  return {
    name: rawName,
    displayName: rawName,
    type: 'unknown',
    maintainedBy: 'unknown',
    queryStrategy: 'deed_only',
  };
}
```

---

## 6. §6.4 Coordinate Transformation — ALREADY BUILT

> **DO NOT create `src/services/coordinate-transform.ts`.**
> The original Phase 6 design spec described using `proj4js` for coordinate transformation. This is not needed. `worker/src/lib/coordinates.ts` already provides a complete, dependency-free Lambert Conformal Conic implementation with higher accuracy than `proj4js` for Texas Central Zone.

**In Phase 6 service files, use these imports instead of proj4:**

```typescript
// Correct — use existing native implementation
import {
  nad83TexasCentralToWGS84,
  wgs84ToNad83TexasCentral,
  buildWGS84BoundsFromNAD83,
  buildWGS84BoundsFromLatLon,
} from '../lib/coordinates.js';

// When you have NAD83 state plane coordinates from property_intelligence.json:
const bounds = buildWGS84BoundsFromNAD83(
  intelligence.pointOfBeginning.easting,    // US survey feet
  intelligence.pointOfBeginning.northing,   // US survey feet
  2000,                                     // 2000-foot buffer
);

// When you only have lat/lon (e.g., from geocoding):
const bounds = buildWGS84BoundsFromLatLon(lat, lon, 2000);
```

---

## 7. §6.5 TxDOT ArcGIS REST Client — UPDATE EXISTING

**File to MODIFY: `worker/src/services/txdot-row.ts`**

The existing file already implements ArcGIS querying for the ROW FeatureServer. Phase 6 must extend it with:

### 7.1 Add centerline FeatureServer support

Add a second ArcGIS endpoint for road centerlines — this provides the geometry needed to determine straight vs. curved road boundaries. **This constant does not exist yet in `txdot-row.ts`** — it must be added alongside the new `queryTxDOTCenterlines()` function.

```typescript
// Add to txdot-row.ts constants section (NEW — does not exist yet)

/**
 * TxDOT Roadway centerline FeatureServer (NEW constant for Phase 6).
 * Provides multi-vertex paths that reveal road curvature.
 * Attribute fields: RTE_NM, RDBD_TYPE_CD, NBR_LNS, SURF_WD, SHLD_WD_LT, SHLD_WD_RT
 *
 * Note: The existing TXDOT_ROW_FEATURE_SERVER constant covers ROW parcel polygons.
 * This constant is for the separate roadway centerline layer.
 */
const TXDOT_CENTERLINE_FEATURE_SERVER =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0';

export interface TxDOTCenterlineFeatureProperties {
  RTE_NM: string;
  RTE_ID?: string;
  RDBD_TYPE_CD?: string;
  NBR_LNS?: number;
  SURF_WD?: number;
  SHLD_WD_LT?: number;
  SHLD_WD_RT?: number;
  [key: string]: unknown;
}

export interface TxDOTCenterlineFeature {
  type: 'Feature';
  geometry: {
    type: 'MultiLineString' | 'LineString';
    coordinates: number[][][] | number[][];
  } | null;
  properties: TxDOTCenterlineFeatureProperties;
}

/**
 * Query the TxDOT roadway centerline FeatureServer.
 * Returns multi-vertex paths — more vertices = more curvature detail.
 */
export async function queryTxDOTCenterlines(
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  logger: PipelineLogger,
): Promise<TxDOTCenterlineFeature[]>;
```

### 7.2 Fix RPAM fallback flag

The current `queryTxDOTRow()` returns `queryMethod: 'arcgis_rest'` even when no features are found and it would logically fall back to RPAM. Phase 6 must:
1. Implement actual Playwright RPAM fallback by calling `TxDOTRPAMClient.navigateToLocation()` from `txdot-rpam-client.ts`
2. Return `queryMethod: 'playwright_fallback'` when Playwright is used
3. Return `queryMethod: 'none'` if both methods fail

### 7.3 Update classifyRoad() — preserve backward compatibility

```typescript
// In txdot-row.ts — update classifyRoad() to delegate to the enhanced version
// while preserving the return type that Phase 5 depends on

import { classifyRoadEnhanced, TXDOT_PREFIXES_MAP } from './road-classifier.js';

// Update TXDOT_PREFIXES to use canonical set from road-classifier
const TXDOT_PREFIXES = Object.keys(TXDOT_PREFIXES_MAP);

/**
 * Backward-compatible wrapper: returns the TxDOT highway type string
 * (same as before) or null for non-TxDOT roads.
 * Phase 6 code should use classifyRoadEnhanced() directly.
 */
export function classifyRoad(roadName: string): TxDOTRoadSummary['hwyType'] | null {
  const classified = classifyRoadEnhanced(roadName);
  if (classified.maintainedBy !== 'txdot') return null;
  return (classified.highwaySystem ?? 'Unknown') as TxDOTRoadSummary['hwyType'];
}
```

### 7.4 Verify ArcGIS service URL

The existing URL (`TxDOT_ROW/FeatureServer/0`) should be verified at runtime. TxDOT occasionally moves services. The implementation should log a clear error message when the service returns a non-FeatureCollection response, so the developer can update the URL.

---

## 8. §6.6 TxDOT RPAM Playwright Fallback

**New file: `worker/src/services/txdot-rpam-client.ts`**

Used when the ArcGIS REST API returns no features for a given location. Automates TxDOT's Real Property Asset Map (RPAM) web viewer to screenshot ROW layers, then uses Claude Vision AI to extract ROW width and boundary type.

```typescript
// worker/src/services/txdot-rpam-client.ts
//
// TxDOT RPAM (Real Property Asset Map) Playwright automation.
// Fallback for Phase 6 when the ArcGIS REST API returns no ROW features.
// Takes a screenshot of the RPAM viewer with ROW layers enabled,
// then uses Claude Vision AI to extract ROW width and boundary type.

import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import type { PipelineLogger } from '../lib/logger.js';

export interface RPAMResult {
  screenshotPath: string;
  rowMapsFound: boolean;
  rowWidth: number | undefined;
  curveIndicators: string[];
  monuments: string[];
  aiAnalysis: string;
}

export class TxDOTRPAMClient {
  private apiKey: string;
  private logger: PipelineLogger;

  constructor(logger: PipelineLogger) {
    this.apiKey = process.env.ANTHROPIC_API_KEY!;
    this.logger = logger;
  }

  /**
   * Navigate to the RPAM viewer at the given coordinates, enable ROW layers,
   * take a screenshot, and use AI to analyze the ROW boundary visibility.
   *
   * @param lat        WGS84 latitude
   * @param lon        WGS84 longitude
   * @param outputDir  Directory to save the screenshot (e.g., /tmp/harvested/{projectId}/txdot/)
   * @returns          RPAMResult with screenshot path and AI analysis
   */
  async navigateToLocation(lat: number, lon: number, outputDir: string): Promise<RPAMResult>;

  private async enableROWLayers(page: Page): Promise<void>;
  private async aiAnalyzeRPAM(screenshotPath: string): Promise<string>;
  private extractROWWidth(analysis: string): number | undefined;
  private extractCurveInfo(analysis: string): string[];
  private extractMonuments(analysis: string): string[];
}
```

### Implementation Notes

- **RPAM URL format:** `https://gis-txdot.opendata.arcgis.com/apps/RPAM/index.html?center={lon},{lat}&zoom=16`
- **Headless:** Always use `headless: true` in production
- **Wait strategy:** `waitUntil: 'networkidle'` then 5-second additional wait for map tiles
- **Layer activation:** Try clicking layer panel button (`button[aria-label="Layers"]`). Look for checkboxes matching `/ROW|right.of.way|parcel|centerline/i` and ensure they are checked
- **Zoom:** Press `+` key 3 times after layer activation to increase detail
- **Screenshot path:** Save to `${outputDir}/rpam_fm${routeNumber}.png` for named roads; `rpam_overview.png` for general overview
- **AI model:** `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'` — never hardcode
- **AI prompt focus:** Ask specifically about straight vs curved ROW boundaries (this is the critical question)
- **Failure handling:** If Playwright fails, log a warning and return `null` — do not throw
- **Resource cleanup:** Always `browser.close()` in a `finally` block

---

## 9. §6.7 Texas Digital Archive Client

**New file: `worker/src/services/texas-digital-archive-client.ts`**

Historical ROW plans from TxDOT are archived at the Texas State Library digital archive. Searching provides acquisition dates, original widths, and CSJ numbers that explain why road boundaries changed over time.

```typescript
// worker/src/services/texas-digital-archive-client.ts
//
// Texas State Library Digital Archive — TxDOT ROW records search.
// Provides historical ROW maps, acquisition records, and conveyance documents.
// Results may be sparse (many rural records not yet digitized).

import { chromium, type Browser, type Page } from 'playwright';
import type { PipelineLogger } from '../lib/logger.js';

export interface ArchiveRecord {
  title: string;
  controlNumber: string;   // CSJ or document control number
  district: string;
  highway: string;
  county: string;
  dateRange?: string;
  thumbnailUrl?: string;
  downloadUrl?: string;
  type: 'map' | 'conveyance' | 'title' | 'other';
}

export interface DigitalArchiveResult {
  recordsFound: number;
  records: ArchiveRecord[];
  searchUrl: string;
}

export class TexasDigitalArchiveClient {
  /**
   * Search the Texas State Library digital archive for TxDOT ROW records.
   *
   * @param highway   Highway name (e.g., "FM 436")
   * @param county    County name (e.g., "Bell")
   * @param district  TxDOT district (e.g., "Waco") — optional filter
   */
  async searchROWRecords(
    highway: string,
    county: string,
    district?: string,
    logger?: PipelineLogger,
  ): Promise<DigitalArchiveResult>;
}
```

### Implementation Notes

- **Archive URL:** `https://tsl.access.preservica.com/tda/reference-tools/txdot-row/`
- **Search fields to fill:** District selector, Highway input, County selector
- **Result parsing:** Look for `.search-result`, `.result-item`, `tr[data-id]`, `.asset-item`
- **Title parsing:** Detect type from title keywords: MAP/PLAN/SHEET → `'map'`, CONVEYANCE/DEED/EASEMENT → `'conveyance'`, TITLE → `'title'`
- **CSJ extraction:** Pattern `(\d{4}-\d{2}-\d{3})` in title or description
- **Failure tolerance:** Return `{ recordsFound: 0, records: [], searchUrl }` on any failure — do not throw
- **Expected results for Bell County:** Many roads have no digitized records. Empty results are normal.
- **Max wait:** 45-second timeout for initial page load; 5 seconds after search submission

---

## 10. §6.8 Road Boundary Conflict Resolver

**New file: `worker/src/services/road-boundary-resolver.ts`**

Uses Claude AI to resolve the common discrepancy where:
- The **deed** (often older) shows straight-line road boundaries
- The **plat** (often newer, surveyor-prepared) shows curved road boundaries
- **TxDOT geometry** provides the authoritative answer

This is the core value-add of Phase 6. Without it, a surveyor must manually compare deed, plat, and TxDOT data. The AI resolver does this automatically.

```typescript
// worker/src/services/road-boundary-resolver.ts
//
// AI-driven road boundary conflict resolution for Phase 6.
// Resolves "deed says straight, plat says curved" discrepancies using
// TxDOT ROW geometry as the authoritative tiebreaker.
//
// Imports from existing Phase 3 types — do not duplicate.

import type { BoundaryCall } from '../types/index.js';
import type { TxDOTRowFeature, TxDOTCenterlineFeature } from './txdot-row.js';
import type { RPAMResult } from './txdot-rpam-client.js';
import type { ClassifiedRoad } from './road-classifier.js';
import type { PipelineLogger } from '../lib/logger.js';

export interface RoadBoundaryResolution {
  roadName: string;
  deedDescription: string;
  platDescription: string;
  txdotConfirms: 'straight' | 'curved' | 'mixed' | 'unknown';
  explanation: string;
  confidence: number;
  recommendation: string;
  resolvedDiscrepancy?: {
    discrepancyId: string;
    previousConfidence: number;
    newConfidence: number;
  };
}

export class RoadBoundaryResolver {
  private logger: PipelineLogger;
  private apiKey: string;

  constructor(logger: PipelineLogger) {
    this.logger = logger;
    this.apiKey = process.env.ANTHROPIC_API_KEY!;
  }

  /**
   * Resolve whether a road boundary is straight or curved using all available evidence.
   *
   * @param road                  Classified road (from road-classifier.ts)
   * @param deedCalls             BoundaryCall[] from deed that runs along this road
   * @param platCalls             BoundaryCall[] from plat that runs along this road
   * @param rowFeatures           TxDOT ROW parcel features from ArcGIS
   * @param centerlineFeatures    TxDOT centerline features from ArcGIS
   * @param rpamResult            RPAM screenshot analysis result (or null)
   * @param existingDiscrepancies discrepancies[] from property_intelligence.json, used to link resolution
   */
  async resolve(
    road: ClassifiedRoad,
    deedCalls: BoundaryCall[],
    platCalls: BoundaryCall[],
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
    rpamResult: RPAMResult | null,
    existingDiscrepancies: Array<{ id: string; description: string; category?: string }>,
  ): Promise<RoadBoundaryResolution>;

  /**
   * Analyze TxDOT centerline geometry to detect curvature.
   * More than 2 vertices with >2° bearing change between segments = curved.
   */
  private analyzeTxDOTGeometry(
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
  ): 'straight' | 'curved' | 'mixed' | 'unknown';

  private detectCurvatureInPath(coords: number[][]): boolean;
  private computeBearing(from: number[], to: number[]): number;
}
```

### AI Prompt Strategy

The resolver uses Claude to interpret all evidence and explain the discrepancy in plain language. Key prompt elements:

1. Show deed calls summary (straight or curved? N calls total)
2. Show plat calls summary (straight or curved? N calls total)
3. Show TxDOT ArcGIS data (features found, CSJ, ROW width, geometry vertex count)
4. Show RPAM AI analysis (if available)
5. Ask: "Is FM 436 straight or curved here? Why do the sources disagree?"
6. Expect JSON response: `{ confirms: "straight"|"curved"|"mixed"|"unknown", explanation: "...", confidence: 0-100, recommendation: "..." }`

**AI model:** `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'`

**Discrepancy matching:** Match existing discrepancies from `intelligence.discrepancies[]` where `category === 'road_geometry'` and the description contains the road name.

### Curvature Detection Algorithm

```
For each centerline path:
  For each consecutive vertex pair (i, i+1, i+2):
    bearing1 = computeBearing(coords[i], coords[i+1])
    bearing2 = computeBearing(coords[i+1], coords[i+2])
    diff = |bearing2 - bearing1| mod 360
    diff = min(diff, 360 - diff)   // smallest angle
    if diff > 2.0 degrees → return 'curved'
Return 'straight'
```

---

## 11. §6.9 County Road Default ROW Widths

**New file: `worker/src/services/county-road-defaults.ts`**

County roads are not in the TxDOT database. For these, apply county-specific standard assumptions. Texas Transportation Code §251.003 sets minimum widths; individual counties may exceed this.

```typescript
// worker/src/services/county-road-defaults.ts
//
// County road ROW width defaults for Texas counties.
// TxDOT data does not cover county-maintained roads.
// These defaults are used when no specific county records are available.

export interface CountyROWDefaults {
  countyName: string;
  /** Typical ROW total width in feet (both sides of centerline) */
  defaultROWWidth: number;
  minROWWidth: number;
  maxROWWidth: number;
  source: string;
  notes: string;
}

/**
 * Per-county overrides. Counties not listed use TEXAS_STATE_DEFAULT.
 * Add entries as county-specific knowledge is acquired.
 */
export const COUNTY_ROW_DEFAULTS: Record<string, CountyROWDefaults> = {
  'BELL': {
    countyName: 'Bell',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'Bell County Road Standards',
    notes: 'Bell County typically uses 60\' ROW (30\' each side of centerline). Older roads may be 40\'.',
  },
  'WILLIAMSON': {
    countyName: 'Williamson',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 100,
    source: 'Williamson County Subdivision Regulations',
    notes: 'Newer subdivisions may require up to 100\' ROW for major county roads.',
  },
  'TRAVIS': {
    countyName: 'Travis',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 90,
    source: 'Travis County Transportation Plan',
    notes: 'Travis County collector roads typically 80\', local roads 60\'.',
  },
  'MCLENNAN': {
    countyName: 'McLennan',
    defaultROWWidth: 60,
    minROWWidth: 40,
    maxROWWidth: 80,
    source: 'McLennan County Road Standards',
    notes: 'Standard 60\' ROW for county roads in the Waco area.',
  },
  'BEXAR': {
    countyName: 'Bexar',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 100,
    source: 'Bexar County Subdivision Rules and Regulations',
    notes: 'Arterial county roads may require 100\' ROW.',
  },
  'HARRIS': {
    countyName: 'Harris',
    defaultROWWidth: 60,
    minROWWidth: 50,
    maxROWWidth: 120,
    source: 'Harris County Engineering Design Manual',
    notes: 'Major arterials in Harris County require 120\' ROW.',
  },
};

/** Default for any Texas county not in COUNTY_ROW_DEFAULTS */
export const TEXAS_STATE_DEFAULT: CountyROWDefaults = {
  countyName: 'Default',
  defaultROWWidth: 60,
  minROWWidth: 40,
  maxROWWidth: 80,
  source: 'Texas Transportation Code §251.003',
  notes: 'Standard minimum ROW for Texas county roads. Actual width may vary — check county commissioners court records or original dedication plat.',
};

/**
 * Get county road ROW defaults for a Texas county.
 * Falls back to state minimum if county not found in table.
 */
export function getCountyROWDefaults(countyName: string): CountyROWDefaults {
  return COUNTY_ROW_DEFAULTS[countyName.toUpperCase()] ?? {
    ...TEXAS_STATE_DEFAULT,
    countyName,
  };
}
```

---

## 12. §6.10 ROW Integration Engine Orchestrator

**New file: `worker/src/services/row-integration-engine.ts`**

The orchestrator ties all Phase 6 services together. It reads `property_intelligence.json`, loops over each identified road, runs the appropriate data-collection strategy, and assembles the `ROWReport`.

```typescript
// worker/src/services/row-integration-engine.ts
//
// Phase 6 orchestrator — coordinates all TxDOT ROW data sources.
// Input:  property_intelligence.json (Phase 3 output)
// Output: ROWReport saved to /tmp/analysis/{projectId}/row_data.json

import type { PipelineLogger } from '../lib/logger.js';
import type { RoadInfo } from './property-validation-pipeline.js';
import { classifyRoadEnhanced } from './road-classifier.js';
import { queryTxDOTRow, queryTxDOTCenterlines, buildBoundsFromCenter } from './txdot-row.js';
import { TxDOTRPAMClient } from './txdot-rpam-client.js';
import { TexasDigitalArchiveClient } from './texas-digital-archive-client.js';
import { RoadBoundaryResolver } from './road-boundary-resolver.js';
import { getCountyROWDefaults } from './county-road-defaults.js';
import {
  buildWGS84BoundsFromNAD83,
  buildWGS84BoundsFromLatLon,
} from '../lib/coordinates.js';
import type {
  ROWReport, ROWRoadResult, ROWData, ROWDataSource,
} from './row-integration-engine.js';  // own types

/**
 * Intelligence JSON structure — subset relevant to Phase 6.
 * The full type is in property-validation-pipeline.ts (SynthesizedPropertyData).
 * Phase 6 only needs these fields from property_intelligence.json.
 */
interface Phase3IntelligenceSubset {
  county?: string;
  pointOfBeginning?: {
    northing?: number;
    easting?: number;
  };
  roads: RoadInfo[];
  discrepancies?: Array<{
    callSequence: number | null;
    description: string;
    severity: string;
    recommendation: string;
  }>;
  /** Lat/lon may be present if geocoding was successful in Phase 1 */
  latitude?: number;
  longitude?: number;
}

export class ROWIntegrationEngine {
  private logger: PipelineLogger;

  constructor(logger: PipelineLogger) {
    this.logger = logger;
  }

  /**
   * Run Phase 6 for the given project.
   *
   * @param projectId       For output paths and logging
   * @param intelligence    Parsed property_intelligence.json (Phase 3 output)
   * @param outputDir       Directory for screenshots (default: /tmp/harvested/{projectId}/txdot)
   */
  async analyze(
    projectId: string,
    intelligence: Phase3IntelligenceSubset,
    outputDir?: string,
  ): Promise<ROWReport>;
}
```

### Orchestrator Logic Flow

```
1. Extract roads from intelligence.roads[]
   - If empty → return ROWReport { status: 'complete', roads: [], ... }

2. Determine property center (for ArcGIS bbox query):
   a. If intelligence.pointOfBeginning.northing AND .easting present:
      → use buildWGS84BoundsFromNAD83(easting, northing, 2000)
   b. Else if intelligence.latitude AND .longitude present:
      → use buildWGS84BoundsFromLatLon(lat, lon, 2000)
   c. Else:
      → log warning, skip ArcGIS query, use county defaults for all roads

3. Query TxDOT ArcGIS (ONE time for entire property bbox):
   a. queryTxDOTRow(bounds, logger)        → ROW parcel features
   b. queryTxDOTCenterlines(bounds, logger) → centerline features
   c. Both can run in parallel (Promise.all)

4. For each road in intelligence.roads[]:
   a. classify = classifyRoadEnhanced(road.name)
   b. If classify.queryStrategy === 'txdot_api':
      → Filter ArcGIS features to those matching this road
      → If ArcGIS has data: build ROWData from features
      → If ArcGIS has no data for this road:
          → Run RPAM Playwright (TxDOTRPAMClient) — once per road
          → Log: "[ROW] FM 436: ArcGIS has no features, trying RPAM..."
      → Run Texas Digital Archive search (TexasDigitalArchiveClient)
      → Run RoadBoundaryResolver.resolve() if deed/plat calls available
   c. If classify.queryStrategy === 'county_records':
      → Apply getCountyROWDefaults(intelligence.county)
      → ROWData.source = 'county_defaults'
   d. If classify.queryStrategy === 'deed_only':
      → ROWData.source = 'deed_only', no TxDOT query
      → Log: "[ROW] ${road.name}: private/city road, skipping TxDOT query"

5. Assemble ROWReport:
   - roads[] = per-road results
   - resolvedDiscrepancies[] = from RoadBoundaryResolver.resolve()
   - sources[] = which data sources were attempted and success/fail
   - timing.totalMs = elapsed time

6. Save to /tmp/analysis/{projectId}/row_data.json
```

### Parallelism Note

Run the ArcGIS ROW + centerline queries in parallel using `Promise.all()`. However, the RPAM Playwright client must be run **sequentially** (one browser instance at a time) due to memory constraints on the droplet.

---

## 13. §6.11 Express API & CLI

### 13.1 Express Endpoints — Add to `worker/src/index.ts`

```typescript
// Add to worker/src/index.ts

import { ROWIntegrationEngine } from './services/row-integration-engine.js';
import * as fs from 'fs';
import * as path from 'path';

// In-memory storage for Phase 6 results (same pattern as other phases)
const rowResults = new Map<string, ROWReport | { status: 'in_progress' }>();

// POST /research/row — Start Phase 6 TxDOT ROW integration
app.post('/research/row', requireAuth, (req: Request, res: Response) => {
  const { projectId, intelligencePath } = req.body as {
    projectId?: string;
    intelligencePath?: string;
  };

  if (!projectId) {
    res.status(400).json({ error: 'Missing required field: projectId' });
    return;
  }

  const resolvedPath = intelligencePath
    ?? `/tmp/analysis/${projectId}/property_intelligence.json`;

  if (!fs.existsSync(resolvedPath)) {
    res.status(400).json({
      error: `property_intelligence.json not found at: ${resolvedPath}`,
      hint: 'Run Phase 3 (POST /research/analyze) before Phase 6.',
    });
    return;
  }

  if (rowResults.has(projectId)) {
    const existing = rowResults.get(projectId)!;
    if ('status' in existing && existing.status === 'in_progress') {
      res.status(409).json({ error: 'Phase 6 already running for this project' });
      return;
    }
  }

  res.status(202).json({ status: 'accepted', projectId });
  rowResults.set(projectId, { status: 'in_progress' });

  // Run async
  (async () => {
    const logger = new PipelineLogger(projectId);
    try {
      const intelligence = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
      const engine = new ROWIntegrationEngine(logger);
      const report = await engine.analyze(projectId, intelligence);

      const outputPath = `/tmp/analysis/${projectId}/row_data.json`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

      rowResults.set(projectId, report);

      logger.info('ROW', `Phase 6 complete: ${report.roads?.length ?? 0} roads analyzed`);
      logger.info('ROW', `Discrepancies resolved: ${report.resolvedDiscrepancies?.length ?? 0}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('ROW', `Phase 6 failed: ${msg}`);
      rowResults.set(projectId, {
        status: 'failed',
        roads: [],
        resolvedDiscrepancies: [],
        timing: { totalMs: 0 },
        sources: [],
        errors: [msg],
      } as ROWReport);
    }
  })();
});

// GET /research/row/:projectId — Poll Phase 6 status
app.get('/research/row/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;
  const result = rowResults.get(projectId);

  if (!result) {
    // Check disk
    const diskPath = `/tmp/analysis/${projectId}/row_data.json`;
    if (fs.existsSync(diskPath)) {
      const saved = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));
      res.json(saved);
      return;
    }
    res.status(404).json({ error: `No Phase 6 result found for project: ${projectId}` });
    return;
  }

  res.json(result);
});
```

### 13.2 CLI Script — `worker/row.sh`

**New file: `worker/row.sh`**

```bash
#!/bin/bash
# row.sh — TxDOT ROW integration for a research project
# Usage: ./row.sh <projectId>
# Requires: Phase 3 complete (property_intelligence.json must exist)
# Output:   /tmp/analysis/{projectId}/row_data.json

set -e

PROJECT_ID="$1"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./row.sh <projectId>"
  echo "Example: ./row.sh ash-trust-001"
  exit 1
fi

# Load environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

if [ -z "$WORKER_API_KEY" ]; then
  echo "ERROR: WORKER_API_KEY not set. Check .env file."
  exit 1
fi

INTEL_PATH="/tmp/analysis/$PROJECT_ID/property_intelligence.json"
if [ ! -f "$INTEL_PATH" ]; then
  echo "ERROR: Phase 3 output not found: $INTEL_PATH"
  echo "Run Phase 3 first: ./analyze.sh $PROJECT_ID"
  exit 1
fi

echo "==================================="
echo "  Starr TxDOT ROW Integration"
echo "  Phase 6"
echo "==================================="
echo "Project:    $PROJECT_ID"
echo "Input:      $INTEL_PATH"
echo "Output:     /tmp/analysis/$PROJECT_ID/row_data.json"
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3100/research/row \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"intelligencePath\": \"$INTEL_PATH\"}")

echo "Response: $RESPONSE"
echo ""
echo "ROW analysis started. Monitor with:"
echo "  pm2 logs starr-worker"
echo ""
echo "Poll for results:"
echo "  curl -s http://localhost:3100/research/row/$PROJECT_ID \\"
echo "       -H 'Authorization: Bearer \$WORKER_API_KEY' | python3 -m json.tool"
echo ""
echo "Or wait and check output file:"
echo "  sleep 120 && cat /tmp/analysis/$PROJECT_ID/row_data.json | python3 -m json.tool"
```

---

## 14. File Map

### Files That Were CREATED

```
worker/
├── src/
│   └── services/
│       ├── road-classifier.ts              ✅ COMPLETE  §6.3 — ClassifiedRoad, classifyRoadEnhanced(), TXDOT_PREFIXES_MAP
│       ├── txdot-rpam-client.ts            ✅ COMPLETE  §6.6 — TxDOTRPAMClient, RPAMResult
│       ├── texas-digital-archive-client.ts ✅ COMPLETE  §6.7 — TexasDigitalArchiveClient, DigitalArchiveResult
│       ├── road-boundary-resolver.ts       ✅ COMPLETE  §6.8 — RoadBoundaryResolver, RoadBoundaryResolution
│       ├── county-road-defaults.ts         ✅ COMPLETE  §6.9 — getCountyROWDefaults(), COUNTY_ROW_DEFAULTS
│       └── row-integration-engine.ts       ✅ COMPLETE  §6.10 — ROWIntegrationEngine, ROWReport (main orchestrator)
└── row.sh                                  ✅ COMPLETE  §6.11 — CLI script
```

### Files That Were MODIFIED

```
worker/
├── src/
│   ├── services/
│   │   └── txdot-row.ts   MODIFIED: Added queryTxDOTCenterlines(), TxDOTCenterlineFeature types
│   │                                Updated classifyRoad() to delegate to road-classifier.ts
│   │                                Fixed queryMethod: 'none' when both methods fail
│   │                                Added TXDOT_CENTERLINE_FEATURE_SERVER constant
│   │                                Added ArcGIS service URL validation error message
│   └── index.ts           MODIFIED: Added POST /research/row
│                                     Added GET /research/row/:projectId
│                                   Add ROWIntegrationEngine import
│                                   Add Phase 6 to startup console log
│                                   Bump version to 6.0.0
```

### Files That Must Be READ Before Writing (Do Not Modify)

```
worker/
└── src/
    ├── services/
    │   ├── txdot-row.ts                    READ: Existing types, URL, classifyRoad(), queryTxDOTRow()
    │   ├── property-validation-pipeline.ts READ: RoadInfo type, SynthesizedPropertyData.roads[]
    │   │                                        SynthesizedPropertyData.discrepancies[]
    │   │                                        SynthesizedPropertyData.pointOfBeginning
    │   └── report-generator.ts            READ: How roads are displayed in existing reports
    ├── lib/
    │   ├── coordinates.ts                 USE:  buildWGS84BoundsFromNAD83(), buildWGS84BoundsFromLatLon()
    │   │                                        nad83TexasCentralToWGS84() — do NOT install proj4js
    │   └── logger.ts                      USE:  PipelineLogger — replace all console.log in Phase 6
    └── types/
        └── index.ts                       USE:  BoundaryCall, STORAGE_PATHS.txdotScreenshot(),
                                                 STORAGE_PATHS.txdotGeoJSON()
```

### Files That Are LEGACY (Do Not Delete, Do Not Modify for Phase 6)

```
worker/
└── src/
    └── services/
        ├── pipeline.ts                    LEGACY: still used by POST /research/property-lookup
        ├── adjacent-research.ts           PHASE 5: do not touch
        ├── adjacent-research-orchestrator.ts PHASE 5: do not touch
        ├── geo-reconcile.ts               PHASE 3/7: do not touch
        ├── reanalysis.ts                  PHASE 9: do not touch
        └── report-generator.ts            PHASE 10: do not touch
```

---

## 15. Acceptance Criteria

### Functional Requirements

- [ ] `POST /research/row` returns HTTP 202 within 1 second of valid request
- [ ] Returns HTTP 400 when `property_intelligence.json` not found, with helpful error message directing user to run Phase 3 first
- [ ] Returns HTTP 409 when Phase 6 is already running for this project
- [ ] `GET /research/row/:projectId` returns `{ status: "in_progress" }` during processing
- [ ] `GET /research/row/:projectId` returns full `ROWReport` when complete
- [ ] `row_data.json` saved to `/tmp/analysis/{projectId}/row_data.json` on completion
- [ ] `row.sh` CLI script works from droplet console for `ash-trust-001` sample project
- [ ] Total analysis for 2–3 bordering roads completes within 3 minutes
- [ ] Single road failure does NOT halt the phase — partial results reported with `status: 'partial'`

### Road Classifier (road-classifier.ts)

- [ ] `classifyRoadEnhanced("FM 436")` → `{ txdotDesignation: "FM 0436", type: "farm_to_market", queryStrategy: "txdot_api" }`
- [ ] `classifyRoadEnhanced("Spur 436")` → `{ txdotDesignation: "SP 0436", type: "spur", queryStrategy: "txdot_api" }`
- [ ] `classifyRoadEnhanced("SH 195")` → `{ txdotDesignation: "SH 0195", type: "state_highway" }`
- [ ] `classifyRoadEnhanced("IH 35")` → `{ txdotDesignation: "IH 035", type: "interstate" }`
- [ ] `classifyRoadEnhanced("CR 234")` → `{ type: "county_road", queryStrategy: "county_records" }`
- [ ] `classifyRoadEnhanced("County Road 45")` → `{ type: "county_road" }`
- [ ] `classifyRoadEnhanced("Oak Drive")` → `{ type: "city_street", queryStrategy: "deed_only" }`
- [ ] `classifyRoadEnhanced("Kent Oakley Rd")` → `{ type: "city_street" }` (ends with " RD")
- [ ] Backward compat: `classifyRoad("FM 436")` in txdot-row.ts still returns `"FM"` (TxDOT type string)
- [ ] Backward compat: `classifyRoad("Kent Oakley Rd")` still returns `null`

### Coordinate Transformation (uses coordinates.ts — no new code)

- [ ] `buildWGS84BoundsFromNAD83(3215765, 10338070, 2000)` produces valid WGS84 bbox in Bell County range (lat ~31.0, lon ~-97.5)
- [ ] Bbox covers at least 2000 feet in each direction from center
- [ ] No calls to `require('proj4')` or `import proj4` anywhere in Phase 6 code

### TxDOT ArcGIS REST Client (txdot-row.ts updates)

- [ ] `queryTxDOTCenterlines()` added — queries new centerline FeatureServer URL
- [ ] Returns `TxDOTCenterlineFeature[]` with paths[] geometry
- [ ] ArcGIS bbox query uses `inSR=4326, outSR=4326, f=geojson` parameters
- [ ] HTTP errors logged with URL and status code, returns empty array (does not throw)
- [ ] Feature-to-road matching by `HWY` field works for "FM 0436" matching "FM 436"
- [ ] `queryMethod: 'playwright_fallback'` returned when RPAM is used
- [ ] `queryMethod: 'none'` returned when both ArcGIS and RPAM fail

### RPAM Playwright Client (txdot-rpam-client.ts)

- [ ] Only invoked when ArcGIS returns no features for the specific road
- [ ] Launches Chromium in headless mode
- [ ] Navigates to RPAM URL with correct lat/lon parameters
- [ ] Attempts to enable ROW layers (layer toggle checkboxes)
- [ ] Screenshot saved to `outputDir/rpam_{routeSlug}.png`
- [ ] Claude AI analyzes screenshot for: ROW lines visible, approximate width, straight vs curved
- [ ] AI model read from `process.env.RESEARCH_AI_MODEL` — never hardcoded
- [ ] Returns `null` on any Playwright error — does not throw
- [ ] Always closes browser in finally block

### Texas Digital Archive Client (texas-digital-archive-client.ts)

- [ ] Searches `https://tsl.access.preservica.com/tda/reference-tools/txdot-row/` for ROW records
- [ ] Fills district, highway, and county search fields when available
- [ ] Returns `{ recordsFound: 0, records: [], searchUrl }` on empty results or failure
- [ ] Record type detected from title keywords
- [ ] CSJ extracted from title pattern `\d{4}-\d{2}-\d{3}`
- [ ] Timeout: 45 seconds for page load, no hard failure on timeout

### Road Boundary Resolver (road-boundary-resolver.ts)

- [ ] Resolves FM 436 straight-vs-curved discrepancy: when TxDOT centerline has >2 vertices with >2° bearing changes, returns `txdotConfirms: 'curved'`
- [ ] AI prompt includes: deed call summary, plat call summary, TxDOT feature data, RPAM analysis
- [ ] AI response parsed from JSON: `confirms`, `explanation`, `confidence`, `recommendation`
- [ ] Falls back to `txdotConfirms: 'unknown'` if AI response is not valid JSON
- [ ] Matches existing `intelligence.discrepancies[]` entries by road name
- [ ] Links resolved discrepancy to `resolvedDiscrepancy.discrepancyId`
- [ ] `confidence` range 0–100; typical TxDOT-confirmed result: 85–95

### County Road Defaults (county-road-defaults.ts)

- [ ] `getCountyROWDefaults("Bell")` → `{ defaultROWWidth: 60, source: "Bell County Road Standards" }`
- [ ] `getCountyROWDefaults("Somervell")` → falls back to `TEXAS_STATE_DEFAULT` with `countyName: "Somervell"`
- [ ] County lookup is case-insensitive
- [ ] `TEXAS_STATE_DEFAULT.source` references "Texas Transportation Code §251.003"

### ROW Integration Engine (row-integration-engine.ts)

- [ ] Reads `intelligence.roads[]` using `RoadInfo` type from `property-validation-pipeline.ts`
- [ ] Uses `buildWGS84BoundsFromNAD83` when state plane coordinates available, else `buildWGS84BoundsFromLatLon`
- [ ] Runs ArcGIS ROW parcel + centerline queries in parallel (`Promise.all`)
- [ ] RPAM Playwright runs sequentially (one road at a time)
- [ ] County roads skip ArcGIS query, apply `getCountyROWDefaults()` directly
- [ ] Private/city roads skip all external queries
- [ ] `ROWReport.sources[]` accurately lists which data sources were tried and success/fail
- [ ] Output saved to `/tmp/analysis/{projectId}/row_data.json`

### Implementation Rules

- [ ] All AI calls: `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'` — no hardcoded model names
- [ ] All Phase 6 service code: use `PipelineLogger` from `lib/logger.ts` — no bare `console.log`
- [ ] `projectId` included in every log line
- [ ] `ANTHROPIC_API_KEY` read from `process.env` — never hardcoded
- [ ] TypeScript strict mode: zero errors in all Phase 6 files
- [ ] No new npm dependencies: `proj4`, `@turf/turf`, or other geo libraries are prohibited — use `coordinates.ts`
- [ ] All external HTTP requests use `AbortSignal.timeout(30000)` (30 seconds)
- [ ] ArcGIS queries use 20-second timeout (consistent with existing `QUERY_TIMEOUT_S = 20` in txdot-row.ts)

---

*Previous: `PHASE_05_ADJACENT.md` — Adjacent Property Deep Research & Boundary Cross-Validation*
*Next: `PHASE_07_RECONCILIATION.md` — Geometric Reconciliation*
