# STARR RECON — Phase 5: Adjacent Property Deep Research & Boundary Cross-Validation

**Product:** Starr Compass — AI Property Research (STARR RECON)  
**Version:** 1.0 | **Last Updated:** March 2026  
**Phase Duration:** Weeks 13–15  
**Depends On:** Phase 3 (`PropertyIntelligence` with `adjacentProperties[]`), Phase 4 (`subdivision.json` — optional)  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

Given the `PropertyIntelligence` output from Phase 3, autonomously research **every adjacent property** — run each through its own mini Phases 1–3 (discovery → document harvest → AI extraction), then compare each neighbor's shared boundary calls against the target property's calls. Apply bearing-reversal cross-validation and produce a `cross_validation.json` that surfaces confirmed matches, marginal conflicts, and discrepancies for Phase 7 (Reconciliation) to consume.

**Deliverable:** An `AdjacentResearchOrchestrator` that reads Phase 3 output, runs Phase 1–3 sub-pipelines on every neighbor, cross-validates every shared call, and saves `cross_validation.json` to disk.

---

## Table of Contents

1. [What This Phase Must Accomplish](#1-what-this-phase-must-accomplish)
2. [Current State of the Codebase](#2-current-state-of-the-codebase)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Data Models — Types](#4-core-data-models--types)
5. [§5.3 Adjacent Queue Builder](#53-adjacent-queue-builder)
6. [§5.4 Adjacent Property Research Worker (Mini-Pipeline)](#54-adjacent-property-research-worker-mini-pipeline)
7. [§5.5 Cross-Validation Engine](#55-cross-validation-engine)
8. [§5.6 Phase 5 Orchestrator](#56-phase-5-orchestrator)
9. [§5.7 Express API Endpoints](#57-express-api-endpoints)
10. [§5.8 CLI Script — adjacent.sh](#58-cli-script--adjacentsh)
11. [File Map](#11-file-map)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. What This Phase Must Accomplish

After Phase 3 produces `intelligence.json`, Phase 5 researches every neighbor and validates shared boundaries:

```bash
curl -X POST http://localhost:3100/research/adjacent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "intelligencePath": "/tmp/analysis/ash-trust-001/intelligence.json"
  }'
```

**Returns HTTP 202 immediately.** Poll for progress:

```bash
curl http://localhost:3100/research/adjacent/ash-trust-001 \
  -H "Authorization: Bearer $WORKER_API_KEY"
```

Full result shape (saved to `/tmp/adjacent/{projectId}/cross_validation.json`):

```json
{
  "status": "complete",
  "projectId": "ash-trust-001",
  "generatedAt": "2026-03-05T21:00:00.000Z",
  "version": "5.0",
  "summary": {
    "totalCandidates": 4,
    "researched": 3,
    "notFound": 1,
    "failed": 0,
    "totalSharedCalls": 12,
    "confirmedSharedCalls": 9,
    "closeMatchCalls": 2,
    "marginalCalls": 1,
    "discrepantCalls": 0,
    "overallCrossValidationScore": 92,
    "apiCallCount": 18
  },
  "adjacentProperties": [
    {
      "candidate": {
        "ownerName": "RK GAINES",
        "calledAcreage": "46",
        "recordingRef": {
          "instrumentNumber": "1998024561",
          "volume": null,
          "page": null
        },
        "direction": "north",
        "borderCallSeqs": [3, 4, 5]
      },
      "status": "researched",
      "discoveryResult": {
        "propertyId": "481220",
        "owner": "RK GAINES TRUST",
        "county": "Bell",
        "acreage": 46.12
      },
      "extractedBoundary": {
        "type": "metes_and_bounds",
        "calls": [ "... 14 calls ..." ]
      },
      "sharedBoundaryCalls": [
        {
          "targetSeq": 3,
          "targetBearing": "N 45°28'15\" E",
          "targetDistance_ft": 892.40,
          "neighborBearing": "S 45°28'18\" W",
          "neighborDistance_ft": 892.40,
          "bearingDiff_deg": 0.000833,
          "distanceDiff_ft": 0.00,
          "bearingRating": "CONFIRMED",
          "distanceRating": "CONFIRMED",
          "overallRating": "CONFIRMED"
        }
      ],
      "confirmedCount": 3,
      "discrepancyCount": 0,
      "errorMessage": null
    },
    {
      "candidate": { "ownerName": "NORDYKE", "calledAcreage": "10", "recordingRef": {...}, "direction": "east", "borderCallSeqs": [6, 7] },
      "status": "not_found",
      "discoveryResult": null,
      "extractedBoundary": null,
      "sharedBoundaryCalls": [],
      "confirmedCount": 0,
      "discrepancyCount": 0,
      "errorMessage": "No property found in Bell CAD for owner: NORDYKE"
    }
  ],
  "timingMs": {
    "total": 485000,
    "queueBuild": 120,
    "perNeighbor": {
      "RK GAINES": 142000,
      "NORDYKE": 8500,
      "HEARTLAND RESOURCES LLC": 178000,
      "DIAMOND HOLDINGS": 156500
    }
  },
  "errors": [],
  "warnings": [
    "Subdivision cross-validation skipped — Phase 4 output not available at intelligencePath"
  ]
}
```

This must work for **any Texas county**, using the Phase 1–3 sub-pipeline with the correct county-specific CAD and clerk adapters.

---

## 2. Current State of the Codebase

### Phases 1–4 — COMPLETE ✅

| Phase | Files | Status |
|-------|-------|--------|
| 1 — Discovery | `discovery-engine.ts`, `property-discovery.ts`, `bis-adapter.ts`, `trueautomation-adapter.ts`, `tyler-adapter.ts`, `generic-cad-adapter.ts` | ✅ Done |
| 2 — Harvest | `document-harvester.ts`, `kofile-clerk-adapter.ts`, `texasfile-adapter.ts`, `clerk-adapter.ts` | ✅ Done |
| 3 — Extraction | `ai-extraction.ts`, `adaptive-vision.ts`, `ai-document-analyzer.ts` (to be built in Phase 3 spec) | ✅ Done |
| 4 — Subdivision | `subdivision-detector.ts`, `lot-enumerator.ts`, `interior-line-analyzer.ts`, `area-reconciler.ts` (see PHASE_04_SUBDIVISION.md) | ✅ Done |

### Phase 5 — PARTIALLY BUILT 🔨

#### What Already Exists

**File:** `worker/src/services/adjacent-research.ts`

This file contains a solid foundation for Phase 5. The following are **fully implemented and should not be rewritten**:

| Export | Description | Status |
|--------|-------------|--------|
| `AdjacentPropertyCandidate` | Input type: one neighbor to research | ✅ Done |
| `SharedBoundaryCall` | Result of one shared-call comparison | ✅ Done |
| `AdjacentPropertyResult` | Full result for one neighbor | ✅ Done |
| `AdjacentResearchResult` | Aggregate result for all neighbors | ✅ Done |
| `SharedBoundaryRating` | `'CONFIRMED' \| 'CLOSE_MATCH' \| 'MARGINAL' \| 'DISCREPANCY' \| 'UNKNOWN'` | ✅ Done |
| `rateBearingDiff(diffDeg)` | Bearing tolerance table (spec §12) | ✅ Done |
| `rateDistanceDiff(diffFt)` | Distance tolerance table (spec §12) | ✅ Done |
| `overallRating(bearing, distance)` | Worst-case rating (max of two) | ✅ Done |
| `parseAzimuth(raw)` | Parses `"N 45°28'15\" E"` → decimal azimuth | ✅ Done |
| `reverseAzimuth(az)` | Adds 180° mod 360 for bearing reversal | ✅ Done |
| `angularDiff(a, b)` | Smallest angle between two azimuths (0–180°) | ✅ Done |
| `extractAdjacentCandidates(boundary, rawAdjacentProperties?)` | Builds candidate list from Phase 3 boundary + adjacent array | ✅ Done |
| `crossValidateSharedBoundary(targetBoundary, neighborBoundary, borderCallSeqs, logger)` | Compares target vs neighbor calls via bearing reversal | ✅ Done |
| `runAdjacentPropertyResearch(candidates, targetBoundary, searchAndExtract, logger, maxConcurrent?)` | Orchestrates all neighbors, calls `searchAndExtract` callback | ✅ Done (callback injection only) |

#### What Is Missing

| Item | Description | Status |
|------|-------------|--------|
| **`buildAdjacentQueue()`** | Reads `intelligence.json`, converts `adjacentProperties[]` to `AdjacentPropertyCandidate[]` with full recording references | ❌ TODO |
| **`createAdjacentMiniPipeline()`** | Returns the `searchAndExtract` callback that runs Phase 1→2→3 on a given neighbor | ❌ TODO |
| **`AdjacentResearchOrchestrator`** | Top-level class: reads `intelligence.json`, calls `buildAdjacentQueue()`, calls `runAdjacentPropertyResearch()`, writes `cross_validation.json` | ❌ TODO |
| **`CrossValidationResult`** | Disk-persisted output type for `cross_validation.json` | ❌ TODO |
| **`POST /research/adjacent`** | Express endpoint — accepts `{ projectId, intelligencePath }`, fires orchestrator async | ❌ TODO |
| **`GET /research/adjacent/:projectId`** | Status + result polling endpoint | ❌ TODO |
| **`adjacent.sh`** | CLI script (like `harvest.sh`, `analyze.sh`) | ❌ TODO |
| **Phase 7 integration** | Pass `cross_validation.json` path to Phase 7 reconciliation orchestrator | ❌ TODO |

#### Key Relationship: `runAdjacentPropertyResearch()` Callback

`runAdjacentPropertyResearch()` in `adjacent-research.ts` accepts a `searchAndExtract` callback:

```typescript
searchAndExtract: (
  candidate: AdjacentPropertyCandidate,
  logger: PipelineLogger,
) => Promise<ExtractedBoundaryData | null>
```

This callback was intentionally left as a dependency injection point so the caller (`AdjacentResearchOrchestrator`) can inject the correct Phase 1–3 sub-pipeline. **Phase 5's main implementation task is writing this callback** — it is the `createAdjacentMiniPipeline()` factory function described in §5.4.

---

## 3. Architecture Overview

```
POST /research/adjacent
         │
         ▼
AdjacentResearchOrchestrator
         │
         ├── Step 1: Read /tmp/analysis/{projectId}/intelligence.json
         │
         ├── Step 2: buildAdjacentQueue(intelligence)
         │     Reads intelligence.adjacentProperties[]
         │     → AdjacentPropertyCandidate[]
         │
         ├── Step 3: (optional) merge Phase 4 subdivision.json interior lots
         │     If /tmp/adjacent/{projectId}/subdivision.json exists,
         │     add subdivision interior lot candidates to the queue
         │
         ├── Step 4: runAdjacentPropertyResearch(candidates, targetBoundary,
         │            searchAndExtract=createAdjacentMiniPipeline(...),
         │            logger, maxConcurrent=2)
         │
         │    For EACH candidate (batched, max 2 parallel):
         │    ┌───────────────────────────────────────────────────────────┐
         │    │  createAdjacentMiniPipeline() → searchAndExtract(cand)   │
         │    │                                                           │
         │    │  Step A: Phase 1 — PropertyDiscoveryEngine.discover()    │
         │    │    Input:  candidate.ownerName (or instrument# via Phase 2│
         │    │            deed search when ownerName is ambiguous)       │
         │    │    Output: PropertyIdentity | null                        │
         │    │                                                           │
         │    │  Step B: Phase 2 — DocumentHarvester.harvest()           │
         │    │    Input:  PropertyIdentity from Step A                   │
         │    │    Output: HarvestResult (adjacent owner's docs)          │
         │    │                                                           │
         │    │  Step C: Phase 3 — extractDocuments() or                 │
         │    │          AIDocumentAnalyzer.analyzeDeed()                 │
         │    │    Input:  best deed image from HarvestResult             │
         │    │    Output: ExtractedBoundaryData                          │
         │    │                                                           │
         │    │  crossValidateSharedBoundary(                            │
         │    │    targetBoundary, neighborBoundary,                     │
         │    │    candidate.borderCallSeqs, logger                      │
         │    │  ) → SharedBoundaryCall[]                                │
         │    └───────────────────────────────────────────────────────────┘
         │
         └── Step 5: Write cross_validation.json
               /tmp/adjacent/{projectId}/cross_validation.json
```

### Parallel Execution Diagram

```
Phase 3 finishes → intelligence.json ready
         │
         ├── Phase 4 (Subdivision) ──────────────────────────────────┐
         └── Phase 5 (Adjacent) ←─ starts as soon as Phase 3 done   │
                                                                     │
Phase 5 neighbor queue: [A, B, C, D, E, F]                          │
                                                                     │
Batch 1: [A, B] run simultaneously ──────────────────┐              │
Batch 2: [C, D] run simultaneously ──────────────────┤              │
Batch 3: [E, F] run simultaneously ──────────────────┘              │
                                                                     │
All results → AdjacentResearchResult →──────────────────────────────┘
    (Phase 4 output optionally merged in)
         │
         ▼
cross_validation.json (Phase 5 output)
         │
         ▼
Phase 7 Reconciliation
```

---

## 4. Core Data Models — Types

### 4.1 Types Already Defined in `adjacent-research.ts`

These interfaces and types are **already implemented** in `worker/src/services/adjacent-research.ts`. Do **not** redefine them. Import from there.

```typescript
// Already exists in worker/src/services/adjacent-research.ts

export interface AdjacentPropertyCandidate {
  ownerName: string;
  calledAcreage: string | null;
  recordingRef: {
    instrumentNumber: string | null;
    volume:           string | null;
    page:             string | null;
  };
  direction: string | null;
  /** Which boundary calls of the TARGET property border this owner */
  borderCallSeqs: number[];
}

export interface SharedBoundaryCall {
  targetSeq:           number;
  targetBearing:       string | null;
  targetDistance_ft:   number | null;
  neighborBearing:     string | null;
  neighborDistance_ft: number | null;
  bearingDiff_deg:     number | null;
  distanceDiff_ft:     number | null;
  bearingRating:       SharedBoundaryRating;
  distanceRating:      SharedBoundaryRating;
  overallRating:       SharedBoundaryRating;
}

export type SharedBoundaryRating =
  | 'CONFIRMED'    // ≤ 0°00'30" bearing or ≤ 0.5 ft distance
  | 'CLOSE_MATCH'  // ≤ 0°05'00" bearing or ≤ 2.0 ft distance
  | 'MARGINAL'     // ≤ 0°30'00" bearing or ≤ 5.0 ft distance
  | 'DISCREPANCY'  // > 0°30'00" bearing or > 5.0 ft distance
  | 'UNKNOWN';     // missing data for one side of the comparison

export interface AdjacentPropertyResult {
  candidate:           AdjacentPropertyCandidate;
  status:              'researched' | 'not_found' | 'skipped' | 'error';
  extractedBoundary:   ExtractedBoundaryData | null;
  sharedBoundaryCalls: SharedBoundaryCall[];
  confirmedCount:      number;
  discrepancyCount:    number;
  errorMessage:        string | null;
}

export interface AdjacentResearchResult {
  adjacentProperties: AdjacentPropertyResult[];
  totalCandidates:    number;
  researched:         number;
  confirmedShared:    number;
  discrepantShared:   number;
  apiCallCount:       number;
}
```

### 4.2 New Types to Add to `adjacent-research.ts`

These types are **not yet defined** and must be added to `adjacent-research.ts` (or a new `types/adjacent-research.ts` if preferred):

```typescript
// Add to worker/src/services/adjacent-research.ts (or types/adjacent-research.ts)

/**
 * Snapshot of what Phase 1 found for an adjacent property.
 * Stored in cross_validation.json so Phase 7 can use the neighbor's
 * CAD-verified acreage and owner name without re-querying.
 */
export interface AdjacentDiscoverySummary {
  propertyId:       string | null;
  owner:            string | null;
  county:           string;
  countyFIPS:       string;
  acreage:          number | null;
  legalDescription: string | null;
  cadSystem:        string | null;
  /** True if Phase 1 found a match; false if CAD search failed */
  found: boolean;
}

/**
 * Per-neighbor timing breakdown (milliseconds).
 */
export interface NeighborTimingMs {
  phase1Discovery:  number;
  phase2Harvest:    number;
  phase3Extraction: number;
  crossValidation:  number;
  total:            number;
}

/**
 * Extended AdjacentPropertyResult that includes the Phase 1 discovery summary
 * and per-neighbor timing data. Written to cross_validation.json.
 */
export interface AdjacentPropertyResultFull extends AdjacentPropertyResult {
  discoveryResult: AdjacentDiscoverySummary | null;
  timingMs:        NeighborTimingMs | null;
}

/**
 * The top-level disk-persisted output of Phase 5.
 * Saved to /tmp/adjacent/{projectId}/cross_validation.json.
 * Consumed by Phase 7 (Reconciliation).
 */
export interface CrossValidationResult {
  status:      'complete' | 'partial' | 'failed';
  projectId:   string;
  generatedAt: string;          // ISO timestamp
  version:     '5.0';

  summary: {
    totalCandidates:            number;
    researched:                 number;
    notFound:                   number;
    failed:                     number;
    totalSharedCalls:           number;
    confirmedSharedCalls:       number;
    closeMatchCalls:            number;
    marginalCalls:              number;
    discrepantCalls:            number;
    /** Weighted score 0–100 reflecting cross-validation quality */
    overallCrossValidationScore: number;
    apiCallCount:               number;
  };

  adjacentProperties: AdjacentPropertyResultFull[];

  timingMs: {
    total:       number;
    queueBuild:  number;
    perNeighbor: Record<string, number>;  // ownerName → total ms
  };

  errors:   string[];
  warnings: string[];
}
```

### 4.3 `PropertyIntelligence.adjacentProperties` — Phase 3 Input Type

Phase 5 reads `intelligence.json` produced by Phase 3. The relevant portion is:

```typescript
// Defined in worker/src/models/property-intelligence.ts (Phase 3)
// Phase 5 reads these as input — do not redefine

export interface AdjacentProperty {
  /** Owner name as found in the deed text or plat label */
  ownerName: string;
  /** Acreage called in the target deed ("along the Jones 46-acre tract") */
  calledAcreage?: string | null;
  /** Cardinal direction from target property */
  direction?: string | null;
  /** Known instrument numbers for this neighbor (from deed text or plat) */
  instrumentNumbers: string[];
  /** Volume/page references for this neighbor's deed */
  volumePageRefs: { volume: string; page: string }[];
  /** Which target boundary call sequences border this owner */
  sharedCalls: number[];
}
```

---

## 5. §5.3 Adjacent Queue Builder

**File:** `worker/src/services/adjacent-research.ts`  
**Function:** `buildAdjacentQueue(intelligence: PropertyIntelligence): AdjacentPropertyCandidate[]`  
**Status:** ❌ Must implement

### 5.1 What It Does

Reads the `PropertyIntelligence.adjacentProperties[]` array from Phase 3 output and converts each entry to an `AdjacentPropertyCandidate` suitable for `runAdjacentPropertyResearch()`.

This function also optionally merges data from Phase 4's `subdivision.json` — if the target is a subdivision, interior lots are already adjacent to each other, and their shared boundaries can also be cross-validated.

### 5.2 Implementation

```typescript
// worker/src/services/adjacent-research.ts
// Add this function

import type { PropertyIntelligence, AdjacentProperty } from '../models/property-intelligence.js';

/**
 * Build the Phase 5 research queue from Phase 3 PropertyIntelligence.
 *
 * Converts intelligence.adjacentProperties[] → AdjacentPropertyCandidate[]
 * ready for runAdjacentPropertyResearch().
 *
 * Rules:
 *  - Skips any entry with ownerName that is blank or a road name (FM, SH, US, IH, etc.)
 *  - Deduplicates by normalized ownerName (uppercase, collapse whitespace)
 *  - Prefers instrumentNumber > volume/page > owner name only
 *  - Limits queue to MAX_ADJACENT_QUEUE (default 12) to cap API cost
 */
export function buildAdjacentQueue(
  intelligence: PropertyIntelligence,
  maxQueueSize = 12,
): AdjacentPropertyCandidate[] {
  const seen = new Set<string>();
  const candidates: AdjacentPropertyCandidate[] = [];

  // Road name patterns — skip these; TxDOT ROW is Phase 6's job
  const ROAD_PATTERNS = [
    /^FM\s+\d+/i, /^RM\s+\d+/i, /^SH\s+\d+/i, /^US\s+\d+/i,
    /^IH\s+\d+/i, /^HWY\s+\d+/i, /^STATE\s+HWY/i, /^COUNTY\s+ROAD/i,
    /^CR\s+\d+/i, /^PRIVATE\s+ROAD/i, /^PUBLIC\s+ROAD/i, /^ROW/i,
    /^RIGHT.OF.WAY/i, /^TXDOT/i,
  ];

  for (const ap of (intelligence.adjacentProperties ?? [])) {
    const name = ap.ownerName?.trim();
    if (!name) continue;

    // Skip road entries
    if (ROAD_PATTERNS.some(p => p.test(name))) continue;

    // Deduplicate by normalized key
    const key = name.toUpperCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);

    // Prefer first instrument number, else first volume/page
    const inst = ap.instrumentNumbers?.[0] ?? null;
    const volPg = ap.volumePageRefs?.[0];

    candidates.push({
      ownerName:     name,
      calledAcreage: ap.calledAcreage ?? null,
      recordingRef: {
        instrumentNumber: inst,
        volume:           volPg?.volume ?? null,
        page:             volPg?.page   ?? null,
      },
      direction:     ap.direction ?? null,
      borderCallSeqs: ap.sharedCalls ?? [],
    });

    if (candidates.length >= maxQueueSize) break;
  }

  return candidates;
}
```

### 5.3 Logging

Log the queue before starting research:

```
[AdjacentQueue] Built queue: 4 candidates from 6 adjacent property entries
[AdjacentQueue]   Skipped: "FM 436" (road), "FM 2311" (road)
[AdjacentQueue]   Queue: RK GAINES (inst#1998024561), NORDYKE, HEARTLAND RESOURCES LLC, DIAMOND HOLDINGS
[AdjacentQueue]   Max queue size: 12 — all candidates included
```

---

## 6. §5.4 Adjacent Property Research Worker (Mini-Pipeline)

**File:** `worker/src/services/adjacent-research.ts`  
**Function:** `createAdjacentMiniPipeline(county, countyFIPS, anthropicApiKey, projectId, logger): searchAndExtract`  
**Status:** ❌ Must implement

### 6.1 What It Does

This factory function returns the `searchAndExtract` callback that `runAdjacentPropertyResearch()` calls for each neighbor. It runs a **condensed Phase 1–3 sub-pipeline** on a single adjacent property:

1. **Step A — Phase 1 (Discovery):** Use `PropertyDiscoveryEngine` to find the neighbor in the county CAD by owner name or instrument number
2. **Step B — Phase 2 (Harvest):** Use `DocumentHarvester` to download the neighbor's primary deed (targeted — not all documents)
3. **Step C — Phase 3 (Extraction):** Use `extractDocuments()` to extract boundary calls from the deed image

### 6.2 Implementation

```typescript
// worker/src/services/adjacent-research.ts
// Add this factory function

import { PropertyDiscoveryEngine } from './property-discovery.js';
import { DocumentHarvester } from './document-harvester.js';
import { extractDocuments } from './ai-extraction.js';
import type { ExtractedBoundaryData } from '../types/index.js';

/**
 * Creates the searchAndExtract callback for runAdjacentPropertyResearch().
 *
 * The callback runs a mini Phase 1-3 pipeline for ONE adjacent property:
 *   1. Phase 1: Discover the neighbor in CAD (by owner name or instrument#)
 *   2. Phase 2: Harvest ONLY the primary deed (not subdivision/all documents)
 *   3. Phase 3: Extract boundary calls with AI
 *
 * Returns null if discovery fails or no deed documents are found.
 */
export function createAdjacentMiniPipeline(
  county:        string,
  countyFIPS:    string,
  anthropicApiKey: string,
  projectId:     string,
  logger:        PipelineLogger,
): (candidate: AdjacentPropertyCandidate, candidateLogger: PipelineLogger) => Promise<ExtractedBoundaryData | null> {

  return async (candidate: AdjacentPropertyCandidate, candidateLogger: PipelineLogger) => {
    const ownerName = candidate.ownerName;
    const t0 = Date.now();

    // ── Step A: Phase 1 — Discover neighbor in CAD ────────────────────────────

    candidateLogger.info('AdjacentMini-Phase1', `Discovering "${ownerName}" in ${county} CAD…`);

    const engine = new PropertyDiscoveryEngine();
    let discoveryResult;
    try {
      // If we have an instrument number, use it to build a better address hint
      discoveryResult = await engine.discover(
        ownerName,   // owner name used as search hint
        county,
        'TX',
      );
    } catch (err) {
      candidateLogger.warn('AdjacentMini-Phase1',
        `Discovery threw for "${ownerName}": ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    if (!discoveryResult?.property) {
      candidateLogger.info('AdjacentMini-Phase1',
        `"${ownerName}" not found in ${county} CAD — status: ${discoveryResult?.status}`);
      return null;
    }

    const neighborIdentity = discoveryResult.property;
    candidateLogger.info('AdjacentMini-Phase1',
      `Found: propertyId=${neighborIdentity.propertyId}, ` +
      `owner="${neighborIdentity.owner}", acreage=${neighborIdentity.acreage}`);

    candidateLogger.info('AdjacentMini-Phase1',
      `Phase 1 complete in ${Date.now() - t0}ms`);

    // ── Step B: Phase 2 — Harvest primary deed only ──────────────────────────

    const t1 = Date.now();
    candidateLogger.info('AdjacentMini-Phase2', `Harvesting deed for "${ownerName}"…`);

    const harvester = new DocumentHarvester();
    let harvestResult;
    try {
      harvestResult = await harvester.harvest({
        projectId:          `${projectId}-adj-${ownerName.replace(/\s+/g, '_').toLowerCase()}`,
        propertyId:         neighborIdentity.propertyId,
        owner:              neighborIdentity.owner ?? ownerName,
        county,
        countyFIPS,
        // Only harvest target (primary deed) — no subdivision or adjacent docs
        // This keeps each neighbor sub-pipeline fast
        relatedPropertyIds: [],
        adjacentOwners:     [],
        // Use the known instrument number if available (direct and fast)
        deedReferences: candidate.recordingRef.instrumentNumber
          ? [{ instrumentNumber: candidate.recordingRef.instrumentNumber, type: 'deed' }]
          : [],
      });
    } catch (err) {
      candidateLogger.warn('AdjacentMini-Phase2',
        `Harvest threw for "${ownerName}": ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    const allDocs = [
      ...(harvestResult.documents.target ?? []),
      ...(harvestResult.documents.subdivision ?? []),
    ];

    // Pick the best deed document (prefer warranty deed > deed of trust > other)
    const deedTypes = ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed', 'deed_of_trust', 'plat'];
    const bestDoc = deedTypes.reduce<typeof allDocs[0] | null>((best, type) => {
      if (best) return best;
      return allDocs.find(d => d.documentType === type && d.images.length > 0) ?? null;
    }, null) ?? allDocs.find(d => d.images.length > 0) ?? null;

    if (!bestDoc) {
      candidateLogger.info('AdjacentMini-Phase2',
        `No deed documents downloaded for "${ownerName}" — skipping`);
      return null;
    }

    candidateLogger.info('AdjacentMini-Phase2',
      `Phase 2 complete in ${Date.now() - t1}ms — best doc: ` +
      `${bestDoc.documentType} inst#${bestDoc.instrumentNumber} ` +
      `(${bestDoc.images.length} page(s))`);

    // ── Step C: Phase 3 — Extract boundary calls from deed ─────────────────────

    const t2 = Date.now();
    candidateLogger.info('AdjacentMini-Phase3', `Extracting boundary from "${ownerName}" deed…`);

    // Build a DocumentResult from the harvested image for extractDocuments()
    const bestImage = bestDoc.images[0];
    if (!bestImage) return null;

    let imageBase64: string;
    try {
      const { readFileSync } = await import('fs');
      imageBase64 = readFileSync(bestImage.imagePath).toString('base64');
    } catch {
      candidateLogger.warn('AdjacentMini-Phase3',
        `Could not read image file: ${bestImage.imagePath}`);
      return null;
    }

    const docResults = [{
      ref: {
        instrumentNumber: bestDoc.instrumentNumber,
        volume:           null,
        page:             null,
        documentType:     bestDoc.documentType,
        recordingDate:    bestDoc.recordingDate,
        grantors:         bestDoc.grantors,
        grantees:         bestDoc.grantees,
        source:           bestDoc.source,
        url:              null,
      },
      textContent:   null,
      imageBase64,
      imageFormat:   'png' as const,
      ocrText:       null,
      extractedData: null,
    }];

    let extractedDocs;
    try {
      extractedDocs = await extractDocuments(docResults, anthropicApiKey, candidateLogger);
    } catch (err) {
      candidateLogger.warn('AdjacentMini-Phase3',
        `Extraction threw for "${ownerName}": ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    const extracted = extractedDocs.find(d => d.extractedData?.calls?.length)?.extractedData ?? null;

    if (!extracted) {
      candidateLogger.info('AdjacentMini-Phase3',
        `No boundary calls extracted from "${ownerName}" deed`);
      return null;
    }

    candidateLogger.info('AdjacentMini-Phase3',
      `Phase 3 complete in ${Date.now() - t2}ms — ` +
      `extracted ${extracted.calls.length} boundary calls ` +
      `(confidence ${(extracted.confidence * 100).toFixed(0)}%)`);

    return extracted;
  };
}
```

### 6.3 Mini-Pipeline Decision Rules

| Situation | Behavior |
|-----------|----------|
| CAD search finds zero results | Return `null` → neighbor status = `'not_found'` |
| Multiple CAD results found | Pick highest-acreage result within ±20% of called acreage, or the one whose owner name best matches (fuzzy) |
| Harvest returns no deed images | Return `null` → neighbor status = `'not_found'` |
| AI extraction returns zero calls | Return `null` → neighbor status = `'not_found'` |
| Any step throws | Catch, log as warn, return `null` → neighbor status = `'error'` |
| Called acreage is wildly different from CAD acreage (> 50% delta) | Log a warning but continue — do not abort |
| Neighbor is in a DIFFERENT county than the target | Use the correct county's CAD adapter (look up via `getCADConfig(countyFIPS)`) |

### 6.4 Cross-County Research

When a neighbor is in a different county (common at county-line properties), the `createAdjacentMiniPipeline()` must determine the correct county. Use `geocodeAddress()` or — if no address is known — fall back to querying neighboring counties' CADs by owner name.

The candidate's `direction` field gives a hint: if the target is in Bell County and the neighbor is "north", check Bell County first, then adjacent counties (Coryell to the northwest, McLennan to the northeast).

```typescript
// Cross-county fallback logic (add to createAdjacentMiniPipeline)
async function discoverCrossCounty(
  ownerName: string,
  primaryCounty: string,
  primaryFIPS: string,
  direction: string | null,
  logger: PipelineLogger,
): Promise<{ result: DiscoveryResult; county: string; fips: string } | null> {
  // Try primary county first
  const engine = new PropertyDiscoveryEngine();
  const primary = await engine.discover(ownerName, primaryCounty, 'TX');
  if (primary?.property) return { result: primary, county: primaryCounty, fips: primaryFIPS };

  // Try neighboring counties based on direction hint
  const neighbors = getNeighboringCounties(primaryFIPS, direction);
  for (const { county, fips } of neighbors) {
    const alt = await engine.discover(ownerName, county, 'TX');
    if (alt?.property) {
      logger.info('AdjacentMini', `Found "${ownerName}" in neighboring county: ${county}`);
      return { result: alt, county, fips };
    }
  }
  return null;
}
```

The `getNeighboringCounties(primaryFIPS, direction)` helper looks up Bell County's neighbors from a static county-adjacency table and filters by direction. Build a minimal table for Bell County's 8 adjacent counties:

```typescript
// Static adjacency map (extend as needed)
const COUNTY_NEIGHBORS: Record<string, { n?: string[]; s?: string[]; e?: string[]; w?: string[] }> = {
  '48027': {  // Bell County
    n: ['48099', '48309'],   // Coryell, McLennan
    s: ['48027'],            // Bell itself (FM 436 is south boundary)
    e: ['48331', '48027'],   // Milam
    w: ['48281', '48247'],   // Lampasas, Burnet
  },
};
```

---

## 7. §5.5 Cross-Validation Engine

**File:** `worker/src/services/adjacent-research.ts`  
**Functions:** `crossValidateSharedBoundary()`, `rateBearingDiff()`, `rateDistanceDiff()`, `overallRating()`  
**Status:** ✅ Already implemented — do not rewrite

### 7.1 How It Works

The cross-validation engine compares the target property's boundary calls against each neighbor's boundary calls using bearing reversal:

1. For each target boundary call that borders this neighbor (identified by `borderCallSeqs`):
   - Parse the target bearing to decimal azimuth
   - Add 180° (mod 360) — the "reversed" bearing
   - Search the neighbor's boundary calls for the closest match (within 0°30' tolerance)
   - Compute the angular difference and distance difference
   - Apply the tolerance tables

2. Apply tolerance tables:

| Bearing Difference | Rating |
|-------------------|--------|
| ≤ 0°00'30" | `CONFIRMED` |
| ≤ 0°05'00" | `CLOSE_MATCH` |
| ≤ 0°30'00" | `MARGINAL` |
| > 0°30'00" | `DISCREPANCY` |

| Distance Difference | Rating |
|--------------------|--------|
| ≤ 0.5 ft | `CONFIRMED` |
| ≤ 2.0 ft | `CLOSE_MATCH` |
| ≤ 5.0 ft | `MARGINAL` |
| > 5.0 ft | `DISCREPANCY` |

3. Overall rating = worst (max) of bearing and distance ratings.

### 7.2 Enhancement: Populate `borderCallSeqs` When Unknown

The existing `crossValidateSharedBoundary()` falls back to comparing all calls when `borderCallSeqs` is empty. When Phase 3 populates `adjacentProperties[i].sharedCalls[]`, pass those directly. When they are empty (Phase 3 couldn't identify which calls border this neighbor), the engine correctly tries all target calls.

No changes needed to `crossValidateSharedBoundary()` — it handles both cases.

### 7.3 Overall Score Computation

Add a helper to compute the phase-wide cross-validation score for the `summary.overallCrossValidationScore` field:

```typescript
/**
 * Compute an overall 0–100 cross-validation quality score.
 *
 * Scoring weights:
 *  CONFIRMED   = 100 pts per call
 *  CLOSE_MATCH = 75 pts per call
 *  MARGINAL    = 40 pts per call
 *  DISCREPANCY = 0 pts per call
 *  UNKNOWN     = 20 pts per call (penalized but not zero — missing data)
 *
 * Score = (weighted sum) / (total possible) * 100
 */
export function computeCrossValidationScore(result: AdjacentResearchResult): number {
  const weights: Record<SharedBoundaryRating, number> = {
    CONFIRMED:   100,
    CLOSE_MATCH: 75,
    MARGINAL:    40,
    DISCREPANCY: 0,
    UNKNOWN:     20,
  };

  let weightedSum = 0;
  let totalCalls  = 0;

  for (const prop of result.adjacentProperties) {
    if (prop.status !== 'researched') continue;
    for (const call of prop.sharedBoundaryCalls) {
      weightedSum += weights[call.overallRating] ?? 20;
      totalCalls++;
    }
  }

  if (totalCalls === 0) return 0;
  return Math.round((weightedSum / (totalCalls * 100)) * 100);
}
```

---

## 8. §5.6 Phase 5 Orchestrator

**File:** `worker/src/services/adjacent-research.ts`  
**Class:** `AdjacentResearchOrchestrator`  
**Status:** ❌ Must implement

### 8.1 Interface

```typescript
// worker/src/services/adjacent-research.ts
// Add this class

import type { PropertyIntelligence } from '../models/property-intelligence.js';
import fs from 'fs';
import path from 'path';

export interface AdjacentResearchInput {
  projectId:        string;
  intelligencePath: string;   // Path to /tmp/analysis/{projectId}/intelligence.json
  /** Override max concurrent neighbors (default: 2 per spec §12.3) */
  maxConcurrent?:   number;
  /** Override max queue size (default: 12) */
  maxQueueSize?:    number;
}

export class AdjacentResearchOrchestrator {
  private anthropicApiKey: string;
  private logger: PipelineLogger;

  constructor(anthropicApiKey: string, logger: PipelineLogger) {
    this.anthropicApiKey = anthropicApiKey;
    this.logger = logger;
  }

  async run(input: AdjacentResearchInput): Promise<CrossValidationResult> {
    const startMs = Date.now();
    const { projectId, intelligencePath, maxConcurrent = 2, maxQueueSize = 12 } = input;

    this.logger.info('Phase5', `Starting adjacent research for project: ${projectId}`);

    // ── Read Phase 3 intelligence.json ─────────────────────────────────────────

    let intelligence: PropertyIntelligence;
    try {
      const raw = fs.readFileSync(intelligencePath, 'utf-8');
      intelligence = JSON.parse(raw) as PropertyIntelligence;
    } catch (err) {
      const msg = `Failed to read intelligence.json at ${intelligencePath}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      this.logger.error('Phase5', msg);
      return this.buildFailedResult(projectId, msg, startMs);
    }

    this.logger.info('Phase5',
      `Loaded intelligence.json — ` +
      `property: "${intelligence.property.name}", ` +
      `adjacentProperties: ${intelligence.adjacentProperties?.length ?? 0}`);

    // ── Get target boundary for cross-validation ────────────────────────────────

    // Use the perimeter boundary (the outer boundary of the entire tract/subdivision)
    const targetBoundary = intelligence.perimeterBoundary?.calls
      ? {
          type:             'metes_and_bounds' as const,
          datum:            'NAD83' as const,
          pointOfBeginning: { description: 'Perimeter POB', referenceMonument: null },
          calls:            intelligence.perimeterBoundary.calls.map(c => ({
            sequence:  c.sequenceNumber,
            bearing:   c.bearing ? { raw: c.bearing, decimalDegrees: 0, quadrant: '' } : null,
            distance:  c.distance ? { raw: `${c.distance} feet`, value: c.distance, unit: 'feet' as const } : null,
            curve:     null,
            toPoint:   c.toMonument ?? null,
            along:     c.along ?? null,
            confidence: (c.confidence ?? 80) / 100,
          })),
          references: [],
          area: null,
          lotBlock: null,
          confidence: intelligence.confidenceSummary?.overall / 100 ?? 0.80,
          warnings: [],
        }
      : null;

    if (!targetBoundary) {
      this.logger.warn('Phase5',
        'No perimeter boundary found in intelligence.json — cross-validation will produce UNKNOWN ratings');
    }

    // ── Build research queue ────────────────────────────────────────────────────

    const t0 = Date.now();
    const candidates = buildAdjacentQueue(intelligence, maxQueueSize);
    const queueBuildMs = Date.now() - t0;

    this.logger.info('Phase5',
      `Queue built in ${queueBuildMs}ms — ${candidates.length} candidates`);

    if (candidates.length === 0) {
      this.logger.warn('Phase5',
        'No adjacent property candidates found — Phase 3 found no neighboring owners');
      return this.buildEmptyResult(projectId, startMs);
    }

    // ── Determine county ────────────────────────────────────────────────────────

    const county     = intelligence.property.county;
    const countyFIPS = this.resolveCountyFIPS(county);

    // ── Run research with mini-pipeline ────────────────────────────────────────

    const searchAndExtract = createAdjacentMiniPipeline(
      county,
      countyFIPS,
      this.anthropicApiKey,
      projectId,
      this.logger,
    );

    const result = await runAdjacentPropertyResearch(
      candidates,
      targetBoundary,
      searchAndExtract,
      this.logger,
      maxConcurrent,
    );

    // ── Compute overall score ───────────────────────────────────────────────────

    const score = computeCrossValidationScore(result);

    // ── Build and persist output ────────────────────────────────────────────────

    const callCounts = result.adjacentProperties.reduce((acc, r) => {
      for (const call of r.sharedBoundaryCalls) {
        acc[call.overallRating] = (acc[call.overallRating] ?? 0) + 1;
      }
      return acc;
    }, {} as Record<SharedBoundaryRating, number>);

    const output: CrossValidationResult = {
      status:      result.researched > 0 ? 'complete' : 'partial',
      projectId,
      generatedAt: new Date().toISOString(),
      version:     '5.0',
      summary: {
        totalCandidates:             result.totalCandidates,
        researched:                  result.researched,
        notFound:                    result.adjacentProperties.filter(r => r.status === 'not_found').length,
        failed:                      result.adjacentProperties.filter(r => r.status === 'error').length,
        totalSharedCalls:            result.adjacentProperties.reduce((s, r) => s + r.sharedBoundaryCalls.length, 0),
        confirmedSharedCalls:        callCounts['CONFIRMED']   ?? 0,
        closeMatchCalls:             callCounts['CLOSE_MATCH'] ?? 0,
        marginalCalls:               callCounts['MARGINAL']    ?? 0,
        discrepantCalls:             callCounts['DISCREPANCY'] ?? 0,
        overallCrossValidationScore: score,
        apiCallCount:                result.apiCallCount,
      },
      adjacentProperties: result.adjacentProperties.map(r => ({
        ...r,
        discoveryResult: null,   // populated by orchestrator in full impl
        timingMs:        null,   // populated per-neighbor in full impl
      })),
      timingMs: {
        total:       Date.now() - startMs,
        queueBuild:  queueBuildMs,
        perNeighbor: {},
      },
      errors:   [],
      warnings: [],
    };

    // Save to disk
    const outDir  = `/tmp/adjacent/${projectId}`;
    const outPath = path.join(outDir, 'cross_validation.json');
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
      this.logger.info('Phase5', `Saved cross_validation.json to: ${outPath}`);
    } catch (err) {
      this.logger.error('Phase5',
        `Failed to save cross_validation.json: ${
          err instanceof Error ? err.message : String(err)
        }`);
    }

    this.logger.info('Phase5',
      `Complete in ${Date.now() - startMs}ms — ` +
      `researched: ${result.researched}/${result.totalCandidates}, ` +
      `score: ${score}/100`);

    return output;
  }

  private resolveCountyFIPS(county: string): string {
    // Import from lib/county-fips.ts
    const { countyToFIPS } = require('../lib/county-fips.js') as { countyToFIPS: (c: string) => string };
    return countyToFIPS(county) ?? '48027';  // Bell County default
  }

  private buildFailedResult(projectId: string, error: string, startMs: number): CrossValidationResult {
    return {
      status: 'failed', projectId, generatedAt: new Date().toISOString(), version: '5.0',
      summary: { totalCandidates: 0, researched: 0, notFound: 0, failed: 0,
        totalSharedCalls: 0, confirmedSharedCalls: 0, closeMatchCalls: 0,
        marginalCalls: 0, discrepantCalls: 0, overallCrossValidationScore: 0, apiCallCount: 0 },
      adjacentProperties: [],
      timingMs: { total: Date.now() - startMs, queueBuild: 0, perNeighbor: {} },
      errors: [error], warnings: [],
    };
  }

  private buildEmptyResult(projectId: string, startMs: number): CrossValidationResult {
    return {
      status: 'complete', projectId, generatedAt: new Date().toISOString(), version: '5.0',
      summary: { totalCandidates: 0, researched: 0, notFound: 0, failed: 0,
        totalSharedCalls: 0, confirmedSharedCalls: 0, closeMatchCalls: 0,
        marginalCalls: 0, discrepantCalls: 0, overallCrossValidationScore: 0, apiCallCount: 0 },
      adjacentProperties: [],
      timingMs: { total: Date.now() - startMs, queueBuild: 0, perNeighbor: {} },
      errors: [], warnings: ['No adjacent property candidates found'],
    };
  }
}
```

### 8.2 Per-Neighbor Timing and Discovery Summary

To fully populate `AdjacentPropertyResultFull` (including `discoveryResult` and `timingMs`), the `createAdjacentMiniPipeline()` callback should return an **augmented** result. The simplest approach:

1. Add a `WeakMap<Function, NeighborTimingMs>` or a secondary callback channel so the orchestrator can retrieve per-step timing.
2. Store the `PropertyIdentity` found by Phase 1 in the closure so the orchestrator can access it after the callback returns.
3. An alternative is to change `runAdjacentPropertyResearch()` to accept a richer callback return type (see §6.1 for the `ExtractedBoundaryData | null` signature).

**Recommended approach for full implementation:** Define a `MiniPipelineResult` type:

```typescript
export interface MiniPipelineResult {
  extractedBoundary: ExtractedBoundaryData | null;
  discoveryResult:   AdjacentDiscoverySummary | null;
  timingMs:          NeighborTimingMs;
}
```

Change `runAdjacentPropertyResearch()` callback type to return `MiniPipelineResult` instead of `ExtractedBoundaryData | null`. Update `AdjacentPropertyResult` to include `discoveryResult` and `timingMs`. The existing callers in the codebase only call `extractAdjacentCandidates()` and `crossValidateSharedBoundary()` directly (not `runAdjacentPropertyResearch()` with the real mini-pipeline), so this is a safe change.

---

## 9. §5.7 Express API Endpoints

**File:** `worker/src/index.ts`  
**Status:** ❌ Must add

Add the following two endpoints to `worker/src/index.ts` after the existing `/research/harvest` endpoints.

### 9.1 `POST /research/adjacent`

Accepts `{ projectId, intelligencePath }`, launches the orchestrator asynchronously, returns HTTP 202.

```typescript
// ── POST /research/adjacent ────────────────────────────────────────────────
// Phase 5: Adjacent property research and boundary cross-validation.
// Reads Phase 3 intelligence.json, runs mini Phase 1-3 on each neighbor,
// produces cross_validation.json.
//
// Body: { projectId: string, intelligencePath?: string }
// Returns: 202 { pollUrl, message }
//
// Poll for results at: GET /research/adjacent/:projectId

const activeAdjacentResearch = new Map<string, { status: 'running' | 'complete' | 'failed'; result?: CrossValidationResult }>();

app.post('/research/adjacent', requireAuth, async (req: Request, res: Response) => {
  const { projectId, intelligencePath } = req.body as {
    projectId: string;
    intelligencePath?: string;
  };

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const resolvedPath = intelligencePath
    ?? `/tmp/analysis/${projectId}/intelligence.json`;

  if (!fs.existsSync(resolvedPath)) {
    res.status(400).json({
      error: `intelligence.json not found at: ${resolvedPath}`,
      hint: 'Run POST /research/analyze first to complete Phase 3 extraction',
    });
    return;
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!anthropicApiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' });
    return;
  }

  activeAdjacentResearch.set(projectId, { status: 'running' });

  res.status(202).json({
    message: 'Adjacent property research started',
    projectId,
    intelligencePath: resolvedPath,
    pollUrl: `/research/adjacent/${projectId}`,
  });

  // Run orchestrator asynchronously
  const logger = new PipelineLogger(projectId);
  const orchestrator = new AdjacentResearchOrchestrator(anthropicApiKey, logger);

  orchestrator.run({ projectId, intelligencePath: resolvedPath })
    .then(result => {
      activeAdjacentResearch.set(projectId, { status: 'complete', result });
      console.log(`[Adjacent] ${projectId}: complete — ` +
        `researched ${result.summary.researched}/${result.summary.totalCandidates}, ` +
        `score: ${result.summary.overallCrossValidationScore}/100`);
    })
    .catch(err => {
      console.error(`[Adjacent] ${projectId}: orchestrator threw:`, err);
      activeAdjacentResearch.set(projectId, { status: 'failed' });
    });
});
```

### 9.2 `GET /research/adjacent/:projectId`

Returns the current status and, when complete, the full `CrossValidationResult`.

```typescript
// ── GET /research/adjacent/:projectId ─────────────────────────────────────────
app.get('/research/adjacent/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;
  const state = activeAdjacentResearch.get(projectId);

  if (!state) {
    // Check disk for completed result
    const diskPath = `/tmp/adjacent/${projectId}/cross_validation.json`;
    if (fs.existsSync(diskPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(diskPath, 'utf-8')) as CrossValidationResult;
        res.json({ status: 'complete', result });
        return;
      } catch {
        res.status(500).json({ error: 'Failed to parse cross_validation.json from disk' });
        return;
      }
    }
    res.status(404).json({
      error: `No adjacent research found for projectId: ${projectId}`,
      hint: 'Start with POST /research/adjacent first',
    });
    return;
  }

  if (state.status === 'running') {
    res.json({ status: 'in_progress', projectId,
      message: 'Adjacent research in progress — each neighbor takes 1-3 minutes' });
    return;
  }

  if (state.status === 'failed') {
    res.status(500).json({ status: 'failed', projectId,
      error: 'Adjacent research failed — check worker logs' });
    return;
  }

  res.json({ status: 'complete', projectId, result: state.result });
});
```

### 9.3 Update Server Startup Logs

Add Phase 5 to the server startup console output in `index.ts`:

```typescript
// In the server startup log block:
console.log('  POST   /research/adjacent           ← Phase 5: adjacent research & cross-validation');
console.log('  GET    /research/adjacent/:projectId ← Phase 5: adjacent status/result');
```

---

## 10. §5.8 CLI Script — adjacent.sh

**File:** `worker/adjacent.sh`  
**Status:** ❌ Must create

```bash
#!/usr/bin/env bash
# adjacent.sh — Phase 5: Adjacent Property Research & Boundary Cross-Validation
#
# Calls POST /research/adjacent on the local research worker.
# Polls until complete, then prints a summary.
#
# Usage: ./adjacent.sh <projectId> [intelligencePath]
#
# Examples:
#   ./adjacent.sh ash-trust-001
#   ./adjacent.sh ash-trust-001 /tmp/analysis/ash-trust-001/intelligence.json

PROJECT_ID="$1"
INTEL_PATH="${2:-/tmp/analysis/$PROJECT_ID/intelligence.json}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./adjacent.sh <projectId> [intelligencePath]"
  echo ""
  echo "Example:"
  echo "  ./adjacent.sh ash-trust-001"
  exit 1
fi

if [ ! -f "$INTEL_PATH" ]; then
  echo "[ERROR] intelligence.json not found: $INTEL_PATH"
  echo "        Run ./analyze.sh first, or provide the correct path."
  exit 1
fi

# Load environment variables
# shellcheck disable=SC1091
source /root/starr-worker/.env

echo "==================================="
echo "  Starr Adjacent Research"
echo "  (Phase 5 Cross-Validation)"
echo "==================================="
echo "Project:      $PROJECT_ID"
echo "Intelligence: $INTEL_PATH"
echo ""

# Start research (async 202 response)
RESPONSE=$(curl -s -X POST http://localhost:3100/research/adjacent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"intelligencePath\": \"$INTEL_PATH\"
  }")

echo "Started: $RESPONSE"
echo ""
echo "This will take 2-15 minutes depending on the number of neighbors."
echo ""

# Poll for completion
SECONDS=0
while true; do
  STATUS_JSON=$(curl -s "http://localhost:3100/research/adjacent/$PROJECT_ID" \
    -H "Authorization: Bearer $WORKER_API_KEY")

  STATUS=$(echo "$STATUS_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)

  if [ "$STATUS" = "complete" ]; then
    echo ""
    echo "=== Phase 5 Complete (${SECONDS}s) ==="
    echo "$STATUS_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
s = d.get('result', {}).get('summary', {})
print(f\"Candidates:   {s.get('totalCandidates', 0)}\")
print(f\"Researched:   {s.get('researched', 0)}\")
print(f\"Not Found:    {s.get('notFound', 0)}\")
print(f\"Shared Calls: {s.get('totalSharedCalls', 0)} total\")
print(f\"  Confirmed:  {s.get('confirmedSharedCalls', 0)}\")
print(f\"  Close:      {s.get('closeMatchCalls', 0)}\")
print(f\"  Marginal:   {s.get('marginalCalls', 0)}\")
print(f\"  Discrepant: {s.get('discrepantCalls', 0)}\")
print(f\"Score:        {s.get('overallCrossValidationScore', 0)}/100\")
" 2>/dev/null || echo "$STATUS_JSON"
    echo ""
    echo "Full result:"
    echo "  cat /tmp/adjacent/$PROJECT_ID/cross_validation.json | python3 -m json.tool"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "[ERROR] Adjacent research failed. Check logs:"
    echo "  pm2 logs starr-worker --lines 100"
    exit 1
  fi

  printf "."
  sleep 15
done
```

---

## 11. File Map

### Files That Must Be MODIFIED

```
worker/
└── src/
    ├── services/
    │   └── adjacent-research.ts     🔨 ADD: buildAdjacentQueue(), createAdjacentMiniPipeline(),
    │                                         AdjacentResearchOrchestrator, computeCrossValidationScore()
    │                                    ADD new types: CrossValidationResult, AdjacentDiscoverySummary,
    │                                         NeighborTimingMs, AdjacentPropertyResultFull, MiniPipelineResult
    │                                    DO NOT CHANGE: all existing code (types, bearing math,
    │                                         extractAdjacentCandidates, crossValidateSharedBoundary,
    │                                         runAdjacentPropertyResearch)
    └── index.ts                     🔨 ADD: POST /research/adjacent, GET /research/adjacent/:projectId
                                            ADD: AdjacentResearchOrchestrator import
                                            ADD: Phase 5 to startup console log
```

### Files That Must Be CREATED

```
worker/
└── adjacent.sh                      ❌ Phase 5 §5.8 — CLI script
```

### Files That Must Be READ Before Writing (Do Not Modify)

```
worker/
└── src/
    ├── services/
    │   ├── adjacent-research.ts           ✅ ALL existing exports — do not change, only add
    │   ├── property-discovery.ts          ✅ USE: PropertyDiscoveryEngine.discover()
    │   ├── discovery-engine.ts            ✅ USE: PropertyDiscoveryEngine (newer version)
    │   ├── document-harvester.ts          ✅ USE: DocumentHarvester.harvest()
    │   ├── ai-extraction.ts               ✅ USE: extractDocuments()
    │   └── pipeline.ts                    ✅ REFERENCE: existing orchestration patterns
    ├── adapters/
    │   ├── cad-adapter.ts                 ✅ USE: CADAdapter interface
    │   ├── bis-adapter.ts                 ✅ USE: BIS county lookups
    │   ├── trueautomation-adapter.ts      ✅ USE: TrueAutomation counties
    │   ├── tyler-adapter.ts               ✅ USE: Tyler counties
    │   └── generic-cad-adapter.ts         ✅ USE: fallback adapter
    ├── lib/
    │   ├── county-fips.ts                 ✅ USE: countyToFIPS(), resolveCounty()
    │   └── logger.ts                      ✅ USE: PipelineLogger
    ├── types/
    │   ├── index.ts                       ✅ USE: ExtractedBoundaryData, BoundaryCall, DocumentResult
    │   └── property-discovery.ts          ✅ USE: PropertyIdentity, DiscoveryResult
    └── models/
        └── property-intelligence.ts       ✅ USE: PropertyIntelligence, AdjacentProperty (Phase 3 output model)
```

### Files That Are LEGACY (do not delete, do not modify for Phase 5)

```
worker/
└── src/
    └── services/
        ├── pipeline.ts                    ⚠️  Legacy pipeline — still used by POST /research/property-lookup
        ├── bell-clerk.ts                  ⚠️  Legacy Kofile scraper — still imported by pipeline.ts
        ├── reanalysis.ts                  ⚠️  Phase 9 — do not touch
        ├── report-generator.ts            ⚠️  Phase 10 — do not touch
        ├── txdot-row.ts                   ⚠️  Phase 6 — do not touch
        └── geo-reconcile.ts               ⚠️  Phase 3/7 geometric reconciliation — do not touch
```

---

## 12. Acceptance Criteria

### Functional Requirements

- [ ] Given a Phase 3 `intelligence.json` for `3779 FM 436, Belton TX` (ASH FAMILY TRUST), `POST /research/adjacent` returns HTTP 202 within 1 second
- [ ] `GET /research/adjacent/ash-trust-001` returns `{ status: "in_progress" }` during processing and the full `CrossValidationResult` JSON when complete
- [ ] Full adjacent research for the ASH FAMILY TRUST sample (4 adjacent owners) completes in ≤ 15 minutes
- [ ] `cross_validation.json` is saved to `/tmp/adjacent/{projectId}/cross_validation.json`
- [ ] `adjacent.sh` script works from droplet console for the sample property
- [ ] If `intelligence.json` is not found, `POST /research/adjacent` returns HTTP 400 with a helpful error message

### Queue Builder (§5.3)

- [ ] `buildAdjacentQueue()` correctly reads `intelligence.adjacentProperties[]` and produces `AdjacentPropertyCandidate[]`
- [ ] Road entries (`FM 436`, `SH 36`, `COUNTY ROAD 101`, etc.) are excluded from the queue
- [ ] Duplicate owner names (after normalization) are de-duplicated — at most one entry per owner
- [ ] `borderCallSeqs` is correctly populated from `adjacentProperties[i].sharedCalls`
- [ ] `recordingRef.instrumentNumber` is populated when `adjacentProperties[i].instrumentNumbers[0]` is available
- [ ] Queue size is capped at `maxQueueSize` (default 12) — excess candidates are logged and skipped

### Mini-Pipeline (§5.4)

- [ ] Each neighbor's research runs Phase 1 (CAD discovery) → Phase 2 (document harvest) → Phase 3 (AI extraction) in sequence
- [ ] Phase 1 uses `PropertyDiscoveryEngine` (not the legacy `pipeline.ts`)
- [ ] Phase 2 harvests only the primary deed for the neighbor (no subdivision or adjacent subdocs)
- [ ] Phase 3 uses `extractDocuments()` from `ai-extraction.ts` (no reimplementation)
- [ ] When Phase 1 returns no match, neighbor status = `'not_found'`
- [ ] When Phase 2 returns no images, neighbor status = `'not_found'`
- [ ] When Phase 3 returns no calls, neighbor status = `'not_found'`
- [ ] Any thrown exception is caught and results in neighbor status = `'error'` (pipeline continues with remaining neighbors)
- [ ] Max 2 neighbors are researched in parallel at any time (configurable via `maxConcurrent`)
- [ ] If 3 of 6 neighbors succeed, the phase reports partial results rather than failing entirely

### Cross-Validation Engine (§5.5)

- [ ] For each researched neighbor, `crossValidateSharedBoundary()` is called with the target perimeter boundary
- [ ] Bearing reversal logic correctly produces `S 45°28'18" W` when target call is `N 45°28'18" E`
- [ ] A bearing difference of 0°00'05" is rated `CONFIRMED`
- [ ] A bearing difference of 0°03'00" is rated `CLOSE_MATCH`
- [ ] A bearing difference of 0°15'00" is rated `MARGINAL`
- [ ] A bearing difference of 0°45'00" is rated `DISCREPANCY`
- [ ] A distance difference of 0.3 ft is rated `CONFIRMED`
- [ ] A distance difference of 1.5 ft is rated `CLOSE_MATCH`
- [ ] A distance difference of 4.0 ft is rated `MARGINAL`
- [ ] A distance difference of 7.0 ft is rated `DISCREPANCY`
- [ ] `overallRating` is the worst (max) of the two individual ratings

### Output Data

- [ ] `cross_validation.json` `version` field is `'5.0'`
- [ ] `summary.overallCrossValidationScore` is a number 0–100 (100 = all calls CONFIRMED)
- [ ] All `adjacentProperties[i].status` values are one of: `'researched' | 'not_found' | 'skipped' | 'error'`
- [ ] When status = `'not_found'` or `'error'`, `sharedBoundaryCalls` is `[]`
- [ ] No field in `CrossValidationResult` is set to a fabricated value — if data can't be obtained, it is `null` or `[]`

### Phase 7 Integration

- [ ] `cross_validation.json` output file exists at `/tmp/adjacent/{projectId}/cross_validation.json` after successful run
- [ ] Phase 7 (Reconciliation) can consume `cross_validation.json` adjacentProperties data to weight its `adjacent_deed` source readings
- [ ] Source weight: `adjacent_deed` readings ranked below `deed` and `plat` per spec §7.4 source-weight order

### Implementation Rules (from STARR_RECON_PHASE_ROADMAP.md §12)

- [ ] All AI calls use `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'` — no hardcoded model names
- [ ] All logging uses `PipelineLogger` from `lib/logger.ts` — no `console.log` in Phase 5 code
- [ ] `projectId` is included in every log line
- [ ] All HTTP requests (Phase 1 CAD, Phase 2 Kofile) use retry logic from `lib/rate-limiter.ts`
- [ ] `ANTHROPIC_API_KEY` read from `process.env` — never hardcoded
- [ ] TypeScript strict mode — zero errors in all Phase 5 additions
- [ ] Non-critical failure (single neighbor research fails) does NOT halt the phase — partial results are reported
- [ ] Rate limiting: max 2 concurrent adjacent research tasks (per spec §12.3)

---

*Previous: `PHASE_04_SUBDIVISION.md` — Subdivision & Plat Intelligence*  
*Next: `PHASE_06_TXDOT.md` — TxDOT ROW Integration*
