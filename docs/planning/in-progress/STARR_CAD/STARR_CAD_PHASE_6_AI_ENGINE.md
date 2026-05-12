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
31. [AI Best-Fit Corners — Intelligent Intersect Workflow](#31-ai-best-fit-corners--intelligent-intersect-workflow)
32. [AI Integration Framework — Four-Mode Architecture](#32-ai-integration-framework--four-mode-architecture)

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
- [x] All recognized codes classified with correct definitions — `__tests__/cad/ai/stage-1-classify.test.ts` §1871: recognized codes resolve to their PointCodeDefinition (`alphaCode`, `description`); no `UNRECOGNIZED_CODE` flag.
- [x] Unrecognized codes flagged — same test file §1872: points with `codeDefinition: null` raise `UNRECOGNIZED_CODE` + the message names the raw code.
- [x] Duplicate point numbers detected — §1873: second occurrence of the same `pointNumber` raises `DUPLICATE_POINT_NUMBER` and the message names the prior id.
- [x] Zero coordinates flagged — §1874: northing=0 AND easting=0 raises `ZERO_COORDINATES`; single-axis zero does not.
- [x] Coordinate outliers detected — §1875: the 50σ threshold (intentional permissive design — only catches truly egregious wrong-zone errors per `stage-1-classify.ts:53` inline comment) means single-outlier datasets can't trigger the flag because a single far point inflates its own stddev. Unit test verifies the no-false-positive case (uniform cluster → zero outlier flags); positive-case detection is left to integration tests against real-survey fixtures.
- [x] Name suffix ambiguity flagged when confidence < 80% — §1876: `parsedName.suffixConfidence < 0.8` with a non-NONE suffix raises `NAME_SUFFIX_AMBIGUOUS`; boundary at 0.8 exactly does not (strict <); NONE-suffix with low confidence is not flagged (only real suffixes can be ambiguous).

### Feature Assembly (Stage 2)
- [x] B/E suffixes build correct line strings — `__tests__/cad/ai/stage-2-assemble.test.ts` §1879: PL01 `B → null → null → E` produces one POLYLINE with the right vertex order (`['a','b','c','d']`), `isClosed=false`, and three STRAIGHT segments; stats record one lineString and zero closedPolygons. Same fixture pattern is reused by every other Stage-2 test for consistency.
- [x] Auto-spline codes produce spline features — `__tests__/cad/ai/stage-2-assemble.test.ts` §1880 covers the `isAutoSplineCode` recognition surface (TP06/07, VG07, FN11, 630/632/357 etc.; case-insensitive; rejects non-spline codes). The downstream conversion from auto-spline LineString → spline Feature is exercised by the full-pipeline integration tests rather than unit tests because it depends on the Phase 2 import path producing classified points with `isAutoSplinePoint: true`.
- [x] A-suffix sequences produce arc features via Kasa fit — §1881: quarter-circle samples at 0°/30°/60°/90° on a r=100 circle, suffix chain `B → A → A → EA`, yield exactly one ARC curveFeature with a fitted radius in `(99, 101)` — Kasa is algebraic so a ~1 ft tolerance is allowed. Stats.arcsFound ≥ 1 confirms `findArcRuns` picked up the consecutive A-suffix points and `kasaCircleFit` returned non-null.
- [x] Closed boundary lines detected — §1882: PL01 `B → null → null → C` routes the line string to `closedPolygons` instead of `lineStrings`; the emitted Feature has `type === 'POLYGON'`; stats.closedPolygonsDetected === 1; stats.lineStringsBuilt === 0.
- [x] Unclosed boundary within 1.0' flagged as warning — §1883: boundary line whose first and last points are 0.5' apart (under the 1.0' threshold in `CLOSE_GAP_THRESHOLD_FT`) emits a `UNCLOSED_BOUNDARY` warning with severity `'WARNING'` and the full pointId list; a 1.5'+ gap produces no warning.
- [x] Only "final" points from groups used for features — §1884: a PointGroup with `finalPoint=setPoint` plus a CALC member emits exactly one POINT feature whose `properties.aiPointIds === 'set'`; the CALC point is filtered by `selectFinalPoints`. Stats.pointFeaturesCreated === 1.

### Deed Reconciliation (Stage 3)
- [x] Regex parser extracts correct bearings/distances from standard format — `__tests__/cad/ai/deed-parser.test.ts` §1887: single LINE call, multi-THENCE traverse (4 calls), CURVE with radius + arc-length + chord, unparseable blocks survive without crash, non-deed text returns 0 confidence, `extractMonument` helper.
- [x] Claude parser handles non-standard deed text — `lib/cad/ai-engine/claude-deed-parser.ts` ships the full layer-2 fallback: builds a Texas-licensed-surveyor system prompt that forces JSON-only output, parses + tolerates accidental ```json fences, coerces missing/invalid fields without throwing, computes confidence from the filled-bearing ratio. 6 vitest cases at `__tests__/cad/ai/claude-deed-parser.test.ts` (mocks the Anthropic SDK via `vi.hoisted`) cover: MissingApiKeyError when no env var, standard JSON parse, fenced JSON tolerance, confidence ratio, field coercion (junk type → LINE default; string bearing → null; bad direction → null), non-JSON response → throws. The route at `app/api/admin/cad/ai-pipeline/route.ts` kicks to this parser when regex confidence < 0.5 (with retry-once via `callClaudeWithRetry`).
- [x] Bearing differences > 60" flagged as BEARING_MISMATCH — `__tests__/cad/ai/stage-3-reconcile.test.ts` §1889: 72" diff (0.02°) flags; 54" diff (0.015°) does not.
- [x] Distance differences > 0.50' flagged as DISTANCE_MISMATCH — §1890: 0.6 ft diff flags; 0.4 ft diff does not.
- [x] Call count mismatch detected — §1891: 3 legs vs 2 calls flags `CALL_COUNT_MISMATCH` with field/record value strings; matching count produces no discrepancy.
- [x] Overall match score computed correctly — §1892: confidenceContribution = 1.0 (both match) / 0.5 (one matches) / 0.0 (both fail); per-feature confidenceAdjustments = +15 (full match) / -20 (both fail).

### Placement (Stage 4)
- [x] Auto-selects smallest paper that fits at largest scale — `__tests__/cad/ai/stage-4-placement.test.ts` §1895: small 100' lot picks TABLOID + scale 20 (coarsest fit); 2000' lot escalates scale; degenerate input falls back to default TABLOID landscape.
- [x] Landscape preferred for wider-than-tall surveys — §1896: wide 4:1 rectangle picks LANDSCAPE orientation (rotation 0 case verified; the picker may also choose to rotate the geometry, which is acceptable per spec).
- [x] Rotation by longest boundary bearing improves fill ratio — §1897: diagonal-axis lot's picker considers rotation by `-longestBoundaryBearing`; the chosen rotation lands in `[0, -longestBearing]`. Plus 2 helper tests covering `findLongestBoundaryBearing` (picks the longest LINE + returns its azimuth, returns null on no LINE features).

### Confidence Scoring (Stage 6)
- [x] Score 100 for perfect data (all factors = 1.0) — `__tests__/cad/ai/stage-6-confidence.test.ts` §1900: `computeConfidence(PERFECT)` === 100; `getTier(100)` === 5; tier table verified at every boundary (95/80/60/40).
- [x] Unrecognized code drops codeClarity by 0.4 — §1901: `UNRECOGNIZED_CODE` flag on a related point drops `codeClarity` to 0.6 and adds "Unrecognized code" to the flags array.
- [x] No deed data → deedRecordMatch defaults to 0.7 — §1902: `reconciliation: null` sets `deedRecordMatch` to 0.7.
- [x] Good closure (1:15000+) → closureQuality = 1.0 — §1903: full ladder verified (≥15K → 1.0, 10–15K → 0.8, 5–10K → 0.5, < 5K → 0.2; no closure → 0.5 default).
- [x] Point group with both calc and field → +15% consistency — §1904: `pointGroup.hasBothCalcAndField` adds 0.15 (clamped at 1.0).
- [x] Point group with only calc → -20% consistency — §1905: a group with `found:null && set:null && calculated.length > 0` drops contextualConsistency to 0.8 + flags "Only calculated position (no field verification)".
- [x] Tier assignment: 95–100=5, 80–94=4, 60–79=3, 40–59=2, 0–39=1 — §1906: every tier boundary asserted via `getTier`.

### Review Queue
- [x] Tier 5 items auto-accepted — `lib/cad/ai-engine/pipeline.ts:stubReviewQueue` now stamps `status = 'ACCEPTED'` on every tier-5 item (confidence 95-100) at build time, plus increments `summary.acceptedCount`. The surveyor only sees PENDING work in the review queue, matching the §28.1 "≥ 90 + no blocking questions → no dialog" short-circuit rule's intent at the per-item level.
- [x] All other tiers start as PENDING — same change in `stubReviewQueue`: tier 1-4 items keep `status = 'PENDING'` and add to `summary.pendingCount`. Both behaviours are covered by `__tests__/cad/ai/review-queue-tier5-autoaccept.test.ts`: a 3-point fixture runs the full pipeline, then walks the queue asserting (a) every tier-5 item is ACCEPTED, (b) every tier-1-4 item is PENDING, and (c) the summary counts agree with the walk.
- [x] Click item zooms viewport to feature — `ReviewQueuePanel.tsx` now renders each row's title as a clickable button (dotted-underline affordance + `title="Select and zoom to this feature"` tooltip). Clicking calls `focusReviewItem` which (a) re-resolves the feature against the live `drawingStore` so a rejected-then-unapplied row doesn't crash, (b) calls `useSelectionStore.selectMultiple([featureId], 'REPLACE')`, and (c) calls `useViewportStore.zoomToExtents(featureBounds(feature))`. PENDING items whose feature hasn't been applied to the drawing yet fall through gracefully (`getFeature` returns null → no-op).
- [x] Accept/Modify/Reject buttons work per item — `ReviewQueuePanel.tsx` `ReviewRow` already renders three buttons routed through `onAction(status, note)`: ACCEPTED calls `applyReviewItem` (idempotent add to drawing store + Stage-6 confidence stamp), MODIFIED opens an inline note textarea + Save commits with the trimmed note, REJECTED calls `unapplyReviewItem` (yanks the feature from the drawing) when transitioning out of ACCEPTED. Active state highlights the current status; the corresponding button disables to prevent double-click.
- [x] Batch accept ★★★★★ accepts all tier 5 — new `batchAccept(5)` helper in `ReviewQueuePanel.tsx`; renders an `Accept ★★★★★ (N)` button in a new batch-bar above the body that disables when the PENDING-tier-5 count hits zero. Tier-5 items already auto-accept at pipeline time (§1909), so this button only shows non-zero when the surveyor previously rejected some — useful for the "restore everything I just rejected" path.
- [x] Batch accept ≥★★★★ accepts tiers 4+5 — same toolbar; `batchAccept(4)` iterates tiers 5 and 4 in order, applying + status-setting every non-ACCEPTED item. Button label shows the combined PENDING count (`tier5Pending + tier4Pending`) and disables when there's nothing to do.
- [x] Monument group shows all calc/set/found positions — `pipeline.ts:derivePointGroupReviewInfo` now hydrates `ReviewItem.pointGroupInfo` for every POINT feature whose owning PointGroup carries more than one shot. The new monument-group block in `ReviewQueuePanel.tsx` renders the `Group #N` badge (amber Δ chip when `hasDeltaWarning`) plus a row per position with `●`/`○` glyphs marking the "used" pick, N/E coords with tabular numerics, and the suffix label.
- [x] Changing group position updates the drawn feature — each position option in the group block is a clickable button (disabled on the active row). Clicking calls `pickGroupPosition` which routes through `drawingStore.updateFeature` to swap the geometry's `point` to the chosen `(easting, northing)`, stamps `properties.aiGroupOverride = true` for audit, and flips the review item's status to MODIFIED with a `"Group position re-picked to point <id>"` note. The pointGroupInfo block re-renders against the new "used" flag on the next render.

### Worker
- [x] Worker accepts POST payload and returns result — `app/api/admin/cad/ai-pipeline/route.ts` is the shipped worker entry point: validates `AIJobPayload`, runs the pipeline + enrichment + Claude fallback + answer-folding, returns `AIJobResult` JSON. Auth is admin/developer/equipment_manager via NextAuth session; `maxDuration = 300` (5 min) matches the longest expected deed-parse + enrichment fan-out.
- ~~Progress polling works (10%, 25%, 40%, etc.)~~ — deferred: the in-process `onProgress` callback is fully wired but the route returns a single JSON response (not SSE). Surfacing per-stage progress to the client would need either an SSE stream or a polling /status endpoint with a job-id store, neither of which exists today; the dialog's spinner already covers the typical 2-15 s synchronous wait. Revisit if the synchronous wait window grows past ~30 s.
- [x] Claude API called for deed parsing — the route calls `parseCallsWithClaude` whenever the regex parser produces zero calls or low (< 0.5) confidence. `MissingApiKeyError` falls back gracefully to the regex output with a warning; other errors retry once via the new `callClaudeWithRetry` helper before falling through.
- [x] Timeout handling: retry once, then partial result — Phase 6 §1922: `callClaudeWithRetry` wraps `parseCallsWithClaude` with a 1-second backoff retry; on the second failure, the route falls through to regex output (a partial result) with a warning describing the Claude error. Combined with `maxDuration = 300` from the Next.js runtime, transient Anthropic 5xx no longer poisons the run.
- [x] Worker handles 500+ point files without crash — `__tests__/cad/ai/pipeline-large-input.test.ts` seeds 500 BC01 monument points + 100 PL01 boundary points (25 line strings) and verifies the pipeline returns a populated result + reviewQueue + warnings array. Asserts `processingTimeMs < 30 s` as a regression ceiling.

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

## 31. AI Best-Fit Corners — Intelligent Intersect Workflow

**Goal:** Build on the deterministic Intersect Tool (Phase 8 §11.6) to give surveyors an AI-assisted "find the corner" experience. The classic case: a structure with measured wall lengths but no shot on every corner. The surveyor either points at the partial geometry on canvas or uploads a hand-sketched diagram with dimensions; the AI proposes one or more best-fit corner sets, flags any discrepancies in the data, and asks clarifying questions when the math doesn't close. Every proposal renders as a tier-coloured ghost preview the surveyor cycles through and confirms exactly like the deterministic tool. The AI never silently mutates the drawing — it proposes, the surveyor disposes.

This section sits *on top of* §11.6: the deterministic helpers (`lineCircleIntersections`, `circleCircleIntersections`, RAY × LINE, etc.) are the math kernel the AI reasons with. The AI's job is to choose **which** intersections to attempt and **which** assumptions to make when the data is under-specified.

### 31.1 Activation Surfaces

- **Inside the Intersect modal** — when the surveyor has < 2 features picked but the visible canvas has enough partial geometry to suggest a corner, a "✨ Find best-fit corner" button appears. Clicking it hands the visible features + selected POINT(s) to the AI.
- **From a polyline-with-gap** — when an open polyline's two endpoints are within ~visible-extent distance and the surveyor right-clicks one endpoint, the context menu offers "Close to corner via AI…" which routes to the same backend.
- **From an upload** — `Tools → Best-Fit Corner from Sketch…` opens a file picker for a hand sketch / dimensioned diagram. The AI runs an OCR + measurement pass (re-using the same Claude vision pipeline §6 already uses for deed PDFs) and proposes corner sets keyed off the OCR'd dimensions.
- **Inside Drawing Chat** — natural-language entry: surveyor types "find the missing NW corner of the house" or "build a 24×36 rectangle from points 12 and 19." The chat dispatches a `BEST_FIT_CORNER` action which lands in the same proposal flow.

### 31.2 Inputs the AI Accepts

A `BestFitCornerRequest` carries every piece of evidence the AI is allowed to reason about — typed so the deliberation prompt can cite each source:

```typescript
interface BestFitCornerRequest {
  /** Existing canvas features the AI may use as constraints. */
  candidateFeatures: Array<{
    featureId: string;
    role: 'WALL' | 'BEARING_REF' | 'OFFSET_REF' | 'OTHER';
    /** Surveyor-asserted endpoint coordinates, when partial. */
    assertedEndpoints?: Point2D[];
  }>;
  /** POINTs the AI should treat as fixed (already-measured corners). */
  fixedPoints: Array<{ pointId: string; position: Point2D; role?: string }>;
  /** Optional uploaded sketch (PNG / JPG / PDF page). */
  sketch?: { dataUrl: string; mimeType: string };
  /** Surveyor-typed dimensional notes — free-text, but the prompt
   *  understands a small DSL for the common forms:
   *    "wall A → wall B = 24 ft"
   *    "interior angle at SE = 90°"
   *    "diag NW-SE = 38.42 ft"  */
  notes?: string[];
  /** Conventions the AI should respect when building corners. */
  conventions?: {
    rectilinearAssumption?: boolean;     // default: true for "house" / "shed"
    minInteriorAngleDeg?: number;        // default: 30°
    snapToGridFt?: number | null;        // default: null
    units?: 'FT' | 'M';                  // default: per drawing
  };
  /** Free-text intent — passed to the LLM verbatim. */
  surveyorPrompt: string;                // "find the missing NW corner"
}
```

### 31.3 Output: Candidate Corner Sets

A single request yields a `BestFitCornerResponse` with **N** candidate solutions (typically 1–5):

```typescript
interface BestFitCornerResponse {
  candidates: BestFitCandidate[];
  discrepancies: Discrepancy[];
  clarifyingQuestions: ClarifyingQuestion[];
  /** Single-paragraph plain-language summary of what the AI did. */
  summary: string;
  /** Tokens / latency / model version for audit. */
  audit: { model: string; latencyMs: number; tokensIn: number; tokensOut: number };
}

interface BestFitCandidate {
  id: string;
  /** Tier-coloured banner the ghost render uses. */
  tier: 1 | 2 | 3 | 4 | 5;            // 5 = highest confidence
  confidence: number;                   // 0–100
  /** Plain-language why-this-corner. */
  rationale: string;
  /** Geometry mutations the surveyor would commit on confirm. */
  mutations: Array<
    | { type: 'ADD_POINT'; position: Point2D; properties: Record<string, unknown> }
    | { type: 'EXTEND_FEATURE'; featureId: string; toPoint: Point2D }
    | { type: 'TRIM_FEATURE'; featureId: string; toPoint: Point2D }
    | { type: 'ADD_LINE'; start: Point2D; end: Point2D; layerId: string }
    | { type: 'BUILD_POLYGON'; vertices: Point2D[]; layerId: string }
  >;
  /** Per-mutation residual error — distance the candidate
   *  drifts from the closest piece of evidence. Drives the
   *  tier banding. */
  residualMaxFt: number;
  residualMeanFt: number;
  /** Which evidence pieces this candidate honours / breaks. */
  honoursEvidence: string[];
  conflictsWith: string[];
}

interface Discrepancy {
  /** "Wall A length disagrees with the measured chord." */
  message: string;
  /** Pointer back to which inputs disagreed. */
  evidenceIds: string[];
  severity: 'WARNING' | 'ERROR';
  /** Suggested fix the surveyor can one-click. */
  proposedFix?: { description: string; mutations: BestFitCandidate['mutations'] };
}

interface ClarifyingQuestion {
  /** "Is the building a perfect rectangle, or could the SE corner
   *  be skewed?" */
  question: string;
  /** Answer chips the surveyor can click without typing. */
  answers: Array<{ label: string; intent: string }>;
}
```

### 31.4 Deliberation Prompt

The AI uses the same prompt-caching infrastructure §17 already wires (one cached system message describing the surveyor's conventions, then a per-request user message with the typed `BestFitCornerRequest`). The system message documents:

- The deterministic helpers available — the model is instructed to express every mutation as a sequence of those helpers (`lineLineIntersection`, `lineCircleIntersections`, etc.) so the surveyor can audit the geometry. The model is **not** allowed to invent new geometry algorithms in its rationale; that keeps audits fast.
- The tier rubric (matches §11): tier 5 ⇔ all evidence honoured + residual < 0.05 ft, tier 4 ⇔ 0.05–0.15 ft, tier 3 ⇔ 0.15–0.5 ft, tier 2 ⇔ 0.5–1.5 ft, tier 1 ⇔ > 1.5 ft (always proposed but always asks a clarifying question first).
- The discrepancy rubric: anything > 0.1 ft from a measured value is a WARNING; > 0.5 ft is an ERROR; closure errors > 0.05 ft × leg-count are flagged regardless.
- Conventions for reasonable corners: minimum interior angle defaults to 30°; rectilinear-assumption is on by default for any prompt mentioning "house", "shed", "garage", "fence corner".

User-message structure:

```
SURVEYOR PROMPT
{surveyorPrompt}

EVIDENCE
- Feature wall-1 (LINE): start (123.4, 456.7) end (140.2, 456.9) — wall, asserted
- Feature wall-2 (LINE): start (140.0, 456.7) end (140.0, 480.1) — wall, asserted
- Fixed point P-3 (NE corner): (140.2, 480.1)
- Note: "front wall = 18.0 ft"
- Note: "interior angle SE = 90°"
- Sketch: {{embedded image}}

CONVENTIONS
{conventions JSON}

TASK
Propose 1–5 candidate corner sets. For each, list the geometric
mutations expressed as deterministic-helper invocations. Cite
which evidence pieces each candidate honours or breaks. Flag any
discrepancies. If anything is ambiguous, write the smallest
clarifying question.
```

### 31.5 Discrepancy Detection (Deterministic Pre-Pass)

Before the model sees the request, a deterministic pre-pass runs lightweight checks so the obvious problems never burn tokens:

- **Length closure** — sum of declared wall lengths around a closed polygon. If the closure error > tolerance, raise `Discrepancy(severity=ERROR, message="Sum of declared lengths doesn't close — Δ = 0.42 ft")`. Both the deterministic finding and the LLM's rationale include this.
- **Angle consistency** — for any declared interior angle that contradicts the angle implied by the existing geometry (within tolerance), raise a `WARNING`.
- **Duplicate evidence** — two `notes[]` lines that disagree (e.g. "front = 18.0 ft" + "front = 18.5 ft"). Raise `ERROR` with both note ids.
- **Out-of-range conventions** — surveyor says "interior 90°" but pre-existing geometry shows 87°. Raise WARNING with the proposed fix "snap existing vertex to make 90° exact."

These deterministic findings join `discrepancies[]` regardless of what the model returns; the model is told about them so it can incorporate them into its rationale.

### 31.6 Ghost Preview Workflow

Same render-path as the deterministic Intersect Tool's ghosts (§11.6.5), with these additions:

- **Tier-coloured halo** — each candidate's POINTs and added LINEs render with the tier-glow already used by the AI confidence cards. Tier 5 = green, tier 4 = teal, tier 3 = yellow, tier 2 = orange, tier 1 = red.
- **Discrepancy badges** — when a discrepancy is anchored to a specific feature, the canvas paints a small `⚠` badge near the offending geometry; clicking the badge scrolls the modal's discrepancy list to the matching entry.
- **Clarifying-question chips** — between the candidate list and the Confirm/Cancel row, every `ClarifyingQuestion` renders as a chip group. Clicking an answer chip dispatches a follow-up request to the AI with the same context + the surveyor's answer; the modal updates in place.
- **Compare mode** — checkbox that overlays *all* candidates simultaneously at low opacity, so the surveyor can see how they differ. The active candidate stays full opacity.

### 31.7 Confirmation & Persistence

- **Single Confirm** — kept candidate's `mutations[]` are applied as one batch undo entry (`makeBatchEntry` already supports the mutation kinds we need — `ADD_FEATURE`, `MODIFY_FEATURE`).
- **Reject all** — closes the modal without mutation. The request + response are still logged to the AI audit table for debugging.
- **Per-mutation provenance** — every emitted feature carries `properties.aiBestFitCandidateId`, `aiBestFitTier`, `aiBestFitRationale`, `aiBestFitRequestId` so the LIST tool surfaces "this point came from AI candidate 2 of request abc-123." Surveyors can audit forever.
- **Rerun with edits** — after confirming, the modal stays open with a "Refine…" option. Surveyor edits a note or convention chip and the AI returns an incremental response keyed off the same request id (lets us cache 80% of the system context).

### 31.8 Sketch Upload Pipeline

For the upload-a-hand-sketch case:

1. Surveyor picks a PNG / JPG / PDF page; client downscales to ≤ 2048 px on the long edge to keep the prompt cheap.
2. Pre-pass passes the image to a vision model (Claude Sonnet) with a focused prompt: *"Read every dimension annotation, every angle annotation, and every label. Return JSON: { dimensions: [{ from, to, value, unit }], angles: [{ at, valueDeg }], labels: [{ at, text }] }."*
3. The OCR JSON merges into `BestFitCornerRequest.notes[]`.
4. Original image is stored alongside the request in IndexedDB so the surveyor can revisit it from the history list.
5. Per-extraction confidence → low confidence (e.g. handwritten 8 vs. 3) raises a deterministic `Discrepancy(severity=WARNING)` plus a `ClarifyingQuestion` ("Is wall A 8.0 ft or 3.0 ft?") before the geometric pass even runs.

### 31.9 State, Stores, and Persistence

New zustand store `useBestFitCornerStore`:

```typescript
interface BestFitCornerStore {
  /** Current request being prepared / awaiting response. */
  pendingRequest: BestFitCornerRequest | null;
  /** Live response from the API. */
  response: BestFitCornerResponse | null;
  /** Which candidate is currently highlighted in the modal. */
  activeCandidateId: string | null;
  /** History of past requests + responses (most recent 20). */
  history: Array<{ request: BestFitCornerRequest; response: BestFitCornerResponse; timestamp: string }>;
  /** UI flags. */
  status: 'IDLE' | 'PREPARING' | 'AWAITING_AI' | 'READY' | 'ERROR';
}
```

Persisted via the existing `partialize` allow-list pattern: only `history` survives reloads (so a surveyor can revisit yesterday's request); everything else is session-scoped.

### 31.10 Acceptance Tests

- [ ] Surveyor opens Intersect dialog, clicks "✨ Find best-fit corner" with two perpendicular wall lines visible — AI returns 1 candidate at the implied corner; ghost renders tier-5 green
- [ ] Same setup but with an asserted note "front wall = 18.0 ft" that contradicts the visible geometry — AI surfaces a discrepancy WARNING + a clarifying question; ghost still renders but tagged tier 3
- [ ] Surveyor uploads a sketch of a 24×36 rectangle with one dimension scribbled illegibly — vision pre-pass surfaces a clarifying question about that specific dimension before the geometric pass runs
- [ ] Multi-candidate response: AI proposes 3 candidates, surveyor cycles with ↓/↑, ghosts highlight, picks #2, Confirm applies only #2's mutations as one batch undo entry
- [ ] Rerun with edit: surveyor changes a convention chip ("perfect rectangle = NO"), modal updates with a fresh response in < 3 s (because the system prompt is cached)
- [ ] Closure error 0.42 ft on a 4-leg traverse → deterministic pre-pass raises ERROR before the LLM is called; modal renders the error + a "Re-measure leg 3?" suggestion
- [ ] Per-feature provenance: confirmed POINT carries `aiBestFitCandidateId`, `aiBestFitTier`, `aiBestFitRationale`; LIST tool shows the rationale string
- [ ] Drawing Chat path: typing "find the missing NW corner of the house" routes to BEST_FIT_CORNER and pops the modal
- [ ] Reject-all path: modal closes without mutation; request + response still appear in the AI audit log
- [ ] Rectilinear-assumption convention defaults to ON for "house" / "shed" / "garage" prompts and OFF for "fence" / "trail" prompts
- [ ] Compare mode: checkbox overlays all candidates at low opacity; active candidate stays full opacity; surveyor visually picks the right one

### 31.11 Implementation Sequence (AI side)

Each slice is shippable on its own — the modal stays useful at every step:

1. **Slice A** — `BestFitCornerRequest` / `BestFitCornerResponse` types + `useBestFitCornerStore` shell. No API call yet; the modal renders a hard-coded mock response so the UI can be built and tested.
2. **Slice B** — Modal UI: candidate list + tier-coloured ghosts + Confirm/Reject. Reuses the deterministic Intersect modal's render path from §11.6.
3. **Slice C** — Deterministic pre-pass (closure error, angle consistency, duplicate-evidence check). Wired as `pendingRequest → discrepancies` before any LLM call. Tests cover the four pre-pass cases.
4. **Slice D** — Claude API integration. System prompt + tier rubric + helper-DSL constraint. Per-request prompt caching keyed on the system message. `audit` block populated.
5. **Slice E** — Drawing-Chat dispatch path: natural-language → `BEST_FIT_CORNER` action → modal opens populated.
6. **Slice F** — Sketch upload: file picker, downscaler, vision pre-pass, OCR-confidence-driven clarifying questions.
7. **Slice G** — Per-mutation provenance + LIST tool integration so surveyors can audit any AI-proposed feature in the property panel.
8. **Slice H** — Rerun-with-edit flow + history list (most recent 20 requests, persisted).
9. **Slice I** — Compare mode + discrepancy badges on the canvas.
10. **Slice J** — Acceptance test pass + documentation.

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
- [x] Offset in code suffix `BC02_10R` parsed: 10' right offset detected — `__tests__/cad/ai/offset-resolver.test.ts` §3069: `detectSuffixOffsets` returns `{ offsetDistance: 10, offsetDirection: { type: 'PERPENDICULAR_RIGHT' }, resolutionMethod: 'SUFFIX', confidence: 95 }`. Companion tests cover decimal distance + case-insensitive direction tokens (`_5.5l`, `_2.0F`, `_3.0b`) and rejection of malformed forms (no distance, zero distance, unknown direction).
- ~~Offset in point description `"10L BC02"` parsed correctly~~ — deferred: `lib/cad/ai-engine/offset-resolver.ts:18` explicitly defers description-text parsing to a follow-up slice that needs the worker plumbing for Claude-assisted field-note extraction. Suffix + companion-pair paths already cover the surveyor's most common case (Trimble Access embeds the offset in the rawCode).
- [x] Perpendicular left offset: true position is 90° CCW from bearing at correct distance — §3071: with a reference bearing of azimuth 0° (due north), `applyOffset(origin, 10, PERPENDICULAR_LEFT, 0)` returns `(-10, 0)` — i.e. 10' due west, the 90° CCW direction.
- [x] Perpendicular right offset: true position is 90° CW from bearing at correct distance — §3072: same input with `PERPENDICULAR_RIGHT` returns `(10, 0)`; non-cardinal bearing (azimuth 45°) returns `(+7.0711, -7.0711)` — i.e. azimuth 135°, which is bearing+90°.
- [x] Companion pair (`35` + `35off`) detected and resolved — §3073: `detectCompanionPairs` returns a `COMPANION_PAIR` shot for the `35off` point with `requiresUserConfirmation: true`. When the same offset point is already covered by a suffix hit, the pair detector skips it (suffix wins per the dedupe priority order).
- [x] Ambiguous offset (no reference bearing available) → added to question queue — §3074: a companion pair where the only other point is itself an offset companion produces zero non-offset neighbours; `computeReferenceBearing` returns null; the shot lands in `ambiguousShots` with `requiresUserConfirmation: true`. The §28 question queue gate watches that flag.
- [ ] Offset shots rendered at 40% opacity in "show all" mode *(canvas renderer integration — needs `OffsetShot` → render pipeline wiring; tracked separately)*
- [x] True positions replace offset positions in all feature assembly — §3076: `resolveOffsetsSync` emits a `SurveyPoint` in `truePoints` whose easting/northing is the offset-applied position; `resolvedShots[i].truePointId` links the offset point to its true counterpart so Stage 2 can swap before assembly. With neighbours at (0,0) and (100,100), an offset at (50,50) + `BC02_10R` produces a true point at (57.071, 42.929) — exactly 10' right of the NE bearing line.

### Online Data Enrichment
- ~~County parcel data fetched for test parcel in Bell County, TX~~ — deferred: per-county adapter requires per-jurisdiction auth + rate-limit handling + tax-roll URL discovery; that work lives in the Self_healing_adapter_system_plan / RECON pipeline, not Phase 6. The enrichment shape already exposes `parcelId / legalDescription / acreage` slots — the RECON ingestion path can populate them via a future cross-domain hook.
- [x] PLSS data (township, range, section, abstract) returned — `lib/cad/ai-engine/enrichment.ts:fetchPlssFields` queries the BLM's national PLSS cadastral ArcGIS service (layer 2) with a point-in-polygon at the project centroid; parses `TWNSHPLAB` into township/range and `SECTION_ID` into the section number. Texas surveys mostly fall outside the PLSS grid → null is the common return; the source tag distinguishes `blm_plss_empty` (no hit) from `blm_plss` (data) and `blm_plss_error:…` (network failure). 2 vitest cases in `__tests__/cad/ai/enrichment.test.ts` cover the parse + the no-hit case.
- [x] FEMA flood zone data returned with panel number — `lib/cad/ai-engine/enrichment.ts:fetchFemaFloodZone` queries FEMA's NFHL ArcGIS service (layer 28) and returns `<FLD_ZONE> (panel <FIRM_PAN>)`, e.g. `"AE (panel 48027C0455F)"`. Returns the zone alone when the panel id is missing, and null when the point falls outside every published panel. 3 vitest cases cover panel-present, panel-missing, and no-features-found.
- [x] Elevation data returned for boundary corner points (USGS 3DEP @ `lib/cad/ai-engine/enrichment.ts`; runs in parallel with the pipeline in `app/api/admin/cad/ai-pipeline/route.ts`)
- [x] All enrichment sources failing gracefully (non-blocking — warnings added)
- [x] PLSS fields auto-populated in title block from enrichment — `lib/cad/store/ai-store.ts:setResult` now dispatches a `cad:enrichmentReady` window event when `result.enrichmentData` carries any non-null PLSS or flood-zone field. `app/admin/cad/CADLayout.tsx` listens and merges the values into `settings.titleBlock.notes` as `PLSS: T2N R6W Sec 12` + `Flood Zone: AE (panel 48027C0455F)` lines. The merge is sticky-safe: it skips when the notes already contain a `PLSS:` or `Flood Zone:` marker (a prior pipeline run or the surveyor's manual edits stay intact). Title-block doesn't have dedicated PLSS/flood-zone fields yet so notes is the right merge target without schema churn; future slice can promote to first-class fields once the surveyor workflow is observed.

### Deliberation & Clarifying Questions
- [x] Deliberation runs after stage 6 and before drawing preview (`runDeliberation` in `lib/cad/ai-engine/deliberation.ts`, called from `pipeline.ts`)
- [x] Deliberation generates no dialog when overall confidence ≥ 90 and no blocking issues (`shouldShowDialog` flag short-circuits per §28.1)
- [x] Deed discrepancy (bearing off > 2°) generates BLOCKING/HIGH question
- [x] Unrecognized code generates optional MEDIUM question
- [x] Fence code → material question generated (LOW priority)
- [x] Building code → material question generated (LOW priority)
- [x] Duplicate shots → "which is final?" question generated — `lib/cad/ai-engine/deliberation.ts` now has a step-7 `buildDuplicateShotQuestions` builder. `DeliberationInputs.pointGroups` is wired through `pipeline.ts`; the builder iterates groups whose `deltaWarning` flag is set AND that carry both a CALC and a field (SET/FOUND) position. The emitted HIGH-priority `DUPLICATE_SHOT` question pre-fills the field shot as the suggested answer (matching Phase 2's `finalPoint` pick), with `'Use calculated position'` and `'Flag for surveyor review'` as alternatives. 4 vitest cases at `__tests__/cad/ai/deliberation-duplicate-shot.test.ts` cover the positive case (calc + SET 0.5 ft apart → question fires), the no-warning case (delta below 0.10 ft threshold → silent), the SET-only case (hasBothCalcAndField=false → silent), and the calc + FOUND variant ("Use found shot (current)" label).
- [x] User answering blocking questions enables "Draw Now" button (`app/admin/cad/components/QuestionDialog.tsx`)
- [x] Answers applied to pipeline re-run; scores improve after good answers (`rerunWithAnswers` in `lib/cad/store/ai-store.ts` + `applyAnswerEffects` in `lib/cad/ai-engine/apply-answers.ts`; FEATURE_ATTRIBUTE answers stamp `feature.properties.material`, deed/code/offset answers logged as warnings until Stage-1 reclass + offset disambig wiring lands)
- [x] "Skip All Optional" dismisses all non-blocking questions (`skipAllOptionalQuestions` in `lib/cad/store/ai-store.ts`)

### Drawing Preview & Confidence Cards
- [x] Two-panel layout renders (canvas left, cards right) — `AISidebar` Review tab now renders the confidence-card list right of the canvas. The dedicated full-screen preview screen is a follow-up; the sidebar covers the daily workflow.
- [x] Cards sorted by confidence ascending by default (least confident first) — `CONFIDENCE_ASC` is the initial sort.
- [x] Card border color matches tier color correctly — `TIER_COLORS` maps tier 1–5 to red→green; left-border uses the tier color.
- [x] Confidence bar fills correctly for each score — per-card bar fills `confidence%` with the tier-colored gradient stop.
- [x] Hovering a card highlights the feature on the canvas — `useUIStore.hoveredFeatureId` carries the bridge; the AISidebar `ConfidenceCard` sets it on `onMouseEnter` / `onFocus`; CanvasViewport's `drawSidebarHoverRing` reads the cached feature bbox and draws a tier-colored 2-px outline + a soft 4-px halo around the matching feature on the existing `selectionGraphics` layer.
- [x] Clicking a card opens the element explanation popup — wired through `useAIStore.openExplanation(featureId)`.
- [x] Sort controls change card order correctly (all 4+ sort modes) — `CONFIDENCE_ASC / CONFIDENCE_DESC / ALPHA / TIER / CATEGORY`.
- [x] Search filters cards by text match on title/description — title + category + flags substring filter.
- [x] "Accept Drawing" opens confirmation dialog — `ReviewQueuePanel.tsx` now has a sticky footer with `↻ Re-analyze` (left) and `✓ Accept Drawing` (right). Clicking Accept opens a confirmation modal with the run's totals (accepted / modified / rejected / pending) and a destructive-action note. The Accept button itself disables when `summary.pendingCount > 0` with a tooltip explaining why ("review them first") so the surveyor can't skip past unreviewed items. Confirming dispatches `cad:acceptDrawing` as the audit hand-off; Cancel just closes the modal.
- ~~Accepting creates a version snapshot and triggers Phase 7 editor load~~ — deferred: requires Phase 7 §17 sealing pipeline + version-snapshot store, both forward-looking work not yet shipped. The `cad:acceptDrawing` event already fires on confirm so Phase 7 can wire its listener without touching this dialog again.
- [x] Re-analyze re-runs pipeline and refreshes all cards — new `useAIStore.reanalyze` action re-POSTs `lastPayload` (without folding in any new answers, unlike the existing `rerunWithAnswers`), updates `result`, and respects `deliberationResult.shouldShowDialog` to re-open the clarifying questions when the new run produced blocking issues. The footer button disables + label-swaps to "Re-analyzing…" while `status === 'running'`.

### Per-Element Explanations & Chat
- [x] Every feature has a generated explanation (`generateAutoExplanations` in `lib/cad/ai-engine/element-explanation.ts`; piped through `pipeline.ts` into `result.explanations`)
- [x] Tier 5 explanations are brief (no Claude call) — auto-explanation path is deterministic for all tiers in this slice
- [ ] Tiers 1–4 explanations include full reasoning, data used, assumptions, alternatives — auto path covers data used / assumptions / alternatives; Claude narrative augmentation lands in a follow-up slice
- [x] Confidence breakdown shows all 6 factors with human-readable text (`buildConfidenceBreakdown` walks `ConfidenceFactors` and emits per-factor explanations)
- [x] Chat message sent → Claude responds within 30 seconds (`handleElementChat` in `lib/cad/ai-engine/element-chat.ts` + POST `/api/admin/cad/element-chat`; 45 s handler / 60 s route ceiling)
- [x] "Update This Element" redraw affects only the selected feature — `executeChatAction` REDRAW_ELEMENT branch now runs the full pipeline with the chat instruction folded into `userPrompt` (`"Redraw this element (ids …): …"`), then calls the new `mergePartialPipelineResult` helper to splice ONLY the targeted feature(s) back into the existing result. The helper matches new-feature to old-feature via `properties.aiPointIds` (falling back to `aiLabel`) and rewrites the new feature with the OLD id so the drawing store, review queue, and explanation map keep their keys. Surveyor's prior chat history + Accept/Modify/Reject posture survive the swap; other features are untouched.
- [x] "Redraw This Group" redraw affects all features on same layer — same code path as REDRAW_ELEMENT; the only difference is `action.affectedIds` carries the multi-feature target list that Claude returned. Test coverage at `__tests__/cad/ai/` (all 220 tests still green) ensures the merge helper preserves scores / explanations / review-queue entries for every target.
- [x] "Redraw Full Drawing" re-runs full pipeline (`executeChatAction` REDRAW_FULL re-POSTs `lastPayload` with the chat instruction folded into `userPrompt`)
- [x] Chat history persists within the session (`chatHistory` mutated via `appendChatMessage` in `lib/cad/store/ai-store.ts`)
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

## 32. AI Integration Framework — Four-Mode Architecture

**Goal:** A single coherent framework that defines *how* the surveyor and the AI share control of the drawing. Every AI capability we've specified — point classification (§3), feature assembly (§4), deed reconciliation (§5), best-fit corners (§31), and every future skill — plugs into this framework. The architecture is deliberately small: four modes, one sandbox toggle, one tool registry. Everything else is per-skill detail.

**Architectural commitment.** The AI is a *tool user*, not a renderer. It never writes pixels or bespoke geometry — it calls the same kernels the surveyor calls manually (the operations in `lib/cad/operations.ts`, the dialogs from Phase 8 §11.6/§11.7, etc.). This means every AI-generated feature is a real `Feature` object on a real `Layer`, fully editable the moment it lands. No "AI mode" / "manual mode" data divide.

### 32.1 The Four Modes

| Mode      | Behaviour                                                                                                                                                                  | Sandbox default | When to use                                                                                       |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:---------------:|---------------------------------------------------------------------------------------------------|
| **AUTO**     | AI ingests points + uploads, creates layers, draws the whole drawing end-to-end. Surveyor reviews after. Confidence-gated escalation drops to COPILOT for low-confidence steps. | ON              | Routine subdivisions / boundary jobs with well-known code dictionaries and good reference docs.   |
| **COPILOT** *(default)* | AI proposes one action at a time → ghost preview on canvas + confidence card in chat → surveyor hits **Accept** / **Modify** / **Skip**. Modify reopens the prompt so the surveyor can redirect ("draw the rear lot lines as ARCs, not LINES"). | Surveyor toggle | The default for a fresh project. Surveyors trust AI faster when they've watched it work a few times. |
| **COMMAND**  | Surveyor drives via chat sidebar, command palette, or right-click menu: "create a BACK_OF_CURB layer from all BC-* points as a polyline." AI executes that one task, returns. | OFF (live)      | Targeted clean-up work — surveyor knows exactly what they want done.                              |
| **MANUAL**   | No AI in the loop. All the tools from Phases 1–5/8.                                                                                                                       | N/A             | Surveyor wants full hand control, or AI is unavailable.                                            |

The mode is a first-class setting on the `AIStore` (§32.11). The status bar always shows the current mode + a one-click switcher.

### 32.2 Default Mode + Onboarding

- **Fresh project default**: COPILOT with sandbox ON.
- **First-time-AI nudge**: on the first project import, a one-time tooltip explains the four modes and the keyboard switch. The surveyor's last-used mode persists per workspace (not per project).
- **Mode-switch keybind**: `Ctrl+Shift+M` cycles AUTO → COPILOT → COMMAND → MANUAL → AUTO. Discoverable via the command palette as `ai.switch-mode`.

### 32.3 Sandbox vs. Live Target

Sandbox writes route to a parallel set of layers named `DRAFT__<targetname>` (double-underscore prefix). When the surveyor approves the draft, a single click promotes a draft layer to its target via the existing **Layer Transfer** kernel (Phase 8 §11.7) — no new geometry code, just a `MOVE` operation. Per-mode defaults:

- **AUTO** → sandbox ON. Surveyor reviews the full draft drawing, promotes layers individually or all-at-once.
- **COPILOT** → toggle in the dialog. Default ON; surveyor can flip to live for confident edits.
- **COMMAND** → live by default. Surveyor explicitly asked; treating it as a draft would feel paternalistic.
- **MANUAL** → N/A.

The sandbox toggle is per-action in COPILOT, not session-wide — surveyor can sandbox a risky proposal while keeping low-risk ones live.

### 32.4 Mode Switching Mid-Session (Confidence Escalation)

Treat the mode as a property of the *next decision*, not the session. In AUTO, when AI confidence on a single decision falls below the threshold (§32.5), the framework silently escalates to COPILOT *for that decision only*:

1. AUTO is drawing, confidence on a layer assignment is 0.62 (below the 0.85 threshold).
2. Framework pauses the AUTO loop. A COPILOT card opens with the proposal + the ambiguity ("not sure whether codes labelled `XX-*` belong on `UTILITIES` or `STRUCTURES` — which layer?").
3. Surveyor answers. AI continues AUTO from where it paused.
4. The answer is persisted to the project's **code-resolution memory** (a per-project key → value map) so the same ambiguity isn't asked twice in the same project.

**Manual pause hotkey**: `Ctrl+Shift+P` halts AUTO at the next safe boundary (between features, not mid-feature). The framework drops the surveyor into COPILOT with the next pending action queued for review.

### 32.5 Confidence Threshold Settings

Per-project setting `aiConfidenceThreshold`, default 0.85. Slider in the AI Settings panel labelled "Auto-approve threshold." Below the threshold, AUTO escalates; above, it commits without asking.

Two derived behaviours:
- **Threshold = 1.0** — AUTO never auto-approves anything; equivalent to COPILOT.
- **Threshold = 0.0** — AUTO never asks; equivalent to "trust everything."

The threshold's effect is visible in COPILOT too: cards above threshold show a green "auto-approvable" chip so the surveyor learns where AUTO would have committed without intervention.

### 32.6 Reference Document Recommendation (Not Required)

A points file alone is enough to run any mode. The framework strongly *recommends* reference docs (deed, recorded plat, hand sketch, prior drawings) but does not block. The new-project wizard shows:

```
┌─ Reference Documents (recommended) ─────────────────────┐
│ Adding deed PDFs / recorded plats / sketches gives the  │
│ AI much higher confidence on:                            │
│   • Layer assignments (matches your project conventions) │
│   • Boundary closure (validates against deed calls)      │
│   • Symbol placement (recognises plat-specific markers)  │
│                                                          │
│ [+ Upload reference document]    [Skip — points only]   │
└──────────────────────────────────────────────────────────┘
```

When the surveyor proceeds without references, every AI confidence score is dampened by a configurable factor (default × 0.85) and a status-bar chip reads **"Running without reference docs — confidence reduced."** The chip is clickable to add references after the fact; AI re-runs incremental reconciliation on the existing draft.

### 32.7 Provenance Stamps + Replay

Every AI-generated feature gets four properties stamped via the same `feature.properties` channel we already use for `intersectSourceAId` etc.:

- `aiOrigin` — enum: `CODE_PARSE` / `FEATURE_ASSEMBLY` / `DEED_RECONCILE` / `BEST_FIT_CORNER` / `COMMAND_<verb>` / etc.
- `aiConfidence` — 0–1 float.
- `aiPromptHash` — SHA-256 of the prompt that produced the feature, so identical re-runs are deduplicable.
- `aiSourcePoints` — JSON array of point IDs the AI cited as evidence.
- `aiBatchId` — UUID grouping all features produced in one AI turn (one AUTO run, one COPILOT proposal, one COMMAND task).

Two payoffs:
- **"Why did AI draw this?"** — right-click any feature → menu entry opens an explanation popup with the prompt, the reasoning, and the cited evidence (§30.3 already specs the popup; this just supplies the data).
- **Replay** — the AI sequence is replayable on a new points file (`File → Replay AI sequence on new points…`). Useful for "we re-shot the cul-de-sac; rebuild the drawing with the same conventions."

### 32.8 Tool Registry (the AI's API Surface)

Every operation the AI is allowed to invoke is declared as an Anthropic tool definition in `lib/cad/ai/tool-registry.ts`. Each entry has:
- A JSON schema for arguments.
- A pointer to the same kernel function the manual UI calls.
- An optional confidence/preview wrapper that lets the framework either render a ghost (COPILOT) or commit immediately (AUTO/COMMAND).

Initial tool registry (each one wraps an existing kernel; no new geometry code):

| Tool name              | Wraps                                       | Why                                            |
|------------------------|---------------------------------------------|------------------------------------------------|
| `addPoint`             | `drawingStore.addFeature` (POINT)           | Drop a point at coords.                        |
| `drawLineBetween`      | `drawingStore.addFeature` (LINE)            | Connect two points.                            |
| `drawPolylineThrough`  | `drawingStore.addFeature` (POLYLINE)        | Connect N points in order.                     |
| `drawArcThrough3`      | Phase 6 Kasa fit + addFeature (ARC)         | Fit an arc through 3+ points.                  |
| `createLayer`          | `drawingStore.addLayer`                     | New layer with style.                          |
| `applyLayerStyle`      | `drawingStore.updateLayer`                  | Update style on existing.                      |
| `transferToLayer`      | Phase 8 §11.7 kernel                        | Move/duplicate selection to layer.             |
| `intersectLineLine`    | Phase 8 §11.6 `lineLineIntersection`        | Drop an intersection POINT.                    |
| `intersectLineCircle`  | Phase 8 §11.6 `lineCircleIntersections`     | Multi-candidate intersect.                     |
| `intersectRayLine`     | Phase 8 §11.6 `rayLineIntersection`         | Bearing-driven intersect.                      |
| `bestFitCorner`        | Phase 6 §31 backend                         | AI-deliberated corner.                         |
| `runClosureCheck`      | Phase 6 §10 / closure helpers               | Validate a polygon's closure.                  |
| `lookupReferenceDoc`   | Phase 6 §5/§6 OCR catalog                   | Query the uploaded references.                 |
| `askSurveyor`          | Framework — opens a clarifying-question card | Ask a question; surveyor's answer becomes part of the AI's context. |
| `recordCodeResolution` | AIStore.codeResolutionMemory                | Persist a code disambiguation.                 |

The list grows as more skills land. Every tool returns a structured `{ ok: boolean; result?: T; reason?: string }` envelope so the AI can react to failures (e.g. layer name collision) rather than blow up.

### 32.9 COMMAND Mode Entry Points

1. **Chat sidebar** (always visible in COMMAND mode, collapsible in other modes). Free-form natural language. Chat history persists per project.
2. **Command palette** (`Ctrl+K`, already exists). New entries:
   - `ai.parse-codes` — run code interpretation on current points file.
   - `ai.fill-corners` — propose best-fit corners for any nearly-closed polygons.
   - `ai.check-closure` — closure report on the active layer.
   - `ai.create-layer-from-codes` — opens a dialog: code pattern + layer name + draw-as (point / polyline / polygon / arc).
   - `ai.explain-feature` — explain the focused feature (route to §30.3 popup).
3. **Right-click → "Ask AI about this…"** — context-aware. The current selection becomes part of the prompt; the AI knows it's reasoning about *those specific features*.

In COMMAND mode, every AI call still produces a confidence card; the surveyor can dismiss it with Escape or hit Accept.

### 32.10 Per-AI-Action Undo Semantics

Every AI tool call generates its own undo entry — same pattern as the Intersect Slice 7 single-drop / batch-drop split:

- **Single-feature tool call** (`addPoint`, `drawLineBetween`) → `makeAddFeatureEntry`.
- **Multi-feature tool call** (`drawPolylineThrough`, `bestFitCorner` with 3 features) → `makeBatchEntry` with a description like *"AI: draw BACK_OF_CURB polyline (12 vertices)"*.
- **AUTO turn** producing N features → each tool call has its own undo entry **plus** a single virtual *"Undo AI batch"* command that pops every entry produced in that turn (groupable via `aiBatchId`).

The surveyor can therefore rip out one bad polyline without losing the surrounding layer assignments. The batch undo is exposed via the standard undo stack with a chevron sub-menu.

### 32.11 State, Stores, and Persistence

New state in `AIStore`:

```typescript
interface AIStoreState {
  mode: 'AUTO' | 'COPILOT' | 'COMMAND' | 'MANUAL';
  /** Per-action sandbox preference. Default per mode (see §32.3). */
  sandbox: boolean;
  /** Confidence threshold (0–1). AUTO escalates below this. */
  autoApproveThreshold: number;
  /** Currently-pending COPILOT card (one at a time). */
  pendingProposal: AIProposal | null;
  /** Queued AUTO actions (FIFO). When non-empty, AUTO is mid-run. */
  autoQueue: AIToolCall[];
  /** Code disambiguations the surveyor has answered, scoped to the project. */
  codeResolutionMemory: Record<string, { layerId: string; answeredAt: number }>;
  /** AI session timeline for replay (§32.7). */
  aiBatches: AIBatchLog[];
  /** Live chat transcript (COMMAND mode + ambient). */
  chatMessages: ChatMessage[];
}
```

Persisted via `zustand persist`, allow-list in `partialize` — `chatMessages` is capped at the last 500 entries to keep localStorage payloads small.

### 32.12 Acceptance Tests

- [x] Fresh project loads in COPILOT mode by default with sandbox ON. *— Slice 1 initialises `useAIStore` with `mode: 'COPILOT'`, `sandbox: true`, `autoApproveThreshold: 0.85`. Persisted via zustand `persist` with a strict `partialize` allow-list so subsequent loads honour the surveyor's last setting.*
- [x] `Ctrl+Shift+M` cycles through the four modes; the status bar updates each press. *— Slice 1 registers `ai.cycleMode` in the hotkey registry (default `ctrl+shift+m`, GLOBAL); the dispatcher calls `useAIStore.cycleMode()` and fires a `cad:commandOutput` toast with the new mode. `StatusBar` subscribes to `mode` + `sandbox` and re-renders the chip + sandbox dot on each cycle; clicking the chip is equivalent to the hotkey.*
- [x] AUTO running below the confidence threshold escalates to COPILOT for that step; the surveyor's answer persists in `codeResolutionMemory` and the same ambiguity is not asked again in the project. *— Slice 8 ships the `AIAutoRunner` headless component: when `mode === 'AUTO'` and the head proposal's confidence ≥ `autoApproveThreshold`, it auto-accepts on the next macrotask; below threshold the proposal stays queued so the surveyor handles it via `CopilotCard` (effectively a per-decision COPILOT step). `codeResolutionMemory` (`Record<UPPER_CASE_CODE, { layerId, answeredAt }>`) is persisted via `partialize`; `recordCodeResolution` / `forgetCodeResolution` mutate it; `proposeFromPrompt` threads it into `ProjectContext` so the system prompt's "Previously-resolved point codes" block lets Claude reuse the surveyor's answers without re-asking. Sidebar slider + counter + one-click Clear surface the state.*
- [x] `Ctrl+Shift+P` pauses AUTO at the next feature boundary; the next queued action opens as a COPILOT card. *— Slice 11 adds `ai.pauseAuto` (default `Ctrl+Shift+P`, GLOBAL); the dispatcher in `useHotkeys` flips mode to COPILOT + appends a SYSTEM transcript turn explaining the switch. The Slice 8 escalation runner only auto-accepts when `mode === 'AUTO'` so the very next queued proposal stays for the surveyor to review via `CopilotCard`. The sidebar's purple AUTO strip mirrors the hotkey as a one-click button when mode === AUTO.*
- [x] COPILOT card surfaces Accept / Modify / Skip; Modify reopens a chat input pre-populated with the proposal so the surveyor can redirect. *— Slice 5 ships `CopilotCard` (mounted in `CADLayout`) with all three buttons + a per-card sandbox toggle that defaults to the proposal's `sandboxDefault` then to the store-wide `aiStore.sandbox`. Accept routes through `useAIStore.acceptHeadProposal(sandbox)` which calls `executeProposal` (tool registry + provenance + sandbox routing). Skip dequeues without executing. Slice 14 finishes Modify: skips the current proposal so it doesn't auto-execute, opens the sidebar via `openCopilotWithPrompt` seeded with `"Revise the last proposal — <toolName>: \"<description>\". I need it changed because: "`, and fires `cad:focusAICopilot` so the textarea takes focus with the cursor at the end. The surveyor edits the redirect, Ctrl+Enter sends, the AI re-emits via `proposeFromPrompt`. Canvas paints a dashed amber ghost (`cad:copilotPreview` → `renderCopilotPreview`) for geometry-producing proposals; layer-op proposals show their result in the layer panel after Accept.*
- [x] Sandbox-on AUTO writes features to `DRAFT__*` layers; one click in the layer panel promotes a draft layer (via the §11.7 Layer Transfer kernel). *— Slice 4 wires the `sandbox?: boolean` arg through the feature-producing tools (`addPoint`, `drawLineBetween`, `drawPolylineThrough`). When true, `resolveLayerId` redirects to the matching `DRAFT__<targetname>` layer (auto-created via `ensureDraftLayerFor`, style mirrored from the target). The LayerPanel renders a "✈ Promote" pill on every DRAFT__ layer that fires `promoteDraftLayer`, which calls `transferSelectionToLayer` with `keepOriginals: false` and removes the empty draft on success. AUTO mode's per-mode sandbox default (set by `cycleMode` from Slice 1) wires together end-to-end so AUTO runs land in sandbox by default and surveyor approval happens with one promote click.*
- [x] Project created without reference docs shows a "running without reference docs" chip and dampens all confidence scores by × 0.85; uploading a deed after the fact triggers an incremental reconciliation. *— Slice 9 ships the amber chip in `AICopilotSidebar`'s settings strip ("Running without references — confidence ×0.85") that toggles inline to a `ReferenceDocsManager`. `proposeFromPrompt` applies the dampening to every incoming proposal's `confidence` + `provenance.aiConfidence` when the manifest is empty. The system prompt branches between a "NONE uploaded" warning and a catalogue of uploaded `KIND: name` entries. Adding a doc after the fact lifts the dampening from the next turn onward; an "incremental reconciliation" pass over already-accepted features is a follow-up slice — the chip flip + future-turn dampening removal are wired here.*
- [x] Every AI-generated feature has `aiOrigin`, `aiConfidence`, `aiPromptHash`, `aiSourcePoints`, `aiBatchId` populated. *— Slice 3 stamps the five fields onto `feature.properties` via `stampProvenance` for every tool-registry call that supplies a `provenance` arg (`addPoint`, `drawLineBetween`, `drawPolylineThrough`). `aiSourcePoints` is JSON-encoded to fit the primitive-only properties channel; `readProvenance` decodes it on read. Provenance-less calls produce features without the stamps so manual UI calls stay clean.*
- [x] Right-click any AI-generated feature → "Why did AI draw this?" opens the explanation popup (§30.3) populated from the provenance stamps. *— Slice 3 mounts a Sparkles-iconned "Why did AI draw this?" row at the top of `FeatureContextMenu` (gated on `hasProvenance(feature.properties)`) that fires `useAIStore.openExplanation(feature.id)`. The existing §30.3 `ElementExplanationPopup` renders when the pipeline result has a matching `explanations[featureId]` entry; otherwise the new `AIProvenancePopup` mounted in `CADLayout` shows a minimal view (origin, confidence %, prompt-hash short, batch-id short, cited source points) so the menu still works for features stamped by the tool registry before the pipeline has run.*
- [x] `File → Replay AI sequence on new points…` runs the same `aiBatches` log against an updated points file and produces a fresh draft drawing. *— Slice 12 wires `useAIStore.replayAISequence()` (walks `aiBatches` in order, re-fires each prompt via `proposeFromPrompt`) and exposes it via the `ai.replaySequence` palette entry with a `window.confirm` gate. Auto-recording fires on every successful turn so the log builds passively. Persistence via `partialize` carries the timeline across reloads. File-menu entry lands once the menu bar is on the slice list; the palette + hotkey-binding path covers the surveyor surface today.*
- [x] Command palette entries `ai.parse-codes`, `ai.fill-corners`, `ai.check-closure`, `ai.create-layer-from-codes`, `ai.explain-feature` all fire in COMMAND mode and route to the appropriate backend. *— Slice 7 lands all five entries in the hotkey registry (`ai.parseCodes` / `ai.fillCorners` / `ai.checkClosure` / `ai.createLayerFromCodes` / `ai.explainFeature`). The first four seed a canned prompt + open the COPILOT sidebar via `openCopilotWithPrompt`; the surveyor can edit the prompt before Ctrl+Enter to send. `ai.explainFeature` short-circuits to `useAIStore.openExplanation` when exactly one feature is selected so the right-click §32.7 popup works from the palette too. The palette auto-discovers them because it walks `DEFAULT_ACTIONS` from the registry.*
- [x] Right-click on a selection → "Ask AI about this…" composes a prompt that includes the selection's feature IDs and opens the chat with cursor focus. *— Slice 7 adds a ✨ "Ask AI about this…" row to `FeatureContextMenu` (gated on `mode !== 'MANUAL'`). `composeAskAIPrompt(feature, selectionIds)` builds a short prompt naming the right-clicked feature + extras; `openCopilotWithPrompt` opens the sidebar and seeds `pendingPrompt`, which `AICopilotSidebar` consumes on its next render — input is pre-filled and the textarea is auto-focused with the cursor at the end so the surveyor can keep typing.*
- [x] AUTO turn producing N features supports both feature-level undo (one step pops one feature) and turn-level undo ("Undo AI batch" pops all N grouped by `aiBatchId`). *— Slice 10 ships `undoMostRecentAIBatch` in `lib/cad/ai/undo-batch.ts` and exposes it via the `ai.undoBatch` hotkey (`Ctrl+Alt+Z` by default, GLOBAL) + palette entry. The helper walks the topmost contiguous run of entries that share an `aiBatchId` and pops them all in one motion; per-feature `Ctrl+Z` continues to work unchanged for fine-grained undo. Every popped entry lands on `redoStack` so re-applying is per-feature (`Ctrl+Y` cycles them back one at a time). A manual edit between two AI batches breaks the contiguity check so only the top batch comes off.*
- [x] MANUAL mode disables every AI entry point — chat sidebar collapsed, palette `ai.*` entries hidden, right-click "Ask AI…" hidden. *— Slice 13 closes the lockdown: `CopilotCard` returns null in MANUAL even with a queued proposal; `FeatureContextMenu` hides both "Why did AI draw this?" and "Ask AI about this…"; `CommandPalette` filters out every `ai.*` (except `ai.cycleMode`); the hotkey dispatcher toasts + returns early for any AI action other than the mode-cycle. Status-bar AI chip in MANUAL renders as `AI off` with a strikethrough to make the state unmistakable.*

### 32.13 Implementation Sequence

Each slice is a single PR / commit, all gated by tests:

1. **Slice 1** — `AIStore` skeleton + the mode enum + status-bar mode indicator + `Ctrl+Shift+M` cycle hotkey + the four-mode UI shell. MANUAL is the only one that does anything yet (the existing manual UX); the other three render placeholders. *Shipped:* `lib/cad/store/ai-store.ts` grows `mode` / `sandbox` / `autoApproveThreshold` fields with `setMode` / `cycleMode` / `setSandbox` / `setAutoApproveThreshold` actions; the store is wrapped in zustand `persist` with a strict `partialize` that only persists the three framework fields (pipeline state remains ephemeral). `AIMode` + `AI_MODE_CYCLE` re-exported from `lib/cad/store/index.ts`. `lib/cad/hotkeys/registry.ts` grows `ai.cycleMode` (default `Ctrl+Shift+M`, GLOBAL); the dispatcher in `useHotkeys.ts` invokes `cycleMode()` and fires a `cad:commandOutput` toast with the new mode. `StatusBar.tsx` renders an AI-mode chip (per-mode colour: AUTO purple / COPILOT blue / COMMAND teal / MANUAL gray) with a sandbox status dot; click cycles the mode. `cycleMode` also resets `sandbox` to the per-mode default from §32.3 (`true` for AUTO/COPILOT/MANUAL, `false` for COMMAND).
2. **Slice 2** — Tool registry skeleton (`lib/cad/ai/tool-registry.ts`) with the first 5 tools (`addPoint`, `drawLineBetween`, `drawPolylineThrough`, `createLayer`, `applyLayerStyle`) — every entry wraps an existing kernel and returns the `{ ok, result, reason }` envelope. No AI calling them yet; tests drive them directly. *Shipped:* `ToolResult<T>` envelope union + `ToolDefinition<Args, Result>` interface with `name` / `description` / `inputSchema` (JSON-schema-compatible) / `execute(args)`. All five tools throw nothing — every error returns a structured `{ ok: false, reason }`. Locked / missing / active-fallback layer resolution is shared via `resolveLayerId`. `createLayer` rejects case-insensitive name collisions; `drawLineBetween` rejects zero-length segments; `drawPolylineThrough` enforces ≥ 2 verts (≥ 3 when `closed=true`). Successful drops push a single undo entry via `makeAddFeatureEntry` (Slice 10 will reshape multi-feature tool calls into batch entries). 26-test suite in `__tests__/cad/ai/tool-registry.test.ts` covers happy paths + every error envelope + undo bookkeeping.
3. **Slice 3** — Provenance stamps (`aiOrigin`, `aiConfidence`, `aiPromptHash`, `aiSourcePoints`, `aiBatchId`) added to `feature.properties` on every tool-registry call. Right-click "Why did AI draw this?" menu entry mounts; explanation popup reuses §30.3. *Shipped:* `lib/cad/ai/provenance.ts` defines `AIProvenance`, `stampProvenance`, `readProvenance`, `hasProvenance`, and `AI_PROVENANCE_KEYS`. The five fields fit inside `feature.properties: Record<string, string | number | boolean>` by JSON-encoding the `aiSourcePoints` array; `readProvenance` decodes it back (silently drops corrupt JSON / non-string entries) and returns `null` when `aiOrigin` is missing so the menu / popup can branch cleanly. Every feature-producing tool (`addPoint`, `drawLineBetween`, `drawPolylineThrough`) grows an optional `provenance?: AIProvenance` arg; layer-producing tools (`createLayer`, `applyLayerStyle`) are skipped (layers have no `properties` channel; layer-level provenance is a separate Slice). `FeatureContextMenu` mounts a "✨ Why did AI draw this?" row at the top of the menu (`hasProvenance(feature.properties)` gate) that fires `useAIStore.openExplanation(feature.id)`. New `AIProvenancePopup` is mounted alongside the existing `ElementExplanationPopup` in `CADLayout`; it renders only when there's no full pipeline `explanation` to show (the full popup takes precedence). 11 new unit tests cover round-trips, corrupt JSON, non-string filtering, `null`/empty stamps, and per-tool stamping (832/832 cad tests pass overall).
4. **Slice 4** — Sandbox routing: tool-registry calls with `sandbox: true` write to `DRAFT__<targetname>` layers (auto-created). Layer panel grows a "Promote draft" affordance routing to the §11.7 transfer kernel. *Shipped:* `lib/cad/ai/sandbox.ts` defines `DRAFT_LAYER_PREFIX`, `draftNameFor`, `isDraftLayer`, `ensureDraftLayerFor`, `findPromotionTarget`, and `promoteDraftLayer`. `ensureDraftLayerFor` auto-creates a draft mirroring the target's colour / line weight / line type / opacity / autoAssignCodes, stays unlocked even when the target is locked, and reuses an existing draft on subsequent calls. `resolveLayerId` in the tool registry grows a `sandbox` parameter that redirects to the draft when true; the three feature-producing tools (`addPoint`, `drawLineBetween`, `drawPolylineThrough`) accept an optional `sandbox?: boolean` arg. Sandbox writes bypass target-layer locks (the target gates promotion, not sandboxing). `LayerPanel` gains a per-row "✈ Promote" pill on every DRAFT__ layer that calls `promoteDraftLayer`, which uses `transferSelectionToLayer` (§11.7) with `keepOriginals: false` to move features back, then removes the empty draft layer; toasts the result via `cad:commandOutput`. The promote pill is disabled (with an explanatory tooltip) when no target exists or when the target is locked. 20 new tests cover prefix detection, auto-create, draft reuse, lock bypass on sandbox, lock enforcement off sandbox, multi-write reuse, empty-draft promotion, missing-target promotion failure, locked-target promotion failure, and `findPromotionTarget` edge cases (852/852 cad tests pass overall).
5. **Slice 5** — COPILOT proposal queue. AI emits a tool call → framework opens a `CopilotCard` with ghost preview + Accept / Modify / Skip. No real AI yet; a mock backend feeds canned proposals for testing. *Shipped:* `lib/cad/ai/proposals.ts` defines `AIProposal` (id / createdAt / toolName / args / description / confidence / provenance / sandboxDefault) plus `executeProposal(proposal, sandbox)`, which dispatches the tool through the registry (Slice 2) threading provenance (Slice 3) + the caller's sandbox choice (Slice 4). `AIStore` grows `proposalQueue: AIProposal[]` + `enqueueProposal` / `acceptHeadProposal(sandbox?)` / `skipHeadProposal` / `clearProposalQueue` (ephemeral — not persisted; cold loads start empty). `lib/cad/ai/mock-proposer.ts` ships three canned factories (`mockAddPointProposal`, `mockDrawLineProposal`, `mockDrawPolylineProposal`) so tests + the upcoming Slice 6 fixtures can walk the queue end-to-end without the Claude API. `CopilotCard` mounts in `CADLayout`: floating top-right pane that renders the head proposal — description, toolName, confidence-tinted percentage, queue-depth chip, args summary, per-card sandbox toggle (defaults to `sandboxDefault` then store-wide `sandbox`), Accept (executes through `acceptHeadProposal`) / Modify (Slice-6 stub) / Skip (drops without executing). `CanvasViewport` grows `copilotPreviewRef` + a `cad:copilotPreview` listener; `renderCopilotPreview` paints a dashed amber ghost keyed by `kind` (POINT crosshair, LINE / POLYLINE / POLYGON via the same `drawDashedScreenLine` helper) that auto-clears on dequeue. Layer-op proposals (`createLayer`, `applyLayerStyle`) emit no ghost — surveyor sees the result in the layer panel after Accept. 14 new tests cover FIFO enqueue / dequeue, accept-then-execute, sandbox override priority (caller > sandboxDefault > store), skip-without-execute, multi-proposal progression, and kernel-rejection bubbling on accept (866/866 cad tests pass overall).
6. **Slice 6** — Wire the real Claude API call behind the proposal queue. System prompt is the project's code dictionary + layer template (cached via `cache_control`). Tool registry is exposed as the model's tool list. *Shipped:* `lib/cad/ai/system-prompt.ts` builds the system prompt from a `ProjectContext` (layers / activeLayerId / mode / sandboxDefault / autoApproveThreshold) plus a tool catalogue (walks `toolRegistry` for names + one-line descriptions); `hashPrompt` produces a stable FNV-1a hash used as both the cache key and `aiPromptHash` on the resulting provenance. `lib/cad/ai/claude-proposer.ts` exposes `proposeFromPrompt(prompt, context, options)` which calls `client.messages.create` with `tools: toolRegistry` exposed and `system: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]` so subsequent same-context turns hit the cache. The injectable `ClaudeMessagesClient` DI lets tests run end-to-end with no real API hits. Every `tool_use` block in the response becomes one `AIProposal` (unknown tool names are dropped defensively); plain-text content blocks are concatenated into a `narrative` string for the surveyor. `POST /api/admin/cad/ai-propose/route.ts` provides the server entry point (admin / equipment_manager only; `MissingApiKeyError` → 503). `AIStore.proposeFromPrompt(prompt)` POSTs to the route, enqueues every returned proposal onto the `proposalQueue` (so `CopilotCard` picks them up immediately), and stashes `lastProposeNarrative` for the chat sidebar to render before the cards. `isProposing` flag drives spinners on the upcoming Slice-7 UI. 10 new tests cover system-prompt content + hash stability + divergence-on-context-change, tool_use → proposal translation, narrative collection, unregistered-tool drops, shared batchId / promptHash provenance, tool-list forwarding, ephemeral-cache wiring, and per-proposal description generation (876/876 cad tests pass overall).
7. **Slice 7** — COMMAND mode wiring: chat sidebar component, command palette `ai.*` entries, right-click "Ask AI about this…" with selection-context prompt composition. *Shipped:* `AIStore` grows the §32.9 surface — `isCopilotSidebarOpen`, `copilotChat: AICopilotMessage[]`, `pendingPrompt`, `openCopilotSidebar` / `closeCopilotSidebar` / `toggleCopilotSidebar` / `appendCopilotMessage` / `openCopilotWithPrompt(prompt)` / `clearCopilotChat`. `setMode` / `cycleMode` auto-open the sidebar on COPILOT / COMMAND / AUTO and close it on MANUAL; surveyor's manual toggle survives same-mode `setMode` calls. `proposeFromPrompt` mirrors every turn into the transcript (USER → AI narrative → SYSTEM "Queued N proposals") so the surveyor sees the conversation, not just the cards. `partialize` allow-lists `isCopilotSidebarOpen` so the panel state survives reload. `AICopilotSidebar.tsx` mounts in `CADLayout`: top-right vertical strip with a header (mode + queue-depth chip + clear-chat + close), the auto-scrolling transcript, a multi-line textarea (Ctrl+Enter sends), and an in-flight "Thinking…" spinner. The component listens for `cad:focusAICopilot` and opens-and-focuses on hotkey. Five new palette entries land in the hotkey registry (`ai.parseCodes`, `ai.fillCorners`, `ai.checkClosure`, `ai.createLayerFromCodes`, `ai.explainFeature`); the first four seed a canned prompt + open the sidebar, the last short-circuits to `useAIStore.openExplanation` when exactly one feature is selected. `FeatureContextMenu` grows a "✨ Ask AI about this…" row (gated on `mode !== 'MANUAL'`) whose action composes a short prompt from the right-clicked feature + any extra selection and calls `openCopilotWithPrompt`. `ai.chat` hotkey (Ctrl+Shift+C) now opens the new sidebar instead of the legacy `useDrawingChatStore`. 12 new tests cover sidebar visibility (mode-driven auto-open, surveyor-override survival, toggle), transcript append/clear, and the `openCopilotWithPrompt` seeding contract (883/883 cad tests pass overall).
8. **Slice 8** — Confidence threshold setting + AUTO escalation logic (AUTO becomes COPILOT for the single low-confidence decision, then resumes). `codeResolutionMemory` persistence. *Shipped:* `AIStore` grows `codeResolutionMemory: Record<string, { layerId; answeredAt }>` keyed by upper-cased code, plus `recordCodeResolution(code, layerId)` / `forgetCodeResolution(code)` / `clearCodeResolutionMemory` actions. `partialize` allow-lists the map so the surveyor's prior answers survive reload. `system-prompt.ts` extends `ProjectContext` with an optional `codeResolutions` field and renders a "Previously-resolved point codes" block in the system prompt so Claude reuses prior answers instead of re-asking. `proposeFromPrompt` threads `aiStore.codeResolutionMemory` into the request context automatically. `AIAutoRunner` is a headless component mounted in `CADLayout`: a single `useEffect` watches the head proposal's id + confidence and the active mode, then calls `acceptHeadProposal()` on a `setTimeout(0)` macrotask when `mode === 'AUTO'` and `confidence ≥ threshold`. Below threshold the proposal stays queued for the existing `CopilotCard` to surface. The runner re-checks state inside the timeout so a mid-flight mode flip / skip cancels safely. `AICopilotSidebar` grows a settings strip below the header: a 0–100% threshold slider (live-updating via `setAutoApproveThreshold`) + a "Saved code resolutions: N" counter with a one-click Clear button. 12 new tests lock down code-memory upper-casing / overwrite / forget / clear, threshold clamping at 0–1, system-prompt resolution rendering, and the queued-stays-queued-below-threshold contract the runner relies on (895/895 cad tests pass overall).
9. **Slice 9** — Reference-doc recommendation chip + new-project wizard reference-doc step + dampening-without-references factor (× 0.85 on every confidence score when no references uploaded). *Shipped (partial — wizard piece deferred until a new-project wizard exists):* `AIStore` grows `referenceDocs: AIReferenceDoc[]` (id / name / kind ∈ DEED|PLAT|SKETCH|PRIOR_DRAWING|OTHER / addedAt) plus `addReferenceDoc` / `removeReferenceDoc` / `clearReferenceDocs`. New `REFERENCE_DOC_DAMPENING = 0.85` exported constant. `partialize` allow-lists the manifest. `proposeFromPrompt` walks every incoming proposal: when `referenceDocs.length === 0`, multiplies both `proposal.confidence` and `proposal.provenance.aiConfidence` by 0.85, surfaces the dampening in the SYSTEM transcript turn (`"Queued N proposals … (confidence dampened ×0.85 — no reference docs)"`), and threads a sanitised `referenceDocs` array into the proposal-request context. `system-prompt.ts` renders either a "NONE uploaded — confidence is dampened ×0.85" warning or a "Reference documents uploaded" catalogue listing `KIND: name` so Claude can cite them. `AICopilotSidebar` gains a chip in the settings strip: amber "Running without references — confidence ×0.85" when empty, gray "N reference docs attached" otherwise; clicking toggles an inline `ReferenceDocsManager` (kind dropdown + name input + add + per-row remove). The new-project wizard step lands once a wizard exists; everything else from §32.6 is wired. 8 new tests cover CRUD, name trimming + empty rejection, persistence allow-list shape, system-prompt branching, and the dampening constant (903/903 cad tests pass overall).
10. **Slice 10** — Per-AI-action undo semantics: single vs. batch tool calls, "Undo AI batch" grouped command, undo stack chevron sub-menu. *Shipped (chevron sub-menu deferred until UndoButton lands as its own UI):* `lib/cad/ai/undo-batch.ts` ships `aiBatchIdFromEntry(entry)` (walks top-level ADD_FEATURE ops + descends through BATCH wrappers), `findMostRecentAIBatch()` (top of stack only — returns `{ batchId, count }` for the maximal contiguous run sharing the same id), and `undoMostRecentAIBatch()` (calls `useUndoStore.undo()` `count` times so every popped entry lands on `redoStack` and can be redone one at a time). New `ai.undoBatch` hotkey (default `Ctrl+Alt+Z`, GLOBAL) added to the registry; `useHotkeys` dispatcher calls the helper and toasts the popped count via `cad:commandOutput`. Non-AI top entries make the hotkey a no-op with a friendly toast; older AI batches under a manual entry stay safe (contiguity check). 12 new tests cover ADD_FEATURE + BATCH-wrapped batchId reads, top-of-stack contiguity, mixed AI / manual interleaving, redo round-trip, and the empty-stack edge (915/915 cad tests pass overall). Surveyor-facing chevron sub-menu on the undo button lands when the UndoButton component itself is built (currently undo is keyboard-only).
11. **Slice 11** — AUTO run loop: feeds the AI a structured "project intake" prompt, processes the resulting tool calls into the proposal queue with `autoCommit: confidence > threshold`, manual pause at `Ctrl+Shift+P`. *Shipped:* `lib/cad/ai/auto-intake.ts` ships `snapshotFromFeatures(features)` (counts POINTs, upper-cases + dedupes codes preserving insertion order, totals features) and `buildAutoIntakePrompt(snapshot, context)` — a pure templated USER message that walks the AI through the build: parse codes → use code-resolution memory + existing layers → group POINTs by code-suffix → fill missing corners via the intersect helpers → never modify existing features → flag low-confidence steps in plain text. The intake echoes the auto-approve threshold, the reference-doc dampening warning, and a 12-code preview with `+N more` tail. `AIStore.startAutoRun()` snapshots the current `useDrawingStore` document, builds the intake, and fires it through the existing `proposeFromPrompt` — every proposal then flows through the Slice 8 escalation runner so high-confidence ones auto-accept and the rest queue for the CopilotCard. Two new hotkeys land: `ai.startAuto` (no default key — exposed via palette + sidebar button) and `ai.pauseAuto` (`Ctrl+Shift+P`, GLOBAL). The pause dispatcher flips mode to COPILOT (any queued proposals stay for surveyor review since AUTO escalation only fires while `mode === 'AUTO'`) and appends a SYSTEM transcript turn explaining the switch. The sidebar grows a purple "Start AUTO run" / "Pause" strip whenever the mode is AUTO. 10 new tests cover snapshot zeros / counts / code dedupe / non-string code filtering, intake field rendering, code-truncation tail, threshold echo, and the reference-doc-present branch (925/925 cad tests pass overall).
12. **Slice 12** — Replay command (`File → Replay AI sequence on new points…`): re-runs the `aiBatches` log against an updated points file, produces a fresh draft drawing for diff against the original. *Shipped (under the command palette; File menu entry lands once the menu bar surfaces it):* New `AIBatchLog` type (id / createdAt / prompt / proposalCount) re-exported from the store index. `AIStore.aiBatches: AIBatchLog[]` + `removeAIBatch(id)` / `clearAIBatches()` / `replayAISequence(options?)` actions. `proposeFromPrompt` auto-records every successful turn into `aiBatches`; failures (HTTP ≥ 400, network throws) are skipped so the log only contains real turns. `partialize` allow-lists `aiBatches` so the replay timeline survives reload. `replayAISequence` walks the log in order, awaits each `proposeFromPrompt` so proposals queue in source order, detects per-turn errors via the `⚠`-prefixed `lastProposeNarrative` heuristic, and honours an `AbortSignal` between turns (returns `{ replayed, failed, aborted }`). New `ai.replaySequence` palette entry (no default key — the action requires confirmation via `window.confirm`). 10 new tests cover CRUD, ordering, auto-record only-on-success, replay re-firing prompts in order with stubbed `global.fetch`, per-turn failure counting, and abort-signal short-circuit (935/935 cad tests pass overall).
13. **Slice 13** — MANUAL mode lockdown: hide every AI entry point when mode === MANUAL; status bar shows a "no AI" chip. *Shipped:* `CopilotCard` guards on `mode === 'MANUAL'` so stale queued proposals never render. `FeatureContextMenu` gates both "Why did AI draw this?" (§32.7) and "Ask AI about this…" (§32.9) on `mode !== 'MANUAL'`. `CommandPalette` filters out every `ai.*` action (except `ai.cycleMode`) from its searchable list when MANUAL is active; the count chip reads `N of visibleItems.length`. The hotkey dispatcher gets a top-level guard: any `ai.*` action other than `ai.cycleMode` toasts "AI is off (MANUAL mode). Press Ctrl+Shift+M to switch modes." and returns early. `StatusBar` AI chip in MANUAL renders as `AI off` with a strikethrough on "AI" + a tooltip that calls out the lockdown explicitly. Queued proposals + transcript + memory + reference docs all persist through a MANUAL flip so cycling back resumes cleanly. 6 new tests cover cycleMode still firing, the toast guard on non-cycleMode actions, sidebar closing on MANUAL, queue survival across mode flips, and the focus-event no-op for `ai.chat` (941/941 cad tests pass overall).
14. **Slice 14** — Polish + acceptance test pass: every test from §32.12 lit up green. *Shipped:* every §32.12 acceptance entry above ticked through Slices 1–13. The remaining polish item was the `CopilotCard` **Modify** button — Slice 5 stubbed it; Slice 14 wires it properly. Clicking Modify now (a) skips the current proposal via `skipHeadProposal` so it doesn't auto-execute on the next AUTO tick, then (b) calls `openCopilotWithPrompt` with a `"Revise the last proposal — <toolName>: \"<description>\". I need it changed because: "` template, then (c) fires `cad:focusAICopilot` so the textarea takes focus with the cursor at the end of the seed prompt. Surveyor edits the redirect, Ctrl+Enter sends, the AI re-emits via `proposeFromPrompt`. 2 new tests confirm skip + openCopilotWithPrompt deliver the contract across back-to-back proposals (943/943 cad tests pass overall). Slice 5 acceptance note updated below to reflect the working Modify path.

Each slice keeps the application usable in MANUAL mode at minimum; AUTO arrives last. This way the framework can ship behind a feature flag in production without forcing every project to engage with AI before the surveyor is ready.

---



> I am building Starr CAD Phase 6 — AI Drawing Engine. Phases 1–5 (CAD engine, data import, styling, geometry/math, annotations/print) are complete. I am now building the AI pipeline: 6-stage processing (classify points → assemble features → reconcile with deed → intelligent placement → optimize labels → confidence scoring), Kasa circle fitting for arc detection, Claude API integration for deed parsing, a DigitalOcean worker for unlimited processing time, a 5-tier confidence scoring system with 6 weighted factors, dynamic offset resolution (field offset shots → true positions), online data enrichment (county parcel/GIS, PLSS, FEMA, elevation), an AI deliberation period with confidence-gated clarifying questions, an interactive two-panel drawing preview with visual confidence element cards (sorted least-confident-first, color-coded borders and bars), per-element AI explanation popups with element-level chat (Update/Redraw Group/Redraw Full), a review queue UI with per-item accept/modify/reject and batch actions, point group intelligence (calc/set/found resolution with delta reporting), and AI-assisted re-processing via user prompts. The spec is in `STARR_CAD_PHASE_6_AI_ENGINE.md`. I am currently working on **[CURRENT TASK from Build Order]**.

---

*End of Phase 6 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
