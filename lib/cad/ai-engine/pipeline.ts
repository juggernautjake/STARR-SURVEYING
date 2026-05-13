// lib/cad/ai-engine/pipeline.ts
//
// Phase 6 — pipeline orchestrator. Wires the six-stage AI
// drawing engine into one entry point: `runAIPipeline(payload)`.
//
// Stages run sequentially:
//   1. classifyPoints              (Stage 1 — flag classification)
//   2. groupPointsByBaseName       (Phase 2 helper, not its own AI stage)
//   3. assembleFeatures            (Stage 2 — feature assembly)
//   4. parseCallsRegex + reconcileDeed (Stage 3 — deed reconciliation)
//   5. computeOptimalPlacement     (Stage 4 — paper/scale/orientation)
//   6. autoAnnotate                (Phase 5 — annotation generation)
//   7. optimizeLabelsAiAware       (Stage 5 — collision-resolved layout)
//   8. scoreAllElements            (Stage 6 — confidence scoring)
//
// Synchronous + pure: no Claude API in this slice. The Claude-
// assisted deed parser ships with the worker (Anthropic SDK
// dependency lives there). Callers that need Claude should use
// the worker via HTTP; this in-process orchestrator runs
// regex-only.
//
// Progress is reported via an optional `onProgress(stage,
// percent)` callback so a UI can render a per-stage status
// bar without polling.

import { autoAnnotate, DEFAULT_AUTO_ANNOTATE_CONFIG } from '../labels/auto-annotate';
import { groupPointsByBaseName } from '../codes/point-grouping';
import { createTraverse } from '../geometry/traverse';
import type { Feature } from '../types';

import { classifyPoints } from './stage-1-classify';
import { assembleFeatures } from './stage-2-assemble';
import { parseCallsRegex } from './deed-parser';
import { reconcileDeed } from './stage-3-reconcile';
import { computeOptimalPlacement } from './stage-4-placement';
import { optimizeLabelsAiAware } from './stage-5-labels';
import { scoreAllElements } from './stage-6-confidence';
import {
  resolveOffsetsSync,
  type OffsetResolutionDetail,
} from './offset-resolver';
import { runDeliberation } from './deliberation';
import { generateAutoExplanations } from './element-explanation';
import type {
  AIJobPayload,
  AIJobResult,
  AIReviewQueue,
  ReconciliationResult,
} from './types';

export type PipelineProgressFn = (
  stageLabel: string,
  percent: number
) => void;

const noopProgress: PipelineProgressFn = () => {};

/**
 * Run the full six-stage AI drawing pipeline against a payload
 * and return a single-shot result. No external I/O. Best-effort
 * progress reporting via the optional callback.
 *
 * Failure modes degrade gracefully:
 *   * No deed → reconciliation stays null (Stages 1-2 + 4-6
 *     still run).
 *   * Boundary points < 3 → reconciliation stays null with a
 *     warning.
 *   * Empty payload.points → returns an empty AIJobResult with
 *     a single warning.
 */
export function runAIPipeline(
  payload: AIJobPayload,
  onProgress: PipelineProgressFn = noopProgress
): AIJobResult {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  const warnings: string[] = [];

  if (!payload.points || payload.points.length === 0) {
    return emptyResult([
      'Pipeline received zero points; nothing to classify.',
    ]);
  }

  // ── §26 Dynamic Offset Resolution (pre-Stage 1) ────────────
  // Detects offset shots from suffix patterns + companion
  // pairs, computes true monument positions, and folds them
  // into the working point set so the downstream stages see
  // the corrected coordinates. Synchronous in this slice;
  // Claude-assisted field-note parsing lands separately.
  onProgress('Resolving offset shots', 5);
  let t = Date.now();
  const offsetDetail = resolveOffsetsSync(payload.points);
  timings['offset_resolution'] = Date.now() - t;
  const workingPoints =
    offsetDetail.truePoints.length > 0
      ? [...payload.points, ...offsetDetail.truePoints]
      : payload.points;
  if (offsetDetail.ambiguousShots.length > 0) {
    warnings.push(
      `${offsetDetail.ambiguousShots.length} ambiguous offset shot(s) ` +
        'flagged for user confirmation (insufficient bearing context).'
    );
  }
  if (offsetDetail.unresolvedPointIds.length > 0) {
    warnings.push(
      `${offsetDetail.unresolvedPointIds.length} point(s) look offset ` +
        "but couldn't be parsed; review the description / code."
    );
  }

  // ── Stage 1: Classify ──────────────────────────────────────
  onProgress('Classifying points', 10);
  t = Date.now();
  const classified = classifyPoints(workingPoints);
  timings['classify'] = Date.now() - t;

  // ── Build point groups ─────────────────────────────────────
  onProgress('Building point groups', 18);
  const pointGroups = groupPointsByBaseName(workingPoints);

  // ── Stage 2: Assemble ──────────────────────────────────────
  onProgress('Assembling features', 28);
  t = Date.now();
  const assembled = assembleFeatures(classified, pointGroups);
  timings['assemble'] = Date.now() - t;
  for (const w of assembled.warnings) {
    warnings.push(w.message);
  }

  // ── Stage 3: Reconcile (when deed present) ─────────────────
  let reconciliation: ReconciliationResult | null = null;
  if (payload.deedData) {
    onProgress('Reconciling with deed', 42);
    t = Date.now();
    // Regex-parse calls when the caller didn't pre-parse them.
    // Claude-assisted parsing lands in the worker slice; the
    // in-process pipeline is regex-only.
    if (
      payload.deedData.calls.length === 0 &&
      payload.deedData.rawText
    ) {
      const parsed = parseCallsRegex(payload.deedData.rawText);
      payload.deedData.calls = parsed.calls;
      if (parsed.calls.length === 0) {
        warnings.push(
          'Deed text supplied but regex parser found zero calls; ' +
            'reconciliation skipped. Try the worker for Claude-' +
            'assisted parsing.'
        );
      }
    }

    if (payload.deedData.calls.length > 0) {
      const boundaryPoints = classified.filter(
        (c) =>
          c.resolvedCode?.category === 'BOUNDARY_CONTROL' ||
          c.resolvedCode?.category === 'PROPERTY_LINES'
      );
      if (boundaryPoints.length >= 3) {
        const fieldTraverse = createTraverse(
          boundaryPoints.map((c) => c.point.id),
          new Map(workingPoints.map((p) => [p.id, p])),
          true
        );
        reconciliation = reconcileDeed(
          fieldTraverse,
          payload.deedData,
          workingPoints,
          pointGroups
        );
      } else {
        warnings.push(
          'Deed reconciliation skipped: fewer than 3 boundary ' +
            'points classified.'
        );
      }
    }
    timings['reconcile'] = Date.now() - t;
  }

  // ── Combined feature list ──────────────────────────────────
  const allFeatures: Feature[] = [
    ...assembled.pointFeatures,
    ...assembled.closedPolygons,
    ...assembled.curveFeatures,
    ...assembled.splineFeatures,
    ...assembled.mixedGeometryFeatures,
  ];

  // ── Stage 4: Place ─────────────────────────────────────────
  onProgress('Computing optimal placement', 60);
  t = Date.now();
  const placement = computeOptimalPlacement(allFeatures, null);
  timings['placement'] = Date.now() - t;

  // ── Annotations + Stage 5: Labels ──────────────────────────
  onProgress('Generating annotations', 72);
  const annotations = payload.generateLabels
    ? autoAnnotate(allFeatures, workingPoints, [], {
        ...DEFAULT_AUTO_ANNOTATE_CONFIG,
        generateBearingDims: payload.generateLabels,
        generateCurveData: payload.generateLabels,
        generateMonumentLabels: payload.generateLabels,
        generateAreaLabels: payload.generateLabels,
      })
    : [];

  if (payload.optimizeLabels && annotations.length > 0) {
    onProgress('Optimizing labels', 82);
    t = Date.now();
    optimizeLabelsAiAware(annotations, placement.scale);
    timings['labels'] = Date.now() - t;
  }

  // ── Stage 6: Score ─────────────────────────────────────────
  onProgress('Scoring confidence', 92);
  t = Date.now();
  const closure = reconciliation?.fieldClosure ?? null;
  const scores = payload.includeConfidenceScoring
    ? scoreAllElements(
        allFeatures,
        classified,
        reconciliation,
        pointGroups,
        closure
      )
    : new Map();
  timings['confidence'] = Date.now() - t;

  // ── Review queue (stub) ────────────────────────────────────
  // The full tier-grouped builder lands with the review-UI
  // slice. v1 packages every feature into a flat queue so the
  // result shape stays valid for downstream consumers.
  onProgress('Packaging review queue', 95);
  const reviewQueue: AIReviewQueue = stubReviewQueue(
    allFeatures,
    scores,
    pointGroups,
  );

  // ── §30 Auto-explanations ──────────────────────────────────
  // Deterministic per-feature explanations sourced from Stage 6
  // factors + Stage 3 reconciliation. Claude-assisted narrative
  // pass + element-level chat handler land in a follow-up slice.
  onProgress('Generating explanations', 96);
  t = Date.now();
  const explanations = generateAutoExplanations({
    features: allFeatures,
    scores,
    classified,
    reconciliation,
    enrichment: null,
  });
  timings['explanations'] = Date.now() - t;

  // ── §28 Deliberation — clarifying-question generation ──────
  // Synchronous + deterministic. Walks deed discrepancies,
  // ambiguous offsets, unrecognized codes, fence/building
  // attributes, and confidence aggregation. Claude-assisted
  // holistic analysis lands in a follow-up slice.
  onProgress('Deliberating', 98);
  t = Date.now();
  const deliberationResult = runDeliberation({
    features: allFeatures,
    classified,
    reconciliation,
    offsetDetail,
    enrichment: null,
    scores,
    computedAcres: null,
    pointGroups: Array.from(pointGroups.values()),
  });
  timings['deliberation'] = Date.now() - t;

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
    explanations: Object.fromEntries(explanations),
    offsetResolution: bridgeOffsetResolution(offsetDetail),
    enrichmentData: null,
    deliberationResult,
    processingTimeMs: Date.now() - startTime,
    stageTimings: timings,
    warnings,
    version: 1,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function emptyResult(warnings: string[]): AIJobResult {
  return {
    features: [],
    annotations: [],
    placement: {
      paperSize: 'TABLOID',
      orientation: 'LANDSCAPE',
      scale: 50,
      rotation: 0,
      centerOffset: { x: 0, y: 0 },
      templateId: 'default',
      autoSelected: true,
    },
    classified: [],
    pointGroups: [],
    reconciliation: null,
    reviewQueue: emptyReviewQueue(),
    scores: {},
    explanations: {},
    offsetResolution: null,
    enrichmentData: null,
    deliberationResult: null,
    processingTimeMs: 0,
    stageTimings: {},
    warnings,
    version: 1,
  };
}

function emptyReviewQueue(): AIReviewQueue {
  return {
    tiers: { 5: [], 4: [], 3: [], 2: [], 1: [] },
    summary: {
      totalElements: 0,
      acceptedCount: 0,
      modifiedCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
    },
  };
}

function stubReviewQueue(
  features: Feature[],
  scores: Map<string, import('./types').ConfidenceScore>,
  pointGroups: Map<number, import('../types').PointGroup>,
): AIReviewQueue {
  const queue: AIReviewQueue = emptyReviewQueue();
  for (const f of features) {
    const score = scores.get(f.id);
    const tier = score?.tier ?? 3;
    // Phase 6 §1909-1910 — tier-5 (95-100 confidence) items are
    // auto-accepted so the surveyor only sees PENDING work in the
    // review queue. Every other tier starts as PENDING and
    // requires explicit Accept/Modify/Reject.
    const status: import('./types').ReviewItemStatus =
      tier === 5 ? 'ACCEPTED' : 'PENDING';
    const pointGroupInfo = derivePointGroupReviewInfo(f, pointGroups);
    const item: import('./types').ReviewItem = {
      id: `review_${f.id}`,
      featureId: f.id,
      pointIds: pointGroupInfo
        ? pointGroupInfo.positionOptions.map((o) => o.pointId)
        : [],
      annotationIds: [],
      title: f.properties?.aiLabel
        ? String(f.properties.aiLabel)
        : `Feature ${f.id.slice(0, 8)}`,
      description: '',
      category: f.type,
      confidence: score?.score ?? 50,
      tier,
      flags: score?.flags ?? [],
      discrepancies: [],
      pointGroupInfo,
      callComparison: null,
      status,
      userNote: null,
      modifiedFeature: null,
    };
    queue.tiers[tier].push(item);
    queue.summary.totalElements += 1;
    if (status === 'ACCEPTED') queue.summary.acceptedCount += 1;
    else queue.summary.pendingCount += 1;
  }
  return queue;
}

/**
 * Phase 6 §1915 — when a POINT feature traces back to a
 * PointGroup that holds multiple positions (calc + set, calc +
 * found, etc.), surface every position to the review row so
 * the surveyor can see what was chosen and what alternatives
 * exist. Non-POINT features and ungrouped points return null.
 */
function derivePointGroupReviewInfo(
  feature: Feature,
  groups: Map<number, import('../types').PointGroup>,
): import('./types').PointGroupReviewInfo | null {
  if (feature.type !== 'POINT') return null;
  const raw = feature.properties?.aiPointIds;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Stage 2 emits a single pointId on POINT features (no commas).
  const pointId = raw.split(',')[0];
  // Find the group whose `allPoints` includes this id.
  let owning: import('../types').PointGroup | null = null;
  for (const g of groups.values()) {
    if (g.allPoints.some((p) => p.id === pointId)) {
      owning = g;
      break;
    }
  }
  if (!owning) return null;
  if (owning.allPoints.length < 2) return null; // single shot — no choice
  const finalId = owning.finalPoint.id;
  return {
    baseNumber: owning.baseNumber,
    hasCalc: owning.calculated.length > 0,
    hasSet: owning.set !== null,
    hasFound: owning.found !== null,
    finalSource: owning.finalSource,
    calcSetDelta: owning.calcSetDelta,
    calcFoundDelta: owning.calcFoundDelta,
    hasDeltaWarning: owning.deltaWarning,
    positionOptions: owning.allPoints.map((p) => ({
      label:
        p.parsedName.normalizedSuffix === 'NONE'
          ? `Unsuffixed${p.id === finalId ? ' (used)' : ''}`
          : `${p.parsedName.normalizedSuffix.charAt(0)}${p.parsedName.normalizedSuffix.slice(1).toLowerCase()}${p.id === finalId ? ' (used)' : ''}`,
      pointId: p.id,
      northing: p.northing,
      easting: p.easting,
      active: p.id === finalId,
    })),
  };
}

/**
 * Convert the §26 OffsetResolutionDetail shape into the
 * leaner OffsetResolutionResult shape on AIJobResult. The
 * detail rows feed the §28 clarifying-question queue (next
 * slice); the result type just needs the projected true
 * points + counters.
 */
function bridgeOffsetResolution(
  detail: OffsetResolutionDetail
): import('./types').OffsetResolutionResult {
  const warnings: string[] = [];
  if (detail.ambiguousShots.length > 0) {
    warnings.push(
      `${detail.ambiguousShots.length} offset shot(s) need a reference ` +
        'bearing — flag for the surveyor to confirm.'
    );
  }
  if (detail.unresolvedPointIds.length > 0) {
    warnings.push(
      `${detail.unresolvedPointIds.length} point(s) look offset but ` +
        'the parser could not extract a distance + direction.'
    );
  }
  return {
    resolvedPoints: detail.truePoints,
    unresolvedCount:
      detail.ambiguousShots.length + detail.unresolvedPointIds.length,
    warnings,
  };
}
