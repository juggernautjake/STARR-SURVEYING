# STARR CAD — Phase 6: AI Drawing Engine

**Version:** 2.0 | **Date:** March 2026 | **Phase:** 6 of 8

**Goal:** Import a field file + provide a deed, and the AI produces a review-ready drawing with confidence scores on every element. Point groups (calc/set/found) are automatically resolved. A 6-stage pipeline classifies points, assembles features, reconciles against deeds, places everything intelligently, optimizes labels, and scores confidence. The engine resolves field-shot dynamic offsets to true positions, enriches data from online sources (GIS parcels, FEMA, PLSS), enters a 5–10 minute deliberation period, generates confidence-gated clarifying questions, renders an interactive drawing preview with visual confidence cards, and provides per-element AI explanation popups with element-level chat. The user accepts the drawing to send it to the Phase 7 full editor.

**Duration:** 10–13 weeks | **Depends On:** Phase 5 (annotations, labels, templates, print system all exist for the AI to populate)

---

## Table of Contents

1. [Phase 6 Architecture Changes](#1-phase-6-architecture-changes)
2. [AI Pipeline Overview (6 Stages)](#2-ai-pipeline-overview-6-stages)
3. [Stage 1: Point Classification](#3-stage-1-point-classification)
4. [Stage 2: Feature Assembly](#4-stage-2-feature-assembly)
5. [Stage 3: Deed/Record Reconciliation](#5-stage-3-deedrecord-reconciliation)
6. [Deed PDF/Image Import & OCR](#6-deed-pdfimage-import--ocr)
7. [Deed Call Parser](#7-deed-call-parser)
8. [Stage 4: Intelligent Placement](#8-stage-4-intelligent-placement)
9. [Stage 5: Label Optimization (AI-Aware)](#9-stage-5-label-optimization-ai-aware)
10. [Stage 6: Confidence Scoring](#10-stage-6-confidence-scoring)
11. [Confidence Tier System](#11-confidence-tier-system)
12. [Point Group Intelligence in AI Context](#12-point-group-intelligence-in-ai-context)
13. [AI Review Queue Data Model](#13-ai-review-queue-data-model)
14. [AI Review Queue UI](#14-ai-review-queue-ui)
15. [Review Actions & Workflow](#15-review-actions--workflow)
16. [AI Prompt Input & Re-Processing](#16-ai-prompt-input--re-processing)
17. [Claude API Integration](#17-claude-api-integration)
18. [DigitalOcean Worker Architecture](#18-digitalocean-worker-architecture)
19. [AI Job Payload & Result](#19-ai-job-payload--result)
20. [Worker Pipeline Orchestration](#20-worker-pipeline-orchestration)
21. [Error Handling & Fallbacks](#21-error-handling--fallbacks)
22. [AI-Assisted Feature Editing](#22-ai-assisted-feature-editing)
23. [State Management Updates](#23-state-management-updates)
24. [Acceptance Tests](#24-acceptance-tests)
25. [Build Order (Implementation Sequence)](#25-build-order-implementation-sequence)
26. [Dynamic Offset Resolution](#26-dynamic-offset-resolution)
27. [Online Data Enrichment](#27-online-data-enrichment)
28. [AI Deliberation Period & Confidence-Gated Clarifying Questions](#28-ai-deliberation-period--confidence-gated-clarifying-questions)
29. [Interactive Drawing Preview & Confidence Element Cards](#29-interactive-drawing-preview--confidence-element-cards)
30. [Per-Element AI Explanation & Element-Level Chat](#30-per-element-ai-explanation--element-level-chat)

---

## 1. Phase 6 Architecture Changes

### 1.1 New Packages & Modules

```
packages/
├── ai-engine/                       # NEW — AI pipeline, scoring, review
│   ├── src/
│   │   ├── types.ts                 # All AI-specific types
│   │   ├── pipeline.ts              # Orchestrates all 6 stages
│   │   ├── stage-1-classify.ts      # Point classification
│   │   ├── stage-2-assemble.ts      # Feature assembly
│   │   ├── stage-3-reconcile.ts     # Deed reconciliation
│   │   ├── stage-4-placement.ts     # Intelligent placement
│   │   ├── stage-5-labels.ts        # AI-aware label optimization
│   │   ├── stage-6-confidence.ts    # Confidence scoring
│   │   ├── deed-parser.ts           # Legal description text → DeedCall[]
│   │   ├── deed-ocr.ts              # PDF/image → text extraction
│   │   ├── review-queue.ts          # Review queue construction
│   │   └── prompt-builder.ts        # Builds system+user prompts for Claude
│   ├── __tests__/
│   │   ├── stage-1.test.ts
│   │   ├── stage-2.test.ts
│   │   ├── stage-3.test.ts
│   │   ├── deed-parser.test.ts
│   │   ├── confidence.test.ts
│   │   └── pipeline.test.ts
│   ├── package.json
│   └── tsconfig.json
│
├── ai-worker/                       # NEW — DigitalOcean worker process
│   ├── src/
│   │   ├── server.ts                # Express HTTP server
│   │   ├── job-handler.ts           # Receives payload, runs pipeline
│   │   ├── claude-client.ts         # Anthropic API client wrapper
│   │   └── ocr-client.ts            # PDF/image OCR processing
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json

apps/web/components/
├── ai/
│   ├── AIDrawingDialog.tsx          # NEW — Start AI drawing wizard
│   ├── DeedImport.tsx               # NEW — Upload/paste deed
│   ├── AIProgressPanel.tsx          # NEW — Live progress during processing
│   ├── ReviewQueue.tsx              # NEW — Review queue panel
│   ├── ReviewItem.tsx               # NEW — Individual review item
│   ├── ReviewPointGroup.tsx         # NEW — Calc/set/found viewer in review
│   ├── ReviewBatchActions.tsx       # NEW — Batch accept/reject controls
│   ├── AIPromptInput.tsx            # NEW — Re-processing prompt input
│   └── ConfidenceBadge.tsx          # NEW — Visual confidence indicator
```

### 1.2 New Dependencies

```json
{
  "ai-worker": {
    "@anthropic-ai/sdk": "latest",
    "express": "^4.18",
    "multer": "^1.4",
    "pdf-parse": "^1.1",
    "tesseract.js": "^5.0"
  },
  "ai-engine": {
    // Pure TypeScript, no external deps (runs in browser too)
  }
}
```

---

## 2. AI Pipeline Overview (6 Stages)

```
┌──────────────────────────────────────────────────────────────────┐
│                     AI DRAWING ENGINE                             │
│                                                                  │
│  INPUT:                                                          │
│    • Field file (CSV/RW5/JobXML with survey points)              │
│    • Deed data (optional: PDF, image, or pasted text)            │
│    • User prompt (optional: free-text instructions)              │
│    • Template selection (or auto-select)                         │
│                                                                  │
│  ┌────────────────────────┐                                      │
│  │ Stage 1: CLASSIFY      │ Parse codes, names, suffixes,        │
│  │                        │ resolve monument actions,            │
│  │                        │ flag ambiguities                     │
│  └──────────┬─────────────┘                                      │
│             ↓                                                    │
│  ┌────────────────────────┐                                      │
│  │ Stage 2: ASSEMBLE      │ Build line strings, fit arcs,        │
│  │                        │ fit splines, detect polygons,        │
│  │                        │ identify orphans                     │
│  └──────────┬─────────────┘                                      │
│             ↓                                                    │
│  ┌────────────────────────┐                                      │
│  │ Stage 3: RECONCILE     │ Parse deed, trace record boundary,   │
│  │  (if deed provided)    │ compare field vs record per call,    │
│  │                        │ flag discrepancies                   │
│  └──────────┬─────────────┘                                      │
│             ↓                                                    │
│  ┌────────────────────────┐                                      │
│  │ Stage 4: PLACE         │ Auto-select paper/scale/orientation, │
│  │                        │ assign layers, generate labels,      │
│  │                        │ position template elements           │
│  └──────────┬─────────────┘                                      │
│             ↓                                                    │
│  ┌────────────────────────┐                                      │
│  │ Stage 5: OPTIMIZE      │ Collision-free label placement,      │
│  │                        │ simulated annealing,                 │
│  │                        │ flag unresolvable conflicts          │
│  └──────────┬─────────────┘                                      │
│             ↓                                                    │
│  ┌────────────────────────┐                                      │
│  │ Stage 6: SCORE         │ Per-element confidence (0-100),      │
│  │                        │ 5-tier classification,               │
│  │                        │ build review queue                   │
│  └──────────┬─────────────┘                                      │
│             ↓                                                    │
│  OUTPUT:                                                         │
│    • Complete drawing specification (features + annotations)     │
│    • Confidence scores per element                               │
│    • Review queue (tier-grouped, actionable)                     │
│    • Reconciliation report (if deed provided)                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Stage 1: Point Classification

Reuses Phase 2's parsing infrastructure but adds AI-level classification flags.

```typescript
// packages/ai-engine/src/stage-1-classify.ts

export interface ClassificationResult {
  point: SurveyPoint;
  resolvedCode: PointCodeDefinition | null;
  monumentAction: MonumentAction | null;
  codeSuffix: string | null;            // B/E/A/BA/EA/CA
  isLineStart: boolean;
  isLineEnd: boolean;
  isArcPoint: boolean;
  isAutoSplinePoint: boolean;
  flags: ClassificationFlag[];
  flagMessages: string[];
}

export type ClassificationFlag =
  | 'UNRECOGNIZED_CODE'
  | 'AMBIGUOUS_CODE'
  | 'DUPLICATE_POINT_NUMBER'
  | 'COORDINATE_OUTLIER'
  | 'ELEVATION_ANOMALY'
  | 'SUFFIX_PARSE_ERROR'
  | 'NAME_SUFFIX_AMBIGUOUS'
  | 'ZERO_COORDINATES'
  | 'MONUMENT_NO_ACTION'
  | 'CALC_WITHOUT_FIELD';

export function classifyPoints(points: SurveyPoint[]): ClassificationResult[] {
  const results: ClassificationResult[] = [];

  // Pre-compute centroid for outlier detection
  const centroid = computeCentroid(points);
  const distances = points.map(p => Math.sqrt(
    (p.easting - centroid.x) ** 2 + (p.northing - centroid.y) ** 2
  ));
  const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const stdDev = Math.sqrt(
    distances.reduce((a, d) => a + (d - meanDist) ** 2, 0) / distances.length
  );
  const outlierThreshold = meanDist + 50 * stdDev;

  // Track point numbers for duplicate detection
  const seenNumbers = new Map<number, string[]>();

  for (const point of points) {
    const flags: ClassificationFlag[] = [];
    const flagMessages: string[] = [];

    // Duplicate point number
    const existing = seenNumbers.get(point.pointNumber) ?? [];
    if (existing.length > 0) {
      flags.push('DUPLICATE_POINT_NUMBER');
      flagMessages.push(`Point number ${point.pointNumber} also appears as ${existing.join(', ')}`);
    }
    existing.push(point.id);
    seenNumbers.set(point.pointNumber, existing);

    // Zero coordinates
    if (point.easting === 0 && point.northing === 0) {
      flags.push('ZERO_COORDINATES');
      flagMessages.push('Both coordinates are zero');
    }

    // Coordinate outlier
    const dist = Math.sqrt(
      (point.easting - centroid.x) ** 2 + (point.northing - centroid.y) ** 2
    );
    if (dist > outlierThreshold && outlierThreshold > 0) {
      flags.push('COORDINATE_OUTLIER');
      flagMessages.push(
        `Point is ${dist.toFixed(0)}' from centroid (threshold: ${outlierThreshold.toFixed(0)}')`
      );
    }

    // Code recognition
    if (!point.codeDefinition) {
      flags.push('UNRECOGNIZED_CODE');
      flagMessages.push(`Code "${point.rawCode}" not found in library`);
    }

    // Name suffix ambiguity
    if (
      point.parsedName.suffixConfidence < 0.8 &&
      point.parsedName.normalizedSuffix !== 'NONE'
    ) {
      flags.push('NAME_SUFFIX_AMBIGUOUS');
      flagMessages.push(
        `Suffix "${point.parsedName.suffix}" matched as ${point.parsedName.normalizedSuffix} ` +
        `with ${(point.parsedName.suffixConfidence * 100).toFixed(0)}% confidence`
      );
    }

    // Monument without clear action
    if (
      point.codeDefinition?.category === 'BOUNDARY_CONTROL' &&
      point.monumentAction === 'UNKNOWN'
    ) {
      flags.push('MONUMENT_NO_ACTION');
      flagMessages.push('Monument code without found/set/calc indicator');
    }

    results.push({
      point,
      resolvedCode: point.codeDefinition ?? null,
      monumentAction: point.monumentAction ?? null,
      codeSuffix: point.codeSuffix ?? null,
      isLineStart:   point.codeSuffix === 'B'  || point.codeSuffix === 'BA',
      isLineEnd:     point.codeSuffix === 'E'  || point.codeSuffix === 'EA',
      isArcPoint:    point.codeSuffix === 'A'  || point.codeSuffix === 'BA'
                  || point.codeSuffix === 'EA' || point.codeSuffix === 'CA',
      isAutoSplinePoint: point.codeDefinition?.isAutoSpline ?? false,
      flags,
      flagMessages,
    });
  }

  return results;
}
```

---

## 4. Stage 2: Feature Assembly

Builds the geometric features from classified points.

```typescript
// packages/ai-engine/src/stage-2-assemble.ts

export interface FeatureAssemblyResult {
  lineStrings: LineString[];
  pointFeatures: Feature[];
  closedPolygons: Feature[];
  curveFeatures: Feature[];
  splineFeatures: Feature[];
  mixedGeometryFeatures: Feature[];
  orphanedPoints: SurveyPoint[];
  warnings: AssemblyWarning[];
  stats: AssemblyStats;
}

export interface AssemblyWarning {
  type: 'UNCLOSED_BOUNDARY' | 'SINGLE_POINT_LINE' | 'MIXED_CODES_IN_SEQUENCE'
      | 'GAP_IN_SEQUENCE' | 'SELF_INTERSECTION' | 'ARC_INSUFFICIENT_POINTS'
      | 'SPLINE_TOO_FEW_POINTS' | 'DUPLICATE_POSITION';
  pointIds: string[];
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export interface AssemblyStats {
  totalPoints: number;
  pointFeaturesCreated: number;
  lineStringsBuilt: number;
  closedPolygonsDetected: number;
  arcsFound: number;
  splinesBuilt: number;
  mixedGeometryCount: number;
  orphanedPointCount: number;
  warningCount: number;
}

export function assembleFeatures(
  classified: ClassificationResult[],
  pointGroups: Map<number, PointGroup>,
): FeatureAssemblyResult {
  const result: FeatureAssemblyResult = {
    lineStrings: [], pointFeatures: [], closedPolygons: [],
    curveFeatures: [], splineFeatures: [], mixedGeometryFeatures: [],
    orphanedPoints: [], warnings: [],
    stats: {
      totalPoints: classified.length,
      pointFeaturesCreated: 0, lineStringsBuilt: 0, closedPolygonsDetected: 0,
      arcsFound: 0, splinesBuilt: 0, mixedGeometryCount: 0,
      orphanedPointCount: 0, warningCount: 0,
    },
  };

  // Step 1: Use only "final" points from each group
  const finalPoints = selectFinalPoints(classified, pointGroups);

  // Step 2: Build line strings from B/E suffixes (reuse Phase 2 buildLineStrings)
  const lineStrings = buildLineStrings(finalPoints.map(c => c.point));

  // Step 3: Process each line string
  for (const ls of lineStrings) {
    const hasArcSegments = ls.segments.some(s => s === 'ARC');
    const isAutoSpline = classified.some(c =>
      ls.pointIds.includes(c.point.id) && c.isAutoSplinePoint
    );

    if (isAutoSpline && ls.pointIds.length >= 3) {
      result.splineFeatures.push(fitSplineToLineString(ls, finalPoints));
      result.stats.splinesBuilt++;
    } else if (hasArcSegments) {
      result.mixedGeometryFeatures.push(buildMixedGeometryFeature(ls, finalPoints));
      result.stats.mixedGeometryCount++;
    } else if (ls.isClosed) {
      result.closedPolygons.push(buildPolygonFeature(ls, finalPoints));
      result.stats.closedPolygonsDetected++;
    } else {
      result.lineStrings.push(ls);
      result.stats.lineStringsBuilt++;
    }
  }

  // Step 4: Point-only codes → point features
  for (const cp of finalPoints) {
    if (cp.resolvedCode?.connectType === 'POINT') {
      result.pointFeatures.push(buildPointFeature(cp));
      result.stats.pointFeaturesCreated++;
    }
  }

  // Step 5: Detect unclosed boundaries
  for (const ls of result.lineStrings) {
    if (ls.pointIds.length >= 3) {
      const first = getPointById(ls.pointIds[0], finalPoints);
      const last  = getPointById(ls.pointIds[ls.pointIds.length - 1], finalPoints);
      if (first && last) {
        const gap = Math.sqrt(
          (first.point.easting  - last.point.easting)  ** 2 +
          (first.point.northing - last.point.northing) ** 2
        );
        const isBoundaryCode = ['PL01', 'PL06', '350', '355'].includes(ls.codeBase);
        if (gap < 1.0 && isBoundaryCode) {
          result.warnings.push({
            type: 'UNCLOSED_BOUNDARY',
            pointIds: ls.pointIds,
            message: `Boundary line string gap is ${gap.toFixed(3)}' — should this be closed?`,
            severity: 'WARNING',
          });
        }
      }
    }
  }

  // Step 6: Arc fitting — consecutive A-suffix points → Kasa circle fit
  for (const ls of lineStrings) {
    const arcRuns = findArcRuns(ls);
    for (const run of arcRuns) {
      if (run.length >= 3) {
        const pts = run.map(id => {
          const cp = finalPoints.find(c => c.point.id === id)!;
          return { x: cp.point.easting, y: cp.point.northing };
        });
        const arc = kasaCircleFit(pts);
        if (arc) {
          result.curveFeatures.push(buildArcFeature(arc, run));
          result.stats.arcsFound++;
        }
      } else {
        result.warnings.push({
          type: 'ARC_INSUFFICIENT_POINTS',
          pointIds: run,
          message: `Only ${run.length} arc points — need at least 3 for circle fit`,
          severity: 'WARNING',
        });
      }
    }
  }

  result.stats.warningCount = result.warnings.length;
  return result;
}

/**
 * Select the "final" point from each group:
 *   SET > FOUND > latest CALC > NONE
 * Non-grouped points pass through unchanged.
 */
function selectFinalPoints(
  classified: ClassificationResult[],
  pointGroups: Map<number, PointGroup>,
): ClassificationResult[] {
  const finalIds = new Set<string>();

  for (const group of pointGroups.values()) {
    if (group.finalPoint) finalIds.add(group.finalPoint.id);
  }

  // Include all non-grouped points and only final points from groups
  return classified.filter(c => {
    const group = pointGroups.get(c.point.parsedName.baseNumber);
    if (!group) return true; // Not in any group — include
    return finalIds.has(c.point.id);
  });
}

/**
 * Kasa algebraic circle fit (least-squares through N points).
 * Returns center and radius.
 */
function kasaCircleFit(points: Point2D[]): ArcDefinition | null {
  const n = points.length;
  if (n < 3) return null;

  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  let sxxx = 0, syyy = 0, sxxy = 0, sxyy = 0;

  for (const p of points) {
    sx += p.x;    sy += p.y;
    sxx += p.x * p.x;    syy += p.y * p.y;    sxy += p.x * p.y;
    sxxx += p.x ** 3;    syyy += p.y ** 3;
    sxxy += p.x * p.x * p.y;    sxyy += p.x * p.y * p.y;
  }

  const A = n * sxx - sx * sx;
  const B = n * sxy - sx * sy;
  const C = n * syy - sy * sy;
  const D = 0.5 * (n * sxxx + n * sxyy - sx * sxx - sx * syy);
  const E = 0.5 * (n * sxxy + n * syyy - sy * sxx - sy * syy);

  const denom = A * C - B * B;
  if (Math.abs(denom) < 1e-10) return null;

  const cx = (D * C - B * E) / denom;
  const cy = (A * E - B * D) / denom;
  const radius = Math.sqrt(
    cx * cx + cy * cy + (sxx + syy) / n - (2 * cx * sx + 2 * cy * sy) / n
  );

  // Compute arc angles from first/last point
  const startAngle = Math.atan2(points[0].y - cy, points[0].x - cx);
  const endAngle   = Math.atan2(points[n - 1].y - cy, points[n - 1].x - cx);

  // Determine CW/CCW from point ordering (cross product)
  const mid = points[Math.floor(n / 2)];
  const cross = (points[0].x - cx) * (mid.y - cy) - (points[0].y - cy) * (mid.x - cx);
  const direction: 'CW' | 'CCW' = cross > 0 ? 'CCW' : 'CW';

  return {
    center: { x: cx, y: cy },
    radius,
    startAngle,
    endAngle,
    direction,
    pc:  points[0],
    pt:  points[n - 1],
    mpc: mid,
    pi:  { x: cx, y: cy }, // Approximate — PI computation requires tangent intersection
  };
}
```

---

## 5. Stage 3: Deed/Record Reconciliation

The core intelligence that compares field survey data against the recorded deed.

### 5.0 Orientation Correction (pre-reconciliation step)

Before deed calls can be matched to field lines, the raw survey must be correctly
oriented.  If the total-station was not properly backsighted, every bearing will be
offset by a constant rotation error and the matching step will fail.

**Integration point with Phase 2 orientation tools:**
The Phase 2 `orient.ts` module (`lib/cad/geometry/orient.ts`) provides:
- `extractReferenceLines(features)` — candidate reference line segments from the drawing
- `generateBearingCandidates(measAz, otherLines?)` — smart snap + AI candidate list.
  The `BearingCandidate.source` field has a reserved value `'DEED_AI'` specifically for
  candidates produced by this stage.  Each AI candidate should carry:
  - `azimuth` — the deed call's bearing converted to azimuth degrees
  - `correctionDeg` — the global rotation that would make this field line match this call
  - `confidence` — computed from OCR score × bearing-distance proximity score
  - `reason` — human-readable match description (e.g. "Deed call: S 45°30'E, 247.3 ft")

**Stage 3 orientation algorithm:**
1. Parse all bearing calls from `DeedData.calls` (deed parser already produces azimuths)
2. For each field line segment (from `extractReferenceLines`), for each deed call:
   - Compute distance and bearing proximity scores
   - If distance score > 0.7 AND bearing proximity within 30°, it is a candidate match
3. For each candidate match pair, compute the implied global correction:
   `correction = computeOrientationCorrection(fieldLine.azimuth, deedCall.bearing)`
4. Find the correction value with the most supporting evidence (histogram / RANSAC)
5. If the dominant correction has support from ≥ 2 independent line pairs with
   confidence > 0.6, auto-apply it and record it in `ReconciliationResult.orientationApplied`
6. Otherwise, populate `BearingCandidate[]` with `source: 'DEED_AI'` and surface them
   in the `OrientationDialog` "Suggested Bearings" panel for the surveyor to review

**Fields to add to `ReconciliationResult`:**
```typescript
orientationApplied: boolean;
orientationCorrectionDeg: number | null;   // The rotation applied
orientationSupportCount: number;           // Number of line pairs that agreed
orientationPivot: Point2D | null;
```

**UI integration:**
- When the AI auto-applies an orientation correction, show a toast notification:
  "Survey orientation auto-adjusted: +X.XX° CCW based on N deed calls"
- The user can undo this via the standard undo stack (it is recorded as a batch entry)
- The `OrientationDialog` should show "AI-adjusted" status and allow re-correction

```typescript
// packages/ai-engine/src/stage-3-reconcile.ts

export interface DeedData {
  source: 'LEGAL_DESCRIPTION' | 'PLAT_IMAGE' | 'DEED_PDF' | 'MANUAL_ENTRY';
  rawText: string;
  calls: DeedCall[];
  curves: DeedCurve[];
  basisOfBearings: string | null;
  beginningMonument: string | null;
  county: string | null;
  survey: string | null;
  abstract: string | null;
  volume: string | null;
  page: string | null;
}

export interface DeedCall {
  index: number;
  type: 'LINE' | 'CURVE';
  bearing: number | null;              // Azimuth degrees
  distance: number | null;             // Feet
  curveData: DeedCurve | null;
  monument: string | null;             // "a 5/8 inch iron rod found"
  rawText: string;
}

export interface DeedCurve {
  radius: number | null;
  arcLength: number | null;
  chordBearing: number | null;
  chordDistance: number | null;
  deltaAngle: number | null;           // Degrees
  direction: 'LEFT' | 'RIGHT' | null;
}

export interface ReconciliationResult {
  fieldTraverse: Traverse;
  recordTraverse: Traverse;
  callComparisons: CallComparison[];
  fieldClosure: ClosureResult;
  recordClosure: ClosureResult | null;
  discrepancies: Discrepancy[];
  overallMatchScore: number;           // 0-100
  confidenceAdjustments: Map<string, number>; // featureId → +/- adjustment
}

export interface CallComparison {
  deedCallIndex: number;
  fieldLegIndex: number;
  fieldBearing: number | null;         // Azimuth
  fieldDistance: number | null;
  recordBearing: number | null;
  recordDistance: number | null;
  bearingDiff: number | null;          // Seconds
  distanceDiff: number | null;         // Feet
  bearingOk: boolean;                  // Within 60 seconds
  distanceOk: boolean;                 // Within 0.50'
  overallMatch: boolean;
  confidenceContribution: number;      // 0.0 to 1.0 per call
}

export interface Discrepancy {
  type: 'BEARING_MISMATCH' | 'DISTANCE_MISMATCH' | 'MONUMENT_NOT_FOUND'
      | 'EXTRA_MONUMENT' | 'CURVE_MISMATCH' | 'CLOSURE_POOR'
      | 'CALL_COUNT_MISMATCH' | 'BEGINNING_MONUMENT_NOT_FOUND';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  callIndex: number | null;
  message: string;
  fieldValue: string;
  recordValue: string;
  difference: string;
}

export function reconcileDeed(
  fieldTraverse: Traverse,
  deedData: DeedData,
  points: SurveyPoint[],
  pointGroups: Map<number, PointGroup>,
): ReconciliationResult {
  const comparisons: CallComparison[] = [];
  const discrepancies: Discrepancy[] = [];
  const adjustments = new Map<string, number>();

  // Step 1: Match beginning monument
  const beginPt = findBeginningMonument(deedData, points);
  if (!beginPt) {
    discrepancies.push({
      type: 'BEGINNING_MONUMENT_NOT_FOUND',
      severity: 'HIGH',
      callIndex: null,
      message: `Could not locate beginning monument: "${deedData.beginningMonument}"`,
      fieldValue: 'Not found',
      recordValue: deedData.beginningMonument ?? 'unknown',
      difference: 'N/A',
    });
  }

  // Step 2: Match deed calls to field traverse legs
  if (deedData.calls.length !== fieldTraverse.legs.length) {
    discrepancies.push({
      type: 'CALL_COUNT_MISMATCH',
      severity: 'MEDIUM',
      callIndex: null,
      message: `Deed has ${deedData.calls.length} calls but field traverse has ${fieldTraverse.legs.length} legs`,
      fieldValue: `${fieldTraverse.legs.length} legs`,
      recordValue: `${deedData.calls.length} calls`,
      difference: `${Math.abs(deedData.calls.length - fieldTraverse.legs.length)} difference`,
    });
  }

  // Step 3: Compare each matched pair
  const matchCount = Math.min(deedData.calls.length, fieldTraverse.legs.length);
  for (let i = 0; i < matchCount; i++) {
    const call = deedData.calls[i];
    const leg  = fieldTraverse.legs[i];

    const bearingDiff = (call.bearing !== null && leg.bearing !== undefined)
      ? Math.abs(call.bearing - leg.bearing) * 3600   // Convert degrees to seconds
      : null;
    const distanceDiff = (call.distance !== null)
      ? Math.abs(call.distance - leg.distance)
      : null;

    const bearingOk  = bearingDiff  !== null ? bearingDiff  <= 60   : true;
    const distanceOk = distanceDiff !== null ? distanceDiff <= 0.50 : true;

    comparisons.push({
      deedCallIndex: i,
      fieldLegIndex: i,
      fieldBearing:   leg.bearing,
      fieldDistance:  leg.distance,
      recordBearing:  call.bearing,
      recordDistance: call.distance,
      bearingDiff,
      distanceDiff,
      bearingOk,
      distanceOk,
      overallMatch: bearingOk && distanceOk,
      confidenceContribution: (bearingOk ? 0.5 : 0) + (distanceOk ? 0.5 : 0),
    });

    if (!bearingOk) {
      discrepancies.push({
        type: 'BEARING_MISMATCH',
        severity: bearingDiff! > 300 ? 'HIGH' : 'MEDIUM',
        callIndex: i,
        message: `Call ${i + 1}: bearing differs by ${bearingDiff!.toFixed(0)}"`,
        fieldValue:  formatBearing(leg.bearing, 'SECOND'),
        recordValue: call.bearing !== null ? formatBearing(call.bearing, 'SECOND') : 'N/A',
        difference:  `${bearingDiff!.toFixed(0)} seconds`,
      });
    }

    if (!distanceOk) {
      discrepancies.push({
        type: 'DISTANCE_MISMATCH',
        severity: distanceDiff! > 2.0 ? 'HIGH' : 'MEDIUM',
        callIndex: i,
        message: `Call ${i + 1}: distance differs by ${distanceDiff!.toFixed(2)}'`,
        fieldValue:  `${leg.distance.toFixed(2)}'`,
        recordValue: call.distance !== null ? `${call.distance.toFixed(2)}'` : 'N/A',
        difference:  `${distanceDiff!.toFixed(2)} feet`,
      });
    }
  }

  // Step 4: Compute confidence adjustments per feature
  for (const comp of comparisons) {
    const featureId = fieldTraverse.legs[comp.fieldLegIndex]?.fromPointId;
    if (featureId) {
      const adj = comp.overallMatch ? +15 : (comp.bearingOk || comp.distanceOk ? 0 : -20);
      adjustments.set(featureId, (adjustments.get(featureId) ?? 0) + adj);
    }
  }

  // Step 5: Point group intelligence — both calc and field-verified is a positive signal
  for (const group of pointGroups.values()) {
    if (group.hasBothCalcAndField && group.calcSetDelta !== undefined) {
      const pointId = group.finalPoint?.id;
      if (pointId) {
        adjustments.set(pointId, (adjustments.get(pointId) ?? 0) + 10);
      }
    }
  }

  // Step 6: Compute field closure
  const fieldClosure = computeClosure(fieldTraverse);

  // Step 7: Build record traverse from deed calls
  const recordClosure = deedData.calls.length >= 3
    ? computeRecordClosure(deedData.calls)
    : null;

  // Overall match score
  const matchingCalls = comparisons.filter(c => c.overallMatch).length;
  const overallMatchScore = comparisons.length > 0
    ? Math.round((matchingCalls / comparisons.length) * 100)
    : 50;

  return {
    fieldTraverse,
    recordTraverse: fieldTraverse, // Simplified — full record traverse built separately
    callComparisons: comparisons,
    fieldClosure,
    recordClosure,
    discrepancies,
    overallMatchScore,
    confidenceAdjustments: adjustments,
  };
}
```

---

## 6. Deed PDF/Image Import & OCR

```typescript
// packages/ai-engine/src/deed-ocr.ts

export interface DeedImportResult {
  extractedText: string;
  source: 'PDF_TEXT' | 'PDF_OCR' | 'IMAGE_OCR' | 'PASTED_TEXT';
  confidence: number;                  // OCR confidence 0-1
  pageCount: number;
}

/**
 * Extract text from a deed document.
 * Strategy:
 *   1. If PDF: try pdf-parse for embedded text first (fast, accurate)
 *   2. If PDF text extraction fails or returns little text: OCR with Tesseract
 *   3. If image: OCR with Tesseract directly
 *   4. If pasted text: use as-is
 */
export async function importDeed(
  file: File | null,
  pastedText: string | null,
): Promise<DeedImportResult> {
  if (pastedText) {
    return { extractedText: pastedText, source: 'PASTED_TEXT', confidence: 1.0, pageCount: 1 };
  }

  if (!file) throw new Error('No file or text provided');

  const ext = file.name.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    // Try embedded text first
    const textResult = await extractPDFText(file);
    if (textResult.text.length > 100) {
      return {
        extractedText: textResult.text,
        source: 'PDF_TEXT',
        confidence: 0.95,
        pageCount: textResult.pages,
      };
    }
    // Fall back to OCR
    const ocrResult = await ocrPDF(file);
    return {
      extractedText: ocrResult.text,
      source: 'PDF_OCR',
      confidence: ocrResult.confidence,
      pageCount: ocrResult.pages,
    };
  }

  if (['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp'].includes(ext ?? '')) {
    const ocrResult = await ocrImage(file);
    return {
      extractedText: ocrResult.text,
      source: 'IMAGE_OCR',
      confidence: ocrResult.confidence,
      pageCount: 1,
    };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
```

---

## 7. Deed Call Parser

Uses Claude API to extract structured deed calls from raw text.

```typescript
// packages/ai-engine/src/deed-parser.ts

/**
 * Parse legal description text into structured DeedData.
 *
 * Two-layer approach:
 *   Layer 1: Regex-based parsing for well-formatted metes & bounds
 *   Layer 2: Claude API for ambiguous or poorly formatted text
 *
 * The regex parser handles standard patterns:
 *   "THENCE N 45°30'15" E, a distance of 234.56 feet to a 1/2" iron rod found"
 *   "thence along a curve to the right having a radius of 500.00 feet..."
 *
 * If regex parsing fails or produces low confidence, we send to Claude.
 */

export function parseCallsRegex(text: string): { calls: DeedCall[]; confidence: number } {
  const calls: DeedCall[] = [];
  let callIndex = 0;

  // Match THENCE/thence blocks
  const thencePattern = /THENCE\s+(.*?)(?=THENCE|to the (?:POINT|PLACE) OF BEGINNING|$)/gi;
  let match;

  while ((match = thencePattern.exec(text)) !== null) {
    const block = match[1].trim();
    const call = parseCallBlock(block, callIndex);
    if (call) {
      calls.push(call);
      callIndex++;
    }
  }

  // Confidence based on how many calls were successfully parsed
  const confidence = calls.length > 0
    ? calls.filter(c => c.bearing !== null || c.curveData !== null).length / calls.length
    : 0;

  return { calls, confidence };
}

function parseCallBlock(block: string, index: number): DeedCall | null {
  // Try line call: "N 45°30'15" E, a distance of 234.56 feet"
  const linePattern =
    /([NS])\s*(\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)["\s]*([EW])[\s,]*(?:a\s+)?distance\s+of\s+(\d+\.?\d+)\s*(?:feet|ft|')/i;
  const lineMatch = block.match(linePattern);

  if (lineMatch) {
    const bearing = parseBearing(
      `${lineMatch[1]} ${lineMatch[2]} ${lineMatch[3]} ${lineMatch[4]} ${lineMatch[5]}`
    );
    const distance = parseFloat(lineMatch[6]);
    const monument = extractMonument(block);
    return { index, type: 'LINE', bearing, distance, curveData: null, monument, rawText: block };
  }

  // Try curve call: "along a curve to the right having a radius of..."
  const curvePattern = /curve\s+to\s+the\s+(right|left).*?radius\s+of\s+(\d+\.?\d+)/i;
  const curveMatch = block.match(curvePattern);

  if (curveMatch) {
    const direction = curveMatch[1].toUpperCase() as 'LEFT' | 'RIGHT';
    const radius = parseFloat(curveMatch[2]);

    const arcMatch      = block.match(/arc\s+length\s+of\s+(\d+\.?\d+)/i);
    const chordBrgMatch = block.match(/chord\s+bearing\s+of\s+([NS].*?[EW])/i);
    const chordDistMatch= block.match(/chord\s+distance\s+of\s+(\d+\.?\d+)/i);
    const deltaMatch    = block.match(/central\s+angle\s+of\s+(\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)/i);

    return {
      index, type: 'CURVE',
      bearing: null, distance: null,
      curveData: {
        radius,
        arcLength:     arcMatch       ? parseFloat(arcMatch[1])                                    : null,
        chordBearing:  chordBrgMatch  ? parseBearing(chordBrgMatch[1])                             : null,
        chordDistance: chordDistMatch ? parseFloat(chordDistMatch[1])                              : null,
        deltaAngle:    deltaMatch
          ? dmsToDecimal(parseInt(deltaMatch[1]), parseInt(deltaMatch[2]), parseFloat(deltaMatch[3]))
          : null,
        direction,
      },
      monument: extractMonument(block),
      rawText: block,
    };
  }

  return {
    index, type: 'LINE',
    bearing: null, distance: null, curveData: null,
    monument: extractMonument(block), rawText: block,
  };
}

function extractMonument(text: string): string | null {
  const monPattern =
    /to\s+(?:a\s+)?(\d[\d\/]*["]\s*(?:iron rod|iron pipe|concrete monument|cap|disk|pk nail|mag nail|railroad spike)(?:\s+(?:found|set|calculated))?(?:\s+w\/\s*cap)?)/i;
  const match = text.match(monPattern);
  return match ? match[1] : null;
}

/**
 * Claude-assisted parsing for complex or poorly formatted deeds.
 * Sends the raw text to Claude with a structured extraction prompt.
 */
export async function parseCallsWithClaude(
  rawText: string,
  claudeClient: ClaudeClient,
): Promise<{ calls: DeedCall[]; deedMeta: Partial<DeedData> }> {
  const systemPrompt = `You are a Texas land surveying expert. Extract structured metes and bounds data from the following legal description. Return ONLY valid JSON with no other text.

Format:
{
  "calls": [
    {
      "index": 0,
      "type": "LINE" or "CURVE",
      "bearing_direction1": "N" or "S",
      "bearing_degrees": 45,
      "bearing_minutes": 30,
      "bearing_seconds": 15.0,
      "bearing_direction2": "E" or "W",
      "distance_feet": 234.56,
      "curve_radius": null,
      "curve_arc_length": null,
      "curve_chord_bearing": null,
      "curve_chord_distance": null,
      "curve_delta_degrees": null,
      "curve_direction": null,
      "monument": "1/2 inch iron rod found" or null,
      "raw_text": "original text of this call"
    }
  ],
  "basis_of_bearings": "string or null",
  "beginning_monument": "string or null",
  "county": "string or null",
  "survey": "string or null",
  "abstract": "string or null"
}`;

  const response = await claudeClient.complete(systemPrompt, rawText);
  const parsed = JSON.parse(response);

  const calls: DeedCall[] = parsed.calls.map((c: any) => ({
    index: c.index,
    type:  c.type,
    bearing: c.bearing_degrees !== null
      ? quadrantToAzimuth({
          direction1:  c.bearing_direction1,
          degrees:     c.bearing_degrees,
          minutes:     c.bearing_minutes,
          seconds:     Math.floor(c.bearing_seconds),
          tenthSeconds: Math.round((c.bearing_seconds % 1) * 10),
          direction2:  c.bearing_direction2,
        })
      : null,
    distance:  c.distance_feet,
    curveData: c.curve_radius ? {
      radius:        c.curve_radius,
      arcLength:     c.curve_arc_length,
      chordBearing:  c.curve_chord_bearing ? parseBearing(c.curve_chord_bearing) : null,
      chordDistance: c.curve_chord_distance,
      deltaAngle:    c.curve_delta_degrees,
      direction:     c.curve_direction,
    } : null,
    monument: c.monument,
    rawText:  c.raw_text,
  }));

  return {
    calls,
    deedMeta: {
      basisOfBearings:    parsed.basis_of_bearings,
      beginningMonument:  parsed.beginning_monument,
      county:             parsed.county,
      survey:             parsed.survey,
      abstract:           parsed.abstract,
    },
  };
}
```

---

## 8. Stage 4: Intelligent Placement

```typescript
// packages/ai-engine/src/stage-4-placement.ts

export interface PlacementConfig {
  paperSize: PaperSize;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  scale: number;                       // 1" = X'
  rotation: number;                    // Drawing rotation in degrees (0 = north up)
  centerOffset: Point2D;               // Shift drawing center on sheet
  templateId: string;
}

export function computeOptimalPlacement(
  features: Feature[],
  template: DrawingTemplate | null,
): PlacementConfig {
  const bounds = computeFeatureExtents(features);
  const surveyWidth  = bounds.maxX - bounds.minX;
  const surveyHeight = bounds.maxY - bounds.minY;

  const candidates: (PlacementConfig & { score: number })[] = [];

  const papers: PaperSize[] = ['TABLOID', 'ARCH_C', 'ARCH_D', 'LETTER'];
  const scales = [20, 30, 40, 50, 60, 80, 100, 150, 200];
  const rotations = [0];

  // Find bearing of longest boundary line for potential rotation
  const longestBearing = findLongestBoundaryBearing(features);
  if (longestBearing !== null) {
    rotations.push(-longestBearing); // Rotate so longest line is horizontal
  }

  for (const paper of papers) {
    for (const orient of ['LANDSCAPE', 'PORTRAIT'] as const) {
      const dims    = PAPER_SIZES[paper];
      const pw      = orient === 'LANDSCAPE' ? dims.height : dims.width;
      const ph      = orient === 'LANDSCAPE' ? dims.width  : dims.height;
      const margins = template?.margins ?? { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 };
      const drawW   = pw - margins.left - margins.right - (template?.titleBlock ? 2.5 : 0);
      const drawH   = ph - margins.top  - margins.bottom;

      for (const scale of scales) {
        for (const rot of rotations) {
          const rotRad = rot * Math.PI / 180;
          const cos = Math.abs(Math.cos(rotRad));
          const sin = Math.abs(Math.sin(rotRad));
          const rw = surveyWidth  * cos + surveyHeight * sin;
          const rh = surveyWidth  * sin + surveyHeight * cos;

          const sw = rw / scale;
          const sh = rh / scale;

          if (sw <= drawW && sh <= drawH) {
            const fillRatio = (sw * sh) / (drawW * drawH);

            // Score: prefer larger scale (more detail), then better fill, then smaller paper
            const paperPriority = papers.indexOf(paper);
            const score = (1 / scale) * 10000 + fillRatio * 100 - paperPriority * 50;

            candidates.push({
              paperSize: paper, orientation: orient, scale, rotation: rot,
              centerOffset: { x: 0, y: 0 },
              templateId: template?.id ?? 'default',
              score,
            });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? {
    paperSize: 'TABLOID', orientation: 'LANDSCAPE', scale: 50,
    rotation: 0, centerOffset: { x: 0, y: 0 }, templateId: 'default',
  };
}
```

---

## 9. Stage 5: Label Optimization (AI-Aware)

Reuses the Phase 5 label optimizer but adds AI-specific behavior: labels generated by the AI pipeline are tagged with their source feature's confidence, so the optimizer knows to spend more effort on high-confidence labels (they're more likely to survive review).

The optimizer from Phase 5 §10 runs as-is. The AI pipeline calls it with the generated annotations.

---

## 10. Stage 6: Confidence Scoring

```typescript
// packages/ai-engine/src/stage-6-confidence.ts

export interface ConfidenceFactors {
  codeClarity:            number;      // 0-1, weight 0.25
  coordinateValidity:     number;      // 0-1, weight 0.20
  deedRecordMatch:        number;      // 0-1, weight 0.25
  contextualConsistency:  number;      // 0-1, weight 0.15
  closureQuality:         number;      // 0-1, weight 0.10
  curveDataCompleteness:  number;      // 0-1, weight 0.05
}

export interface ConfidenceScore {
  score:   number;                     // 0-100
  tier:    1 | 2 | 3 | 4 | 5;
  factors: ConfidenceFactors;
  flags:   string[];                   // Human-readable explanations
}

export function computeConfidence(factors: ConfidenceFactors): number {
  return Math.round(
    factors.codeClarity           * 25 +
    factors.coordinateValidity    * 20 +
    factors.deedRecordMatch       * 25 +
    factors.contextualConsistency * 15 +
    factors.closureQuality        * 10 +
    factors.curveDataCompleteness *  5
  );
}

export function getTier(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 95) return 5;
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

export function scoreAllElements(
  features:       Feature[],
  classified:     ClassificationResult[],
  reconciliation: ReconciliationResult | null,
  pointGroups:    Map<number, PointGroup>,
  closure:        ClosureResult | null,
): Map<string, ConfidenceScore> {
  const scores = new Map<string, ConfidenceScore>();

  for (const feature of features) {
    const factors: ConfidenceFactors = {
      codeClarity:            1.0,
      coordinateValidity:     1.0,
      deedRecordMatch:        reconciliation ? 0.5 : 0.7, // Default mid when no deed
      contextualConsistency:  1.0,
      closureQuality:         0.5,
      curveDataCompleteness:  1.0,
    };
    const flags: string[] = [];

    // ── Code clarity ──
    const relatedPoints = classified.filter(c => feature.pointIds?.includes(c.point.id));
    for (const cp of relatedPoints) {
      if (cp.flags.includes('UNRECOGNIZED_CODE'))     { factors.codeClarity -= 0.40; flags.push('Unrecognized code'); }
      if (cp.flags.includes('AMBIGUOUS_CODE'))        { factors.codeClarity -= 0.20; flags.push('Ambiguous code'); }
      if (cp.flags.includes('NAME_SUFFIX_AMBIGUOUS')) { factors.codeClarity -= 0.15; flags.push('Ambiguous name suffix'); }
      if (cp.flags.includes('MONUMENT_NO_ACTION'))    { factors.codeClarity -= 0.10; flags.push('Monument without action indicator'); }
    }
    factors.codeClarity = Math.max(0, factors.codeClarity);

    // ── Coordinate validity ──
    for (const cp of relatedPoints) {
      if (cp.flags.includes('ZERO_COORDINATES'))      { factors.coordinateValidity  = 0;    flags.push('Zero coordinates'); }
      if (cp.flags.includes('COORDINATE_OUTLIER'))    { factors.coordinateValidity -= 0.50; flags.push('Coordinate outlier'); }
      if (cp.flags.includes('DUPLICATE_POINT_NUMBER')){ factors.coordinateValidity -= 0.20; flags.push('Duplicate point number'); }
    }
    factors.coordinateValidity = Math.max(0, factors.coordinateValidity);

    // ── Deed record match ──
    if (reconciliation) {
      const adj = reconciliation.confidenceAdjustments.get(feature.id);
      if (adj !== undefined) {
        factors.deedRecordMatch = Math.max(0, Math.min(1, 0.5 + adj / 100));
      }
      const relatedComps = reconciliation.callComparisons.filter(c =>
        feature.pointIds?.includes(
          reconciliation.fieldTraverse.legs[c.fieldLegIndex]?.fromPointId
        )
      );
      if (relatedComps.length > 0) {
        const avgMatch = relatedComps.reduce((s, c) => s + c.confidenceContribution, 0) / relatedComps.length;
        factors.deedRecordMatch = avgMatch;
        if (avgMatch < 0.5) flags.push('Poor deed/field match');
      }
    }

    // ── Contextual consistency ──
    for (const cp of relatedPoints) {
      const group = pointGroups.get(cp.point.parsedName.baseNumber);
      if (group?.hasBothCalcAndField) {
        factors.contextualConsistency = Math.min(1, factors.contextualConsistency + 0.15);
      }
      if (group && !group.found && !group.set && group.calculated.length > 0) {
        factors.contextualConsistency -= 0.20;
        flags.push('Only calculated position (no field verification)');
      }
      if (group?.deltaWarning) {
        factors.contextualConsistency -= 0.10;
        flags.push(`Calc-to-field delta > 0.10' (${group.calcSetDelta?.toFixed(3)}')`);
      }
    }
    factors.contextualConsistency = Math.max(0, Math.min(1, factors.contextualConsistency));

    // ── Closure quality ──
    if (closure) {
      if      (closure.precisionDenominator >= 15000) factors.closureQuality = 1.0;
      else if (closure.precisionDenominator >= 10000) factors.closureQuality = 0.8;
      else if (closure.precisionDenominator >=  5000) factors.closureQuality = 0.5;
      else                                             factors.closureQuality = 0.2;
    }

    // ── Curve data completeness ──
    if (feature.geometry.type === 'ARC' || feature.geometry.type === 'MIXED_GEOMETRY') {
      factors.curveDataCompleteness = 0.7; // Default for fitted arcs (not deed-specified)
    }

    const score = computeConfidence(factors);
    scores.set(feature.id, { score, tier: getTier(score), factors, flags });
  }

  return scores;
}
```

---

## 11. Confidence Tier System

| Tier | Score | Visual | Behavior |
|------|-------|--------|----------|
| ★★★★★ | 95–100% | Green glow | Auto-accepted. Listed for reference only. |
| ★★★★☆ | 80–94% | Yellow-green | Auto-placed. User confirms in review queue. |
| ★★★☆☆ | 60–79% | Orange glow | Placed tentatively. Requires user review. |
| ★★☆☆☆ | 40–59% | Red glow | Placed tentatively. User MUST decide. |
| ★☆☆☆☆ | 0–39% | Dark red, NOT placed | Listed in unresolved queue for manual handling. |

Visual treatment on canvas: each feature's glow color corresponds to its tier. The glow fades after the user accepts the item.

---

## 12. Point Group Intelligence in AI Context

The AI engine leverages Phase 2's point grouping to make intelligent decisions.

```typescript
// Within the AI pipeline, point groups affect:

// 1. FEATURE ASSEMBLY: Only the "final" point (SET > FOUND > latest CALC) is drawn.
//    Non-final points are stored but rendered with 40% opacity in "show all positions" mode.

// 2. CONFIDENCE SCORING:
//    - Both calc and field-verified   → +15% contextual consistency
//    - Only calc (no field verification) → -20% contextual consistency
//    - Calc-to-set delta > 0.10'      → -10% and flagged for review

// 3. REVIEW QUEUE: Each point group with multiple positions gets a special review item:
export interface PointGroupReviewInfo {
  baseNumber: number;
  positions: {
    label: string;                     // "20calc", "20cald", "20set", "20fnd"
    action: MonumentAction;
    northing: number;
    easting: number;
    isRecalc: boolean;
    recalcSequence: number;
  }[];
  usedPosition: string;                // Which was chosen as "final"
  usedReason: string;                  // "SET chosen (priority: SET > FOUND > CALC)"
  calcSetDelta: number | null;
  calcFoundDelta: number | null;
  deltaWarning: boolean;
  alternateChoice: string | null;      // "Use FOUND instead" suggestion if delta is large
}
```

---

## 13. AI Review Queue Data Model

```typescript
// packages/ai-engine/src/review-queue.ts

export interface AIReviewQueue {
  tiers: {
    5: ReviewItem[];                   // 95-100%
    4: ReviewItem[];                   // 80-94%
    3: ReviewItem[];                   // 60-79%
    2: ReviewItem[];                   // 40-59%
    1: ReviewItem[];                   //  0-39%
  };
  summary: {
    totalElements:  number;
    acceptedCount:  number;
    modifiedCount:  number;
    rejectedCount:  number;
    pendingCount:   number;
  };
}

export interface ReviewItem {
  id: string;
  featureId: string | null;            // null for unplaced items (tier 1)
  pointIds: string[];
  annotationIds: string[];             // Related annotations

  // Display
  title:       string;                 // "Chain Link Fence (5 points)"
  description: string;                 // "Line from point 6 to point 10"
  category:    string;                 // "Boundary", "Fence", "Utility", etc.
  confidence:  number;
  tier:        1 | 2 | 3 | 4 | 5;

  // Issues
  flags:        string[];
  discrepancies: Discrepancy[];

  // Point group info (for boundary monuments)
  pointGroupInfo: PointGroupReviewInfo | null;

  // Reconciliation data (for boundary lines)
  callComparison: CallComparison | null;

  // User actions
  status:          'PENDING' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED';
  userNote:         string | null;
  modifiedFeature:  Feature | null;    // Stored if user modifies the feature
}

export function buildReviewQueue(
  features:       Feature[],
  scores:         Map<string, ConfidenceScore>,
  classified:     ClassificationResult[],
  pointGroups:    Map<number, PointGroup>,
  reconciliation: ReconciliationResult | null,
): AIReviewQueue {
  const queue: AIReviewQueue = {
    tiers: { 5: [], 4: [], 3: [], 2: [], 1: [] },
    summary: {
      totalElements: 0, acceptedCount: 0,
      modifiedCount: 0, rejectedCount: 0, pendingCount: 0,
    },
  };

  for (const feature of features) {
    const score = scores.get(feature.id);
    if (!score) continue;

    const item: ReviewItem = {
      id:          generateId(),
      featureId:   feature.id,
      pointIds:    feature.pointIds ?? [],
      annotationIds: [],
      title:       buildTitle(feature, classified),
      description: buildDescription(feature, classified),
      category:    feature.layerId,
      confidence:  score.score,
      tier:        score.tier,
      flags:       score.flags,
      discrepancies: reconciliation?.discrepancies.filter(d =>
        feature.pointIds?.some(pid =>
          reconciliation.fieldTraverse.legs.some(l => l.fromPointId === pid)
        )
      ) ?? [],
      pointGroupInfo: buildPointGroupInfo(feature, pointGroups),
      callComparison: null,
      status: score.tier === 5 ? 'ACCEPTED' : 'PENDING',
      userNote:        null,
      modifiedFeature: null,
    };

    queue.tiers[score.tier].push(item);
    queue.summary.totalElements++;
    if (item.status === 'ACCEPTED') queue.summary.acceptedCount++;
    else                            queue.summary.pendingCount++;
  }

  return queue;
}
```

---

## 14. AI Review Queue UI

```
┌─ AI Review Queue ──────────────── Progress: 45/120 ─────────────┐
│                                                                  │
│ ┌─ Batch Actions ──────────────────────────────────────────────┐ │
│ │ [✓ Accept All ★★★★★]  [✓ Accept ≥★★★★]  [✗ Reject All ★]  │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ▼ ★★★★★ Auto-Accepted (38)                          ✓ all      │
│   ┊ ✓ Chain Link Fence (5pts)              98%                  │
│   ┊ ✓ 1/2" Iron Rod Found #20             97%                  │
│   ┊ ✓ Boundary Line N45°30'15"E 234.56'   96%                  │
│   ┊ ...                                                         │
│                                                                  │
│ ▼ ★★★★☆ Confirm (32)                                           │
│   ┊ ○ Wood Privacy Fence (8pts)            87%                  │
│   ┊   ⚠ Code suffix ambiguous                                  │
│   ┊ ○ Boundary Line S30°15'E 156.78'      82%  📋              │
│   ┊   ⚠ Distance differs by 0.35' from deed                    │
│   ┊ ...                                                         │
│                                                                  │
│ ▼ ★★★☆☆ Review Required (18)                                   │
│   ┊ ○ Point #35 (Unknown Code)             65%  ❓              │
│   ┊   ⚠ Unrecognized code "MISC"                               │
│   ┊ ○ Monument Group #20                   62%  🔀              │
│   ┊   ├ 20calc (2145123.2, 598234.5)                           │
│   ┊   ├ 20cald (2145123.3, 598234.6)                           │
│   ┊   ├ 20set ★ (2145123.5, 598234.8)  ← used                 │
│   ┊   └ Δ calc→set: 0.32' ⚠ > 0.10'                           │
│   ┊ ...                                                         │
│                                                                  │
│ ▼ ★★☆☆☆ Action Required (8)                                    │
│   ┊ ○ Boundary Curve (3pts)                45%  ⚠              │
│   ┊   ⚠ Bearing mismatch 245" from deed                        │
│   ┊   ⚠ Closure 1:3,200                                        │
│   ┊ ...                                                         │
│                                                                  │
│ ▼ ★☆☆☆☆ Not Placed (4)                                         │
│   ┊ ✗ Point #99 — Zero coordinates         12%                 │
│   ┊ ✗ Point #100 — Coordinate outlier       8%                 │
│   ┊ ...                                                         │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AI Instructions: [Type corrections or guidance here...]     │ │
│ │                                                [Re-Process] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Per-item actions (visible on hover / click):
`[✓ Accept]  [✏️ Modify]  [✗ Reject]  [🔍 Zoom To]`

Click any item → viewport zooms to that feature, highlights it in blue.
Monument groups show calc/set/found positions with radio buttons to pick which to use.

---

## 15. Review Actions & Workflow

| Action | Effect |
|--------|--------|
| Accept | Feature stays as-is. Status → ACCEPTED. Glow fades. |
| Modify | Opens property panel with that feature selected. User edits, then confirms. Status → MODIFIED. |
| Reject | Feature removed from drawing. Status → REJECTED. Annotations removed too. |
| Zoom To | Viewport pans and zooms to center the feature. Feature highlighted. |
| Batch Accept ★★★★★ | Accepts all tier 5 items at once. |
| Batch Accept ≥ ★★★★ | Accepts tiers 4 and 5. |
| Batch Reject ★ | Rejects all tier 1 (unplaced) items. |
| Change Group Position | For monument groups: switches from SET to FOUND or CALC, recomputes feature. |

---

## 16. AI Prompt Input & Re-Processing

The user can type free-text instructions that are sent to Claude for re-processing:

```
Example prompts:
  "The fence along the south boundary should connect points 6 through 12"
  "Point 20 is a 5/8 iron rod found, not a 1/2"
  "Rotate the drawing so the north boundary is horizontal"
  "Use 1:40 scale instead of 1:50"
  "The deed call #3 should be S 30°15'00\" E not S 30°15'00\" W"
```

Re-processing runs stages 2–6 again (classification stays, unless the user corrected a code). The updated result replaces the current drawing state, and the review queue resets with new scores.

---

## 17. Claude API Integration

```typescript
// packages/ai-worker/src/claude-client.ts

import Anthropic from '@anthropic-ai/sdk';

export class ClaudeClient {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n');
  }

  async completeDeedExtraction(rawText: string): Promise<DeedData> {
    const result = await parseCallsWithClaude(rawText, this);
    return {
      source: 'DEED_PDF',
      rawText,
      calls:  result.calls,
      curves: result.calls.filter(c => c.curveData).map(c => c.curveData!),
      ...result.deedMeta,
    } as DeedData;
  }

  async completeReprocessing(
    currentState: AIJobPayload,
    userInstructions: string,
  ): Promise<AIJobResult> {
    const systemPrompt = buildReprocessingPrompt(currentState);
    const response = await this.complete(systemPrompt, userInstructions);
    return JSON.parse(response);
  }
}
```

---

## 18. DigitalOcean Worker Architecture

```
┌─ Client (Vercel/Browser) ─┐     ┌─ Worker (DigitalOcean Droplet) ──┐
│                            │     │                                   │
│  1. User uploads field file│     │  Express server on port 3001      │
│  2. User uploads deed      │────▶│                                   │
│  3. POST /api/ai/start     │     │  POST /job                        │
│     (payload: points,      │     │    → Receives payload              │
│      deed, prompt,         │     │    → Runs 6-stage pipeline         │
│      template)             │     │    → Calls Claude API as needed    │
│                            │     │    → Returns JSON result           │
│  4. Poll GET /api/ai/status│     │                                   │
│     until complete         │◀────│  GET /job/:id/status              │
│                            │     │    → Returns progress + partial    │
│  5. Apply result to drawing│     │                                   │
│                            │     │  No time limit (unlike Vercel)     │
└────────────────────────────┘     └───────────────────────────────────┘
```

The worker is a persistent Express server, not serverless. It handles multi-minute processing for large surveys. Authentication is via a shared API key between the Vercel frontend and the DigitalOcean worker.

---

## 19. AI Job Payload & Result

```typescript
// packages/ai-engine/src/types.ts

export interface AIJobPayload {
  // Input data
  points:     SurveyPoint[];
  deedData:   DeedData | null;
  fieldNotes: string | null;
  userPrompt: string | null;
  answers:    ClarifyingQuestion[];   // Answers from the question dialog (empty on first run)

  // Configuration
  templateId:        string | null;   // null = auto-select
  coordinateSystem:  string;          // "NAD83_TX_CENTRAL"
  codeLibrary:       PointCodeDefinition[];
  customSymbols:     SymbolDefinition[];
  customLineTypes:   LineTypeDefinition[];

  // Options
  autoSelectScale:          boolean;
  autoSelectOrientation:    boolean;
  generateLabels:           boolean;
  optimizeLabels:           boolean;
  includeConfidenceScoring: boolean;
}

export interface AIJobResult {
  // Drawing specification
  features:    Feature[];
  annotations: AnnotationBase[];
  placement:   PlacementConfig;

  // Intelligence
  classified:       ClassificationResult[];
  pointGroups:      PointGroup[];
  reconciliation:   ReconciliationResult | null;
  reviewQueue:      AIReviewQueue;
  scores:           Record<string, ConfidenceScore>; // Map serialized as Record
  explanations:     Record<string, ElementExplanation>; // featureId → explanation

  // Offset resolution
  offsetResolution: OffsetResolutionResult | null;

  // Online enrichment
  enrichmentData:   EnrichmentData | null;

  // Deliberation
  deliberationResult: DeliberationResult | null;

  // Metadata
  processingTimeMs: number;
  stageTimings:     Record<string, number>;
  warnings:         string[];
  version:          number;         // Increments with each re-analyze
}
```

---

## 20. Worker Pipeline Orchestration

```typescript
// packages/ai-worker/src/job-handler.ts

export async function processAIJob(
  payload:    AIJobPayload,
  claudeClient: ClaudeClient,
  onProgress: (stage: string, percent: number) => void,
): Promise<AIJobResult> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // ── Stage 1: Classify ──
  onProgress('Classifying points...', 10);
  let t = Date.now();
  const classified = classifyPoints(payload.points);
  timings['classify'] = Date.now() - t;

  // ── Build point groups ──
  onProgress('Building point groups...', 15);
  const pointGroups = groupPointsByBaseName(payload.points);

  // ── Stage 2: Assemble ──
  onProgress('Assembling features...', 25);
  t = Date.now();
  const assembled = assembleFeatures(classified, pointGroups);
  timings['assemble'] = Date.now() - t;

  // ── Stage 3: Reconcile (if deed provided) ──
  let reconciliation: ReconciliationResult | null = null;
  if (payload.deedData) {
    onProgress('Reconciling with deed...', 40);
    t = Date.now();

    // If deed text needs Claude parsing
    if (payload.deedData.calls.length === 0 && payload.deedData.rawText) {
      const parsed = await parseCallsWithClaude(payload.deedData.rawText, claudeClient);
      payload.deedData.calls = parsed.calls;
      Object.assign(payload.deedData, parsed.deedMeta);
    }

    // Build field traverse from boundary features
    const boundaryPoints = classified.filter(c =>
      c.resolvedCode?.category === 'BOUNDARY_CONTROL' ||
      c.resolvedCode?.category === 'PROPERTY_LINES'
    );
    if (boundaryPoints.length >= 3) {
      const fieldTraverse = createTraverse(
        boundaryPoints.map(c => c.point.id),
        new Map(payload.points.map(p => [p.id, p])),
        true,
      );
      reconciliation = reconcileDeed(
        fieldTraverse, payload.deedData, payload.points, pointGroups
      );
    }
    timings['reconcile'] = Date.now() - t;
  }

  // ── Stage 4: Place ──
  onProgress('Computing optimal placement...', 60);
  t = Date.now();
  const allFeatures = [
    ...assembled.pointFeatures,
    ...assembled.closedPolygons,
    ...assembled.curveFeatures,
    ...assembled.splineFeatures,
    ...assembled.mixedGeometryFeatures,
  ];
  const placement = payload.autoSelectScale
    ? computeOptimalPlacement(allFeatures, null)
    : {
        paperSize: 'TABLOID' as PaperSize,
        orientation: 'LANDSCAPE' as const,
        scale: 50, rotation: 0,
        centerOffset: { x: 0, y: 0 },
        templateId: payload.templateId ?? 'default',
      };
  timings['placement'] = Date.now() - t;

  // ── Generate annotations ──
  onProgress('Generating annotations...', 70);
  const annotations = autoAnnotate(allFeatures, payload.points, [], {
    bearingDim:    defaultBearingDimConfig(),
    curveData:     defaultCurveDataConfig(),
    monumentLabel: defaultMonumentLabelConfig(),
    areaLabel:     defaultAreaLabelConfig(),
    generateBearingDims:     payload.generateLabels,
    generateCurveData:       payload.generateLabels,
    generateMonumentLabels:  payload.generateLabels,
    generateAreaLabels:      payload.generateLabels,
    boundaryLayerIds: ['BOUNDARY', 'ROW', 'EASEMENT'],
    monumentLayerIds: ['BOUNDARY-MON'],
  });

  // ── Stage 5: Optimize labels ──
  if (payload.optimizeLabels) {
    onProgress('Optimizing labels...', 80);
    t = Date.now();
    optimizeLabels(annotations, allFeatures, placement);
    timings['labels'] = Date.now() - t;
  }

  // ── Stage 6: Score confidence ──
  onProgress('Scoring confidence...', 90);
  t = Date.now();
  const closure = reconciliation?.fieldClosure ?? null;
  const scores = scoreAllElements(allFeatures, classified, reconciliation, pointGroups, closure);
  timings['confidence'] = Date.now() - t;

  // ── Build review queue ──
  onProgress('Building review queue...', 95);
  const reviewQueue = buildReviewQueue(
    allFeatures, scores, classified, pointGroups, reconciliation
  );

  onProgress('Complete', 100);

  return {
    features: allFeatures,
    annotations,
    placement,
    classified,
    pointGroups: Array.from(pointGroups.values()),
    reconciliation,
    reviewQueue,
    scores: Object.fromEntries(scores),
    processingTimeMs: Date.now() - startTime,
    stageTimings: timings,
    warnings: assembled.warnings.map(w => w.message),
  };
}
```

---

## 21. Error Handling & Fallbacks

| Failure | Fallback |
|---------|----------|
| Claude API timeout | Retry once. If fails again, skip deed parsing, use regex-only results. |
| Claude API error | Return partial result (stages 1–2 only, no reconciliation). |
| OCR fails on deed PDF | Prompt user to paste text manually. |
| Deed parsing produces 0 calls | Set reconciliation = null, skip stage 3, note in warnings. |
| Worker unreachable | Run stages 1–2 client-side (TypeScript, no API needed). Skip 3–6, manual placement. |
| Single point with arc suffix | Flag as warning, skip arc fitting for that point. |
| Closure > 1:1000 | Flag as CRITICAL discrepancy, reduce all boundary confidence by 30%. |

---

## 22. AI-Assisted Feature Editing

When the user clicks **Modify** on a review item, the AI can suggest corrections:

- **Code change suggestion:** "This point was coded as UT03 (Fire Hydrant) but it's surrounded by boundary monuments. Did you mean BC02 (1/2" IR Found)?"
- **Layer reassignment:** "This fence line is on the MISC layer. Move to FENCE?"
- **Position correction:** "Point #20 calc→set delta is 0.32'. The SET position (2145123.5, 598234.8) is recommended."
- **Connection fix:** "Points 6–10 have fence codes but no B/E suffixes. Should they be connected as a chain link fence line?"

These suggestions appear in a tooltip or sidebar when the user hovers over flagged items.

---

## 23. State Management Updates

### 23.1 AI Store (NEW)

```typescript
interface AIStore {
  // Job state
  isProcessing:   boolean;
  currentJobId:   string | null;
  progress:       { stage: string; percent: number };

  // Input
  deedData:   DeedData | null;
  userPrompt: string | null;

  // Result
  result:           AIJobResult | null;
  reviewQueue:      AIReviewQueue | null;
  confidenceScores: Map<string, ConfidenceScore>;

  // Actions
  startJob:     (payload: AIJobPayload) => Promise<void>;
  cancelJob:    () => void;
  setDeedData:  (data: DeedData | null) => void;
  setUserPrompt:(prompt: string | null) => void;
  applyResult:  (result: AIJobResult) => void;

  // Review actions
  acceptItem:          (itemId: string) => void;
  rejectItem:          (itemId: string) => void;
  modifyItem:          (itemId: string, modifiedFeature: Feature) => void;
  batchAccept:         (minTier: number) => void;
  batchReject:         (maxTier: number) => void;
  changeGroupPosition: (itemId: string, pointId: string) => void;

  // Re-processing
  reprocess: (instructions: string) => Promise<void>;
}
```

---

## 24. Acceptance Tests

### Point Classification (Stage 1)
- [ ] All recognized codes classified with correct definitions
- [ ] Unrecognized codes flagged
- [ ] Duplicate point numbers detected
- [ ] Zero coordinates flagged
- [ ] Coordinate outliers detected
- [ ] Name suffix ambiguity flagged when confidence < 80%

### Feature Assembly (Stage 2)
- [ ] B/E suffixes build correct line strings
- [ ] Auto-spline codes produce spline features
- [ ] A-suffix sequences produce arc features via Kasa fit
- [ ] Closed boundary lines detected
- [ ] Unclosed boundary within 1.0' flagged as warning
- [ ] Only "final" points from groups used for features

### Deed Reconciliation (Stage 3)
- [ ] Regex parser extracts correct bearings/distances from standard format
- [ ] Claude parser handles non-standard deed text
- [ ] Bearing differences > 60" flagged as BEARING_MISMATCH
- [ ] Distance differences > 0.50' flagged as DISTANCE_MISMATCH
- [ ] Call count mismatch detected
- [ ] Overall match score computed correctly

### Placement (Stage 4)
- [ ] Auto-selects smallest paper that fits at largest scale
- [ ] Landscape preferred for wider-than-tall surveys
- [ ] Rotation by longest boundary bearing improves fill ratio

### Confidence Scoring (Stage 6)
- [ ] Score 100 for perfect data (all factors = 1.0)
- [ ] Unrecognized code drops codeClarity by 0.4
- [ ] No deed data → deedRecordMatch defaults to 0.7
- [ ] Good closure (1:15000+) → closureQuality = 1.0
- [ ] Point group with both calc and field → +15% consistency
- [ ] Point group with only calc → -20% consistency
- [ ] Tier assignment: 95–100=5, 80–94=4, 60–79=3, 40–59=2, 0–39=1

### Review Queue
- [ ] Tier 5 items auto-accepted
- [ ] All other tiers start as PENDING
- [ ] Click item zooms viewport to feature
- [ ] Accept/Modify/Reject buttons work per item
- [ ] Batch accept ★★★★★ accepts all tier 5
- [ ] Batch accept ≥★★★★ accepts tiers 4+5
- [ ] Monument group shows all calc/set/found positions
- [ ] Changing group position updates the drawn feature

### Worker
- [ ] Worker accepts POST payload and returns result
- [ ] Progress polling works (10%, 25%, 40%, etc.)
- [ ] Claude API called for deed parsing
- [ ] Timeout handling: retry once, then partial result
- [ ] Worker handles 500+ point files without crash

---

## 25. Build Order (Implementation Sequence)

### Week 1–2: Core Pipeline (Stages 1–2)
- Create `packages/ai-engine` package
- Define all AI types (`ClassificationResult`, `FeatureAssemblyResult`, `DeedData`, etc.)
- Build `stage-1-classify.ts` (reuse Phase 2 parsers + add AI flags)
- Build `stage-2-assemble.ts` (feature assembly with Kasa circle fit)
- Build `selectFinalPoints` (point group → final point resolution)
- Write unit tests for classification and assembly

### Week 3: Deed System (Stage 3)
- Build `deed-parser.ts` (regex-based call extraction)
- Build deed call parsing for lines and curves
- Build monument text extraction
- Build `stage-3-reconcile.ts` (field vs record comparison)
- Build discrepancy detection and confidence adjustments
- Write unit tests with sample legal descriptions
- Test with real Bell County deed text

### Week 4: Placement & Scoring (Stages 4–6)
- Build `stage-4-placement.ts` (optimal paper/scale/orientation)
- Build `stage-5-labels.ts` (wrapper calling Phase 5 optimizer)
- Build `stage-6-confidence.ts` (6-factor scoring system)
- Build confidence tier assignment
- Build `review-queue.ts` (tier-grouped queue construction)
- Write unit tests for scoring and tier assignment

### Week 5: Worker
- Create `packages/ai-worker` package
- Build Express server with `/job` endpoint
- Build `claude-client.ts` (Anthropic SDK wrapper)
- Build `job-handler.ts` (pipeline orchestration with progress)
- Build `deed-ocr.ts` (PDF text extraction + Tesseract fallback)
- Build `prompt-builder.ts` (system prompts for Claude)
- Build Claude-assisted deed parsing (`parseCallsWithClaude`)
- Test worker locally with sample data
- Deploy to DigitalOcean droplet

### Week 6–7: Review Queue UI
- Build `AIDrawingDialog` component (file upload + deed upload + prompt + start)
- Build `AIProgressPanel` (live progress bar per stage)
- Build `ReviewQueue` panel (tier-grouped list)
- Build `ReviewItem` component (title, confidence badge, flags, actions)
- Build `ReviewPointGroup` component (calc/set/found viewer with position picker)
- Build `ReviewBatchActions` (batch accept/reject buttons)
- Build `ConfidenceBadge` (star + percentage + color)
- Build `AIPromptInput` (re-processing text area)

### Week 8: Integration
- Build `AIStore` (Zustand store for all AI state)
- Wire AI result into drawing document (apply features, annotations, placement)
- Wire review actions into drawing (accept keeps, reject removes, modify edits)
- Implement canvas confidence glow per feature
- Wire "Zoom To" from review queue to viewport
- Implement re-processing workflow (user prompt → re-run stages 2–6)

### Week 9–10: Testing & Polish
- End-to-end test: CSV import → AI pipeline → review → accept → print
- Test with real Starr Surveying field files
- Test deed reconciliation with real Bell County deeds
- Test Claude API integration with various deed formats
- Test worker under load (multiple simultaneous jobs)
- Run ALL acceptance tests from Section 24
- Performance test: 500+ points, 50+ features
- Fix failures, polish UI, handle edge cases

---

---

## 26. Dynamic Offset Resolution

### 26.1 Overview

When a field crew cannot physically occupy a corner (e.g., the monument is in the middle of a road, under water, or behind a wall), they shoot an **offset point** nearby and record the offset distance and direction. The AI engine must detect these shots and compute the **true position** of the actual monument before drawing.

### 26.2 Offset Encoding Formats

Offsets are encoded in four places the parser must check:

| Source | Example | Pattern |
|--------|---------|---------|
| Code suffix | `BC02_10R` | `_{distance}{direction}` appended to base code |
| Point description | `"OFFSET 10' LT"` or `"10L BC02"` | Free-text, parsed with regex + Claude |
| Field notes file | `"Pt 35: shot 5.5' to the right of iron rod"` | Attached notes, Claude-extracted |
| Companion point pair | Pts 35 and 35off | Two points with matching base name, one flagged `off`/`offset` |

Direction tokens:
- `L` / `LT` / `LEFT` → perpendicular left of direction of travel
- `R` / `RT` / `RIGHT` → perpendicular right
- `FWD` / `F` → inline forward along bearing
- `BCK` / `B` → inline backward
- `{bearing}` e.g. `N45E 10.0` → absolute bearing + distance

### 26.3 Data Model

```typescript
// packages/ai-engine/src/offset-resolver.ts

export interface OffsetShot {
  offsetPointId:  string;           // The physically shot point
  truePointId:    string;           // Computed true position (new virtual point)
  offsetDistance: number;           // Feet
  offsetDirection: OffsetDirection;
  resolutionMethod: 'SUFFIX' | 'DESCRIPTION' | 'FIELD_NOTES' | 'COMPANION_PAIR';
  confidence: number;               // 0–100: how sure are we of the offset data?
  requiresUserConfirmation: boolean; // true when confidence < 80
}

export type OffsetDirection =
  | { type: 'PERPENDICULAR_LEFT' }
  | { type: 'PERPENDICULAR_RIGHT' }
  | { type: 'INLINE_FORWARD' }
  | { type: 'INLINE_BACKWARD' }
  | { type: 'BEARING'; bearingAzimuth: number };  // absolute direction

export interface OffsetResolutionResult {
  resolvedShots: OffsetShot[];
  truePoints: SurveyPoint[];         // Virtual true-position points added to the dataset
  ambiguousShots: OffsetShot[];      // Shots needing clarification from the user
  unresolvedPointIds: string[];      // Points that look offset but couldn't be parsed
}
```

### 26.4 Resolution Algorithm

```typescript
export function resolveOffsets(
  points: SurveyPoint[],
  fieldNotes: string | null,
  claudeClient: ClaudeClient,
): Promise<OffsetResolutionResult> {
  // Step 1: Detect offset candidates from code suffixes
  const suffixOffsets = detectSuffixOffsets(points);

  // Step 2: Detect from point description text
  const descOffsets = detectDescriptionOffsets(points);

  // Step 3: Detect companion pairs (pt N and pt Noff)
  const pairOffsets = detectCompanionPairs(points);

  // Step 4: Claude-assisted detection from field notes
  const noteOffsets = fieldNotes
    ? await detectFieldNoteOffsets(fieldNotes, points, claudeClient)
    : [];

  const all = [...suffixOffsets, ...descOffsets, ...pairOffsets, ...noteOffsets];
  const deduplicated = deduplicateOffsets(all);   // same point from multiple sources → merge

  // Step 5: Compute true positions
  const truePoints: SurveyPoint[] = [];
  const ambiguous: OffsetShot[] = [];

  for (const shot of deduplicated) {
    const offsetPt = points.find(p => p.id === shot.offsetPointId)!;
    const referenceBearing = computeReferenceBearing(offsetPt, points); // bearing of the line the offset is measured from

    if (referenceBearing === null && shot.offsetDirection.type !== 'BEARING') {
      shot.requiresUserConfirmation = true;
      ambiguous.push(shot);
      continue;
    }

    const truePos = applyOffset(offsetPt, shot.offsetDistance, shot.offsetDirection, referenceBearing);
    const truePt: SurveyPoint = {
      ...offsetPt,
      id:       generateId(),
      name:     offsetPt.name.replace(/off(set)?$/i, ''),
      easting:  truePos.x,
      northing: truePos.y,
      properties: { ...offsetPt.properties, resolvedFromOffset: offsetPt.id },
    };
    truePoints.push(truePt);
    shot.truePointId = truePt.id;
  }

  return {
    resolvedShots: deduplicated.filter(s => !s.requiresUserConfirmation),
    truePoints,
    ambiguousShots: ambiguous,
    unresolvedPointIds: detectUnresolvedOffsetIndicators(points, deduplicated),
  };
}
```

### 26.5 Perpendicular Offset Computation

```typescript
/**
 * Apply a perpendicular left/right offset to a shot point.
 * referenceBearing: azimuth of the survey line the offset is measured from.
 * L = 90° CCW from bearing, R = 90° CW.
 */
function applyPerpendicularOffset(
  pt: SurveyPoint,
  distance: number,
  side: 'LEFT' | 'RIGHT',
  referenceBearing: number,   // azimuth degrees
): Point2D {
  const perpBearing = side === 'LEFT'
    ? (referenceBearing - 90 + 360) % 360
    : (referenceBearing + 90) % 360;
  return applyBearingDistance(pt, distance, perpBearing);
}

function applyBearingDistance(pt: SurveyPoint, dist: number, az: number): Point2D {
  const rad = az * Math.PI / 180;
  return {
    x: pt.easting  + dist * Math.sin(rad),
    y: pt.northing + dist * Math.cos(rad),
  };
}
```

### 26.6 Integration into Stage 1 (Classification)

Dynamic offset resolution runs **before** feature assembly (Stage 2). The resolved true-position points replace their offset counterparts in the working dataset. The original offset points are retained in the model with `isOffsetShot: true` and are rendered at 40% opacity in "show all" mode.

Ambiguous offset shots (confidence < 80%) are added to the **Clarifying Questions** queue (§28).

---

## 27. Online Data Enrichment

### 27.1 Overview

Before the AI deliberation period, the engine queries publicly available data sources to enrich context for the drawing. This data informs deed reconciliation, flood zone notes, PLSS references, and ROW detection.

### 27.2 Enrichment Sources

| Source | Data Retrieved | API |
|--------|---------------|-----|
| County Appraisal District (Texas CADs) | Parcel polygon, owner, legal description excerpt, acreage | ESRI FeatureServer (county-specific) |
| USGS National Map / BLM PLSS | Township, range, section, abstract | `https://geonames.usgs.gov` / `https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/` |
| FEMA NFIP Flood Map Service | Flood zone designation, community panel number, effective date | `https://msc.fema.gov/arcgis/rest/services/` |
| TxDOT / FHWA ROW | Right-of-way centerline, highway number | TxDOT Open Data Portal |
| USGS 3DEP Elevation | Ground elevation at boundary corners | `https://epqs.nationalmap.gov/v1/json` |
| Historic Aerial / Imagery | Cross-reference feature locations | Bing Maps Tile API (cached) |

### 27.3 Data Model

```typescript
// packages/ai-engine/src/enrichment.ts

export interface EnrichmentData {
  parcel:    ParcelData | null;
  plss:      PLSSData | null;
  floodZone: FloodZoneData | null;
  row:       ROWData | null;
  elevation: ElevationData | null;
  fetchedAt: string;               // ISO 8601
  errors:    string[];             // Any source that failed (non-fatal)
}

export interface ParcelData {
  apn:           string;           // Appraisal parcel number
  ownerName:     string | null;
  siteAddress:   string | null;
  legalExcerpt:  string | null;    // First 300 chars of legal description from CAD
  acreage:       number | null;
  taxYear:       number;
  sourceCounty:  string;
  parcelPolygon: Point2D[] | null; // Boundary polygon from CAD (approximate)
}

export interface PLSSData {
  state:     string;               // "TX"
  pm:        string;               // Principal Meridian
  township:  string;               // "T15S"
  range:     string;               // "R16W"
  section:   string;               // "Section 42"
  abstract:  string | null;        // Texas abstract number, e.g. "A-1234"
  survey:    string | null;        // Survey name, e.g. "James Smith Survey"
}

export interface FloodZoneData {
  zone:          string;           // "X", "AE", "VE", "A", "0.2% Annual Chance"
  communityPanel: string;          // e.g. "48027C0152E"
  effectiveDate: string;           // e.g. "July 3, 2013"
  letterOfMapChange: string | null;
}

export interface ROWData {
  highways: {
    name:         string;          // "US 190"
    width:        number | null;   // Feet, null if unknown
    centerlineNearby: boolean;
  }[];
}

export interface ElevationData {
  pointElevations: Record<string, number>; // pointId → elevation in feet NAVD 88
}
```

### 27.4 Enrichment Engine

```typescript
export async function fetchEnrichmentData(
  points: SurveyPoint[],
  projectLatLon: Point2D,           // Approximate center for bounding box
): Promise<EnrichmentData> {
  const bbox = computeLatLonBBox(points);  // convert state-plane → lat/lon

  const [parcel, plss, floodZone, row, elevation] = await Promise.allSettled([
    fetchParcelData(bbox, projectLatLon),
    fetchPLSSData(projectLatLon),
    fetchFloodZoneData(bbox),
    fetchROWData(bbox),
    fetchElevationData(points),
  ]);

  return {
    parcel:    parcel.status    === 'fulfilled' ? parcel.value    : null,
    plss:      plss.status      === 'fulfilled' ? plss.value      : null,
    floodZone: floodZone.status === 'fulfilled' ? floodZone.value : null,
    row:       row.status       === 'fulfilled' ? row.value       : null,
    elevation: elevation.status === 'fulfilled' ? elevation.value : null,
    fetchedAt: new Date().toISOString(),
    errors: [parcel, plss, floodZone, row, elevation]
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error'),
  };
}
```

### 27.5 How Enrichment Data Is Used

| Data | How Used |
|------|---------|
| `parcel.legalExcerpt` | Cross-reference against uploaded deed; flag if descriptions conflict |
| `parcel.acreage` | Cross-check against computed area; flag if > 2% difference |
| `plss` | Auto-fill title block PLSS fields (Township, Range, Section, Abstract, Survey) |
| `floodZone` | Auto-select flood zone standard note; pre-fill panel number and effective date |
| `row` | Suggest ROW layer assignment for points near highway; warn about encroachments |
| `elevation` | Include ground elevation in point attributes; used in 3D export (Phase 7) |

### 27.6 Coordinate Conversion (State Plane ↔ Geographic)

```typescript
// Uses proj4 library (already in package.json for Phase 4 coordinate system support)
import proj4 from 'proj4';

const TX_CENTRAL = '+proj=lcc +lat_1=31.88333333333333 +lat_2=30.11666666666667 '
  + '+lat_0=29.66666666666667 +lon_0=-100.3333333333333 +x_0=699999.9999999999 '
  + '+y_0=3000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs';

export function statePlaneToLatLon(easting: number, northing: number): [number, number] {
  return proj4(TX_CENTRAL, 'WGS84', [easting, northing]) as [number, number];
}
```

---

## 28. AI Deliberation Period & Confidence-Gated Clarifying Questions

### 28.1 Overview

After the 6-stage pipeline completes, the online enrichment is fetched, and dynamic offsets are resolved, the AI enters a **deliberation period** of 5–10 minutes before rendering the drawing. During this time it performs a deep holistic analysis and generates a set of clarifying questions that the user can answer to improve drawing quality.

**Key rule:** If overall confidence is ≥ 90% AND there are no blocking anomalies, the AI skips the question dialog entirely and proceeds directly to the drawing preview. Questions are only generated when they can meaningfully change an outcome.

### 28.2 Deliberation Activities

```
DELIBERATION CHECKLIST (runs sequentially)
──────────────────────────────────────────
1. Cross-reference field data with deed data
   • Any legs with bearing diff > 2° or distance diff > 1' → flag for question
   • POB monument found in field? If not → blocking question

2. Cross-reference with parcel data
   • Computed area vs CAD acreage: > 2% diff → question
   • Parcel polygon centroid vs field data centroid: > 50' diff → question

3. Validate offset resolution
   • Any ambiguous offset shots → question per shot
   • Multiple shots of same apparent point → question about which is final

4. Code pattern analysis
   • Points with unrecognized codes → question about intended feature
   • Codes that appear to be typos (e.g., "BCC2" near "BC02" group) → question
   • Codes that appear in wrong context (e.g., utility code among boundary codes) → question

5. Feature completeness check
   • Expected boundary polygon not closed → question
   • Expected ROW line not present but ROW enrichment data shows highway → question
   • Lone point with no matching start/end in any line → question about connection

6. Feature attribute collection
   • Fence lines: collect material (chain link/wood/wire/barbed wire/split rail) and condition
   • Buildings: collect primary material (brick/frame/metal/concrete) and type (residential/commercial)
   • Retaining walls: collect material and approximate height
   • Water features: collect name if unnamed in deed

7. Monument condition notes
   • For each SET monument: collect cap information if not in description
   • For FOUND monuments: condition (good/damaged/bent/disturbed)

8. Coordinate system validation
   • All points within expected geographic bounding box for county?
   • Angular closure within expected tolerance?

9. Final confidence assessment
   • Compute overall job confidence (weighted average of all element scores)
   • If overall ≥ 90% and no blocking questions → skip question dialog
   • If overall < 90% or ≥ 1 blocking question → show question dialog
```

### 28.3 Clarifying Question Data Model

```typescript
// packages/ai-engine/src/deliberation.ts

export type QuestionPriority = 'BLOCKING' | 'HIGH' | 'MEDIUM' | 'LOW';

export type QuestionCategory =
  | 'CODE_AMBIGUITY'        // Why was this code used?
  | 'POSSIBLE_TYPO'         // Looks like a typo in code or coordinate
  | 'OFFSET_DISAMBIGUATION' // How to resolve an offset shot
  | 'DUPLICATE_SHOT'        // Multiple shots of same point — which is final?
  | 'MISSING_FEATURE'       // Expected feature not found
  | 'DEED_DISCREPANCY'      // Field vs deed mismatch
  | 'FEATURE_ATTRIBUTE'     // Material, condition, type of a feature
  | 'MONUMENT_INFO'         // Cap info, condition of monument
  | 'AREA_MISMATCH'         // Computed area vs deed/CAD area differs
  | 'AREA_ENCLOSURE'        // Boundary appears not to close
  | 'CONNECTION_AMBIGUITY'; // Should these points be connected?

export interface ClarifyingQuestion {
  id:           string;
  priority:     QuestionPriority;
  category:     QuestionCategory;
  question:     string;           // Human-readable question text
  aiReasoning:  string;           // Why the AI is asking this
  relatedIds:   string[];         // featureIds, pointIds, or annotationIds involved
  suggestedAnswer: string | null; // AI's best guess (pre-fills the answer)
  answerType:   QuestionAnswerType;
  options?:     string[];         // For SELECT type
  userAnswer:   string | null;    // Set when user answers
  skipped:      boolean;
}

export type QuestionAnswerType =
  | 'TEXT'           // Free text
  | 'SELECT'         // Pick from a list
  | 'CONFIRM'        // Yes / No / Not Sure
  | 'POINT_SELECT'   // Click a point on the mini-map
  | 'NUMBER';        // Numeric input (e.g., offset distance)

export interface DeliberationResult {
  overallConfidence:  number;       // 0–100 weighted average
  questionsGenerated: ClarifyingQuestion[];
  blockingQuestions:  ClarifyingQuestion[];
  optionalQuestions:  ClarifyingQuestion[];
  shouldShowDialog:   boolean;      // false if confidence ≥ 90 and no blocking Qs
  deliberationTimeMs: number;
}
```

### 28.4 Question Dialog UI

```
┌─ AI Drawing Questions ──────────────────────────────── [Skip All Optional] ─┐
│                                                                              │
│  The AI has analyzed all data and has a few questions before drawing.        │
│  Answering these will improve accuracy. Blocking questions (⛔) must be      │
│  answered. Optional questions (💡) can be skipped.                           │
│                                                                              │
│  Overall Confidence: ████████████░░  78%                                     │
│                                                                              │
│ ──────────────── BLOCKING (2) ──────────────────────────────────────────── │
│                                                                              │
│  ⛔ 1 of 2 — DEED DISCREPANCY                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ The deed calls for a monument at the NE corner described as "a 5/8"   │ │
│  │ iron rod found." No monument was found near point #8 (the closest      │ │
│  │ boundary corner). Was the NE corner monument found in the field?        │ │
│  │                                                                         │ │
│  │ ○ Yes — it is point #8 (BC01 20fnd)                                    │ │
│  │ ○ Yes — it is a different point: [__________]                           │ │
│  │ ○ No — the monument was not found                                       │ │
│  │ ○ Not sure                                                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ────────────────── OPTIONAL (5) ────────────────────────────────────────── │
│                                                                              │
│  💡 1 of 5 — FEATURE ATTRIBUTE                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ The fence along the south side (points 6–12, FN03) — what material?    │ │
│  │ AI best guess: Chain Link (based on code FN03)                          │ │
│  │                                                                         │ │
│  │ [Chain Link ▾]   [Skip this question]                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  💡 2 of 5 — FEATURE ATTRIBUTE         ← next question preview             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ The building (points 30–38, BL01) — primary construction material?     │ │
│  │ [Brick ▾]   [Skip this question]                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                          [← Previous]  [Next →]  [Draw Now]                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**"Draw Now"** button is enabled once all blocking questions are answered. It proceeds to drawing even if optional questions remain unanswered.

### 28.5 Applying Question Answers

After the user completes the question dialog, the answers are fed back into the pipeline:

```typescript
export function applyAnswers(
  result: AIJobResult,
  answers: ClarifyingQuestion[],
  points: SurveyPoint[],
): AIJobPayload {
  // Rebuild the payload with answer data injected
  const updatedPrompt = buildAnswerPrompt(answers);
  // Re-run stages 2–6 with the enriched understanding
  return { ...existingPayload, userPrompt: updatedPrompt, answers };
}
```

Stages 1 (classification) and 3 (deed reconciliation) re-run with answers applied. Confidence scores are recalculated. The updated result feeds into the drawing preview.

---

## 29. Interactive Drawing Preview & Confidence Element Cards

### 29.1 Overview

After deliberation (and optional clarifying questions), the AI renders a **drawing preview** in a full-screen two-panel layout. The user can review every element with its confidence score, chat with the AI about individual elements, and accept the drawing to load it into the Phase 7 full editor.

### 29.2 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  AI Drawing Preview                       [Re-analyze with Instructions]  [Help] │
├────────────────────────────────────────────┬─────────────────────────────────────┤
│                                            │  Sort: [Confidence ▾] [Search...]   │
│                                            │                                     │
│   DRAWING PREVIEW (interactive canvas)    │  ┌── Element #8 ──────── 38% ──────┐ │
│                                            │  │ ██░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ │
│   [Zoom controls]  [Pan]  [Fit]            │  │ Boundary Curve (3 pts)          │ │
│                                            │  │ ⚠ Bearing mismatch 245" from deed│ │
│   Features are rendered with confidence    │  │ ⚠ Closure 1:3,200               │ │
│   glow:                                    │  └─────────────────────────────────┘ │
│   • Red  = tier 1/2 (< 60%)               │                                     │
│   • Orange = tier 3 (60–79%)              │  ┌── Point #99 ─────────  12% ──────┐ │
│   • Yellow-green = tier 4 (80–94%)        │  │ ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ │
│   • Green  = tier 5 (95–100%)             │  │ (Not placed — zero coordinates)  │ │
│                                            │  └─────────────────────────────────┘ │
│   Hover feature → highlight its card      │                                     │
│   Click feature → open explanation popup  │  ┌── Boundary Curve ──── 45% ──────┐ │
│                                            │  │ ████░░░░░░░░░░░░░░░░░░░░░░░░░  │ │
│                                            │  │ NW Corner Arc (4 pts)           │ │
│                                            │  └─────────────────────────────────┘ │
│                                            │                                     │
│                                            │  ┌── Monument #20 ────── 62% ──────┐ │
│                                            │  │ ██████░░░░░░░░░░░░░░░░░░░░░░░  │ │
│                                            │  │ Boundary Monument               │ │
│                                            │  │ 20calc → 20set  Δ 0.32' ⚠       │ │
│                                            │  └─────────────────────────────────┘ │
│                                            │                                     │
│                                            │  ┌── Fence S side ─────  87% ──────┐ │
│                                            │  │ █████████████░░░░░░░░░░░░░░░░  │ │
│                                            │  │ Chain Link (7 pts)              │ │
│                                            │  └─────────────────────────────────┘ │
│                                            │     ↕ scrollable                    │
├────────────────────────────────────────────┴─────────────────────────────────────┤
│  98 elements  •  12 need review  •  4 not placed      [Accept Drawing →]         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 29.3 Element Card Component

```
┌── {Element Title} ──────────────── {Score}% ─────────────────┐
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← confidence bar
│ {Category badge}  {Brief description}                         │
│ {Flag icon} {Flag 1}   {Flag icon} {Flag 2}                   │
└──────────────────────────────────────────────────────────────┘
```

- **Border color** matches confidence tier: `#dc2626` (< 40), `#ea580c` (40–59), `#ca8a04` (60–79), `#65a30d` (80–94), `#16a34a` (95–100)
- **Bar fill** uses a gradient from the tier color
- **Sort order** default: least confident first (score ascending). User can change to: alphabetical, by category, by tier
- Clicking a card opens the **Element Explanation Popup** (§30)
- Hovering a card highlights the corresponding feature on the canvas with a pulsing ring

### 29.4 Sort & Filter Controls

```typescript
export type CardSortOrder =
  | 'CONFIDENCE_ASC'   // default — least confident first
  | 'CONFIDENCE_DESC'  // most confident first
  | 'ALPHA'            // alphabetical by title
  | 'NUMERIC'          // by point number
  | 'CATEGORY';        // grouped by category

export type CardFilterMode =
  | 'ALL'
  | 'NEEDS_REVIEW'     // tiers 1–3
  | 'ACCEPTED'         // tier 5 + user-accepted
  | 'CATEGORY';        // filter by specific category
```

### 29.5 Accept Drawing Workflow

```
User clicks [Accept Drawing →]
    │
    ▼
Confirmation dialog:
  "12 elements still need review. Accept anyway and continue editing in the full editor?"
  [Review First]  [Accept & Continue]
    │
    ▼ (Accept & Continue)
  Current drawing state is snapshot as "AI Version 1"
  Drawing is loaded into the Phase 7 full interactive editor
  Review queue remains accessible in the editor sidebar
  User can continue editing manually or via AI chat
```

### 29.6 Re-analyze Workflow

```
User types in "Re-analyze with Instructions" text area
  e.g., "The fence on the north side should be wood privacy, not chain link"
    │
    ▼
Stages 2–6 re-run with the instruction injected into the prompt
Online enrichment is reused (not re-fetched)
Deliberation period runs again (abbreviated: 1–2 min)
New drawing preview replaces old one
All cards refresh with new scores
User can cycle through multiple re-analyzes until satisfied
Each version is saved as "AI Version N" for comparison
```

### 29.7 Drawing Preview Canvas

The preview canvas is a **read-only** instance of the Phase 1–5 rendering engine. It supports:
- Pan (middle mouse or space+drag)
- Zoom (scroll wheel)
- Fit to extents button
- Click to select and open explanation popup
- Hover for element tooltip (bearing, length, point names — see Phase 8 §5)
- All confidence glow overlays per tier
- Dimmed display of rejected/unplaced elements

The preview does **not** support editing. Editing happens only after the user accepts and loads into the full editor.

---

## 30. Per-Element AI Explanation & Element-Level Chat

### 30.1 Overview

Every element in the drawing preview has an AI-generated explanation documenting why it was drawn the way it was. The user can open a chat dialog for any element to ask questions, provide more information, or request changes. The AI can respond by updating that element, a group of related elements, or the full drawing.

### 30.2 Element Explanation Data Model

```typescript
// packages/ai-engine/src/element-explanation.ts

export interface ElementExplanation {
  featureId:    string;
  generatedAt:  string;              // ISO 8601

  // Core explanation
  summary:      string;              // 1-sentence summary, shown in card
  reasoning:    string;              // Full paragraph: why drawn this way
  dataUsed:     ExplanationDataRef[]; // Sources of data that influenced this
  assumptions:  string[];            // List of assumptions made
  alternatives: AlternativeOption[]; // Other interpretations considered + why rejected
  confidenceBreakdown: ConfidenceFactorExplanation[]; // Human-readable per factor

  // Chat history
  chatHistory:  ElementChatMessage[];
}

export interface ExplanationDataRef {
  type:    'FIELD_POINT' | 'DEED_CALL' | 'ENRICHMENT' | 'FIELD_NOTE' | 'USER_ANSWER';
  label:   string;         // e.g. "Point #8 (BC01 20fnd)", "Deed call #3", "FEMA panel 48027C0152E"
  value:   string;         // The actual data value
  weight:  'HIGH' | 'MEDIUM' | 'LOW'; // How much this influenced the decision
}

export interface AlternativeOption {
  description: string;     // What else was considered
  whyRejected: string;     // Why the AI chose the current approach instead
}

export interface ConfidenceFactorExplanation {
  factor:      keyof ConfidenceFactors;
  score:       number;     // 0–1
  explanation: string;     // e.g. "Code BC02 is unambiguous (1/2\" iron rod set)"
}

export interface ElementChatMessage {
  id:        string;
  role:      'USER' | 'AI';
  content:   string;
  timestamp: string;
  action?:   ElementChatAction;  // Set when AI took an action in response
}

export interface ElementChatAction {
  type:       'REDRAW_ELEMENT' | 'REDRAW_GROUP' | 'REDRAW_FULL' | 'UPDATE_ATTRIBUTE' | 'NO_ACTION';
  description: string;
  affectedIds: string[];         // featureIds that were changed
}
```

### 30.3 Explanation Popup UI

```
┌─── Boundary Curve — NW Corner ─────────────────────── 45% ────────[✕]───┐
│ ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                          │
│ ▼ Why I drew it this way                                                 │
│   Three points (#14, #15, #16) were coded with arc suffix (A-suffix),    │
│   indicating a curved feature. I applied Kasa circle fitting and found   │
│   a radius of 25.3'. However, the deed calls for a 25' radius curve      │
│   at this corner (Call #4), giving a 0.3' discrepancy. I used the        │
│   field-measured positions as primary data.                              │
│                                                                          │
│ ▼ Data I used                           (weight)                         │
│   🟢 Points #14, #15, #16 (arc suffix A)     HIGH                       │
│   🟡 Deed Call #4 (R=25', L=39.27')          MEDIUM                     │
│   ⚪ FEMA flood zone: Zone X                  LOW                        │
│                                                                          │
│ ▼ Assumptions I made                                                     │
│   • Arc direction assumed CCW (counterclockwise) — based on point order  │
│   • Using field-measured radius (25.3') rather than deed radius (25.0')  │
│                                                                          │
│ ▼ Alternatives I considered                                              │
│   • Straight line through #14→#16: rejected because arc suffix present  │
│   • Using deed radius (25.0'): would shift PT by 0.3'                   │
│                                                                          │
│ ▼ Confidence Breakdown                                                   │
│   Code Clarity          ██████████  100%  Code A-suffix is unambiguous   │
│   Coordinate Validity   ██████████  100%  All 3 points valid             │
│   Deed/Record Match     █████░░░░░   50%  0.3' radius diff from deed     │
│   Contextual Consistency██████░░░░   60%  No set/found pair for this arc │
│   Closure Quality        ████░░░░░░   45%  Closure 1:3,200               │
│   Curve Data Completeness████████░░   80%  Field arc data present        │
│                                                                          │
│ ──────────────────────────── Chat ──────────────────────────────────── │
│                                                                          │
│   [AI] I drew this as a 25.3' radius curve based on the 3 arc-coded     │
│   field points. The deed calls for 25.0'. Would you like me to use       │
│   the deed radius instead?                                               │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────┐       │
│   │ Type your question or instruction...                          │       │
│   └──────────────────────────────────────────────────────────────┘       │
│   [Update This Element]  [Redraw This Group]  [Redraw Full Drawing]      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 30.4 Element Chat Backend

When the user types a message in the element chat, the backend sends a focused context to Claude:

```typescript
export async function handleElementChat(
  message:     string,
  explanation: ElementExplanation,
  feature:     Feature,
  jobContext:  AIJobPayload,
  claudeClient: ClaudeClient,
): Promise<{ reply: string; action: ElementChatAction | null }> {
  const systemPrompt = `You are an expert Texas land surveyor AI assistant. The user is reviewing
a specific element on a survey drawing. Answer their question about this element or make the
requested change. If a change is needed, output a JSON action block.

ELEMENT CONTEXT:
${JSON.stringify({ feature, explanation }, null, 2)}

JOB CONTEXT (abbreviated):
Points used: ${feature.pointIds?.map(id =>
  jobContext.points.find(p => p.id === id)
).filter(Boolean).map(p => `#${p!.name} (${p!.code})`).join(', ')}

AVAILABLE ACTIONS:
- REDRAW_ELEMENT: regenerate this single element with updated logic
- REDRAW_GROUP: regenerate all elements on the same layer/category
- REDRAW_FULL: re-run the full AI pipeline with the new instruction
- UPDATE_ATTRIBUTE: change a non-geometric attribute (layer, label, material, condition)
- NO_ACTION: just answer the question, no drawing changes needed`;

  const response = await claudeClient.complete(systemPrompt, message);
  return parseElementChatResponse(response);
}
```

### 30.5 Group Chat

The user can select **multiple cards** (Shift+click or Ctrl+click) to open a **group chat** that applies to all selected elements simultaneously. This is useful for:
- "Change all these fence lines to wood privacy fence"
- "All monuments on the west side — adjust them 0.5' west"
- "Remove all utility shots from the drawing"

### 30.6 Regeneration Levels

| Button | What Happens |
|--------|-------------|
| **Update This Element** | Re-runs geometry computation for this feature only; all other elements unchanged |
| **Redraw This Group** | Re-runs stages 2–6 for all features on the same layer/category as this element |
| **Redraw Full Drawing** | Re-runs the full 6-stage pipeline with the chat instruction injected into the user prompt; all cards refresh |

Each regeneration creates a new numbered version ("AI Version N") that the user can navigate back to if they don't like the result.

### 30.7 Explanation Generation

Explanations are generated as part of the AI pipeline result (Stage 6+). After confidence scoring:

```typescript
export async function generateExplanations(
  features:       Feature[],
  scores:         Map<string, ConfidenceScore>,
  classified:     ClassificationResult[],
  reconciliation: ReconciliationResult | null,
  enrichment:     EnrichmentData | null,
  claudeClient:   ClaudeClient,
): Promise<Map<string, ElementExplanation>> {
  const explanations = new Map<string, ElementExplanation>();

  // For tier 5 (auto-accepted), generate a brief explanation without Claude
  // For tiers 1–4, generate a full explanation using Claude
  for (const feature of features) {
    const score = scores.get(feature.id)!;
    if (score.tier === 5) {
      explanations.set(feature.id, buildAutoExplanation(feature, score, classified, reconciliation, enrichment));
    } else {
      const explanation = await buildClaudeExplanation(feature, score, classified, reconciliation, enrichment, claudeClient);
      explanations.set(feature.id, explanation);
    }
  }

  return explanations;
}
```

---

## Updated State Management (§23 additions)

### New State in AIStore

```typescript
// Additions to AIStore interface (§23.1):

interface AIStore {
  // ... existing fields ...

  // Offset resolution
  offsetResolution:   OffsetResolutionResult | null;

  // Online enrichment
  enrichmentData:     EnrichmentData | null;
  enrichmentLoading:  boolean;

  // Deliberation
  deliberationResult: DeliberationResult | null;
  deliberationActive: boolean;
  deliberationProgress: number;  // 0–100

  // Clarifying questions
  questions:          ClarifyingQuestion[];
  questionDialogOpen: boolean;
  currentQuestionIndex: number;
  answerQuestion:     (id: string, answer: string) => void;
  skipQuestion:       (id: string) => void;
  submitAnswers:      () => Promise<void>;

  // Drawing preview
  previewMode:        boolean;
  previewVersion:     number;      // Current AI version (1, 2, 3...)
  cardSortOrder:      CardSortOrder;
  cardFilterMode:     CardFilterMode;
  cardFilterCategory: string | null;
  hoveredCardId:      string | null;
  setCardSort:        (order: CardSortOrder) => void;
  setCardFilter:      (mode: CardFilterMode, category?: string) => void;
  setHoveredCard:     (id: string | null) => void;

  // Element explanations
  explanations:       Map<string, ElementExplanation>;
  activeExplanationId: string | null;
  openExplanation:    (featureId: string) => void;
  closeExplanation:   () => void;
  sendElementChat:    (featureId: string, message: string) => Promise<void>;
  regenerateElement:  (featureId: string, instruction: string) => Promise<void>;
  regenerateGroup:    (featureId: string, instruction: string) => Promise<void>;

  // Version history
  versions:           AIJobResult[];  // All AI versions generated
  currentVersion:     number;
  restoreVersion:     (index: number) => void;

  // Accept workflow
  acceptDrawing:      () => void;     // Triggers Phase 7 full editor load
}
```

## Updated Acceptance Tests (§24 additions)

### Dynamic Offset Resolution
- [ ] Offset in code suffix `BC02_10R` parsed: 10' right offset detected
- [ ] Offset in point description `"10L BC02"` parsed correctly
- [ ] Perpendicular left offset: true position is 90° CCW from bearing at correct distance
- [ ] Perpendicular right offset: true position is 90° CW from bearing at correct distance
- [ ] Companion pair (`35` + `35off`) detected and resolved
- [ ] Ambiguous offset (no reference bearing available) → added to question queue
- [ ] Offset shots rendered at 40% opacity in "show all" mode
- [ ] True positions replace offset positions in all feature assembly

### Online Data Enrichment
- [ ] County parcel data fetched for test parcel in Bell County, TX
- [ ] PLSS data (township, range, section, abstract) returned
- [ ] FEMA flood zone data returned with panel number
- [x] Elevation data returned for boundary corner points (USGS 3DEP @ `lib/cad/ai-engine/enrichment.ts`; runs in parallel with the pipeline in `app/api/admin/cad/ai-pipeline/route.ts`)
- [x] All enrichment sources failing gracefully (non-blocking — warnings added)
- [ ] PLSS fields auto-populated in title block from enrichment

### Deliberation & Clarifying Questions
- [x] Deliberation runs after stage 6 and before drawing preview (`runDeliberation` in `lib/cad/ai-engine/deliberation.ts`, called from `pipeline.ts`)
- [x] Deliberation generates no dialog when overall confidence ≥ 90 and no blocking issues (`shouldShowDialog` flag short-circuits per §28.1)
- [x] Deed discrepancy (bearing off > 2°) generates BLOCKING/HIGH question
- [x] Unrecognized code generates optional MEDIUM question
- [x] Fence code → material question generated (LOW priority)
- [x] Building code → material question generated (LOW priority)
- [ ] Duplicate shots → "which is final?" question generated
- [x] User answering blocking questions enables "Draw Now" button (`app/admin/cad/components/QuestionDialog.tsx`)
- [x] Answers applied to pipeline re-run; scores improve after good answers (`rerunWithAnswers` in `lib/cad/store/ai-store.ts` + `applyAnswerEffects` in `lib/cad/ai-engine/apply-answers.ts`; FEATURE_ATTRIBUTE answers stamp `feature.properties.material`, deed/code/offset answers logged as warnings until Stage-1 reclass + offset disambig wiring lands)
- [x] "Skip All Optional" dismisses all non-blocking questions (`skipAllOptionalQuestions` in `lib/cad/store/ai-store.ts`)

### Drawing Preview & Confidence Cards
- [ ] Two-panel layout renders (canvas left, cards right)
- [ ] Cards sorted by confidence ascending by default (least confident first)
- [ ] Card border color matches tier color correctly
- [ ] Confidence bar fills correctly for each score
- [ ] Hovering a card highlights the feature on the canvas
- [ ] Clicking a card opens the element explanation popup
- [ ] Sort controls change card order correctly (all 4 sort modes)
- [ ] Search filters cards by text match on title/description
- [ ] "Accept Drawing" opens confirmation dialog
- [ ] Accepting creates a version snapshot and triggers Phase 7 editor load
- [ ] Re-analyze re-runs pipeline and refreshes all cards

### Per-Element Explanations & Chat
- [x] Every feature has a generated explanation (`generateAutoExplanations` in `lib/cad/ai-engine/element-explanation.ts`; piped through `pipeline.ts` into `result.explanations`)
- [x] Tier 5 explanations are brief (no Claude call) — auto-explanation path is deterministic for all tiers in this slice
- [ ] Tiers 1–4 explanations include full reasoning, data used, assumptions, alternatives — auto path covers data used / assumptions / alternatives; Claude narrative augmentation lands in a follow-up slice
- [x] Confidence breakdown shows all 6 factors with human-readable text (`buildConfidenceBreakdown` walks `ConfidenceFactors` and emits per-factor explanations)
- [ ] Chat message sent → Claude responds within 30 seconds
- [ ] "Update This Element" redraw affects only the selected feature
- [ ] "Redraw This Group" redraw affects all features on same layer
- [ ] "Redraw Full Drawing" re-runs full pipeline
- [ ] Chat history persists within the session
- [ ] Group chat (multi-select cards) works for batch instructions

## Updated Build Order (§25 additions)

### Week 11: Offset Resolution & Enrichment
- Build `offset-resolver.ts` (detect offsets from all 4 sources)
- Build `applyPerpendicularOffset`, `applyBearingDistance`
- Build `fetchEnrichmentData` orchestrator
- Implement each enrichment source API call (with test mocks)
- Build `statePlaneToLatLon` coordinate converter
- Write unit tests for offset detection and resolution
- Test enrichment with real Bell County parcel

### Week 12: Deliberation & Questions
- Build `deliberation.ts` (all 9 deliberation checklist steps)
- Build `ClarifyingQuestion` generation for each question category
- Build question dialog UI component (`QuestionDialog.tsx`)
- Build `applyAnswers` to inject answers back into pipeline
- Wire deliberation into worker pipeline (after stage 6, before preview)
- Test question generation with known ambiguous datasets

### Week 13: Drawing Preview, Confidence Cards & Element Chat
- Build `DrawingPreview.tsx` (two-panel layout with read-only canvas)
- Build `ElementCard.tsx` (confidence bar, tier colors, click handler)
- Build `ElementCardPanel.tsx` (scrollable list, sort/filter controls)
- Build `ElementExplanationPopup.tsx` (full explanation + chat interface)
- Build `generateExplanations` (auto for tier 5, Claude for tiers 1–4)
- Build `handleElementChat` Claude integration
- Wire "Accept Drawing" to trigger Phase 7 editor load
- Wire version history (save/restore AI versions)
- Run all new acceptance tests from §24 additions

---

## Copilot Session Template

> I am building Starr CAD Phase 6 — AI Drawing Engine. Phases 1–5 (CAD engine, data import, styling, geometry/math, annotations/print) are complete. I am now building the AI pipeline: 6-stage processing (classify points → assemble features → reconcile with deed → intelligent placement → optimize labels → confidence scoring), Kasa circle fitting for arc detection, Claude API integration for deed parsing, a DigitalOcean worker for unlimited processing time, a 5-tier confidence scoring system with 6 weighted factors, dynamic offset resolution (field offset shots → true positions), online data enrichment (county parcel/GIS, PLSS, FEMA, elevation), an AI deliberation period with confidence-gated clarifying questions, an interactive two-panel drawing preview with visual confidence element cards (sorted least-confident-first, color-coded borders and bars), per-element AI explanation popups with element-level chat (Update/Redraw Group/Redraw Full), a review queue UI with per-item accept/modify/reject and batch actions, point group intelligence (calc/set/found resolution with delta reporting), and AI-assisted re-processing via user prompts. The spec is in `STARR_CAD_PHASE_6_AI_ENGINE.md`. I am currently working on **[CURRENT TASK from Build Order]**.

---

*End of Phase 6 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
