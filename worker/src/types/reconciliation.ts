// worker/src/types/reconciliation.ts — Phase 7: Geometric Reconciliation
// All TypeScript interfaces for the GeometricReconciliationEngine.
//
// Spec §7 — Phase 7 Deliverable: ReconciledBoundaryModel

// ── Reading Sources ─────────────────────────────────────────────────────────

export type ReadingSource =
  | 'plat_segment'           // Phase 3: OCR from watermarked plat image segments
  | 'plat_geometric'         // Phase 3: AI visual measurement (protractor/ruler)
  | 'plat_overview'          // Phase 3: Full-plat overview extraction
  | 'deed_extraction'        // Phase 3: Metes & bounds from deed text
  | 'subdivision_interior'   // Phase 4: Interior line verification
  | 'adjacent_reversed'      // Phase 5: Reversed calls from adjacent deeds
  | 'adjacent_chain'         // Phase 5: Historical calls from chain of title
  | 'txdot_row'              // Phase 6: TxDOT authoritative road geometry
  | 'county_road_default';   // Phase 6: County road standard assumptions

// ── Boundary Reading ────────────────────────────────────────────────────────

export interface BoundaryReading {
  source: ReadingSource;
  callId: string;
  bearing: string | null;             // null for curves described only by parameters
  distance: number | null;
  unit: 'feet' | 'varas' | 'chains';
  type: 'straight' | 'curve';
  curve?: {
    radius: number;
    arcLength?: number;
    delta?: string;
    chordBearing?: string;
    chordDistance?: number;
    direction?: 'left' | 'right';
  };
  confidence: number;                 // 0-100 from the original extraction
  sourcePhase: number;                // 3, 4, 5, or 6
  sourceDetail: string;               // Human-readable origin
}

export interface WeightedReading extends BoundaryReading {
  weight: number;                     // Final computed weight (0.0 - 1.0)
  baseWeight: number;
  confidenceMultiplier: number;
  specialAdjustments: string[];
}

// ── Reading Set ─────────────────────────────────────────────────────────────

export interface ReadingSet {
  callId: string;
  along?: string;
  readings: BoundaryReading[];
  hasConflictingTypes: boolean;       // Some say straight, others say curve
  hasAuthoritative: boolean;          // TxDOT or similar authoritative source present
}

// ── Reconciliation Method ───────────────────────────────────────────────────

export type ReconciliationMethod =
  | 'weighted_consensus'              // All sources agree within tolerance — use weighted average
  | 'dominant_source'                 // One source has significantly higher weight — use it
  | 'authoritative_override'          // TxDOT or similar authority overrides other sources
  | 'best_closure'                    // Select the value that produces best traverse closure
  | 'single_source'                   // Only one reading available
  | 'unresolved';                     // Cannot reconcile — flag for manual review

// ── Reconciled Call ─────────────────────────────────────────────────────────

export interface ReconciledCall {
  callId: string;
  reconciledBearing: string | null;
  reconciledDistance: number | null;
  unit: 'feet';
  type: 'straight' | 'curve';
  along?: string;
  reconciledCurve?: {
    radius: number;
    arcLength?: number;
    delta?: string;
    chordBearing?: string;
    chordDistance?: number;
    direction?: 'left' | 'right';
  };
  reconciliation: {
    method: ReconciliationMethod;
    bearingSpread: string;
    distanceSpread: number;
    dominantSource: string;
    agreement: 'strong' | 'moderate' | 'weak' | 'resolved_conflict';
    notes: string;
  };
  readings: WeightedReading[];
  finalConfidence: number;
  previousConfidence: number;
  confidenceBoost: number;
  symbol: '✓' | '~' | '?' | '✗' | '✗✗';
}

// ── Traverse Points ─────────────────────────────────────────────────────────

export interface TraversePoint {
  pointId: string;
  callId: string;
  northing: number;
  easting: number;
  adjustedNorthing?: number;
  adjustedEasting?: number;
}

export interface ClosureResult {
  errorNorthing: number;
  errorEasting: number;
  errorDistance: number;
  closureRatio: string;               // "1:XXXXX"
  status: 'excellent' | 'acceptable' | 'marginal' | 'poor';
  perimeterLength: number;
  points: TraversePoint[];
}

export interface CompassRuleResult extends ClosureResult {
  compassRuleApplied: boolean;
  adjustments: { callId: string; dN: number; dE: number }[];
  adjustedPoints: TraversePoint[];
}

// ── Unresolved Conflict ─────────────────────────────────────────────────────

export interface UnresolvedConflict {
  callId: string;
  description: string;
  bearingDifference: string;
  distanceDifference: number;
  possibleCauses: string[];
  recommendedAction: string;
  impactOnClosure: 'none' | 'minor' | 'moderate' | 'severe';
}

// ── Source Contribution Stats ───────────────────────────────────────────────

export interface SourceContribution {
  callsContributed: number;
  timesChosen: number;
  averageWeight: number;
}

// ── Closure Optimization ────────────────────────────────────────────────────

export interface ClosureOptimization {
  beforeReconciliation: string;
  afterReconciliation: string;
  afterCompassRule: string;
  compassRuleApplied: boolean;
  compassRuleAdjustments: { callId: string; bearingAdj: string; distanceAdj: number }[];
}

// ── Reconciled Perimeter ────────────────────────────────────────────────────

export interface ReconciledPerimeter {
  calls: ReconciledCall[];
  closure: ClosureResult & {
    previousClosureRatio: string;
    improvementNotes: string;
  };
  totalCalls: number;
  reconciledCalls: number;
  averageConfidence: number;
  previousAverageConfidence: number;
}

// ── Reconciled Lot ──────────────────────────────────────────────────────────

export interface ReconciledLot {
  lotId: string;
  name: string;
  reconciledCalls: ReconciledCall[];
  reconciledCurves: ReconciledCall[];
  closure: {
    errorDistance: number;
    closureRatio: string;
    status: 'excellent' | 'acceptable' | 'marginal' | 'poor';
  };
  reconciledAcreage: number | null;
  averageConfidence: number;
  previousAverageConfidence: number;
}

// ── Phase Input Paths ───────────────────────────────────────────────────────

export interface PhasePaths {
  intelligence: string;               // Phase 3: property_intelligence.json
  subdivision?: string;               // Phase 4: subdivision_model.json
  crossValidation?: string;           // Phase 5: cross_validation_report.json
  rowReport?: string;                 // Phase 6: row_report.json
}

// ── Final ReconciledBoundaryModel (the Phase 7 deliverable) ─────────────────

export interface ReconciledBoundaryModel {
  status: 'complete' | 'partial' | 'failed';

  reconciledPerimeter: ReconciledPerimeter;
  reconciledLots: ReconciledLot[];

  sourceContributions: Record<ReadingSource, SourceContribution>;
  closureOptimization: ClosureOptimization;
  unresolvedConflicts: UnresolvedConflict[];

  timing: { totalMs: number };
  aiCalls: number;
  errors: string[];
}
