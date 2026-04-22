# STARR RECON — Phase 5: Adjacent Property Deep Research & Boundary Cross-Validation

**Product:** Starr Compass — AI Property Research (STARR RECON)  
**Version:** 1.2 | **Last Updated:** March 2026  
**Phase Duration:** Weeks 13–15  
**Depends On:** Phase 1 (`PropertyIdentity`), Phase 2 (`DocumentHarvester`), Phase 3 (`PropertyIntelligence` with adjacent owner names), Phase 4 (`SubdivisionModel` with adjacency matrix)  
**Status:** ✅ COMPLETE v1.3 (March 2026) — All 4 service files, API routes, CLI script, and **50 unit tests** pass. v1.3 changes: `PipelineLogger` integrated into `AdjacentResearchWorker` and `AdjacentResearchOrchestrator` (no more bare `console.log` in Phase 5 service code, per spec §5.4); 15 new tests added (tests 36–50) covering `ET AL`/`ET UX` suffix stripping, `referencesOurProperty` candidate matching, mixed confirmed/unverified result sets, symbol assertions, edge-case confidence scores, and more. Key v1.2 fixes still in place: HTTP error handling in all AI calls (`response.ok` check), `CLERK_RATE_LIMIT_MS` env var, `boundaryDescriptionChanged` AI+heuristic comparison, `AdjacentQueueBuilder` priority tiebreaker, `CrossValidationEngine` 45° match threshold. Known limitations: Kofile-only counties; live clerk integration testing required; `ANTHROPIC_API_KEY` required for AI steps.  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

---

## Goal

Automatically research **EVERY neighboring property** identified in Phase 3/4 — find their deeds and plats, extract shared boundary calls, reverse bearings, cross-validate from both sides of every shared boundary line, and identify chain-of-title predecessors who may have conveyed with different boundary descriptions.

**Deliverable:** An `AdjacentResearchOrchestrator` class (and supporting service classes) that takes Phase 3/4 output, autonomously researches every adjacent property, and returns a `FullCrossValidationReport` (saved as `cross_validation_report.json`) that confirms or disputes every shared boundary call.

---

## Table of Contents

1. [What This Phase Must Accomplish](#1-what-this-phase-must-accomplish)
2. [Current State of the Codebase](#2-current-state-of-the-codebase)
3. [Architecture Overview](#3-architecture-overview)
4. [§5.3 Adjacent Research Queue Builder](#53-adjacent-research-queue-builder)
5. [§5.4 Adjacent Property Research Worker](#54-adjacent-property-research-worker)
6. [§5.5 Cross-Validation Engine](#55-cross-validation-engine)
7. [§5.6 Adjacent Research Orchestrator](#56-adjacent-research-orchestrator)
8. [§5.7 Express API & CLI](#57-express-api--cli)
9. [File Map](#9-file-map)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. What This Phase Must Accomplish

Phase 3/4 identified adjacent owners from plat annotations and deed "called-from" references. Phase 5 takes those names and **automatically**:

1. Searches the county clerk for every adjacent owner's deed
2. Downloads watermarked preview images
3. Extracts metes and bounds from adjacent deeds via AI vision
4. Identifies the specific calls that form the shared boundary
5. Reverses those calls and compares to our property's calls
6. Produces a per-boundary cross-validation report

```bash
curl -X POST http://localhost:3100/research/adjacent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "intelligencePath": "/tmp/analysis/ash-trust-001/property_intelligence.json",
    "subdivisionPath": "/tmp/analysis/ash-trust-001/subdivision_model.json"
  }'
```

Returns a `FullCrossValidationReport` saved to `/tmp/analysis/{projectId}/cross_validation_report.json`:

```json
{
  "status": "complete",
  "adjacentProperties": [
    {
      "owner": "R.K. GAINES",
      "calledAcreages": [4.0, 9.0, 20.0],
      "sharedBoundaryDirection": "north",
      "researchStatus": "complete",
      "documentsFound": {
        "deeds": [
          {
            "instrumentNumber": "199800234",
            "type": "warranty_deed",
            "date": "1998-03-12",
            "grantor": "HAROLD THOMPSON",
            "grantee": "R.K. GAINES",
            "pages": 4,
            "images": ["/tmp/harvest/ash-trust-001/adjacent/rk_gaines/deed_199800234_p1.png"],
            "calledAcreage": 9.0
          }
        ],
        "plats": []
      },
      "extractedBoundary": {
        "totalCalls": 14,
        "sharedCalls": 3,
        "callComparisons": [
          {
            "callId": "PERIM_N1",
            "ourBearing": "N 04\u00b037'58\" W",
            "ourDistance": 461.81,
            "theirBearing": "S 04\u00b038'01\" E",
            "theirDistance": 461.79,
            "theirReversed": "N 04\u00b038'01\" W",
            "bearingDifference": "0\u00b000'03\"",
            "distanceDifference": 0.02,
            "status": "confirmed",
            "symbol": "\u2713",
            "notes": "Excellent agreement \u2014 3 arc-seconds, 0.02 feet"
          },
          {
            "callId": "PERIM_N2",
            "ourBearing": "N 85\u00b022'02\" E",
            "ourDistance": 200.15,
            "theirBearing": "S 85\u00b022'00\" W",
            "theirDistance": 200.18,
            "theirReversed": "N 85\u00b022'00\" E",
            "bearingDifference": "0\u00b000'02\"",
            "distanceDifference": 0.03,
            "status": "confirmed",
            "symbol": "\u2713",
            "notes": null
          },
          {
            "callId": "PERIM_N3",
            "ourBearing": "N 56\u00b031'22\" W",
            "ourDistance": 180.00,
            "theirBearing": null,
            "theirDistance": null,
            "status": "unverified",
            "symbol": "?",
            "notes": "Adjacent deed predates subdivision \u2014 boundary description uses older survey reference"
          }
        ]
      },
      "chainOfTitle": [
        { "grantor": "HAROLD THOMPSON", "grantee": "R.K. GAINES", "date": "1998-03-12", "instrument": "199800234" },
        { "grantor": "WILLIAM HARTRICK HEIRS", "grantee": "HAROLD THOMPSON", "date": "1971-06-20", "instrument": "7104421" }
      ],
      "confidence": {
        "sharedBoundary": 82,
        "confirmedCalls": 2,
        "unverifiedCalls": 1,
        "totalSharedCalls": 3
      }
    },
    {
      "owner": "NORDYKE",
      "calledAcreages": [35.0],
      "sharedBoundaryDirection": "west",
      "researchStatus": "partial",
      "documentsFound": { "deeds": [], "plats": [] },
      "extractedBoundary": null,
      "confidence": { "sharedBoundary": 0, "confirmedCalls": 0, "unverifiedCalls": 0, "totalSharedCalls": 2 },
      "notes": "No deed found under 'NORDYKE' in Bell County clerk. May be filed under different name or in different county."
    }
  ],
  "crossValidationSummary": {
    "totalAdjacentProperties": 6,
    "successfullyResearched": 4,
    "failedResearch": 2,
    "totalSharedCalls": 18,
    "confirmedCalls": 10,
    "closeMatchCalls": 3,
    "unverifiedCalls": 4,
    "discrepancyCalls": 1,
    "overallBoundaryConfidence": 74
  },
  "timing": { "totalMs": 420000 },
  "aiCalls": 32,
  "errors": []
}
```

---

## 2. Current State of the Codebase

### Phases 1–4 — Status

| Phase | Key Files | Status |
|-------|-----------|--------|
| 1 — Discovery | `discovery-engine.ts`, `property-discovery.ts`, `bis-adapter.ts`, `trueautomation-adapter.ts`, `tyler-adapter.ts`, `generic-cad-adapter.ts`, `cad-registry.ts` | ✅ Done |
| 2 — Harvest | `document-harvester.ts`, `kofile-clerk-adapter.ts`, `texasfile-adapter.ts`, `clerk-adapter.ts`, `document-intelligence.ts` | ✅ Done v1.2 |
| 3 — Extraction | `ai-extraction.ts`, `adaptive-vision.ts`, `geo-reconcile.ts`, `property-validation-pipeline.ts`, `ai-document-analyzer.ts` | ✅ Done v1.2 |
| 4 — Subdivision | `subdivision-intelligence.ts`, `subdivision-classifier.ts`, `lot-enumerator.ts`, `interior-line-analyzer.ts`, `area-reconciliation.ts`, `adjacency-builder.ts` | ✅ Done v1.2 |

### Phase 5 — COMPLETE v1.3

#### What Exists Now

| New File | Class | Status |
|----------|-------|--------|
| `worker/src/services/adjacent-queue-builder.ts` | `AdjacentQueueBuilder` | ✅ Done — builds queue from Phase 3/4 data |
| `worker/src/services/adjacent-research-worker.ts` | `AdjacentResearchWorker` | ✅ Done — clerk search + AI extraction + chain-of-title + `PipelineLogger` |
| `worker/src/services/cross-validation-engine.ts` | `CrossValidationEngine` | ✅ Done — uses bearing math from adjacent-research.ts |
| `worker/src/services/adjacent-research-orchestrator.ts` | `AdjacentResearchOrchestrator` + `runAdjacentResearch()` | ✅ Done — full pipeline + disk persistence + `PipelineLogger` |
| `worker/adjacent.sh` | Phase 5 CLI script | ✅ Done |
| `POST /research/adjacent` | Express API endpoint | ✅ Done (in `worker/src/index.ts`) |
| `GET /research/adjacent/:projectId` | Express status endpoint | ✅ Done (in `worker/src/index.ts`) |

**Foundation file:** `worker/src/services/adjacent-research.ts`

The bearing math functions are now **exported** from `adjacent-research.ts` for use by `cross-validation-engine.ts`:

| Export | Description | Status |
|--------|-------------|--------|
| `AdjacentPropertyCandidate` | Input type for one neighbor to research | ✅ Done |
| `SharedBoundaryCall` | Result of one bearing-reversal comparison | ✅ Done |
| `AdjacentPropertyResult` | Full result for one neighbor | ✅ Done |
| `AdjacentResearchResult` | Aggregate result for all neighbors | ✅ Done |
| `SharedBoundaryRating` | `'CONFIRMED' \| 'CLOSE_MATCH' \| 'MARGINAL' \| 'DISCREPANCY' \| 'UNKNOWN'` | ✅ Done |
| `parseAzimuth(raw)` | Parses `"N 45°28'15\" E"` to decimal azimuth 0–360° | ✅ Done + exported |
| `reverseAzimuth(az)` | Adds 180° mod 360 for bearing reversal | ✅ Done + exported |
| `angularDiff(a, b)` | Smallest angular difference between two azimuths (0–180°) | ✅ Done + exported |
| `rateBearingDiff(diffDeg)` | Applies bearing tolerance table → `SharedBoundaryRating` | ✅ Done + exported |
| `rateDistanceDiff(diffFt)` | Applies distance tolerance table → `SharedBoundaryRating` | ✅ Done + exported |
| `extractAdjacentCandidates(boundary, rawAdjacent?)` | Builds basic candidate list from boundary data | ✅ Done — superseded by `AdjacentQueueBuilder` |
| `crossValidateSharedBoundary(...)` | Core bearing-reversal comparison engine | ✅ Done — used by `CrossValidationEngine` |
| `runAdjacentPropertyResearch(...)` | Basic orchestrator (callback-injection model) | ✅ Done — superseded by `AdjacentResearchOrchestrator` |

#### What Still Needs Work (Cannot be completed without more info or live testing)

| Item | Status | Notes |
|------|--------|-------|
| Non-Kofile county support | 🚫 Incomplete | `CountyFusionAdapter` and `TylerClerkAdapter` do not implement `searchByGranteeName()` or `getDocumentImages()` — Phase 5 only works for Kofile counties (~38 Texas counties). Extend when adapters add these methods. |
| `PropertyIntelligence.adjacentProperties[].sharedCalls` | 🟠 Partial | The `AdjacentQueueBuilder` reads `sharedCalls` from Phase 3 data, but Phase 3 (`AIPlatAnalyzer`) may not populate `sharedCalls` for all properties. If `sharedCalls` is empty, the engine still tries to match via `along` descriptors in boundary calls (fallback). |
| Parallel execution | 🔮 Future | Phase 5 currently runs all adjacent property research sequentially. Future optimization: allow `maxConcurrent=2` with per-county rate limiting. |
| Phase 7 integration | 🟠 Partial | `cross_validation_report.json` is produced and can be consumed by Phase 7 reconciliation. The Phase 7 reconciliation engine (`geometric-reconciliation-engine.ts`) reads the report as the `adjacent_deed` source. Thread the `callComparisons[].status` into the source-weight system. |

#### Requirements (external dependencies)

| Requirement | Notes |
|-------------|-------|
| `ANTHROPIC_API_KEY` | Required for AI deed selection, AI boundary extraction, and `boundaryDescriptionChanged` comparison. Without it, worker returns `partial` results after download step. |
| `RESEARCH_AI_MODEL` | Optional. Defaults to `claude-sonnet-4-5-20250929`. Set to override (e.g. `claude-opus-4-5` for higher quality). |
| `CLERK_RATE_LIMIT_MS` | Optional. Defaults to `3000`. Set lower (e.g. `1500`) for faster tests, higher (e.g. `5000`) if clerk rate-limits aggressively. |
| Kofile county clerk | Phase 5 uses `KofileClerkAdapter`. The county's FIPS code must be resolvable by Phase 1 (`PropertyIdentity.countyFIPS`). Non-Kofile counties will fail at the adapter init step with a clear error. |
| Playwright (chromium) | Required by `KofileClerkAdapter` for browser-based clerk navigation. Run `npx playwright install chromium` on the worker droplet. |

---

## 3. Architecture Overview

```
INPUT: PropertyIntelligence + SubdivisionModel (Phase 3/4 outputs)
  |
  +-- STEP 1: ADJACENT PROPERTY QUEUE (AdjacentQueueBuilder)
  |   +-- Collect all adjacent owner names from:
  |   |   +-- Plat annotations ("Called X.XX acres, R.K. GAINES")
  |   |   +-- Deed "called-from" references (deedChain[].calledFrom[])
  |   |   +-- Adjacency matrix from Phase 4 SubdivisionModel
  |   |   +-- Road names classified and SKIPPED (Phase 6)
  |   +-- De-duplicate owners by normalized name
  |   +-- Generate alternate name spellings per owner
  |   +-- Prioritize by shared boundary length (longer = higher priority)
  |   +-- Boost priority for tasks with known instrument# hints
  |   +-- Return AdjacentResearchTask[]
  |
  +-- STEP 2: PER-ADJACENT-OWNER RESEARCH (AdjacentResearchWorker, sequential w/ rate limiting)
  |   +-- Strategy 1: Direct instrument# search (if hint available from plat/deed)
  |   +-- Strategy 2: Grantee name search for all alternateNames variants
  |   |   +-- Single result: use it
  |   |   +-- Multiple results: aiSelectCorrectDeed() picks based on acreage + direction
  |   +-- Strategy 3: Grantor name search (fallback)
  |   +-- DOWNLOAD watermarked preview images via KofileClerkAdapter
  |   +-- AI EXTRACT metes and bounds from adjacent deed (Claude Vision)
  |   +-- IDENTIFY shared boundary calls (isSharedBoundary flag)
  |   +-- TRACE CHAIN OF TITLE 1-2 generations back
  |
  +-- STEP 3: CALL-BY-CALL CROSS-VALIDATION (CrossValidationEngine)
  |   +-- Import parseAzimuth, reverseAzimuth, angularDiff from adjacent-research.ts
  |   +-- Import rateBearingDiff, rateDistanceDiff from adjacent-research.ts
  |   +-- For each of our shared calls: find best matching neighbor call
  |   +-- Reverse their bearing (N<->S, E<->W)
  |   +-- Compute angular difference and distance difference
  |   +-- Apply tolerance tables (same thresholds as existing rateBearingDiff/rateDistanceDiff)
  |   +-- Assign status and symbol: confirmed(checkmark) close_match(~) marginal(?) discrepancy(X)
  |   +-- Generate notes for discrepancies
  |
  +-- STEP 4: CHAIN-OF-TITLE TRACING (AdjacentResearchWorker)
  |   +-- From adjacent deed: who was the grantor?
  |   +-- Search county clerk for that person's deed (as grantee)
  |   +-- Trace back 1-2 generations, add to chainOfTitle[]
  |   +-- Flag if boundary description changed between generations
  |
  +-- STEP 5: REPORT ASSEMBLY (AdjacentResearchOrchestrator)
      +-- Collect all AdjacentResearchResult + CrossValidationResult
      +-- Compute crossValidationSummary (total counts, overallBoundaryConfidence)
      +-- Save cross_validation_report.json
      +-- Return FullCrossValidationReport
```

### Parallel Execution

Phases 4, 5, and 6 all run independently after Phase 3 completes. Within Phase 5, adjacent property research runs **sequentially** (not parallel) to avoid rate-limit violations on county clerk websites. The `maxConcurrent = 2` setting in the orchestrator is reserved for future use if rate limits allow.

---

## 4. §5.3 Adjacent Research Queue Builder

**New File:** `worker/src/services/adjacent-queue-builder.ts`  
**Status:** TODO — Must create

```typescript
// worker/src/services/adjacent-queue-builder.ts

import type { PropertyIntelligence, AdjacentProperty, P3BoundaryCall } from '../models/property-intelligence.js';

export interface AdjacentResearchTask {
  owner: string;
  alternateNames: string[];       // Spelling variants, entities, d/b/a
  calledAcreages: number[];
  sharedDirection: string;
  sharedCallIds: string[];        // Our boundary call IDs on the shared side
  estimatedSharedLength: number;  // Feet -- longer = higher priority
  priority: number;               // 1 = highest
  instrumentHints: string[];      // Known instrument#s or vol/pgs from plat/deed references
  source: 'plat' | 'deed' | 'adjacency_matrix' | 'cad';
}

export class AdjacentQueueBuilder {

  buildQueue(
    intelligence: PropertyIntelligence,
    subdivisionModel?: Record<string, unknown>,
  ): AdjacentResearchTask[] {
    const tasks: AdjacentResearchTask[] = [];
    const ownerIndex = new Map<string, AdjacentResearchTask>();

    // Source 1: Adjacent properties from Phase 3 intelligence
    for (const adj of intelligence.adjacentProperties ?? []) {
      const key = this.normalizeOwnerName(adj.ownerName ?? '');
      if (key === 'unknown' || key === '') continue;
      if (this.isRoad(adj.ownerName ?? '')) continue;  // Roads handled by Phase 6

      const existing = ownerIndex.get(key);
      if (existing) {
        // Merge acreages and instrument hints from duplicate entries
        if (adj.calledAcreage) {
          const ac = parseFloat(adj.calledAcreage);
          if (!isNaN(ac) && !existing.calledAcreages.includes(ac)) existing.calledAcreages.push(ac);
        }
        for (const inst of (adj.instrumentNumbers ?? [])) {
          if (!existing.instrumentHints.includes(inst)) existing.instrumentHints.push(inst);
        }
        continue;
      }

      const task: AdjacentResearchTask = {
        owner:                adj.ownerName ?? '',
        alternateNames:       this.generateNameVariants(adj.ownerName ?? ''),
        calledAcreages:       adj.calledAcreage ? [parseFloat(adj.calledAcreage)] : [],
        sharedDirection:      adj.direction ?? 'unknown',
        sharedCallIds:        this.findSharedCallIds(intelligence, adj),
        estimatedSharedLength: this.estimateSharedLength(intelligence, adj),
        priority:             0,
        instrumentHints:      [...(adj.instrumentNumbers ?? [])],
        source:               'plat',
      };
      ownerIndex.set(key, task);
      tasks.push(task);
    }

    // Source 2: Deed "called-from" references from deedChain
    for (const entry of intelligence.deedChain ?? []) {
      for (const calledFrom of ((entry as Record<string, unknown>).calledFrom as Array<{ name: string; acreage?: number; reference?: string; direction?: string }> | undefined) ?? []) {
        const key = this.normalizeOwnerName(calledFrom.name ?? '');
        if (key === '' || this.isRoad(calledFrom.name ?? '')) continue;

        if (!ownerIndex.has(key)) {
          const task: AdjacentResearchTask = {
            owner:                calledFrom.name ?? '',
            alternateNames:       this.generateNameVariants(calledFrom.name ?? ''),
            calledAcreages:       calledFrom.acreage != null ? [calledFrom.acreage] : [],
            sharedDirection:      calledFrom.direction ?? 'unknown',
            sharedCallIds:        [],
            estimatedSharedLength: 0,
            priority:             0,
            instrumentHints:      calledFrom.reference ? [calledFrom.reference] : [],
            source:               'deed',
          };
          ownerIndex.set(key, task);
          tasks.push(task);
        }
      }
    }

    // Source 3: Adjacency matrix from Phase 4 SubdivisionModel
    if (subdivisionModel?.lotRelationships) {
      const matrix = (subdivisionModel.lotRelationships as Record<string, unknown>).adjacencyMatrix as
        Record<string, Record<string, string[]>> | undefined;
      for (const adjacencies of Object.values(matrix ?? {})) {
        for (const [direction, neighbors] of Object.entries(adjacencies)) {
          for (const neighbor of (Array.isArray(neighbors) ? neighbors : [])) {
            if (!neighbor.startsWith('external:')) continue;
            const externalName = neighbor.replace('external:', '').trim();
            if (externalName === 'PERIMETER' || this.isRoad(externalName)) continue;
            const key = this.normalizeOwnerName(externalName);
            if (!ownerIndex.has(key)) {
              tasks.push({
                owner: externalName, alternateNames: this.generateNameVariants(externalName),
                calledAcreages: [], sharedDirection: direction, sharedCallIds: [],
                estimatedSharedLength: 0, priority: 0, instrumentHints: [], source: 'adjacency_matrix',
              });
              ownerIndex.set(key, tasks[tasks.length - 1]);
            }
          }
        }
      }
    }

    // Assign priorities: longer shared boundaries = higher priority
    tasks.sort((a, b) => b.estimatedSharedLength - a.estimatedSharedLength);
    tasks.forEach((t, i) => { t.priority = i + 1; });

    // Boost priority for tasks with instrument number hints (easier to find in clerk)
    for (const task of tasks) {
      if (task.instrumentHints.length > 0) task.priority = Math.max(1, task.priority - 2);
    }

    tasks.sort((a, b) => a.priority - b.priority);
    return tasks;
  }

  normalizeOwnerName(name: string): string {
    return name.toUpperCase().replace(/[.,;:'"]/g, '').replace(/\s+/g, ' ').trim();
  }

  generateNameVariants(name: string): string[] {
    const variants: string[] = [name];
    const upper = name.toUpperCase().trim();

    const suffixes = [
      'LLC', 'INC', 'CORP', 'LP', 'LTD', 'TRUST', 'FAMILY TRUST', 'LIVING TRUST',
      'REVOCABLE TRUST', 'IRREVOCABLE TRUST', 'ET AL', 'ET UX', 'ET VIR', 'ESTATE',
    ];
    for (const suffix of suffixes) {
      if (upper.endsWith(suffix)) variants.push(upper.slice(0, -suffix.length).trim());
    }

    const parts = upper.split(/\s+/);
    if (parts.length >= 2) {
      variants.push(parts[parts.length - 1]);                       // Last name only
      variants.push(`${parts[parts.length - 1]}, ${parts[0]}`);    // "LAST, FIRST"
      variants.push(parts.slice(0, 2).join(' '));                   // First two words
    }

    // Handle "R.K." style initials
    const withoutDots = upper.replace(/\./g, '');
    if (withoutDots !== upper) variants.push(withoutDots);
    const withSpacedDots = upper.replace(/\.(\S)/g, '. $1');
    if (withSpacedDots !== upper) variants.push(withSpacedDots);

    return [...new Set(variants)].filter(v => v.length >= 3);
  }

  isRoad(name: string): boolean {
    const upper = name.toUpperCase();
    return /^(FM|RM|SH|US|IH|CR|SPUR|LOOP|STATE\s+HWY|COUNTY\s+ROAD|INTERSTATE)\s*\d/.test(upper) ||
           /\b(ROW|RIGHT.OF.WAY|HIGHWAY|ROAD)\b/.test(upper);
  }

  private findSharedCallIds(intelligence: PropertyIntelligence, adj: AdjacentProperty): string[] {
    const ids: string[] = [];
    const ownerUpper = (adj.ownerName ?? '').toUpperCase();
    for (const lot of intelligence.lots ?? []) {
      for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
        if (call.along && call.along.toUpperCase().includes(ownerUpper)) ids.push(call.callId);
      }
    }
    for (const call of intelligence.perimeterBoundary?.calls ?? []) {
      if (call.along && call.along.toUpperCase().includes(ownerUpper)) ids.push(call.callId);
    }
    // Also use explicitly stored sharedCalls from Phase 3
    for (const seq of (adj.sharedCalls ?? [])) {
      const callId = `PERIM_${seq}`;
      if (!ids.includes(callId)) ids.push(callId);
    }
    return [...new Set(ids)];
  }

  private estimateSharedLength(intelligence: PropertyIntelligence, adj: AdjacentProperty): number {
    let total = 0;
    const callIds = this.findSharedCallIds(intelligence, adj);
    for (const lot of intelligence.lots ?? []) {
      for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
        if (callIds.includes(call.callId)) total += (call.distance ?? 0);
      }
    }
    return total;
  }
}
```

---

## 5. §5.4 Adjacent Property Research Worker

**New File:** `worker/src/services/adjacent-research-worker.ts`  
**Status:** TODO — Must create

This is the core engine that automates the county clerk search for each adjacent property, downloads deed images, and runs Claude Vision AI to extract boundary data. It also traces chain of title.

```typescript
// worker/src/services/adjacent-research-worker.ts

import type { ClerkAdapter, ClerkDocumentResult, DocumentImage } from '../adapters/clerk-adapter.js';
import type { AdjacentResearchTask } from './adjacent-queue-builder.js';
import * as fs from 'fs';
import * as path from 'path';

// Always read model from environment -- never hardcode
const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

// ── Output types ──────────────────────────────────────────────────────────────

export interface AdjacentResearchResult {
  owner: string;
  researchStatus: 'complete' | 'partial' | 'not_found' | 'failed';
  documentsFound: {
    deeds: DownloadedDocument[];
    plats: DownloadedDocument[];
  };
  extractedBoundary: ExtractedAdjacentBoundary | null;
  chainOfTitle: ChainEntry[];
  searchLog: SearchLogEntry[];
  errors: string[];
  timing: { totalMs: number; searchMs: number; downloadMs: number; extractionMs: number };
}

export interface DownloadedDocument {
  instrumentNumber: string;
  type: string;
  date: string;
  grantor: string;
  grantee: string;
  pages: number;
  images: string[];           // Local file paths
  calledAcreage?: number;
  relevanceScore: number;
}

export interface ExtractedAdjacentBoundary {
  totalCalls: number;
  metesAndBounds: AdjacentBoundaryCall[];
  calledAcreage?: number;
  surveyReference?: string;
  pointOfBeginning?: string;
  notes: string[];
}

export interface AdjacentBoundaryCall {
  callNumber: number;
  bearing: string;
  distance: number;
  unit: 'feet' | 'varas';
  type: 'straight' | 'curve';
  along?: string;
  monument?: string;
  curve?: {
    radius: number;
    arcLength?: number;
    delta?: string;
    chordBearing?: string;
    chordDistance?: number;
  };
  /** True when this call mentions our owner or subdivision name */
  referencesOurProperty: boolean;
  /** True when AI determined this call forms the shared boundary */
  isSharedBoundary: boolean;
  confidence: number;
}

export interface ChainEntry {
  grantor: string;
  grantee: string;
  date: string;
  instrument: string;
  calledAcreage?: number;
  /** Whether the boundary description changed relative to the previous deed */
  boundaryDescriptionChanged: boolean;
}

export interface SearchLogEntry {
  query: string;
  type: 'instrument' | 'grantee' | 'grantor' | 'legal';
  resultsFound: number;
  selectedDocument?: string;
  reason: string;
}

// ── AdjacentResearchWorker ─────────────────────────────────────────────────────

export class AdjacentResearchWorker {
  private clerkAdapter: ClerkAdapter;
  private apiKey: string;
  private outputDir: string;
  private searchLog: SearchLogEntry[] = [];
  private errors: string[] = [];

  constructor(clerkAdapter: ClerkAdapter, projectId: string) {
    this.clerkAdapter = clerkAdapter;
    this.apiKey = process.env.ANTHROPIC_API_KEY!;
    this.outputDir = `/tmp/harvest/${projectId}/adjacent`;
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  async researchAdjacentProperty(
    task: AdjacentResearchTask,
    ourPropertyContext: {
      owner: string;
      subdivisionName?: string;
      instrumentNumbers: string[];
      sharedCallBearings: string[];
    },
  ): Promise<AdjacentResearchResult> {
    const startTime = Date.now();
    const ownerDir = path.join(this.outputDir, task.owner.replace(/[^a-zA-Z0-9]/g, '_'));
    fs.mkdirSync(ownerDir, { recursive: true });

    const result: AdjacentResearchResult = {
      owner: task.owner, researchStatus: 'not_found',
      documentsFound: { deeds: [], plats: [] },
      extractedBoundary: null, chainOfTitle: [], searchLog: [], errors: [],
      timing: { totalMs: 0, searchMs: 0, downloadMs: 0, extractionMs: 0 },
    };

    try {
      // STEP A: Find the deed
      const searchStart = Date.now();
      const deed = await this.findAdjacentDeed(task, ourPropertyContext);
      result.timing.searchMs = Date.now() - searchStart;

      if (!deed) {
        result.researchStatus = 'not_found';
        result.errors.push(`Could not find deed for "${task.owner}" after trying ${task.alternateNames.length} name variants`);
        result.timing.totalMs = Date.now() - startTime;
        result.searchLog = this.searchLog;
        return result;
      }

      // STEP B: Download images
      const downloadStart = Date.now();
      const images = await this.downloadDeedImages(deed, ownerDir);
      result.timing.downloadMs = Date.now() - downloadStart;

      result.documentsFound.deeds.push({
        instrumentNumber: deed.instrumentNumber, type: deed.documentType,
        date: deed.recordingDate, grantor: deed.grantors.join(', '), grantee: deed.grantees.join(', '),
        pages: images.length, images: images.map(i => i.imagePath), relevanceScore: 80,
      });

      if (images.length === 0) {
        result.researchStatus = 'partial';
        result.errors.push(`Deed ${deed.instrumentNumber} found but no images downloaded`);
        result.timing.totalMs = Date.now() - startTime;
        result.searchLog = this.searchLog;
        return result;
      }

      // STEP C: AI Extraction
      const extractStart = Date.now();
      const extracted = await this.extractBoundaryFromAdjacentDeed(images.map(i => i.imagePath), task, ourPropertyContext);
      result.timing.extractionMs = Date.now() - extractStart;
      result.extractedBoundary = extracted;
      result.researchStatus = extracted ? 'complete' : 'partial';

      // STEP D: Chain of Title (1-2 predecessors)
      if (deed.grantors.length > 0) {
        result.chainOfTitle = await this.traceChainOfTitle(deed, 2);
      }

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      result.researchStatus = 'failed';
      result.errors.push(`Research failed: ${msg}`);
    }

    result.timing.totalMs = Date.now() - startTime;
    result.searchLog = [...this.searchLog];
    this.searchLog = [];
    this.errors = [];
    return result;
  }

  private async findAdjacentDeed(
    task: AdjacentResearchTask,
    context: { owner: string; subdivisionName?: string; instrumentNumbers: string[]; sharedCallBearings: string[] },
  ): Promise<ClerkDocumentResult | null> {
    // Strategy 1: Direct instrument number (highest confidence)
    for (const inst of task.instrumentHints) {
      try {
        const results = await this.clerkAdapter.searchByInstrumentNumber(inst);
        this.searchLog.push({ query: inst, type: 'instrument', resultsFound: results.length, selectedDocument: results[0]?.instrumentNumber, reason: 'Direct instrument number from plat/deed reference' });
        if (results.length > 0) return results[0];
      } catch { /* continue */ }
      await this.rateLimit();
    }

    // Strategy 2: Grantee name search with AI selection
    for (const nameVariant of task.alternateNames) {
      try {
        const results = await this.clerkAdapter.searchByGranteeName(nameVariant);
        this.searchLog.push({ query: nameVariant, type: 'grantee', resultsFound: results.length, reason: 'Grantee name variant' });
        const deeds = results.filter(r => ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed', 'other'].includes(r.documentType));
        if (deeds.length === 0) { await this.rateLimit(); continue; }
        if (deeds.length === 1) return deeds[0];
        const selected = await this.aiSelectCorrectDeed(deeds, task, context);
        if (selected) return selected;
      } catch { /* continue */ }
      await this.rateLimit();
    }

    // Strategy 3: Grantor name search (fallback)
    const primaryName = task.alternateNames[0] ?? task.owner;
    try {
      const results = await this.clerkAdapter.searchByGrantorName(primaryName);
      this.searchLog.push({ query: primaryName, type: 'grantor', resultsFound: results.length, reason: 'Grantor search -- property may have been sold' });
      const deeds = results.filter(r => ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed'].includes(r.documentType));
      if (deeds.length > 0) return await this.aiSelectCorrectDeed(deeds, task, context);
    } catch { /* continue */ }

    return null;
  }

  private async aiSelectCorrectDeed(
    candidates: ClerkDocumentResult[],
    task: AdjacentResearchTask,
    context: { owner: string; subdivisionName?: string },
  ): Promise<ClerkDocumentResult | null> {
    const candidateList = candidates.map((c, i) =>
      `${i + 1}. Instrument# ${c.instrumentNumber} | Type: ${c.documentType} | Date: ${c.recordingDate} | Grantors: ${c.grantors.join(', ')} | Grantees: ${c.grantees.join(', ')}`,
    ).join('\n');

    const prompt = `You are a title researcher selecting the correct deed for an adjacent property.

WE ARE LOOKING FOR: A deed conveying property to "${task.owner}" adjacent to our subject property.
ADJACENT PROPERTY DETAILS:
- Called acreages from our plat: ${task.calledAcreages.join(', ')} acres (if known)
- Shared boundary direction: ${task.sharedDirection}
- Our property: ${context.owner}${context.subdivisionName ? `, part of ${context.subdivisionName}` : ''}

CANDIDATE DEEDS:
${candidateList}

SELECTION CRITERIA:
1. The deed should convey real property TO (grantee) "${task.owner}"
2. Called acreage should match one of: ${task.calledAcreages.join(', ')} acres (if known)
3. If multiple deeds, prefer the most recent (current ownership)
4. A deed of trust or lien is NOT what we want -- we need a conveyance deed
5. If none match, say "NONE"

Reply with ONLY the number (1, 2, 3...) of the best candidate, or "NONE".`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 50, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await response.json() as { content?: Array<{ type: string; text: string }> };
    const answer = (data.content?.[0]?.text ?? '').trim();
    if (answer === 'NONE') return null;
    const idx = parseInt(answer) - 1;
    if (idx >= 0 && idx < candidates.length) {
      this.searchLog.push({ query: `AI selection from ${candidates.length} candidates`, type: 'grantee', resultsFound: candidates.length, selectedDocument: candidates[idx].instrumentNumber, reason: `AI selected candidate #${idx + 1}` });
      return candidates[idx];
    }
    return null;
  }

  private async downloadDeedImages(deed: ClerkDocumentResult, outputDir: string): Promise<DocumentImage[]> {
    // Note: outputDir is available if images need to be copied/renamed after download.
    // The KofileClerkAdapter saves images to its own configured path via getDocumentImages().
    // If the adapter returns absolute paths outside outputDir, copy them here.
    void outputDir; // kept as parameter for future use when adapter is updated to accept output directory
    try { return await this.clerkAdapter.getDocumentImages(deed.instrumentNumber); }
    catch { return []; }
  }

  private async extractBoundaryFromAdjacentDeed(
    imagePaths: string[],
    task: AdjacentResearchTask,
    context: { owner: string; subdivisionName?: string },
  ): Promise<ExtractedAdjacentBoundary | null> {
    if (imagePaths.length === 0) return null;

    const imageContents = imagePaths.map(p => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/png' as const, data: fs.readFileSync(p).toString('base64') },
    }));

    const prompt = `You are a professional land surveyor extracting boundary data from an adjacent property deed.

THIS DEED BELONGS TO: ${task.owner}
OUR SUBJECT PROPERTY: ${context.owner}${context.subdivisionName ? ` (${context.subdivisionName})` : ''}
SHARED BOUNDARY IS ON THE: ${task.sharedDirection} side of our property

Extract the COMPLETE metes and bounds description. Return JSON:
{
  "calledAcreage": 0.0,
  "surveyReference": "abstract and survey name",
  "pointOfBeginning": "monument description",
  "metesAndBounds": [
    {
      "callNumber": 1,
      "bearing": "N ##degrees##'##\\" E",
      "distance": 0.0,
      "unit": "feet",
      "type": "straight",
      "along": "what this line runs along",
      "monument": "monument at end of this call",
      "referencesOurProperty": false,
      "isSharedBoundary": false,
      "curve": null,
      "confidence": 80
    }
  ],
  "calledFromReferences": [ { "name": "owner name", "acreage": 0.0, "instrument": null } ],
  "notes": []
}

CRITICAL INSTRUCTIONS:
- Mark referencesOurProperty=true for any call mentioning "${context.owner}" or "${context.subdivisionName ?? 'N/A'}"
- Mark isSharedBoundary=true for calls forming the shared boundary (mention our property, or direction matches ${task.sharedDirection})
- For watermarked text: give BEST reading with confidence score
- Extract EVERY call -- do not skip any
- For varas, keep unit as "varas" (we convert later)
Return ONLY valid JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, messages: [{ role: 'user', content: [...imageContents, { type: 'text', text: prompt }] }] }),
    });
    const data = await response.json() as { content?: Array<{ type: string; text: string }> };
    const text = data.content?.[0]?.text ?? '';
    try {
      const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim()) as {
        metesAndBounds?: AdjacentBoundaryCall[]; calledAcreage?: number;
        surveyReference?: string; pointOfBeginning?: string; notes?: string[];
      };
      return {
        totalCalls: parsed.metesAndBounds?.length ?? 0, metesAndBounds: parsed.metesAndBounds ?? [],
        calledAcreage: parsed.calledAcreage, surveyReference: parsed.surveyReference,
        pointOfBeginning: parsed.pointOfBeginning, notes: parsed.notes ?? [],
      };
    } catch { return null; }
  }

  private async traceChainOfTitle(startDeed: ClerkDocumentResult, generations: number): Promise<ChainEntry[]> {
    const chain: ChainEntry[] = [{
      grantor: startDeed.grantors.join(', '), grantee: startDeed.grantees.join(', '),
      date: startDeed.recordingDate, instrument: startDeed.instrumentNumber, boundaryDescriptionChanged: false,
    }];
    let currentGrantors = startDeed.grantors;
    for (let gen = 0; gen < generations && currentGrantors.length > 0; gen++) {
      const grantor = currentGrantors[0];
      try {
        const results = await this.clerkAdapter.searchByGranteeName(grantor, { documentTypes: ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed'] as never });
        const sorted = results
          .filter(r => ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed', 'other'].includes(r.documentType))
          .sort((a, b) => new Date(b.recordingDate).getTime() - new Date(a.recordingDate).getTime());
        if (sorted.length > 0) {
          const pred = sorted[0];
          chain.push({ grantor: pred.grantors.join(', '), grantee: pred.grantees.join(', '), date: pred.recordingDate, instrument: pred.instrumentNumber, boundaryDescriptionChanged: false });
          currentGrantors = pred.grantors;
        } else { break; }
      } catch { break; }
      await this.rateLimit();
    }
    return chain;
  }

  private async rateLimit(): Promise<void> {
    // Minimum 3 seconds between clerk navigations (per spec rate limit rules)
    const delay = 3000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

---

## 6. §5.5 Cross-Validation Engine

**New File:** `worker/src/services/cross-validation-engine.ts`  
**Status:** TODO — Must create

> **CRITICAL:** This class **imports and reuses** the bearing math functions already implemented in `worker/src/services/adjacent-research.ts`. Do NOT reimplement `parseAzimuth`, `reverseAzimuth`, `angularDiff`, `rateBearingDiff`, or `rateDistanceDiff`. Import them.

```typescript
// worker/src/services/cross-validation-engine.ts

import {
  parseAzimuth,
  reverseAzimuth,
  angularDiff,
  rateBearingDiff,
  rateDistanceDiff,
} from './adjacent-research.js';
import type { P3BoundaryCall } from '../models/property-intelligence.js';
import type { AdjacentBoundaryCall } from './adjacent-research-worker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CallComparison {
  callId: string;
  ourBearing: string;
  ourDistance: number;
  theirBearing: string | null;
  theirDistance: number | null;
  theirReversed: string | null;       // Their bearing after N<->S E<->W reversal
  bearingDifference: string | null;   // DMS format e.g. "0deg00'03\""
  bearingDifferenceDeg: number | null;
  distanceDifference: number | null;
  status: 'confirmed' | 'close_match' | 'marginal' | 'discrepancy' | 'unverified';
  symbol: 'confirmed' | '~' | '?' | 'discrepancy';  // 'confirmed'=checkmark, '~'=close, '?'=unverified/marginal, 'discrepancy'=X mark
  notes: string | null;
}

export interface CrossValidationResult {
  adjacentOwner: string;
  sharedDirection: string;
  callComparisons: CallComparison[];
  sharedBoundaryConfidence: number;   // 0-100
  confirmedCalls: number;
  closeMatchCalls: number;
  marginalCalls: number;
  unverifiedCalls: number;
  discrepancyCalls: number;
}

// Tolerance thresholds -- MUST match rateBearingDiff() and rateDistanceDiff() in adjacent-research.ts
// Bearing: <=30 arc-sec = CONFIRMED, <=5 arc-min = CLOSE_MATCH, <=30 arc-min = MARGINAL, >30 arc-min = DISCREPANCY
// Distance: <=0.5ft = CONFIRMED, <=2.0ft = CLOSE_MATCH, <=5.0ft = MARGINAL, >5.0ft = DISCREPANCY

// ── CrossValidationEngine ─────────────────────────────────────────────────────

export class CrossValidationEngine {

  validate(
    ourCalls: P3BoundaryCall[],
    theirCalls: AdjacentBoundaryCall[],
    adjacentOwner: string,
    sharedDirection: string,
  ): CrossValidationResult {
    const comparisons: CallComparison[] = [];
    const theirShared = theirCalls.filter(c => c.isSharedBoundary || c.referencesOurProperty);

    for (const ourCall of ourCalls) {
      const match = this.findBestMatch(ourCall, theirShared);
      comparisons.push(this.buildComparison(ourCall, match));
    }

    const confirmed   = comparisons.filter(c => c.status === 'confirmed').length;
    const close       = comparisons.filter(c => c.status === 'close_match').length;
    const marginal    = comparisons.filter(c => c.status === 'marginal').length;
    const unverified  = comparisons.filter(c => c.status === 'unverified').length;
    const discrepancy = comparisons.filter(c => c.status === 'discrepancy').length;
    const total       = comparisons.length;

    // Confidence: weighted average (confirmed=100, close=75, marginal=40, unverified=25, discrepancy=0)
    const confidence = total > 0
      ? Math.round((confirmed * 100 + close * 75 + marginal * 40 + unverified * 25) / total)
      : 0;

    return {
      adjacentOwner, sharedDirection, callComparisons: comparisons,
      sharedBoundaryConfidence: confidence,
      confirmedCalls: confirmed, closeMatchCalls: close, marginalCalls: marginal,
      unverifiedCalls: unverified, discrepancyCalls: discrepancy,
    };
  }

  private findBestMatch(ourCall: P3BoundaryCall, theirCalls: AdjacentBoundaryCall[]): AdjacentBoundaryCall | null {
    if (theirCalls.length === 0) return null;
    let bestMatch: AdjacentBoundaryCall | null = null;
    let bestScore = -Infinity;

    const ourAz = parseAzimuth(ourCall.bearing ?? '');
    if (ourAz === null) return null;
    const reversedAz = reverseAzimuth(ourAz);

    for (const theirs of theirCalls) {
      const theirAz = parseAzimuth(theirs.bearing ?? '');
      if (theirAz === null) continue;
      const bearingDiff = angularDiff(reversedAz, theirAz);
      if (bearingDiff > 0.5) continue;  // Outside MARGINAL threshold -- not a match
      const distDiff = Math.abs((ourCall.distance ?? 0) - theirs.distance);
      let score = (0.5 - bearingDiff) * 40 + Math.max(0, 50 - distDiff) * 2;
      if (ourCall.along && theirs.along) {
        const a = ourCall.along.toUpperCase(); const b = theirs.along.toUpperCase();
        if (a.includes(b) || b.includes(a)) score += 30;
      }
      if (ourCall.type === theirs.type) score += 10;
      if (score > bestScore) { bestScore = score; bestMatch = theirs; }
    }
    return bestScore > 20 ? bestMatch : null;
  }

  private buildComparison(ourCall: P3BoundaryCall, theirCall: AdjacentBoundaryCall | null): CallComparison {
    if (!theirCall) {
      return {
        callId: ourCall.callId, ourBearing: ourCall.bearing ?? '', ourDistance: ourCall.distance ?? 0,
        theirBearing: null, theirDistance: null, theirReversed: null,
        bearingDifference: null, bearingDifferenceDeg: null, distanceDifference: null,
        status: 'unverified', symbol: '?', notes: 'No matching call found in adjacent deed',
      };
    }

    const ourAz      = parseAzimuth(ourCall.bearing ?? '');
    const theirAz    = parseAzimuth(theirCall.bearing ?? '');
    const theirRevAz = theirAz !== null ? reverseAzimuth(theirAz) : null;
    const bearingDiffDeg = (ourAz !== null && theirRevAz !== null) ? angularDiff(ourAz, theirRevAz) : null;
    const distDiff = Math.abs((ourCall.distance ?? 0) - theirCall.distance);

    // Use existing tolerance functions from adjacent-research.ts -- do not reimplement
    const bearingRating = bearingDiffDeg !== null ? rateBearingDiff(bearingDiffDeg) : 'UNKNOWN';
    const distRating    = rateDistanceDiff(distDiff);

    // Overall rating = worst (max) of bearing and distance
    const ratingOrder = ['CONFIRMED', 'CLOSE_MATCH', 'MARGINAL', 'DISCREPANCY', 'UNKNOWN'];
    const worstRating = ratingOrder[Math.max(ratingOrder.indexOf(bearingRating), ratingOrder.indexOf(distRating))];

    const statusMap: Record<string, CallComparison['status']> = {
      CONFIRMED: 'confirmed', CLOSE_MATCH: 'close_match', MARGINAL: 'marginal',
      DISCREPANCY: 'discrepancy', UNKNOWN: 'unverified',
    };
    const symbolMap: Record<string, CallComparison['symbol']> = {
      confirmed: 'confirmed', close_match: '~', marginal: '?', discrepancy: 'discrepancy', unverified: '?',
    };

    const status = statusMap[worstRating] ?? 'unverified';
    const symbol = symbolMap[status];

    // Format bearing difference as DMS
    let bearingDiffDMS: string | null = null;
    if (bearingDiffDeg !== null) {
      const d = Math.floor(bearingDiffDeg);
      const mf = (bearingDiffDeg - d) * 60; const m = Math.floor(mf);
      const s = Math.round((mf - m) * 60);
      bearingDiffDMS = `${d}deg${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
    }

    // Format reversed bearing as quadrant string
    let theirReversedStr: string | null = null;
    if (theirRevAz !== null) {
      let ns: string, ew: string, qDeg: number;
      if      (theirRevAz <= 90)  { ns = 'N'; ew = 'E'; qDeg = theirRevAz; }
      else if (theirRevAz <= 180) { ns = 'S'; ew = 'E'; qDeg = 180 - theirRevAz; }
      else if (theirRevAz <= 270) { ns = 'S'; ew = 'W'; qDeg = theirRevAz - 180; }
      else                        { ns = 'N'; ew = 'W'; qDeg = 360 - theirRevAz; }
      const d = Math.floor(qDeg); const mf = (qDeg - d) * 60; const m = Math.floor(mf); const s = Math.round((mf - m) * 60);
      theirReversedStr = `${ns} ${String(d).padStart(2, '0')}deg${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}" ${ew}`;
    }

    const notes = status === 'discrepancy'
      ? `Bearing diff: ${bearingDiffDMS ?? 'unknown'}, Distance diff: ${distDiff.toFixed(2)}'. Investigate -- may indicate datum shift, re-survey, or boundary disagreement.`
      : null;

    return {
      callId: ourCall.callId, ourBearing: ourCall.bearing ?? '', ourDistance: ourCall.distance ?? 0,
      theirBearing: theirCall.bearing, theirDistance: theirCall.distance, theirReversed: theirReversedStr,
      bearingDifference: bearingDiffDMS, bearingDifferenceDeg: bearingDiffDeg, distanceDifference: distDiff,
      status, symbol, notes,
    };
  }
}
```

**Tolerance table (for reference — implemented in `adjacent-research.ts`, used here via imports):**

| Bearing Difference | `rateBearingDiff()` | Symbol |
|---|---|---|
| <= 0deg00'30" (0.00833deg) | `CONFIRMED` | checkmark |
| <= 0deg05'00" (0.0833deg) | `CLOSE_MATCH` | ~ |
| <= 0deg30'00" (0.5deg) | `MARGINAL` | ? |
| > 0deg30'00" | `DISCREPANCY` | X |

| Distance Difference | `rateDistanceDiff()` | Symbol |
|---|---|---|
| <= 0.5 ft | `CONFIRMED` | checkmark |
| <= 2.0 ft | `CLOSE_MATCH` | ~ |
| <= 5.0 ft | `MARGINAL` | ? |
| > 5.0 ft | `DISCREPANCY` | X |

---

## 7. §5.6 Adjacent Research Orchestrator

**New File:** `worker/src/services/adjacent-research-orchestrator.ts`  
**Status:** TODO — Must create

```typescript
// worker/src/services/adjacent-research-orchestrator.ts

import { AdjacentQueueBuilder } from './adjacent-queue-builder.js';
import { AdjacentResearchWorker } from './adjacent-research-worker.js';
import { CrossValidationEngine, type CrossValidationResult } from './cross-validation-engine.js';
import { KofileClerkAdapter } from '../adapters/kofile-clerk-adapter.js';
import type { PropertyIntelligence, P3BoundaryCall } from '../models/property-intelligence.js';
import type { AdjacentResearchResult } from './adjacent-research-worker.js';
import type { AdjacentResearchTask } from './adjacent-queue-builder.js';
import * as fs from 'fs';
import * as path from 'path';

export interface FullCrossValidationReport {
  status: 'complete' | 'partial' | 'failed';
  adjacentProperties: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[];
  crossValidationSummary: {
    totalAdjacentProperties: number;
    successfullyResearched:  number;
    failedResearch:          number;
    totalSharedCalls:        number;
    confirmedCalls:          number;
    closeMatchCalls:         number;
    marginalCalls:           number;
    unverifiedCalls:         number;
    discrepancyCalls:        number;
    overallBoundaryConfidence: number;
  };
  timing:  { totalMs: number };
  aiCalls: number;
  errors:  string[];
}

export class AdjacentResearchOrchestrator {

  async research(
    projectId: string,
    intelligence: PropertyIntelligence,
    subdivisionModel?: Record<string, unknown>,
  ): Promise<FullCrossValidationReport> {
    const startTime = Date.now();
    const errors: string[] = [];
    let totalAICalls = 0;

    // Build queue
    const queueBuilder = new AdjacentQueueBuilder();
    const queue = queueBuilder.buildQueue(intelligence, subdivisionModel);
    console.log(`[Adjacent] ${queue.length} adjacent properties to research`);
    for (const task of queue) {
      console.log(`[Adjacent]   #${task.priority} ${task.owner} (${task.sharedDirection}, ~${task.estimatedSharedLength.toFixed(0)}' shared, ${task.instrumentHints.length} hints)`);
    }

    // Initialise clerk adapter
    // Resolve FIPS from the PropertyIntelligence. The countyFIPS field is added to the
    // property object by Phase 1 (PropertyIdentity). If absent, throw rather than
    // silently defaulting to a specific county -- a wrong county would scrape the wrong clerk.
    const countyFIPS = (intelligence.property as Record<string, unknown>)?.countyFIPS as string | undefined;
    if (!countyFIPS) throw new Error('intelligence.property.countyFIPS is required but missing -- ensure Phase 1 ran successfully');
    const countyName  = intelligence.property?.county ?? 'Bell';
    const clerkAdapter = new KofileClerkAdapter(countyFIPS, countyName);
    await clerkAdapter.initSession();

    const worker       = new AdjacentResearchWorker(clerkAdapter, projectId);
    const crossValidator = new CrossValidationEngine();
    const ourContext = {
      owner:             intelligence.property?.name ?? '',
      subdivisionName:   intelligence.subdivision?.name,
      instrumentNumbers: (intelligence.deedChain ?? []).map(d => d.instrument),
      sharedCallBearings: this.getSharedCallBearings(intelligence, queue),
    };

    // Process queue sequentially (rate limits make true parallelism risky on county sites)
    const results: (AdjacentResearchResult & { crossValidation?: CrossValidationResult })[] = [];

    for (const task of queue) {
      try {
        const result = await worker.researchAdjacentProperty(task, ourContext);
        totalAICalls += 3;  // AI deed selection + extraction + optional chain-of-title search

        // Cross-validate if we got boundary data
        if (result.extractedBoundary && result.extractedBoundary.totalCalls > 0) {
          const ourSharedCalls = this.getOurCallsForAdjacent(intelligence, task);
          const theirSharedCalls = result.extractedBoundary.metesAndBounds;
          if (ourSharedCalls.length > 0 && theirSharedCalls.length > 0) {
            const cv = crossValidator.validate(ourSharedCalls, theirSharedCalls, task.owner, task.sharedDirection);
            (result as typeof result & { crossValidation: CrossValidationResult }).crossValidation = cv;
            totalAICalls++;
            console.log(`[Adjacent] ${task.owner}: ${cv.confirmedCalls}checkmark ${cv.closeMatchCalls}~ ${cv.marginalCalls}? ${cv.discrepancyCalls}X confidence=${cv.sharedBoundaryConfidence}`);
          }
        }
        results.push(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Research failed for ${task.owner}: ${msg}`);
        results.push({
          owner: task.owner, researchStatus: 'failed',
          documentsFound: { deeds: [], plats: [] }, extractedBoundary: null,
          chainOfTitle: [], searchLog: [], errors: [msg],
          timing: { totalMs: 0, searchMs: 0, downloadMs: 0, extractionMs: 0 },
        });
      }
    }

    await clerkAdapter.destroySession();

    // Build summary
    const allComparisons = results
      .filter(r => (r as typeof r & { crossValidation?: CrossValidationResult }).crossValidation)
      .flatMap(r => ((r as typeof r & { crossValidation: CrossValidationResult }).crossValidation).callComparisons);

    const summary = {
      totalAdjacentProperties: queue.length,
      successfullyResearched:  results.filter(r => r.researchStatus === 'complete').length,
      failedResearch:          results.filter(r => r.researchStatus === 'failed' || r.researchStatus === 'not_found').length,
      totalSharedCalls:        allComparisons.length,
      confirmedCalls:          allComparisons.filter(c => c.status === 'confirmed').length,
      closeMatchCalls:         allComparisons.filter(c => c.status === 'close_match').length,
      marginalCalls:           allComparisons.filter(c => c.status === 'marginal').length,
      unverifiedCalls:         allComparisons.filter(c => c.status === 'unverified').length,
      discrepancyCalls:        allComparisons.filter(c => c.status === 'discrepancy').length,
      overallBoundaryConfidence: 0,
    };

    if (allComparisons.length > 0) {
      summary.overallBoundaryConfidence = Math.round(
        (summary.confirmedCalls * 100 + summary.closeMatchCalls * 75 +
         summary.marginalCalls * 40 + summary.unverifiedCalls * 25) / allComparisons.length,
      );
    }

    const report: FullCrossValidationReport = {
      status: summary.failedResearch === queue.length ? 'failed' : summary.failedResearch > 0 ? 'partial' : 'complete',
      adjacentProperties: results, crossValidationSummary: summary,
      timing: { totalMs: Date.now() - startTime }, aiCalls: totalAICalls, errors,
    };

    // Persist to disk -- consumed by Phase 7
    const outputPath = `/tmp/analysis/${projectId}/cross_validation_report.json`;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[Adjacent] Saved: ${outputPath}`);
    console.log(`[Adjacent] COMPLETE: ${summary.successfullyResearched}/${summary.totalAdjacentProperties} researched, confidence: ${summary.overallBoundaryConfidence}%`);

    return report;
  }

  private getOurCallsForAdjacent(intelligence: PropertyIntelligence, task: AdjacentResearchTask): P3BoundaryCall[] {
    const calls: P3BoundaryCall[] = [];
    const ownerUpper = task.owner.toUpperCase();
    for (const lot of intelligence.lots ?? []) {
      for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
        if (call.along && call.along.toUpperCase().includes(ownerUpper)) calls.push(call);
      }
    }
    for (const call of intelligence.perimeterBoundary?.calls ?? []) {
      if (call.along && call.along.toUpperCase().includes(ownerUpper)) calls.push(call);
    }
    // Fallback: use sharedCallIds from queue builder
    if (calls.length === 0 && task.sharedCallIds.length > 0) {
      for (const lot of intelligence.lots ?? []) {
        for (const call of [...(lot.boundaryCalls ?? []), ...(lot.curves ?? [])]) {
          if (task.sharedCallIds.includes(call.callId)) calls.push(call);
        }
      }
    }
    return calls;
  }

  private getSharedCallBearings(intelligence: PropertyIntelligence, queue: AdjacentResearchTask[]): string[] {
    const bearings: string[] = [];
    for (const task of queue) {
      for (const call of this.getOurCallsForAdjacent(intelligence, task)) {
        if (call.bearing) bearings.push(call.bearing);
      }
    }
    return bearings;
  }
}
```

---

## 8. §5.7 Express API & CLI

### 8.1 Express Endpoints — Add to `worker/src/index.ts`

```typescript
// Add to imports in worker/src/index.ts:
import { AdjacentResearchOrchestrator, type FullCrossValidationReport } from './services/adjacent-research-orchestrator.js';

// In-memory job state (per-worker-process)
const activeAdjacentJobs = new Map<string, { status: 'running' | 'complete' | 'failed'; result?: FullCrossValidationReport }>();

// ---- POST /research/adjacent ------------------------------------------------
app.post('/research/adjacent', requireAuth, async (req: Request, res: Response) => {
  const { projectId, intelligencePath, subdivisionPath } = req.body as {
    projectId: string; intelligencePath?: string; subdivisionPath?: string;
  };
  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' }); return;
  }
  const resolvedPath = intelligencePath ?? `/tmp/analysis/${projectId}/property_intelligence.json`;
  if (!fs.existsSync(resolvedPath)) {
    res.status(400).json({ error: `intelligence file not found at: ${resolvedPath}`, hint: 'Run POST /research/analyze first' }); return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' }); return;
  }

  activeAdjacentJobs.set(projectId, { status: 'running' });
  res.status(202).json({ status: 'accepted', projectId, pollUrl: `/research/adjacent/${projectId}`, resultsPath: `/tmp/analysis/${projectId}/cross_validation_report.json` });

  const intelligence = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8')) as PropertyIntelligence;
  const subdivisionModel = subdivisionPath && fs.existsSync(subdivisionPath)
    ? JSON.parse(fs.readFileSync(subdivisionPath, 'utf-8')) as Record<string, unknown>
    : undefined;

  new AdjacentResearchOrchestrator().research(projectId, intelligence, subdivisionModel)
    .then(report => { activeAdjacentJobs.set(projectId, { status: 'complete', result: report }); })
    .catch((err: unknown) => {
      console.error(`[Adjacent] ${projectId} failed:`, err);
      activeAdjacentJobs.set(projectId, { status: 'failed' });
    });
});

// ---- GET /research/adjacent/:projectId --------------------------------------
app.get('/research/adjacent/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;
  const state = activeAdjacentJobs.get(projectId);
  if (!state) {
    const diskPath = `/tmp/analysis/${projectId}/cross_validation_report.json`;
    if (fs.existsSync(diskPath)) {
      try { res.json({ status: 'complete', result: JSON.parse(fs.readFileSync(diskPath, 'utf-8')) }); return; }
      catch { res.status(500).json({ error: 'Failed to parse cross_validation_report.json' }); return; }
    }
    res.status(404).json({ error: `No adjacent research for: ${projectId}`, hint: 'Start with POST /research/adjacent' }); return;
  }
  if (state.status === 'running') { res.json({ status: 'in_progress', projectId, message: 'Each neighbor takes 2-5 minutes' }); return; }
  if (state.status === 'failed')  { res.status(500).json({ status: 'failed', projectId }); return; }
  res.json({ status: 'complete', projectId, result: state.result });
});
```

Add Phase 5 to the server startup console log block:

```typescript
console.log('  POST   /research/adjacent           <- Phase 5: adjacent research & cross-validation');
console.log('  GET    /research/adjacent/:projectId <- Phase 5: adjacent status/result');
```

### 8.2 CLI Script — `worker/adjacent.sh`

```bash
#!/usr/bin/env bash
# adjacent.sh -- Phase 5: Adjacent Property Research & Boundary Cross-Validation
# Research all adjacent properties and cross-validate shared boundary calls.
#
# Usage: ./adjacent.sh <projectId>
# Example: ./adjacent.sh ash-trust-001

PROJECT_ID="$1"
if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./adjacent.sh <projectId>"
  exit 1
fi

source /root/starr-worker/.env

INTEL_PATH="/tmp/analysis/$PROJECT_ID/property_intelligence.json"
SUB_PATH="/tmp/analysis/$PROJECT_ID/subdivision_model.json"

if [ ! -f "$INTEL_PATH" ]; then
  echo "[ERROR] No intelligence file. Run Phase 3 first."
  echo "Expected: $INTEL_PATH"
  exit 1
fi

echo "==================================="
echo "  Starr Adjacent Property Research"
echo "  (Phase 5 Cross-Validation)"
echo "==================================="
echo "Project:      $PROJECT_ID"
echo "Intelligence: $INTEL_PATH"
[ -f "$SUB_PATH" ] && echo "Subdivision:  $SUB_PATH"
echo ""

BODY="{\"projectId\": \"$PROJECT_ID\", \"intelligencePath\": \"$INTEL_PATH\""
[ -f "$SUB_PATH" ] && BODY="$BODY, \"subdivisionPath\": \"$SUB_PATH\""
BODY="$BODY}"

curl -s -X POST http://localhost:3100/research/adjacent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d "$BODY"

echo ""
echo ""
echo "Adjacent research started (10-30 minutes depending on neighbors)."
echo ""
echo "Monitor:  pm2 logs starr-worker --lines 50"
echo "Status:   curl -s http://localhost:3100/research/adjacent/$PROJECT_ID -H \"Authorization: Bearer \$WORKER_API_KEY\" | python3 -m json.tool | head -20"
echo "Results:  cat /tmp/analysis/$PROJECT_ID/cross_validation_report.json | python3 -m json.tool"
```

---

## 9. File Map

### Files That Must Be CREATED

```
worker/
+-- src/
|   +-- services/
|       +-- adjacent-queue-builder.ts        TODO  Phase 5 SS5.3 -- AdjacentQueueBuilder
|       +-- adjacent-research-worker.ts      TODO  Phase 5 SS5.4 -- AdjacentResearchWorker + types
|       +-- cross-validation-engine.ts       TODO  Phase 5 SS5.5 -- CrossValidationEngine
|       +-- adjacent-research-orchestrator.ts TODO Phase 5 SS5.6 -- AdjacentResearchOrchestrator
+-- adjacent.sh                              TODO  Phase 5 SS5.8 -- CLI script
```

### Files That Must Be MODIFIED

```
worker/
+-- src/
    +-- index.ts   MODIFY: Add POST /research/adjacent, GET /research/adjacent/:projectId
                           Add AdjacentResearchOrchestrator import
                           Add Phase 5 to server startup console log
```

### Files That Must Be READ Before Writing (Do Not Modify)

```
worker/
+-- src/
    +-- services/
    |   +-- adjacent-research.ts           READ/IMPORT ALL existing exports:
    |   |                                       parseAzimuth, reverseAzimuth, angularDiff,
    |   |                                       rateBearingDiff, rateDistanceDiff,
    |   |                                       extractAdjacentCandidates (reference only),
    |   |                                       crossValidateSharedBoundary (reference only),
    |   |                                       runAdjacentPropertyResearch (reference only)
    |   +-- property-discovery.ts          REFERENCE: PropertyDiscoveryEngine
    |   +-- document-harvester.ts          REFERENCE: DocumentHarvester
    |   +-- ai-extraction.ts               REFERENCE: extractDocuments
    |   +-- document-intelligence.ts       REFERENCE: scoring/filtering patterns
    +-- adapters/
    |   +-- clerk-adapter.ts               USE: ClerkAdapter interface, ClerkDocumentResult, DocumentImage
    |   +-- kofile-clerk-adapter.ts        USE: KofileClerkAdapter (primary clerk adapter)
    |   +-- texasfile-adapter.ts           USE: TexasFileAdapter (universal fallback)
    +-- lib/
    |   +-- county-fips.ts                 USE: countyToFIPS(), resolveCounty()
    |   +-- logger.ts                      USE: PipelineLogger (replace console.log in Phase 5 code)
    +-- types/
    |   +-- index.ts                       USE: ExtractedBoundaryData, BoundaryCall
    |   +-- property-discovery.ts          USE: PropertyIdentity, DiscoveryResult
    +-- models/
        +-- property-intelligence.ts       USE: PropertyIntelligence, AdjacentProperty,
                                                P3BoundaryCall, LotData (Phase 3 model)
```

### Files That Are LEGACY (Do Not Delete, Do Not Modify for Phase 5)

```
worker/
+-- src/
    +-- services/
        +-- pipeline.ts            LEGACY: still used by POST /research/property-lookup
        +-- bell-clerk.ts          LEGACY: still imported by pipeline.ts
        +-- reanalysis.ts          PHASE 9: do not touch
        +-- report-generator.ts    PHASE 10: do not touch
        +-- txdot-row.ts           PHASE 6: do not touch
        +-- geo-reconcile.ts       PHASE 3/7: do not touch
```

---

## 10. Acceptance Criteria

### Functional Requirements

- [x] Builds correct research queue from all three Phase 3/4 data sources: `intelligence.adjacentProperties[]`, `deedChain[].calledFrom[]`, and `subdivisionModel.lotRelationships.adjacencyMatrix`
- [x] Generates multiple name variants per adjacent owner (last-name only, "LAST, FIRST", suffix removal, initials)
- [x] Road entries (`FM 436`, `SH 36`, `COUNTY ROAD 101`) excluded from queue — handled by Phase 6
- [ ] Finds adjacent deeds for at least 60% of known adjacent owners in Bell County (**requires live testing — cannot unit-test without live county clerk access**)
- [x] `aiSelectCorrectDeed` correctly picks the right deed from multiple candidates using acreage + direction + owner context (implementation complete; live test needed for real confidence)
- [x] Extracts complete metes and bounds from adjacent deeds via Claude Vision AI (implementation complete; requires `ANTHROPIC_API_KEY`)
- [x] Correctly identifies shared boundary calls (`isSharedBoundary: true`) — AI prompted to set flag
- [x] Traces chain of title back 1–2 generations per adjacent owner
- [x] `POST /research/adjacent` returns HTTP 202 within 1 second
- [x] `GET /research/adjacent/:projectId` returns `{ status: "in_progress" }` during processing and full `FullCrossValidationReport` when complete
- [x] `cross_validation_report.json` saved to `/tmp/analysis/{projectId}/cross_validation_report.json`
- [x] `adjacent.sh` CLI script works from droplet console for the `ash-trust-001` sample
- [x] If `property_intelligence.json` not found, `POST /research/adjacent` returns HTTP 400 with helpful error

### Queue Builder (AdjacentQueueBuilder)

- [x] Longer shared boundaries (by estimated feet) assigned higher priority (lower number)
- [x] Tasks with `instrumentHints.length > 0` receive priority boost
- [x] At most one entry per normalized owner name after de-duplication
- [x] `alternateNames` array has original, last-name-only, "LAST, FIRST", suffix-stripped, and initials variants

### Research Worker (AdjacentResearchWorker)

- [x] Strategy 1 (instrument# direct lookup) tried before name search
- [x] Strategy 2 (grantee name) tries all `alternateNames` variants
- [x] Strategy 3 (grantor name) used as final fallback
- [x] When no deed found after all strategies: `researchStatus = 'not_found'`
- [x] When deed found but no images: `researchStatus = 'partial'`
- [x] When images downloaded but AI returns no calls: `researchStatus = 'partial'`
- [x] Any thrown exception: `researchStatus = 'failed'` (pipeline continues with next neighbor)
- [x] Rate limiting: minimum 3 seconds between clerk page navigations (configurable via `CLERK_RATE_LIMIT_MS`)
- [x] AI model name from `process.env.RESEARCH_AI_MODEL` -- never hardcoded
- [x] Chain of title: 1–2 predecessor deeds per adjacent owner added to `chainOfTitle[]`

### Cross-Validation Engine (CrossValidationEngine)

- [x] Imports `parseAzimuth`, `reverseAzimuth`, `angularDiff` from `adjacent-research.ts` -- NOT reimplemented
- [x] Imports `rateBearingDiff`, `rateDistanceDiff` from `adjacent-research.ts` -- NOT reimplemented
- [x] Bearing difference <= 30 arc-seconds: status `'confirmed'`
- [x] Bearing difference <= 5 arc-minutes: status `'close_match'`
- [x] Bearing difference <= 30 arc-minutes: status `'marginal'`
- [x] Bearing difference > 30 arc-minutes: status `'discrepancy'`
- [x] Distance difference <= 0.5 ft: status `'confirmed'`
- [x] Distance difference <= 2.0 ft: status `'close_match'`
- [x] Distance difference <= 5.0 ft: status `'marginal'`
- [x] Distance difference > 5.0 ft: status `'discrepancy'`
- [x] Overall status = worst (max) of bearing and distance ratings
- [x] `bearingDifference` field formatted as DMS (e.g. `"0°00'03\""`)
- [x] When no matching neighbor call found: status `'unverified'`, symbol `'?'`
- [x] `sharedBoundaryConfidence` = weighted average: confirmed*100 + close*75 + marginal*40 + unverified*25

### Orchestrator (AdjacentResearchOrchestrator)

- [x] Calls `crossValidator.validate()` only when `extractedBoundary.totalCalls > 0`
- [x] Cross-validation uses our `along`-matched calls as `ourCalls` and neighbor `isSharedBoundary=true` calls as `theirCalls`
- [x] Result saved to `/tmp/analysis/{projectId}/cross_validation_report.json`
- [x] `crossValidationSummary.overallBoundaryConfidence` computed correctly across all neighbors
- [x] All neighbors fail: `status: 'failed'`; some fail: `status: 'partial'`; all succeed: `status: 'complete'`
- [ ] Phase 7 Reconciliation can consume `cross_validation_report.json` as the `adjacent_deed` source for call weighting (**Phase 7 threading not yet done — see Phase 7 roadmap**)

### Implementation Rules

- [x] All AI calls: `process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929'` -- no hardcoded model names
- [x] All Phase 5 service code: use `PipelineLogger` from `lib/logger.ts` -- no bare `console.log` (v1.3)
- [x] `projectId` included in every log line (via `PipelineLogger` constructor)
- [x] `ANTHROPIC_API_KEY` from `process.env` -- never hardcoded
- [x] TypeScript strict mode: zero errors in all Phase 5 files
- [x] Single-neighbor failure does NOT halt the phase -- partial results reported
- [x] Rate limiting: minimum 3 seconds between county clerk page navigations

---

*Previous: `PHASE_04_SUBDIVISION.md` — Subdivision & Plat Intelligence*  
*Next: `PHASE_06_TXDOT.md` — TxDOT ROW Integration*
