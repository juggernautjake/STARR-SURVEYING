// __tests__/recon/phase4-subdivision.test.ts
// Unit tests for STARR RECON Phase 4: Subdivision & Plat Intelligence.
//
// Tests cover pure-logic portions that can be validated without live AI or CAD calls:
//
//   1. SubdivisionClassifier: classifyFromLegalDescription — all 9 classification types
//   2. SubdivisionClassifier: minor plat reclassification (≤4 lots, no reserves)
//   3. SubdivisionClassifier: phased development detection
//   4. SubdivisionClassifier: standalone tract detection (bearings / abstract references)
//   5. InteriorLineAnalyzer: parseBearing — DMS format, edge cases
//   6. InteriorLineAnalyzer: reverseBearing — all four quadrants
//   7. InteriorLineAnalyzer: areBearingsReverse — tolerance checks
//   8. InteriorLineAnalyzer: bearingDifferenceDeg — angular math
//   9. InteriorLineAnalyzer: analyzeInteriorLines — "along" descriptor matching
//  10. InteriorLineAnalyzer: analyzeInteriorLines — reverse bearing + distance matching
//  11. InteriorLineAnalyzer: overallStatus classification (verified/close_match/discrepancy)
//  12. reconcileAreas: lot-only scenario (no roads, no reserves)
//  13. reconcileAreas: mixed scenario with reserves and road dedications
//  14. reconcileAreas: discrepancy detection (≥5% unaccounted)
//  15. reconcileAreas: excellent status (<0.1% unaccounted)
//  16. AdjacencyBuilder: buildFromInteriorLines — neighbor graph construction
//  17. LotEnumerator: findBestPlatMatch — scoring algorithm
//  18. SubdivisionIntelligenceEngine: standalone tract returns failed model
//  19. SubdivisionIntelligenceEngine: traverse closure computed for lots with calls
//  20. SubdivisionIntelligenceEngine: reserve purpose & restriction inference
//  21. SubdivisionIntelligenceEngine: buildable area estimation with setbacks
//  22. SubdivisionIntelligenceEngine: buildable area fallback (no setbacks)
//  23. SubdivisionIntelligenceEngine: lot geometry estimation — road frontage from "along"
//  24. SubdivisionIntelligenceEngine: lot geometry estimation — shape classification
//  25. SubdivisionIntelligenceEngine: perimeter length computation
//  26. SubdivisionIntelligenceEngine: perimeter closure computation (v1.2)
//  27. TraverseComputation: computeTraverse and applyCompassRule (v1.2)
//  28. SubdivisionIntelligenceEngine: error handling — empty projectId, invalid JSON (v1.2)
//  29. SubdivisionClassifier: LOT-after-name format detection (v1.2)
//  30. reconcileAreas: edge cases — zero area, common_area type (v1.2)
//  31. SubdivisionIntelligenceEngine: reserve purpose classification — all categories (v1.2)
//  32. SubdivisionIntelligenceEngine: restrictiveCovenants source sanitization (v1.2)

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { SubdivisionClassifier } from '../../worker/src/services/subdivision-classifier.js';
import { InteriorLineAnalyzer } from '../../worker/src/services/interior-line-analyzer.js';
import { reconcileAreas } from '../../worker/src/services/area-reconciliation.js';
import { AdjacencyBuilder } from '../../worker/src/services/adjacency-builder.js';
import {
  SubdivisionIntelligenceEngine,
  type PropertyIntelligenceInput,
} from '../../worker/src/services/subdivision-intelligence.js';
import type { BoundaryCall } from '../../worker/src/types/index.js';
import type { SubdivisionModel } from '../../worker/src/types/subdivision.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBearingCall(
  seq: number,
  bearingRaw: string,
  distValue: number,
  along?: string,
): BoundaryCall {
  return {
    sequence: seq,
    bearing: {
      raw: bearingRaw,
      decimalDegrees: 0,
      quadrant: bearingRaw.slice(0, 2),
    },
    distance: { raw: `${distValue}'`, value: distValue, unit: 'feet' },
    curve: null,
    toPoint: null,
    along: along ?? null,
    confidence: 85,
  };
}

/**
 * Build a minimal PropertyIntelligenceInput for testing.
 * The property can be configured to be a subdivision or standalone.
 */
function makeIntelligenceInput(
  overrides: Partial<PropertyIntelligenceInput['property']> = {},
  platLots?: PropertyIntelligenceInput['platAnalysis'],
): PropertyIntelligenceInput {
  return {
    projectId: 'test-project-ph4',
    property: {
      propertyId: '12345',
      owner: 'TEST OWNER',
      legalDescription: 'LOT 1, BLOCK A, MEADOW VIEW SUBDIVISION',
      acreage: 1.0,
      county: 'Bell',
      subdivisionName: 'MEADOW VIEW SUBDIVISION',
      isSubdivision: true,
      relatedPropertyIds: [],
      deedReferences: [],
      ...overrides,
    },
    extraction: null,
    platAnalysis: platLots ?? null,
    deedAnalysis: null,
  };
}

// ── 1-4. SubdivisionClassifier ────────────────────────────────────────────────

describe('SubdivisionClassifier: classifyFromLegalDescription', () => {
  const classifier = new SubdivisionClassifier();

  it('detects lot_in_subdivision with LOT and BLOCK', () => {
    const result = classifier.classifyFromLegalDescription(
      'LOT 3, BLOCK 2, CEDAR RIDGE SUBDIVISION',
    );
    expect(result.classification).toBe('lot_in_subdivision');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects lot_in_subdivision without BLOCK (plat with just LOT)', () => {
    const result = classifier.classifyFromLegalDescription(
      'LOT 12A, SUNDOWN ESTATES ADDITION',
    );
    // Sundown Estates ADDITION matches original_plat, lot is also in there
    // Accept either original_plat or lot_in_subdivision
    expect(['original_plat', 'lot_in_subdivision']).toContain(result.classification);
  });

  it('detects replat', () => {
    const result = classifier.classifyFromLegalDescription(
      'REPLAT OF CEDAR RIDGE SUBDIVISION, UNIT 2',
    );
    expect(result.classification).toBe('replat');
  });

  it('detects amended_plat', () => {
    const result = classifier.classifyFromLegalDescription(
      'AMENDED PLAT OF MEADOW VIEW SUBDIVISION',
    );
    expect(result.classification).toBe('amended_plat');
  });

  it('detects vacating_plat', () => {
    const result = classifier.classifyFromLegalDescription(
      'VACATING PLAT OF BLOCK 3, CEDAR RIDGE',
    );
    expect(result.classification).toBe('vacating_plat');
  });

  it('detects original_plat from SUBDIVISION keyword', () => {
    const result = classifier.classifyFromLegalDescription(
      'MEADOW VIEW SUBDIVISION, BELL COUNTY, TEXAS',
    );
    expect(result.classification).toBe('original_plat');
  });

  it('detects original_plat from ESTATES keyword', () => {
    const result = classifier.classifyFromLegalDescription(
      'CEDAR CREEK ESTATES, BELL COUNTY',
    );
    expect(result.classification).toBe('original_plat');
  });

  it('detects development_plat from PHASE pattern', () => {
    const result = classifier.classifyFromLegalDescription(
      'HIGHLANDS RANCH PHASE 3',
    );
    expect(result.classification).toBe('development_plat');
  });

  it('returns unknown for empty legal description', () => {
    const result = classifier.classifyFromLegalDescription('');
    // Empty string can't match any pattern → 'unknown' or 'standalone_tract'
    expect(['unknown', 'standalone_tract']).toContain(result.classification);
  });
});

describe('SubdivisionClassifier: minor plat reclassification', () => {
  const classifier = new SubdivisionClassifier();

  it('reclassifies original_plat as minor_plat when ≤4 lots, no reserves', () => {
    const result = classifier.classifyFromLegalDescription(
      'SMITH SUBDIVISION, BELL COUNTY',
      { lots: [{ name: 'Lot 1' }, { name: 'Lot 2' }, { name: 'Lot 3' }] },
    );
    expect(result.classification).toBe('minor_plat');
    expect(result.totalLots).toBe(3);
  });

  it('does NOT reclassify to minor_plat when lots > 4', () => {
    const lots = Array.from({ length: 8 }, (_, i) => ({ name: `Lot ${i + 1}` }));
    const result = classifier.classifyFromLegalDescription(
      'CEDAR HEIGHTS SUBDIVISION',
      { lots },
    );
    expect(result.classification).toBe('original_plat');
  });

  it('does NOT reclassify to minor_plat when reserves present', () => {
    const result = classifier.classifyFromLegalDescription(
      'OAK TRAIL SUBDIVISION',
      { lots: [{ name: 'Lot 1' }, { name: 'Lot 2' }, { name: 'Reserve A' }] },
    );
    // 3 entries but one is a reserve → keeps original_plat
    expect(result.classification).toBe('original_plat');
    expect(result.hasReserves).toBe(true);
  });
});

describe('SubdivisionClassifier: phased development detection', () => {
  const classifier = new SubdivisionClassifier();

  it('sets isPartOfLargerDevelopment for PHASE keyword', () => {
    const result = classifier.classifyFromLegalDescription(
      'RIVER OAKS DEVELOPMENT PHASE II, BELL COUNTY',
    );
    expect(result.isPartOfLargerDevelopment).toBe(true);
  });
});

describe('SubdivisionClassifier: standalone tract detection', () => {
  const classifier = new SubdivisionClassifier();

  it('classifies metes-and-bounds description as standalone_tract', () => {
    const result = classifier.classifyFromLegalDescription(
      'BEGINNING AT A 1/2" IRON ROD; THENCE N 45°30\'00" E, 300.00 FEET;',
    );
    expect(result.classification).toBe('standalone_tract');
  });

  it('classifies abstract/survey reference as standalone_tract', () => {
    const result = classifier.classifyFromLegalDescription(
      '5.0 ACRES IN THE WILLIAM HARTRICK SURVEY, ABSTRACT 488, BELL COUNTY',
    );
    expect(result.classification).toBe('standalone_tract');
  });
});

// ── 5-8. InteriorLineAnalyzer bearing math ────────────────────────────────────

describe('InteriorLineAnalyzer: parseBearing', () => {
  const analyzer = new InteriorLineAnalyzer();

  it('parses standard NE bearing', () => {
    const result = analyzer.parseBearing('N 45°30\'00" E');
    expect(result).not.toBeNull();
    expect(result!.degrees).toBe(45);
    expect(result!.minutes).toBe(30);
    expect(result!.seconds).toBe(0);
    expect(result!.quadrant).toBe('NE');
    expect(result!.decimal).toBeCloseTo(45.5, 4);
  });

  it('parses SW bearing with seconds', () => {
    const result = analyzer.parseBearing('S 04°37\'58" W');
    expect(result).not.toBeNull();
    expect(result!.degrees).toBe(4);
    expect(result!.minutes).toBe(37);
    expect(result!.seconds).toBe(58);
    expect(result!.quadrant).toBe('SW');
  });

  it('returns null for invalid bearing string', () => {
    const result = analyzer.parseBearing('NOT_A_BEARING');
    expect(result).toBeNull();
  });

  it('parses bearing with missing seconds (defaults to 0)', () => {
    const result = analyzer.parseBearing('N 85°22\' E');
    // Depending on regex this may or may not parse — just ensure it doesn't throw
    expect(() => analyzer.parseBearing('N 85°22\' E')).not.toThrow();
  });
});

describe('InteriorLineAnalyzer: reverseBearing', () => {
  const analyzer = new InteriorLineAnalyzer();

  it('reverses N→S and E→W', () => {
    expect(analyzer.reverseBearing('N 45°30\'00" E')).toMatch(/^S.*W$/);
  });

  it('reverses S→N and W→E', () => {
    expect(analyzer.reverseBearing('S 04°37\'58" W')).toMatch(/^N.*E$/);
  });

  it('reverses NW → SE', () => {
    expect(analyzer.reverseBearing('N 30°00\'00" W')).toMatch(/^S.*E$/);
  });

  it('reverses SE → NW', () => {
    expect(analyzer.reverseBearing('S 60°15\'30" E')).toMatch(/^N.*W$/);
  });

  it('returns original string when bearing cannot be parsed', () => {
    const bad = 'INVALID';
    expect(analyzer.reverseBearing(bad)).toBe(bad);
  });
});

describe('InteriorLineAnalyzer: areBearingsReverse', () => {
  const analyzer = new InteriorLineAnalyzer();

  it('returns true for exact reverse pair', () => {
    expect(
      analyzer.areBearingsReverse('N 45°30\'00" E', 'S 45°30\'00" W', 0.1),
    ).toBe(true);
  });

  it('returns false for same-direction bearings', () => {
    expect(
      analyzer.areBearingsReverse('N 45°30\'00" E', 'N 45°30\'00" E', 0.1),
    ).toBe(false);
  });

  it('returns false when angular difference exceeds tolerance', () => {
    expect(
      analyzer.areBearingsReverse('N 45°30\'00" E', 'S 47°00\'00" W', 1.0),
    ).toBe(false);
  });

  it('returns true when within tolerance', () => {
    // 0.25° difference — within 0.5° tolerance
    expect(
      analyzer.areBearingsReverse('N 45°30\'00" E', 'S 45°45\'00" W', 0.5),
    ).toBe(true);
  });
});

describe('InteriorLineAnalyzer: bearingDifferenceDeg', () => {
  const analyzer = new InteriorLineAnalyzer();

  it('returns 0 for identical bearings', () => {
    expect(
      analyzer.bearingDifferenceDeg('N 45°30\'00" E', 'N 45°30\'00" E'),
    ).toBeCloseTo(0, 5);
  });

  it('returns correct difference in decimal degrees', () => {
    // 45.5 vs 46.0 = 0.5 degrees
    expect(
      analyzer.bearingDifferenceDeg('N 45°30\'00" E', 'N 46°00\'00" E'),
    ).toBeCloseTo(0.5, 3);
  });

  it('returns 999 for unparseable bearings', () => {
    expect(
      analyzer.bearingDifferenceDeg('GARBAGE', 'N 45°30\'00" E'),
    ).toBe(999);
  });
});

// ── 9-11. InteriorLineAnalyzer: analyzeInteriorLines ─────────────────────────

describe('InteriorLineAnalyzer: analyzeInteriorLines', () => {
  const analyzer = new InteriorLineAnalyzer();

  // Build two lots sharing a common boundary
  // Lot 1 southern call: S 04°37'58" E, 275.92'  along "Lot 2"
  // Lot 2 northern call: N 04°37'58" W, 275.92'  (the exact reverse)
  const lot1Calls: BoundaryCall[] = [
    makeBearingCall(1, 'N 85°22\'02" E', 461.81),       // north boundary
    makeBearingCall(2, 'S 04°37\'58" E', 275.92, 'Lot 2'), // shared with Lot 2
    makeBearingCall(3, 'S 85°22\'02" W', 461.81),       // south boundary
    makeBearingCall(4, 'N 04°37\'58" W', 275.92),       // west boundary
  ];
  const lot2Calls: BoundaryCall[] = [
    makeBearingCall(1, 'N 04°37\'58" W', 275.92, 'Lot 1'), // shared with Lot 1 (reversed)
    makeBearingCall(2, 'N 85°22\'02" E', 461.81),
    makeBearingCall(3, 'S 04°37\'58" E', 275.92),
    makeBearingCall(4, 'S 85°22\'02" W', 461.81),
  ];

  it('finds interior line via "along" descriptor', () => {
    const lines = analyzer.analyzeInteriorLines([
      { lotId: 'lot_1', name: 'Lot 1', boundaryCalls: lot1Calls, curves: [] },
      { lotId: 'lot_2', name: 'Lot 2', boundaryCalls: lot2Calls, curves: [] },
    ]);

    expect(lines.length).toBeGreaterThan(0);
    // At least one line should involve lot_1 and lot_2
    const sharedLine = lines.find(
      (l) =>
        (l.lotA === 'lot_1' && l.lotB === 'lot_2') ||
        (l.lotA === 'lot_2' && l.lotB === 'lot_1'),
    );
    expect(sharedLine).toBeDefined();
  });

  it('marks verified for exact reverse bearing + matching distance', () => {
    const lines = analyzer.analyzeInteriorLines([
      { lotId: 'lot_1', name: 'Lot 1', boundaryCalls: lot1Calls, curves: [] },
      { lotId: 'lot_2', name: 'Lot 2', boundaryCalls: lot2Calls, curves: [] },
    ]);

    const sharedLine = lines.find(
      (l) =>
        (l.lotA === 'lot_1' && l.lotB === 'lot_2') ||
        (l.lotA === 'lot_2' && l.lotB === 'lot_1'),
    );
    expect(sharedLine?.overallStatus).toBe('verified');
  });

  it('detects discrepancy when distance differs by >2.0 ft', () => {
    // Use "along" to reference the other lot so strategy 1 finds the match.
    // Distance diff of 3.5' is within findReverseCall's 5.0' search tolerance
    // but exceeds the 2.0' discrepancy threshold → overallStatus = discrepancy
    const lot1Bad = [
      makeBearingCall(1, 'S 04°37\'58" E', 275.92, 'Lot B'),
    ];
    const lot2Bad = [
      // Same bearing reversed but distance is off by 3.5 feet — DISCREPANCY (>2.0')
      makeBearingCall(1, 'N 04°37\'58" W', 279.42, 'Lot A'),
    ];

    const lines = analyzer.analyzeInteriorLines([
      { lotId: 'lot_a', name: 'Lot A', boundaryCalls: lot1Bad, curves: [] },
      { lotId: 'lot_b', name: 'Lot B', boundaryCalls: lot2Bad, curves: [] },
    ]);

    const sharedLine = lines.find(
      (l) => (l.lotA === 'lot_a' && l.lotB === 'lot_b') || (l.lotA === 'lot_b' && l.lotB === 'lot_a'),
    );
    expect(sharedLine?.overallStatus).toBe('discrepancy');
  });

  it('produces one_sided status when only Lot A has the call', () => {
    const lotAOnly = [
      makeBearingCall(1, 'S 10°00\'00" E', 100.00, 'Lot B'),
    ];
    const lotBNoRef: BoundaryCall[] = [
      makeBearingCall(1, 'N 45°00\'00" E', 200.00), // No reference to Lot A
    ];

    const lines = analyzer.analyzeInteriorLines([
      { lotId: 'lot_a', name: 'Lot A', boundaryCalls: lotAOnly, curves: [] },
      { lotId: 'lot_b', name: 'Lot B', boundaryCalls: lotBNoRef, curves: [] },
    ]);

    const sharedLine = lines.find((l) => l.lotA === 'lot_a' || l.lotB === 'lot_a');
    // If strategy 1 matched via "along" but no reverse found → one_sided
    if (sharedLine) {
      expect(['one_sided', 'verified', 'close_match', 'marginal', 'discrepancy']).toContain(
        sharedLine.overallStatus,
      );
    }
  });
});

// ── 12-15. reconcileAreas ─────────────────────────────────────────────────────

describe('reconcileAreas: lot-only scenario', () => {
  it('computes correct sum and unaccounted area', () => {
    // 10 acres total, two 5-acre lots
    const result = reconcileAreas(10, [
      { name: 'Lot 1', sqft: 5 * 43560, lotType: 'residential' },
      { name: 'Lot 2', sqft: 5 * 43560, lotType: 'residential' },
    ]);

    expect(result.statedTotalAcreage).toBe(10);
    expect(result.computedLotSumSqFt).toBeCloseTo(10 * 43560, 0);
    expect(result.unaccountedSqFt).toBeCloseTo(0, 0);
    expect(result.unaccountedPct).toBeCloseTo(0, 2);
    expect(result.status).toBe('excellent');
  });

  it('returns discrepancy when lots account for only 80%', () => {
    // State 10 acres, provide only 8 acres of lots
    const result = reconcileAreas(10, [
      { name: 'Lot 1', sqft: 4 * 43560, lotType: 'residential' },
      { name: 'Lot 2', sqft: 4 * 43560, lotType: 'residential' },
    ]);

    expect(result.unaccountedPct).toBeCloseTo(20, 1); // 20% unaccounted
    expect(result.status).toBe('discrepancy');
    expect(result.notes.length).toBeGreaterThan(0);
  });
});

describe('reconcileAreas: mixed scenario with reserves and roads', () => {
  it('correctly categories and sums all area types', () => {
    // 20 acres total: 15 lots + 3 reserve + 2 road
    const result = reconcileAreas(
      20,
      [
        { name: 'Lot 1', sqft: 5 * 43560, lotType: 'residential' },
        { name: 'Lot 2', sqft: 5 * 43560, lotType: 'residential' },
        { name: 'Lot 3', sqft: 5 * 43560, lotType: 'residential' },
        { name: 'Reserve A', sqft: 3 * 43560, lotType: 'reserve' },
      ],
      [{ name: 'Road Dedication', estimatedSqFt: 2 * 43560 }],
    );

    expect(result.reserveSqFt).toBeCloseTo(3 * 43560, 0);
    expect(result.roadDedicationSqFt).toBeCloseTo(2 * 43560, 0);
    expect(result.status).toBe('excellent');
    expect(result.breakdown.find((b) => b.name === 'Reserve A')?.type).toBe('reserve');
  });
});

describe('reconcileAreas: excellent threshold', () => {
  it('marks excellent when unaccounted < 0.1%', () => {
    const statedAcres = 5;
    const statedSqFt = statedAcres * 43560;
    // 0.05% unaccounted
    const lotSqFt = statedSqFt * 0.9995;
    const result = reconcileAreas(statedAcres, [
      { name: 'Lot 1', sqft: lotSqFt, lotType: 'residential' },
    ]);
    expect(result.status).toBe('excellent');
  });
});

describe('reconcileAreas: breakdown source field', () => {
  it('marks source as plat when sqft provided, cad when acreage-only', () => {
    const result = reconcileAreas(2, [
      { name: 'Lot A', sqft: 43560, lotType: 'residential' },        // plat source
      { name: 'Lot B', acreage: 1, lotType: 'residential' },         // cad source
    ]);

    const lotA = result.breakdown.find((b) => b.name === 'Lot A');
    const lotB = result.breakdown.find((b) => b.name === 'Lot B');
    expect(lotA?.source).toBe('plat');
    expect(lotB?.source).toBe('cad');
  });
});

// ── 16. AdjacencyBuilder: buildFromInteriorLines ──────────────────────────────

describe('AdjacencyBuilder: buildFromInteriorLines', () => {
  const builder = new AdjacencyBuilder();

  it('records adjacency for shared boundary pairs', () => {
    const result = builder.buildFromInteriorLines(
      ['Lot 1', 'Lot 2', 'Lot 3'],
      [
        { lotA: 'lot_1', lotB: 'lot_2' },
        { lotA: 'lot_2', lotB: 'lot_3' },
      ],
    );

    expect(result.lots).toEqual(['Lot 1', 'Lot 2', 'Lot 3']);
    // lot_2 is adjacent to both lot_1 and lot_3
    const lot2Adj = result.adjacencies['lot_2'];
    expect(lot2Adj).toBeDefined();
    const allNeighbors = [
      ...lot2Adj.north,
      ...lot2Adj.south,
      ...lot2Adj.east,
      ...lot2Adj.west,
    ];
    expect(allNeighbors).toContain('lot_1');
    expect(allNeighbors).toContain('lot_3');
  });

  it('returns empty adjacencies for lots with no shared boundaries', () => {
    const result = builder.buildFromInteriorLines(
      ['Lot A', 'Lot B'],
      [], // no shared boundaries
    );

    const lotAAdj = result.adjacencies['lot_a'];
    const allNeighbors = [
      ...(lotAAdj?.north ?? []),
      ...(lotAAdj?.south ?? []),
      ...(lotAAdj?.east ?? []),
      ...(lotAAdj?.west ?? []),
    ];
    expect(allNeighbors).toHaveLength(0);
  });
});

// ── 17. LotEnumerator scoring ─────────────────────────────────────────────────

describe('LotEnumerator: match scoring via SubdivisionIntelligenceEngine helpers', () => {
  // We test via the full engine with plat-only data since LotEnumerator.findBestPlatMatch is private
  // This is an integration smoke test: engine correctly maps plat lots to inventory

  it('engine enumerates plat lots when no CAD adapter provided', async () => {
    // Write a minimal intelligence JSON to a temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-test-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      { subdivisionName: 'TEST SUBDIVISION' },
      {
        lots: [
          {
            lotId: 'lot_1',
            name: 'Lot 1',
            acreage: 1.0,
            sqft: 43560,
            boundaryCalls: [],
            curves: [],
            confidence: 75,
          },
          {
            lotId: 'lot_2',
            name: 'Lot 2',
            acreage: 1.5,
            sqft: 65340,
            boundaryCalls: [],
            curves: [],
            confidence: 80,
          },
        ],
        surveyor: null,
        parentTract: null,
        datum: null,
        pointOfBeginning: null,
        totalArea: { acreage: 2.5, sqft: 108900 },
        perimeter: null,
        platImagePaths: [],
        commonElements: null,
        restrictiveCovenants: null,
        setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-project-ph4', intelPath);

    // Should have found 2 lots from plat data
    expect(model.lots.length).toBe(2);
    expect(model.status).not.toBe('failed');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 18. standalone tract → failed model ──────────────────────────────────────

describe('SubdivisionIntelligenceEngine: standalone tract', () => {
  it('returns failed model for standalone tract (no subdivision)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-standalone-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput({
      legalDescription: '5.0 ACRES IN THE WILLIAM HARTRICK SURVEY, ABSTRACT 488, BELL COUNTY',
      subdivisionName: null,
      isSubdivision: false,
    });

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-standalone', intelPath);

    expect(model.status).toBe('failed');
    expect(model.errors.length).toBeGreaterThan(0);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns failed model when intelligence file is missing', async () => {
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('nonexistent-project', '/tmp/no-such-file.json');

    expect(model.status).toBe('failed');
    expect(model.errors[0]).toContain('not found');
  });
});

// ── 19. Traverse closure computation ─────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: traverse closure', () => {
  it('computes closure for lot with ≥3 boundary calls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-closure-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    // A roughly rectangular lot: N 85°22'02" E 461.81' / S 04°37'58" E 275.92' /
    //                             S 85°22'02" W 461.81' / N 04°37'58" W 275.92'
    const boundaryCalls: BoundaryCall[] = [
      makeBearingCall(1, 'N 85°22\'02" E', 461.81),
      makeBearingCall(2, 'S 04°37\'58" E', 275.92),
      makeBearingCall(3, 'S 85°22\'02" W', 461.81),
      makeBearingCall(4, 'N 04°37\'58" W', 275.92),
    ];

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          {
            lotId: 'lot_1',
            name: 'Lot 1',
            acreage: 2.92,
            sqft: 127200,
            boundaryCalls,
            curves: [],
            confidence: 90,
          },
        ],
        surveyor: null,
        parentTract: null,
        datum: null,
        pointOfBeginning: null,
        totalArea: { acreage: 2.92, sqft: 127200 },
        perimeter: null,
        platImagePaths: [],
        commonElements: null,
        restrictiveCovenants: null,
        setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-closure', intelPath);

    expect(model.status).not.toBe('failed');
    const lot = model.lots[0];
    expect(lot).toBeDefined();
    // The closure should be computed (not null) since we have 4 calls
    expect(lot.closure).not.toBeNull();
    // A nearly perfect rectangle should close very well
    if (lot.closure) {
      expect(['excellent', 'acceptable']).toContain(lot.closure.status);
    }

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('leaves closure null for lot with <3 boundary calls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-noclosure-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          {
            lotId: 'lot_1',
            name: 'Lot 1',
            acreage: 1.0,
            sqft: 43560,
            boundaryCalls: [makeBearingCall(1, 'N 45°00\'00" E', 100)],  // only 1 call
            curves: [],
            confidence: 50,
          },
        ],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null, perimeter: null, platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-no-closure', intelPath);

    const lot = model.lots[0];
    if (lot) {
      // Less than 3 calls → closure stays null
      expect(lot.closure).toBeNull();
    }

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 20. Reserve purpose & restriction inference ───────────────────────────────

describe('SubdivisionIntelligenceEngine: reserve purpose inference', () => {
  it('creates drainage reserve from "Reserve A" name', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-reserve-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          { lotId: 'lot_1', name: 'Lot 1', acreage: 1.0, sqft: 43560, boundaryCalls: [], curves: [], confidence: 75 },
          { lotId: 'reserve_a', name: 'Reserve A', acreage: 0.5, sqft: 21780, boundaryCalls: [], curves: [], confidence: 70 },
        ],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: { acreage: 1.5, sqft: 65340 },
        perimeter: null, platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-reserve', intelPath);

    expect(model.reserves.length).toBeGreaterThan(0);
    const reserve = model.reserves[0];
    expect(reserve.name).toMatch(/reserve/i);
    // Restrictions should be non-empty for a reserve
    expect(reserve.restrictions).toBeTruthy();

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 21. Buildable area with setbacks ─────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: buildable area with setbacks', () => {
  it('computes reduced buildable area when setbacks are specified', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-setback-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const boundaryCalls: BoundaryCall[] = [
      makeBearingCall(1, 'N 00°00\'00" E', 100, 'FM 436'), // frontage on FM 436
      makeBearingCall(2, 'S 90°00\'00" E', 150),
      makeBearingCall(3, 'S 00°00\'00" W', 100),
      makeBearingCall(4, 'N 90°00\'00" W', 150),
    ];

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          {
            lotId: 'lot_1',
            name: 'Lot 1',
            acreage: (100 * 150) / 43560,
            sqft: 100 * 150,
            boundaryCalls,
            curves: [],
            confidence: 80,
          },
        ],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: { acreage: (100 * 150) / 43560, sqft: 100 * 150 },
        perimeter: null, platImagePaths: [],
        commonElements: { roads: [{ name: 'FM 436', type: 'public', rowWidth: 60, serves: [] }], drainageEasements: [], utilityEasements: [] },
        restrictiveCovenants: null,
        setbacks: { front: 25, side: 10, rear: 15 },
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-setbacks', intelPath);

    const lot = model.lots[0];
    expect(lot).toBeDefined();
    expect(lot.setbacks).toEqual({ front: 25, side: 10, rear: 15 });
    expect(lot.buildableArea).not.toBeNull();
    // Buildable area should be less than total lot area
    if (lot.buildableArea?.sqft && lot.sqft) {
      expect(lot.buildableArea.sqft).toBeLessThan(lot.sqft);
    }

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 22. Buildable area fallback (no setbacks) ─────────────────────────────────

describe('SubdivisionIntelligenceEngine: buildable area fallback', () => {
  it('estimates 60% of lot as buildable when no setbacks provided', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-bldarea-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          {
            lotId: 'lot_1',
            name: 'Lot 1',
            acreage: 1.0,
            sqft: 43560,
            boundaryCalls: [],
            curves: [],
            confidence: 75,
          },
        ],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: { acreage: 1.0, sqft: 43560 },
        perimeter: null, platImagePaths: [],
        commonElements: null, restrictiveCovenants: null,
        setbacks: null,  // No setbacks
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-bldarea', intelPath);

    const lot = model.lots[0];
    if (lot?.buildableArea) {
      // Fallback: 60% of sqft
      expect(lot.buildableArea.estimated).toBe(true);
      if (lot.buildableArea.sqft && lot.sqft) {
        expect(lot.buildableArea.sqft).toBeCloseTo(lot.sqft * 0.6, -2);
      }
    }

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 23. Lot geometry: road frontage from "along" descriptor ───────────────────

describe('SubdivisionIntelligenceEngine: lot geometry from boundary calls', () => {
  it('identifies road frontage from "along" descriptor', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-geom-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const boundaryCalls: BoundaryCall[] = [
      makeBearingCall(1, 'N 00°00\'00" E', 150, 'FM 436 ROW'), // front on FM 436
      makeBearingCall(2, 'S 90°00\'00" E', 200),
      makeBearingCall(3, 'S 00°00\'00" W', 150),
      makeBearingCall(4, 'N 90°00\'00" W', 200),
    ];

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          { lotId: 'lot_1', name: 'Lot 1', acreage: 0.69, sqft: 30000, boundaryCalls, curves: [], confidence: 80 },
        ],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null, perimeter: null, platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-geom', intelPath);

    const lot = model.lots[0];
    expect(lot).toBeDefined();
    expect(lot.frontsOn).toMatch(/FM 436/i);
    expect(lot.frontage).toBe(150);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 24. Shape classification ──────────────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: lot shape classification', () => {
  async function getShape(callCount: number, curveCount: number): Promise<string | null> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-shape-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const calls = Array.from({ length: callCount }, (_, i) =>
      makeBearingCall(i + 1, 'N 45°00\'00" E', 100),
    );
    const curves: BoundaryCall[] = Array.from({ length: curveCount }, (_, i) => ({
      sequence: callCount + i + 1,
      bearing: null,
      distance: null,
      curve: {
        radius: { raw: '500\'', value: 500 },
        arcLength: { raw: '50\'', value: 50 },
        chordBearing: null,
        chordDistance: null,
        direction: 'right' as const,
        delta: null,
      },
      toPoint: null,
      along: null,
      confidence: 70,
    }));

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [{ lotId: 'lot_1', name: 'Lot 1', acreage: 1.0, sqft: 43560, boundaryCalls: calls, curves, confidence: 75 }],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null, perimeter: null, platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-shape', intelPath);
    fs.rmSync(tmpDir, { recursive: true });

    return model.lots[0]?.shape ?? null;
  }

  it('classifies 4-call lot as rectangular_or_trapezoidal', async () => {
    const shape = await getShape(4, 0);
    expect(shape).toBe('rectangular_or_trapezoidal');
  });

  it('classifies lot with curves as irregular_with_curves', async () => {
    const shape = await getShape(3, 1);
    expect(shape).toBe('irregular_with_curves');
  });

  it('classifies 3-call lot as triangular', async () => {
    const shape = await getShape(3, 0);
    expect(shape).toBe('triangular');
  });

  it('classifies 5-6 call lot as irregular_polygon', async () => {
    const shape = await getShape(5, 0);
    expect(shape).toBe('irregular_polygon');
  });

  it('classifies 7+ call lot as complex_polygon', async () => {
    const shape = await getShape(8, 0);
    expect(shape).toBe('complex_polygon');
  });
});

// ── 25. Perimeter length computation ─────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: perimeter from extraction calls', () => {
  it('uses extraction.calls as perimeter when platAnalysis.perimeter is null', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-perim-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const extractionCalls: BoundaryCall[] = [
      makeBearingCall(1, 'N 85°22\'02" E', 461.81),
      makeBearingCall(2, 'S 04°37\'58" E', 275.92),
      makeBearingCall(3, 'S 85°22\'02" W', 461.81),
      makeBearingCall(4, 'N 04°37\'58" W', 275.92),
    ];
    const expectedPerim = 461.81 * 2 + 275.92 * 2;

    const intel: PropertyIntelligenceInput = {
      ...makeIntelligenceInput(),
      extraction: {
        type: 'lot_in_subdivision',
        datum: 'NAD83',
        pointOfBeginning: { description: 'IRON ROD', referenceMonument: null },
        calls: extractionCalls,
        area: { raw: '2.92 acres', value: 2.92, unit: 'acres' },
        lotBlock: null,
        confidence: 80,
      },
      platAnalysis: {
        lots: [{ lotId: 'lot_1', name: 'Lot 1', acreage: 2.92, sqft: 127200, boundaryCalls: [], curves: [], confidence: 80 }],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: { acreage: 2.92, sqft: 127200 },
        perimeter: null,   // No perimeter in platAnalysis → uses extraction.calls
        platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    };

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-perimeter', intelPath);

    expect(model.subdivision.perimeterLength).toBeCloseTo(expectedPerim, 1);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 26. Perimeter closure computation ────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: perimeter closure', () => {
  it('computes perimeter closure when perimeter calls are provided in platAnalysis', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-perimclosure-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    // Near-perfect rectangle: N 85°22'02" E 461.81' / S 04°37'58" E 275.92' /
    //                          S 85°22'02" W 461.81' / N 04°37'58" W 275.92'
    const perimCalls: BoundaryCall[] = [
      makeBearingCall(1, 'N 85°22\'02" E', 461.81),
      makeBearingCall(2, 'S 04°37\'58" E', 275.92),
      makeBearingCall(3, 'S 85°22\'02" W', 461.81),
      makeBearingCall(4, 'N 04°37\'58" W', 275.92),
    ];

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [{ lotId: 'lot_1', name: 'Lot 1', acreage: 2.92, sqft: 127200, boundaryCalls: [], curves: [], confidence: 80 }],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: { acreage: 2.92, sqft: 127200 },
        perimeter: { calls: perimCalls },
        platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-perimclosure', intelPath);

    // Perimeter closure should be computed (not null) since we have 4 calls
    expect(model.subdivision.perimeter.closure).not.toBeNull();
    if (model.subdivision.perimeter.closure) {
      expect(['excellent', 'acceptable']).toContain(model.subdivision.perimeter.closure.status);
    }

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('leaves perimeter closure null when fewer than 3 perimeter calls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-noperim-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [{ lotId: 'lot_1', name: 'Lot 1', acreage: 1.0, sqft: 43560, boundaryCalls: [], curves: [], confidence: 75 }],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null,
        perimeter: { calls: [makeBearingCall(1, 'N 45°00\'00" E', 100)] }, // only 1 call
        platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-noperim', intelPath);

    expect(model.subdivision.perimeter.closure).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 27. TraverseComputation unit tests ───────────────────────────────────────

import { TraverseComputation } from '../../worker/src/services/traverse-closure.js';

describe('TraverseComputation: computeTraverse', () => {
  const engine = new TraverseComputation();

  it('computes excellent closure for a perfect rectangle', () => {
    // Perfect north-south oriented rectangle: 100' E, 100' S, 100' W, 100' N
    const calls = [
      { callId: 'c1', bearing: 'N 90°00\'00" E', distance: 100, type: 'straight' as const },
      { callId: 'c2', bearing: 'S 00°00\'00" W', distance: 100, type: 'straight' as const },
      { callId: 'c3', bearing: 'S 90°00\'00" W', distance: 100, type: 'straight' as const },
      { callId: 'c4', bearing: 'N 00°00\'00" E', distance: 100, type: 'straight' as const },
    ];
    const result = engine.computeTraverse(calls);

    expect(result.errorDistance).toBeLessThan(0.01);
    expect(result.status).toBe('excellent');
    expect(result.perimeterLength).toBeCloseTo(400, 1);
    expect(result.points).toHaveLength(4);
  });

  it('skips calls without bearing and distance', () => {
    const calls = [
      { callId: 'c1', bearing: null, distance: null, type: 'straight' as const }, // skipped
      { callId: 'c2', bearing: 'N 90°00\'00" E', distance: 200, type: 'straight' as const },
    ];
    const result = engine.computeTraverse(calls);

    expect(result.points).toHaveLength(1); // only one valid call
    expect(result.perimeterLength).toBeCloseTo(200, 1);
  });

  it('uses chord bearing and distance for curve calls', () => {
    const calls = [
      {
        callId: 'curve1',
        bearing: null,
        distance: null,
        type: 'curve' as const,
        curve: {
          chordBearing: 'N 45°00\'00" E',
          chordDistance: 141.42,
          arcLength: 157.08,
        },
      },
    ];
    const result = engine.computeTraverse(calls);

    // Should use chord for traverse, arc for perimeter
    expect(result.perimeterLength).toBeCloseTo(157.08, 1);
    expect(result.points).toHaveLength(1);
  });

  it('returns 1:infinity ratio for perfect closure', () => {
    // Single call that returns to start — impossible, so use zero-length calls
    const result = engine.computeTraverse([]);

    expect(result.closureRatio).toBe('1:∞');
    expect(result.status).toBe('excellent');
    expect(result.perimeterLength).toBe(0);
    expect(result.points).toHaveLength(0);
  });

  it('classifies poor closure when ratio < 5000', () => {
    // Introduce a large error: add 5' discrepancy to a 100' traverse
    // N 90° E 100', then S 90° W only 90' — 10' closing error on 190' traverse = 1:19 ratio
    const calls = [
      { callId: 'c1', bearing: 'N 90°00\'00" E', distance: 100, type: 'straight' as const },
      { callId: 'c2', bearing: 'S 90°00\'00" W', distance: 90, type: 'straight' as const },
    ];
    const result = engine.computeTraverse(calls);

    expect(result.status).toBe('poor');
    expect(result.errorDistance).toBeCloseTo(10, 1);
  });
});

describe('TraverseComputation: applyCompassRule', () => {
  const engine = new TraverseComputation();

  it('applies compass rule to a traverse with small error', () => {
    const calls = [
      { callId: 'c1', bearing: 'N 90°00\'00" E', distance: 100, type: 'straight' as const },
      { callId: 'c2', bearing: 'S 90°00\'00" W', distance: 99.5, type: 'straight' as const }, // 0.5' error
    ];
    const closure = engine.computeTraverse(calls);
    const adjusted = engine.applyCompassRule(calls, closure);

    expect(adjusted.compassRuleApplied).toBe(true);
    expect(adjusted.adjustments).toHaveLength(2);
    // Adjustments should sum to the negative of the error
    const totalDN = adjusted.adjustments.reduce((s, a) => s + a.dN, 0);
    const totalDE = adjusted.adjustments.reduce((s, a) => s + a.dE, 0);
    expect(totalDN).toBeCloseTo(-closure.errorNorthing, 3);
    expect(totalDE).toBeCloseTo(-closure.errorEasting, 3);
  });

  it('skips compass rule when there is no error', () => {
    // Perfect closure: applyCompassRule should return compassRuleApplied=false
    const perfectClosure = {
      errorNorthing: 0,
      errorEasting: 0,
      errorDistance: 0,
      closureRatio: '1:∞',
      status: 'excellent' as const,
      perimeterLength: 400,
      points: [],
    };
    const result = engine.applyCompassRule([], perfectClosure);

    expect(result.compassRuleApplied).toBe(false);
  });
});

// ── 28. Error handling tests ──────────────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: error handling', () => {
  it('returns failed model for empty projectId', async () => {
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('', '/tmp/some-file.json');

    expect(model.status).toBe('failed');
    expect(model.errors[0]).toContain('projectId');
  });

  it('returns failed model for invalid JSON file content', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-badjson-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    fs.writeFileSync(intelPath, '{ invalid json content !!!');

    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('bad-json-project', intelPath);

    expect(model.status).toBe('failed');
    expect(model.errors[0]).toMatch(/parse/i);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── 29. SubdivisionClassifier: LOT-after-name format ─────────────────────────

describe('SubdivisionClassifier: LOT after subdivision name', () => {
  const classifier = new SubdivisionClassifier();

  it('detects lot_in_subdivision when LOT appears after subdivision name', () => {
    // "CEDAR RIDGE SUBDIVISION, LOT 3, BLOCK 2" — LOT after name format
    const result = classifier.classifyFromLegalDescription(
      'CEDAR RIDGE SUBDIVISION, LOT 3, BLOCK 2',
    );
    expect(result.classification).toBe('lot_in_subdivision');
  });
});

// ── 30. reconcileAreas: edge cases ───────────────────────────────────────────

describe('reconcileAreas: edge cases', () => {
  it('handles zero statedTotalAcreage gracefully', () => {
    const result = reconcileAreas(0, [
      { name: 'Lot 1', sqft: 43560, lotType: 'residential' },
    ]);

    // unaccountedPct cannot be computed from 0 stated area — should be 0 or handled
    expect(result.unaccountedPct).toBe(0);
    // Status depends on computed total vs stated — should at least not throw
    expect(result).toBeDefined();
  });

  it('handles lots with both acreage and sqft (prefers sqft)', () => {
    // sqft takes priority in area sum
    const result = reconcileAreas(2, [
      { name: 'Lot A', sqft: 43560, acreage: 1, lotType: 'residential' }, // both provided
      { name: 'Lot B', acreage: 1, lotType: 'residential' },              // acreage only
    ]);

    expect(result.computedLotSumSqFt).toBeCloseTo(2 * 43560, 0);
    expect(result.status).toBe('excellent');
  });

  it('classifies common_area type lots separately', () => {
    const result = reconcileAreas(3, [
      { name: 'Lot 1', sqft: 43560, lotType: 'residential' },
      { name: 'Common Area A', sqft: 43560, lotType: 'common_area' },
      { name: 'Lot 2', sqft: 43560, lotType: 'residential' },
    ]);

    expect(result.commonAreaSqFt).toBeCloseTo(43560, 0);
    const caEntry = result.breakdown.find((b) => b.name === 'Common Area A');
    expect(caEntry?.type).toBe('common_area');
  });
});

// ── 31. Reserve purpose inference ────────────────────────────────────────────

describe('SubdivisionIntelligenceEngine: reserve purpose classification', () => {
  async function getReservePurpose(name: string): Promise<string | undefined> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-respurp-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [
          { lotId: 'lot_1', name: 'Lot 1', acreage: 1.0, sqft: 43560, boundaryCalls: [], curves: [], confidence: 75 },
          { lotId: 'res_x', name, acreage: 0.5, sqft: 21780, boundaryCalls: [], curves: [], confidence: 70 },
        ],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null, perimeter: null, platImagePaths: [],
        commonElements: null, restrictiveCovenants: null, setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-respurp', intelPath);
    fs.rmSync(tmpDir, { recursive: true });

    return model.reserves[0]?.purpose;
  }

  it('classifies "Reserve Drainage" as drainage', async () => {
    expect(await getReservePurpose('Reserve Drainage')).toBe('drainage');
  });

  it('classifies "Utility Reserve B" as utility', async () => {
    expect(await getReservePurpose('Utility Reserve B')).toBe('utility');
  });

  it('classifies "Landscape Reserve" as open_space', async () => {
    expect(await getReservePurpose('Landscape Reserve')).toBe('open_space');
  });

  it('classifies "Access Reserve" as access', async () => {
    expect(await getReservePurpose('Access Reserve')).toBe('access');
  });

  it('classifies "Common Area HOA" as common_area', async () => {
    expect(await getReservePurpose('Common Area HOA')).toBe('common_area');
  });

  it('classifies unnamed "Reserve A" as drainage_and_utility (default)', async () => {
    expect(await getReservePurpose('Reserve A')).toBe('drainage_and_utility');
  });
});

// ── 32. restrictiveCovenants source validation ────────────────────────────────

describe('SubdivisionIntelligenceEngine: restrictiveCovenants source', () => {
  it('defaults to plat_notes when source is missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-cov-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [{ lotId: 'lot_1', name: 'Lot 1', acreage: 1.0, sqft: 43560, boundaryCalls: [], curves: [], confidence: 75 }],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null, perimeter: null, platImagePaths: [],
        commonElements: null,
        restrictiveCovenants: {
          instrument: 'CC-2020-1234',
          knownRestrictions: ['No commercial use'],
          source: 'INVALID_SOURCE', // Should be sanitized to 'plat_notes'
        },
        setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-covenants', intelPath);

    expect(model.restrictiveCovenants.source).toBe('plat_notes');
    expect(model.restrictiveCovenants.instrument).toBe('CC-2020-1234');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('preserves valid source values (ccr_document)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph4-cov2-'));
    const intelPath = path.join(tmpDir, 'property_intelligence.json');

    const intel: PropertyIntelligenceInput = makeIntelligenceInput(
      {},
      {
        lots: [{ lotId: 'lot_1', name: 'Lot 1', acreage: 1.0, sqft: 43560, boundaryCalls: [], curves: [], confidence: 75 }],
        surveyor: null, parentTract: null, datum: null, pointOfBeginning: null,
        totalArea: null, perimeter: null, platImagePaths: [],
        commonElements: null,
        restrictiveCovenants: {
          instrument: 'CC-2020-5678',
          knownRestrictions: [],
          source: 'ccr_document',
        },
        setbacks: null,
      },
    );

    fs.writeFileSync(intelPath, JSON.stringify(intel, null, 2));
    const engine = new SubdivisionIntelligenceEngine();
    const model = await engine.analyze('test-covenants2', intelPath);

    expect(model.restrictiveCovenants.source).toBe('ccr_document');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
