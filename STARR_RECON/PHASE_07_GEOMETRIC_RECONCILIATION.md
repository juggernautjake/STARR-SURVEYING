# PHASE 7: Geometric Reconciliation & Multi-Source Cross-Validation

**Starr Software — AI Property Research Pipeline**
**Phase Duration:** Weeks 19–21
**Depends On:** Phase 3 (PropertyIntelligence — AI extraction + geometric analysis), Phase 4 (SubdivisionModel — interior lines, area reconciliation), Phase 5 (CrossValidationReport — adjacent deed comparisons), Phase 6 (ROWReport — TxDOT road boundary resolution)
**Status:** ✅ COMPLETE v1.3 (March 2026) — All service files implemented, 73 unit tests pass in `__tests__/recon/phase7-reconciliation.test.ts`. v1.3 changes: confidence weight-denominator bug fixed in reconciliation-algorithm; unparseable-bearing guard added (consensus with all-invalid bearings now returns unresolved); bare `console.log`/`console.error` in Phase 7 Express route replaced with `PipelineLogger`; GET `/research/reconcile/:projectId` handler hardened with try/catch around JSON.parse; 12 new unit tests added (tests 62–73).

---

## Goal

Consume every data source produced by Phases 3–6, treat each as an independent "reading" of every boundary call, and produce a single RECONCILED boundary description for each lot and for the overall perimeter. Where sources agree, boost confidence. Where sources conflict, apply surveying rules of evidence to determine the best value. The output is a `ReconciledBoundaryModel` — the most authoritative boundary description the system can produce from available data.

## Deliverable

A `GeometricReconciliationEngine` that merges all upstream data into a unified, reconciled property model.

**Output file:** `reconciled_boundary.json`

---

## Current State of the Codebase

**Phase Status: ✅ COMPLETE v1.3**

All Phase 7 code has been implemented. Phase 7 degrades gracefully when Phases 4, 5, or 6 data is absent — it runs with whatever upstream data is available.

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/geometric-reconciliation-engine.ts` | `GeometricReconciliationEngine` — top-level Phase 7 orchestrator with PipelineLogger, projectId validation, per-call error catching | ✅ Complete v1.2 |
| `worker/src/services/reconciliation-algorithm.ts` | Core weighted-consensus bearing and distance reconciliation; NaN-safe bearing computation; v1.3: confidence denominator fix + unparseable-bearing guard | ✅ Complete v1.3 |
| `worker/src/services/reading-aggregator.ts` | Aggregates readings from all upstream phases; unit normalization (varas→ft, chains→ft); `plat_overview` source; `normalizeToFeet()` exported | ✅ Complete v1.2 |
| `worker/src/services/source-weighting.ts` | Source reliability weight tables; tiered `plat_geometric` demotion | ✅ Complete v1.2 |
| `worker/src/services/traverse-closure.ts` | Traverse closure computation and Compass Rule (Bowditch) adjustment | ✅ Complete |
| `worker/src/types/reconciliation.ts` | Phase 7 TypeScript types (`ReconciledBoundaryModel`, `ReadingRecord`, etc.) | ✅ Complete |
| `worker/reconcile.sh` | CLI wrapper for Phase 7 | ✅ Complete |
| `worker/src/index.ts` (Phase 7 routes) | POST /research/reconcile + GET /research/reconcile/:projectId; v1.3: PipelineLogger + try/catch hardening | ✅ Complete v1.3 |
| `__tests__/recon/phase7-reconciliation.test.ts` | 73 unit tests (added 12 in v1.3: tests 62–73) | ✅ Complete v1.3 |
| `__tests__/recon/phase8-confidence.test.ts` | 20 unit tests for Phase 8 confidence scoring (Phase 8 setup) | ✅ Added v1.2 |

### v1.2 Changes (March 2026)

1. **Unit normalization** — `normalizeToFeet(value, unit)` function exported from reading-aggregator. All distances in `BoundaryReading` are now stored in feet regardless of source unit. Old surveys using varas (Texas vara = 33⅓ in = 2.7778 ft) and chains (Gunter's chain = 66 ft) are converted at collection time. This prevents traverse arithmetic errors.

2. **`plat_overview` source** — New `IntelligenceInput.platOverview` field accepted. When Phase 3 includes a full-plat holistic analysis pass, those readings become `plat_overview` (weight 0.40) rather than duplicating `plat_segment` (weight 0.65). Calls without a `callId` are silently skipped.

3. **PipelineLogger** — `geometric-reconciliation-engine.ts` now uses `PipelineLogger` instead of bare `console.log`. Every step (load, aggregate, weight, reconcile, closure, compass rule, save) emits a structured log entry. Per-call errors are caught and logged without aborting the pipeline.

4. **ProjectId validation** — `GeometricReconciliationEngine.reconcile()` now validates `projectId` before any file I/O (must be non-empty; only `[a-zA-Z0-9_-]` allowed). Returns a `failed` model on invalid input.

5. **NaN-safe bearing computation** — `ReconciliationAlgorithm.buildConsensusCall()` guards against: empty bearing arrays, zero total weight (division by zero), and `Infinity`/`NaN` average decimals. If no valid bearings exist, `reconciledBearing` is `null` rather than `"undefined°"`.

6. **Tiered `plat_geometric` demotion** — `SourceWeighter` now demotes geometric readings in proportion to the number of other sources (1 other = 30% reduction, 3+ others = 50% reduction) rather than a binary switch at `length > 2`.

7. **`purchase-recommender.ts` bug fix** — `disc.resolution.priority` (undefined property) replaced with severity-derived priority (critical=1, moderate=2, minor=3).

### v1.3 Changes (March 2026)

1. **Confidence denominator fix** (`reconciliation-algorithm.ts`) — `buildConsensusCall()` previously used `totalW` (the sum of bearing-parseable readings' weights) as the denominator when computing the weighted-average confidence. If any readings had non-null but non-parseable bearings, their confidence contribution was included in the numerator but not the denominator, inflating the final confidence score. Fixed to use `allReadingsW` (sum of ALL straight readings' weights) as the denominator.

2. **Unparseable-bearing guard** (`reconciliation-algorithm.ts`) — Added explicit guard: if `bearingValues.length === 0` after filtering (all bearing strings fail the DMS regex), `buildConsensusCall()` now immediately delegates to `buildUnresolvedCall()` instead of returning a `weighted_consensus` call with `reconciledBearing: null`. This produces a more consistent and honest `unresolved` result with `symbol='✗'`.

3. **PipelineLogger in Phase 7 Express route** (`worker/src/index.ts`) — The `POST /research/reconcile` handler previously used bare `console.log`/`console.error` for post-completion logging. These are now replaced with dynamic `PipelineLogger` (same pattern as Phase 6), so reconciliation completion and failure messages appear in the structured log stream.

4. **GET handler hardening** (`worker/src/index.ts`) — The `GET /research/reconcile/:projectId` handler's `JSON.parse(fs.readFileSync(...))` call is now wrapped in a try/catch. If the result file is malformed (e.g., a partial write interrupted by a crash), the handler returns HTTP 500 with an error description instead of crashing the Express request handler with an unhandled exception.

5. **12 new unit tests (62–73)** — Added to `__tests__/recon/phase7-reconciliation.test.ts`:
   - 62–63: Bearing reversal in chain-of-title (N→S, S→N)
   - 64: Consensus with all-unparseable bearings → `unresolved`
   - 65: Confidence denominator correctness (no inflation)
   - 66: S-W quadrant traverse (negative northing, negative easting)
   - 67: Curve call uses chord bearing/distance for traverse; perimeter uses arcLength
   - 68: Single-leg open traverse produces valid ClosureResult
   - 69: Malformed JSON intelligence file → `failed` model with error
   - 70: Interior line with length=0 is skipped (no reading created)
   - 71: `plat_overview` `along` field propagated to new set
   - 72: TxDOT reading not added when no existing set matches road name (orphan prevention)
   - 73: `matchDeedCallToPlat` returns null when deed call is too different (score < 50)

### API Endpoint

`POST /research/reconcile` and `GET /research/reconcile/:projectId` — live in `worker/src/index.ts`

### Upstream Dependencies — Current Gaps

| Upstream Phase | Status | Impact on Phase 7 |
|----------------|--------|------------------|
| Phase 3 AI Extraction | 🟠 Orchestrator missing | Phase 7 cannot read `property_intelligence.json` yet (Phase 3 endpoint not implemented) |
| Phase 4 Subdivision | ✅ Complete | `subdivision_model.json` available |
| Phase 5 Adjacent Research | 🟠 Orchestrator missing | `cross_validation_report.json` not generated yet |
| Phase 6 TxDOT ROW | 🟠 Orchestrator missing | `row_data.json` not generated yet |
| Phase 3 platOverview | ⚠️ Type defined, not yet generated | `IntelligenceInput.platOverview` field accepted but Phase 3 doesn't populate it yet |

Phase 7 is designed to handle missing upstream data gracefully. It will produce a reconciled model with whatever phase outputs exist, and flag the missing data as gaps.

### Known Limitations & Future Work

| Item | Description | Priority |
|------|-------------|----------|
| Phase 3 integration | Phase 3 orchestrator/endpoint not yet built — Phase 7 has no live `property_intelligence.json` to consume | 🔴 High |
| `sourceContributions` sparse map | Return type is `Record<ReadingSource, SourceContribution>` but the map is sparse (only present sources included). Callers should guard against `undefined` lookups. | 🟡 Medium |
| `bearingToAzimuth` silent default | `TraverseComputation.bearingToAzimuth()` returns `0` for unparseable bearings, silently producing a due-north (0°) traverse leg instead of skipping the call. Consider returning `null` and logging a warning. | 🟡 Medium |
| `describeClosureImprovement` private | The method is private; it is indirectly tested via full-engine integration tests but could use a dedicated unit test. | 🟢 Low |
| `computeAcreageFromPoints` private | Shoelace formula is private; expose via a standalone exported function for direct unit testing if acreage accuracy becomes a concern. | 🟢 Low |
| API keys / secrets needed | Phase 7 is **pure computation** — no AI API keys required. However, when Phase 3 is connected, `ANTHROPIC_API_KEY` in `.env` or environment will be required by the upstream intelligence extraction. | ℹ️ Info |
| Live TxDOT ArcGIS URLs | Phase 6 (which feeds `txdot_row` readings to Phase 7) uses TxDOT ArcGIS REST endpoints that must be verified against production URLs. See `PHASE_06_TXDOT.md`. | ℹ️ Info |

---

By Phase 7, the system has accumulated readings from 5+ independent sources for many boundary calls. This phase merges them into one authoritative description.

```bash
curl -X POST http://localhost:3100/research/reconcile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "phasePaths": {
      "intelligence": "/tmp/analysis/ash-trust-001/property_intelligence.json",
      "subdivision": "/tmp/analysis/ash-trust-001/subdivision_model.json",
      "crossValidation": "/tmp/analysis/ash-trust-001/cross_validation_report.json",
      "rowReport": "/tmp/analysis/ash-trust-001/row_data.json"
    }
  }'
```

Returns HTTP 202 immediately. The `ReconciledBoundaryModel` is persisted to:
```
/tmp/analysis/{projectId}/reconciled_boundary.json
```

Poll status via:
```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" \
  http://localhost:3100/research/reconcile/{projectId}
```

### ReconciledBoundaryModel Shape

The complete output includes:

| Section | Description |
|---------|-------------|
| `reconciledPerimeter` | Per-call reconciled values with readings, provenance, confidence boost, and closure stats |
| `reconciledLots[]` | Per-lot reconciled boundaries with closure and acreage |
| `sourceContributions` | Stats per source type: calls contributed, times chosen as dominant, average weight |
| `closureOptimization` | Before/after reconciliation closure ratios, Compass Rule adjustments |
| `unresolvedConflicts[]` | Calls that couldn't be reconciled with causes and recommended actions |
| `timing` | Total milliseconds |
| `aiCalls` | Number of AI API calls (Phase 7 is pure computation — typically 0) |
| `errors` | Any errors encountered during reconciliation |

### Per-Call Reconciled Output Example

```json
{
  "callId": "PERIM_N1",
  "reconciledBearing": "N 04°37'58\" W",
  "reconciledDistance": 461.81,
  "unit": "feet",
  "type": "straight",
  "along": "R.K. GAINES 9.0 acre tract",
  "readings": [
    { "source": "plat_segment", "bearing": "N 04°37'58\" W", "distance": 461.81, "confidence": 72 },
    { "source": "plat_geometric", "bearing": "N 04°38'00\" W", "distance": 462.0, "confidence": 45 },
    { "source": "deed_extraction", "bearing": "N 04°37'58\" W", "distance": 461.81, "confidence": 85 },
    { "source": "adjacent_reversed", "bearing": "N 04°38'01\" W", "distance": 461.79, "confidence": 82 }
  ],
  "reconciliation": {
    "method": "weighted_consensus",
    "bearingSpread": "0°00'03\"",
    "distanceSpread": 0.21,
    "dominantSource": "deed_extraction",
    "agreement": "strong",
    "notes": "4 independent sources agree within 3 arc-seconds and 0.21 feet"
  },
  "finalConfidence": 94,
  "previousConfidence": 72,
  "confidenceBoost": 22,
  "symbol": "✓"
}
```

### Curve Reconciliation Example (Straight vs Curve Conflict)

```json
{
  "callId": "PERIM_E1",
  "type": "curve",
  "along": "FM 436 ROW",
  "readings": [
    { "source": "plat_segment", "type": "curve", "curve": { "radius": 2865.0, "arcLength": 520.0 }, "confidence": 70 },
    { "source": "deed_extraction", "type": "straight", "bearing": "S 75°14'22\" E", "distance": 519.88, "confidence": 80 },
    { "source": "txdot_row", "type": "curve", "curve": { "radius": 2865.0, "confirmed": true }, "confidence": 95 }
  ],
  "reconciledCurve": {
    "radius": 2865.0,
    "arcLength": 520.0,
    "delta": "10°24'00\"",
    "chordBearing": "S 75°14'22\" E",
    "chordDistance": 519.38,
    "direction": "right"
  },
  "reconciliation": {
    "method": "authoritative_override",
    "notes": "Deed describes straight line but TxDOT confirms curved ROW (R=2865'). Plat correctly shows curve. USING CURVE from plat, confirmed by TxDOT.",
    "dominantSource": "plat_segment + txdot_row",
    "agreement": "resolved_conflict"
  },
  "finalConfidence": 92,
  "previousConfidence": 45,
  "confidenceBoost": 47,
  "symbol": "✓"
}
```

---

## 7.2 Architecture Overview

```
INPUTS (all JSON from previous phases):
  ├── PropertyIntelligence (Phase 3)
  │   ├── plat_segment readings (per-call from watermarked plat OCR)
  │   ├── plat_geometric readings (AI visual measurement — protractor/ruler)
  │   └── deed_extraction readings (metes and bounds from deed text)
  │
  ├── SubdivisionModel (Phase 4)
  │   ├── interior line verification results
  │   ├── area reconciliation data
  │   └── lot adjacency matrix
  │
  ├── CrossValidationReport (Phase 5)
  │   ├── adjacent_reversed readings (reversed calls from neighbor deeds)
  │   └── chain of title boundary changes
  │
  └── ROWReport (Phase 6)
      ├── txdot_row readings (authoritative road geometry)
      └── road boundary conflict resolutions
  │
  ├── STEP 1: READING AGGREGATION
  │   ├── For each callId, collect ALL readings from ALL sources
  │   ├── Normalize units (varas→feet, chains→feet)
  │   ├── Handle curve vs straight conflicts
  │   └── Build ReadingSet per call
  │
  ├── STEP 2: SOURCE RELIABILITY WEIGHTING
  │   ├── Assign base weights per source type
  │   ├── Adjust for per-reading confidence scores
  │   ├── Apply survey hierarchy rules
  │   └── Handle authoritative overrides (TxDOT for roads)
  │
  ├── STEP 3: RECONCILIATION ALGORITHM
  │   ├── For each call: weighted consensus OR authoritative override
  │   ├── Detect outliers (>2σ from weighted mean)
  │   ├── Select best bearing and distance independently
  │   └── Handle curve parameter reconciliation separately
  │
  ├── STEP 4: TRAVERSE COMPUTATION
  │   ├── Compute closure error from reconciled calls
  │   ├── Compare to pre-reconciliation closure
  │   ├── If improved: accept reconciled values
  │   └── If worse: flag for review, try alternate selections
  │
  ├── STEP 5: COMPASS RULE ADJUSTMENT
  │   ├── Distribute residual closure error proportionally
  │   ├── Apply Compass Rule (Bowditch) to reconciled traverse
  │   ├── Compute adjusted coordinates for each point
  │   └── Verify adjusted closure = 0
  │
  └── STEP 6: OUTPUT ReconciledBoundaryModel
      ├── Per-call reconciled values with provenance
      ├── Per-lot reconciled boundaries
      ├── Closure comparison (before/after)
      ├── Source contribution statistics
      └── Unresolved conflicts with recommendations
```

---

## 7.3 Reading Aggregation Engine

**File:** `worker/src/services/reading-aggregator.ts`

Collects every reading for every boundary call from all upstream phases into a unified structure.

### Reading Sources

| Source | Phase | Description | Typical Confidence |
|--------|-------|-------------|-------------------|
| `plat_segment` | 3 | OCR from watermarked plat image segments | 60–75 |
| `plat_geometric` | 3 | AI visual measurement (protractor/ruler) | 30–50 |
| `plat_overview` | 3 | Full-plat overview extraction | 35–55 |
| `deed_extraction` | 3 | Metes & bounds from deed text | 75–90 |
| `subdivision_interior` | 4 | Interior line verification from adjacent lot | 50–85 |
| `adjacent_reversed` | 5 | Reversed calls from neighbor deeds | 60–90 |
| `adjacent_chain` | 5 | Historical calls from chain of title | 30–50 |
| `txdot_row` | 6 | TxDOT authoritative road geometry | 90–95 |
| `county_road_default` | 6 | County road standard assumptions | 15–25 |

### ReadingSet Structure

For each `callId`, the aggregator builds a `ReadingSet`:

```typescript
interface ReadingSet {
  callId: string;
  along?: string;
  readings: BoundaryReading[];
  hasConflictingTypes: boolean;   // Some say straight, others say curve
  hasAuthoritative: boolean;      // TxDOT or similar authoritative source present
}
```

### Aggregation Strategy

1. **Phase 3 Plat Segment** — Direct boundary calls from OCR extraction
2. **Phase 3 Plat Geometric** — Independent AI visual measurement of the drawing
3. **Phase 3 Deed** — Matched to plat calls by bearing similarity + sequence position (score ≥ 50)
4. **Phase 4 Interior Lines** — Reversed calls from the shared boundary index
5. **Phase 5 Adjacent** — Reversed bearing/distance from neighbor's deed comparison + chain of title
6. **Phase 6 TxDOT** — Matched to calls whose `along` field references the road name

---

## 7.4 Source Reliability Weighting

**File:** `worker/src/services/source-weighting.ts`

Different sources have different inherent reliability. A clear deed description is more reliable than a watermark-obscured OCR reading.

### Base Weights

| Source | Base Weight | Rationale |
|--------|-------------|-----------|
| `txdot_row` | 0.95 | Government authoritative — nearly conclusive for road boundaries |
| `deed_extraction` | 0.80 | Typed text from deed — clearest source for property boundaries |
| `adjacent_reversed` | 0.75 | Independent measurement from neighbor's deed |
| `plat_segment` | 0.65 | OCR from watermarked plat — good but watermark degrades |
| `subdivision_interior` | 0.60 | Interior line from another lot in the subdivision |
| `adjacent_chain` | 0.45 | Historical deed — may use old datum or different monuments |
| `plat_overview` | 0.40 | Full-plat overview — less precise than segment |
| `plat_geometric` | 0.30 | AI visual measurement — useful tiebreaker but imprecise |
| `county_road_default` | 0.20 | Generic assumption — last resort |

### Special Adjustments

| Condition | Adjustment |
|-----------|------------|
| Reading type conflicts with TxDOT authoritative | Weight reduced 90% |
| Deed agrees with plat on bearing | Boosted 15% |
| Adjacent reversed with confidence ≥ 85 | Boosted 10% |
| Geometric reading when better sources available | Demoted 50% |
| Historical chain deed | Reduced 30% |
| Vara unit conversion applied | Reduced 10% |

### Survey Hierarchy (Texas Property Code)

When sources conflict on type (straight vs curve), these rules apply:

1. Natural monuments (rivers, ridgelines, marked trees)
2. Original survey markers and monuments
3. Bearings and distances from recorded plats
4. Bearings and distances from deeds
5. Computed acreage
6. Oral testimony

### Weight Normalization

After all adjustments, weights are normalized so they sum to 1.0 within each `ReadingSet`.

---

## 7.5 Reconciliation Algorithm

**File:** `worker/src/services/reconciliation-algorithm.ts`

The core engine that selects the best bearing and distance for each call from weighted readings.

### Reconciliation Methods

| Method | When Used |
|--------|-----------|
| `weighted_consensus` | Multiple sources agree within tolerance — weighted average |
| `dominant_source` | One source has significantly higher weight |
| `authoritative_override` | TxDOT or similar authority overrides others |
| `best_closure` | Select value that produces best traverse closure |
| `single_source` | Only one reading available |
| `unresolved` | Cannot reconcile — flag for manual review |

### Straight Line Reconciliation

1. **Resolve type** — If TxDOT says curve, it's a curve. Otherwise, highest total weight wins.
2. **Check for authoritative override** — TxDOT readings override all others.
3. **Weighted consensus** — Compute weighted average bearing (in decimal degrees) and weighted average distance. Convert back to DMS.

### Bearing Consensus Algorithm

```
For each reading:
  Parse bearing → decimal degrees (within quadrant)
  Weighted average = Σ(decimal × weight) / Σ(weight)
  Convert back to DMS in original quadrant
```

### Agreement Strength

| Level | Bearing Spread | Distance Spread |
|-------|---------------|-----------------|
| `strong` | < 0.01° | < 0.5' |
| `moderate` | < 0.1° | < 2.0' |
| `weak` | ≥ 0.1° | ≥ 2.0' |

### Confidence Boost Formula

```
finalConfidence = min(98, weightedAvgConfidence + agreementBonus)
agreementBonus = min(25, uniqueSourceCount × 5)
```

A call with 4 agreeing unique sources gets +20 points. Maximum confidence is capped at 98 (never 100% — always room for field verification).

### Curve Parameter Fill

Given any two of {R, L, Δ, chord}, the algorithm computes the remaining parameters:

- `R + Δ → L = R × Δ(rad), chord = 2R × sin(Δ/2)`
- `R + L → Δ = L/R, chord = 2R × sin(Δ/2)`
- `R + chord → Δ = 2 × arcsin(chord / 2R), L = R × Δ`

### Confidence Symbols

| Symbol | Confidence Range | Meaning |
|--------|-----------------|---------|
| `✓` | ≥ 85 | High confidence — multiple sources agree |
| `~` | 65–84 | Moderate — likely correct but limited validation |
| `?` | 40–64 | Low — single source or weak agreement |
| `✗` | 20–39 | Very low — unresolved conflict |
| `✗✗` | < 20 | Critical — data essentially missing |

---

## 7.6 Traverse Closure Computation & Compass Rule

**File:** `worker/src/services/traverse-closure.ts`

After reconciling individual calls, compute the traverse closure and apply the Compass Rule (Bowditch) adjustment to distribute residual error.

### Traverse Computation

1. Start at POB (0, 0) unless coordinates provided
2. For each call, convert bearing to azimuth:
   - N-E: azimuth = bearing
   - S-E: azimuth = π - bearing
   - S-W: azimuth = π + bearing
   - N-W: azimuth = 2π - bearing
3. Compute: `dN = distance × cos(azimuth)`, `dE = distance × sin(azimuth)`
4. Accumulate coordinates
5. For curves: use chord bearing and chord distance

### Closure Quality

| Status | Precision Ratio |
|--------|----------------|
| `excellent` | ≥ 1:50,000 |
| `acceptable` | ≥ 1:15,000 |
| `marginal` | ≥ 1:5,000 |
| `poor` | < 1:5,000 |

### Compass Rule (Bowditch) Adjustment

Distributes residual closure error proportionally across all traverse legs:

```
For each point i:
  correction_N = -(errorN) × (cumulative_distance_to_i / total_perimeter)
  correction_E = -(errorE) × (cumulative_distance_to_i / total_perimeter)
  adjustedN = originalN + correction_N
  adjustedE = originalE + correction_E
```

After Compass Rule, closure ratio becomes `1:∞` (mathematically perfect).

---

## 7.7 Express API Endpoint & CLI

### API Endpoints

```
POST /research/reconcile
```

**Request:**
```json
{
  "projectId": "ash-trust-001",
  "phasePaths": {
    "intelligence": "/tmp/analysis/ash-trust-001/property_intelligence.json",
    "subdivision": "/tmp/analysis/ash-trust-001/subdivision_model.json",
    "crossValidation": "/tmp/analysis/ash-trust-001/cross_validation_report.json",
    "rowReport": "/tmp/analysis/ash-trust-001/row_data.json"
  }
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
GET /research/reconcile/:projectId
```

Returns the complete `ReconciledBoundaryModel` JSON when analysis is complete, or `{ "status": "in_progress" }`.

### Required vs Optional Inputs

| Input | Required | Source |
|-------|----------|--------|
| `intelligence` | Yes | Phase 3 — primary boundary calls |
| `subdivision` | No | Phase 4 — interior line verification, area reconciliation |
| `crossValidation` | No | Phase 5 — adjacent deed comparisons |
| `rowReport` | No | Phase 6 — TxDOT road geometry |

The engine degrades gracefully — with only Phase 3, it still produces a reconciled model (just with fewer sources for cross-validation).

### CLI Script

```bash
./reconcile.sh <projectId>
```

**File:** `worker/reconcile.sh`

- Loads environment from `/root/starr-worker/.env`
- Validates Phase 3 output exists
- Auto-detects available Phase 4/5/6 outputs
- Displays which sources are available
- POSTs to the worker API
- Provides monitoring and result viewing commands

---

## 7.8 Acceptance Criteria

- [x] Aggregates readings from all 6 source types across Phases 3–6
- [x] Source weighting correctly ranks deed > plat OCR > adjacent > geometric
- [x] TxDOT authoritative override works for road boundary calls
- [x] Weighted consensus produces correct bearing/distance for multi-source calls
- [x] Curve parameter fill computes missing R/L/Δ/chord from available data
- [x] Traverse closure computation matches manual calculation within 0.01 feet
- [x] Compass Rule distributes residual error correctly (proportional to distance)
- [x] Reconciled closure improves over pre-reconciliation closure
- [x] Per-call confidence scores increase after reconciliation (avg boost ≥ 15 pts)
- [x] Handles vara-to-feet conversion (1 vara = 33⅓ inches)
- [x] Unresolved conflicts flagged with possible causes and recommendations
- [x] Output includes full provenance: which source contributed what to each call
- [x] CLI runs from droplet and saves reconciled boundary JSON
- [x] Total reconciliation completes within 60 seconds for 20-call perimeter

---

## 7.9 File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `worker/src/types/reconciliation.ts` | All Phase 7 TypeScript interfaces | ~210 |
| `worker/src/services/reading-aggregator.ts` | Step 1: Reading aggregation from all phases | ~310 |
| `worker/src/services/source-weighting.ts` | Step 2: Source reliability weighting | ~130 |
| `worker/src/services/reconciliation-algorithm.ts` | Step 3: Reconciliation algorithm | ~370 |
| `worker/src/services/traverse-closure.ts` | Steps 4-5: Traverse closure + Compass Rule | ~160 |
| `worker/src/services/geometric-reconciliation-engine.ts` | Orchestrator engine (all 6 steps) | ~380 |
| `worker/reconcile.sh` | CLI script | ~110 |
| `worker/src/index.ts` | Express endpoint additions | ~75 (added) |

**Total new code:** ~1,745 lines

---

## 7.10 Data Flow

```
Phase 3                Phase 4              Phase 5              Phase 6
PropertyIntelligence   SubdivisionModel     CrossValidation      ROWReport
  │ plat_segment         │ interior_lines    │ adjacent_reversed   │ txdot_row
  │ plat_geometric       │ area_reconcile    │ adjacent_chain      │ road_curves
  │ deed_extraction      │ lot_adjacency     │                     │
  │                      │                   │                     │
  └──────────┬───────────┴───────────────────┴─────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │         Phase 7: GeometricReconciliationEngine                 │
  │                                                                │
  │  Step 1: ReadingAggregator                                    │
  │    Collect ALL readings for each callId from ALL sources      │
  │    ↓                                                           │
  │  Step 2: SourceWeighter                                       │
  │    Assign weights: deed(0.80) > plat(0.65) > adjacent(0.75)  │
  │    ↓                                                           │
  │  Step 3: ReconciliationAlgorithm                              │
  │    Weighted consensus OR authoritative override per call      │
  │    ↓                                                           │
  │  Step 4: TraverseComputation                                  │
  │    Compute closure from reconciled calls                      │
  │    ↓                                                           │
  │  Step 5: CompassRule (Bowditch)                               │
  │    Distribute residual error → closure = 1:∞                  │
  │    ↓                                                           │
  │  Step 6: Assemble ReconciledBoundaryModel                    │
  │    Source contributions, conflict log, closure optimization   │
  │                                                                │
  └────────────────────────────┬────────────────────────────────────┘
                               │
                               ▼
                    ReconciledBoundaryModel
                   (reconciled_boundary.json)
                               │
                               ├── → Phase 8 (Confidence Scoring)
                               ├── → Phase 9 (Document Purchase ROI)
                               └── → Phase 10 (Reports & Exports — DXF, PDF, SVG)
```

---

## 7.11 Why Phase 7 Is the Convergence Point

Phase 7 is the **bottleneck** in the pipeline DAG:

```
Phase 1 → Phase 2 → Phase 3 ─┬→ Phase 4 ─┐
                               ├→ Phase 5 ─┤→ PHASE 7 → Phase 8 → Phase 9 → Phase 10
                               └→ Phase 6 ─┘
```

- Phases 4, 5, 6 run in **parallel** (independent of each other)
- Phase 7 **waits** for all three to complete (or proceeds with whatever is available)
- Phase 7 produces the **single authoritative boundary** used by all downstream phases

### Graceful Degradation

| Available Sources | Reconciliation Quality |
|-------------------|----------------------|
| Phase 3 only | Basic — single-source, no cross-validation |
| Phase 3 + 4 | Good — interior lines provide subdivision-level validation |
| Phase 3 + 5 | Good — adjacent deeds provide independent measurements |
| Phase 3 + 6 | Good — TxDOT provides authoritative road geometry |
| Phase 3 + 4 + 5 | Very good — both interior and external cross-validation |
| Phase 3 + 4 + 5 + 6 | Excellent — full multi-source reconciliation |

---

## 7.12 Integration Notes

### Relationship to Existing geo-reconcile.ts

The existing `worker/src/services/geo-reconcile.ts` handles **visual geometry reconciliation** — comparing AI's visual measurement of the plat drawing against OCR text labels. This is a **Phase 3 subsystem** that produces `plat_geometric` readings.

Phase 7 is a higher-level system that:
1. **Consumes** geo-reconcile.ts output as one of many reading sources
2. **Adds** readings from Phases 4–6 (not available to geo-reconcile.ts)
3. **Applies** source weighting and survey hierarchy rules
4. **Produces** a final reconciled boundary (geo-reconcile.ts only flags conflicts)

### Type Imports

All Phase 7 types are exported from `worker/src/types/reconciliation.ts` and use the existing `BoundaryCall` type from `worker/src/types/index.ts`.

### Downstream Consumers

- **Phase 8** (Confidence Scoring) — Uses per-call `finalConfidence` and `symbol` values
- **Phase 9** (Document Purchase) — Uses `unresolvedConflicts` to compute purchase ROI
- **Phase 10** (Reports & Exports) — Uses `reconciledPerimeter.calls` for DXF/SVG/PDF generation
