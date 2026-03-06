// worker/src/models/property-intelligence.ts
// Phase 3 output model — the unified property data object consumed by all
// downstream phases (4, 5, 6, 7, 8, 9, 10).
//
// Every field is either extracted from documents or computed from extracted
// data. No field is ever fabricated — if AI cannot extract it, it is
// undefined or null rather than a placeholder value.
//
// Naming conventions:
//   callId: "{lotId}_C{N}" for straight lines, "{lotId}_CV{N}" for curves.
//           Perimeter calls use "PERIM_C{N}".
//   lotId:  "lot_1", "lot_2", "reserve_a", "common_b" — lower_snake_case.
//
// Version: 3.0
// Spec: STARR_RECON/PHASE_03_EXTRACTION.md §4

// ── Extraction Source Types ────────────────────────────────────────────────

/**
 * Where a particular reading came from.
 * Downstream phases use this to apply source weighting:
 *   Phase 7: deed_text > plat_text > adjacent_deed > plat_geometry > computed
 */
export type ExtractionSource =
  | 'plat_text'       // OCR from plat (primary segment extraction)
  | 'plat_text_zoom'  // OCR from zoomed plat sub-segment (escalated)
  | 'plat_geometry'   // Visual protractor/ruler measurement (geo-reconcile.ts Phase 1)
  | 'plat_line_table' // From line/curve table on plat
  | 'deed_text'       // From deed document (ai-extraction.ts)
  | 'adjacent_deed'   // From neighbouring property's deed (Phase 5)
  | 'txdot_row'       // From TxDOT ROW data (Phase 6)
  | 'cad_gis'         // From CAD GIS parcel geometry
  | 'computed';       // Mathematically derived (curve-params.ts)

/** One raw reading of a bearing or distance from one source */
export interface Reading {
  value: string;
  source: ExtractionSource;
  /** 0–100 */
  confidence: number;
  /** true = from visual protractor/ruler measurement, false = from OCR text */
  isGeometric: boolean;
}

// ── Boundary Call ─────────────────────────────────────────────────────────

/**
 * A single metes-and-bounds call — one line segment or curve of a boundary.
 * This is the atomic unit of all boundary data in Phase 3 and downstream.
 *
 * The five-symbol confidence notation is the same one used throughout the
 * spec: ✓ CONFIRMED | ~ DEDUCED | ? UNCONFIRMED | ✗ DISCREPANCY | ✗✗ CRITICAL
 */
export interface P3BoundaryCall {
  callId: string;          // "L1_C1", "PERIM_C5", "L3_CV2"
  sequenceNumber: number;  // 1-based order in the traverse

  // Best-determination values (the reconciled "winner" across all sources)
  bearing: string;               // "N 85°22'02\" E" — DMS quadrant format always
  bearingDecimal?: number;       // 85.367222 — decimal degrees within quadrant (0–90)
  distance: number;              // 461.81 in feet (varas converted before storage)
  unit: 'feet' | 'varas';        // Original document unit; 'varas' only when not converted

  type: 'straight' | 'curve';
  along?: string;                // "FM 436 ROW" | "Lot 2" | "Nordyke property line"
  fromMonument?: string;         // Monument description at start of call
  toMonument?: string;           // Monument description at end of call

  // Curve data (only present when type === 'curve')
  curve?: {
    radius: number;              // Feet
    arcLength?: number;          // Feet (arc L)
    chordBearing?: string;       // "N 45°28'15\" E"
    chordDistance?: number;      // Feet
    delta?: string;              // Central angle: "3°40'22\""
    direction: 'left' | 'right';
    tangentLength?: number;      // Feet
    // Populated when curve-params.ts computed a missing parameter
    computed?: {
      missingParam: string;      // e.g. "delta_deg"
      computedValue: number;
      formula: string;           // e.g. "L = R × Δ_rad"
    };
  };

  // Multi-source confidence tracking
  confidence: number;            // 0–100 overall confidence for this call
  confidenceSymbol: '✓' | '~' | '?' | '✗' | '✗✗';
  sources: ExtractionSource[];   // Which sources contributed
  allReadings: Reading[];        // Every raw reading from every source
  bestReading: string;           // Human-readable description of the reconciled value
  notes?: string;                // E.g. "Watermark partially obscures bearing seconds"
}

// ── Lot Data ──────────────────────────────────────────────────────────────

export interface LotData {
  lotId: string;    // "lot_1", "lot_2", "reserve_a"
  name: string;     // "Lot 1", "Reserve A", "Common Area B"
  lotType: 'residential' | 'commercial' | 'reserve' | 'common_area' | 'open_space' | 'drainage' | 'unknown';
  acreage?: number;
  sqft?: number;
  boundaryCalls: P3BoundaryCall[];   // Straight-line calls
  curves: P3BoundaryCall[];          // Curve calls (type === 'curve')

  // Traverse closure (computed from bearing + distance math)
  closure?: {
    errorNorthing: number;
    errorEasting: number;
    errorDistance: number;
    closureRatio: string;  // "1:21670"
    status: 'excellent' | 'acceptable' | 'marginal' | 'failed' | 'unknown';
  };

  buildingSetbacks?: {
    front?: number;
    side?: number;
    rear?: number;
    notes?: string;
  };

  easements: string[];   // Textual descriptions of easements affecting this lot
  notes: string[];
  confidence: number;    // 0–100 average over all calls
}

// ── Adjacent Property ─────────────────────────────────────────────────────

export interface AdjacentProperty {
  owner: string;
  calledAcreages: number[];
  sharedBoundary: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest' | 'multiple';
  instrumentNumbers: string[];
  volumePages: { volume: string; page: string }[];
  hasBeenResearched: boolean;  // Phase 5 sets this to true when deed is retrieved
  deedAvailable: boolean;
  platAvailable: boolean;
  sharedCalls: SharedBoundaryCall[];
}

/** Cross-reference of a boundary call shared between our property and a neighbour */
export interface SharedBoundaryCall {
  callId: string;              // References P3BoundaryCall.callId on our side
  ourBearing?: string;
  ourDistance?: number;
  theirBearing?: string;       // Reversed bearing from their deed (populated in Phase 5)
  theirDistance?: number;
  bearingDifference?: string;  // Angular difference e.g. "0°02'15\""
  distanceDifference?: number; // Feet
  matchStatus: 'confirmed' | 'close_match' | 'marginal' | 'discrepancy' | 'unverified';
  notes?: string;
}

// ── Road Info ─────────────────────────────────────────────────────────────

export interface RoadInfo {
  name: string;   // "FM 436", "US 190", "CR 123"
  type: 'farm_to_market' | 'ranch_to_market' | 'state_highway' | 'us_highway' | 'interstate' | 'county_road' | 'city_street' | 'private_road' | 'spur' | 'loop' | 'business' | 'unknown';
  txdotDesignation?: string;      // As TxDOT labels it (e.g. "FM 436")
  maintainedBy: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
  estimatedROWWidth?: number;     // Feet — from plat/deed (may be wrong for curved ROW)
  confirmedROWWidth?: number;     // Feet — only set after Phase 6 TxDOT research
  boundaryType: 'straight' | 'curved' | 'mixed' | 'unknown';
  centerlineBearing?: string;
  notes: string[];
}

// ── Easement Info ─────────────────────────────────────────────────────────

export interface EasementInfo {
  type: 'utility' | 'drainage' | 'access' | 'conservation' | 'pipeline' | 'powerline' | 'sidewalk' | 'landscape' | 'other';
  width?: number;      // Feet
  location: string;    // "along west boundary of Lots 1–5"
  instrument?: string;
  grantee?: string;    // Who holds the easement
  source: ExtractionSource;
  confidence: number;  // 0–100
  notes?: string;
}

// ── Discrepancy ───────────────────────────────────────────────────────────

export interface Discrepancy {
  id: string;           // "DISC-001"
  severity: 'critical' | 'moderate' | 'minor' | 'informational';
  category: 'bearing_conflict' | 'distance_conflict' | 'area_conflict' | 'datum_shift' | 'missing_data' | 'road_geometry' | 'monument_conflict' | 'other';
  description: string;
  affectedCalls: string[];   // P3BoundaryCall.callId values
  affectedLots: string[];    // LotData.lotId values
  readings: { source: string; value: string }[];
  likelyCorrect?: string;    // AI's best determination
  basis?: string;            // Reasoning for the best determination
  resolution: string;        // What action should be taken
  estimatedCostToResolve?: number;  // USD to purchase clarifying document
}

// ── Deed Chain Entry ──────────────────────────────────────────────────────

export interface DeedChainEntry {
  instrument: string;
  type: string;                   // "warranty_deed" | "quitclaim_deed" | "plat" | etc.
  date: string;                   // ISO date or empty string if unknown
  grantor: string;
  grantee: string;
  calledAcreage?: number;
  parentTract?: string;           // Description of the parent tract
  parentInstrument?: string;      // Instrument number of the parent deed
  surveyReference?: string;       // "WILLIAM HARTRICK SURVEY, A-488"
  metesAndBounds: P3BoundaryCall[];
  notes: string[];
}

// ── Main PropertyIntelligence Object ─────────────────────────────────────

/**
 * Primary output of Phase 3. Consumed by all downstream phases.
 * Saved to /tmp/analysis/{projectId}/property_intelligence.json.
 *
 * IMPORTANT: No field in this object is ever fabricated.
 * If a value cannot be extracted from documents, it is undefined / null.
 */
export interface PropertyIntelligence {
  // ── Metadata ──────────────────────────────────────────────────────────
  projectId: string;
  generatedAt: string;   // ISO timestamp
  version: '3.0';

  // ── Core property info (from plat title block + CAD data) ─────────────
  property: {
    name: string;
    propertyType: 'subdivision' | 'standalone_tract' | 'lot_in_subdivision' | 'unknown';
    totalAcreage: number;
    totalSqFt?: number;
    county: string;
    state: string;
    abstractSurvey?: string;    // "WILLIAM HARTRICK SURVEY, A-488"
    datum?: string;             // "NAD83" | "NAD27"
    coordinateZone?: string;    // "Texas Central"
    unitSystem?: string;        // "US Survey Feet"
    scaleFactor?: number;       // Combined scale factor from plat
    pointOfBeginning?: {
      northing?: number;
      easting?: number;
      latitude?: number;
      longitude?: number;
      description?: string;
    };
  };

  // ── Subdivision info (populated when propertyType === 'subdivision') ──
  subdivision?: {
    name: string;
    platInstrument?: string;
    platDate?: string;          // ISO date
    surveyor?: string;
    rpls?: string;              // RPLS number
    surveyDate?: string;        // ISO date
    totalLots: number;
    lotNames: string[];
    hasReserves: boolean;
    hasCommonAreas: boolean;
    restrictiveCovenants?: string;  // Instrument number
    notes: string[];
  };

  // ── Per-lot boundary data ─────────────────────────────────────────────
  // One entry per lot in the subdivision, or one entry for a standalone tract.
  lots: LotData[];

  // ── Overall perimeter (outer boundary of the entire tract/subdivision) ─
  perimeterBoundary: {
    calls: P3BoundaryCall[];
    totalPerimeter?: number;     // Feet
    closureError?: { distance: number; ratio: string };
    closureStatus: 'excellent' | 'acceptable' | 'marginal' | 'failed' | 'unknown';
  };

  // ── Adjacent property context ─────────────────────────────────────────
  adjacentProperties: AdjacentProperty[];

  // ── Roads bordering or passing through ───────────────────────────────
  roads: RoadInfo[];

  // ── All easements found ───────────────────────────────────────────────
  easements: EasementInfo[];

  // ── Deed history ──────────────────────────────────────────────────────
  deedChain: DeedChainEntry[];

  // ── Conflicts and data quality issues ────────────────────────────────
  discrepancies: Discrepancy[];

  // ── Overall quality assessment ────────────────────────────────────────
  confidenceSummary: {
    overall: number;                // 0–100 weighted score
    rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LOW' | 'INSUFFICIENT';
    confirmedCalls: number;         // ✓ count
    deducedCalls: number;           // ~ count
    unconfirmedCalls: number;       // ? count
    discrepancyCalls: number;       // ✗ count
    criticalCalls: number;          // ✗✗ count
    totalCalls: number;
    biggestGap: string;             // Plaintext description of the main quality gap
    recommendedAction: string;      // Next step for the surveyor
    documentRecommendations: {
      document: string;
      source: string;
      estimatedPrice: number;       // USD
      confidenceImpact: string;     // e.g. "64% → 90%+"
      priority: 'high' | 'medium' | 'low';
    }[];
  };

  // ── AI API call tracking ──────────────────────────────────────────────
  aiCallLog: {
    totalAPICalls: number;
    totalTokens: number;
    totalCost: number;              // USD (estimated from token counts)
    durationMs: number;
    callBreakdown: {
      type: string;
      calls: number;
      description: string;
    }[];
  };
}

// ── Utility: compute confidence summary from calls ────────────────────────

/**
 * Compute the weighted confidence summary from all lots and perimeter calls.
 * Used by AIContextAnalyzer after collecting the call symbols.
 *
 * Weighting: ✓=100  ~=75  ?=50  ✗=25  ✗✗=0
 * Rating:    EXCELLENT(≥90) GOOD(≥75) FAIR(≥55) LOW(≥35) INSUFFICIENT(<35)
 */
export function computeConfidenceSummary(
  lots: LotData[],
  perimeterCalls: P3BoundaryCall[],
): Omit<PropertyIntelligence['confidenceSummary'], 'biggestGap' | 'recommendedAction' | 'documentRecommendations'> {
  const allCalls: P3BoundaryCall[] = [
    ...perimeterCalls,
    ...lots.flatMap(l => [...l.boundaryCalls, ...l.curves]),
  ];

  let confirmed   = 0;
  let deduced     = 0;
  let unconfirmed = 0;
  let discrepancy = 0;
  let critical    = 0;

  for (const c of allCalls) {
    switch (c.confidenceSymbol) {
      case '✓':  confirmed++;   break;
      case '~':  deduced++;     break;
      case '?':  unconfirmed++; break;
      case '✗':  discrepancy++; break;
      case '✗✗': critical++;    break;
    }
  }

  const total = allCalls.length;
  const weightedSum =
    confirmed   * 100 +
    deduced     * 75  +
    unconfirmed * 50  +
    discrepancy * 25  +
    critical    * 0;

  const overall = total > 0 ? Math.round(weightedSum / total) : 0;

  const rating: PropertyIntelligence['confidenceSummary']['rating'] =
    overall >= 90 ? 'EXCELLENT' :
    overall >= 75 ? 'GOOD' :
    overall >= 55 ? 'FAIR' :
    overall >= 35 ? 'LOW' :
                    'INSUFFICIENT';

  return {
    overall,
    rating,
    confirmedCalls:    confirmed,
    deducedCalls:      deduced,
    unconfirmedCalls:  unconfirmed,
    discrepancyCalls:  discrepancy,
    criticalCalls:     critical,
    totalCalls:        total,
  };
}

/**
 * Map a numeric confidence value (0–100) and optional ReconciliationResult
 * status to the five-symbol confidence notation.
 */
export function toConfidenceSymbol(
  confidence: number,
  status?: 'confirmed' | 'conflict' | 'text_only' | 'unresolved',
  bearingAgreement?: boolean | null,
): P3BoundaryCall['confidenceSymbol'] {
  if (status === 'confirmed') {
    return confidence >= 85 ? '✓' : '~';
  }
  if (status === 'conflict') {
    return confidence < 25 ? '✗✗' : '✗';
  }
  if (status === 'text_only' || status === 'unresolved') {
    return confidence >= 70 ? '~' : '?';
  }

  // Fallback: map purely by numeric confidence
  if (bearingAgreement === false) return confidence < 25 ? '✗✗' : '✗';
  if (confidence >= 85) return '✓';
  if (confidence >= 70) return '~';
  if (confidence >= 50) return '?';
  if (confidence >= 25) return '✗';
  return '✗✗';
}
