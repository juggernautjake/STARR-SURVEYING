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
  classified:     ClassificationResult[];
  pointGroups:    PointGroup[];
  reconciliation: ReconciliationResult | null;
  reviewQueue:    AIReviewQueue;
  scores:         Record<string, ConfidenceScore>; // Map serialized as Record

  // Metadata
  processingTimeMs: number;
  stageTimings:     Record<string, number>;
  warnings:         string[];
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

## Copilot Session Template

> I am building Starr CAD Phase 6 — AI Drawing Engine. Phases 1–5 (CAD engine, data import, styling, geometry/math, annotations/print) are complete. I am now building the AI pipeline: 6-stage processing (classify points → assemble features → reconcile with deed → intelligent placement → optimize labels → confidence scoring), Kasa circle fitting for arc detection, Claude API integration for deed parsing, a DigitalOcean worker for unlimited processing time, a 5-tier confidence scoring system with 6 weighted factors, a review queue UI with per-item accept/modify/reject and batch actions, point group intelligence (calc/set/found resolution with delta reporting), and AI-assisted re-processing via user prompts. The spec is in `STARR_CAD_PHASE_6_AI_ENGINE.md`. I am currently working on **[CURRENT TASK from Build Order]**.

---

*End of Phase 6 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
