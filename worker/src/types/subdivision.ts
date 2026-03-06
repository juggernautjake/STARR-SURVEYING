// worker/src/types/subdivision.ts — Phase 4: Subdivision & Plat Intelligence
// All TypeScript interfaces for the SubdivisionIntelligenceEngine.
//
// Spec §4 — Phase 4 Deliverable: SubdivisionModel

import type { BoundaryCall, DocumentReference } from './index.js';

// ── Subdivision Classification ──────────────────────────────────────────────

export type SubdivisionClassification =
  | 'original_plat'          // New subdivision filing
  | 'replat'                 // Replat of part of existing subdivision
  | 'amended_plat'           // Amendment to existing plat
  | 'lot_split'              // Single lot split into smaller lots
  | 'minor_plat'             // 1-4 lots, simplified process
  | 'development_plat'       // Part of larger planned development
  | 'vacating_plat'          // Vacates (cancels) part of an existing plat
  | 'standalone_tract'       // Not a subdivision at all
  | 'lot_in_subdivision'     // A single lot within an existing subdivision
  | 'unknown';

export interface SubdivisionClassResult {
  classification: SubdivisionClassification;
  confidence: number;
  reasoning: string;
  subdivisionName?: string;
  totalLots?: number;
  hasReserves: boolean;
  hasCommonAreas: boolean;
  isPartOfLargerDevelopment: boolean;
  parentSubdivision?: string;
  platInstrument?: string;
  amendments: string[];
}

// ── Lot Inventory ───────────────────────────────────────────────────────────

export interface LotInventoryEntry {
  lotName: string;
  cadPropertyId?: string;
  cadOwner?: string;
  cadAcreage?: number;
  platAcreage?: number;
  platSqFt?: number;
  isOnPlat: boolean;
  isInCAD: boolean;
  matchConfidence: number;
  status: 'matched' | 'plat_only' | 'cad_only' | 'ambiguous';
  improvements?: { type: string; sqft?: number; yearBuilt?: number }[];
}

// ── Interior Line Analysis ──────────────────────────────────────────────────

export interface InteriorLine {
  lineId: string;
  lotA: string;
  lotB: string;
  callFromA?: BoundaryCall;
  callFromB?: BoundaryCall;

  bearingComparison: {
    fromA: string;
    fromB: string;
    fromBReversed: string;
    angularDifference: number;
    status: 'match' | 'close' | 'marginal' | 'discrepancy';
  } | null;

  distanceComparison: {
    fromA: number;
    fromB: number;
    difference: number;
    status: 'match' | 'close' | 'marginal' | 'discrepancy';
  } | null;

  overallStatus: 'verified' | 'close_match' | 'marginal' | 'discrepancy' | 'one_sided' | 'missing';
  notes: string[];
}

// ── Area Reconciliation ─────────────────────────────────────────────────────

export interface AreaReconciliationResult {
  statedTotalAcreage: number;
  statedTotalSqFt: number;
  computedLotSumSqFt: number;
  computedLotSumAcreage: number;
  roadDedicationSqFt: number;
  commonAreaSqFt: number;
  reserveSqFt: number;
  unaccountedSqFt: number;
  unaccountedPct: number;
  status: 'excellent' | 'acceptable' | 'marginal' | 'discrepancy';
  breakdown: {
    name: string;
    type: 'lot' | 'reserve' | 'common_area' | 'road_dedication' | 'other';
    sqft: number;
    acreage: number;
    source: 'plat' | 'cad' | 'computed';
  }[];
  notes: string[];
}

// ── Adjacency Matrix ────────────────────────────────────────────────────────

export interface LotAdjacency {
  north: string[];
  south: string[];
  east: string[];
  west: string[];
  northeast: string[];
  northwest: string[];
  southeast: string[];
  southwest: string[];
}

export interface AdjacencyMatrix {
  lots: string[];
  adjacencies: Record<string, LotAdjacency>;
}

// ── AI Analysis Result ──────────────────────────────────────────────────────

export interface SubdivisionAnalysisResult {
  rawAnalysis: string;
  sections: Record<string, string>;
  spatialLayout: string;
  lotVerification: string;
  roadNetwork: string;
  infrastructure: string;
  setbacks: string;
  issues: string;
  areaReconciliation: string;
  recommendations: string;
}

// ── Lot Model (in the final SubdivisionModel) ───────────────────────────────

export interface SubdivisionLot {
  lotId: string;
  name: string;
  lotType: 'residential' | 'commercial' | 'agricultural' | 'mixed_use' | 'reserve' | 'common_area' | 'open_space' | 'unknown';
  acreage: number | null;
  sqft: number | null;
  owner: string | null;
  cadPropertyId: string | null;
  status: 'vacant' | 'improved' | 'under_construction' | 'unknown';
  position: string | null;
  frontsOn: string | null;
  frontage: number | null;
  depth: number | null;
  shape: string | null;
  boundaryCalls: BoundaryCall[];
  curves: BoundaryCall[];
  closure: ClosureData | null;
  setbacks: { front?: number; side?: number; rear?: number } | null;
  easements: LotEasement[];
  adjacentLots: Record<string, string>;
  sharedBoundaries: SharedBoundary[];
  buildableArea: {
    estimated: boolean;
    sqft: number | null;
    reductionReasons: string[];
  } | null;
  confidence: number;
}

export interface ClosureData {
  errorNorthing: number;
  errorEasting: number;
  errorDistance: number;
  closureRatio: string;
  status: 'excellent' | 'acceptable' | 'marginal' | 'poor';
}

export interface LotEasement {
  type: string;
  width: number | null;
  side: string | null;
  description: string;
}

export interface SharedBoundary {
  withLot: string;
  calls: string[];
  agreement: 'confirmed' | 'close_match' | 'discrepancy' | 'unverified';
}

// ── Reserve Model ───────────────────────────────────────────────────────────

export interface SubdivisionReserve {
  reserveId: string;
  name: string;
  purpose: string;
  acreage: number | null;
  sqft: number | null;
  maintainedBy: string | null;
  restrictions: string | null;
  boundaryCalls: BoundaryCall[];
  confidence: number;
}

// ── Common Elements ─────────────────────────────────────────────────────────

export interface CommonElements {
  roads: {
    name: string;
    type: 'public' | 'private';
    dedicatedTo: string | null;
    rowWidth: number | null;
    pavementWidth: number | null;
    within: string;
    serves: string[];
  }[];
  drainageEasements: {
    width: number | null;
    location: string;
    flowDirection: string | null;
    outfall: string | null;
  }[];
  utilityEasements: {
    width: number | null;
    location: string;
    providers: string[];
  }[];
  accessEasements: {
    width: number | null;
    location: string;
    beneficiary: string | null;
  }[];
}

// ── Restrictive Covenants ───────────────────────────────────────────────────

export interface RestrictiveCovenants {
  instrument: string | null;
  available: boolean;
  knownRestrictions: string[];
  source: 'plat_notes' | 'ccr_document' | 'deed_restrictions' | 'unknown';
}

// ── Plat Amendment ──────────────────────────────────────────────────────────

export interface PlatAmendment {
  instrument: string;
  type: string;
  date: string;
  description?: string;
}

// ── Surveyor Info ───────────────────────────────────────────────────────────

export interface SurveyorInfo {
  name: string | null;
  rpls: string | null;
  surveyDate: string | null;
  firmAddress: string | null;
}

// ── Parent Tract ────────────────────────────────────────────────────────────

export interface ParentTract {
  description: string | null;
  abstractSurvey: string | null;
  deedInstrument: string | null;
}

// ── Datum Info ───────────────────────────────────────────────────────────────

export interface DatumInfo {
  system: string;
  zone: string | null;
  units: string;
  scaleFactor: number | null;
  epoch: string | null;
}

// ── Point of Beginning ──────────────────────────────────────────────────────

export interface PointOfBeginning {
  northing: number | null;
  easting: number | null;
  monumentDescription: string | null;
}

// ── Subdivision-Wide Analysis ───────────────────────────────────────────────

export interface SubdivisionCompleteness {
  allLotsIdentified: boolean;
  allLotsHaveBounds: boolean;
  allReservesIdentified: boolean;
  perimeterComplete: boolean;
  allInteriorLinesResolved: boolean;
  missingData: string[];
}

export interface InternalConsistency {
  lotAreaSum: number;
  statedTotalArea: number;
  areaDifference: number;
  areaDifferencePct: number;
  status: 'excellent' | 'acceptable' | 'marginal' | 'discrepancy';
  notes: string;
}

export interface SubdivisionWideAnalysis {
  completeness: SubdivisionCompleteness;
  internalConsistency: InternalConsistency;
  developmentStatus: Record<string, string>;
}

// ── Lot Relationships ───────────────────────────────────────────────────────

export interface LotRelationships {
  adjacencyMatrix: Record<string, Record<string, string>>;
  sharedBoundaryIndex: {
    lotA: string;
    lotB: string;
    calls: string[];
    length: number;
    verified: boolean;
  }[];
}

// ── Final SubdivisionModel (the Phase 4 deliverable) ────────────────────────

export interface SubdivisionModel {
  status: 'complete' | 'partial' | 'failed';

  subdivision: {
    name: string;
    platInstrument: string | null;
    platDate: string | null;
    platType: SubdivisionClassification;
    platAmendments: PlatAmendment[];
    replats: PlatAmendment[];
    surveyor: SurveyorInfo;
    parentTract: ParentTract;
    datum: DatumInfo;
    pointOfBeginning: PointOfBeginning;
    totalArea: {
      acreage: number | null;
      sqft: number | null;
      computed: boolean;
    };
    perimeterLength: number | null;
    perimeter: {
      calls: BoundaryCall[];
      closure: ClosureData | null;
    };
  };

  lots: SubdivisionLot[];
  reserves: SubdivisionReserve[];
  commonElements: CommonElements;
  restrictiveCovenants: RestrictiveCovenants;
  lotRelationships: LotRelationships;
  subdivisionAnalysis: SubdivisionWideAnalysis;

  timing: { totalMs: number };
  aiCalls: number;
  errors: string[];
}
