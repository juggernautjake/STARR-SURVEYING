// lib/cad/ai-engine/stage-5-labels.ts
//
// Phase 6 Stage 5 — AI-aware wrapper around the Phase 5 label
// optimizer. Adds one knob: per-feature confidence biases the
// optimizer&apos;s priority order so high-confidence labels get
// the &ldquo;first crack&rdquo; at collision-free placement
// (they&apos;re more likely to survive review). Low-confidence
// labels are still placed but they fall later in the queue, so
// when collisions force a strategy change (slid / shrunk /
// stacked / leader-added) it lands on the labels least likely
// to matter in the final drawing.
//
// Pure function. The Phase 5 optimizer (`optimizeLabels` from
// `lib/cad/labels/label-optimizer.ts`) runs as-is — this slice
// only adjusts the input priorities before forwarding.

import {
  optimizeLabels,
  type LabelOptConfig,
  type OptimizationResult,
  DEFAULT_LABEL_OPT_CONFIG,
} from '../labels/label-optimizer';
import type { AnnotationBase } from '../labels/annotation-types';

/**
 * Confidence bias range: priority is decreased (placed earlier)
 * by up to BIAS_AMOUNT when feature confidence is 1.0; left
 * alone when confidence is unknown. The 0.5 magnitude keeps the
 * bias subtle so legitimate priority differences (BEARING_
 * DISTANCE = 1, AREA_LABEL = 4 etc.) still dominate ordering.
 */
const BIAS_AMOUNT = 0.5;

/**
 * Run the Phase 5 label optimizer with AI-bias applied. Drops
 * through cleanly when no per-feature confidence is available
 * (`confidenceByFeatureId` empty or null) — the wrapper acts as
 * a pass-through to the underlying optimizer in that case.
 *
 * Confidence inputs are 0–1 (per the §5.12 ConfidenceScore
 * shape) OR 0–100 (per the per-feature score on
 * AssemblyStats / Discrepancy / etc.); the helper normalises
 * to 0–1 so callers don&apos;t need to convert.
 */
export function optimizeLabelsAiAware(
  annotations: AnnotationBase[],
  drawingScale: number,
  confidenceByFeatureId: Map<string, number> | null = null,
  config: LabelOptConfig = DEFAULT_LABEL_OPT_CONFIG
): OptimizationResult {
  if (
    !confidenceByFeatureId ||
    confidenceByFeatureId.size === 0 ||
    annotations.length === 0
  ) {
    return optimizeLabels(annotations, drawingScale, config);
  }

  const biased = annotations.map((ann) => {
    const confRaw =
      ann.linkedFeatureId !== null
        ? confidenceByFeatureId.get(ann.linkedFeatureId)
        : undefined;
    if (confRaw === undefined) return ann;
    const conf = normalizeConfidence(confRaw);
    // Decrease priority value by `BIAS_AMOUNT * conf`, so a 1.0
    // confidence label moves up by 0.5 priority slots. The Phase
    // 5 optimizer sorts ascending and places first → lower value
    // = placed first = preferred position.
    return {
      ...ann,
      priority: ann.priority - BIAS_AMOUNT * conf,
    };
  });

  return optimizeLabels(biased, drawingScale, config);
}

function normalizeConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 1) return Math.max(0, raw);
  // 0-100 scale.
  return Math.min(1, Math.max(0, raw / 100));
}
