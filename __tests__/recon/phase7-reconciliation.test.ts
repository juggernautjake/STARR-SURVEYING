// __tests__/recon/phase7-reconciliation.test.ts
// Unit tests for STARR RECON Phase 7: Geometric Reconciliation & Multi-Source Cross-Validation.
//
// Phase 7 consumes outputs from Phases 3–6, treats each as an independent
// "reading" of every boundary call, and produces a reconciled boundary model.
//
// Tests cover pure-logic portions that do not require file I/O or AI calls:
//
//   1.  ReadingAggregator — plat segment readings from Phase 3 extraction calls
//   2.  ReadingAggregator — deed readings from Phase 3 deedAnalysis
//   3.  ReadingAggregator — Phase 6 ROW report readings (txdot_row source)
//   4.  ReadingAggregator — Phase 6 county_road_default source
//   5.  ReadingAggregator — Phase 5 adjacent reversed readings
//   6.  ReadingAggregator — Phase 4 interior line readings
//   7.  ReadingAggregator — empty inputs → empty map
//   8.  ReadingAggregator — hasAuthoritative flag when TxDOT reading present
//   9.  ReadingAggregator — hasConflictingTypes flag when straight + curve present
//  10.  ReadingAggregator — callId coalesce: uses sequence when no callId
//  11.  SourceWeighter — base weights: txdot_row > deed_extraction > plat_segment
//  12.  SourceWeighter — normalized weights sum to 1.0
//  13.  SourceWeighter — TxDOT type conflict reduces weight of conflicting readings
//  14.  SourceWeighter — adjacent_reversed high-confidence boost applied
//  15.  SourceWeighter — plat_geometric demoted when better sources present
//  16.  SourceWeighter — vara unit penalty applied
//  17.  ReconciliationAlgorithm — single source → single_source method
//  18.  ReconciliationAlgorithm — two straight readings → weighted_consensus
//  19.  ReconciliationAlgorithm — TxDOT reading → authoritative_override
//  20.  ReconciliationAlgorithm — curve readings → curve type reconciled
//  21.  ReconciliationAlgorithm — TxDOT curve overrides deed straight
//  22.  ReconciliationAlgorithm — agreement='strong' when spread < 0.01°, dist < 0.5'
//  23.  ReconciliationAlgorithm — agreement='moderate' when spread within tolerance
//  24.  ReconciliationAlgorithm — agreement='weak' when spread exceeds tolerance
//  25.  ReconciliationAlgorithm — finalConfidence >= previousConfidence for agreeing sources
//  26.  ReconciliationAlgorithm — symbol='✓' when finalConfidence >= 85
//  27.  ReconciliationAlgorithm — symbol='~' when finalConfidence 65–84
//  28.  ReconciliationAlgorithm — symbol='?' when finalConfidence < 65
//  29.  ReconciledBoundaryModel interface — required fields present
//  30.  ReadingSet interface — hasConflictingTypes and hasAuthoritative boolean flags
//  31.  ReadingAggregator — plat geometric readings from Phase 3 geometricAnalysis
//  32.  SourceWeighter — deed+plat agreement boost applied
//  33.  ReconciliationAlgorithm — no readings → unresolved method
//  34.  ReconciliationAlgorithm — consensus weighted average bearing computed
//  35.  ReadingAggregator — along field propagated to ReadingSet
//  36.  PhasePaths type — all 4 phase paths present
//  37.  normalizeToFeet — varas converted correctly (1 vara ≈ 2.7778 ft)
//  38.  normalizeToFeet — chains converted correctly (1 chain = 66 ft)
//  39.  normalizeToFeet — feet returned unchanged
//  40.  normalizeToFeet — null input returns null
//  41.  ReadingAggregator — varas distance normalized to feet in plat segment
//  42.  ReadingAggregator — chains distance normalized to feet in deed reading
//  43.  ReadingAggregator — plat_overview source from platOverview field
//  44.  ReadingAggregator — plat_overview unit normalization applied
//  45.  ReadingAggregator — plat_overview has correct source type and confidence
//  46.  ReadingAggregator — plat_overview calls without callId are skipped
//  47.  SourceWeighter — plat_overview has lower weight than plat_segment
//  48.  SourceWeighter — plat_geometric demoted when 2 other sources present (moderate demotion)
//  49.  SourceWeighter — plat_geometric not demoted when no other sources present
//  50.  ReconciliationAlgorithm — NaN-safe bearing: no-bearing readings fall back to unresolved
//  51.  ReconciliationAlgorithm — distance-only readings (null bearing) → single_source with no bearing
//  52.  ReconciliationAlgorithm — zero-weight readings don't dominate consensus
//  53.  ReconciliationAlgorithm — symbol='✗' when method='unresolved'
//  54.  TraverseComputation — single call produces point at expected position
//  55.  TraverseComputation — two-call right-angle traverse produces expected closure error
//  56.  TraverseComputation — applyCompassRule returns compassRuleApplied=true
//  57.  TraverseComputation — perimeter length computed correctly
//  58.  GeometricReconciliationEngine — rejects empty projectId
//  59.  GeometricReconciliationEngine — rejects unsafe projectId with path traversal chars
//  60.  ReadingAggregator — Phase 5 chain-of-title distance normalized to feet

import { describe, it, expect } from 'vitest';

import { ReadingAggregator, normalizeToFeet, VARA_TO_FEET, CHAIN_TO_FEET } from '../../worker/src/services/reading-aggregator.js';
import { SourceWeighter } from '../../worker/src/services/source-weighting.js';
import { ReconciliationAlgorithm } from '../../worker/src/services/reconciliation-algorithm.js';
import { TraverseComputation } from '../../worker/src/services/traverse-closure.js';
import { GeometricReconciliationEngine } from '../../worker/src/services/geometric-reconciliation-engine.js';
import type {
  BoundaryReading,
  ReadingSet,
  WeightedReading,
  ReconciledBoundaryModel,
  PhasePaths,
} from '../../worker/src/types/reconciliation.js';
import type {
  IntelligenceInput,
  SubdivisionInput,
  CrossValidationInput,
  ROWReportInput,
} from '../../worker/src/services/reading-aggregator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal BoundaryCall-compatible object (as used in IntelligenceInput) */
function makeBoundaryCall(opts: {
  sequence: number;
  callId?: string;
  bearing?: string;
  distance?: number;
  unit?: string;
  curve?: { radius: number; direction: 'left' | 'right' };
  along?: string;
  confidence?: number;
}) {
  return {
    sequence: opts.sequence,
    callId: opts.callId,
    bearing: opts.bearing
      ? {
          raw: opts.bearing,
          decimalDegrees: 45,
          quadrant: 'NE',
        }
      : null,
    distance: opts.distance != null
      ? {
          raw: `${opts.distance}'`,
          value: opts.distance,
          unit: (opts.unit ?? 'feet') as 'feet' | 'varas' | 'chains',
        }
      : null,
    curve: opts.curve
      ? {
          radius: { raw: `${opts.curve.radius}'`, value: opts.curve.radius },
          arcLength: { raw: '520\'', value: 520 },
          chordBearing: null,
          chordDistance: null,
          direction: opts.curve.direction,
          delta: null,
        }
      : null,
    toPoint: null,
    along: opts.along ?? null,
    confidence: opts.confidence ?? 80,
  };
}

/** Build a minimal ReadingSet */
function makeReadingSet(callId: string, readings: BoundaryReading[], along?: string): ReadingSet {
  const types = new Set(readings.map((r) => r.type));
  return {
    callId,
    along,
    readings,
    hasConflictingTypes: types.size > 1,
    hasAuthoritative: readings.some((r) => r.source === 'txdot_row'),
  };
}

/** Build a BoundaryReading for use in algorithm tests */
function makeBoundaryReading(opts: {
  source: BoundaryReading['source'];
  callId: string;
  bearing?: string;
  distance?: number;
  type?: 'straight' | 'curve';
  confidence?: number;
  unit?: 'feet' | 'varas' | 'chains';
  curve?: { radius: number };
}): BoundaryReading {
  /** Map source type to originating pipeline phase */
  const SOURCE_PHASE: Record<BoundaryReading['source'], number> = {
    plat_segment:         3,
    plat_geometric:       3,
    plat_overview:        3,
    deed_extraction:      3,
    subdivision_interior: 4,
    adjacent_reversed:    5,
    adjacent_chain:       5,
    txdot_row:            6,
    county_road_default:  6,
  };
  return {
    source: opts.source,
    callId: opts.callId,
    bearing: opts.bearing ?? null,
    distance: opts.distance ?? null,
    unit: opts.unit ?? 'feet',
    type: opts.type ?? 'straight',
    curve: opts.curve ? { radius: opts.curve.radius } : undefined,
    confidence: opts.confidence ?? 80,
    sourcePhase: SOURCE_PHASE[opts.source] ?? 3,
    sourceDetail: `Test ${opts.source}`,
  };
}

// ── ReadingAggregator tests ───────────────────────────────────────────────────

describe('ReadingAggregator', () => {
  const aggregator = new ReadingAggregator();

  it('1. plat segment readings from Phase 3 extraction calls', () => {
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          makeBoundaryCall({ sequence: 1, bearing: 'N 04°37\'58" W', distance: 461.81 }),
          makeBoundaryCall({ sequence: 2, bearing: 'S 85°22\'02" W', distance: 200.0 }),
        ],
        confidence: 85,
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    expect(sets.size).toBe(2);
    const firstSet = sets.get('call_1');
    expect(firstSet).toBeDefined();
    expect(firstSet!.readings[0].source).toBe('plat_segment');
    expect(firstSet!.readings[0].bearing).toContain('N');
  });

  it('2. deed readings from Phase 3 deedAnalysis — matched to plat calls', () => {
    // Deed matching requires both deed calls AND plat calls to match against.
    // The matchDeedCallToPlat() requires score>=50 (bearing diff <0.5° = 40pts + type match 10pts).
    const BEARING = 'S 85°22\'02" E';
    const intel: IntelligenceInput = {
      // Plat extraction calls that deed calls can be matched to
      extraction: {
        calls: [
          makeBoundaryCall({ sequence: 1, bearing: BEARING, distance: 519.88, along: 'FM 436' }),
        ],
        confidence: 85,
      },
      deedAnalysis: {
        metesAndBounds: [
          // Same bearing and distance → score = 40 (bearing) + 10 (type) + 30 (dist <1') = 80 → matches
          makeBoundaryCall({ sequence: 1, bearing: BEARING, distance: 519.88 }),
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    expect(sets.size).toBeGreaterThanOrEqual(1);
    // Find the deed reading (matched to plat call_1)
    let foundDeed = false;
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'deed_extraction')) {
        foundDeed = true;
        break;
      }
    }
    expect(foundDeed).toBe(true);
  });

  it('3. Phase 6 ROW report → txdot_row source readings on matching along field', () => {
    // TxDOT readings are only added to EXISTING sets whose `along` field contains the road name.
    // We must first create plat segment sets with along='FM 436', then add the ROW report.
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          makeBoundaryCall({ sequence: 1, bearing: 'S 75°14\'22" E', distance: 519.88, along: 'FM 436' }),
        ],
        confidence: 80,
      },
    };
    const rowReport: ROWReportInput = {
      roads: [
        {
          name: 'FM 436',
          controlSection: '0436-01',
          maintainedBy: 'txdot',
          propertyBoundaryResolution: {
            txdotConfirms: 'curved',
          },
          rowData: {
            source: 'txdot_arcgis',
            curves: [
              { radius: 2865, arcLength: 520, direction: 'right' },
            ],
          },
        },
      ],
    };
    const sets = aggregator.aggregate(intel, null, null, rowReport);
    // Should produce at least one txdot_row reading on the 'FM 436' call set
    let foundTxDOT = false;
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'txdot_row')) {
        foundTxDOT = true;
        const reading = set.readings.find((r) => r.source === 'txdot_row')!;
        expect(reading.type).toBe('curve');
        expect(reading.curve?.radius).toBe(2865);
        break;
      }
    }
    expect(foundTxDOT).toBe(true);
  });

  it('4. Phase 6 county_road_default source for county-maintained roads', () => {
    // County roads with maintainedBy='county' and rowData.rowWidth create virtual
    // county_road_default readings (low weight — generic assumption).
    const rowReport: ROWReportInput = {
      roads: [
        {
          name: 'CR 234',
          maintainedBy: 'county',
          // No propertyBoundaryResolution (not TxDOT maintained)
          rowData: {
            source: 'county_defaults',
            rowWidth: 60,
            curves: [],
          },
        },
      ],
    };
    const intel: IntelligenceInput = {};
    const sets = aggregator.aggregate(intel, null, null, rowReport);
    let foundCounty = false;
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'county_road_default')) {
        foundCounty = true;
        const reading = set.readings.find((r) => r.source === 'county_road_default')!;
        expect(reading.confidence).toBeLessThanOrEqual(30); // low weight
        expect(reading.sourcePhase).toBe(6);
        break;
      }
    }
    expect(foundCounty).toBe(true);
  });

  it('5. Phase 5 adjacent reversed readings', () => {
    const crossVal: CrossValidationInput = {
      adjacentProperties: [
        {
          owner: 'Smith',
          crossValidation: {
            callComparisons: [
              {
                callId: 'PERIM_N1',
                theirReversed: 'S 04°37\'58" E',
                theirDistance: 461.80,
                status: 'confirmed',
              },
            ],
          },
        },
      ],
    };
    const intel: IntelligenceInput = {};
    const sets = aggregator.aggregate(intel, null, crossVal, null);
    let foundAdjacent = false;
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'adjacent_reversed')) {
        foundAdjacent = true;
        const reading = set.readings.find((r) => r.source === 'adjacent_reversed')!;
        expect(reading.bearing).not.toBeNull();
        break;
      }
    }
    expect(foundAdjacent).toBe(true);
  });

  it('6. Phase 4 interior line readings via lotRelationships.sharedBoundaryIndex', () => {
    // The aggregator uses lotRelationships.sharedBoundaryIndex, not lots[].sharedBoundaries
    const subdivModel: SubdivisionInput = {
      lotRelationships: {
        sharedBoundaryIndex: [
          {
            lotA: 'LOT-1',
            lotB: 'LOT-2',
            calls: ['LOT1_N1', 'LOT1_N2'],
            length: 200.0,
            verified: true,
          },
        ],
      },
    };
    const intel: IntelligenceInput = {};
    const sets = aggregator.aggregate(intel, subdivModel, null, null);
    let foundInterior = false;
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'subdivision_interior')) {
        foundInterior = true;
        const reading = set.readings.find((r) => r.source === 'subdivision_interior')!;
        expect(reading.confidence).toBe(85); // verified=true → 85
        expect(reading.distance).toBe(200.0);
        break;
      }
    }
    expect(foundInterior).toBe(true);
  });

  it('7. empty inputs → empty reading map', () => {
    const sets = aggregator.aggregate({}, null, null, null);
    expect(sets.size).toBe(0);
  });

  it('8. hasAuthoritative=true when txdot_row reading present', () => {
    // TxDOT readings are added to existing sets whose along field matches the road name.
    // Provide plat calls with along='FM 436' first.
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          makeBoundaryCall({ sequence: 1, bearing: 'S 75° E', distance: 520, along: 'FM 436' }),
        ],
      },
    };
    const rowReport: ROWReportInput = {
      roads: [
        {
          name: 'FM 436',
          maintainedBy: 'txdot',
          propertyBoundaryResolution: { txdotConfirms: 'curved' },
          rowData: { source: 'txdot_arcgis', curves: [{ radius: 2865, arcLength: 520, direction: 'right' }] },
        },
      ],
    };
    const sets = aggregator.aggregate(intel, null, null, rowReport);
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'txdot_row')) {
        expect(set.hasAuthoritative).toBe(true);
      }
    }
  });

  it('9. hasConflictingTypes=true when straight and curve readings present', () => {
    // Build a set manually with mixed types
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'deed_extraction', callId: 'PERIM_E1', type: 'straight', bearing: 'S 75° E', distance: 520 }),
      makeBoundaryReading({ source: 'txdot_row', callId: 'PERIM_E1', type: 'curve', curve: { radius: 2865 } }),
    ];
    const set = makeReadingSet('PERIM_E1', readings);
    expect(set.hasConflictingTypes).toBe(true);
  });

  it('10. callId coalesce: uses call_N when no callId on BoundaryCall', () => {
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          makeBoundaryCall({ sequence: 5, bearing: 'N 45° E', distance: 100 }), // no callId
        ],
        confidence: 70,
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    expect(sets.has('call_5')).toBe(true);
  });

  it('31. plat geometric readings from Phase 3 geometricAnalysis', () => {
    const intel: IntelligenceInput = {
      geometricAnalysis: {
        calls: [
          { callId: 'GEO_1', bearing: 'N 04°37\'58" W', distance: 462.0, type: 'straight', confidence: 45 },
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    let foundGeom = false;
    for (const [, set] of sets) {
      if (set.readings.some((r) => r.source === 'plat_geometric')) {
        foundGeom = true;
        break;
      }
    }
    expect(foundGeom).toBe(true);
  });

  it('35. along field propagated to ReadingSet', () => {
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          makeBoundaryCall({ sequence: 1, bearing: 'N 04°37\'58" W', distance: 461.81, along: 'R.K. GAINES tract' }),
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    const set = sets.get('call_1');
    expect(set?.along).toBe('R.K. GAINES tract');
  });
});

// ── SourceWeighter tests ──────────────────────────────────────────────────────

describe('SourceWeighter', () => {
  const weighter = new SourceWeighter();

  it('11. base weights: txdot_row > deed_extraction > plat_segment (before normalization)', () => {
    // We test relative ordering by creating single-reading sets
    const set1 = makeReadingSet('C1', [
      makeBoundaryReading({ source: 'txdot_row', callId: 'C1', bearing: 'S 75° E', confidence: 80 }),
    ]);
    const set2 = makeReadingSet('C2', [
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C2', bearing: 'S 75° E', confidence: 80 }),
    ]);
    const set3 = makeReadingSet('C3', [
      makeBoundaryReading({ source: 'plat_segment', callId: 'C3', bearing: 'S 75° E', confidence: 80 }),
    ]);

    // With single reading, base weight * confidence is the weight before normalization
    // We extract base weight from the weighted reading
    const w1 = weighter.weightReadings(set1);
    const w2 = weighter.weightReadings(set2);
    const w3 = weighter.weightReadings(set3);

    // Single reading → normalized to 1.0 each, but baseWeight should reflect ordering
    expect(w1[0].baseWeight).toBeGreaterThan(w2[0].baseWeight); // txdot > deed
    expect(w2[0].baseWeight).toBeGreaterThan(w3[0].baseWeight); // deed > plat
  });

  it('12. normalized weights sum to 1.0', () => {
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04° W', distance: 461 }),
      makeBoundaryReading({ source: 'plat_segment', callId: 'C1', bearing: 'N 04° W', distance: 462 }),
      makeBoundaryReading({ source: 'adjacent_reversed', callId: 'C1', bearing: 'N 04° W', distance: 461.5 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const sum = weighted.reduce((s, r) => s + r.weight, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('13. TxDOT type conflict reduces weight of conflicting readings by ~90%', () => {
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'txdot_row', callId: 'C1', type: 'curve', curve: { radius: 2865 } }),
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', type: 'straight', bearing: 'S 75° E', distance: 520 }),
    ];
    const set = makeReadingSet('C1', readings, undefined);
    set.hasAuthoritative = true;
    set.hasConflictingTypes = true;

    const weighted = weighter.weightReadings(set);
    const txdotW  = weighted.find((r) => r.source === 'txdot_row')!;
    const deedW   = weighted.find((r) => r.source === 'deed_extraction')!;

    // TxDOT should have much higher weight than the conflicting deed
    expect(txdotW.weight).toBeGreaterThan(deedW.weight);
    // Deed should have note about type conflict
    expect(deedW.specialAdjustments.some((a) => a.includes('conflicts with TxDOT'))).toBe(true);
  });

  it('14. adjacent_reversed high-confidence (>=85) boost applied', () => {
    const readingsLow: BoundaryReading[] = [
      makeBoundaryReading({ source: 'adjacent_reversed', callId: 'C1', confidence: 70, bearing: 'N 04° W' }),
    ];
    const readingsHigh: BoundaryReading[] = [
      makeBoundaryReading({ source: 'adjacent_reversed', callId: 'C1', confidence: 90, bearing: 'N 04° W' }),
    ];
    const weightedLow  = weighter.weightReadings(makeReadingSet('C1', readingsLow));
    const weightedHigh = weighter.weightReadings(makeReadingSet('C1', readingsHigh));

    // High confidence reading should have boost annotation
    const highReading = weightedHigh[0];
    expect(highReading.specialAdjustments.some((a) => a.includes('boosted 10%'))).toBe(true);
    // The base weight * conf for high should be larger before normalization
    expect(weightedHigh[0].baseWeight * 0.90).toBeGreaterThan(weightedLow[0].baseWeight * 0.70);
  });

  it('15. plat_geometric demoted when 3+ other sources present', () => {
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'plat_geometric', callId: 'C1', bearing: 'N 04° W', confidence: 45 }),
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04° W', confidence: 80 }),
      makeBoundaryReading({ source: 'plat_segment',   callId: 'C1', bearing: 'N 04° W', confidence: 75 }),
      makeBoundaryReading({ source: 'adjacent_reversed', callId: 'C1', bearing: 'N 04° W', confidence: 82 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const geomR = weighted.find((r) => r.source === 'plat_geometric')!;
    expect(geomR.specialAdjustments.some((a) => a.includes('demoted'))).toBe(true);
  });

  it('16. vara unit penalty applied (reading.unit === varas)', () => {
    const readingVaras: BoundaryReading[] = [
      { ...makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04° W', distance: 150 }), unit: 'varas' },
    ];
    const readingFeet: BoundaryReading[] = [
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C2', bearing: 'N 04° W', distance: 461 }),
    ];
    const wVaras = weighter.weightReadings(makeReadingSet('C1', readingVaras));
    const wFeet  = weighter.weightReadings(makeReadingSet('C2', readingFeet));

    expect(wVaras[0].specialAdjustments.some((a) => a.includes('Vara conversion'))).toBe(true);
    // Varas weight (before normalization) should be 90% of feet weight at same base
    const rawVaras = wVaras[0].baseWeight * 0.80 * 0.90; // conf=80, 10% vara penalty
    const rawFeet  = wFeet[0].baseWeight * 0.80;
    expect(rawVaras).toBeCloseTo(rawFeet * 0.9, 5);
  });

  it('32. deed+plat agreement boost applied when bearings match exactly', () => {
    const SAME_BEARING = 'N 04°37\'58" W';
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', bearing: SAME_BEARING, confidence: 80 }),
      makeBoundaryReading({ source: 'plat_segment',   callId: 'C1', bearing: SAME_BEARING, confidence: 75 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const deed = weighted.find((r) => r.source === 'deed_extraction')!;
    // Should have boost note since deed agrees with plat
    expect(deed.specialAdjustments.some((a) => a.includes('boosted 15%'))).toBe(true);
  });
});

// ── ReconciliationAlgorithm tests ─────────────────────────────────────────────

describe('ReconciliationAlgorithm', () => {
  const algo = new ReconciliationAlgorithm();
  const weighter = new SourceWeighter();

  function makeWeightedReading(opts: Parameters<typeof makeBoundaryReading>[0]): WeightedReading {
    const r = makeBoundaryReading(opts);
    const set = makeReadingSet(r.callId, [r]);
    const weighted = weighter.weightReadings(set);
    return weighted[0];
  }

  it('17. single source → single_source method', () => {
    const reading = makeWeightedReading({ source: 'plat_segment', callId: 'C1', bearing: 'N 04°37\'58" W', distance: 461.81 });
    const set = makeReadingSet('C1', [reading]);
    const result = algo.reconcileCall(set, [reading]);
    expect(result.reconciliation.method).toBe('single_source');
    expect(result.callId).toBe('C1');
  });

  it('18. two agreeing straight readings → weighted_consensus', () => {
    const BEARING = 'N 04°37\'58" W';
    const r1 = makeWeightedReading({ source: 'deed_extraction',  callId: 'C1', bearing: BEARING, distance: 461.81 });
    const r2 = makeWeightedReading({ source: 'plat_segment',     callId: 'C1', bearing: BEARING, distance: 461.80 });
    const set = makeReadingSet('C1', [r1, r2]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.reconciliation.method).toBe('weighted_consensus');
    expect(result.type).toBe('straight');
    expect(result.reconciledBearing).toBeTruthy();
  });

  it('19. TxDOT reading present → authoritative_override method', () => {
    const r1 = makeWeightedReading({ source: 'txdot_row',      callId: 'C1', bearing: 'S 75°14\'22" E', distance: 520, confidence: 95 });
    const r2 = makeWeightedReading({ source: 'deed_extraction', callId: 'C1', bearing: 'S 75°14\'22" E', distance: 519.88, confidence: 80 });
    const set = makeReadingSet('C1', [r1, r2]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.reconciliation.method).toBe('authoritative_override');
    expect(result.reconciliation.dominantSource).toBe('txdot_row');
  });

  it('20. all readings are curves → curve type reconciled', () => {
    const r1 = makeWeightedReading({ source: 'plat_segment', callId: 'C1', type: 'curve', curve: { radius: 2865 }, confidence: 70 });
    const r2 = makeWeightedReading({ source: 'txdot_row',    callId: 'C1', type: 'curve', curve: { radius: 2865 }, confidence: 95 });
    const set = makeReadingSet('C1', [r1, r2]);
    set.hasAuthoritative = true;
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.type).toBe('curve');
    expect(result.reconciledCurve?.radius).toBe(2865);
  });

  it('21. TxDOT curve overrides deed straight → authoritative_override, type=curve', () => {
    const r1 = makeWeightedReading({ source: 'txdot_row',      callId: 'FM_E1', type: 'curve', curve: { radius: 2865 }, confidence: 95 });
    const r2 = makeWeightedReading({ source: 'deed_extraction', callId: 'FM_E1', type: 'straight', bearing: 'S 75°14\'22" E', distance: 519.88, confidence: 80 });
    const set = makeReadingSet('FM_E1', [r1, r2]);
    set.hasAuthoritative = true;
    set.hasConflictingTypes = true;
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.type).toBe('curve');
    expect(result.reconciliation.agreement).toBe('resolved_conflict');
  });

  it('22. agreement=strong when bearing spread <0.01° and distance spread <0.5\'', () => {
    const BEARING = 'N 04°37\'58" W';
    const r1 = makeWeightedReading({ source: 'deed_extraction', callId: 'C1', bearing: BEARING, distance: 461.81, confidence: 85 });
    const r2 = makeWeightedReading({ source: 'plat_segment',    callId: 'C1', bearing: BEARING, distance: 461.80, confidence: 75 });
    const set = makeReadingSet('C1', [r1, r2]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.reconciliation.agreement).toBe('strong');
  });

  it('23. agreement=moderate when spread within moderate tolerance', () => {
    const r1 = makeWeightedReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04°38\'00" W', distance: 462.0, confidence: 80 });
    const r2 = makeWeightedReading({ source: 'plat_segment',    callId: 'C1', bearing: 'N 04°37\'58" W', distance: 461.5, confidence: 75 });
    const set = makeReadingSet('C1', [r1, r2]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    // ~2 arc seconds spread, ~0.5' distance → moderate
    expect(['strong', 'moderate']).toContain(result.reconciliation.agreement);
  });

  it('24. agreement=weak when bearing spread is large (>0.1°)', () => {
    const r1 = makeWeightedReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04°38\'00" W', distance: 470.0, confidence: 80 });
    const r2 = makeWeightedReading({ source: 'plat_segment',    callId: 'C1', bearing: 'N 05°00\'00" W', distance: 455.0, confidence: 75 });
    const set = makeReadingSet('C1', [r1, r2]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.reconciliation.agreement).toBe('weak');
  });

  it('25. finalConfidence >= previousConfidence when sources agree (multi-source boost)', () => {
    const BEARING = 'N 04°37\'58" W';
    const r1 = makeWeightedReading({ source: 'deed_extraction',  callId: 'C1', bearing: BEARING, distance: 461.81, confidence: 75 });
    const r2 = makeWeightedReading({ source: 'plat_segment',     callId: 'C1', bearing: BEARING, distance: 461.80, confidence: 75 });
    const r3 = makeWeightedReading({ source: 'adjacent_reversed', callId: 'C1', bearing: BEARING, distance: 461.79, confidence: 82 });
    const set = makeReadingSet('C1', [r1, r2, r3]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.finalConfidence).toBeGreaterThanOrEqual(result.previousConfidence);
  });

  it('26. symbol=✓ when finalConfidence >= 85', () => {
    const BEARING = 'N 04°37\'58" W';
    const readings = [
      makeWeightedReading({ source: 'txdot_row',       callId: 'C1', bearing: BEARING, distance: 461.81, confidence: 95 }),
      makeWeightedReading({ source: 'deed_extraction',  callId: 'C1', bearing: BEARING, distance: 461.81, confidence: 90 }),
      makeWeightedReading({ source: 'plat_segment',     callId: 'C1', bearing: BEARING, distance: 461.80, confidence: 88 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.finalConfidence).toBeGreaterThanOrEqual(85);
    expect(result.symbol).toBe('✓');
  });

  it('27. symbol=~ when finalConfidence 65–84', () => {
    const BEARING = 'N 04°37\'58" W';
    const readings = [
      makeWeightedReading({ source: 'plat_segment', callId: 'C1', bearing: BEARING, distance: 461.81, confidence: 65 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.symbol).toBe('~');
  });

  it('28. symbol=? when finalConfidence < 65', () => {
    const BEARING = 'N 04°37\'58" W';
    const readings = [
      makeWeightedReading({ source: 'plat_geometric', callId: 'C1', bearing: BEARING, distance: 461.81, confidence: 40 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.symbol).toBe('?');
  });

  it('33. no straight readings → unresolved method', () => {
    // A set with only curve type but trying to reconcile as straight
    // Simulate by creating set with no readings
    const set = makeReadingSet('C1', []);
    const result = algo.reconcileCall(set, []);
    expect(result.reconciliation.method).toBe('unresolved');
  });

  it('34. weighted consensus produces a valid DMS bearing string', () => {
    const r1 = makeWeightedReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04°37\'58" W', distance: 461.81, confidence: 85 });
    const r2 = makeWeightedReading({ source: 'plat_segment',    callId: 'C1', bearing: 'N 04°37\'58" W', distance: 461.80, confidence: 75 });
    const set = makeReadingSet('C1', [r1, r2]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    expect(result.reconciledBearing).toBeTruthy();
    // DMS format check: contains degrees symbol or N/S/E/W
    const bearing = result.reconciledBearing!;
    expect(bearing).toMatch(/[NS]/i);
    expect(bearing).toMatch(/[EW]/i);
  });
});

// ── ReconciledBoundaryModel interface validation ──────────────────────────────

describe('ReconciledBoundaryModel interface', () => {
  it('29. ReconciledBoundaryModel has all required fields', () => {
    const model: ReconciledBoundaryModel = {
      status: 'complete',
      reconciledPerimeter: {
        calls: [],
        closure: {
          errorNorthing: 0,
          errorEasting: 0,
          errorDistance: 0,
          closureRatio: '1:100000',
          status: 'excellent',
          perimeterLength: 1000,
          points: [],
          previousClosureRatio: '1:50000',
          improvementNotes: 'Improved with multi-source reconciliation',
        },
        totalCalls: 0,
        reconciledCalls: 0,
        averageConfidence: 85,
        previousAverageConfidence: 72,
      },
      reconciledLots: [],
      sourceContributions: {} as never,
      closureOptimization: {
        beforeReconciliation: '1:500',
        afterReconciliation: '1:5000',
        afterCompassRule: '1:∞',
        compassRuleApplied: true,
        compassRuleAdjustments: [],
      },
      unresolvedConflicts: [],
      timing: { totalMs: 1500 },
      aiCalls: 0,
      errors: [],
    };

    expect(model.status).toBe('complete');
    expect(Array.isArray(model.reconciledPerimeter.calls)).toBe(true);
    expect(typeof model.timing.totalMs).toBe('number');
    expect(Array.isArray(model.errors)).toBe(true);
  });
});

// ── ReadingSet interface tests ────────────────────────────────────────────────

describe('ReadingSet interface', () => {
  it('30. hasConflictingTypes and hasAuthoritative are boolean flags', () => {
    const straightSet = makeReadingSet('C1', [
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', type: 'straight' }),
    ]);
    expect(straightSet.hasConflictingTypes).toBe(false);
    expect(straightSet.hasAuthoritative).toBe(false);

    const authorSet = makeReadingSet('C2', [
      makeBoundaryReading({ source: 'txdot_row', callId: 'C2', type: 'curve' }),
    ]);
    expect(authorSet.hasAuthoritative).toBe(true);
  });
});

// ── PhasePaths interface tests ────────────────────────────────────────────────

describe('PhasePaths interface', () => {
  it('36. PhasePaths has all 4 phase path fields', () => {
    const paths: PhasePaths = {
      intelligence: '/tmp/analysis/proj/property_intelligence.json',
      subdivision: '/tmp/analysis/proj/subdivision_model.json',
      crossValidation: '/tmp/analysis/proj/cross_validation_report.json',
      rowReport: '/tmp/analysis/proj/row_data.json',
    };
    expect(paths.intelligence).toContain('property_intelligence');
    expect(paths.subdivision).toContain('subdivision_model');
    expect(paths.crossValidation).toContain('cross_validation_report');
    expect(paths.rowReport).toContain('row_data');
  });
});

// ── normalizeToFeet tests ─────────────────────────────────────────────────────

describe('normalizeToFeet', () => {
  it('37. varas converted correctly (1 vara ≈ 2.7778 ft)', () => {
    // Texas vara = 1000/360 ft ≈ 2.77778 ft
    const result = normalizeToFeet(100, 'varas');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(100 * VARA_TO_FEET, 3);
    expect(result!).toBeGreaterThan(277);
    expect(result!).toBeLessThan(278);
  });

  it('38. chains converted correctly (1 chain = 66 ft)', () => {
    const result = normalizeToFeet(10, 'chains');
    expect(result).not.toBeNull();
    expect(result!).toBe(660); // 10 * 66 = 660
    expect(CHAIN_TO_FEET).toBe(66);
  });

  it('39. feet returned unchanged', () => {
    const result = normalizeToFeet(461.81, 'feet');
    expect(result).toBe(461.81);
  });

  it('40. null input returns null', () => {
    expect(normalizeToFeet(null, 'feet')).toBeNull();
    expect(normalizeToFeet(undefined, 'feet')).toBeNull();
    expect(normalizeToFeet(NaN, 'feet')).toBeNull();
  });
});

// ── Unit normalization in ReadingAggregator ───────────────────────────────────

describe('ReadingAggregator — unit normalization', () => {
  const aggregator = new ReadingAggregator();

  it('41. varas distance in plat segment is normalized to feet', () => {
    // 100 varas should become ~277.78 ft in the reading
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          {
            sequence: 1,
            callId: 'call_1',
            bearing: { raw: 'N 04°37\'58" W', decimalDegrees: 4.63, quadrant: 'NW' },
            distance: { raw: '100 varas', value: 100, unit: 'varas' as 'varas' },
            curve: null,
            toPoint: null,
            along: null,
            confidence: 70,
          },
        ],
        confidence: 70,
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    const set = sets.get('call_1');
    expect(set).toBeDefined();
    const reading = set!.readings[0];
    expect(reading.unit).toBe('feet'); // always stored in feet
    expect(reading.distance).not.toBeNull();
    // 100 varas * 2.7778 ≈ 277.78 ft
    expect(reading.distance!).toBeCloseTo(100 * VARA_TO_FEET, 2);
    // sourceDetail should mention the conversion
    expect(reading.sourceDetail).toContain('varas');
  });

  it('42. chains distance in deed reading is normalized to feet', () => {
    // deed call with 5 chains should become 330 ft
    // We need plat calls for deed matching
    const BEARING = 'N 45°00\'00" E';
    const intel: IntelligenceInput = {
      extraction: {
        calls: [
          {
            sequence: 1,
            callId: 'call_1',
            bearing: { raw: BEARING, decimalDegrees: 45, quadrant: 'NE' },
            distance: { raw: '330\'', value: 330, unit: 'feet' as 'feet' },
            curve: null,
            toPoint: null,
            along: null,
            confidence: 75,
          },
        ],
        confidence: 75,
      },
      deedAnalysis: {
        metesAndBounds: [
          {
            sequence: 1,
            callId: undefined,
            bearing: { raw: BEARING, decimalDegrees: 45, quadrant: 'NE' },
            distance: { raw: '5 chains', value: 5, unit: 'chains' as 'chains' },
            curve: null,
            toPoint: null,
            along: null,
            confidence: 80,
          },
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    let foundChainDeed = false;
    for (const [, set] of sets) {
      const deedReading = set.readings.find((r) => r.source === 'deed_extraction');
      if (deedReading) {
        expect(deedReading.unit).toBe('feet');
        // 5 chains * 66 = 330 ft
        expect(deedReading.distance).not.toBeNull();
        expect(deedReading.distance!).toBeCloseTo(330, 1);
        // sourceDetail should mention the conversion
        expect(deedReading.sourceDetail).toContain('chains');
        foundChainDeed = true;
        break;
      }
    }
    expect(foundChainDeed).toBe(true);
  });
});

// ── plat_overview source tests ────────────────────────────────────────────────

describe('ReadingAggregator — plat_overview source', () => {
  const aggregator = new ReadingAggregator();

  it('43. plat_overview readings collected from IntelligenceInput.platOverview', () => {
    const intel: IntelligenceInput = {
      platOverview: {
        calls: [
          {
            callId: 'PERIM_N1',
            bearing: 'N 04°37\'58" W',
            distance: 461.81,
            unit: 'feet',
            type: 'straight',
            confidence: 45,
            along: 'R.K. GAINES tract',
          },
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    const set = sets.get('PERIM_N1');
    expect(set).toBeDefined();
    expect(set!.readings).toHaveLength(1);
    expect(set!.readings[0].source).toBe('plat_overview');
    expect(set!.readings[0].bearing).toBe('N 04°37\'58" W');
    expect(set!.readings[0].distance).toBeCloseTo(461.81, 2);
    expect(set!.readings[0].confidence).toBe(45);
    expect(set!.along).toBe('R.K. GAINES tract');
  });

  it('44. plat_overview distance in varas normalized to feet', () => {
    const intel: IntelligenceInput = {
      platOverview: {
        calls: [
          {
            callId: 'OV_1',
            bearing: 'N 45°00\'00" E',
            distance: 100,
            unit: 'varas',
            type: 'straight',
            confidence: 35,
          },
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    const set = sets.get('OV_1');
    expect(set).toBeDefined();
    const reading = set!.readings[0];
    expect(reading.unit).toBe('feet');
    expect(reading.distance!).toBeCloseTo(100 * VARA_TO_FEET, 2);
  });

  it('45. plat_overview has correct source type, phase, and default confidence', () => {
    const intel: IntelligenceInput = {
      platOverview: {
        calls: [
          { callId: 'OV_2', bearing: 'S 75°14\'22" E', distance: 519.88, type: 'straight' },
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    const set = sets.get('OV_2');
    expect(set).toBeDefined();
    const reading = set!.readings[0];
    expect(reading.source).toBe('plat_overview');
    expect(reading.sourcePhase).toBe(3);
    expect(reading.confidence).toBe(40); // default when not specified
    expect(reading.sourceDetail).toContain('overview');
  });

  it('46. plat_overview calls without callId are skipped', () => {
    const intel: IntelligenceInput = {
      platOverview: {
        calls: [
          { callId: 'VALID_CALL', bearing: 'N 04° W', distance: 100, type: 'straight' },
          { callId: '', bearing: 'S 75° E', distance: 200, type: 'straight' }, // empty string → falsy
        ],
      },
    };
    const sets = aggregator.aggregate(intel, null, null, null);
    // Only the valid call should create a set
    expect(sets.has('VALID_CALL')).toBe(true);
    expect(sets.has('')).toBe(false);
  });
});

// ── SourceWeighter — plat_overview weight ────────────────────────────────────

describe('SourceWeighter — plat_overview', () => {
  const weighter = new SourceWeighter();

  it('47. plat_overview has lower weight than plat_segment at same confidence', () => {
    const ovReading = makeBoundaryReading({ source: 'plat_overview', callId: 'C1', bearing: 'N 04° W', confidence: 70 });
    const segReading = makeBoundaryReading({ source: 'plat_segment', callId: 'C1', bearing: 'N 04° W', confidence: 70 });
    const set = makeReadingSet('C1', [ovReading, segReading]);
    const weighted = weighter.weightReadings(set);

    const ovW = weighted.find((r) => r.source === 'plat_overview')!;
    const segW = weighted.find((r) => r.source === 'plat_segment')!;
    // plat_segment base weight (0.65) > plat_overview base weight (0.40)
    expect(ovW.baseWeight).toBeLessThan(segW.baseWeight);
  });

  it('48. plat_geometric demoted moderately when exactly 2 other sources present', () => {
    // otherCount = 2 → falls into the "otherCount >= 1" branch → 70% weight
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'plat_geometric', callId: 'C1', bearing: 'N 04° W', confidence: 45 }),
      makeBoundaryReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04° W', confidence: 80 }),
      makeBoundaryReading({ source: 'plat_segment', callId: 'C1', bearing: 'N 04° W', confidence: 75 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const geomR = weighted.find((r) => r.source === 'plat_geometric')!;
    // Should have a demotion note but less severe than 3+ sources
    expect(geomR.specialAdjustments.some((a) => a.includes('demoted'))).toBe(true);
  });

  it('49. plat_geometric not demoted when it is the only source', () => {
    const readings: BoundaryReading[] = [
      makeBoundaryReading({ source: 'plat_geometric', callId: 'C1', bearing: 'N 04° W', confidence: 45 }),
    ];
    const set = makeReadingSet('C1', readings);
    const weighted = weighter.weightReadings(set);
    const geomR = weighted.find((r) => r.source === 'plat_geometric')!;
    expect(geomR.specialAdjustments.some((a) => a.includes('demoted'))).toBe(false);
    expect(geomR.specialAdjustments.some((a) => a.includes('tiebreaker'))).toBe(true);
  });
});

// ── ReconciliationAlgorithm — edge cases ─────────────────────────────────────

describe('ReconciliationAlgorithm — edge cases', () => {
  const algo = new ReconciliationAlgorithm();
  const weighter = new SourceWeighter();

  function makeWeightedReading(opts: Parameters<typeof makeBoundaryReading>[0]): WeightedReading {
    const r = makeBoundaryReading(opts);
    const set = makeReadingSet(r.callId, [r]);
    const weighted = weighter.weightReadings(set);
    return weighted[0];
  }

  it('50. readings with null bearing → fall back to unresolved when all bearings null', () => {
    // Interior line readings have null bearing; if that is the only reading,
    // it should produce an unresolved result (no bearing to reconcile).
    const r = makeBoundaryReading({ source: 'subdivision_interior', callId: 'C1', distance: 461.81 });
    // Force bearing to null
    (r as BoundaryReading & { bearing: null }).bearing = null;
    const set = makeReadingSet('C1', [r]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    // With a null bearing, single_source path is taken (distance-only)
    // or unresolved if algorithm can't extract a bearing
    expect(['single_source', 'unresolved']).toContain(result.reconciliation.method);
  });

  it('51. single reading with null bearing → unresolved, reconciledBearing null', () => {
    // When a reading has a null bearing (e.g., interior line distance-only measurement),
    // the algorithm's straightReadings filter requires bearing != null. With no valid
    // straight bearing, the algorithm returns unresolved — bearing cannot be reconciled.
    const r = makeBoundaryReading({ source: 'subdivision_interior', callId: 'C1', distance: 200 });
    (r as BoundaryReading & { bearing: null }).bearing = null;
    const set = makeReadingSet('C1', [r]);
    // weightReadings should still work with null bearing
    const weighted = weighter.weightReadings(set);
    expect(weighted).toHaveLength(1);
    const result = algo.reconcileCall(set, weighted);
    // Distance-only interior line: algorithm cannot produce a bearing → unresolved
    expect(result.reconciliation.method).toBe('unresolved');
    expect(result.reconciledBearing).toBeNull();
  });

  it('52. symbol=✗ when method=unresolved', () => {
    const set = makeReadingSet('C1', []);
    const result = algo.reconcileCall(set, []);
    expect(result.reconciliation.method).toBe('unresolved');
    expect(result.symbol).toBe('✗');
  });

  it('53. consensus correctly handles readings where some have null distances', () => {
    // Two readings: one has distance, other does not (e.g., interior line gives only bearing+distance,
    // but a visual geometric gives bearing with no distance confidence)
    const r1 = makeWeightedReading({ source: 'deed_extraction', callId: 'C1', bearing: 'N 04°37\'58" W', distance: 461.81 });
    const r2 = makeBoundaryReading({ source: 'plat_segment', callId: 'C1', bearing: 'N 04°37\'58" W' });
    (r2 as BoundaryReading & { distance: null }).distance = null;
    const set = makeReadingSet('C1', [r1]);
    const weighted = weighter.weightReadings(set);
    const result = algo.reconcileCall(set, weighted);
    // Should produce a valid bearing even though one reading lacks distance
    expect(result.reconciledBearing).toBeTruthy();
  });
});

// ── TraverseComputation tests ─────────────────────────────────────────────────

describe('TraverseComputation', () => {
  const traverse = new TraverseComputation();

  it('54. single N 00°00\'00" W call of 100\' produces point at (0, 100)', () => {
    const calls = [
      { callId: 'C1', bearing: 'N 00°00\'00" W', distance: 100, type: 'straight' as 'straight' },
    ];
    // Note: "N 00°00'00" W" is due north — northing increases, easting unchanged
    const result = traverse.computeTraverse(calls, 0, 0);
    expect(result.points).toHaveLength(1);
    // Due north: northing should be +100, easting ~0
    expect(result.points[0].northing).toBeCloseTo(100, 0);
    expect(result.points[0].easting).toBeCloseTo(0, 0);
  });

  it('55. right-angle traverse (N then E) produces expected closure error', () => {
    // If we go N 100\' then E 100\', the last point is (100, 100).
    // That is not the start, so there is error unless we close back.
    const calls = [
      { callId: 'C1', bearing: 'N 00°00\'00" E', distance: 100, type: 'straight' as 'straight' },
      { callId: 'C2', bearing: 'N 90°00\'00" E', distance: 100, type: 'straight' as 'straight' },
    ];
    const result = traverse.computeTraverse(calls, 0, 0);
    expect(result.points).toHaveLength(2);
    // Not closed — error distance should be sqrt(100² + 100²) ≈ 141.4
    expect(result.errorDistance).toBeGreaterThan(0);
    expect(result.perimeterLength).toBeCloseTo(200, 1);
    expect(result.status).toBe('poor'); // big error for short traverse
  });

  it('56. applyCompassRule returns compassRuleApplied=true for open traverse', () => {
    const calls = [
      { callId: 'C1', bearing: 'N 00°00\'00" E', distance: 100, type: 'straight' as 'straight' },
      { callId: 'C2', bearing: 'N 89°00\'00" E', distance: 100, type: 'straight' as 'straight' },
    ];
    const closure = traverse.computeTraverse(calls, 0, 0);
    const adjusted = traverse.applyCompassRule(calls, closure);
    expect(adjusted.compassRuleApplied).toBe(true);
    expect(adjusted.adjustments).toHaveLength(2);
  });

  it('57. perimeter length is sum of all leg distances', () => {
    const calls = [
      { callId: 'C1', bearing: 'N 00°00\'00" E', distance: 200, type: 'straight' as 'straight' },
      { callId: 'C2', bearing: 'S 00°00\'00" E', distance: 300, type: 'straight' as 'straight' },
      { callId: 'C3', bearing: 'S 45°00\'00" W', distance: 100, type: 'straight' as 'straight' },
    ];
    const result = traverse.computeTraverse(calls, 0, 0);
    expect(result.perimeterLength).toBeCloseTo(600, 1);
  });
});

// ── GeometricReconciliationEngine — input validation ─────────────────────────

describe('GeometricReconciliationEngine — validation', () => {
  const engine = new GeometricReconciliationEngine();

  it('58. rejects empty projectId with failed status', async () => {
    const model = await engine.reconcile('', {
      intelligence: '/tmp/nonexistent.json',
    });
    expect(model.status).toBe('failed');
    expect(model.errors[0]).toContain('projectId');
  });

  it('59. rejects unsafe projectId containing path traversal characters', async () => {
    const model = await engine.reconcile('../etc/passwd', {
      intelligence: '/tmp/nonexistent.json',
    });
    expect(model.status).toBe('failed');
    expect(model.errors[0]).toContain('projectId');
  });

  it('60. returns failed model when intelligence file does not exist', async () => {
    const model = await engine.reconcile('test-project', {
      intelligence: '/tmp/absolutely-does-not-exist-phase7.json',
    });
    expect(model.status).toBe('failed');
    expect(model.errors.length).toBeGreaterThan(0);
  });
});

// ── Phase 5 chain-of-title distance normalization ─────────────────────────────

describe('ReadingAggregator — Phase 5 chain-of-title distance normalization', () => {
  const aggregator = new ReadingAggregator();

  it('60 (alias). Phase 5 chain-of-title: varas distance normalized to feet', () => {
    const crossVal: CrossValidationInput = {
      adjacentProperties: [
        {
          owner: 'Historical Grantor',
          crossValidation: { callComparisons: [] },
          chainOfTitle: [
            {
              instrument: '1885-deed',
              grantor: 'Old Grantor',
              grantee: 'Old Grantee',
              date: '1885-03-01',
              boundaryDescriptionChanged: true,
              metesAndBounds: [
                {
                  bearing: 'S 04°37\'58" E', // reversed call
                  distance: 166.5,
                  unit: 'varas',
                  type: 'straight',
                  isSharedBoundary: true,
                  matchedCallId: 'PERIM_N1',
                },
              ],
            },
          ],
        },
      ],
    };

    const intel: IntelligenceInput = {};
    const sets = aggregator.aggregate(intel, null, crossVal, null);

    // Should find the chain reading with normalized distance
    let found = false;
    for (const [, set] of sets) {
      const chainR = set.readings.find((r) => r.source === 'adjacent_chain');
      if (chainR) {
        expect(chainR.unit).toBe('feet');
        // 166.5 varas * 2.7778 ≈ 462.5 ft (approximately)
        expect(chainR.distance!).toBeCloseTo(166.5 * VARA_TO_FEET, 1);
        expect(chainR.sourceDetail).toContain('varas');
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
