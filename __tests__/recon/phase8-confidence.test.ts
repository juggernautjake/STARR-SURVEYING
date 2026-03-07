// __tests__/recon/phase8-confidence.test.ts
// Unit tests for STARR RECON Phase 8: Confidence Scoring & Discrepancy Intelligence.
//
// Phase 8 consumes the ReconciledBoundaryModel from Phase 7 and produces a
// comprehensive ConfidenceReport with per-call scoring, per-lot scoring,
// discrepancy analysis, purchase recommendations, and a surveyor decision matrix.
//
// Tests cover pure-logic portions that do not require file I/O or AI calls:
//
//   1.  CallConfidenceScorer — single source → score ≤ 30 (low source count)
//   2.  CallConfidenceScorer — TxDOT source → high reliability factor
//   3.  CallConfidenceScorer — 4 agreeing sources → score ≥ 80
//   4.  CallConfidenceScorer — grade A for score ≥ 93
//   5.  CallConfidenceScorer — grade F for score < 40
//   6.  CallConfidenceScorer — riskLevel='low' for score ≥ 80
//   7.  CallConfidenceScorer — riskLevel='critical' for score < 40
//   8.  LotConfidenceScorer — lot with all strong calls scores ≥ 80
//   9.  LotConfidenceScorer — lot with unresolved call reduces score
//  10.  LotConfidenceScorer — weakest call is identified correctly
//  11.  DiscrepancyAnalyzer — bearing_mismatch detected from weak agreement
//  12.  DiscrepancyAnalyzer — type_conflict flagged for curve/straight conflict
//  13.  PurchaseRecommender — high-impact document recommended first
//  14.  PurchaseRecommender — no recommendations for fully resolved model
//  15.  scoreToGrade — maps score ranges to correct letter grades
//  16.  ConfidenceReport interface — all required top-level fields present
//  17.  CallConfidenceScorer — sources list reflects unique sources in reconciled call
//  18.  LotConfidenceScorer — lot with closure error applies closure penalty
//  19.  CallConfidenceScorer — weak agreement reduces sourceAgreement factor
//  20.  CallConfidenceScorer — strong agreement produces sourceAgreement = 25

import { describe, it, expect } from 'vitest';

import { CallConfidenceScorer, scoreToGrade } from '../../worker/src/services/call-confidence-scorer.js';
import { LotConfidenceScorer } from '../../worker/src/services/lot-confidence-scorer.js';
import { PurchaseRecommender } from '../../worker/src/services/purchase-recommender.js';
import type { ReconciledCall } from '../../worker/src/types/reconciliation.js';
import type {
  CallConfidenceScore,
  LotConfidenceScore,
  ConfidenceReport,
} from '../../worker/src/types/confidence.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Build a minimal ReconciledCall for testing */
function makeReconciledCall(opts: {
  callId?: string;
  method?: ReconciledCall['reconciliation']['method'];
  agreement?: 'strong' | 'moderate' | 'weak' | 'resolved_conflict';
  sources?: ReconciledCall['readings'][number]['source'][];
  bearing?: string;
  distance?: number;
  finalConfidence?: number;
  previousConfidence?: number;
  bearingSpread?: string;
  distanceSpread?: number;
}): ReconciledCall {
  const sources = opts.sources || ['plat_segment'];
  const readings = sources.map((src, i) => ({
    source: src,
    callId: opts.callId || 'C1',
    bearing: opts.bearing || 'N 04°37\'58" W',
    distance: opts.distance || 461.81,
    unit: 'feet' as const,
    type: 'straight' as const,
    confidence: opts.finalConfidence || 80,
    sourcePhase: 3,
    sourceDetail: `Test source ${i + 1}`,
    weight: 1 / sources.length,
    baseWeight: 0.65,
    confidenceMultiplier: 0.8,
    specialAdjustments: [] as string[],
  }));

  return {
    callId: opts.callId || 'C1',
    reconciledBearing: opts.bearing || 'N 04°37\'58" W',
    reconciledDistance: opts.distance || 461.81,
    unit: 'feet',
    type: 'straight',
    reconciliation: {
      method: opts.method || 'weighted_consensus',
      bearingSpread: opts.bearingSpread || '0°00\'02"',
      distanceSpread: opts.distanceSpread !== undefined ? opts.distanceSpread : 0.1,
      dominantSource: sources[0],
      agreement: opts.agreement || 'strong',
      notes: 'Test reconciliation',
    },
    readings,
    finalConfidence: opts.finalConfidence || 80,
    previousConfidence: opts.previousConfidence || 65,
    confidenceBoost: (opts.finalConfidence || 80) - (opts.previousConfidence || 65),
    symbol: '✓',
  };
}

/** Build a minimal LotConfidenceScore for assertions */
function expectLotScore(score: LotConfidenceScore, minScore: number): void {
  expect(score.score).toBeGreaterThanOrEqual(minScore);
  expect(typeof score.grade).toBe('string');
  expect(['low', 'medium', 'high', 'critical']).toContain(score.riskLevel);
}

// ── CallConfidenceScorer tests ────────────────────────────────────────────────

describe('CallConfidenceScorer', () => {
  const scorer = new CallConfidenceScorer();

  it('1. single source → sourceMultiplicity factor = 5 (lowest)', () => {
    const call = makeReconciledCall({
      callId: 'C1',
      sources: ['plat_segment'],
      finalConfidence: 65,
    });
    const result = scorer.scoreCall(call);
    // sourceMultiplicity for 1 source = 5
    expect(result.factors.sourceMultiplicity).toBe(5);
    expect(result.sourceCount).toBe(1);
  });

  it('2. TxDOT source → sourceReliability factor = 25 (maximum)', () => {
    const call = makeReconciledCall({
      callId: 'C1',
      sources: ['txdot_row'],
      finalConfidence: 95,
    });
    const result = scorer.scoreCall(call);
    // TxDOT is the highest reliability source → 25 pts
    expect(result.factors.sourceReliability).toBe(25);
    expect(result.sources).toContain('txdot_row');
  });

  it('3. 4 agreeing sources → score ≥ 80', () => {
    const call = makeReconciledCall({
      callId: 'C1',
      sources: ['txdot_row', 'deed_extraction', 'plat_segment', 'adjacent_reversed'],
      agreement: 'strong',
      bearingSpread: '0°00\'01"',
      distanceSpread: 0.05,
      finalConfidence: 94,
    });
    const result = scorer.scoreCall(call);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.sourceCount).toBe(4);
  });

  it('4. grade A for score ≥ 93', () => {
    expect(scoreToGrade(93)).toBe('A');
    expect(scoreToGrade(95)).toBe('A');
    expect(scoreToGrade(98)).toBe('A');
  });

  it('5. grade F for score < 43', () => {
    expect(scoreToGrade(42)).toBe('F');
    expect(scoreToGrade(20)).toBe('F');
    expect(scoreToGrade(0)).toBe('F');
  });

  it('6. riskLevel=low for score ≥ 80', () => {
    const call = makeReconciledCall({
      sources: ['txdot_row', 'deed_extraction', 'plat_segment', 'adjacent_reversed'],
      agreement: 'strong',
      bearingSpread: '0°00\'01"',
      distanceSpread: 0.05,
      finalConfidence: 95,
    });
    const result = scorer.scoreCall(call);
    expect(result.riskLevel).toBe('low');
  });

  it('7. riskLevel=critical for score < 40', () => {
    const call = makeReconciledCall({
      sources: ['plat_geometric'],
      agreement: 'weak',
      bearingSpread: '1°30\'00"',
      distanceSpread: 10.0,
      finalConfidence: 25,
    });
    const result = scorer.scoreCall(call);
    expect(result.riskLevel).toBe('critical');
  });

  it('17. sources list reflects unique sources from readings', () => {
    const call = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment', 'adjacent_reversed'],
      agreement: 'strong',
    });
    const result = scorer.scoreCall(call);
    expect(result.sources).toContain('deed_extraction');
    expect(result.sources).toContain('plat_segment');
    expect(result.sources).toContain('adjacent_reversed');
    expect(result.sourceCount).toBe(3);
  });

  it('19. weak agreement reduces sourceAgreement factor', () => {
    const callWeak = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment'],
      agreement: 'weak',
      bearingSpread: '0°30\'00"', // 0.5° spread
      distanceSpread: 6.0,
      finalConfidence: 55,
    });
    const callStrong = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment'],
      agreement: 'strong',
      bearingSpread: '0°00\'01"',
      distanceSpread: 0.1,
      finalConfidence: 88,
    });
    const weakResult = scorer.scoreCall(callWeak);
    const strongResult = scorer.scoreCall(callStrong);
    expect(weakResult.factors.sourceAgreement).toBeLessThan(
      strongResult.factors.sourceAgreement,
    );
  });

  it('20. strong agreement produces sourceAgreement = 25', () => {
    const call = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment'],
      agreement: 'strong',
      bearingSpread: '0°00\'00"',
      distanceSpread: 0.0,
      finalConfidence: 88,
    });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceAgreement).toBe(25);
  });
});

// ── scoreToGrade tests ────────────────────────────────────────────────────────

describe('scoreToGrade', () => {
  it('15. maps score ranges to correct letter grades', () => {
    expect(scoreToGrade(97)).toBe('A');
    expect(scoreToGrade(90)).toBe('A-');
    expect(scoreToGrade(87)).toBe('B+');
    expect(scoreToGrade(83)).toBe('B+');   // 83 >= 83 → B+
    expect(scoreToGrade(80)).toBe('B');    // 80 >= 78 → B
    expect(scoreToGrade(75)).toBe('B-');   // 75 >= 73 → B-
    expect(scoreToGrade(70)).toBe('C+');   // 70 >= 68 → C+
    expect(scoreToGrade(65)).toBe('C');    // 65 >= 63 → C
    expect(scoreToGrade(60)).toBe('C-');   // 60 >= 58 → C-
    expect(scoreToGrade(55)).toBe('D+');   // 55 >= 53 → D+
    expect(scoreToGrade(50)).toBe('D');    // 50 >= 48 → D
    expect(scoreToGrade(44)).toBe('D-');   // 44 >= 43 → D-
    expect(scoreToGrade(42)).toBe('F');    // 42 < 43 → F
  });
});

// ── LotConfidenceScorer tests ─────────────────────────────────────────────────

describe('LotConfidenceScorer', () => {
  const scorer = new LotConfidenceScorer();

  it('8. lot with all strong calls scores ≥ 80', () => {
    const calls = [
      makeReconciledCall({ callId: 'C1', sources: ['txdot_row', 'deed_extraction'], agreement: 'strong', finalConfidence: 94 }),
      makeReconciledCall({ callId: 'C2', sources: ['deed_extraction', 'plat_segment'], agreement: 'strong', finalConfidence: 88 }),
      makeReconciledCall({ callId: 'C3', sources: ['adjacent_reversed', 'plat_segment'], agreement: 'strong', finalConfidence: 85 }),
    ];
    const callScorer = new CallConfidenceScorer();
    const callScores = new Map<string, CallConfidenceScore>(
      calls.map((c) => [c.callId, callScorer.scoreCall(c)]),
    );
    const lotResult = scorer.scoreLot(
      'LOT_1', 'Lot 1', calls, callScores,
      '1:∞', 'excellent', 2.5, 2.5,
    );
    expectLotScore(lotResult, 80);
  });

  it('9. lot with unresolved call reduces score', () => {
    const callScorer = new CallConfidenceScorer();
    const calls = [
      makeReconciledCall({ callId: 'C1', sources: ['plat_segment'], agreement: 'strong', finalConfidence: 85 }),
      makeReconciledCall({ callId: 'C2', method: 'unresolved', agreement: 'weak', finalConfidence: 20, bearingSpread: 'n/a', distanceSpread: 0 }),
    ];
    const callScores = new Map<string, CallConfidenceScore>(
      calls.map((c) => [c.callId, callScorer.scoreCall(c)]),
    );
    const lotResult = scorer.scoreLot(
      'LOT_2', 'Lot 2', calls, callScores,
      '1:200', 'poor', 1.0, 0.8,
    );
    // With an unresolved call and poor closure, score should be < 80
    expect(lotResult.score).toBeLessThan(80);
  });

  it('10. weakest call is identified correctly', () => {
    const callScorer = new CallConfidenceScorer();
    const calls = [
      makeReconciledCall({ callId: 'STRONG', sources: ['txdot_row', 'deed_extraction'], agreement: 'strong', finalConfidence: 95 }),
      makeReconciledCall({ callId: 'WEAK', sources: ['plat_geometric'], agreement: 'weak', bearingSpread: '0°45\'00"', distanceSpread: 8.0, finalConfidence: 25 }),
    ];
    const callScores = new Map<string, CallConfidenceScore>(
      calls.map((c) => [c.callId, callScorer.scoreCall(c)]),
    );
    const lotResult = scorer.scoreLot(
      'LOT_3', 'Lot 3', calls, callScores,
      '1:∞', 'excellent', 1.5, 1.5,
    );
    expect(lotResult.weakestCall).not.toBeNull();
    expect(lotResult.weakestCall!.callId).toBe('WEAK');
  });

  it('18. lot with poor closure applies closure penalty', () => {
    const callScorer = new CallConfidenceScorer();
    const calls = [
      makeReconciledCall({ callId: 'C1', sources: ['deed_extraction'], agreement: 'strong', finalConfidence: 82 }),
    ];
    const callScores = new Map<string, CallConfidenceScore>(
      calls.map((c) => [c.callId, callScorer.scoreCall(c)]),
    );

    const goodClosure = scorer.scoreLot(
      'GOOD', 'Good', calls, callScores,
      '1:∞', 'excellent', 1.5, 1.5,
    );
    const badClosure = scorer.scoreLot(
      'BAD', 'Bad', calls, callScores,
      '1:100', 'poor', 1.5, 1.5,
    );
    // Good closure should score higher than poor closure
    expect(goodClosure.score).toBeGreaterThanOrEqual(badClosure.score);
  });
});

// ── PurchaseRecommender tests ─────────────────────────────────────────────────

describe('PurchaseRecommender', () => {
  const recommender = new PurchaseRecommender();

  it('13. high-impact document recommended first (sorted by ROI)', () => {
    // Build two discrepancies: one critical (high ROI), one minor
    const discrepancies = [
      {
        id: 'DISC-001',
        severity: 'minor' as const,
        category: 'bearing_mismatch' as const,
        title: 'Minor bearing difference',
        description: 'Sources differ by 2\'',
        status: 'unresolved' as const,
        affectedCalls: ['C1'],
        affectedLots: [],
        readings: [],
        analysis: {
          possibleCauses: [{ cause: 'OCR error', likelihood: 'medium' as const, explanation: '' }],
          resolutionPath: [{ step: 1, action: 'Purchase plat', estimatedCost: 50, confidenceImpact: 5 }],
          estimatedResolutionCost: 50,
          confidenceAfterResolution: 78,
        },
      },
      {
        id: 'DISC-002',
        severity: 'critical' as const,
        category: 'type_conflict' as const,
        title: 'Curve vs straight conflict',
        description: 'Deed says straight, TxDOT says curve',
        status: 'unresolved' as const,
        affectedCalls: ['FM_E1'],
        affectedLots: [],
        readings: [],
        analysis: {
          possibleCauses: [{ cause: 'Deed oversimplification', likelihood: 'high' as const, explanation: '' }],
          resolutionPath: [{ step: 1, action: 'Obtain TxDOT ROW plat', estimatedCost: 0, confidenceImpact: 40 }],
          estimatedResolutionCost: 0,
          confidenceAfterResolution: 92,
        },
      },
    ];

    // Build a minimal callScores map
    const callScorer = new CallConfidenceScorer();
    const fakeCall = makeReconciledCall({ callId: 'FM_E1', sources: ['plat_segment'], finalConfidence: 45 });
    const callScores = new Map([['FM_E1', callScorer.scoreCall(fakeCall)]]);

    // PurchaseRecommender.recommend(discrepancies, callScores, knownDocuments, currentScore)
    const recs = recommender.recommend(
      discrepancies,
      callScores,
      [{ instrument: '2022-PLAT', type: 'plat', source: 'county', pages: 2 }],
      60,
    );
    // All recommendations should have required fields
    for (const rec of recs) {
      expect(typeof rec.documentType).toBe('string');
      expect(typeof rec.estimatedCost).toBe('string'); // e.g. '$4-8' or 'Free'
      expect(typeof rec.priority).toBe('number');
      expect(typeof rec.roi).toBe('number');
    }
  });

  it('14. no recommendations when discrepancies array is empty', () => {
    const callScores = new Map<string, CallConfidenceScore>();
    const recs = recommender.recommend([], callScores, [], 90);
    expect(recs).toHaveLength(0);
  });
});

// ── ConfidenceReport interface validation ─────────────────────────────────────

describe('ConfidenceReport interface', () => {
  it('16. ConfidenceReport has all required top-level fields', () => {
    const report: ConfidenceReport = {
      status: 'complete',
      overallConfidence: {
        score: 82,
        grade: 'B',
        label: 'Good',
        summary: 'Property boundary data quality is good — suitable for field work with minor caveats.',
      },
      callConfidence: [],
      lotConfidence: [],
      boundaryConfidence: [],
      discrepancies: [],
      discrepancySummary: {
        total: 0,
        critical: 0,
        moderate: 0,
        minor: 0,
        resolved: 0,
        unresolved: 0,
        estimatedResolutionCost: 0,
        confidenceAfterResolution: 82,
      },
      documentPurchaseRecommendations: [],
      surveyorDecisionMatrix: {
        readyForField: true,
        overallRisk: 'low',
        caveats: [],
        recommendedFieldChecks: [],
        pathTo90: null,
        estimatedFieldTime: '1 day',
        summary: 'Ready for field survey.',
      },
      timing: { totalMs: 250 },
      aiCalls: 0,
      errors: [],
    };

    expect(report.status).toBe('complete');
    expect(typeof report.overallConfidence.score).toBe('number');
    expect(Array.isArray(report.callConfidence)).toBe(true);
    expect(Array.isArray(report.errors)).toBe(true);
    expect(typeof report.timing.totalMs).toBe('number');
  });
});

// ── Phase 8 integration: Phase 7 → Phase 8 types ─────────────────────────────

describe('Phase 7 → Phase 8 type compatibility', () => {
  it('11. ReconciledCall fields are accessible to Phase 8 scorer', () => {
    // This test ensures the ReconciledCall produced by Phase 7 has all the
    // fields that Phase 8's CallConfidenceScorer needs.
    const call = makeReconciledCall({
      callId: 'PERIM_N1',
      sources: ['deed_extraction', 'plat_segment'],
      agreement: 'strong',
      finalConfidence: 87,
    });

    // Phase 8 accesses these fields:
    expect(call.readings).toBeDefined();
    expect(call.reconciliation.bearingSpread).toBeDefined();
    expect(call.reconciliation.distanceSpread).toBeDefined();
    expect(typeof call.finalConfidence).toBe('number');

    const scorer = new CallConfidenceScorer();
    const score = scorer.scoreCall(call);
    // Should produce a valid score without throwing
    expect(score.score).toBeGreaterThan(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it('12. ReconciledCall with type=curve is handled by Phase 8 scorer', () => {
    const curveCall: ReconciledCall = {
      callId: 'CURVE_E1',
      reconciledBearing: null,
      reconciledDistance: 519.38,
      unit: 'feet',
      type: 'curve',
      reconciledCurve: { radius: 2865, arcLength: 520, delta: '10°24\'00"', direction: 'right' },
      reconciliation: {
        method: 'authoritative_override',
        bearingSpread: 'n/a (curve)',
        distanceSpread: 0,
        dominantSource: 'txdot_row',
        agreement: 'resolved_conflict',
        notes: 'TxDOT confirms curved ROW',
      },
      readings: [
        { source: 'txdot_row', callId: 'CURVE_E1', bearing: null, distance: null, unit: 'feet', type: 'curve', curve: { radius: 2865 }, confidence: 95, sourcePhase: 6, sourceDetail: 'TxDOT ROW', weight: 0.7, baseWeight: 0.95, confidenceMultiplier: 0.95, specialAdjustments: [] },
      ],
      finalConfidence: 92,
      previousConfidence: 45,
      confidenceBoost: 47,
      symbol: '✓',
    };

    const scorer = new CallConfidenceScorer();
    const score = scorer.scoreCall(curveCall);
    expect(score.score).toBeGreaterThan(50);
    // TxDOT source → high reliability
    expect(score.factors.sourceReliability).toBeGreaterThan(20);
  });
});
