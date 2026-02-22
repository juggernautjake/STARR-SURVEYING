// lib/research/confidence.ts — Per-element confidence scoring
// Computes a weighted confidence score from 5 factors for every drawing element.

import type { ConfidenceFactors, Discrepancy, ExtractedDataPoint } from '@/types/research';

// ── Weights ──────────────────────────────────────────────────────────────────

export const CONFIDENCE_WEIGHTS = {
  source_quality: 0.15,
  extraction_certainty: 0.25,
  cross_reference_match: 0.30,
  geometric_consistency: 0.20,
  closure_contribution: 0.10,
} as const;

// ── Main Scoring Function ────────────────────────────────────────────────────

/**
 * Compute the overall confidence score (0-100) from weighted factors.
 */
export function computeElementConfidence(factors: ConfidenceFactors): number {
  return Math.round(
    factors.source_quality * CONFIDENCE_WEIGHTS.source_quality +
    factors.extraction_certainty * CONFIDENCE_WEIGHTS.extraction_certainty +
    factors.cross_reference_match * CONFIDENCE_WEIGHTS.cross_reference_match +
    factors.geometric_consistency * CONFIDENCE_WEIGHTS.geometric_consistency +
    factors.closure_contribution * CONFIDENCE_WEIGHTS.closure_contribution
  );
}

// ── Factor Computation ───────────────────────────────────────────────────────

/**
 * Compute all 5 confidence factors for a drawing element based on its
 * source data points, related discrepancies, and geometric context.
 */
export function computeConfidenceFactors(
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[],
  context: {
    closurePrecision?: number;   // 1:N ratio from traverse closure
    multiDocumentMatch?: boolean; // same value found in multiple docs
    geometricResidue?: number;   // residue after compass rule (feet)
  } = {}
): ConfidenceFactors {
  return {
    source_quality: computeSourceQuality(dataPoints),
    extraction_certainty: computeExtractionCertainty(dataPoints),
    cross_reference_match: computeCrossReferenceMatch(dataPoints, discrepancies, context.multiDocumentMatch),
    geometric_consistency: computeGeometricConsistency(context.closurePrecision, context.geometricResidue),
    closure_contribution: computeClosureContribution(context.closurePrecision),
  };
}

// ── Individual Factor Computations ───────────────────────────────────────────

/**
 * Source Quality (0-100): How clear and reliable was the source document?
 * Based on OCR confidence, document type, and extraction method.
 */
function computeSourceQuality(dataPoints: ExtractedDataPoint[]): number {
  if (dataPoints.length === 0) return 50;

  // Average the extraction confidence of source data points
  const avgConfidence = dataPoints.reduce(
    (sum, dp) => sum + (dp.extraction_confidence ?? 50),
    0
  ) / dataPoints.length;

  // Bonus for having multiple source data points
  const multiSourceBonus = dataPoints.length > 1 ? 5 : 0;

  return Math.min(100, Math.round(avgConfidence + multiSourceBonus));
}

/**
 * Extraction Certainty (0-100): How confident was the AI in reading the value?
 * Direct from extraction_confidence on the data points.
 */
function computeExtractionCertainty(dataPoints: ExtractedDataPoint[]): number {
  if (dataPoints.length === 0) return 50;

  // Use the maximum confidence among data points (best reading)
  const maxConfidence = Math.max(
    ...dataPoints.map(dp => dp.extraction_confidence ?? 50)
  );

  return Math.round(maxConfidence);
}

/**
 * Cross-Reference Match (0-100): Do other documents confirm this value?
 * Highest score when multiple documents agree; penalized for discrepancies.
 */
function computeCrossReferenceMatch(
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[],
  multiDocumentMatch?: boolean
): number {
  if (dataPoints.length === 0) return 50;

  // Base score
  let score = 70;

  // Bonus for multi-document confirmation
  const uniqueDocuments = new Set(dataPoints.map(dp => dp.document_id));
  if (uniqueDocuments.size > 1 || multiDocumentMatch) {
    score = 90;
  }

  // Penalty for related discrepancies by severity
  const dpIds = new Set(dataPoints.map(dp => dp.id));
  const relatedDisc = discrepancies.filter(d =>
    d.data_point_ids.some(id => dpIds.has(id))
  );

  for (const disc of relatedDisc) {
    switch (disc.severity) {
      case 'info':          score -= 2; break;
      case 'unclear':       score -= 5; break;
      case 'uncertain':     score -= 10; break;
      case 'discrepancy':   score -= 20; break;
      case 'contradiction': score -= 35; break;
      case 'error':         score -= 45; break;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Geometric Consistency (0-100): Does this element fit with adjacent elements?
 * Based on traverse closure precision and per-element residual.
 */
function computeGeometricConsistency(
  closurePrecision?: number,
  geometricResidue?: number
): number {
  if (closurePrecision === undefined) return 75; // default

  // Score based on closure precision ratio
  let score: number;
  if (closurePrecision >= 50000) {
    score = 98; // Excellent: better than 1:50,000
  } else if (closurePrecision >= 25000) {
    score = 95;
  } else if (closurePrecision >= 15000) {
    score = 90;
  } else if (closurePrecision >= 10000) {
    score = 85;
  } else if (closurePrecision >= 5000) {
    score = 75;
  } else if (closurePrecision >= 2000) {
    score = 60;
  } else if (closurePrecision >= 1000) {
    score = 40;
  } else {
    score = 20; // Poor closure
  }

  // Further adjust by per-element residual if available
  if (geometricResidue !== undefined) {
    if (geometricResidue > 1.0) score -= 15;
    else if (geometricResidue > 0.5) score -= 8;
    else if (geometricResidue > 0.1) score -= 3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Closure Contribution (0-100): How well does this element contribute to closure?
 * Primarily based on overall traverse closure quality.
 */
function computeClosureContribution(closurePrecision?: number): number {
  if (closurePrecision === undefined) return 80; // default

  if (closurePrecision >= 25000) return 95;
  if (closurePrecision >= 10000) return 85;
  if (closurePrecision >= 5000) return 75;
  if (closurePrecision >= 2000) return 60;
  if (closurePrecision >= 1000) return 40;
  return 20;
}

// ── Confidence Label ─────────────────────────────────────────────────────────

export type ConfidenceLevel = 'very_high' | 'high' | 'moderate' | 'low' | 'very_low';

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 90) return 'very_high';
  if (score >= 75) return 'high';
  if (score >= 55) return 'moderate';
  if (score >= 35) return 'low';
  return 'very_low';
}

export function getConfidenceColor(score: number): string {
  if (score >= 90) return '#059669'; // green
  if (score >= 75) return '#2563EB'; // blue
  if (score >= 55) return '#F59E0B'; // amber
  if (score >= 35) return '#F97316'; // orange
  return '#EF4444'; // red
}
