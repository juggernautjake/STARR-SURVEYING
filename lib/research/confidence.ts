// lib/research/confidence.ts — Per-element confidence scoring
// Computes a weighted confidence score from 5 factors for every drawing element.
// Criteria account for: document readability, age, contradictions, source type,
// OCR quality, multi-document confirmation, discrepancy severity, and geometry.

import type {
  ConfidenceFactors,
  Discrepancy,
  ExtractedDataPoint,
  DocumentType,
} from '@/types/research';

// ── Weights ──────────────────────────────────────────────────────────────────

export const CONFIDENCE_WEIGHTS = {
  source_quality: 0.20,
  extraction_certainty: 0.25,
  cross_reference_match: 0.25,
  geometric_consistency: 0.20,
  closure_contribution: 0.10,
} as const;

// ── Document Type Reliability Tiers ──────────────────────────────────────────
// How reliable is each document type as a primary data source?

const DOC_TYPE_RELIABILITY: Record<string, number> = {
  // Tier 1: Professionally prepared survey documents (high reliability)
  survey: 95,
  metes_and_bounds: 92,
  field_notes: 90,
  // Tier 2: Official recorded documents (good reliability)
  plat: 88,
  subdivision_plat: 88,
  deed: 85,
  legal_description: 85,
  easement: 82,
  // Tier 3: Supporting documents (moderate reliability for survey data)
  title_commitment: 70,
  restrictive_covenant: 68,
  county_record: 72,
  // Tier 4: Supplementary / indirect sources (lower reliability for geometry)
  appraisal_record: 55,
  aerial_photo: 50,
  topo_map: 60,
  utility_map: 55,
  // Unknown
  other: 45,
};

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
 *
 * Context options:
 * - closurePrecision:     1:N ratio from traverse closure
 * - multiDocumentMatch:   same value confirmed across multiple docs
 * - geometricResidue:     per-element residual after compass rule (feet)
 * - documentTypes:        the types of source documents for this element
 * - documentDates:        recorded dates of source documents (for age penalty)
 * - ocrConfidences:       per-document OCR confidence scores
 * - sourceTypes:          'upload' | 'online_research' | 'county_record' etc.
 */
export function computeConfidenceFactors(
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[],
  context: {
    closurePrecision?: number;
    multiDocumentMatch?: boolean;
    geometricResidue?: number;
    documentTypes?: (DocumentType | string | null)[];
    documentDates?: (string | null)[];
    ocrConfidences?: (number | null)[];
    sourceTypes?: string[];
  } = {}
): ConfidenceFactors {
  return {
    source_quality: computeSourceQuality(dataPoints, context),
    extraction_certainty: computeExtractionCertainty(dataPoints, context),
    cross_reference_match: computeCrossReferenceMatch(dataPoints, discrepancies, context.multiDocumentMatch),
    geometric_consistency: computeGeometricConsistency(context.closurePrecision, context.geometricResidue),
    closure_contribution: computeClosureContribution(context.closurePrecision),
  };
}

// ── Individual Factor Computations ───────────────────────────────────────────

/**
 * Source Quality (0-100): How clear, reliable, and recent was the source?
 *
 * Criteria:
 * - Document type reliability tier (survey > deed > appraisal)
 * - OCR confidence (how readable was the document?)
 * - Document age (older documents have lower reliability)
 * - Source type (uploaded scans may be lower quality than direct county records)
 * - Multiple sources confirming = bonus
 */
function computeSourceQuality(
  dataPoints: ExtractedDataPoint[],
  context: {
    documentTypes?: (DocumentType | string | null)[];
    documentDates?: (string | null)[];
    ocrConfidences?: (number | null)[];
    sourceTypes?: string[];
  }
): number {
  if (dataPoints.length === 0) return 40; // No data = low confidence

  // 1. Base from extraction confidence (how readable was the content?)
  const avgConfidence = dataPoints.reduce(
    (sum, dp) => sum + (dp.extraction_confidence ?? 50),
    0
  ) / dataPoints.length;

  // Start from extraction confidence, normalized to 0-50 range
  let score = Math.min(50, avgConfidence * 0.5);

  // 2. Document type reliability bonus (0-25 points)
  if (context.documentTypes && context.documentTypes.length > 0) {
    const typeScores = context.documentTypes
      .map(dt => DOC_TYPE_RELIABILITY[dt || 'other'] ?? 45);
    const bestTypeScore = Math.max(...typeScores);
    score += bestTypeScore * 0.25; // max +23.75
  } else {
    score += 12; // Unknown document type — neutral
  }

  // 3. OCR readability bonus/penalty (0-15 points)
  if (context.ocrConfidences && context.ocrConfidences.length > 0) {
    const validOcr = context.ocrConfidences.filter(c => c != null) as number[];
    if (validOcr.length > 0) {
      const avgOcr = validOcr.reduce((a, b) => a + b, 0) / validOcr.length;
      if (avgOcr >= 90) score += 15;       // Crystal clear document
      else if (avgOcr >= 75) score += 10;   // Good readability
      else if (avgOcr >= 50) score += 5;    // Moderate readability
      else if (avgOcr >= 25) score -= 5;    // Poor readability
      else score -= 10;                      // Barely legible
    }
  } else {
    score += 5; // No OCR data — assume moderate
  }

  // 4. Document age penalty
  if (context.documentDates && context.documentDates.length > 0) {
    const now = new Date();
    const ages = context.documentDates
      .filter(d => d != null)
      .map(d => {
        const date = new Date(d!);
        return (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
      });
    if (ages.length > 0) {
      const oldestAge = Math.max(...ages);
      // Recent surveys (< 5 years) get a bonus
      if (oldestAge < 2) score += 10;
      else if (oldestAge < 5) score += 5;
      else if (oldestAge < 10) score += 0;
      // Older documents get penalized
      else if (oldestAge < 20) score -= 5;
      else if (oldestAge < 40) score -= 10;
      else if (oldestAge < 60) score -= 15;
      else score -= 20; // Very old (pre-1960s)
    }
  }

  // 5. Multi-source bonus
  if (dataPoints.length > 1) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Extraction Certainty (0-100): How confident was the AI in reading this value?
 *
 * Criteria:
 * - AI extraction confidence score (primary)
 * - Confidence reasoning analysis (mentions of unclear, faded, ambiguous)
 * - Whether the data was successfully normalized (parsed correctly)
 * - If multiple readings exist, do they agree?
 */
function computeExtractionCertainty(
  dataPoints: ExtractedDataPoint[],
  context: { ocrConfidences?: (number | null)[] } = {}
): number {
  if (dataPoints.length === 0) return 40;

  // Use the maximum AI extraction confidence among data points (best reading)
  const maxConfidence = Math.max(
    ...dataPoints.map(dp => dp.extraction_confidence ?? 50)
  );

  let score = maxConfidence;

  // Bonus if data was successfully normalized (AI could parse the value)
  const normalizedCount = dataPoints.filter(dp => dp.normalized_value != null).length;
  if (normalizedCount === dataPoints.length && dataPoints.length > 0) {
    score += 5; // All values successfully parsed
  } else if (normalizedCount === 0) {
    score -= 10; // No values could be parsed — something is wrong
  }

  // Penalty if confidence reasoning mentions issues
  for (const dp of dataPoints) {
    const reasoning = (dp.confidence_reasoning || '').toLowerCase();
    if (reasoning.includes('faded') || reasoning.includes('illegible')) score -= 8;
    else if (reasoning.includes('unclear') || reasoning.includes('ambiguous')) score -= 5;
    else if (reasoning.includes('ocr') && reasoning.includes('error')) score -= 6;
    else if (reasoning.includes('partially') || reasoning.includes('assumed')) score -= 3;
  }

  // OCR quality adjustment
  if (context.ocrConfidences && context.ocrConfidences.length > 0) {
    const validOcr = context.ocrConfidences.filter(c => c != null) as number[];
    if (validOcr.length > 0) {
      const avgOcr = validOcr.reduce((a, b) => a + b, 0) / validOcr.length;
      if (avgOcr < 50) score -= 10; // Poor OCR = harder to trust extraction
      else if (avgOcr < 70) score -= 5;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Cross-Reference Match (0-100): Do other documents confirm this value?
 *
 * Criteria:
 * - Number of unique documents that contain this data point
 * - Whether documents agree (confirmations)
 * - Discrepancy severity and count
 * - Types of discrepancies (contradictions vs. minor rounding)
 * - Probable causes (clerical errors vs. surveying errors)
 */
function computeCrossReferenceMatch(
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[],
  multiDocumentMatch?: boolean
): number {
  if (dataPoints.length === 0) return 40;

  const uniqueDocuments = new Set(dataPoints.map(dp => dp.document_id));
  const docCount = uniqueDocuments.size;

  // Base score by number of confirming documents
  let score: number;
  if (docCount >= 3 || multiDocumentMatch) {
    score = 95; // Three or more documents confirm this value
  } else if (docCount === 2) {
    score = 85; // Two documents confirm
  } else {
    score = 60; // Only one document — no cross-reference possible
  }

  // Penalty for related discrepancies by severity AND probable cause
  const dpIds = new Set(dataPoints.map(dp => dp.id));
  const relatedDisc = discrepancies.filter(d =>
    d.data_point_ids.some(id => dpIds.has(id))
  );

  for (const disc of relatedDisc) {
    // Severity-based penalty
    switch (disc.severity) {
      case 'info':          score -= 1; break;
      case 'unclear':       score -= 4; break;
      case 'uncertain':     score -= 8; break;
      case 'discrepancy':   score -= 15; break;
      case 'contradiction': score -= 30; break;
      case 'error':         score -= 40; break;
    }

    // Additional penalty based on probable cause
    switch (disc.probable_cause) {
      case 'clerical_error':       score -= 3; break;
      case 'drawing_error':        score -= 5; break;
      case 'surveying_error':      score -= 10; break;
      case 'transcription_error':  score -= 3; break;
      case 'rounding_difference':  score -= 0; break; // Already handled by severity
      case 'datum_difference':     score -= 5; break;
      case 'age_difference':       score -= 3; break;
      case 'legal_ambiguity':      score -= 8; break;
      case 'missing_information':  score -= 5; break;
      case 'ocr_uncertainty':      score -= 4; break;
    }

    // Extra penalty if discrepancy affects boundary or closure
    if (disc.affects_boundary) score -= 3;
    if (disc.affects_closure) score -= 3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Geometric Consistency (0-100): Does this element fit with adjacent elements?
 *
 * Criteria:
 * - Traverse closure precision ratio (1:N)
 *   - 1:50,000+ = survey-grade (exceptional)
 *   - 1:25,000  = Texas urban standard
 *   - 1:10,000  = Texas rural minimum
 *   - Below 1:10,000 = below minimum standard
 * - Per-element residual after compass rule adjustment
 */
function computeGeometricConsistency(
  closurePrecision?: number,
  geometricResidue?: number
): number {
  if (closurePrecision === undefined) return 70; // No closure data — moderate default

  let score: number;
  if (closurePrecision >= 50000) {
    score = 98;
  } else if (closurePrecision >= 25000) {
    score = 95;
  } else if (closurePrecision >= 15000) {
    score = 90;
  } else if (closurePrecision >= 10000) {
    score = 85;
  } else if (closurePrecision >= 5000) {
    score = 70;
  } else if (closurePrecision >= 2000) {
    score = 55;
  } else if (closurePrecision >= 1000) {
    score = 35;
  } else if (closurePrecision >= 500) {
    score = 20;
  } else {
    score = 10; // Very poor closure
  }

  // Per-element residual adjustment
  if (geometricResidue !== undefined) {
    if (geometricResidue > 2.0) score -= 20;
    else if (geometricResidue > 1.0) score -= 15;
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
  if (closurePrecision === undefined) return 70; // No data — moderate default

  if (closurePrecision >= 25000) return 95;
  if (closurePrecision >= 10000) return 85;
  if (closurePrecision >= 5000) return 70;
  if (closurePrecision >= 2000) return 55;
  if (closurePrecision >= 1000) return 35;
  return 15;
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

export function getConfidenceDescription(score: number): string {
  if (score >= 90) return 'Very High — Multiple sources agree, recent survey data, clear documents';
  if (score >= 75) return 'High — Good source data, few discrepancies';
  if (score >= 55) return 'Moderate — Some uncertainty, limited sources or minor discrepancies';
  if (score >= 35) return 'Low — Significant uncertainty, poor readability or contradictions';
  return 'Very Low — Unreliable data, major contradictions or illegible sources';
}
