# PHASE 8: Confidence Scoring & Discrepancy Intelligence

**Starr Software — AI Property Research Pipeline**
**Phase Duration:** Weeks 22–23
**Depends On:** Phase 7 (ReconciledBoundaryModel with per-call readings, reconciliation metadata, closure results)
**Status:** ✅ COMPLETE v1.1 — Implementation delivered, all 40 unit tests pass

---

## Goal

Produce a formal, multi-layer confidence scoring system that gives every surveyor a clear picture of data quality — from individual call confidence to overall property confidence. Build an intelligent discrepancy analysis engine that classifies, prioritizes, and recommends resolution paths for every unresolved conflict. The output is a `ConfidenceReport` that a surveyor can use to decide: "Is this data good enough to go to the field, or do I need to purchase documents first?"

## Deliverable

A `ConfidenceScoringEngine` that consumes the reconciled model and produces a layered confidence assessment with actionable intelligence.

**Output file:** `confidence_report.json`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | Mar 2026 | Initial implementation (20 tests) |
| v1.1 | Mar 2026 | PipelineLogger; SurveyorDecision new fields (overallRisk, pathTo90, estimatedFieldTime, summary); DiscrepancySummary.estimatedResolutionCost → numeric; datum_shift detection; AbortSignal.timeout on AI fetch; GET endpoint try/catch; projectId empty-string guard; 40 unit tests |

---

## Current State of the Codebase

**Phase Status: ✅ COMPLETE v1.1**

All Phase 8 code has been implemented and hardened.

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/confidence-scoring-engine.ts` | `ConfidenceScoringEngine` — top-level Phase 8 orchestrator | ✅ Complete |
| `worker/src/services/call-confidence-scorer.ts` | Per-call 4-factor confidence scoring | ✅ Complete |
| `worker/src/services/lot-confidence-scorer.ts` | Per-lot confidence aggregation with closure factor | ✅ Complete |
| `worker/src/services/discrepancy-analyzer.ts` | Discrepancy classification, root-cause analysis, resolution paths, datum_shift detection | ✅ Complete |
| `worker/src/services/purchase-recommender.ts` | Document purchase ROI calculator and ranked recommendations | ✅ Complete |
| `worker/src/services/surveyor-decision-matrix.ts` | Surveyor decision matrix (field-ready assessment) with overallRisk, pathTo90, estimatedFieldTime, summary | ✅ Complete |
| `worker/src/types/confidence.ts` | Phase 8 TypeScript types (`ConfidenceReport`, `CallConfidence`, etc.) | ✅ Complete |
| `worker/confidence.sh` | CLI wrapper for Phase 8 | ✅ Complete |

### API Endpoint

`POST /research/confidence` and `GET /research/confidence/:projectId` — live in `worker/src/index.ts`

---

Phase 7 reconciled all readings and assigned per-call confidence scores. Phase 8 takes those scores and builds a comprehensive, hierarchical confidence assessment — the surveyor's decision tool.

```bash
curl -X POST http://localhost:3100/research/confidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "reconciledPath": "/tmp/analysis/ash-trust-001/reconciled_boundary.json"
  }'
```

Returns HTTP 202 immediately. The `ConfidenceReport` is persisted to:
```
/tmp/analysis/{projectId}/confidence_report.json
```

Poll status via:
```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" \
  http://localhost:3100/research/confidence/{projectId}
```

### ConfidenceReport Shape

| Section | Description |
|---------|-------------|
| `overallConfidence` | Score (0-100), grade (A-F), label, human-readable summary |
| `callConfidence[]` | Per-call: 4-factor scoring, source list, agreement, risk level |
| `lotConfidence[]` | Per-lot: weighted call average, closure factor, weakest-call penalty |
| `boundaryConfidence[]` | Per-side (N/E/S/W): average score, call count, risk flags |
| `discrepancies[]` | Each discrepancy: severity, category, AI root-cause analysis, resolution path |
| `discrepancySummary` | Totals by severity, resolution cost estimate (numeric USD), confidence-after-resolution |
| `documentPurchaseRecommendations[]` | Ranked by ROI: document type, cost, confidence impact, calls improved |
| `surveyorDecisionMatrix` | Ready for field? overallRisk, caveats, field checks, pathTo90, estimatedFieldTime, summary |
| `timing` | Total milliseconds |
| `aiCalls` | Number of AI API calls (typically 1 for discrepancy analysis) |
| `errors` | Any errors encountered |

---

## 8.2 Architecture Overview

```
INPUT: ReconciledBoundaryModel from Phase 7
  │
  ├── STEP 1: PER-CALL CONFIDENCE SCORING
  │   ├── Source multiplicity (how many sources?)
  │   ├── Source agreement (how close are they?)
  │   ├── Source reliability (weighted average of source types)
  │   ├── Reading clarity (was OCR clean or watermark-degraded?)
  │   └── Compute composite score (0-100) and grade (A-F)
  │
  ├── STEP 2: PER-LOT CONFIDENCE SCORING
  │   ├── Average of lot's call scores (weighted by boundary length)
  │   ├── Closure quality factor
  │   ├── Interior line agreement factor
  │   ├── Acreage cross-check factor
  │   └── Weakest-call penalty
  │
  ├── STEP 3: PER-BOUNDARY-SIDE CONFIDENCE
  │   ├── Group calls by direction (N/S/E/W)
  │   ├── Average score per side
  │   ├── Identify weakest side
  │   └── Cross-validate with adjacent research status
  │
  ├── STEP 4: OVERALL PROPERTY CONFIDENCE
  │   ├── Weighted average of lot/perimeter scores
  │   ├── Closure factor
  │   ├── Discrepancy penalty
  │   ├── Source diversity bonus
  │   └── Final grade (A-F)
  │
  ├── STEP 5: DISCREPANCY ANALYSIS
  │   ├── bearing_mismatch: spread > 1 arc-minute
  │   ├── distance_mismatch: spread > 2 feet
  │   ├── type_conflict: mixed straight/curve readings
  │   ├── datum_shift: 3+ calls with 2-6 arc-minute consistent bearing offsets
  │   ├── AI root-cause analysis per discrepancy (AbortSignal.timeout(30s))
  │   ├── Impact assessment (closure, acreage, position)
  │   ├── Resolution pathway with cost and confidence impact
  │   └── Priority ranking
  │
  ├── STEP 6: DOCUMENT PURCHASE RECOMMENDATIONS
  │   ├── For each unresolved discrepancy: what document would resolve it?
  │   ├── Compute ROI (confidence gain per dollar)
  │   ├── Rank by ROI
  │   └── Generate purchase list
  │
  └── STEP 7: SURVEYOR DECISION MATRIX
      ├── Is data good enough for field work? (threshold: 60%)
      ├── overallRisk: low/medium/high/critical
      ├── caveats[] — weak sides, critical discrepancies, etc.
      ├── recommendedFieldChecks[] — specific corners/areas to verify
      ├── pathTo90 — actionable steps to reach 90%+ confidence (null if already there)
      ├── estimatedFieldTime — rough field time estimate
      └── summary — human-readable one-paragraph decision summary
```

---

## 8.3 Call-Level Confidence Scoring

**File:** `worker/src/services/call-confidence-scorer.ts`

Each boundary call is scored on a 0-100 scale using a 4-factor model. Each factor contributes 0-25 points.

### Factor 1: Source Multiplicity (0-25)

How many independent sources provided a reading for this call?

| Sources | Points |
|---------|--------|
| 1 source | 5 |
| 2 sources | 12 |
| 3 sources | 18 |
| 4 sources | 22 |
| 5+ sources | 25 |

### Factor 2: Source Agreement (0-25)

How closely do the sources agree on bearing and distance?

| Bearing Spread | Distance Spread | Points |
|---------------|-----------------|--------|
| < 0.01° | < 0.5' | 25 |
| < 0.05° | < 1.0' | 20 |
| < 0.1° | < 2.0' | 15 |
| < 0.5° | < 5.0' | 8 |
| ≥ 0.5° | ≥ 5.0' | 3 |

Only scored when 2+ sources are present.

### Factor 3: Source Reliability (0-25)

Based on the highest-reliability source present for this call:

| Source | Reliability Points |
|--------|-------------------|
| `txdot_row` | 25 |
| `deed_extraction` | 22 |
| `adjacent_reversed` | 19 |
| `plat_segment` | 16 |
| `subdivision_interior` | 14 |
| `adjacent_chain` | 10 |
| `plat_overview` | 8 |
| `plat_geometric` | 6 |
| `county_road_default` | 4 |

### Factor 4: Reading Clarity (0-25)

Based on the highest-confidence individual reading: `maxReadingConfidence / 4`.

### Grade Scale

| Score | Grade | Risk Level |
|-------|-------|------------|
| ≥ 93 | A | Low |
| 88-92 | A- | Low |
| 83-87 | B+ | Low |
| 78-82 | B | Medium |
| 73-77 | B- | Medium |
| 68-72 | C+ | Medium |
| 63-67 | C | Medium |
| 58-62 | C- | High |
| 53-57 | D+ | High |
| 48-52 | D | High |
| 43-47 | D- | Critical |
| < 43 | F | Critical |

---

## 8.4 Lot-Level and Boundary-Side Confidence

**File:** `worker/src/services/lot-confidence-scorer.ts`

### Lot Scoring

1. **Base score:** Weighted average of call scores (weighted by boundary segment length)
2. **Closure bonus:** Good traverse closure adds +2 to +8 points
3. **Acreage cross-check:** Computed area matches stated area → +2 to +5
4. **Weakest-call penalty:** If any call scores < 40 → -5 points

### Closure Bonus Table

| Closure Ratio | Bonus |
|--------------|-------|
| ≥ 1:50,000 or 1:∞ | +8 |
| ≥ 1:20,000 | +5 |
| ≥ 1:10,000 | +2 |
| ≥ 1:5,000 | 0 |
| < 1:5,000 | -5 |

### Acreage Confidence

| Stated vs Computed Difference | Confidence |
|------------------------------|------------|
| < 0.1% | 98 |
| < 0.5% | 90 |
| < 1.0% | 80 |
| < 2.0% | 65 |
| < 5.0% | 45 |
| ≥ 5.0% | 25 |

### Boundary-Side Scoring

Calls are grouped by cardinal direction (inferred from bearing quadrant):
- Bearings with dominant N component and < 45° → "north"
- Bearings with dominant S component and < 45° → "south"
- NE/SE with ≥ 45° → "east"
- NW/SW with ≥ 45° → "west"

Each side gets the average score of its calls, with a risk flag if score < 60.

---

## 8.5 Discrepancy Analysis Engine

**File:** `worker/src/services/discrepancy-analyzer.ts`

### Discrepancy Categories

| Category | Description | Detection |
|----------|-------------|-----------|
| `bearing_mismatch` | Two sources disagree on bearing | Spread > 1 arc-minute |
| `distance_mismatch` | Two sources disagree on distance | Spread > 2 feet |
| `type_conflict` | One says straight, another says curve | Mixed types in readings |
| `datum_shift` | NAD27 vs NAD83 systematic rotation | 3+ calls with 2–6 arc-minute spreads |
| `monument_conflict` | Different monuments referenced | From AI analysis |
| `area_discrepancy` | Computed area doesn't match stated | > 2% difference |
| `missing_call` | Extra/missing calls between sources | Call count mismatch |
| `road_geometry` | Straight vs curved road boundary | From Phase 6 ROW |
| `chain_of_title` | Description changed over time | From Phase 5 chain |

### Datum Shift Detection (v1.1)

The datum_shift category is detected automatically by scanning all reconciled calls:

1. For each call with 2+ readings, compute bearing spread in arc-minutes
2. Collect all calls with spread in the 2.0–6.0 arc-minute range (NAD27→NAD83 Texas range)
3. If 3+ calls qualify, emit a single `datum_shift` discrepancy with severity=critical
4. The datum_shift discrepancy is inserted at the top of the list (priority 1) to indicate root cause

This prevents the system from generating many individual `bearing_mismatch` items for what is actually a single datum issue.

### Severity Thresholds

**Bearing discrepancies:**

| Spread (arc-minutes) | Severity |
|---------------------|----------|
| > 5' | Critical |
| > 1' | Moderate |
| > 0' (flagged) | Minor |

**Distance discrepancies:**

| Spread (feet) | Severity |
|--------------|----------|
| > 10' | Critical |
| > 5' | Moderate |
| > 2' (flagged) | Minor |

### AI Root-Cause Analysis

For each unresolved discrepancy, Claude analyzes:

1. **Possible causes** — ranked by likelihood (high/medium/low)
   - NAD27 → NAD83 datum shift
   - Watermark digit obscuration
   - Road widening changes
   - Vara-to-feet conversion errors
   - Different magnetic declination epochs
   - Different survey monuments

2. **Likely correct value** — weighted estimate with reasoning

3. **Impact assessment:**
   - Closure impact (severe/moderate/minimal/none)
   - Acreage impact (in acres)
   - Boundary position shift (in feet)
   - Legal significance

4. **Resolution pathway:**
   - Recommended action
   - Alternative actions
   - Estimated cost
   - Expected confidence after resolution
   - Priority ranking

**Robustness (v1.1):** `AbortSignal.timeout(30_000)` prevents the AI fetch from hanging indefinitely. Failures are non-fatal — discrepancies retain their default empty analysis and the report still completes.

### Already-Resolved Discrepancies

Discrepancies resolved by upstream phases (e.g., Phase 6 TxDOT confirming curved vs straight road boundary) appear in the report with `status: "resolved"` and their resolution details.

---

## 8.6 Document Purchase ROI Calculator

**File:** `worker/src/services/purchase-recommender.ts`

Ranks potential document purchases by ROI: confidence points gained per dollar spent.

### Purchase Rules

**Rule 1: Unwatermarked Plat (Highest ROI)**
- Count calls with `plat_segment` source and score < 80
- Estimated cost: ~$1-2 per page (Kofile)
- Confidence gain: up to +15 overall
- Reason: Resolves ALL watermark-ambiguous readings at once

**Rule 2: Adjacent Deeds (Discrepancy Resolution)**
- For each unresolved discrepancy without `adjacent_reversed` data
- Estimated cost: $4-8
- Confidence gain: +2 to +8 depending on severity
- Sorted by discrepancy severity

**Rule 3: Subject Deed (Cross-Validation)**
- When many calls lack `deed_extraction` source and score < 70
- Provides independent metes & bounds for cross-validation

### ROI Formula

```
ROI = confidencePointsGained / estimatedCostDollars
```

Recommendations are sorted by ROI (highest first) and de-duplicated by instrument number.

---

## 8.7 Surveyor Decision Matrix

**File:** `worker/src/services/surveyor-decision-matrix.ts`

The final output: a go/no-go decision for field work.

### SurveyorDecision Fields (v1.1)

| Field | Type | Description |
|-------|------|-------------|
| `readyForField` | boolean | True if overall confidence ≥ 60 |
| `overallRisk` | 'low'/'medium'/'high'/'critical' | Risk level based on confidence + unresolved criticals |
| `caveats[]` | string[] | Human-readable caveats for the surveyor |
| `recommendedFieldChecks[]` | {location, reason}[] | Specific corners/areas to verify in field |
| `minConfidenceForField` | number | Threshold (currently 60) |
| `currentConfidence` | number | Overall confidence at time of scoring |
| `afterDocPurchase` | number | Projected confidence after buying recommended docs (capped at 98) |
| `pathTo90` | string \| null | Ordered actions to reach 90%+ confidence; null if already there |
| `estimatedFieldTime` | string | Rough field time estimate ("1 day", "2-3 days", etc.) |
| `summary` | string | Human-readable one-paragraph decision summary |

### Decision Logic

| Condition | Result |
|-----------|--------|
| Overall confidence ≥ 60 | **Ready for field** (with caveats) |
| Overall confidence < 60 | **Not ready** — purchase documents first |
| Critical discrepancy unresolved | overallRisk=critical; caveat: verify in field |
| Boundary side score < 60 | Caveat: GPS observation recommended |
| After doc purchase ≥ 60 | Note: purchasing would make field-ready |
| Score ≥ 80, no criticals | Positive: proceed with standard protocols |

### overallRisk Computation

| Condition | Risk |
|-----------|------|
| Any unresolved criticals OR confidence < 40 | critical |
| 40 ≤ confidence < 60 | high |
| 60 ≤ confidence < 80 OR moderate discrepancies > 2 | medium |
| Confidence ≥ 80, no criticals | low |

### Minimum Confidence: 60

This threshold means:
- At least some independent verification exists
- No single catastrophic data gap
- A competent surveyor can work with this data

### Field Check Recommendations

Generated automatically for:
- Corners at the end of critical-risk calls (score < 40)
- Boundary sides with score < 60
- Critical unresolved discrepancies

Maximum 10 field checks recommended.

---

## 8.8 Express API Endpoint & CLI

### API Endpoints

```
POST /research/confidence
```

**Request:**
```json
{
  "projectId": "ash-trust-001",
  "reconciledPath": "/tmp/analysis/ash-trust-001/reconciled_boundary.json"
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
GET /research/confidence/:projectId
```

Returns the complete `ConfidenceReport` JSON when scoring is complete, or `{ "status": "in_progress" }`. JSON.parse is wrapped in try/catch (v1.1) to prevent 500 errors on corrupt files.

### CLI Script

```bash
./confidence.sh <projectId>
```

**File:** `worker/confidence.sh`

- Loads environment from `/root/starr-worker/.env`
- Validates Phase 7 reconciled output exists
- Displays reconciliation preview (call count, closure ratio, avg confidence)
- POSTs to the worker API
- Provides monitoring and result viewing commands

---

## 8.9 Robustness Notes (v1.1)

| Issue | Fix Applied |
|-------|-------------|
| Bare `console.log` in engine | Replaced with `PipelineLogger` (consistent with Phase 6/7) |
| `estimatedResolutionCost` typed as `string` | Changed to `number` (numeric USD low-end estimate) |
| `SurveyorDecision` missing actionable fields | Added `overallRisk`, `pathTo90`, `estimatedFieldTime`, `summary` |
| AI fetch could hang indefinitely | Added `AbortSignal.timeout(30_000)` |
| Datum shift not detected as a pattern | Added `detectDatumShift()` — 3+ calls with 2–6' spreads → single datum_shift discrepancy |
| GET endpoint crashes on corrupt JSON | Wrapped `JSON.parse` in try/catch, returns 500 with details |
| Empty projectId allowed | Guard clause added at top of `score()` method |
| TypeScript type errors in test 16 | DiscrepancyReport test objects now include `resolution` field |

---

## 8.10 Acceptance Criteria

- [x] Per-call scoring: 4-factor model (multiplicity, agreement, reliability, clarity) produces 0-100 scores
- [x] Letter grades (A through F) correctly assigned from composite scores
- [x] Per-lot scoring accounts for closure quality and weakest-call penalty
- [x] Boundary-side scoring correctly groups calls by direction and flags weak sides
- [x] Overall confidence produces actionable grade with human-readable summary
- [x] Discrepancy detection: identifies bearing, distance, type conflicts above thresholds
- [x] Datum shift detection: 3+ calls with 2-6' spreads → single datum_shift discrepancy (v1.1)
- [x] AI root-cause analysis provides at least 2 plausible causes per discrepancy
- [x] AI fetch has 30-second timeout (AbortSignal.timeout) (v1.1)
- [x] Impact assessment computes closure, acreage, and position shift impacts
- [x] Document purchase recommendations ranked by ROI (confidence gain per dollar)
- [x] Surveyor decision matrix correctly distinguishes "field-ready" vs "purchase first"
- [x] SurveyorDecision includes overallRisk, pathTo90, estimatedFieldTime, summary (v1.1)
- [x] DiscrepancySummary.estimatedResolutionCost is numeric USD (v1.1)
- [x] Already-resolved discrepancies (from Phase 6) appear with "resolved" status
- [x] PipelineLogger used throughout (no bare console.log) (v1.1)
- [x] Empty projectId is rejected with clear error (v1.1)
- [x] GET endpoint handles corrupt JSON gracefully (v1.1)
- [x] CLI runs from droplet and saves confidence report JSON
- [x] Full confidence report generated within 30 seconds (including AI analysis)
- [x] 40 unit tests pass (up from 20 in v1.0)

---

## 8.11 Known Limitations / Cannot Fully Implement Without More Info

| Item | Limitation | Needs |
|------|-----------|-------|
| `area_discrepancy` detection | Computed acreage not yet threaded from traverse closure to confidence report | Phase 7 traverse closure output in a consistent format |
| `missing_call` detection | Phase 7 does not currently produce a call-count-per-source table | Phase 7 enhancement to track source call counts |
| `chain_of_title` discrepancy | Requires Phase 5 chain-of-title comparison data to be threaded to Phase 8 | Phase 5 output standardization |
| `monument_conflict` detection | Pure AI analysis only — no structural detection | Could be added if Phase 3 extracts monument references per call |
| ROI in dollar terms | Uses page-count estimates; actual Kofile pricing varies by county | Live Kofile pricing API |
| datum_shift direction determination | Detects spread but does not verify consistent rotation direction | Would require all calls to be in same quadrant to confirm |

---

## 8.12 File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `worker/src/types/confidence.ts` | All Phase 8 TypeScript interfaces (v1.1: overallRisk, pathTo90, estimatedFieldTime, summary; numeric estimatedResolutionCost) | ~190 |
| `worker/src/services/call-confidence-scorer.ts` | Step 1: Per-call 4-factor scoring | ~130 |
| `worker/src/services/lot-confidence-scorer.ts` | Steps 2-3: Lot + boundary-side scoring | ~160 |
| `worker/src/services/discrepancy-analyzer.ts` | Step 5: Discrepancy detection + datum_shift + AI analysis (v1.1: AbortSignal, datum_shift) | ~430 |
| `worker/src/services/purchase-recommender.ts` | Step 6: Document purchase ROI calculator | ~120 |
| `worker/src/services/surveyor-decision-matrix.ts` | Step 7: Go/no-go decision builder (v1.1: 5 new fields) | ~200 |
| `worker/src/services/confidence-scoring-engine.ts` | Orchestrator engine (v1.1: PipelineLogger, numeric cost, projectId guard) | ~395 |
| `worker/confidence.sh` | CLI script | ~100 |
| `worker/src/index.ts` | Express endpoints (v1.1: GET try/catch) | ~60 (added) |
| `__tests__/recon/phase8-confidence.test.ts` | 40 unit tests | ~570 |

**Total new code:** ~2,355 lines

---

## 8.13 Data Flow

```
Phase 7
ReconciledBoundaryModel
  │ Per-call readings, reconciliation metadata,
  │ closure results, unresolved conflicts
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│            Phase 8: ConfidenceScoringEngine                    │
│                                                                │
│  Step 1: CallConfidenceScorer                                 │
│    4-factor model: multiplicity + agreement + reliability +   │
│    clarity = 0-100 score per call                             │
│    ↓                                                           │
│  Step 2: LotConfidenceScorer                                  │
│    Weighted call average + closure bonus + acreage check      │
│    ↓                                                           │
│  Step 3: Boundary-Side Scoring                                │
│    Group by direction → N/E/S/W scores                        │
│    ↓                                                           │
│  Step 4: Overall Confidence                                   │
│    60% call avg + 40% lot avg ± closure ± diversity ± disc    │
│    ↓                                                           │
│  Step 5: DiscrepancyAnalyzer                                  │
│    bearing_mismatch / distance_mismatch / type_conflict       │
│    datum_shift (pattern detection, 3+ affected calls)         │
│    AI Root-Cause (AbortSignal.timeout 30s) → Resolution       │
│    ↓                                                           │
│  Step 6: PurchaseRecommender                                  │
│    ROI = confidence gain / cost → prioritized purchase list   │
│    ↓                                                           │
│  Step 7: SurveyorDecisionMatrix                              │
│    readyForField? overallRisk? pathTo90?                      │
│    estimatedFieldTime? summary? caveats?                      │
│                                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                      ConfidenceReport
                    (confidence_report.json)
                             │
                             ├── → Phase 9 (Document Purchase — uses purchase recs)
                             └── → Phase 10 (Reports & Exports — includes confidence data)
```

---

## 8.14 Integration Notes

### Context Loading

The engine automatically loads additional context from sibling files in the analysis directory:

| File | Data Used |
|------|-----------|
| `property_intelligence.json` | County, subdivision name, survey date, deed references (for known documents list) |
| `subdivision_model.json` | Lot acreages (stated vs computed) |
| `row_data.json` | Resolved conflicts (from Phase 6 TxDOT ROW) |

### Per-Call Confidence Example

```json
{
  "callId": "PERIM_N1",
  "score": 94,
  "grade": "A",
  "sourceCount": 4,
  "sources": ["plat_segment", "deed_extraction", "adjacent_reversed", "plat_geometric"],
  "agreement": "strong",
  "factors": {
    "sourceMultiplicity": 22,
    "sourceAgreement": 25,
    "sourceReliability": 22,
    "readingClarity": 25
  },
  "riskLevel": "low",
  "notes": null
}
```

### SurveyorDecision Example (v1.1)

```json
{
  "readyForField": true,
  "overallRisk": "medium",
  "caveats": [
    "West boundary (score: 54) requires field verification — GPS observation recommended",
    "1 moderate discrepancy — field check recommended but not blocking",
    "Data quality is strong — proceed to field with standard verification protocols"
  ],
  "recommendedFieldChecks": [
    { "location": "West boundary corners", "reason": "Low confidence (54)" }
  ],
  "minConfidenceForField": 60,
  "currentConfidence": 72,
  "afterDocPurchase": 84,
  "pathTo90": "Purchase deed (2024-DR-12345) — expected +12 overall; Obtain GPS observations on west boundary to verify position",
  "estimatedFieldTime": "1-2 days",
  "summary": "Overall confidence of 72% meets the field-ready threshold but has medium risk. 3 caveat(s) require attention during field work. Estimated field time: 1-2 days."
}
```

### Downstream Consumers

- **Phase 9** (Document Purchase) — Uses `documentPurchaseRecommendations` to determine which documents to buy and in what order
- **Phase 10** (Reports & Exports) — Includes confidence scores in PDF/DXF output, colors boundary lines by confidence level


---

## Goal

Produce a formal, multi-layer confidence scoring system that gives every surveyor a clear picture of data quality — from individual call confidence to overall property confidence. Build an intelligent discrepancy analysis engine that classifies, prioritizes, and recommends resolution paths for every unresolved conflict. The output is a `ConfidenceReport` that a surveyor can use to decide: "Is this data good enough to go to the field, or do I need to purchase documents first?"

## Deliverable

A `ConfidenceScoringEngine` that consumes the reconciled model and produces a layered confidence assessment with actionable intelligence.

**Output file:** `confidence_report.json`

---

## Current State of the Codebase

**Phase Status: ✅ COMPLETE**

All Phase 8 code has been implemented.

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/services/confidence-scoring-engine.ts` | `ConfidenceScoringEngine` — top-level Phase 8 orchestrator | ✅ Complete |
| `worker/src/services/call-confidence-scorer.ts` | Per-call 4-factor confidence scoring | ✅ Complete |
| `worker/src/services/lot-confidence-scorer.ts` | Per-lot confidence aggregation with closure factor | ✅ Complete |
| `worker/src/services/discrepancy-analyzer.ts` | Discrepancy classification, root-cause analysis, resolution paths | ✅ Complete |
| `worker/src/services/purchase-recommender.ts` | Document purchase ROI calculator and ranked recommendations | ✅ Complete |
| `worker/src/services/surveyor-decision-matrix.ts` | Surveyor decision matrix (field-ready assessment) | ✅ Complete |
| `worker/src/types/confidence.ts` | Phase 8 TypeScript types (`ConfidenceReport`, `CallConfidence`, etc.) | ✅ Complete |
| `worker/confidence.sh` | CLI wrapper for Phase 8 | ✅ Complete |

### API Endpoint

`POST /research/confidence` and `GET /research/confidence/:projectId` — live in `worker/src/index.ts`

---

Phase 7 reconciled all readings and assigned per-call confidence scores. Phase 8 takes those scores and builds a comprehensive, hierarchical confidence assessment — the surveyor's decision tool.

```bash
curl -X POST http://localhost:3100/research/confidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -d '{
    "projectId": "ash-trust-001",
    "reconciledPath": "/tmp/analysis/ash-trust-001/reconciled_boundary.json"
  }'
```

Returns HTTP 202 immediately. The `ConfidenceReport` is persisted to:
```
/tmp/analysis/{projectId}/confidence_report.json
```

Poll status via:
```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" \
  http://localhost:3100/research/confidence/{projectId}
```

### ConfidenceReport Shape

| Section | Description |
|---------|-------------|
| `overallConfidence` | Score (0-100), grade (A-F), label, human-readable summary |
| `callConfidence[]` | Per-call: 4-factor scoring, source list, agreement, risk level |
| `lotConfidence[]` | Per-lot: weighted call average, closure factor, weakest-call penalty |
| `boundaryConfidence[]` | Per-side (N/E/S/W): average score, call count, risk flags |
| `discrepancies[]` | Each discrepancy: severity, category, AI root-cause analysis, resolution path |
| `discrepancySummary` | Totals by severity, resolution cost estimate, confidence-after-resolution |
| `documentPurchaseRecommendations[]` | Ranked by ROI: document type, cost, confidence impact, calls improved |
| `surveyorDecisionMatrix` | Ready for field? Caveats, recommended field checks, path to 90%+ |
| `timing` | Total milliseconds |
| `aiCalls` | Number of AI API calls (typically 1 for discrepancy analysis) |
| `errors` | Any errors encountered |

---

## 8.2 Architecture Overview

```
INPUT: ReconciledBoundaryModel from Phase 7
  │
  ├── STEP 1: PER-CALL CONFIDENCE SCORING
  │   ├── Source multiplicity (how many sources?)
  │   ├── Source agreement (how close are they?)
  │   ├── Source reliability (weighted average of source types)
  │   ├── Reading clarity (was OCR clean or watermark-degraded?)
  │   └── Compute composite score (0-100) and grade (A-F)
  │
  ├── STEP 2: PER-LOT CONFIDENCE SCORING
  │   ├── Average of lot's call scores (weighted by boundary length)
  │   ├── Closure quality factor
  │   ├── Interior line agreement factor
  │   ├── Acreage cross-check factor
  │   └── Weakest-call penalty
  │
  ├── STEP 3: PER-BOUNDARY-SIDE CONFIDENCE
  │   ├── Group calls by direction (N/S/E/W)
  │   ├── Average score per side
  │   ├── Identify weakest side
  │   └── Cross-validate with adjacent research status
  │
  ├── STEP 4: OVERALL PROPERTY CONFIDENCE
  │   ├── Weighted average of lot/perimeter scores
  │   ├── Closure factor
  │   ├── Discrepancy penalty
  │   ├── Source diversity bonus
  │   └── Final grade (A-F)
  │
  ├── STEP 5: DISCREPANCY ANALYSIS
  │   ├── Classify each discrepancy (bearing, distance, type, monument, datum, area)
  │   ├── AI root-cause analysis per discrepancy
  │   ├── Impact assessment (closure, acreage, position)
  │   ├── Resolution pathway with cost and confidence impact
  │   └── Priority ranking
  │
  ├── STEP 6: DOCUMENT PURCHASE RECOMMENDATIONS
  │   ├── For each unresolved discrepancy: what document would resolve it?
  │   ├── Compute ROI (confidence gain per dollar)
  │   ├── Rank by ROI
  │   └── Generate purchase list
  │
  └── STEP 7: SURVEYOR DECISION MATRIX
      ├── Is data good enough for field work?
      ├── What caveats apply?
      ├── What field checks are recommended?
      └── What's the path to 90%+ confidence?
```

---

## 8.3 Call-Level Confidence Scoring

**File:** `worker/src/services/call-confidence-scorer.ts`

Each boundary call is scored on a 0-100 scale using a 4-factor model. Each factor contributes 0-25 points.

### Factor 1: Source Multiplicity (0-25)

How many independent sources provided a reading for this call?

| Sources | Points |
|---------|--------|
| 1 source | 5 |
| 2 sources | 12 |
| 3 sources | 18 |
| 4 sources | 22 |
| 5+ sources | 25 |

### Factor 2: Source Agreement (0-25)

How closely do the sources agree on bearing and distance?

| Bearing Spread | Distance Spread | Points |
|---------------|-----------------|--------|
| < 0.01° | < 0.5' | 25 |
| < 0.05° | < 1.0' | 20 |
| < 0.1° | < 2.0' | 15 |
| < 0.5° | < 5.0' | 8 |
| ≥ 0.5° | ≥ 5.0' | 3 |

Only scored when 2+ sources are present.

### Factor 3: Source Reliability (0-25)

Based on the highest-reliability source present for this call:

| Source | Reliability Points |
|--------|-------------------|
| `txdot_row` | 25 |
| `deed_extraction` | 22 |
| `adjacent_reversed` | 19 |
| `plat_segment` | 16 |
| `subdivision_interior` | 14 |
| `adjacent_chain` | 10 |
| `plat_overview` | 8 |
| `plat_geometric` | 6 |
| `county_road_default` | 4 |

### Factor 4: Reading Clarity (0-25)

Based on the highest-confidence individual reading: `maxReadingConfidence / 4`.

### Grade Scale

| Score | Grade | Risk Level |
|-------|-------|------------|
| ≥ 93 | A | Low |
| 88-92 | A- | Low |
| 83-87 | B+ | Low |
| 78-82 | B | Medium |
| 73-77 | B- | Medium |
| 68-72 | C+ | Medium |
| 63-67 | C | Medium |
| 58-62 | C- | High |
| 53-57 | D+ | High |
| 48-52 | D | High |
| 43-47 | D- | Critical |
| < 43 | F | Critical |

---

## 8.4 Lot-Level and Boundary-Side Confidence

**File:** `worker/src/services/lot-confidence-scorer.ts`

### Lot Scoring

1. **Base score:** Weighted average of call scores (weighted by boundary segment length)
2. **Closure bonus:** Good traverse closure adds +2 to +8 points
3. **Acreage cross-check:** Computed area matches stated area → +2 to +5
4. **Weakest-call penalty:** If any call scores < 40 → -5 points

### Closure Bonus Table

| Closure Ratio | Bonus |
|--------------|-------|
| ≥ 1:50,000 or 1:∞ | +8 |
| ≥ 1:20,000 | +5 |
| ≥ 1:10,000 | +2 |
| ≥ 1:5,000 | 0 |
| < 1:5,000 | -5 |

### Acreage Confidence

| Stated vs Computed Difference | Confidence |
|------------------------------|------------|
| < 0.1% | 98 |
| < 0.5% | 90 |
| < 1.0% | 80 |
| < 2.0% | 65 |
| < 5.0% | 45 |
| ≥ 5.0% | 25 |

### Boundary-Side Scoring

Calls are grouped by cardinal direction (inferred from bearing quadrant):
- Bearings with dominant N component and < 45° → "north"
- Bearings with dominant S component and < 45° → "south"
- NE/SE with ≥ 45° → "east"
- NW/SW with ≥ 45° → "west"

Each side gets the average score of its calls, with a risk flag if score < 60.

---

## 8.5 Discrepancy Analysis Engine

**File:** `worker/src/services/discrepancy-analyzer.ts`

### Discrepancy Categories

| Category | Description | Detection |
|----------|-------------|-----------|
| `bearing_mismatch` | Two sources disagree on bearing | Spread > 1 arc-minute |
| `distance_mismatch` | Two sources disagree on distance | Spread > 2 feet |
| `type_conflict` | One says straight, another says curve | Mixed types in readings |
| `monument_conflict` | Different monuments referenced | From AI analysis |
| `datum_shift` | NAD27 vs NAD83 or similar | 2-5 arc-minute rotation pattern |
| `area_discrepancy` | Computed area doesn't match stated | > 2% difference |
| `missing_call` | Extra/missing calls between sources | Call count mismatch |
| `road_geometry` | Straight vs curved road boundary | From Phase 6 ROW |
| `chain_of_title` | Description changed over time | From Phase 5 chain |

### Severity Thresholds

**Bearing discrepancies:**

| Spread (arc-minutes) | Severity |
|---------------------|----------|
| > 5' | Critical |
| > 1' | Moderate |
| > 0' (flagged) | Minor |

**Distance discrepancies:**

| Spread (feet) | Severity |
|--------------|----------|
| > 10' | Critical |
| > 5' | Moderate |
| > 2' (flagged) | Minor |

### AI Root-Cause Analysis

For each unresolved discrepancy, Claude analyzes:

1. **Possible causes** — ranked by likelihood (high/medium/low)
   - NAD27 → NAD83 datum shift
   - Watermark digit obscuration
   - Road widening changes
   - Vara-to-feet conversion errors
   - Different magnetic declination epochs
   - Different survey monuments

2. **Likely correct value** — weighted estimate with reasoning

3. **Impact assessment:**
   - Closure impact (severe/moderate/minimal/none)
   - Acreage impact (in acres)
   - Boundary position shift (in feet)
   - Legal significance

4. **Resolution pathway:**
   - Recommended action
   - Alternative actions
   - Estimated cost
   - Expected confidence after resolution
   - Priority ranking

### Already-Resolved Discrepancies

Discrepancies resolved by upstream phases (e.g., Phase 6 TxDOT confirming curved vs straight road boundary) appear in the report with `status: "resolved"` and their resolution details.

---

## 8.6 Document Purchase ROI Calculator

**File:** `worker/src/services/purchase-recommender.ts`

Ranks potential document purchases by ROI: confidence points gained per dollar spent.

### Purchase Rules

**Rule 1: Unwatermarked Plat (Highest ROI)**
- Count calls with `plat_segment` source and score < 80
- Estimated cost: ~$1-2 per page (Kofile)
- Confidence gain: up to +15 overall
- Reason: Resolves ALL watermark-ambiguous readings at once

**Rule 2: Adjacent Deeds (Discrepancy Resolution)**
- For each unresolved discrepancy without `adjacent_reversed` data
- Estimated cost: $4-8
- Confidence gain: +2 to +8 depending on severity
- Sorted by discrepancy severity

**Rule 3: Subject Deed (Cross-Validation)**
- When many calls lack `deed_extraction` source and score < 70
- Provides independent metes & bounds for cross-validation

### ROI Formula

```
ROI = confidencePointsGained / estimatedCostDollars
```

Recommendations are sorted by ROI (highest first) and de-duplicated by instrument number.

---

## 8.7 Surveyor Decision Matrix

**File:** `worker/src/services/surveyor-decision-matrix.ts`

The final output: a go/no-go decision for field work.

### Decision Logic

| Condition | Result |
|-----------|--------|
| Overall confidence ≥ 60 | **Ready for field** (with caveats) |
| Overall confidence < 60 | **Not ready** — purchase documents first |
| Critical discrepancy unresolved | Caveat: verify in field |
| Boundary side score < 60 | Caveat: GPS observation recommended |
| After doc purchase ≥ 60 | Note: purchasing would make field-ready |
| Score ≥ 80, no criticals | Positive: proceed with standard protocols |

### Minimum Confidence: 60

This threshold means:
- At least some independent verification exists
- No single catastrophic data gap
- A competent surveyor can work with this data

### Field Check Recommendations

Generated automatically for:
- Corners at the end of critical-risk calls (score < 40)
- Boundary sides with score < 60
- Critical unresolved discrepancies

Maximum 10 field checks recommended.

---

## 8.8 Express API Endpoint & CLI

### API Endpoints

```
POST /research/confidence
```

**Request:**
```json
{
  "projectId": "ash-trust-001",
  "reconciledPath": "/tmp/analysis/ash-trust-001/reconciled_boundary.json"
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
GET /research/confidence/:projectId
```

Returns the complete `ConfidenceReport` JSON when scoring is complete, or `{ "status": "in_progress" }`.

### CLI Script

```bash
./confidence.sh <projectId>
```

**File:** `worker/confidence.sh`

- Loads environment from `/root/starr-worker/.env`
- Validates Phase 7 reconciled output exists
- Displays reconciliation preview (call count, closure ratio, avg confidence)
- POSTs to the worker API
- Provides monitoring and result viewing commands

---

## 8.9 Acceptance Criteria

- [x] Per-call scoring: 4-factor model (multiplicity, agreement, reliability, clarity) produces 0-100 scores
- [x] Letter grades (A through F) correctly assigned from composite scores
- [x] Per-lot scoring accounts for closure quality and weakest-call penalty
- [x] Boundary-side scoring correctly groups calls by direction and flags weak sides
- [x] Overall confidence produces actionable grade with human-readable summary
- [x] Discrepancy detection: identifies bearing, distance, type conflicts above thresholds
- [x] AI root-cause analysis provides at least 2 plausible causes per discrepancy
- [x] Impact assessment computes closure, acreage, and position shift impacts
- [x] Document purchase recommendations ranked by ROI (confidence gain per dollar)
- [x] Surveyor decision matrix correctly distinguishes "field-ready" vs "purchase first"
- [x] Already-resolved discrepancies (from Phase 6) appear with "resolved" status
- [x] CLI runs from droplet and saves confidence report JSON
- [x] Full confidence report generated within 30 seconds (including AI analysis)

---

## 8.10 File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `worker/src/types/confidence.ts` | All Phase 8 TypeScript interfaces | ~160 |
| `worker/src/services/call-confidence-scorer.ts` | Step 1: Per-call 4-factor scoring | ~130 |
| `worker/src/services/lot-confidence-scorer.ts` | Steps 2-3: Lot + boundary-side scoring | ~160 |
| `worker/src/services/discrepancy-analyzer.ts` | Step 5: Discrepancy detection + AI analysis | ~310 |
| `worker/src/services/purchase-recommender.ts` | Step 6: Document purchase ROI calculator | ~120 |
| `worker/src/services/surveyor-decision-matrix.ts` | Step 7: Go/no-go decision builder | ~100 |
| `worker/src/services/confidence-scoring-engine.ts` | Orchestrator engine (all 7 steps) | ~380 |
| `worker/confidence.sh` | CLI script | ~100 |
| `worker/src/index.ts` | Express endpoint additions | ~60 (added) |

**Total new code:** ~1,520 lines

---

## 8.11 Data Flow

```
Phase 7
ReconciledBoundaryModel
  │ Per-call readings, reconciliation metadata,
  │ closure results, unresolved conflicts
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│            Phase 8: ConfidenceScoringEngine                    │
│                                                                │
│  Step 1: CallConfidenceScorer                                 │
│    4-factor model: multiplicity + agreement + reliability +   │
│    clarity = 0-100 score per call                             │
│    ↓                                                           │
│  Step 2: LotConfidenceScorer                                  │
│    Weighted call average + closure bonus + acreage check      │
│    ↓                                                           │
│  Step 3: Boundary-Side Scoring                                │
│    Group by direction → N/E/S/W scores                        │
│    ↓                                                           │
│  Step 4: Overall Confidence                                   │
│    60% call avg + 40% lot avg ± closure ± diversity ± disc    │
│    ↓                                                           │
│  Step 5: DiscrepancyAnalyzer                                  │
│    Detect → Classify → AI Root-Cause → Impact → Resolution   │
│    ↓                                                           │
│  Step 6: PurchaseRecommender                                  │
│    ROI = confidence gain / cost → prioritized purchase list   │
│    ↓                                                           │
│  Step 7: SurveyorDecisionMatrix                              │
│    Ready for field? Caveats? Field checks? Path to 90%?      │
│                                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                      ConfidenceReport
                    (confidence_report.json)
                             │
                             ├── → Phase 9 (Document Purchase — uses purchase recs)
                             └── → Phase 10 (Reports & Exports — includes confidence data)
```

---

## 8.12 Integration Notes

### Context Loading

The engine automatically loads additional context from sibling files in the analysis directory:

| File | Data Used |
|------|-----------|
| `property_intelligence.json` | County, subdivision name, survey date, deed references (for known documents list) |
| `subdivision_model.json` | Lot acreages (stated vs computed) |
| `row_data.json` | Resolved conflicts (from Phase 6 TxDOT ROW) |

### Per-Call Confidence Example

```json
{
  "callId": "PERIM_N1",
  "score": 94,
  "grade": "A",
  "sourceCount": 4,
  "sources": ["plat_segment", "deed_extraction", "adjacent_reversed", "plat_geometric"],
  "agreement": "strong",
  "factors": {
    "sourceMultiplicity": 22,
    "sourceAgreement": 25,
    "sourceReliability": 22,
    "readingClarity": 25
  },
  "riskLevel": "low",
  "notes": null
}
```

### Downstream Consumers

- **Phase 9** (Document Purchase) — Uses `documentPurchaseRecommendations` to determine which documents to buy and in what order
- **Phase 10** (Reports & Exports) — Includes confidence scores in PDF/DXF output, colors boundary lines by confidence level
