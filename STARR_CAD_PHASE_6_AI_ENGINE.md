# STARR CAD — Phase 6: AI Drawing Engine

**Version:** 1.0 | **Date:** March 2026 | **Phase:** 6 of 7

**Goal:** Import a field file + provide a deed, and the AI produces a review-ready drawing with confidence scores on every element. Point groups (calc/set/found) are automatically resolved. A 6-stage pipeline classifies points, assembles features, reconciles against deeds, places everything intelligently, optimizes labels, and scores confidence. The review queue lets you accept, modify, or reject each AI decision individually.

**Duration:** 8–10 weeks | **Depends On:** Phase 5 (annotations, labels, templates, print system all exist for the AI to populate)

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

*Sections 6–25 to be added in subsequent updates.*
