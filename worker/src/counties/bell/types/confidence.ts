/**
 * Confidence Rating System for Bell County Research
 *
 * Every piece of data gets rated on three axes:
 * 1. Source Reliability (0-40) — how trustworthy is the source?
 * 2. Data Usefulness (0-30) — how actionable is the data?
 * 3. Cross-Validation (0-30) — is it confirmed by other sources?
 */

export interface ConfidenceRating {
  /** Overall score 0-100 */
  score: number;
  /** Human-readable tier */
  tier: ConfidenceTier;
  /** Breakdown of how the score was computed */
  factors: ConfidenceFactors;
}

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'unverified';

export interface ConfidenceFactors {
  sourceReliability: number;
  dataUsefulness: number;
  crossValidation: number;
  /** Source name for display */
  sourceName: string;
  /** What validated this data (if any) */
  validatedBy: string[];
  /** What contradicted this data (if any) */
  contradictedBy: string[];
}

/** Source reliability base scores (out of 40) */
export const SOURCE_RELIABILITY: Record<string, number> = {
  'county-clerk-official':   40,
  'bell-cad':                35,
  'txdot':                   35,
  'fema-nfhl':               35,
  'arcgis-gis':              30,
  'kofile-publicsearch':     30,
  'henschen-clerk':          30,
  'county-plat-repo':        25,
  'ai-ocr-extraction':       15,
  'watermarked-preview':     10,
};

export function computeConfidence(factors: ConfidenceFactors): ConfidenceRating {
  const score = Math.max(0, Math.min(100,
    factors.sourceReliability + factors.dataUsefulness + factors.crossValidation,
  ));
  let tier: ConfidenceTier;
  if (score >= 70) tier = 'high';
  else if (score >= 45) tier = 'medium';
  else if (score >= 25) tier = 'low';
  else tier = 'unverified';

  return { score, tier, factors };
}
