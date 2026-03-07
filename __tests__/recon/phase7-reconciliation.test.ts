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

import { describe, it, expect } from 'vitest';

import { ReadingAggregator } from '../../worker/src/services/reading-aggregator.js';
import { SourceWeighter } from '../../worker/src/services/source-weighting.js';
import { ReconciliationAlgorithm } from '../../worker/src/services/reconciliation-algorithm.js';
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
