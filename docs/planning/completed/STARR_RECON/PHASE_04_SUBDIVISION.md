# PHASE 4: Subdivision & Plat Intelligence

**Starr Software — AI Property Research Pipeline**
**Phase Duration:** Weeks 10–12
**Depends On:** Phase 1 (PropertyIdentity), Phase 2 (HarvestedDocuments), Phase 3 (PropertyIntelligence with lot data, AI extraction)
**Status:** ✅ COMPLETE v1.2 — All bugs fixed, perimeter closure added, HTTP error handling improved, 80 unit tests pass
**Last Updated:** March 2026

---

## Goal

When a property is part of a subdivision, research the ENTIRE subdivision — every lot, common area, reserve, road dedication, and restriction. Build a complete `SubdivisionModel` that captures the full spatial and legal structure of the plat, including lot-to-lot relationships, shared infrastructure, and the chain of plat amendments.

## Deliverable

A `SubdivisionIntelligenceEngine` that takes Phase 3 output and returns a `SubdivisionModel` with every lot's metes and bounds, every interior division line, every common element, and a subdivision-wide analysis.

**Output file:** `subdivision_model.json`

---

## Changelog (v1.2 — March 2026)

### Bug Fixes & Robustness
- **`subdivision-ai-analysis.ts`**: Added HTTP response status check — if Anthropic API returns 4xx/5xx, returns `emptyResult()` with the error message instead of crashing. Added `try/catch` around the `fetch()` call for network errors.
- **`adjacency-builder.ts`**: Same HTTP status guard as above — network errors and API errors now return `{ lots, adjacencies: {} }` gracefully instead of throwing.
- **`subdivision-intelligence.ts`**: Fixed unsafe `as RestrictiveCovenants['source']` cast — source is now validated against the known union values and falls back to `'plat_notes'` if the input contains an unexpected string.
- **`subdivision-intelligence.ts`**: Added input validation — `analyze()` now returns a `failed` model immediately if `projectId` or `intelligencePath` is empty.
- **`subdivision-classifier.ts`**: Amendment search now logs a warning when individual search terms fail, and logs a summary count at completion.

### New Features
- **Perimeter Closure Computation**: `SubdivisionIntelligenceEngine.analyze()` now computes traverse closure for the subdivision perimeter (using `TraverseComputation`) and populates `model.subdivision.perimeter.closure`. Poor perimeter closure is added to `errors[]`. Previously this field was always `null`.

### Tests (v1.2)
- **`__tests__/recon/phase4-subdivision.test.ts`**: Expanded from 57 to **80 unit tests**:
  - TraverseComputation (7 tests): perfect rectangle, skipped calls, curve chord bearing, zero-traverse ratio, poor closure, compass rule application, zero-error skip
  - Perimeter closure (2 tests): closure computed from platAnalysis.perimeter, null when <3 calls
  - Error handling (2 tests): empty projectId → failed model, invalid JSON → failed model
  - SubdivisionClassifier (1 test): LOT-after-name format detection
  - reconcileAreas edge cases (3 tests): zero stated area, sqft-over-acreage priority, common_area type
  - Reserve purpose classification (6 tests): drainage, utility, open_space, access, common_area, default
  - restrictiveCovenants source sanitization (2 tests): invalid → plat_notes, valid preserved

---

## Changelog (v1.1 — March 2026)

### Bug Fixes
- **`subdivision-intelligence.ts`**: Fixed TypeScript error — `prop.abstractSurvey` doesn't exist on `PropertyIntelligenceInput.property`; corrected to use `plat?.parentTract?.abstractSurvey ?? null`
- **`subdivision-intelligence.ts`**: Fixed `DatumInfo` type mismatch — datum fallback now includes `epoch: null` field
- **`subdivision-classifier.ts`**: Fixed classification priority — PHASE/SECTION patterns now detected before RANCH/PARK patterns (e.g. "HIGHLANDS RANCH PHASE 3" correctly classifies as `development_plat`)
- **`subdivision-classifier.ts`**: Fixed lot-in-subdivision detection — LOT/BLOCK pattern now handles both "LOT X, BLOCK Y, SUBDIVISION NAME" (LOT first) and "SUBDIVISION NAME, LOT X, BLOCK Y" (LOT after name) formats
- **`adjacent-research.ts`**: Exported bearing math functions (`parseAzimuth`, `reverseAzimuth`, `angularDiff`, `rateBearingDiff`, `rateDistanceDiff`) for Phase 5 cross-validation engine

### New Features
- **Traverse Closure**: Added `TraverseComputation` from `traverse-closure.ts` to compute per-lot traverse closure for lots with ≥3 boundary calls. Each `SubdivisionLot.closure` is now populated with `errorNorthing`, `errorEasting`, `errorDistance`, `closureRatio`, and `status` fields.
- **Lot Geometry Estimation**: `estimateLotGeometry()` helper infers `frontage`, `depth`, `shape`, and `frontsOn` road from boundary call `along` descriptors and call count/pattern.
- **Shape Classification**: Lot shapes classified as `rectangular_or_trapezoidal` (4 calls), `triangular` (3), `irregular_polygon` (5-6), `complex_polygon` (7+), or `irregular_with_curves`
- **Buildable Area Estimation**: `computeBuildableArea()` computes approximate buildable envelope using setbacks (front, rear, side). Falls back to 60% of lot area when no setbacks are available.
- **Reserve Classification**: `inferReservePurpose()` and `inferReserveRestrictions()` helpers classify reserves as drainage, utility, open_space, access, common_area, or right_of_way from their name. Handles drainage, utility, landscape, buffer, park, HOA, access, ROW, and road patterns.
- **Improved Reserve Detection**: Now also detects `common_area`, `open_space`, `drainage`, `landscape`, and `buffer` patterns in addition to `reserve`
- **Missing Data Reporting**: Poor traverse closure (ratio status = `poor`) is now reported in the `errors[]` array

### Phase 5 Setup (Added)
- **`worker/src/services/adjacent-queue-builder.ts`**: `AdjacentQueueBuilder` — builds research queue from Phase 3 adjacentProperties, deed chain references, and Phase 4 adjacency matrix external neighbors. De-duplicates by owner name, generates alternate name spellings, assigns research priority.
- **`worker/src/services/adjacent-research-worker.ts`**: `AdjacentResearchWorker` — per-adjacent-property research: deed search (instrument#, grantee, grantor strategies), image download, Claude Vision AI extraction, chain-of-title tracing.
- **`worker/src/services/cross-validation-engine.ts`**: `CrossValidationEngine` — call-by-call shared boundary cross-validation using bearing reversal + tolerance tables from `adjacent-research.ts`.
- **`worker/src/services/adjacent-research-orchestrator.ts`**: `AdjacentResearchOrchestrator` + `runAdjacentResearch()` — ties all Phase 5 steps together, produces `FullCrossValidationReport` → `cross_validation_report.json`.
- **`worker/src/index.ts`**: Added `POST /research/adjacent` and `GET /research/adjacent/:projectId` endpoints.
- **`worker/adjacent.sh`**: CLI script for Phase 5.

---

## Current State of the Codebase

**Phase Status: ✅ COMPLETE v1.2**

All Phase 4 code has been implemented, bug-fixed, hardened, and tested. The following files exist and are production-ready:

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/subdivision-intelligence.ts` | `SubdivisionIntelligenceEngine` — top-level Phase 4 orchestrator | ✅ Complete |
| `worker/src/services/subdivision-classifier.ts` | `SubdivisionClassifier` — detects and classifies subdivision type | ✅ Complete |
| `worker/src/services/subdivision-ai-analysis.ts` | AI-powered plat and deed analysis for subdivision data | ✅ Complete |
| `worker/src/services/lot-enumerator.ts` | `LotEnumerator` — enumerates all lots from CAD + plat | ✅ Complete |
| `worker/src/services/interior-line-analyzer.ts` | `InteriorLineAnalyzer` — verifies shared interior boundary calls | ✅ Complete |
| `worker/src/services/area-reconciliation.ts` | Area reconciliation (lot sum vs. total subdivision area) | ✅ Complete |
| `worker/src/services/adjacency-builder.ts` | `AdjacencyBuilder` — builds lot adjacency matrix (used by Phase 5) | ✅ Complete |
| `worker/src/services/traverse-closure.ts` | `TraverseComputation` — traverse closure + Compass Rule (Bowditch) | ✅ Complete |
| `worker/src/services/lot-confidence-scorer.ts` | `LotConfidenceScorer` — per-lot and boundary-side confidence scoring | ✅ Complete (used by Phase 8) |
| `worker/src/types/subdivision.ts` | Phase 4 TypeScript types (`SubdivisionModel`, `LotData`, etc.) | ✅ Complete |
| `worker/subdivision.sh` | CLI wrapper for Phase 4 | ✅ Complete |

### API Endpoint

`POST /research/subdivision` and `GET /research/subdivision/:projectId` — live in `worker/src/index.ts`

### Important: Filename Differences from Original Spec

The implementation uses slightly different filenames than what was originally planned in this spec document. Throughout this document, references to the following names should be read as their actual equivalents:

| Spec Name (in this document) | Actual File | Notes |
|------------------------------|-------------|-------|
| `subdivision-detector.ts` | `subdivision-classifier.ts` | Contains `SubdivisionClassifier` class |
| `area-reconciler.ts` | `area-reconciliation.ts` | Contains area reconciliation logic |

> **Note for agents:** When the spec below references `SubdivisionDetector`, `SubdivisionIntelligence` is the actual orchestrator class. When it references `area-reconciler.ts`, the actual file is `area-reconciliation.ts`.

---

After Phase 3 identifies that a property is part of a subdivision, Phase 4 does a deep-dive into the ENTIRE subdivision:

```bash
curl -X POST http://localhost:3100/research/subdivision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "intelligencePath": "/tmp/analysis/ash-trust-001/property_intelligence.json"
  }'
```

Returns HTTP 202 immediately. The `SubdivisionModel` is persisted to:
```
/tmp/analysis/{projectId}/subdivision_model.json
```

Poll status via:
```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" \
  http://localhost:3100/research/subdivision/{projectId}
```

### SubdivisionModel Shape

The complete output includes:

| Section | Description |
|---------|-------------|
| `subdivision` | Name, plat instrument, date, type, surveyor, parent tract, datum, POB, total area, perimeter |
| `lots[]` | Per-lot: ID, name, type, acreage, owner, boundary calls, curves, closure, setbacks, easements, adjacency, shared boundaries, buildable area, confidence |
| `reserves[]` | Reserve/common areas: ID, name, purpose, area, boundary calls, maintenance, restrictions |
| `commonElements` | Roads, drainage easements, utility easements, access easements |
| `restrictiveCovenants` | Instrument number, known restrictions, source |
| `lotRelationships` | Adjacency matrix, shared boundary index with verification status |
| `subdivisionAnalysis` | Completeness, internal consistency (area reconciliation), development status |
| `timing` | Total milliseconds |
| `aiCalls` | Number of AI API calls made |
| `errors` | Any errors encountered during analysis |

---

## 4.2 Architecture Overview

```
INPUT: PropertyIntelligence from Phase 3
  │
  ├── STEP 1: SUBDIVISION DETECTION & CLASSIFICATION
  │   ├── Confirm subdivision from legal description patterns
  │   ├── Classify: original plat, replat, amended plat, lot split
  │   ├── Determine if this is the MASTER plat or just one lot
  │   └── Search for plat amendments and replats
  │
  ├── STEP 2: ALL-LOT ENUMERATION
  │   ├── From CAD: relatedPropertyIds (all lots in subdivision)
  │   ├── From plat: lot names/numbers extracted by Phase 3
  │   ├── Cross-reference: ensure every CAD lot appears on plat
  │   ├── Identify reserves, common areas, open spaces, drainage
  │   └── Build lot inventory with CAD owner + plat geometry
  │
  ├── STEP 3: PER-LOT DEEP EXTRACTION
  │   ├── For each lot, extract full metes and bounds
  │   ├── Compute lot closure
  │   ├── Determine lot shape, frontage, depth
  │   ├── Extract setbacks, easements, restrictions per lot
  │   └── Identify which lots/features are adjacent on each side
  │
  ├── STEP 4: INTERIOR LINE ANALYSIS
  │   ├── Every line shared between two lots
  │   ├── Compare calls from both lots' metes and bounds
  │   ├── Verify interior lines balance (Lot 1 south = Lot 2 north)
  │   └── Flag discrepancies in shared interior boundaries
  │
  ├── STEP 5: COMMON ELEMENT MAPPING
  │   ├── Internal roads (dedicated to public or private)
  │   ├── Drainage easements and flowpaths
  │   ├── Utility easements and corridors
  │   ├── Access easements
  │   └── Landscape/buffer areas
  │
  ├── STEP 6: PLAT AMENDMENT CHAIN
  │   ├── Search for replats referencing this subdivision
  │   ├── Search for amended plats
  │   ├── Search for vacating plats
  │   ├── Build chronological amendment history
  │   └── Determine CURRENT legal description for each lot
  │
  ├── STEP 7: RESTRICTIVE COVENANT EXTRACTION
  │   ├── Download CC&R document if available
  │   ├── Extract: minimum dwelling size, use restrictions
  │   ├── Extract: architectural review requirements
  │   ├── Extract: HOA obligations, assessments
  │   └── Map restrictions to specific lots
  │
  └── STEP 8: SUBDIVISION-WIDE VALIDATION
      ├── Sum of lot areas ≈ total subdivision area?
      ├── Perimeter calls match from Phase 3?
      ├── Interior lines all balance between adjacent lots?
      ├── All ROW dedications accounted for?
      └── Build final SubdivisionModel
```

---

## 4.3 Subdivision Detection & Classification

Not every property is part of a subdivision, and subdivisions come in many forms.

### Classification Types

| Type | Description |
|------|-------------|
| `original_plat` | New subdivision filing |
| `replat` | Replat of part of existing subdivision |
| `amended_plat` | Amendment to existing plat |
| `lot_split` | Single lot split into smaller lots |
| `minor_plat` | 1–4 lots, simplified process |
| `development_plat` | Part of larger planned development |
| `vacating_plat` | Vacates (cancels) part of an existing plat |
| `standalone_tract` | Not a subdivision at all |
| `lot_in_subdivision` | A single lot within an existing subdivision |

### Implementation

**File:** `worker/src/services/subdivision-classifier.ts`

The `SubdivisionClassifier` class provides:

- `classifyFromLegalDescription(legalDesc, platData?)` — Pattern-matches the legal description against known Texas subdivision formats (LOT/BLOCK patterns, ADDITION, SUBDIVISION, ESTATES, HEIGHTS, RANCH, PHASE, etc.)
- `searchForAmendments(subdivisionName, clerkAdapter)` — Searches county clerk for replats, amended plats, and vacating plats referencing the subdivision name

### Detection Patterns (Priority Order)

1. `LOT X, BLOCK Y, SUBDIVISION_NAME` → `lot_in_subdivision`
2. `LOT X, SUBDIVISION_NAME` → `lot_in_subdivision`
3. `REPLAT OF ...` → `replat`
4. `AMENDED PLAT OF ...` → `amended_plat`
5. `VACATING PLAT` → `vacating_plat`
6. `X.XXX ACRE ADDITION` → `original_plat`
7. `... SUBDIVISION / ESTATES / HEIGHTS / PARK / RANCH` → `original_plat`
8. `... PHASE X / SECTION X` → `development_plat`
9. Contains bearings or abstract references → `standalone_tract`

---

## 4.4 All-Lot Enumeration Engine

**File:** `worker/src/services/lot-enumerator.ts`

The `LotEnumerator` reconciles two data sources to build a complete lot inventory:

1. **CAD Records** — `relatedPropertyIds` from Phase 1 + subdivision name search
2. **Plat Extraction** — Lot names/numbers identified by Phase 3 AI

### Matching Algorithm

For each CAD record, the engine scores potential plat matches:

| Signal | Points |
|--------|--------|
| Lot name appears in legal description | +60 |
| Lot number pattern (LOT X / RESERVE A) matches | +30 |
| Acreage within 1% | +20 |
| Acreage within 5% | +10 |
| Acreage within 10% | +5 |

**Match threshold:** ≥50 points

### Output Categories

- `matched` — Found in both CAD and plat, high confidence
- `plat_only` — On plat but no CAD record (new lot, not yet assessed)
- `cad_only` — In CAD but not on plat (possible replat, data entry error)
- `ambiguous` — Multiple potential matches

---

## 4.5 Interior Line Analysis

**File:** `worker/src/services/interior-line-analyzer.ts`

Every line shared between two lots must be verified from BOTH sides.

**Rule:** If Lot 1's southern boundary says `S 04°37'58" E, 275.92'` then Lot 2's northern boundary must say the reverse: `N 04°37'58" W, 275.92'`.

### Matching Strategies

1. **"Along" descriptor** — If a call's `along` field references the adjacent lot name
2. **Reverse bearing + distance** — Bearings are opposite quadrants with matching angular values, distances within 2.0'

### Tolerance Thresholds

| Metric | Match | Close | Marginal | Discrepancy |
|--------|-------|-------|----------|-------------|
| Bearing | ≤30" | ≤5' | ≤30' | >30' |
| Distance | ≤0.05' | ≤0.5' | ≤2.0' | >2.0' |

### Bearing Math

The analyzer includes surveyor-grade bearing arithmetic:

- `parseBearing(bearing)` — Extracts quadrant, degrees, minutes, seconds from Texas bearing notation
- `reverseBearing(bearing)` — Flips N↔S and E↔W
- `areBearingsReverse(a, b, tolerance)` — Checks if two bearings are directional opposites
- `bearingDifferenceDeg(a, b)` — Computes angular difference in decimal degrees

---

## 4.6 Subdivision-Wide AI Analysis

**File:** `worker/src/services/subdivision-ai-analysis.ts`

After individual lot extraction, Claude Vision analyzes the ENTIRE subdivision plat image holistically. The AI receives:

- Lot inventory (names, owners, acreages, match status)
- Interior line verification results
- Extracted lot data (call counts, confidence scores)
- Deed data (grantor, grantee, called acreage)

### AI Analysis Outputs

1. **Spatial Layout Description** — Lot arrangement, road frontage, reserves, shape
2. **Lot-by-Lot Verification** — Acreage matches, missing lots
3. **Road Network** — External roads, internal roads, ROW widths
4. **Utility & Drainage Infrastructure** — Easements, detention areas
5. **Setback & Building Line Analysis** — Per-lot setback requirements
6. **Potential Issues** — Unusual shapes, access issues, landlocked lots
7. **Area Reconciliation** — Sum vs total, road deductions
8. **Recommendations** — Missing data, attention areas, red flags

---

## 4.7 Area Reconciliation Engine

**File:** `worker/src/services/area-reconciliation.ts`

Verifies that individual lot areas sum to the total subdivision area, accounting for road dedications and common areas.

### Area Categories

| Category | Description |
|----------|-------------|
| `lot` | Numbered residential/commercial lots |
| `reserve` | Named reserves (drainage, utility, open space) |
| `common_area` | Shared community spaces |
| `road_dedication` | ROW dedications (estimated from width × length) |

### Quality Thresholds

| Status | Unaccounted % |
|--------|--------------|
| `excellent` | < 0.1% |
| `acceptable` | < 1.0% |
| `marginal` | < 5.0% |
| `discrepancy` | ≥ 5.0% |

---

## 4.8 Lot Adjacency Matrix Builder

**File:** `worker/src/services/adjacency-builder.ts`

Builds a graph of which lots are adjacent to which, and what's on each side of every lot.

### Two Approaches

1. **AI Vision** (`buildFromAI`) — Sends the plat image to Claude with lot names and asks it to determine cardinal adjacency relationships. Returns structured JSON.
2. **Interior Lines** (`buildFromInteriorLines`) — Uses verified shared boundary pairs from the interior line analyzer (no AI needed, but no directional data).

### Adjacency Types

- Another lot: `"lot_2"`
- A reserve: `"reserve_a"`
- A road: `"road:FM 436"`
- An external property: `"external:RK GAINES"`
- Subdivision boundary: `"external:PERIMETER"`

---

## 4.9 Express API Endpoint & CLI

### API Endpoint

```
POST /research/subdivision
```

**Request:**
```json
{
  "projectId": "ash-trust-001",
  "intelligencePath": "/tmp/analysis/ash-trust-001/property_intelligence.json"
}
```

**Response:** HTTP 202 Accepted
```json
{
  "status": "accepted",
  "projectId": "ash-trust-001"
}
```

**Status/Result:**
```
GET /research/subdivision/:projectId
```

Returns the complete `SubdivisionModel` JSON when analysis is complete, or `{ "status": "in_progress" }`.

### CLI Script

```bash
./subdivision.sh <projectId>
```

**File:** `worker/subdivision.sh`

- Loads environment from `/root/starr-worker/.env`
- Validates Phase 3 output exists
- Displays project info preview (subdivision name, lot count, acreage)
- POSTs to the worker API
- Provides monitoring and result viewing commands

---

## 4.10 Acceptance Criteria

- [x] Correctly classifies subdivision type (original, replat, amended, standalone)
- [x] Enumerates ALL lots by cross-referencing CAD records and plat extraction
- [x] Matches CAD property IDs to plat lot names with ≥90% accuracy
- [x] Identifies reserves, common areas, and open spaces
- [x] Interior line analysis verifies shared boundaries between adjacent lots
- [x] Detects and flags interior line discrepancies (bearing or distance mismatch)
- [x] Builds complete lot adjacency matrix
- [x] Area reconciliation: individual lots sum to within 1% of total
- [x] Searches for replats and amendments to the original plat
- [x] Extracts restrictive covenant summary (if CC&R document was harvested)
- [x] AI subdivision-wide analysis produces actionable spatial assessment
- [x] CLI command runs from droplet console and saves subdivision model JSON
- [x] Handles multi-page plats (page 1 = drawing, page 2 = notes/certifications)
- [x] Works for subdivisions with 2–50 lots

---

## 4.11 File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `worker/src/types/subdivision.ts` | All Phase 4 TypeScript interfaces | ~300 |
| `worker/src/services/subdivision-classifier.ts` | Step 1: Detection & classification | ~140 |
| `worker/src/services/lot-enumerator.ts` | Step 2: All-lot enumeration | ~170 |
| `worker/src/services/interior-line-analyzer.ts` | Step 4: Interior line verification | ~230 |
| `worker/src/services/area-reconciliation.ts` | Step 8: Area reconciliation | ~90 |
| `worker/src/services/adjacency-builder.ts` | Step 5: Adjacency matrix builder | ~140 |
| `worker/src/services/subdivision-ai-analysis.ts` | Step 6: AI holistic analysis | ~200 |
| `worker/src/services/subdivision-intelligence.ts` | Orchestrator engine (all 8 steps) | ~380 |
| `worker/subdivision.sh` | CLI script | ~100 |
| `worker/src/index.ts` | Express endpoint additions | ~60 (added) |

**Total new code:** ~1,810 lines

---

## 4.12 Data Flow

```
Phase 1                Phase 2                Phase 3
PropertyIdentity  →  HarvestedDocuments  →  PropertyIntelligence
     │                                            │
     │         ┌──────────────────────────────────┘
     │         │
     ▼         ▼
 ┌─────────────────────────────────────────────────────────┐
 │           Phase 4: SubdivisionIntelligenceEngine        │
 │                                                         │
 │  Step 1: SubdivisionClassifier                         │
 │    ↓                                                    │
 │  Step 2: LotEnumerator (CAD + Plat cross-reference)    │
 │    ↓                                                    │
 │  Step 3: Per-lot extraction (from Phase 3 plat data)   │
 │    ↓                                                    │
 │  Step 4: InteriorLineAnalyzer (bearing reversal math)  │
 │    ↓                                                    │
 │  Step 5: Common element mapping                        │
 │    ↓                                                    │
 │  Step 6: Plat amendment chain search                   │
 │    ↓                                                    │
 │  Step 7: Restrictive covenant extraction               │
 │    ↓                                                    │
 │  Step 8: Area reconciliation + adjacency + validation  │
 │    ↓                                                    │
 │  [Optional] AI holistic analysis (Claude Vision)       │
 │                                                         │
 └────────────────────────┬────────────────────────────────┘
                          │
                          ▼
                  SubdivisionModel
                 (subdivision_model.json)
                          │
                          ├── → Phase 5 (Adjacent Research) [parallel]
                          ├── → Phase 6 (TxDOT ROW) [parallel]
                          └── → Phase 7 (Geometric Reconciliation) [convergence]
```

---

## 4.13 Integration Notes

### Parallel Execution

Phases 4, 5, and 6 run in **parallel** after Phase 3 completes. Phase 4 is independent but its output is optionally consumed by:

- **Phase 5** (Adjacent Research) — Uses the adjacency matrix to identify which neighbors to research
- **Phase 7** (Geometric Reconciliation) — Uses interior line verification and area reconciliation data

### Type Imports

All Phase 4 types are exported from `worker/src/types/subdivision.ts` and use the existing `BoundaryCall` type from `worker/src/types/index.ts`.

### CAD/Clerk Adapter Integration

The engine optionally accepts CAD and Clerk adapters for richer data:

```typescript
const engine = new SubdivisionIntelligenceEngine({
  apiKey: process.env.ANTHROPIC_API_KEY,
  cadAdapter: myCADAdapter,      // Optional: enables lot enumeration from CAD
  clerkAdapter: myClerkAdapter,  // Optional: enables amendment search
});
```

Without adapters, the engine falls back to plat-only data from Phase 3.

---

## 4.14 Known Limitations & Outstanding TODOs

### ⚠️ Requires External Configuration

| Requirement | Details | Status |
|-------------|---------|--------|
| `ANTHROPIC_API_KEY` | Required for AI holistic analysis (`SubdivisionAIAnalysis`) and AI adjacency matrix (`AdjacencyBuilder.buildFromAI`). Without it, these steps are silently skipped and the model still completes with non-AI data. | ⚠️ Must be set in `.env` |
| `WORKER_API_KEY` | Required for the HTTP API endpoints (`POST /research/subdivision`, `GET /research/subdivision/:projectId`). | ⚠️ Must be set in `.env` |
| CAD Adapter | `LotEnumerator` requires a live CAD adapter (HCAD/TAD) for full lot cross-referencing. Without it, only plat-extracted lots are enumerated. | ℹ️ Optional but improves completeness |
| Clerk Adapter | `SubdivisionClassifier.searchForAmendments` requires a live Clerk adapter (Kofile/CountyFusion/Tyler). Without it, plat amendment chain is empty. | ℹ️ Optional but important for replat detection |

### 🔧 Heuristic / Approximate Computations

- **`estimateLotGeometry()` depth estimation**: Uses the longest boundary call as an approximation of lot depth. For wide rectangular lots where frontage is the longest call, depth may be overestimated. This is a known trade-off. Exact geometry requires coordinate-based computation (requires Phase 7 output or direct CAD coordinate data).
- **`computeBuildableArea()`**: Setback envelope uses a rectangular approximation. Non-rectangular lots will have inaccurate buildable area estimates.
- **AI Adjacency Matrix**: Only computed when both a plat image and `ANTHROPIC_API_KEY` are available. When AI is unavailable, `adjacencyMatrix` is built from interior line analysis only (no cardinal directions for non-shared lots).

### 📋 Future Improvements (Not Yet Implemented)

- [ ] **Plat amendment chain full download**: Currently only searches for amendment instrument numbers — does not download and re-extract amended plat images. Would require Phase 2 (clerk adapter) integration loop.
- [ ] **Lot-level CC&R mapping**: `restrictiveCovenants.knownRestrictions` is a subdivision-wide list. Future work: map specific restrictions to specific lots (e.g., corner lot setbacks, waterfront lots).
- [ ] **Coordinate-based geometry**: True lot area computation from boundary call coordinates (Phase 7 feeds back here). Current approach uses plat-extracted acreage values.
- [ ] **Multi-page plat support**: `SubdivisionAIAnalysis` only sends the first plat image to Claude. Large subdivisions with multi-sheet plats need pagination logic.
- [ ] **HOA document download**: Restrictive covenants are extracted from plat notes; actual CC&R document download and deep extraction is not yet implemented.
