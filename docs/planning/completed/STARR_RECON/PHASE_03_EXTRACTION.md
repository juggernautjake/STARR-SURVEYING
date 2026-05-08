# STARR RECON — Phase 3: AI Document Intelligence & Property Analysis

**Product:** Starr Compass — AI Property Research (STARR RECON)  
**Version:** 1.2 | **Last Updated:** March 2026  
**Phase Duration:** Weeks 7–9  
**Depends On:** Phase 1 (`PropertyIdentity`), Phase 2 (`HarvestResult` with images)  
**Status:** ✅ COMPLETE — All orchestrator files built and tested. 633 unit tests pass (563 pre-existing + 70 Phase 3 tests).  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

Given the `HarvestResult` from Phase 2 (images + metadata for all downloaded documents), run every document through the AI extraction pipeline and produce a comprehensive, structured `PropertyIntelligence` object — the unified property data model that all downstream phases (4, 5, 6, 7, 8) consume.

**Deliverable:** An `AIDocumentAnalyzer` orchestrator that takes Phase 2 output and returns a `PropertyIntelligence` object, saved to disk and available via the status endpoint.

---

## Table of Contents

1. [What This Phase Must Accomplish](#1-what-this-phase-must-accomplish)
2. [Current State of the Codebase](#2-current-state-of-the-codebase)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Data Model — PropertyIntelligence](#4-core-data-model--propertyintelligence)
5. [Pipeline A — Plat Analysis (AIPlatAnalyzer)](#5-pipeline-a--plat-analysis-aiplatanalyzer)
6. [Pipeline B — Deed Text Analysis (AIDeedAnalyzer)](#6-pipeline-b--deed-text-analysis-aideedanalyzer)
7. [Pipeline C — Property Context Analysis (AIContextAnalyzer)](#7-pipeline-c--property-context-analysis-aicontextanalyzer)
8. [AIDocumentAnalyzer Orchestrator](#8-aidocumentanalyzer-orchestrator)
9. [Express API Endpoint — POST /research/analyze](#9-express-api-endpoint--post-researchanalyze)
10. [CLI Script — analyze.sh](#10-cli-script--analyzesh)
11. [File Map](#11-file-map)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. What This Phase Must Accomplish

After Phase 2 downloads all free documents, Phase 3 runs AI on every page and produces a unified `PropertyIntelligence` JSON:

```bash
curl -X POST http://localhost:3100/research/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "harvestResultPath": "/tmp/harvest/ash-trust-001/harvest_result.json"
  }'
```

Returns HTTP 202 immediately. Poll for results:

```bash
curl http://localhost:3100/research/analyze/ash-trust-001 \
  -H "Authorization: Bearer $WORKER_API_KEY"
```

Result is saved to `/tmp/analysis/{projectId}/property_intelligence.json` and returned via the status endpoint:

```json
{
  "status": "complete",
  "property": {
    "name": "ASH FAMILY TRUST 12.358 ACRE ADDITION",
    "propertyType": "subdivision",
    "totalAcreage": 12.358,
    "totalSqFt": 538312,
    "county": "Bell",
    "state": "TX",
    "abstractSurvey": "WILLIAM HARTRICK SURVEY, A-488",
    "datum": "NAD83",
    "coordinateZone": "Texas Central",
    "unitSystem": "US Survey Feet",
    "scaleFactor": 0.999986,
    "pointOfBeginning": {
      "northing": 10338070.754,
      "easting": 3215765.737,
      "description": "Found concrete monument at NE corner of tract"
    }
  },
  "subdivision": {
    "name": "ASH FAMILY TRUST 12.358 ACRE ADDITION",
    "platInstrument": "2023032044",
    "platDate": "2023-04-12",
    "surveyor": "Starr Surveying",
    "rpls": "6706",
    "surveyDate": "2020-07-06",
    "totalLots": 6,
    "lotNames": ["Lot 1", "Lot 2", "Lot 3", "Lot 4", "Lot 5", "Reserve A"],
    "hasReserves": true,
    "hasCommonAreas": false,
    "restrictiveCovenants": "2023032045",
    "notes": []
  },
  "lots": [
    {
      "lotId": "lot_1",
      "name": "Lot 1",
      "lotType": "residential",
      "acreage": 2.922,
      "sqft": 127230,
      "boundaryCalls": [
        {
          "callId": "L1_C1",
          "sequenceNumber": 1,
          "bearing": "N 85°22'02\" E",
          "bearingDecimal": 85.367222,
          "distance": 461.81,
          "unit": "feet",
          "type": "straight",
          "along": "FM 436 ROW",
          "fromMonument": "POB — found concrete monument",
          "toMonument": "found 1/2\" iron rod",
          "confidence": 87,
          "confidenceSymbol": "~",
          "sources": ["plat_text", "deed_text"],
          "allReadings": [
            { "value": "N 85°22'02\" E, 461.81'", "source": "plat_text", "confidence": 87, "isGeometric": false }
          ],
          "bestReading": "N 85°22'02\" E, 461.81'"
        }
      ],
      "curves": [],
      "closure": null,
      "buildingSetbacks": { "front": 25, "side": 10, "rear": 20 },
      "easements": ["15' utility easement along west boundary"],
      "notes": [],
      "confidence": 87
    }
  ],
  "perimeterBoundary": {
    "calls": [],
    "totalPerimeter": 3250.5,
    "closureError": { "distance": 0.15, "ratio": "1:21670" },
    "closureStatus": "acceptable"
  },
  "adjacentProperties": [ ... ],
  "roads": [ ... ],
  "easements": [ ... ],
  "deedChain": [ ... ],
  "discrepancies": [ ... ],
  "confidenceSummary": { ... },
  "aiCallLog": { ... }
}
```

---

## 2. Current State of the Codebase

> **CRITICAL FOR AGENTS:** Phase 3 MUST build on — not rewrite — the existing AI services. Read every file listed below before writing any new code.

### Phase 1 — COMPLETE ✅

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/discovery-engine.ts` | PropertyDiscoveryEngine orchestrator | ✅ Done |
| `worker/src/services/property-discovery.ts` | Express wrapper | ✅ Done |
| `worker/src/adapters/cad-adapter.ts` | Abstract CAD base | ✅ Done |
| `worker/src/adapters/bis-adapter.ts` | BIS Consultants adapter | ✅ Done |
| `worker/src/adapters/trueautomation-adapter.ts` | TrueAutomation adapter | ✅ Done |
| `worker/src/adapters/tyler-adapter.ts` | Tyler/Aumentum adapter | ✅ Done |
| `worker/src/types/property-discovery.ts` | Phase 1 types | ✅ Done |

### Phase 2 — COMPLETE ✅

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/adapters/clerk-adapter.ts` | Abstract ClerkAdapter base | ✅ Done |
| `worker/src/adapters/kofile-clerk-adapter.ts` | Kofile/PublicSearch adapter | ✅ Done |
| `worker/src/adapters/texasfile-adapter.ts` | TexasFile fallback | 🔨 Stub only |
| `worker/src/services/document-harvester.ts` | Harvest orchestrator | ✅ Done |
| `worker/src/services/document-intelligence.ts` | Relevance scoring | ✅ Done |
| `worker/src/types/document-harvest.ts` | HarvestInput / HarvestResult types | ✅ Done |
| `worker/harvest.sh` | CLI harvest script | ✅ Done |
| `worker/src/services/clerk-registry.ts` | FIPS → adapter routing | ❌ Not yet built |

### Phase 3 Foundation — PARTIALLY BUILT 🔨

The following services were built as proof-of-concept and form the **core foundation** of Phase 3. They are production-quality but need to be wired together into the new `AIDocumentAnalyzer` orchestrator and output `PropertyIntelligence` instead of the older `ExtractedBoundaryData` / `ValidationReport` types.

| File | Purpose | Status | Phase 3 Role |
|------|---------|--------|--------------|
| `worker/src/services/adaptive-vision.ts` | 6-phase quadrant OCR for large plat images | ✅ Production-quality | Core of `AIPlatAnalyzer` — **USE AS-IS** |
| `worker/src/services/ai-extraction.ts` | Multi-pass Claude text + vision extraction | ✅ Production-quality | Core of `AIDeedAnalyzer` — **USE AS-IS** |
| `worker/src/services/geo-reconcile.ts` | Visual geometry analysis (Phase 1) + cross-reference reconciliation (Phase 3) | ✅ Production-quality | Used by `AIPlatAnalyzer` for geometric reconciliation |
| `worker/src/services/property-validation-pipeline.ts` | 3-call synthesis + cross-validation + report generation | ✅ Production-quality | Used by `AIContextAnalyzer` — adapts its synthesis + discrepancy logic |
| `worker/src/services/adjacent-research.ts` | Adjacent property candidate extraction + shared boundary cross-validation | ✅ Production-quality | Adjacent candidate extraction reused in Phase 3; full research is Phase 5 |
| `worker/src/lib/curve-params.ts` | Circular curve completion math (given R+Δ compute L, etc.) | ✅ Production-quality | Used in `AIPlatAnalyzer` to fill missing curve parameters |
| `worker/src/lib/coordinates.ts` | NAD83 Texas Central ↔ WGS84 coordinate transform | ✅ Production-quality | Used when POB has state-plane coordinates |

### Phase 3 Build Status — COMPLETE ✅

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/models/property-intelligence.ts` | The complete `PropertyIntelligence` type tree + `computeConfidenceSummary()` + `toConfidenceSymbol()` | ✅ Built |
| `worker/src/services/ai-plat-analyzer.ts` | Orchestrates adaptive-vision + geo-reconcile → LotData + synthesis extraction | ✅ Built |
| `worker/src/services/ai-deed-analyzer.ts` | Wraps ai-extraction.ts → DeedAnalysisResult + DeedChainEntry conversion | ✅ Built |
| `worker/src/services/ai-context-analyzer.ts` | Context + discrepancy analysis; populates PropertyIntelligence.confidenceSummary | ✅ Built |
| `worker/src/services/ai-document-analyzer.ts` | Phase 3 top-level orchestrator — routes docs, runs pipelines, assembles output | ✅ Built |
| `worker/analyze.sh` | CLI script for droplet console use | ✅ Built |

### Bugs Fixed (v1.2 — March 2026)

The following bugs were identified and fixed during a comprehensive Phase 3 review:

1. **TypeScript build error** (`ai-extraction.ts:954`): TypeScript control-flow analysis typed `bestBoundary` as `never` after mutations inside `updateBest()` closure. Fixed by adding `as ExtractedBoundaryData | null` cast before the final log line. This was causing the Vercel CI build to fail.

2. **Incorrect FIPS county lookup** (`ai-document-analyzer.ts`): `TEXAS_FIPS_COUNTY` was missing **Deaf Smith County** (FIPS 48117) and had a cascade error shifting all 192+ county entries from FIPS 48117 to 48507 by one position. All affected entries (including Harris=48201, Tarrant=48439, Travis=48453, Starr=48427, Zavala=48507) corrected.

3. **Silent boundary call drops** (`ai-plat-analyzer.ts: convertRawCall`): When a boundary call was dropped due to an empty bearing or NaN distance, nothing was logged. Fixed: calls to `this.logger.warn()` added so operators can see which calls are being silently dropped.

4. **Unsafe status enum cast** (`ai-plat-analyzer.ts: convertRawCall`): The status string from AI synthesis was cast with `as` without validation. Fixed: runtime validation against `VALID_STATUSES` array; unknown values now default to `'text_only'` instead of silently propagating garbage.

5. **Silent AI response parse error** (`ai-context-analyzer.ts: callContextAI`): JSON parse failures only logged a generic message with no context. Fixed: parse error message and a 500-character preview of the raw response are now logged. Also: missing `textBlock` from AI response (e.g., when `stop_reason=tool_use`) now warns with the stop reason instead of silently using empty object `'{}'`.

6. **Silent curve completion failures** (`ai-deed-analyzer.ts: convertCalls`): The `catch` block for `completeBoundaryCallCurve()` was empty. Fixed: exception message is now logged as a warning with the call sequence number.

7. **Silent notes array truncation** (`ai-document-analyzer.ts: assemblePropertyIntelligence`): `plat.notes.slice(0, 20)` was silently dropping notes without logging. Fixed: replaced with `this.capNotes()` helper that logs a warning when truncation occurs.

### Known Limitations (Require More Info or Future Phases)

- **County inference**: `AIDocumentAnalyzer.inferCounty()` now uses FIPS-code extraction from source strings (e.g., `"kofile_48027"` → Bell County) with a complete all-254-county lookup table. Full county metadata should ideally be added directly to `HarvestResult` in a future schema update for maximum reliability.
- **Traverse closure**: `perimeterBoundary.closureStatus` is always `'unknown'` at Phase 3 — full traverse closure (error northing/easting, ratio) is Phase 7 work.
- **Supabase upload**: `property_intelligence.json` is saved to disk only. Supabase Storage upload is marked TODO in `ai-document-analyzer.ts`.
- **`ANTHROPIC_API_KEY`**: Required at runtime on the worker droplet. If missing, all three AI pipelines will fail. Set via `.env` or Droplet environment variable before running `analyze.sh`.
- **Live integration tests**: All current tests are unit tests (pure logic, no live AI calls). A separate integration test suite is needed to verify end-to-end accuracy on real plat/deed images from the worker droplet.

### Key Architecture Relationship: Old vs New Types

Phase 3 introduces `PropertyIntelligence` as the **new, richer** successor to the legacy `ExtractedBoundaryData` + `ValidationReport` combination:

| Existing Type | Phase 3 Equivalent | Notes |
|---|---|---|
| `ExtractedBoundaryData` | `PropertyIntelligence.lots[].boundaryCalls` + `PropertyIntelligence.perimeterBoundary.calls` | Phase 3 splits calls by lot |
| `ValidationReport.adjacentProperties` | `PropertyIntelligence.adjacentProperties` | Richer, adds `sharedCalls` and `instrumentNumbers` |
| `ValidationReport.roads` | `PropertyIntelligence.roads` | Adds `boundaryType`, `centerlineBearing` |
| `ValidationReport.easements` | `PropertyIntelligence.easements` | Adds `grantee`, `instrument`, `source` |
| `ValidationReport.discrepancies` | `PropertyIntelligence.discrepancies` | Adds `affectedCalls`, `affectedLots`, `estimatedCostToResolve` |
| `ValidationReport.purchaseRecommendations` | `PropertyIntelligence.confidenceSummary.documentRecommendations` | Same concept, richer schema |
| `ReconciliationResult` | Feeds into `PropertyIntelligence.lots[].boundaryCalls[].allReadings` | Readings become per-call source arrays |

> **Do NOT delete or break** `ExtractedBoundaryData` or `ValidationReport` — `pipeline.ts` still uses them. The legacy pipeline (`POST /research/property-lookup`) continues to run in parallel with the new Phase 3 pipeline.

---

## 3. Architecture Overview

```
INPUT: HarvestResult (images + metadata from Phase 2)
  │   (read from /tmp/harvest/{projectId}/harvest_result.json)
  │
  ├── STEP 1: DOCUMENT TRIAGE
  │   ├── Sort documents by type and priority (plats first)
  │   ├── Plats → Pipeline A (AIPlatAnalyzer)
  │   ├── Deeds → Pipeline B (AIDeedAnalyzer)
  │   ├── Easements → Pipeline B (focused deed extraction)
  │   └── Other → Pipeline B (general text extraction)
  │
  ├── STEP 2: PIPELINE A — PLAT ANALYSIS (highest value)
  │   ├── adaptiveVisionOcr() from adaptive-vision.ts
  │   │     [6-phase: analyze → grid → crop → extract → score → escalate]
  │   ├── analyzeVisualGeometry() from geo-reconcile.ts
  │   │     [Phase 1: visual bearing/distance estimates]
  │   ├── reconcileGeometry() from geo-reconcile.ts
  │   │     [Phase 3: cross-reference text OCR vs visual estimates]
  │   └── parseToLotData() — NEW: convert reconciled results → LotData[]
  │
  ├── STEP 3: PIPELINE B — DEED ANALYSIS
  │   ├── extractDocuments() from ai-extraction.ts
  │   │     [multi-pass: screen → text extract → vision OCR → verify]
  │   ├── completeCurveParams() from curve-params.ts
  │   │     [fill any missing curve parameters from known values]
  │   └── parseToDeedChainEntry() — NEW: convert to DeedChainEntry
  │
  ├── STEP 4: CROSS-DOCUMENT RECONCILIATION
  │   ├── Compare plat calls vs deed calls (bearing + distance)
  │   ├── Identify discrepancies (conflict severity classification)
  │   ├── Detect datum shifts (NAD27 → NAD83 references)
  │   └── Build BoundaryCall.allReadings[] with sources
  │
  ├── STEP 5: CONTEXT ANALYSIS (AIContextAnalyzer)
  │   ├── Is this a subdivision or standalone tract?
  │   ├── What adjacent research would help most?
  │   ├── What documents should be purchased?
  │   └── What are the red flags?
  │
  └── STEP 6: ASSEMBLE PropertyIntelligence
      ├── Merge all pipeline results
      ├── Compute confidence scores (per call, per lot, overall)
      ├── Generate discrepancy report
      └── Produce document purchase recommendations
```

---

## 4. Core Data Model — PropertyIntelligence

**File:** `worker/src/models/property-intelligence.ts`  
**Status:** ❌ Must create  
**Exports to:** All downstream phases (4, 5, 6, 7, 8)

> **Naming convention:** `callId` uses the format `{lotId}_C{N}` for straight lines and `{lotId}_CV{N}` for curves. Perimeter calls use `PERIM_C{N}`. This convention must be consistent across all phases.

```typescript
// worker/src/models/property-intelligence.ts
// Phase 3 output model — the unified property data object consumed by all
// downstream phases. Every field is either extracted from documents or
// computed from extracted data. No field is ever fabricated.

// ── Extraction Source Types ─────────────────────────────────────────────────

/**
 * Where a particular reading came from.
 * Downstream phases use this to apply source weighting (Phase 7: deed > plat > adjacent > geometric).
 */
export type ExtractionSource =
  | 'plat_text'       // OCR from plat (primary segment extraction)
  | 'plat_text_zoom'  // OCR from zoomed plat sub-segment (escalated)
  | 'plat_geometry'   // Visual protractor/ruler measurement (geo-reconcile.ts Phase 1)
  | 'plat_line_table' // From line/curve table on plat
  | 'deed_text'       // From deed document (ai-extraction.ts)
  | 'adjacent_deed'   // From neighboring property's deed (Phase 5)
  | 'txdot_row'       // From TxDOT ROW data (Phase 6)
  | 'cad_gis'         // From CAD GIS parcel geometry
  | 'computed';       // Mathematically derived (curve-params.ts)

/** One raw reading of a bearing or distance from one source */
export interface Reading {
  value: string;
  source: ExtractionSource;
  confidence: number;       // 0–100
  isGeometric: boolean;     // true = from visual protractor/ruler, false = from OCR text
}

// ── Boundary Call ──────────────────────────────────────────────────────────

/**
 * A single metes-and-bounds call (one line segment or curve of a boundary).
 * This is the atomic unit of all boundary data in Phase 3 and downstream.
 *
 * Extends the existing BoundaryCall in types/index.ts with multi-source
 * reading arrays, confidence symbols, and monument details required by Phase 3.
 */
export interface P3BoundaryCall {
  callId: string;               // "L1_C1", "PERIM_C5", "L3_CV2"
  sequenceNumber: number;       // Order in the traverse (1-based)

  // Best-determination values (the reconciled "winner" across all sources)
  bearing: string;              // "N 85°22'02\" E" — DMS format, always
  bearingDecimal?: number;      // 85.367222 — for computation (az within quadrant)
  distance: number;             // 461.81 (in feet, converted from varas if needed)
  unit: 'feet' | 'varas';       // Original unit from document (varas in old deeds)

  type: 'straight' | 'curve';
  along?: string;               // "FM 436 ROW" | "Lot 2" | "Nordyke property line"
  fromMonument?: string;        // Description of monument at start of call
  toMonument?: string;          // Description of monument at end of call

  // Curve data (only when type === 'curve')
  curve?: {
    radius: number;
    arcLength?: number;
    chordBearing?: string;
    chordDistance?: number;
    delta?: string;             // Central angle: "3°40'22\""
    direction: 'left' | 'right';
    tangentLength?: number;
    // Set when a missing parameter was computed by curve-params.ts
    computed?: {
      missingParam: string;     // e.g. "delta_deg"
      computedValue: number;
      formula: string;          // e.g. "L = R × Δ_rad"
    };
  };

  // Multi-source confidence tracking
  confidence: number;           // 0–100 overall confidence for this call
  confidenceSymbol: '✓' | '~' | '?' | '✗' | '✗✗'; // ✓ CONFIRMED | ~ DEDUCED | ? UNCONFIRMED | ✗ DISCREPANCY | ✗✗ CRITICAL
  sources: ExtractionSource[];  // Which sources contributed to this call
  allReadings: Reading[];       // Every raw reading from every source
  bestReading: string;          // The reconciled value description
  notes?: string;               // E.g. "Watermark partially obscures bearing seconds"
}

// ── Lot Data ───────────────────────────────────────────────────────────────

export interface LotData {
  lotId: string;                // "lot_1", "lot_2", "reserve_a"
  name: string;                 // "Lot 1", "Reserve A", "Common Area B"
  lotType: 'residential' | 'commercial' | 'reserve' | 'common_area' | 'open_space' | 'drainage' | 'unknown';
  acreage?: number;
  sqft?: number;
  boundaryCalls: P3BoundaryCall[];   // Straight line calls
  curves: P3BoundaryCall[];          // Curve calls (type === 'curve')

  // Traverse closure (computed from bearing+distance math)
  closure?: {
    errorNorthing: number;
    errorEasting: number;
    errorDistance: number;
    closureRatio: string;            // "1:21670"
    status: 'excellent' | 'acceptable' | 'marginal' | 'failed' | 'unknown';
  };

  buildingSetbacks?: {
    front?: number;
    side?: number;
    rear?: number;
    notes?: string;
  };

  easements: string[];               // Textual descriptions
  notes: string[];
  confidence: number;                // 0–100 average over all calls
}

// ── Adjacent Property ──────────────────────────────────────────────────────

export interface AdjacentProperty {
  owner: string;
  calledAcreages: number[];
  sharedBoundary: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest' | 'multiple';
  instrumentNumbers: string[];
  volumePages: { volume: string; page: string }[];
  hasBeenResearched: boolean;         // Phase 5 sets this to true when deed is retrieved
  deedAvailable: boolean;
  platAvailable: boolean;
  sharedCalls: SharedBoundaryCall[];
}

export interface SharedBoundaryCall {
  callId: string;                     // References P3BoundaryCall.callId on our side
  ourBearing?: string;
  ourDistance?: number;
  theirBearing?: string;              // Reversed bearing from their deed (Phase 5)
  theirDistance?: number;
  bearingDifference?: string;         // Angular difference
  distanceDifference?: number;
  matchStatus: 'confirmed' | 'close_match' | 'marginal' | 'discrepancy' | 'unverified';
  notes?: string;
}

// ── Road Info ──────────────────────────────────────────────────────────────

export interface RoadInfo {
  name: string;                       // "FM 436", "US 190", "CR 123"
  type: 'farm_to_market' | 'ranch_to_market' | 'state_highway' | 'us_highway' | 'interstate' | 'county_road' | 'city_street' | 'private_road' | 'spur' | 'loop' | 'business';
  txdotDesignation?: string;          // "FM 436" as TxDOT uses it
  maintainedBy: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
  estimatedROWWidth?: number;         // Feet — from plat/deed (may be wrong for curved ROW)
  confirmedROWWidth?: number;         // Feet — only set after Phase 6 TxDOT research
  boundaryType: 'straight' | 'curved' | 'mixed' | 'unknown';
  centerlineBearing?: string;
  notes: string[];
}

// ── Easement Info ──────────────────────────────────────────────────────────

export interface EasementInfo {
  type: 'utility' | 'drainage' | 'access' | 'conservation' | 'pipeline' | 'powerline' | 'sidewalk' | 'landscape' | 'other';
  width?: number;                     // Feet
  location: string;                   // "along west boundary of Lots 1-5"
  instrument?: string;
  grantee?: string;                   // Who holds the easement
  source: ExtractionSource;
  confidence: number;
  notes?: string;
}

// ── Discrepancy ────────────────────────────────────────────────────────────

export interface Discrepancy {
  id: string;                         // "DISC-001"
  severity: 'critical' | 'moderate' | 'minor' | 'informational';
  category: 'bearing_conflict' | 'distance_conflict' | 'area_conflict' | 'datum_shift' | 'missing_data' | 'road_geometry' | 'monument_conflict' | 'other';
  description: string;
  affectedCalls: string[];            // P3BoundaryCall.callId values
  affectedLots: string[];             // LotData.lotId values
  readings: { source: string; value: string }[];
  likelyCorrect?: string;
  basis?: string;                     // Reasoning for best determination
  resolution: string;                 // What to do about it
  estimatedCostToResolve?: number;    // $ cost to purchase clarifying document
}

// ── Deed Chain Entry ───────────────────────────────────────────────────────

export interface DeedChainEntry {
  instrument: string;
  type: string;                       // "warranty_deed" | "quitclaim_deed" | "plat" | etc.
  date: string;                       // ISO date
  grantor: string;
  grantee: string;
  calledAcreage?: number;
  parentTract?: string;
  parentInstrument?: string;
  surveyReference?: string;
  metesAndBounds: P3BoundaryCall[];   // Calls extracted from this deed
  notes: string[];
}

// ── Main PropertyIntelligence Object ──────────────────────────────────────

/**
 * The primary output of Phase 3. Consumed by all downstream phases.
 * Saved to /tmp/analysis/{projectId}/property_intelligence.json.
 */
export interface PropertyIntelligence {
  // Metadata
  projectId: string;
  generatedAt: string;                // ISO timestamp
  version: '3.0';

  // Core property info (from plat title block + CAD data)
  property: {
    name: string;
    propertyType: 'subdivision' | 'standalone_tract' | 'lot_in_subdivision' | 'unknown';
    totalAcreage: number;
    totalSqFt?: number;
    county: string;
    state: string;
    abstractSurvey?: string;          // "WILLIAM HARTRICK SURVEY, A-488"
    datum?: string;                   // "NAD83" | "NAD27"
    coordinateZone?: string;          // "Texas Central"
    unitSystem?: string;              // "US Survey Feet"
    scaleFactor?: number;             // Combined scale factor from plat
    pointOfBeginning?: {
      northing?: number;
      easting?: number;
      latitude?: number;
      longitude?: number;
      description?: string;
    };
  };

  // Subdivision info (populated when propertyType === 'subdivision')
  subdivision?: {
    name: string;
    platInstrument?: string;
    platDate?: string;
    surveyor?: string;
    rpls?: string;
    surveyDate?: string;
    totalLots: number;
    lotNames: string[];
    hasReserves: boolean;
    hasCommonAreas: boolean;
    restrictiveCovenants?: string;    // Instrument number
    notes: string[];
  };

  // Per-lot boundary data (one entry per lot in the subdivision, or one entry for standalone tract)
  lots: LotData[];

  // Overall perimeter (the outer boundary of the entire tract/subdivision)
  perimeterBoundary: {
    calls: P3BoundaryCall[];
    totalPerimeter?: number;          // Feet
    closureError?: { distance: number; ratio: string };
    closureStatus: 'excellent' | 'acceptable' | 'marginal' | 'failed' | 'unknown';
  };

  // Adjacent property context
  adjacentProperties: AdjacentProperty[];

  // Roads bordering or passing through
  roads: RoadInfo[];

  // All easements found
  easements: EasementInfo[];

  // Deed history
  deedChain: DeedChainEntry[];

  // Conflicts and issues found
  discrepancies: Discrepancy[];

  // Overall quality assessment
  confidenceSummary: {
    overall: number;                  // 0–100
    rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LOW' | 'INSUFFICIENT';
    confirmedCalls: number;           // ✓ calls
    deducedCalls: number;             // ~ calls
    unconfirmedCalls: number;         // ? calls
    discrepancyCalls: number;         // ✗ calls
    criticalCalls: number;            // ✗✗ calls
    totalCalls: number;
    biggestGap: string;
    recommendedAction: string;
    documentRecommendations: {
      document: string;
      source: string;
      estimatedPrice: number;
      confidenceImpact: string;       // e.g. "64% → 90%"
      priority: 'high' | 'medium' | 'low';
    }[];
  };

  // AI API call tracking
  aiCallLog: {
    totalAPICalls: number;
    totalTokens: number;
    totalCost: number;                // USD (estimated from token counts)
    durationMs: number;
    callBreakdown: {
      type: string;
      calls: number;
      description: string;
    }[];
  };
}
```

---

## 5. Pipeline A — Plat Analysis (AIPlatAnalyzer)

**File:** `worker/src/services/ai-plat-analyzer.ts`  
**Status:** ❌ Must create  
**Builds on:** `adaptive-vision.ts`, `geo-reconcile.ts`, `curve-params.ts`

### 5.1 What It Does

`AIPlatAnalyzer` is the wrapper around the existing vision and reconciliation services that converts their output into the Phase 3 `LotData[]` and `P3BoundaryCall[]` types. It does **not** reimplement the segmentation or geometric analysis logic — it orchestrates the existing services.

### 5.2 Key Implementation Rules

- **Use `adaptiveVisionOcr()`** from `adaptive-vision.ts` for all plat image processing. Do not duplicate its segmentation or escalation logic.
- **Use `analyzeVisualGeometry()`** from `geo-reconcile.ts` for the visual bearing/distance measurement pass.
- **Use `reconcileGeometry()`** from `geo-reconcile.ts` to cross-reference OCR text vs visual measurements.
- **Use `completeCurveParams()`** from `curve-params.ts` to fill missing curve data (e.g., when plat shows R and Δ but not L).
- **Use `sharp`** (already a worker dependency) for any image resizing or cropping — do **not** shell out to ImageMagick.
- All AI calls use `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'` — do **not** hardcode a model name.

### 5.3 Processing Flow

```
analyzePlat(imagePaths[], projectId)
  │
  ├── For each image page:
  │   ├── adaptiveVisionOcr(buffer, mediaType, apiKey, logger, label)
  │   │     → AdaptiveVisionResult { mergedText, segments[], overallConfidence }
  │   │
  │   ├── analyzeVisualGeometry(base64, mediaType, apiKey, logger, label)
  │   │     → VisualGeometryAnalysis { northArrowRotationDeg, visualMeasurements[], conflicts[] }
  │   │
  │   ├── extractFromText(mergedText) [via ai-extraction.ts internal API]
  │   │     → ExtractedBoundaryData { calls[], references[], area, lotBlock }
  │   │
  │   ├── reconcileGeometry(visual, extracted, logger)
  │   │     → ReconciliationResult { callReconciliations[], bearingConflicts[], recommendations[] }
  │   │
  │   └── parseToLotData(extracted, reconciliation, segments)
  │         → PlatPageResult { lots[], perimeterCalls[], adjacentOwners[], roads[], subdivisionInfo }
  │
  ├── mergePageResults(results[])
  │     (Page 1 = drawing, Page 2+ = notes/certifications)
  │
  └── Return PlatAnalysisResult
```

### 5.4 Interface

```typescript
// worker/src/services/ai-plat-analyzer.ts

import { adaptiveVisionOcr } from './adaptive-vision.js';
import { analyzeVisualGeometry, reconcileGeometry } from './geo-reconcile.js';
import { completeCurveParams } from '../lib/curve-params.js';
import type { P3BoundaryCall, LotData, EasementInfo, RoadInfo, ExtractionSource, Reading } from '../models/property-intelligence.js';
import type { PipelineLogger } from '../lib/logger.js';
import type { AdaptiveVisionResult } from './adaptive-vision.js';
import type { ReconciliationResult } from './geo-reconcile.js';

export interface PlatSubdivisionInfo {
  name?: string;
  surveyor?: string;
  rpls?: string;
  surveyDate?: string;
  platDate?: string;
  platInstrument?: string;
  datum?: string;
  coordinateZone?: string;
  unitSystem?: string;
  scaleFactor?: number;
  totalLots?: number;
  hasReserves?: boolean;
  hasCommonAreas?: boolean;
  restrictiveCovenants?: string;
  pob?: {
    northing?: number;
    easting?: number;
    description?: string;
  };
}

export interface PlatAnalysisResult {
  lots: LotData[];
  perimeterCalls: P3BoundaryCall[];
  adjacentOwners: { name: string; calledAcreage?: number; direction: string }[];
  roads: { name: string; type: string; rowWidth?: number }[];
  easements: { type: string; width?: number; location: string }[];
  subdivisionInfo: PlatSubdivisionInfo;
  lineTable: { id: string; bearing: string; distance: number }[];
  curveTable: {
    id: string;
    radius: number;
    arcLength: number;
    delta: string;
    chordBearing: string;
    chordDistance: number;
  }[];
  notes: string[];
  totalApiCalls: number;
  durationMs: number;
}

export class AIPlatAnalyzer {
  private apiKey: string;
  private logger: PipelineLogger;

  constructor(apiKey: string, logger: PipelineLogger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async analyzePlat(imageBuffers: Buffer[], projectId: string): Promise<PlatAnalysisResult> {
    // Process each page, then merge
  }

  private async analyzeSinglePlatPage(
    imageBuffer: Buffer,
    pageNum: number,
    totalPages: number,
  ): Promise<PlatAnalysisResult> {
    // 1. adaptiveVisionOcr() — get segmented OCR text + confidence
    // 2. analyzeVisualGeometry() — get visual bearing/distance estimates
    // 3. reconcileGeometry() — cross-reference OCR vs visual
    // 4. parseToLotData() — convert to LotData[]
  }

  /**
   * Promote segment results from AdaptiveVisionResult + ReconciliationResult
   * into typed LotData[], P3BoundaryCall[], and PlatSubdivisionInfo.
   */
  private parseToLotData(
    ocrText: string,
    segments: AdaptiveVisionResult['segments'],
    reconciliation: ReconciliationResult,
  ): Omit<PlatAnalysisResult, 'totalApiCalls' | 'durationMs'> {
    // 1. Extract subdivision header info (name, surveyor, RPLS, datum, POB)
    // 2. Parse lot sections from ocrText (split on LOT/RESERVE markers)
    // 3. For each lot: extract boundary calls, apply reconciliation symbols
    // 4. Apply confidenceSymbol: ✓ if confirmed, ~ if deduced, ? if text-only, ✗ if conflict, ✗✗ if critical
    // 5. For curve calls: completeCurveParams() from curve-params.ts
    // 6. Extract adjacent owners from "along the OWNER X-acre tract" patterns
    // 7. Extract roads from FM/SH/US/CR/SPUR/LOOP patterns
    // 8. Extract easements from utility/drainage/access patterns
    // 9. Extract line table and curve table data
  }

  private mergePageResults(results: PlatAnalysisResult[]): PlatAnalysisResult {
    // Merge multi-page plat results (page 1 = drawing, page 2 = notes)
  }
}
```

### 5.5 Confidence Symbol Assignment

Map `ReconciliationResult` statuses to `P3BoundaryCall.confidenceSymbol`:

| `CallReconciliation.status` | Symbol | Confidence Range |
|---|---|---|
| `confirmed` (bearing + distance agree) | `✓` | 85–100 |
| `confirmed` (bearing agrees, no visual distance) | `~` | 70–84 |
| `text_only` (no visual measurement, single OCR reading) | `?` | 50–69 |
| `conflict` (bearing disagreement ≤ 0°30') | `✗` | 25–49 |
| `conflict` (bearing disagreement > 0°30' or critical watermark) | `✗✗` | 0–24 |

### 5.6 Synthesis Prompt for Lot-Level Extraction

After OCR + geometric reconciliation produces raw text, the final synthesis call converts it to structured lot data. This builds on the existing `RECONCILIATION_PROMPT_2` pattern in `property-validation-pipeline.ts`.

The synthesis call takes:
- Merged OCR text from `adaptiveVisionOcr().mergedText`
- Reconciliation summary from `reconcileGeometry()`
- An explicit request for JSON output with lot-by-lot metes and bounds

**Model:** `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'`  
**Max tokens:** 8192  
**Temperature:** 0 (deterministic)

### 5.7 Multi-Page Handling

Subdivision plats are typically 1–3 pages:
- **Page 1:** Survey drawing (lots, boundaries, bearings, distances, curves)
- **Page 2:** Certificate block (surveyor signature, notes, setbacks, curve table)
- **Page 3+:** Additional sheets (large subdivisions)

`analyzePlat()` processes all pages and merges results. Lots found on page 2 are added to those from page 1; notes and table data from page 2 supplement page 1 data.

---

## 6. Pipeline B — Deed Text Analysis (AIDeedAnalyzer)

**File:** `worker/src/services/ai-deed-analyzer.ts`  
**Status:** ❌ Must create  
**Builds on:** `ai-extraction.ts`

### 6.1 What It Does

`AIDeedAnalyzer` wraps the existing `extractDocuments()` function from `ai-extraction.ts` and converts its `ExtractedBoundaryData` output into a structured `DeedAnalysisResult` that feeds into `DeedChainEntry` objects in `PropertyIntelligence`.

### 6.2 Key Implementation Rules

- **Use `extractDocuments()`** from `ai-extraction.ts` — do not rewrite extraction logic.
- The existing `extractDocuments()` already handles: multi-page documents, image + text extraction, adaptive vision routing for large images, retry logic, and confidence scoring.
- `AIDeedAnalyzer` adds: structured grantor/grantee extraction, parent tract identification, `calledFrom` references, and conversion to `DeedChainEntry`.

### 6.3 Interface

```typescript
// worker/src/services/ai-deed-analyzer.ts

import { extractDocuments } from './ai-extraction.js';
import type { DocumentResult } from '../types/index.js';
import type { P3BoundaryCall, DeedChainEntry, ExtractionSource } from '../models/property-intelligence.js';
import type { PipelineLogger } from '../lib/logger.js';

export interface DeedAnalysisResult {
  grantor: string;
  grantee: string;
  deedDate?: string;              // ISO date
  recordingDate?: string;         // ISO date
  instrumentNumber?: string;
  volumePage?: { volume: string; page: string };
  calledAcreage?: number;
  surveyReference?: string;       // "WILLIAM HARTRICK SURVEY, A-488"
  parentTract?: string;           // Description of parent tract
  parentInstrument?: string;
  metesAndBounds: P3BoundaryCall[];
  calledFrom: {
    name: string;
    reference?: string;
    acreage?: number;
    direction?: string;
  }[];
  easementsMentioned: string[];
  coordinateInfo?: {
    datum?: string;
    zone?: string;
    pob?: { northing?: number; easting?: number };
  };
  specialNotes: string[];
  confidence: number;             // 0–100
  rawExtraction?: import('../types/index.js').ExtractedBoundaryData;
  totalApiCalls: number;
}

export class AIDeedAnalyzer {
  constructor(private apiKey: string, private logger: PipelineLogger) {}

  async analyzeDeed(
    documentResults: DocumentResult[],   // From Phase 2 HarvestedDocument images
    projectId: string,
  ): Promise<DeedAnalysisResult> {
    // 1. Call extractDocuments() from ai-extraction.ts
    // 2. Convert ExtractedBoundaryData.calls → P3BoundaryCall[]
    //    (map bearing/distance/curve/confidence, set source = 'deed_text')
    // 3. Run a structured-extraction pass to get grantor/grantee/calledFrom
    // 4. Return DeedAnalysisResult
  }

  toDeedChainEntry(result: DeedAnalysisResult): DeedChainEntry {
    // Convert DeedAnalysisResult → DeedChainEntry for PropertyIntelligence.deedChain
  }

  /**
   * Convert an ExtractedBoundaryData.calls[] to P3BoundaryCall[]
   * with source = 'deed_text' and confidenceSymbol based on confidence value.
   */
  private convertCalls(
    calls: import('../types/index.js').BoundaryCall[],
    source: ExtractionSource,
  ): P3BoundaryCall[] {
    // Map each call; use completeBoundaryCallCurve() from curve-params.ts
    // for any curve calls with missing parameters.
  }
}
```

### 6.4 Structured Extraction Prompt for Deed Metadata

After `extractDocuments()` extracts the boundary calls, a second AI call extracts deed metadata (grantor, grantee, calledFrom, etc.) in JSON format. This call uses the merged OCR text as input.

```typescript
// Structured deed metadata extraction prompt
const DEED_METADATA_PROMPT = `Given this Texas deed document text, extract structured metadata.

Return ONLY valid JSON (no markdown):
{
  "grantor": "full legal name",
  "grantee": "full legal name",
  "deedDate": "YYYY-MM-DD or null",
  "recordingDate": "YYYY-MM-DD or null",
  "instrumentNumber": "string or null",
  "volumePage": { "volume": "string", "page": "string" } or null,
  "calledAcreage": number or null,
  "surveyReference": "JOHN SMITH SURVEY, A-123 or null",
  "parentTract": "description of the larger tract this was carved from, or null",
  "parentInstrument": "instrument number of parent tract deed, or null",
  "calledFrom": [
    { "name": "R.K. GAINES", "reference": "Vol 1234, Pg 567", "acreage": 4.0, "direction": "north" }
  ],
  "easementsMentioned": ["15' utility easement along west boundary"],
  "coordinateInfo": { "datum": "NAD83", "zone": "Texas Central", "pob": { "northing": 10338070.754, "easting": 3215765.737 } } or null,
  "specialNotes": ["any unusual provisions or restrictions"]
}`;
```

---

## 7. Pipeline C — Property Context Analysis (AIContextAnalyzer)

**File:** `worker/src/services/ai-context-analyzer.ts`  
**Status:** ❌ Must create  
**Builds on:** `property-validation-pipeline.ts` (the synthesis and cross-validation calls)

### 7.1 What It Does

`AIContextAnalyzer` is the "big brain" final analysis step. It examines ALL extracted data and makes intelligent determinations about the property: type, development history, red flags, data quality, and specific purchase recommendations.

### 7.2 Key Implementation Rules

- **Reference `runPropertyValidationPipeline()`** from `property-validation-pipeline.ts` for the synthesis logic structure — particularly the `SYNTHESIS_PROMPT` and `RECONCILIATION_PROMPT` patterns it uses.
- `AIContextAnalyzer` takes a different input shape (Phase 3 data) and produces `ConfidenceSummary` + `Discrepancy[]` for `PropertyIntelligence`.
- The discrepancy identification logic in `property-validation-pipeline.ts` (the `RECONCILIATION_PROMPT` that produces the per-call confidence symbols table) feeds directly into `PropertyIntelligence.discrepancies`.

### 7.3 Interface

```typescript
// worker/src/services/ai-context-analyzer.ts

import type {
  PropertyIntelligence,
  Discrepancy,
  AdjacentProperty,
} from '../models/property-intelligence.js';
import type { PlatAnalysisResult } from './ai-plat-analyzer.js';
import type { DeedAnalysisResult } from './ai-deed-analyzer.js';
import type { HarvestResult } from '../services/document-harvester.js';
import type { PipelineLogger } from '../lib/logger.js';

export interface ContextAnalysisResult {
  propertyType: PropertyIntelligence['property']['propertyType'];
  propertyTypeReasoning: string;
  discrepancies: Discrepancy[];
  adjacentPropertyAssessment: string;
  historicalContext: string;
  developmentImplications: string;
  redFlags: string[];
  dataQualityAssessment: string;
  confidenceSummary: PropertyIntelligence['confidenceSummary'];
  analysisNotes: string;
  totalApiCalls: number;
}

export class AIContextAnalyzer {
  constructor(private apiKey: string, private logger: PipelineLogger) {}

  async analyzeContext(
    platResult: PlatAnalysisResult,
    deedResults: DeedAnalysisResult[],
    harvestSummary: HarvestResult,
  ): Promise<ContextAnalysisResult> {
    // 1. Build context summary (lots, calls, adjacent owners, roads, discrepancies)
    // 2. Make single structured AI call for property type + context analysis
    // 3. Compute confidence summary:
    //    - Count calls by symbol: ✓ ~ ? ✗ ✗✗
    //    - Overall = (✓×100 + ~×75 + ?×50 + ✗×25 + ✗✗×0) / totalCalls
    //    - Rating: EXCELLENT(≥90) GOOD(≥75) FAIR(≥55) LOW(≥35) INSUFFICIENT(<35)
    // 4. Build documentRecommendations (ranked by confidence-gain-per-dollar)
    // 5. Identify discrepancies (from reconciliation conflicts + area mismatches)
  }
}
```

### 7.4 Context Analysis Prompt

```typescript
const CONTEXT_ANALYSIS_PROMPT = `You are a senior licensed Texas professional land surveyor (RPLS) and title researcher. Analyze this property's extracted data.

=== PROPERTY DATA ===
Lots found: {TOTAL_LOTS}
Lot names: {LOT_NAMES}
Adjacent owners: {ADJACENT_OWNERS}
Roads: {ROADS}
Total boundary calls extracted: {TOTAL_CALLS}
Confirmed calls (✓): {CONFIRMED}
Deduced calls (~): {DEDUCED}
Unconfirmed calls (?): {UNCONFIRMED}
Discrepancy calls (✗): {DISCREPANCY}
Critical calls (✗✗): {CRITICAL}

=== DEED INFORMATION ===
{DEED_SUMMARY}

=== DOCUMENTS AVAILABLE ===
{HARVEST_SUMMARY}

Return ONLY valid JSON (no markdown):
{
  "propertyType": "subdivision" | "standalone_tract" | "lot_in_subdivision" | "unknown",
  "propertyTypeReasoning": "explanation",
  "redFlags": ["list of concerns"],
  "historicalContext": "description of development history and datum considerations",
  "adjacentPropertyPriority": ["owner name ranked by research value"],
  "dataQualityNotes": "overall assessment of document quality",
  "documentRecommendations": [
    {
      "document": "description",
      "source": "County Clerk | TexasFile | TxDOT RPAM",
      "estimatedPrice": 5.00,
      "confidenceImpact": "64% → 90%+",
      "priority": "high" | "medium" | "low",
      "reasoning": "why this document matters"
    }
  ],
  "discrepancies": [
    {
      "id": "DISC-001",
      "severity": "critical" | "moderate" | "minor" | "informational",
      "category": "bearing_conflict" | "distance_conflict" | "area_conflict" | "datum_shift" | "missing_data" | "road_geometry" | "monument_conflict" | "other",
      "description": "what is wrong",
      "likelyCorrect": "best determination if available",
      "basis": "reasoning for best determination",
      "resolution": "what to do to resolve this"
    }
  ]
}`;
```

### 7.5 Confidence Scoring Formula

```typescript
function computeConfidenceSummary(
  lots: LotData[],
  perimeterCalls: P3BoundaryCall[],
): PropertyIntelligence['confidenceSummary'] {
  // Gather all calls across all lots + perimeter
  const allCalls = [
    ...perimeterCalls,
    ...lots.flatMap(l => [...l.boundaryCalls, ...l.curves]),
  ];

  const counts = {
    confirmed:    allCalls.filter(c => c.confidenceSymbol === '✓').length,
    deduced:      allCalls.filter(c => c.confidenceSymbol === '~').length,
    unconfirmed:  allCalls.filter(c => c.confidenceSymbol === '?').length,
    discrepancy:  allCalls.filter(c => c.confidenceSymbol === '✗').length,
    critical:     allCalls.filter(c => c.confidenceSymbol === '✗✗').length,
  };
  const total = allCalls.length;

  // Weighted scoring: ✓=100, ~=75, ?=50, ✗=25, ✗✗=0
  const weightedSum =
    counts.confirmed * 100 +
    counts.deduced   * 75 +
    counts.unconfirmed * 50 +
    counts.discrepancy * 25 +
    counts.critical  * 0;

  const overall = total > 0 ? Math.round(weightedSum / total) : 0;

  const rating: PropertyIntelligence['confidenceSummary']['rating'] =
    overall >= 90 ? 'EXCELLENT' :
    overall >= 75 ? 'GOOD' :
    overall >= 55 ? 'FAIR' :
    overall >= 35 ? 'LOW' :
                    'INSUFFICIENT';

  return {
    overall,
    rating,
    confirmedCalls:    counts.confirmed,
    deducedCalls:      counts.deduced,
    unconfirmedCalls:  counts.unconfirmed,
    discrepancyCalls:  counts.discrepancy,
    criticalCalls:     counts.critical,
    totalCalls:        total,
    biggestGap:        '',  // filled by AIContextAnalyzer
    recommendedAction: '',  // filled by AIContextAnalyzer
    documentRecommendations: [], // filled by AIContextAnalyzer
  };
}
```

---

## 8. AIDocumentAnalyzer Orchestrator

**File:** `worker/src/services/ai-document-analyzer.ts`  
**Status:** ❌ Must create

### 8.1 What It Does

Top-level Phase 3 orchestrator. Takes the path to a Phase 2 `harvest_result.json`, routes every document to the appropriate pipeline (A, B, or C), and assembles the final `PropertyIntelligence`.

### 8.2 Document Routing Logic

| Document Type | Pipeline | Priority | Notes |
|---|---|---|---|
| `plat`, `replat`, `amended_plat` | A (AIPlatAnalyzer) | P0 — highest value | Multiple plat pages → `analyzePlat(imageBuffers[])` |
| `warranty_deed`, `special_warranty_deed`, `quitclaim_deed` | B (AIDeedAnalyzer) | P1 | Target deed → first DeedChainEntry |
| `easement`, `utility_easement`, `drainage_easement`, `access_easement` | B (AIDeedAnalyzer) | P2 | Populates `PropertyIntelligence.easements` |
| `restrictive_covenant`, `deed_restriction`, `ccr` | B (AIDeedAnalyzer) | P2 | Populates lot notes |
| `right_of_way`, `dedication` | B (AIDeedAnalyzer) | P1 | Populates `PropertyIntelligence.roads` |
| All others | B (AIDeedAnalyzer) | P3 | General text extraction |

### 8.3 Interface

```typescript
// worker/src/services/ai-document-analyzer.ts

import fs from 'fs';
import path from 'path';
import { AIPlatAnalyzer } from './ai-plat-analyzer.js';
import { AIDeedAnalyzer } from './ai-deed-analyzer.js';
import { AIContextAnalyzer } from './ai-context-analyzer.js';
import type { PropertyIntelligence } from '../models/property-intelligence.js';
import type { HarvestResult, HarvestedDocument } from './document-harvester.js';
import type { PipelineLogger } from '../lib/logger.js';

export interface AnalyzeInput {
  projectId: string;
  harvestResultPath: string;    // Path to Phase 2 harvest_result.json
}

export interface AnalyzeResult {
  status: 'complete' | 'partial' | 'failed';
  intelligence: PropertyIntelligence | null;
  errors: string[];
  outputPath: string;           // /tmp/analysis/{projectId}/property_intelligence.json
}

export class AIDocumentAnalyzer {
  private platAnalyzer: AIPlatAnalyzer;
  private deedAnalyzer: AIDeedAnalyzer;
  private contextAnalyzer: AIContextAnalyzer;
  private logger: PipelineLogger;

  constructor(apiKey: string, logger: PipelineLogger) {
    this.logger = logger;
    this.platAnalyzer = new AIPlatAnalyzer(apiKey, logger);
    this.deedAnalyzer = new AIDeedAnalyzer(apiKey, logger);
    this.contextAnalyzer = new AIContextAnalyzer(apiKey, logger);
  }

  async analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
    const startTime = Date.now();
    const outputDir = `/tmp/analysis/${input.projectId}`;
    fs.mkdirSync(outputDir, { recursive: true });

    // 1. Load Phase 2 harvest result
    const harvestResult: HarvestResult = JSON.parse(
      fs.readFileSync(input.harvestResultPath, 'utf-8'),
    );

    // 2. Route documents
    const platDocuments = this.extractPlatDocuments(harvestResult);
    const deedDocuments = this.extractDeedDocuments(harvestResult);

    // 3. Run Pipeline A: Plat Analysis
    const platImageBuffers = this.loadImageBuffers(platDocuments);
    const platResult = await this.platAnalyzer.analyzePlat(platImageBuffers, input.projectId);

    // 4. Run Pipeline B: Deed Analysis (for each deed document)
    const deedResults = await Promise.all(
      deedDocuments.map(doc => this.analyzeDeedDocument(doc, input.projectId)),
    );

    // 5. Run Pipeline C: Context Analysis
    const contextResult = await this.contextAnalyzer.analyzeContext(
      platResult,
      deedResults,
      harvestResult,
    );

    // 6. Assemble PropertyIntelligence
    const intelligence = this.assemblePropertyIntelligence(
      input.projectId,
      harvestResult,
      platResult,
      deedResults,
      contextResult,
      Date.now() - startTime,
    );

    // 7. Save to disk
    const outputPath = path.join(outputDir, 'property_intelligence.json');
    fs.writeFileSync(outputPath, JSON.stringify(intelligence, null, 2));

    return { status: 'complete', intelligence, errors: [], outputPath };
  }

  private extractPlatDocuments(harvest: HarvestResult): HarvestedDocument[] {
    const platTypes = ['plat', 'replat', 'amended_plat', 'vacating_plat'];
    return [
      ...harvest.documents.target.plats,
      ...(harvest.documents.subdivision.masterPlat ? [harvest.documents.subdivision.masterPlat] : []),
    ].filter(d => platTypes.includes(d.documentType));
  }

  private extractDeedDocuments(harvest: HarvestResult): HarvestedDocument[] {
    const deedTypes = [
      'warranty_deed', 'special_warranty_deed', 'quitclaim_deed',
      'easement', 'utility_easement', 'drainage_easement', 'access_easement',
      'restrictive_covenant', 'deed_restriction', 'ccr',
      'right_of_way', 'dedication',
    ];
    return [
      ...harvest.documents.target.deeds,
      ...harvest.documents.target.easements,
      ...harvest.documents.target.restrictions,
      ...harvest.documents.subdivision.restrictiveCovenants,
      ...harvest.documents.subdivision.utilityEasements,
    ].filter(d => deedTypes.includes(d.documentType));
  }

  private loadImageBuffers(documents: HarvestedDocument[]): Buffer[] {
    const buffers: Buffer[] = [];
    for (const doc of documents) {
      for (const imagePath of doc.images) {
        if (fs.existsSync(imagePath)) {
          buffers.push(fs.readFileSync(imagePath));
        }
      }
    }
    return buffers;
  }

  private async analyzeDeedDocument(
    doc: HarvestedDocument,
    projectId: string,
  ): Promise<import('./ai-deed-analyzer.js').DeedAnalysisResult> {
    // Load images, convert to DocumentResult[], pass to deedAnalyzer
  }

  private assemblePropertyIntelligence(
    projectId: string,
    harvest: HarvestResult,
    plat: import('./ai-plat-analyzer.js').PlatAnalysisResult,
    deeds: import('./ai-deed-analyzer.js').DeedAnalysisResult[],
    context: import('./ai-context-analyzer.js').ContextAnalysisResult,
    durationMs: number,
  ): PropertyIntelligence {
    // Combine all pipeline results into the final PropertyIntelligence object
  }
}
```

### 8.4 Output File Convention

Results are saved to `/tmp/analysis/{projectId}/property_intelligence.json`. This is the canonical output path that downstream phases read from. Format mirrors the `harvest_result.json` pattern established in Phase 2.

> **TODO (post Phase 3):** Upload `property_intelligence.json` to Supabase Storage at `{projectId}/property_intelligence.json` and update the `research_projects` row.

---

## 9. Express API Endpoint — POST /research/analyze

**File:** `worker/src/index.ts` (add to existing file)  
**Status:** ❌ Must add

Add the following endpoints to the existing Express server. Follow the same async pattern as `POST /research/harvest` (return 202, run in background, persist to filesystem).

### POST /research/analyze

```typescript
// ── POST /research/analyze ─────────────────────────────────────────────────
// Phase 3: AI Document Intelligence.
// Takes the Phase 2 harvest result path and runs all AI extraction pipelines.
// Long-running (3–10 minutes for a 6-lot subdivision). Returns HTTP 202 immediately.
// Results saved to /tmp/analysis/{projectId}/property_intelligence.json.

app.post('/research/analyze', requireAuth, async (req: Request, res: Response) => {
  const { projectId, harvestResultPath } = req.body as {
    projectId?: string;
    harvestResultPath?: string;
  };

  if (!projectId || !harvestResultPath) {
    res.status(400).json({ error: 'projectId and harvestResultPath are required' });
    return;
  }

  // Validate projectId — prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  // Validate harvest result path exists and is within /tmp/harvest/
  const resolvedPath = path.resolve(harvestResultPath);
  if (!resolvedPath.startsWith('/tmp/harvest/') || !fs.existsSync(resolvedPath)) {
    res.status(400).json({ error: 'harvestResultPath must point to an existing file under /tmp/harvest/' });
    return;
  }

  res.status(202).json({
    status: 'accepted',
    projectId,
    pollUrl: `/research/analyze/${projectId}`,
  });

  // Run analysis in background
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error(`[Analyze] ANTHROPIC_API_KEY not set — cannot run Phase 3 for ${projectId}`);
    return;
  }

  const { AIDocumentAnalyzer } = await import('./services/ai-document-analyzer.js');
  const { PipelineLogger } = await import('./lib/logger.js');

  const logger = new PipelineLogger(projectId);
  const analyzer = new AIDocumentAnalyzer(anthropicApiKey, logger);

  try {
    const result = await analyzer.analyze({ projectId, harvestResultPath: resolvedPath });
    console.log(`[Analyze] Complete: ${projectId} — ${result.intelligence?.lots.length ?? 0} lots extracted`);
  } catch (err) {
    console.error(`[Analyze] Failed for ${projectId}:`, err);
  }
});
```

### GET /research/analyze/:projectId

```typescript
// ── GET /research/analyze/:projectId ──────────────────────────────────────
// Returns the completed analysis or { status: "in_progress" }.

app.get('/research/analyze/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/analysis/${projectId}/property_intelligence.json`;

  if (fs.existsSync(resultPath)) {
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
    res.json(result);
  } else {
    res.json({ status: 'in_progress' });
  }
});
```

---

## 10. CLI Script — analyze.sh

**File:** `worker/analyze.sh`  
**Status:** ❌ Must create  
**Pattern:** Follow the same structure as `worker/harvest.sh`

```bash
#!/bin/bash
# worker/analyze.sh — Run Phase 3 AI document intelligence on a harvested project.
# Calls POST /research/analyze on the local research worker.
#
# Usage: ./analyze.sh <projectId> [harvestResultPath]
#
# Examples:
#   ./analyze.sh ash-trust-001
#   ./analyze.sh ash-trust-001 /tmp/harvest/ash-trust-001/harvest_result.json

PROJECT_ID="$1"
HARVEST_PATH="${2:-/tmp/harvest/$PROJECT_ID/harvest_result.json}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./analyze.sh <projectId> [harvestResultPath]"
  echo ""
  echo "Example:"
  echo "  ./analyze.sh ash-trust-001"
  echo "  ./analyze.sh ash-trust-001 /tmp/harvest/ash-trust-001/harvest_result.json"
  exit 1
fi

# Verify harvest result exists
if [ ! -f "$HARVEST_PATH" ]; then
  echo "[ERROR] Harvest result not found: $HARVEST_PATH"
  echo "        Run ./harvest.sh first, or provide the correct path as the second argument."
  exit 1
fi

# Load environment variables
# shellcheck disable=SC1091
source /root/starr-worker/.env

echo "==================================="
echo "  Starr AI Document Analyzer"
echo "  (Phase 3 Intelligence)"
echo "==================================="
echo "Project:     $PROJECT_ID"
echo "Harvest:     $HARVEST_PATH"
echo ""

# Fire and forget — worker runs async and saves result to filesystem
curl -s -X POST http://localhost:3100/research/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"harvestResultPath\": \"$HARVEST_PATH\"
  }"

echo ""
echo ""
echo "Analysis started (3-10 minutes for a 6-lot subdivision)."
echo ""
echo "Monitor progress:"
echo "  pm2 logs starr-worker --lines 50"
echo ""
echo "Check completion status:"
echo "  curl -s http://localhost:3100/research/analyze/$PROJECT_ID \\"
echo "    -H \"Authorization: Bearer \$WORKER_API_KEY\" | python3 -m json.tool | head -50"
echo ""
echo "View full intelligence file:"
echo "  cat /tmp/analysis/$PROJECT_ID/property_intelligence.json | python3 -m json.tool"
echo ""
echo "Summary of results (after completion):"
echo "  cat /tmp/analysis/$PROJECT_ID/property_intelligence.json | python3 -c \\"
echo "    \"import json,sys; d=json.load(sys.stdin); print('Lots:', len(d.get('lots',[])), '| Confidence:', d.get('confidenceSummary',{}).get('overall','?'), '% —', d.get('confidenceSummary',{}).get('rating','?'))\""
```

---

## 11. File Map

### Files CREATED in Phase 3 Build

```
worker/
├── src/
│   ├── models/
│   │   └── property-intelligence.ts   ✅ Phase 3 data model (PropertyIntelligence + all sub-types)
│   └── services/
│       ├── ai-plat-analyzer.ts        ✅ Plat extraction orchestrator (wraps adaptive-vision + geo-reconcile)
│       ├── ai-deed-analyzer.ts        ✅ Deed extraction wrapper (wraps ai-extraction.ts)
│       ├── ai-context-analyzer.ts     ✅ Context + discrepancy analysis
│       └── ai-document-analyzer.ts    ✅ Phase 3 top-level orchestrator
└── analyze.sh                         ✅ CLI script (like harvest.sh)
```

### Files MODIFIED in Phase 3 Build

```
worker/
└── src/
    └── index.ts                       ✅ Added POST /research/analyze and GET /research/analyze/:projectId
```

### Files That Must Be READ Before Writing (Do Not Modify)

```
worker/
└── src/
    ├── services/
    │   ├── adaptive-vision.ts         ✅ USE: adaptiveVisionOcr()
    │   ├── ai-extraction.ts           ✅ USE: extractDocuments(), screenDocument(), parseExtractionResponse()
    │   ├── geo-reconcile.ts           ✅ USE: analyzeVisualGeometry(), reconcileGeometry(), runGeoReconcile()
    │   ├── adjacent-research.ts       ✅ USE: extractAdjacentCandidates() — for adjacentProperties population
    │   └── property-validation-pipeline.ts  ✅ REFERENCE: prompt patterns + synthesis logic
    ├── lib/
    │   ├── curve-params.ts            ✅ USE: completeCurveParams(), completeBoundaryCallCurve()
    │   ├── coordinates.ts             ✅ USE: nad83TexasCentralToWGS84() when POB has state-plane coords
    │   └── logger.ts                  ✅ USE: PipelineLogger throughout
    ├── types/
    │   ├── index.ts                   ✅ REFERENCE: ExtractedBoundaryData, BoundaryCall (legacy types still used)
    │   └── document-harvest.ts        ✅ USE: HarvestResult, HarvestedDocument (Phase 2 output types)
    └── adapters/
        └── clerk-adapter.ts           ✅ USE: DocumentType enum for document routing
```

### Files That Are LEGACY (do not delete, do not modify for Phase 3)

```
worker/
└── src/
    └── services/
        ├── pipeline.ts                ⚠️  Legacy pipeline — still used by POST /research/property-lookup
        ├── bell-clerk.ts              ⚠️  Legacy Kofile scraper — still imported by pipeline.ts
        ├── reanalysis.ts              ⚠️  Phase 9 re-analysis — do not touch
        ├── report-generator.ts        ⚠️  Phase 10 reports — do not touch
        └── property-validation-pipeline.ts  ⚠️  Used by pipeline.ts, reference for prompt patterns
```

---

## 12. Acceptance Criteria

### Functional Requirements

- [x] Given a Phase 2 harvest result, `POST /research/analyze` returns HTTP 202 within 1 second — path validation + background job pattern implemented
- [x] `GET /research/analyze/ash-trust-001` returns `{ status: "in_progress" }` during processing and the full `PropertyIntelligence` JSON when complete
- [x] Intelligence file is saved to `/tmp/analysis/{projectId}/property_intelligence.json`
- [x] `analyze.sh` script built — mirrors `harvest.sh` pattern with harvest validation + polling instructions
- [ ] **LIVE TEST NEEDED**: Full analysis completes in ≤ 10 minutes for a 6-lot subdivision (requires real Phase 2 output on the worker droplet with `ANTHROPIC_API_KEY` set)

### Plat Analysis (Pipeline A)

- [x] `AIPlatAnalyzer.analyzePlat()` uses `adaptiveVisionOcr()` from `adaptive-vision.ts` (no reimplementation of segmentation)
- [x] `AIPlatAnalyzer.analyzePlat()` uses `analyzeVisualGeometry()` and `reconcileGeometry()` from `geo-reconcile.ts`
- [x] All curve calls have `completeCurveParams()` applied to fill any missing curve parameters
- [x] `confidenceSymbol` is set correctly for each call based on reconciliation status (tested in unit tests)
- [x] Adjacent owners identified from both plat text and deed `calledFrom` references
- [x] Roads classified by type (FM/SH/US/county/private)
- [ ] **LIVE TEST NEEDED**: Correctly identifies all 6 lots in ASH FAMILY TRUST plat (requires real plat images)
- [ ] **LIVE TEST NEEDED**: Extracts ≥80% of visible bearings from watermarked plat

### Deed Analysis (Pipeline B)

- [x] `AIDeedAnalyzer.analyzeDeed()` uses `extractDocuments()` from `ai-extraction.ts` (no reimplementation)
- [x] Grantor, grantee, instrument number, recording date extracted (metadata AI call)
- [x] `calledFrom` array populated with adjacent property names and recording references
- [x] Metes and bounds calls converted to `P3BoundaryCall[]` with `source: 'deed_text'`
- [x] Varas-to-feet conversion applied correctly (1 vara = 2.7778 feet) — verified in unit tests
- [x] Parent tract identified when deed carves from a larger tract
- [ ] **LIVE TEST NEEDED**: Full deed extraction accuracy on real documents

### Context Analysis (Pipeline C)

- [x] Confidence summary reflects actual call counts and weighted scoring formula — fully tested in 600 passing unit tests
- [x] `rating` correctly maps: EXCELLENT(≥90%) GOOD(≥75%) FAIR(≥55%) LOW(≥35%) INSUFFICIENT(<35%) — unit tested
- [x] All `ReconciliationResult.bearingConflicts` seed initial discrepancies in `PropertyIntelligence.discrepancies`
- [x] `biggestGap` and `recommendedAction` populated by AI context call (with fallback if call fails)
- [ ] **LIVE TEST NEEDED**: `propertyType` correctly identified as `subdivision` for ASH FAMILY TRUST (requires real documents)

### Data Model

- [x] `PropertyIntelligence` exports from `worker/src/models/property-intelligence.ts` with zero TypeScript errors in Phase 3 files
- [x] `PropertyIntelligence.aiCallLog.totalAPICalls` accurately reflects total API calls (sum of pipeline A + B + C)
- [x] `PropertyIntelligence.version` is `'3.0'`
- [x] No field in `PropertyIntelligence` is ever fabricated — all `undefined`/`null` when AI can't extract
- [x] `computeConfidenceSummary()` and `toConfidenceSymbol()` exported from the model and tested

### Integration

- [x] Phase 4 can consume `PropertyIntelligence.lots` and `PropertyIntelligence.perimeterBoundary` directly (types compatible)
- [x] Phase 5 can consume `PropertyIntelligence.adjacentProperties[].instrumentNumbers` and `sharedCalls` as starting points
- [x] Phase 7 can consume `PropertyIntelligence.lots[].boundaryCalls[].allReadings[]` with sources for weighted reconciliation

### Implementation Rules (from STARR_RECON_PHASE_ROADMAP.md §12)

- [x] All AI calls use `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'` — no hardcoded model names
- [x] All image processing uses `sharp` npm package — no ImageMagick shell calls
- [x] All logging uses `PipelineLogger` from `lib/logger.ts` — no raw `console.log` in service layer
- [x] `projectId` is included in every log line (PipelineLogger constructor takes projectId)
- [x] `ANTHROPIC_API_KEY` read from `process.env` — never hardcoded
- [ ] **NOTE**: `lib/rate-limiter.ts` does not exist in current codebase; Anthropic SDK has built-in retry (exponential backoff). No additional retry wrapper was added.

---

*Previous: `PHASE_02_DOCUMENT_HARVEST.md` — Free Document Harvesting*  
*Next: `PHASE_04_SUBDIVISION.md` — Subdivision & Plat Intelligence*
