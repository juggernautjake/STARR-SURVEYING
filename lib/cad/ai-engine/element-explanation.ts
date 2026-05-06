// lib/cad/ai-engine/element-explanation.ts
//
// Phase 6 §30 — per-element AI explanation generation.
//
// This slice ships the deterministic auto-explanation path:
// every feature gets a concrete `ElementExplanation` derived
// from Stage 6 confidence factors, Stage 1 classification,
// Stage 3 reconciliation, and §27 enrichment data. No Claude
// calls. The Claude-augmented "narrative" path + element-
// level chat handler land in follow-up slices once the chat
// transport is wired.
//
// Pure: no I/O. Deterministic given the same inputs.

import { generateId } from '../types';
import type { Feature } from '../types';
import type {
  AlternativeOption,
  ClassificationResult,
  ConfidenceFactorExplanation,
  ConfidenceFactors,
  ConfidenceScore,
  ElementExplanation,
  EnrichmentData,
  ExplanationDataRef,
  ReconciliationResult,
} from './types';

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export interface GenerateExplanationsInputs {
  features:       Feature[];
  scores:         Map<string, ConfidenceScore>;
  classified:     ClassificationResult[];
  reconciliation: ReconciliationResult | null;
  enrichment:     EnrichmentData | null;
}

/**
 * Walk every feature and emit an auto-generated explanation.
 * The Claude-assisted path (rich narrative, alternative
 * suggestions, deed-aware paraphrase) lands in a follow-up
 * slice that wraps this output.
 */
export function generateAutoExplanations(
  inputs: GenerateExplanationsInputs
): Map<string, ElementExplanation> {
  const out = new Map<string, ElementExplanation>();
  for (const feature of inputs.features) {
    const score = inputs.scores.get(feature.id);
    if (!score) continue;
    out.set(
      feature.id,
      buildAutoExplanation(
        feature,
        score,
        inputs.classified,
        inputs.reconciliation,
        inputs.enrichment
      )
    );
  }
  return out;
}

/**
 * Build a single deterministic explanation. Exposed so callers
 * can refresh just one feature (e.g. after Modify in the
 * review queue) without regenerating the whole map.
 */
export function buildAutoExplanation(
  feature: Feature,
  score: ConfidenceScore,
  classified: ClassificationResult[],
  reconciliation: ReconciliationResult | null,
  enrichment: EnrichmentData | null
): ElementExplanation {
  const pointIds = getFeaturePointIds(feature);
  const relatedClassified = classified.filter((c) =>
    pointIds.includes(c.point.id)
  );

  const summary = buildSummary(feature, score, relatedClassified);
  const reasoning = buildReasoning(
    feature,
    score,
    relatedClassified,
    reconciliation
  );
  const dataUsed = buildDataUsed(
    feature,
    relatedClassified,
    reconciliation,
    enrichment
  );
  const assumptions = buildAssumptions(feature, score, relatedClassified);
  const alternatives = buildAlternatives(feature, score, reconciliation);
  const confidenceBreakdown = buildConfidenceBreakdown(score);

  return {
    featureId: feature.id,
    generatedAt: new Date().toISOString(),
    summary,
    reasoning,
    dataUsed,
    assumptions,
    alternatives,
    confidenceBreakdown,
    chatHistory: [],
  };
}

// ────────────────────────────────────────────────────────────
// Summary — one sentence shown in the card header
// ────────────────────────────────────────────────────────────

function buildSummary(
  feature: Feature,
  score: ConfidenceScore,
  related: ClassificationResult[]
): string {
  const label =
    typeof feature.properties?.aiLabel === 'string'
      ? feature.properties.aiLabel
      : describeFeatureType(feature);
  const ptCount = related.length;
  return (
    `${label} — ${score.score}% confidence (Tier ${score.tier})` +
    (ptCount > 0 ? `, derived from ${ptCount} field point${ptCount === 1 ? '' : 's'}.` : '.')
  );
}

// ────────────────────────────────────────────────────────────
// Reasoning paragraph
// ────────────────────────────────────────────────────────────

function buildReasoning(
  feature: Feature,
  score: ConfidenceScore,
  related: ClassificationResult[],
  reconciliation: ReconciliationResult | null
): string {
  const parts: string[] = [];

  parts.push(
    `Drew this as a ${describeFeatureType(feature).toLowerCase()} ` +
      `using ${related.length} classified field point${related.length === 1 ? '' : 's'}` +
      (related.length > 0
        ? ` (${related
            .slice(0, 4)
            .map((c) => `#${c.point.pointName ?? c.point.pointNumber}`)
            .join(', ')}` +
          (related.length > 4 ? ', …' : '') +
          ').'
        : '.')
  );

  if (reconciliation) {
    const matchedComparison = reconciliation.callComparisons.find(
      (cc) => cc.overallMatch
    );
    if (matchedComparison) {
      parts.push(
        `Field traverse matched the deed within tolerance ` +
          `(${reconciliation.callComparisons.length} call${reconciliation.callComparisons.length === 1 ? '' : 's'} compared, ` +
          `overall score ${reconciliation.overallMatchScore}%).`
      );
    } else {
      const adjust = reconciliation.confidenceAdjustments.get(feature.id);
      if (adjust !== undefined && adjust < 0) {
        parts.push(
          `Field-vs-deed comparison nudged the deed-record-match factor ` +
            `${(adjust * 100).toFixed(0)}% based on observed discrepancies.`
        );
      }
    }
  }

  if (score.flags.length > 0) {
    const top = score.flags.slice(0, 2).join(' ');
    parts.push(`Notable: ${top}`);
  }

  return parts.join(' ');
}

// ────────────────────────────────────────────────────────────
// Data used — weighted, tier-tagged sources
// ────────────────────────────────────────────────────────────

function buildDataUsed(
  feature: Feature,
  related: ClassificationResult[],
  reconciliation: ReconciliationResult | null,
  enrichment: EnrichmentData | null
): ExplanationDataRef[] {
  const refs: ExplanationDataRef[] = [];
  for (const c of related) {
    const codeLabel =
      c.resolvedCode?.alphaCode ??
      c.resolvedCode?.numericCode ??
      c.point.rawCode ??
      '?';
    refs.push({
      type: 'FIELD_POINT',
      label: `Point #${c.point.pointName ?? c.point.pointNumber} (${codeLabel})`,
      value: `${c.point.northing.toFixed(2)} N, ${c.point.easting.toFixed(2)} E`,
      weight: 'HIGH',
    });
  }
  if (reconciliation) {
    const matched = reconciliation.callComparisons.find(
      (cc) => cc.overallMatch
    );
    if (matched) {
      refs.push({
        type: 'DEED_CALL',
        label: `Deed Call #${matched.deedCallIndex + 1}`,
        value:
          (matched.recordBearing !== null
            ? `${matched.recordBearing.toFixed(2)}°`
            : '—') +
          ', ' +
          (matched.recordDistance !== null
            ? `${matched.recordDistance.toFixed(2)}'`
            : '—'),
        weight: 'MEDIUM',
      });
    }
  }
  if (enrichment) {
    if (enrichment.femaFloodZone) {
      refs.push({
        type: 'ENRICHMENT',
        label: 'FEMA flood zone',
        value: enrichment.femaFloodZone,
        weight: 'LOW',
      });
    }
    if (enrichment.elevationFt !== null) {
      refs.push({
        type: 'ENRICHMENT',
        label: 'Project elevation (USGS 3DEP)',
        value: `${enrichment.elevationFt.toFixed(1)}' NAVD88`,
        weight: 'LOW',
      });
    }
    if (enrichment.parcelId) {
      refs.push({
        type: 'ENRICHMENT',
        label: 'Parcel ID',
        value: enrichment.parcelId,
        weight: 'LOW',
      });
    }
  }
  // Reference feature so unused-arg lint stays happy when no
  // feature-specific source is added in this slice.
  void feature;
  return refs;
}

// ────────────────────────────────────────────────────────────
// Assumptions
// ────────────────────────────────────────────────────────────

function buildAssumptions(
  feature: Feature,
  score: ConfidenceScore,
  related: ClassificationResult[]
): string[] {
  const out: string[] = [];
  if (feature.type === 'ARC' && feature.properties?.direction) {
    out.push(
      `Arc direction assumed ${String(feature.properties.direction)} based on point order.`
    );
  }
  if (feature.type === 'POLYGON') {
    out.push(
      'Polygon assumed closed because the first and last shots ' +
        'share a position within tolerance.'
    );
  }
  for (const c of related) {
    if (c.flags.includes('AMBIGUOUS_CODE')) {
      out.push(
        `Point #${c.point.pointName} code "${c.point.rawCode}" had ` +
          'multiple matches; picked the highest-priority library entry.'
      );
    }
    if (c.flags.includes('NAME_SUFFIX_AMBIGUOUS')) {
      out.push(
        `Point #${c.point.pointName} suffix could not be resolved ` +
          'definitively; defaulted to FOUND treatment.'
      );
    }
  }
  if (score.factors.curveDataCompleteness < 0.5 && feature.type === 'ARC') {
    out.push(
      'Curve fitted from coordinates only — no record radius/delta ' +
        'available to cross-check.'
    );
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Alternatives considered
// ────────────────────────────────────────────────────────────

function buildAlternatives(
  feature: Feature,
  score: ConfidenceScore,
  reconciliation: ReconciliationResult | null
): AlternativeOption[] {
  const out: AlternativeOption[] = [];
  if (feature.type === 'ARC') {
    out.push({
      description: 'Render as a straight polyline through the same points.',
      whyRejected:
        'Arc-suffix codes (A / BA / EA) explicitly mark these as a curve.',
    });
  }
  if (feature.type === 'POLYGON' && score.factors.closureQuality < 0.7) {
    out.push({
      description:
        'Force-close the polygon to balance bearings + distances.',
      whyRejected:
        'Closure adjustment masks field error; left as-is so the surveyor can audit.',
    });
  }
  if (reconciliation) {
    const adjust = reconciliation.confidenceAdjustments.get(feature.id);
    if (adjust !== undefined && adjust < 0) {
      out.push({
        description: 'Trust the deed bearings/distances over the field shots.',
        whyRejected:
          'Field measurements are typically more current; flagged for ' +
            'surveyor review instead.',
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Confidence breakdown — Stage 6 factors, humanized
// ────────────────────────────────────────────────────────────

const FACTOR_TEXT: Record<keyof ConfidenceFactors, (s: number) => string> = {
  codeClarity: (s) =>
    s >= 0.95
      ? 'Code maps to a single, well-known library definition.'
      : s >= 0.7
        ? 'Code is recognized but had a minor ambiguity.'
        : 'Code is unrecognized or ambiguous; classification is best-guess.',
  coordinateValidity: (s) =>
    s >= 0.95
      ? 'All shots have valid, in-bounds coordinates.'
      : s >= 0.7
        ? 'A few shots flagged as outliers but inside the project envelope.'
        : 'Multiple zero or out-of-bounds coordinates detected.',
  deedRecordMatch: (s) =>
    s >= 0.9
      ? 'Field traverse matches the deed call within tolerance.'
      : s >= 0.6
        ? 'Field-vs-deed shows minor bearing/distance drift.'
        : 'Field-vs-deed disagrees beyond tolerance; review needed.',
  contextualConsistency: (s) =>
    s >= 0.9
      ? 'Internal consistency checks (groups, deltas) all pass.'
      : s >= 0.6
        ? 'Some calc/set/found delta warnings.'
        : 'Multiple cross-verification flags raised.',
  closureQuality: (s) =>
    s >= 0.9
      ? 'Field closure is excellent (better than 1:10,000).'
      : s >= 0.6
        ? 'Closure acceptable for residential survey.'
        : 'Closure poorer than expected — investigate before publishing.',
  curveDataCompleteness: (s) =>
    s >= 0.9
      ? 'Full curve data available (radius, delta, chord).'
      : s >= 0.5
        ? 'Curve fitted from coordinates only.'
        : 'No curve data available for this feature.',
};

function buildConfidenceBreakdown(
  score: ConfidenceScore
): ConfidenceFactorExplanation[] {
  const out: ConfidenceFactorExplanation[] = [];
  for (const factor of Object.keys(score.factors) as Array<
    keyof ConfidenceFactors
  >) {
    const value = score.factors[factor];
    out.push({
      factor,
      score: value,
      explanation: FACTOR_TEXT[factor](value),
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function describeFeatureType(feature: Feature): string {
  switch (feature.type) {
    case 'POINT':
      return 'Point';
    case 'LINE':
      return 'Line';
    case 'POLYLINE':
      return 'Polyline';
    case 'POLYGON':
      return 'Boundary polygon';
    case 'CIRCLE':
      return 'Circle';
    case 'ELLIPSE':
      return 'Ellipse';
    case 'ARC':
      return 'Curve';
    case 'SPLINE':
      return 'Spline';
    case 'TEXT':
      return 'Text';
    case 'MIXED_GEOMETRY':
      return 'Mixed-geometry feature';
    case 'IMAGE':
      return 'Image';
    default:
      return 'Feature';
  }
}

function getFeaturePointIds(feature: Feature): string[] {
  const raw = feature.properties?.aiPointIds;
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

// `generateId` is exported for any consumer that wants to seed
// chat threads with a server-generated message id without
// pulling in the core types module separately.
export { generateId };
