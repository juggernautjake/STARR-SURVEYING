/**
 * Bell County Confidence Scorer
 *
 * Comprehensive confidence rating system that evaluates every piece of data
 * on three axes:
 *
 *   1. SOURCE RELIABILITY (0-40): How trustworthy is the origin?
 *      - Official recorded documents score highest (40)
 *      - AI-extracted OCR data scores lowest (10-15)
 *
 *   2. DATA USEFULNESS (0-30): How actionable is the information?
 *      - Specific measurements (bearings, distances): 30
 *      - Legal descriptions with calls: 25
 *      - Names and dates only: 10
 *
 *   3. CROSS-VALIDATION (0-30): Is it confirmed by other sources?
 *      - Confirmed by 3+ sources: 30
 *      - Contradicted: negative points
 *
 *  Final score determines confidence tier:
 *    High (70-100) | Medium (45-69) | Low (25-44) | Unverified (0-24)
 */

import type { ConfidenceRating, ConfidenceFactors, ConfidenceTier } from '../types/confidence';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence';

// ── Types ────────────────────────────────────────────────────────────

export interface DataItem {
  /** Unique key for this piece of data */
  key: string;
  /** The actual value */
  value: string;
  /** Where it came from */
  source: string;
  /** What kind of data (for usefulness scoring) */
  dataType: DataType;
}

export type DataType =
  | 'measurement'        // Bearings, distances, coordinates → 30
  | 'legal_description'  // Full legal description → 25
  | 'instrument_ref'     // Instrument number, volume/page → 20
  | 'document_image'     // Scanned page image → 18
  | 'name'               // Owner name, grantor/grantee → 15
  | 'date'               // Recording date, deed date → 12
  | 'classification'     // Property type, flood zone → 10
  | 'narrative'          // AI-generated summary → 8
  | 'metadata'           // General metadata → 5;

// ── Usefulness Scores ────────────────────────────────────────────────

const DATA_USEFULNESS: Record<DataType, number> = {
  measurement: 30,
  legal_description: 25,
  instrument_ref: 20,
  document_image: 18,
  name: 15,
  date: 12,
  classification: 10,
  narrative: 8,
  metadata: 5,
};

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Score a single data item's confidence.
 */
export function scoreDataItem(
  item: DataItem,
  allItems: DataItem[],
): ConfidenceRating {
  const sourceReliability = getSourceReliability(item.source);
  const dataUsefulness = DATA_USEFULNESS[item.dataType] ?? 5;
  const crossValidation = computeCrossValidation(item, allItems);

  return computeConfidence({
    sourceReliability,
    dataUsefulness,
    crossValidation: crossValidation.score,
    sourceName: item.source,
    validatedBy: crossValidation.validatedBy,
    contradictedBy: crossValidation.contradictedBy,
  });
}

/**
 * Score the overall confidence of a research result.
 * Weighted average of all data items, prioritizing high-usefulness data.
 */
export function scoreOverallConfidence(items: DataItem[]): ConfidenceRating {
  if (items.length === 0) {
    return computeConfidence({
      sourceReliability: 0,
      dataUsefulness: 0,
      crossValidation: 0,
      sourceName: 'none',
      validatedBy: [],
      contradictedBy: [],
    });
  }

  const scores = items.map(item => ({
    rating: scoreDataItem(item, items),
    weight: DATA_USEFULNESS[item.dataType] ?? 5,
  }));

  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  const weightedScore = scores.reduce((sum, s) => sum + s.rating.score * s.weight, 0) / totalWeight;

  // Count sources
  const uniqueSources = new Set(items.map(i => i.source));
  const allValidated = scores.flatMap(s => s.rating.factors.validatedBy);
  const allContradicted = scores.flatMap(s => s.rating.factors.contradictedBy);

  let tier: ConfidenceTier;
  if (weightedScore >= 70) tier = 'high';
  else if (weightedScore >= 45) tier = 'medium';
  else if (weightedScore >= 25) tier = 'low';
  else tier = 'unverified';

  return {
    score: Math.round(weightedScore),
    tier,
    factors: {
      sourceReliability: Math.round(scores.reduce((s, i) => s + i.rating.factors.sourceReliability, 0) / scores.length),
      dataUsefulness: Math.round(scores.reduce((s, i) => s + i.rating.factors.dataUsefulness, 0) / scores.length),
      crossValidation: Math.round(scores.reduce((s, i) => s + i.rating.factors.crossValidation, 0) / scores.length),
      sourceName: `${uniqueSources.size} source(s)`,
      validatedBy: [...new Set(allValidated)],
      contradictedBy: [...new Set(allContradicted)],
    },
  };
}

// ── Internal: Source Reliability ──────────────────────────────────────

function getSourceReliability(source: string): number {
  const normalized = source.toLowerCase().replace(/\s+/g, '-');

  // Check exact matches first
  if (SOURCE_RELIABILITY[normalized] !== undefined) {
    return SOURCE_RELIABILITY[normalized];
  }

  // Fuzzy matching for common patterns
  if (normalized.includes('clerk') || normalized.includes('official')) return 40;
  if (normalized.includes('cad') || normalized.includes('appraisal')) return 35;
  if (normalized.includes('txdot') || normalized.includes('fema')) return 35;
  if (normalized.includes('gis') || normalized.includes('arcgis')) return 30;
  if (normalized.includes('kofile') || normalized.includes('publicsearch')) return 30;
  if (normalized.includes('plat-repo') || normalized.includes('county-plat')) return 25;
  if (normalized.includes('ai') || normalized.includes('ocr') || normalized.includes('vision')) return 15;
  if (normalized.includes('watermark')) return 10;

  return 15; // Default for unknown sources
}

// ── Internal: Cross-Validation ───────────────────────────────────────

interface CrossValidationResult {
  score: number;
  validatedBy: string[];
  contradictedBy: string[];
}

function computeCrossValidation(
  item: DataItem,
  allItems: DataItem[],
): CrossValidationResult {
  const validatedBy: string[] = [];
  const contradictedBy: string[] = [];

  // Find other items with the same key from different sources
  const otherSources = allItems.filter(
    other => other.key === item.key && other.source !== item.source,
  );

  for (const other of otherSources) {
    const match = valuesMatch(item.value, other.value, item.dataType);
    if (match === 'exact' || match === 'close') {
      validatedBy.push(other.source);
    } else if (match === 'contradiction') {
      contradictedBy.push(other.source);
    }
  }

  // Score calculation
  let score = 5; // Base: single source, uncontradicted
  if (validatedBy.length >= 3) score = 30;
  else if (validatedBy.length === 2) score = 20;
  else if (validatedBy.length === 1) score = 10;

  // Penalties for contradictions
  score -= contradictedBy.length * 10;
  score = Math.max(-10, Math.min(30, score));

  return { score, validatedBy, contradictedBy };
}

function valuesMatch(
  a: string,
  b: string,
  dataType: DataType,
): 'exact' | 'close' | 'contradiction' | 'unknown' {
  const normA = a.toUpperCase().trim();
  const normB = b.toUpperCase().trim();

  if (normA === normB) return 'exact';

  switch (dataType) {
    case 'measurement': {
      // Parse numeric values and compare with tolerance
      const numA = parseFloat(normA.replace(/[^0-9.]/g, ''));
      const numB = parseFloat(normB.replace(/[^0-9.]/g, ''));
      if (!isNaN(numA) && !isNaN(numB)) {
        const diff = Math.abs(numA - numB);
        const pct = diff / Math.max(numA, numB) * 100;
        if (pct < 1) return 'exact';
        if (pct < 5) return 'close';
        return 'contradiction';
      }
      break;
    }
    case 'name': {
      // Fuzzy name comparison (handles LAST, FIRST vs FIRST LAST)
      const wordsA = new Set(normA.replace(/[,]/g, '').split(/\s+/));
      const wordsB = new Set(normB.replace(/[,]/g, '').split(/\s+/));
      const intersection = [...wordsA].filter(w => wordsB.has(w));
      if (intersection.length >= Math.min(wordsA.size, wordsB.size)) return 'close';
      if (intersection.length > 0) return 'unknown';
      return 'contradiction';
    }
    case 'legal_description': {
      // Check if one contains the other (CAD often truncates)
      if (normA.includes(normB) || normB.includes(normA)) return 'close';
      // Check word overlap
      const wordsA = new Set(normA.split(/\s+/));
      const wordsB = new Set(normB.split(/\s+/));
      const overlap = [...wordsA].filter(w => wordsB.has(w)).length;
      const overlapPct = overlap / Math.max(wordsA.size, wordsB.size);
      if (overlapPct > 0.7) return 'close';
      if (overlapPct > 0.3) return 'unknown';
      return 'contradiction';
    }
    default: {
      if (normA.includes(normB) || normB.includes(normA)) return 'close';
      return 'unknown';
    }
  }
  return 'unknown';
}
