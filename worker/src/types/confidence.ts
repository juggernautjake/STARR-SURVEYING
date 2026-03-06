// worker/src/types/confidence.ts — Phase 8: Confidence Scoring & Discrepancy Intelligence
// All TypeScript interfaces for the ConfidenceScoringEngine.
//
// Spec §8 — Phase 8 Deliverable: ConfidenceReport

// ── Call-Level Confidence ────────────────────────────────────────────────────

export interface CallConfidenceScore {
  callId: string;
  score: number;                // 0-100
  grade: string;                // A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F
  sourceCount: number;
  sources: string[];
  agreement: 'strong' | 'moderate' | 'weak' | 'n/a';
  factors: {
    sourceMultiplicity: number;   // 0-25: more independent sources = better
    sourceAgreement: number;      // 0-25: how closely sources agree
    sourceReliability: number;    // 0-25: quality of the sources present
    readingClarity: number;       // 0-25: OCR quality, watermark impact
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  notes: string | null;
}

// ── Lot-Level Confidence ─────────────────────────────────────────────────────

export interface LotConfidenceScore {
  lotId: string;
  name: string;
  score: number;
  grade: string;
  callScores: number[];
  weakestCall: { callId: string; score: number; reason: string } | null;
  closureStatus: string;
  closureRatio: string;
  acreageConfidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ── Boundary-Side Confidence ─────────────────────────────────────────────────

export interface BoundarySideConfidence {
  side: string;
  score: number;
  grade: string;
  calls: number;
  avgCallScore: number;
  risk?: string;
}

// ── Overall Confidence ───────────────────────────────────────────────────────

export interface OverallConfidence {
  score: number;
  grade: string;
  label: string;
  summary: string;
}

// ── Discrepancy Types ────────────────────────────────────────────────────────

export type DiscrepancyCategory =
  | 'bearing_mismatch'       // Two sources disagree on bearing
  | 'distance_mismatch'      // Two sources disagree on distance
  | 'type_conflict'          // One says straight, another says curve
  | 'monument_conflict'      // Different monuments referenced
  | 'datum_shift'            // NAD27 vs NAD83 or similar
  | 'area_discrepancy'       // Computed area doesn't match stated
  | 'missing_call'           // Deed or plat has extra/missing calls
  | 'road_geometry'          // Straight vs curved road boundary
  | 'chain_of_title'         // Boundary description changed over time
  | 'unclassified';

export interface DiscrepancyReport {
  id: string;
  severity: 'critical' | 'moderate' | 'minor';
  category: DiscrepancyCategory;
  title: string;
  description: string;
  status: 'unresolved' | 'resolved';
  resolvedBy?: string;
  resolvedInPhase?: number;
  affectedCalls: string[];
  affectedLots: string[];
  readings: {
    source: string;
    bearing: string | null;
    distance: number | null;
    confidence: number;
  }[];
  analysis: {
    possibleCauses: {
      cause: string;
      likelihood: 'high' | 'medium' | 'low';
      explanation: string;
    }[];
    likelyCorrectValue?: {
      bearing: string;
      distance: number;
      reasoning: string;
    };
    impactAssessment: {
      closureImpact: 'severe' | 'moderate' | 'minimal' | 'none';
      acreageImpact: string;
      boundaryPositionShift: string;
      legalSignificance: string;
    };
  };
  resolution: {
    recommended: string;
    alternatives: string[];
    estimatedCost: string;
    estimatedConfidenceAfterResolution: number;
    priority: number;
  };
}

// ── Discrepancy Summary ──────────────────────────────────────────────────────

export interface DiscrepancySummary {
  total: number;
  critical: number;
  moderate: number;
  minor: number;
  resolved: number;
  unresolved: number;
  estimatedResolutionCost: string;
  estimatedConfidenceAfterResolution: number;
}

// ── Purchase Recommendation ──────────────────────────────────────────────────

export interface PurchaseRecommendation {
  documentType: 'plat' | 'deed' | 'easement' | 'restriction';
  instrument: string;
  source: string;
  estimatedCost: string;
  confidenceImpact: string;          // "+12 overall"
  callsImproved: number;
  reason: string;
  priority: number;
  roi: number;                        // confidence points gained per dollar
}

// ── Surveyor Decision Matrix ─────────────────────────────────────────────────

export interface SurveyorDecision {
  readyForField: boolean;
  caveats: string[];
  recommendedFieldChecks: { location: string; reason: string }[];
  minConfidenceForField: number;
  currentConfidence: number;
  afterDocPurchase: number;
}

// ── Final ConfidenceReport (the Phase 8 deliverable) ─────────────────────────

export interface ConfidenceReport {
  status: 'complete' | 'partial' | 'failed';

  overallConfidence: OverallConfidence;
  callConfidence: CallConfidenceScore[];
  lotConfidence: LotConfidenceScore[];
  boundaryConfidence: BoundarySideConfidence[];

  discrepancies: DiscrepancyReport[];
  discrepancySummary: DiscrepancySummary;

  documentPurchaseRecommendations: PurchaseRecommendation[];
  surveyorDecisionMatrix: SurveyorDecision;

  timing: { totalMs: number };
  aiCalls: number;
  errors: string[];
}
