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

  // ── Stage 1: Classify ──────────────────────────────────────
  onProgress('Classifying points', 10);
  let t = Date.now();
  const classified = classifyPoints(payload.points);
  timings['classify'] = Date.now() - t;

  // ── Build point groups ─────────────────────────────────────
  onProgress('Building point groups', 18);
  const pointGroups = groupPointsByBaseName(payload.points);

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
          new Map(payload.points.map((p) => [p.id, p])),
          true
        );
        reconciliation = reconcileDeed(
          fieldTraverse,
          payload.deedData,
          payload.points,
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
    ? autoAnnotate(allFeatures, payload.points, [], {
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
  onProgress('Packaging review queue', 97);
  const reviewQueue: AIReviewQueue = stubReviewQueue(allFeatures, scores);

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
    explanations: {},
    offsetResolution: null,
    enrichmentData: null,
    deliberationResult: null,
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
  scores: Map<string, import('./types').ConfidenceScore>
): AIReviewQueue {
  const queue: AIReviewQueue = emptyReviewQueue();
  for (const f of features) {
    const score = scores.get(f.id);
    const tier = score?.tier ?? 3;
    const item: import('./types').ReviewItem = {
      id: `review_${f.id}`,
      featureId: f.id,
      pointIds: [],
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
      pointGroupInfo: null,
      callComparison: null,
      status: 'PENDING',
      userNote: null,
      modifiedFeature: null,
    };
    queue.tiers[tier].push(item);
    queue.summary.totalElements += 1;
    queue.summary.pendingCount += 1;
  }
  return queue;
}
