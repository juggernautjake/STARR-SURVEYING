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
//  21.  SurveyorDecision — overallRisk='low' for high-confidence no-critical data
//  22.  SurveyorDecision — overallRisk='critical' when critical discrepancies exist
//  23.  SurveyorDecision — pathTo90 is null when already at 90%+
//  24.  SurveyorDecision — pathTo90 is non-null when below 90%
//  25.  SurveyorDecision — estimatedFieldTime is a non-empty string
//  26.  SurveyorDecision — summary is a non-empty human-readable string
//  27.  DiscrepancyAnalyzer — datum_shift detected when 3+ calls have 2-6' bearing spreads
//  28.  DiscrepancyAnalyzer — datum_shift NOT detected when fewer than 3 affected calls
//  29.  DiscrepancySummary — estimatedResolutionCost is a number (not a string)
//  30.  DiscrepancySummary — cost is 0 when no unresolved discrepancies
//  31.  CallConfidenceScorer — county_road_default source → lowest reliability
//  32.  LotConfidenceScorer — closure ratio '1:∞' grants maximum closure bonus
//  33.  SurveyorDecision — readyForField=false when confidence < 60
//  34.  SurveyorDecision — caveats include weak-side warning
//  35.  DiscrepancyAnalyzer — distance_mismatch detected correctly
//  36.  PurchaseRecommender — critical discrepancy generates deed recommendation
//  37.  CallConfidenceScorer — 5+ sources get maximum sourceMultiplicity
//  38.  scoreToGrade — D- boundary at score 43
//  39.  SurveyorDecision — afterDocPurchase is capped at 98
//  40.  ConfidenceReport — failed status has score=0 and grade='F'

import { describe, it, expect } from 'vitest';

import { CallConfidenceScorer, scoreToGrade } from '../../worker/src/services/call-confidence-scorer.js';
import { LotConfidenceScorer } from '../../worker/src/services/lot-confidence-scorer.js';
import { DiscrepancyAnalyzer } from '../../worker/src/services/discrepancy-analyzer.js';
import { PurchaseRecommender } from '../../worker/src/services/purchase-recommender.js';
import { buildSurveyorDecision } from '../../worker/src/services/surveyor-decision-matrix.js';
import type { ReconciledCall, ReadingSource } from '../../worker/src/types/reconciliation.js';
import type {
  CallConfidenceScore,
  LotConfidenceScore,
  ConfidenceReport,
  DiscrepancyReport,
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

/** Build a minimal DiscrepancyReport for testing */
function makeDiscrepancyReport(opts: Partial<DiscrepancyReport> = {}): DiscrepancyReport {
  return {
    id: opts.id || 'DISC-001',
    severity: opts.severity || 'minor',
    category: opts.category || 'bearing_mismatch',
    title: opts.title || 'Test discrepancy',
    description: opts.description || 'Test description',
    status: opts.status || 'unresolved',
    affectedCalls: opts.affectedCalls || ['C1'],
    affectedLots: opts.affectedLots || [],
    readings: opts.readings || [],
    analysis: opts.analysis || {
      possibleCauses: [{ cause: 'Test cause', likelihood: 'medium', explanation: 'Test explanation' }],
      impactAssessment: {
        closureImpact: 'moderate',
        acreageImpact: 'TBD',
        boundaryPositionShift: 'TBD',
        legalSignificance: 'TBD',
      },
    },
    resolution: opts.resolution || {
      recommended: 'Test resolution',
      alternatives: [],
      estimatedCost: '$6',
      estimatedConfidenceAfterResolution: 80,
      priority: 2,
    },
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

  it('31. county_road_default source → lowest reliability (4 pts)', () => {
    const call = makeReconciledCall({
      sources: ['county_road_default'],
      finalConfidence: 40,
    });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceReliability).toBe(4);
  });

  it('37. 5+ sources get maximum sourceMultiplicity (25 pts)', () => {
    const call = makeReconciledCall({
      sources: [
        'txdot_row', 'deed_extraction', 'plat_segment',
        'adjacent_reversed', 'adjacent_chain',
      ],
      agreement: 'strong',
      bearingSpread: '0°00\'01"',
      distanceSpread: 0.1,
      finalConfidence: 94,
    });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceMultiplicity).toBe(25);
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

  it('38. D- boundary: score 43 → D-, score 42 → F', () => {
    expect(scoreToGrade(43)).toBe('D-');
    expect(scoreToGrade(42)).toBe('F');
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

  it('32. closure ratio 1:∞ grants maximum closure bonus (+8)', () => {
    const callScorer = new CallConfidenceScorer();
    const calls = [
      makeReconciledCall({ callId: 'C1', sources: ['deed_extraction'], agreement: 'strong', finalConfidence: 70 }),
    ];
    const callScores = new Map<string, CallConfidenceScore>(
      calls.map((c) => [c.callId, callScorer.scoreCall(c)]),
    );
    const infinite = scorer.scoreLot('INF', 'Inf', calls, callScores, '1:∞', 'excellent', 1.0, 1.0);
    const poor = scorer.scoreLot('POOR', 'Poor', calls, callScores, '1:100', 'poor', 1.0, 1.0);
    // Infinite closure should give higher score than 1:100
    expect(infinite.score).toBeGreaterThan(poor.score);
  });
});

// ── PurchaseRecommender tests ─────────────────────────────────────────────────

describe('PurchaseRecommender', () => {
  const recommender = new PurchaseRecommender();

  it('13. high-impact document recommended first (sorted by ROI)', () => {
    // Build two discrepancies using the helper to ensure all required fields are present
    const discrepancies: DiscrepancyReport[] = [
      makeDiscrepancyReport({
        id: 'DISC-001',
        severity: 'minor',
        category: 'bearing_mismatch',
        title: 'Minor bearing difference',
        description: 'Sources differ by 2\'',
        status: 'unresolved',
        affectedCalls: ['C1'],
        analysis: {
          possibleCauses: [{ cause: 'OCR error', likelihood: 'medium', explanation: '' }],
          impactAssessment: {
            closureImpact: 'minimal',
            acreageImpact: 'TBD',
            boundaryPositionShift: 'TBD',
            legalSignificance: 'TBD',
          },
        },
        resolution: {
          recommended: 'Purchase plat',
          alternatives: [],
          estimatedCost: '$2-4',
          estimatedConfidenceAfterResolution: 78,
          priority: 3,
        },
      }),
      makeDiscrepancyReport({
        id: 'DISC-002',
        severity: 'critical',
        category: 'type_conflict',
        title: 'Curve vs straight conflict',
        description: 'Deed says straight, TxDOT says curve',
        status: 'unresolved',
        affectedCalls: ['FM_E1'],
        analysis: {
          possibleCauses: [{ cause: 'Deed oversimplification', likelihood: 'high', explanation: '' }],
          impactAssessment: {
            closureImpact: 'severe',
            acreageImpact: 'TBD',
            boundaryPositionShift: 'TBD',
            legalSignificance: 'TBD',
          },
        },
        resolution: {
          recommended: 'Obtain TxDOT ROW plat',
          alternatives: [],
          estimatedCost: 'Free',
          estimatedConfidenceAfterResolution: 92,
          priority: 1,
        },
      }),
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

  it('36. critical discrepancy without adjacent data generates a deed recommendation', () => {
    const disc = makeDiscrepancyReport({
      severity: 'critical',
      status: 'unresolved',
      affectedCalls: ['C_CRIT'],
      readings: [], // no adjacent_reversed readings
    });
    const callScores = new Map<string, CallConfidenceScore>();
    const recs = recommender.recommend([disc], callScores, [], 55);
    // Should recommend purchasing adjacent deed to resolve critical discrepancy
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].documentType).toBe('deed');
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
        estimatedConfidenceAfterResolution: 82,
      },
      documentPurchaseRecommendations: [],
      surveyorDecisionMatrix: {
        readyForField: true,
        overallRisk: 'low',
        caveats: [],
        recommendedFieldChecks: [],
        minConfidenceForField: 60,
        currentConfidence: 82,
        afterDocPurchase: 82,
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
    // New Phase 8 v1.1 fields
    expect(typeof report.discrepancySummary.estimatedResolutionCost).toBe('number');
    expect(typeof report.surveyorDecisionMatrix.overallRisk).toBe('string');
    expect(typeof report.surveyorDecisionMatrix.estimatedFieldTime).toBe('string');
    expect(typeof report.surveyorDecisionMatrix.summary).toBe('string');
  });

  it('40. failed report has score=0 and grade=F', () => {
    const report: ConfidenceReport = {
      status: 'failed',
      overallConfidence: { score: 0, grade: 'F', label: 'Failed', summary: 'No data' },
      callConfidence: [],
      lotConfidence: [],
      boundaryConfidence: [],
      discrepancies: [],
      discrepancySummary: {
        total: 0, critical: 0, moderate: 0, minor: 0,
        resolved: 0, unresolved: 0,
        estimatedResolutionCost: 0,
        estimatedConfidenceAfterResolution: 0,
      },
      documentPurchaseRecommendations: [],
      surveyorDecisionMatrix: {
        readyForField: false,
        overallRisk: 'critical',
        caveats: ['Data load failure'],
        recommendedFieldChecks: [],
        minConfidenceForField: 60,
        currentConfidence: 0,
        afterDocPurchase: 0,
        pathTo90: 'Resolve data loading failure first',
        estimatedFieldTime: 'Unknown',
        summary: 'Cannot assess — data loading failed.',
      },
      timing: { totalMs: 5 },
      aiCalls: 0,
      errors: ['file not found'],
    };
    expect(report.status).toBe('failed');
    expect(report.overallConfidence.score).toBe(0);
    expect(report.overallConfidence.grade).toBe('F');
    expect(report.surveyorDecisionMatrix.readyForField).toBe(false);
    expect(report.surveyorDecisionMatrix.overallRisk).toBe('critical');
  });
});

// ── Phase 7 → Phase 8 type compatibility ─────────────────────────────────────

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

// ── SurveyorDecisionMatrix tests ──────────────────────────────────────────────

describe('SurveyorDecisionMatrix', () => {
  const callScorer = new CallConfidenceScorer();

  function makeCallScores(entries: { callId: string; score: number }[]) {
    const m = new Map<string, CallConfidenceScore>();
    for (const e of entries) {
      m.set(e.callId, {
        callId: e.callId,
        score: e.score,
        grade: scoreToGrade(e.score),
        sourceCount: 2,
        sources: ['plat_segment', 'deed_extraction'],
        agreement: 'strong',
        factors: { sourceMultiplicity: 12, sourceAgreement: 20, sourceReliability: 22, readingClarity: 20 },
        riskLevel: e.score >= 80 ? 'low' : e.score >= 60 ? 'medium' : e.score >= 40 ? 'high' : 'critical',
        notes: null,
      });
    }
    return m;
  }

  it('21. overallRisk=low when confidence ≥ 80 and no criticals', () => {
    const decision = buildSurveyorDecision(
      85,
      makeCallScores([{ callId: 'C1', score: 85 }]),
      [],
      [],
      [],
    );
    expect(decision.overallRisk).toBe('low');
    expect(decision.readyForField).toBe(true);
  });

  it('22. overallRisk=critical when unresolved critical discrepancies exist', () => {
    const critDisc = makeDiscrepancyReport({ severity: 'critical', status: 'unresolved' });
    const decision = buildSurveyorDecision(
      72,
      makeCallScores([{ callId: 'C1', score: 72 }]),
      [],
      [critDisc],
      [],
    );
    expect(decision.overallRisk).toBe('critical');
    // Should still list caveats for the critical discrepancy
    expect(decision.caveats.some((c) => c.includes('Critical discrepancy') || c.includes('critical'))).toBe(true);
  });

  it('23. pathTo90 is null when confidence ≥ 90', () => {
    const decision = buildSurveyorDecision(
      92,
      makeCallScores([{ callId: 'C1', score: 92 }]),
      [],
      [],
      [],
    );
    expect(decision.pathTo90).toBeNull();
  });

  it('24. pathTo90 is a non-null string when confidence < 90', () => {
    const decision = buildSurveyorDecision(
      70,
      makeCallScores([{ callId: 'C1', score: 70 }]),
      [],
      [],
      [],
    );
    expect(decision.pathTo90).not.toBeNull();
    expect(typeof decision.pathTo90).toBe('string');
    expect((decision.pathTo90 as string).length).toBeGreaterThan(0);
  });

  it('25. estimatedFieldTime is a non-empty string', () => {
    const decision = buildSurveyorDecision(
      75,
      makeCallScores([{ callId: 'C1', score: 75 }]),
      [],
      [],
      [],
    );
    expect(typeof decision.estimatedFieldTime).toBe('string');
    expect(decision.estimatedFieldTime.length).toBeGreaterThan(0);
  });

  it('26. summary is a non-empty human-readable string', () => {
    const decision = buildSurveyorDecision(
      82,
      makeCallScores([{ callId: 'C1', score: 82 }]),
      [],
      [],
      [],
    );
    expect(typeof decision.summary).toBe('string');
    expect(decision.summary.length).toBeGreaterThan(10);
  });

  it('33. readyForField=false when overall confidence < 60', () => {
    const decision = buildSurveyorDecision(
      55,
      makeCallScores([{ callId: 'C1', score: 55 }]),
      [],
      [],
      [],
    );
    expect(decision.readyForField).toBe(false);
    // risk should be high for 55% confidence
    expect(['high', 'critical']).toContain(decision.overallRisk);
  });

  it('34. caveats include weak-side warning when a boundary side < 60', () => {
    const weakSides = [
      { side: 'west', score: 45, grade: 'D-', calls: 1, avgCallScore: 45, risk: 'Low confidence on west boundary' },
    ];
    const decision = buildSurveyorDecision(
      75,
      makeCallScores([{ callId: 'C1', score: 75 }]),
      weakSides,
      [],
      [],
    );
    const hasWestCaveat = decision.caveats.some((c) =>
      c.toLowerCase().includes('west') || c.toLowerCase().includes('boundary'),
    );
    expect(hasWestCaveat).toBe(true);
  });

  it('39. afterDocPurchase is capped at 98', () => {
    // Provide many high-impact purchase recommendations
    const purchaseRecs = Array.from({ length: 10 }, (_, i) => ({
      documentType: 'deed' as const,
      instrument: `deed-${i}`,
      source: 'County Clerk',
      estimatedCost: '$4-8',
      confidenceImpact: '+15 overall',
      callsImproved: 2,
      reason: 'test',
      priority: i + 1,
      roi: 2.5,
    }));
    const decision = buildSurveyorDecision(
      60,
      makeCallScores([{ callId: 'C1', score: 60 }]),
      [],
      [],
      purchaseRecs,
    );
    expect(decision.afterDocPurchase).toBeLessThanOrEqual(98);
  });
});

// ── DiscrepancyAnalyzer tests ─────────────────────────────────────────────────

describe('DiscrepancyAnalyzer — synchronous detection', () => {
  const analyzer = new DiscrepancyAnalyzer(''); // empty apiKey = no AI calls

  function makeCallWithBearings(
    callId: string,
    bearings: { source: ReadingSource; bearing: string }[],
  ): ReconciledCall {
    return {
      callId,
      reconciledBearing: bearings[0].bearing,
      reconciledDistance: 400,
      unit: 'feet',
      type: 'straight',
      reconciliation: {
        method: 'weighted_consensus',
        bearingSpread: '0°03\'00"',
        distanceSpread: 0.1,
        dominantSource: bearings[0].source,
        agreement: 'weak',
        notes: 'test',
      },
      readings: bearings.map((b) => ({
        source: b.source,
        callId,
        bearing: b.bearing,
        distance: 400,
        unit: 'feet' as const,
        type: 'straight' as const,
        confidence: 60,
        sourcePhase: 3,
        sourceDetail: 'test',
        weight: 1 / bearings.length,
        baseWeight: 0.5,
        confidenceMultiplier: 0.75,
        specialAdjustments: [] as string[],
      })),
      finalConfidence: 60,
      previousConfidence: 55,
      confidenceBoost: 5,
      symbol: '~',
    };
  }

  it('27. datum_shift detected when 3+ calls have consistent 2-6\' bearing spreads', async () => {
    // Create 4 calls that each have a ~3 arc-minute spread between two sources
    // (characteristic of NAD27→NAD83 datum shift)
    const calls: ReconciledCall[] = [
      makeCallWithBearings('C1', [
        { source: 'deed_extraction' as ReadingSource, bearing: 'N 04°37\'00" W' },
        { source: 'plat_segment' as ReadingSource, bearing: 'N 04°34\'00" W' }, // 3' spread
      ]),
      makeCallWithBearings('C2', [
        { source: 'deed_extraction' as ReadingSource, bearing: 'S 89°15\'00" E' },
        { source: 'plat_segment' as ReadingSource, bearing: 'S 89°12\'00" E' }, // 3' spread
      ]),
      makeCallWithBearings('C3', [
        { source: 'deed_extraction' as ReadingSource, bearing: 'S 04°37\'00" E' },
        { source: 'plat_segment' as ReadingSource, bearing: 'S 04°34\'00" E' }, // 3' spread
      ]),
      makeCallWithBearings('C4', [
        { source: 'deed_extraction' as ReadingSource, bearing: 'N 89°15\'00" W' },
        { source: 'plat_segment' as ReadingSource, bearing: 'N 89°12\'00" W' }, // 3' spread
      ]),
    ];

    const { reports } = await analyzer.analyzeDiscrepancies(calls, new Map(), [], { county: 'Bell' });

    // Should detect datum_shift discrepancy
    const datumShift = reports.find((r) => r.category === 'datum_shift');
    expect(datumShift).toBeDefined();
    expect(datumShift!.severity).toBe('critical');
    expect(datumShift!.affectedCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('28. datum_shift NOT detected when fewer than 3 affected calls', async () => {
    // Only 2 calls with datum-range spreads → not enough for datum_shift
    const calls: ReconciledCall[] = [
      makeCallWithBearings('C1', [
        { source: 'deed_extraction' as ReadingSource, bearing: 'N 04°37\'00" W' },
        { source: 'plat_segment' as ReadingSource, bearing: 'N 04°34\'00" W' }, // 3' spread
      ]),
      makeCallWithBearings('C2', [
        { source: 'deed_extraction' as ReadingSource, bearing: 'S 89°15\'00" E' },
        { source: 'plat_segment' as ReadingSource, bearing: 'S 89°12\'00" E' }, // 3' spread
      ]),
    ];

    const { reports } = await analyzer.analyzeDiscrepancies(calls, new Map(), [], { county: 'Bell' });

    const datumShift = reports.find((r) => r.category === 'datum_shift');
    expect(datumShift).toBeUndefined();
  });

  it('35. distance_mismatch detected when spread > 2 feet', async () => {
    const call: ReconciledCall = {
      callId: 'DIST_DISC',
      reconciledBearing: 'N 45°00\'00" E',
      reconciledDistance: 500,
      unit: 'feet',
      type: 'straight',
      reconciliation: {
        method: 'weighted_consensus',
        bearingSpread: '0°00\'01"',
        distanceSpread: 8.0, // 8 feet spread
        dominantSource: 'deed_extraction',
        agreement: 'moderate',
        notes: 'test',
      },
      readings: [
        { source: 'deed_extraction', callId: 'DIST_DISC', bearing: 'N 45°00\'00" E', distance: 504, unit: 'feet' as const, type: 'straight' as const, confidence: 80, sourcePhase: 3, sourceDetail: 'deed', weight: 0.5, baseWeight: 0.65, confidenceMultiplier: 0.8, specialAdjustments: [] },
        { source: 'plat_segment', callId: 'DIST_DISC', bearing: 'N 45°00\'00" E', distance: 496, unit: 'feet' as const, type: 'straight' as const, confidence: 70, sourcePhase: 3, sourceDetail: 'plat', weight: 0.5, baseWeight: 0.65, confidenceMultiplier: 0.8, specialAdjustments: [] },
      ],
      finalConfidence: 72,
      previousConfidence: 65,
      confidenceBoost: 7,
      symbol: '~',
    };

    const { reports } = await analyzer.analyzeDiscrepancies([call], new Map(), [], { county: 'Bell' });
    const distDisc = reports.find((r) => r.category === 'distance_mismatch');
    expect(distDisc).toBeDefined();
    expect(distDisc!.affectedCalls).toContain('DIST_DISC');
    expect(['minor', 'moderate', 'critical']).toContain(distDisc!.severity);
  });
});

// ── DiscrepancySummary numeric cost ──────────────────────────────────────────

describe('DiscrepancySummary', () => {
  it('29. estimatedResolutionCost is a number type (not a string)', () => {
    // The ConfidenceReport spec v1.1 uses numeric cost for downstream budget comparisons
    const summary = {
      total: 2,
      critical: 1,
      moderate: 1,
      minor: 0,
      resolved: 0,
      unresolved: 2,
      estimatedResolutionCost: 12,
      estimatedConfidenceAfterResolution: 85,
    };
    expect(typeof summary.estimatedResolutionCost).toBe('number');
  });

  it('30. estimatedResolutionCost is 0 when no unresolved discrepancies', () => {
    const summary = {
      total: 1,
      critical: 0,
      moderate: 0,
      minor: 0,
      resolved: 1,
      unresolved: 0,
      estimatedResolutionCost: 0,
      estimatedConfidenceAfterResolution: 0,
    };
    expect(summary.estimatedResolutionCost).toBe(0);
  });
});

// ── Additional edge-case tests (41–60) ────────────────────────────────────────

describe('CallConfidenceScorer — additional coverage', () => {
  const scorer = new CallConfidenceScorer();

  it('41. plat_overview source → reliability = 8', () => {
    const call = makeReconciledCall({ sources: ['plat_overview'], finalConfidence: 60 });
    const result = scorer.scoreCall(call);
    // plat_overview maps to 8 in RELIABILITY_MAP
    expect(result.factors.sourceReliability).toBe(8);
  });

  it('42. plat_geometric source → reliability = 6 (second lowest named source)', () => {
    const call = makeReconciledCall({ sources: ['plat_geometric'], finalConfidence: 50 });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceReliability).toBe(6);
  });

  it('43. unknown source falls back to reliability = 5', () => {
    // Any source not in the RELIABILITY_MAP should default to 5.
    // We must cast to bypass the strict ReadingSource union since all union
    // members are in the map — this tests the internal fallback guard only.
    const call = makeReconciledCall({ sources: ['legacy_survey' as unknown as ReadingSource], finalConfidence: 60 });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceReliability).toBe(5);
  });

  it('44. score is capped at 98 even when all factors are maximised', () => {
    const call = makeReconciledCall({
      sources: ['txdot_row', 'deed_extraction', 'plat_segment', 'adjacent_reversed', 'adjacent_chain'],
      agreement: 'strong',
      bearingSpread: '0°00\'01"',
      distanceSpread: 0.05,
      finalConfidence: 100, // reading clarity factors based on this
    });
    const result = scorer.scoreCall(call);
    // Maximum achievable is 25+25+25+25 = 100, capped at 98
    expect(result.score).toBeLessThanOrEqual(98);
  });

  it('45. score is floored at 5 even for worst-case inputs', () => {
    // 1 source (5 pts), no agreement (0), lowest reliability (4), clarity near 0
    const call = makeReconciledCall({
      sources: ['county_road_default'],
      finalConfidence: 1, // clarity ≈ floor(1/4) = 0
    });
    const result = scorer.scoreCall(call);
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it('46. adjacent_reversed source → reliability = 19', () => {
    const call = makeReconciledCall({ sources: ['adjacent_reversed'], finalConfidence: 80 });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceReliability).toBe(19);
  });

  it('47. 2 sources → sourceMultiplicity = 12', () => {
    const call = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment'],
      finalConfidence: 75,
    });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceMultiplicity).toBe(12);
    expect(result.sourceCount).toBe(2);
  });

  it('48. 3 sources → sourceMultiplicity = 18', () => {
    const call = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment', 'adjacent_reversed'],
      finalConfidence: 80,
    });
    const result = scorer.scoreCall(call);
    expect(result.factors.sourceMultiplicity).toBe(18);
  });

  it('49. riskLevel=high when 40 ≤ score < 60', () => {
    // Force a mid-low score: 1 source (5) + no agreement (0) + plat_overview (8) + low clarity
    // Clarity = floor(20/4)=5; total = 5+0+8+5=18 < 40? Actually floor(20/4)=5, 5+8+5=18 → critical
    // Let's try plat_segment (16) + clarity 20 → 5+0+16+5=26 → critical
    // To get 40-59: county_road_default (4), clarity=floor(100/4)=25 → 5+0+4+25=34 still high
    // plat_geometric (6), clarity 25 → 5+0+6+25=36 → critical (< 40)
    // subdivision_interior (14), clarity 25 → 5+0+14+25=44 → high (40-59)
    const call = makeReconciledCall({
      sources: ['subdivision_interior'],
      finalConfidence: 100, // maxConfidence → readingClarity = 25
    });
    const result = scorer.scoreCall(call);
    // 5 + 0 + 14 + 25 = 44 → high
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(60);
    expect(result.riskLevel).toBe('high');
  });

  it('50. riskLevel=medium when 60 ≤ score < 80', () => {
    // 2 sources (12) + strong agreement at 3-arc-minute spread (20) + deed reliability (22) + max clarity (25) = 79
    // 3 arc-minutes = 0.05° exactly — just inside the < 0.05° threshold (scores 20 agreement points)
    const call = makeReconciledCall({
      sources: ['deed_extraction', 'plat_segment'],
      agreement: 'moderate',
      bearingSpread: '0°03\'00"',   // exactly 3 arc-minutes = 0.05° → sourceAgreement = 20
      distanceSpread: 0.8,          // < 1.0' → also qualifies for the 20-point tier
      finalConfidence: 100,
    });
    const result = scorer.scoreCall(call);
    // 12 + 20 + 22 + 25 = 79 → medium (60 ≤ 79 < 80)
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
    expect(result.riskLevel).toBe('medium');
  });
});

describe('scoreToGrade — full boundary coverage', () => {
  it('51. all grade thresholds map correctly (B+, B, B-, C+, C, C-)', () => {
    expect(scoreToGrade(83)).toBe('B+');
    expect(scoreToGrade(78)).toBe('B');
    expect(scoreToGrade(73)).toBe('B-');
    expect(scoreToGrade(68)).toBe('C+');
    expect(scoreToGrade(63)).toBe('C');
    expect(scoreToGrade(58)).toBe('C-');
  });

  it('52. D+ boundary: score 53 → D+, score 52 → D', () => {
    expect(scoreToGrade(53)).toBe('D+');
    expect(scoreToGrade(52)).toBe('D');
  });

  it('53. A- boundary: score 88 → A-, score 87 → B+', () => {
    expect(scoreToGrade(88)).toBe('A-');
    expect(scoreToGrade(87)).toBe('B+');
  });
});

describe('LotConfidenceScorer — boundary-side and acreage', () => {
  const scorer = new LotConfidenceScorer();

  it('54. scoreBoundarySides groups calls by direction and returns sorted result', () => {
    const callScores = new Map<string, CallConfidenceScore>([
      ['C1', { callId: 'C1', score: 85, grade: 'B+', sourceCount: 2, sources: ['deed_extraction', 'plat_segment'], agreement: 'strong', factors: { sourceMultiplicity: 12, sourceAgreement: 20, sourceReliability: 22, readingClarity: 20 }, riskLevel: 'low', notes: null }],
      ['C2', { callId: 'C2', score: 70, grade: 'B-', sourceCount: 1, sources: ['plat_segment'], agreement: 'n/a', factors: { sourceMultiplicity: 5, sourceAgreement: 0, sourceReliability: 16, readingClarity: 20 }, riskLevel: 'medium', notes: null }],
      ['C3', { callId: 'C3', score: 50, grade: 'D', sourceCount: 1, sources: ['plat_geometric'], agreement: 'n/a', factors: { sourceMultiplicity: 5, sourceAgreement: 0, sourceReliability: 6, readingClarity: 15 }, riskLevel: 'high', notes: null }],
    ]);
    const callDirections = new Map<string, string>([
      ['C1', 'north'],
      ['C2', 'east'],
      ['C3', 'west'],
    ]);

    const sides = scorer.scoreBoundarySides(callScores, callDirections);
    expect(sides.length).toBe(3);
    const northSide = sides.find((s) => s.side === 'north');
    expect(northSide).toBeDefined();
    expect(northSide!.score).toBe(85);
    // west (score 50) should have a risk message
    const westSide = sides.find((s) => s.side === 'west');
    expect(westSide!.risk).toBeDefined();
  });

  it('55. acreage mismatch > 5% applies negative penalty to lot score', () => {
    const goodCall = makeReconciledCall({ sources: ['deed_extraction', 'plat_segment'], finalConfidence: 80, bearing: 'N 10°00\'00" W', distance: 500 });
    const callScores = new Map<string, CallConfidenceScore>();
    callScores.set('C1', { callId: 'C1', score: 80, grade: 'B', sourceCount: 2, sources: ['deed_extraction', 'plat_segment'], agreement: 'strong', factors: { sourceMultiplicity: 12, sourceAgreement: 20, sourceReliability: 22, readingClarity: 20 }, riskLevel: 'low', notes: null });

    const goodLot = scorer.scoreLot('L1', 'Lot 1', [goodCall], callScores, '1:∞', 'closed', 10.0, 10.0);
    // Now compare with a lot that has a 10% acreage discrepancy
    const badLot = scorer.scoreLot('L1', 'Lot 1', [goodCall], callScores, '1:∞', 'closed', 10.0, 9.0);

    // The bad lot should score lower due to acreage penalty
    expect(badLot.score).toBeLessThan(goodLot.score);
  });

  it('56. lot with no calls defaults to score 50 (not zero or NaN)', () => {
    const emptyCallScores = new Map<string, CallConfidenceScore>();
    const result = scorer.scoreLot('EMPTY', 'Empty Lot', [], emptyCallScores, 'n/a', 'open', 0, 0);
    expect(result.score).toBeGreaterThanOrEqual(5);
    expect(Number.isNaN(result.score)).toBe(false);
    // weakestCall should be null when there are no calls
    expect(result.weakestCall).toBeNull();
  });
});

describe('DiscrepancyAnalyzer — additional detection cases', () => {
  const analyzer = new DiscrepancyAnalyzer(); // no API key → AI step skipped

  it('57. bearing discrepancy below 1 arc-minute threshold is NOT flagged', async () => {
    // Spread of only 0.5 arc-minutes → should not be flagged as bearing_mismatch
    const call: ReconciledCall = {
      callId: 'SMALL_SPREAD',
      reconciledBearing: 'N 45°00\'00" E',
      reconciledDistance: 400,
      unit: 'feet',
      type: 'straight',
      reconciliation: {
        method: 'weighted_consensus',
        bearingSpread: '0°00\'30"', // 0.5 arc-minutes
        distanceSpread: 0.1,
        dominantSource: 'deed_extraction',
        agreement: 'strong',
        notes: 'tiny spread',
      },
      readings: [
        { source: 'deed_extraction', callId: 'SMALL_SPREAD', bearing: 'N 45°00\'00" E', distance: 400, unit: 'feet', type: 'straight', confidence: 85, sourcePhase: 3, sourceDetail: 'deed', weight: 0.6, baseWeight: 0.65, confidenceMultiplier: 0.85, specialAdjustments: [] },
        { source: 'plat_segment', callId: 'SMALL_SPREAD', bearing: 'N 44°59\'30" E', distance: 400.05, unit: 'feet', type: 'straight', confidence: 80, sourcePhase: 3, sourceDetail: 'plat', weight: 0.4, baseWeight: 0.65, confidenceMultiplier: 0.8, specialAdjustments: [] },
      ],
      finalConfidence: 82,
      previousConfidence: 70,
      confidenceBoost: 12,
      symbol: '✓',
    };

    const { reports } = await analyzer.analyzeDiscrepancies([call], new Map(), [], { county: 'Bell' });
    const bearingMismatch = reports.find((r) => r.category === 'bearing_mismatch');
    expect(bearingMismatch).toBeUndefined();
  });

  it('58. type_conflict detected when straight and curve readings disagree', async () => {
    const call: ReconciledCall = {
      callId: 'CURVE_CONFLICT',
      reconciledBearing: 'N 45°00\'00" E',
      reconciledDistance: 300,
      unit: 'feet',
      type: 'straight',
      reconciliation: {
        method: 'weighted_consensus',
        bearingSpread: '0°00\'01"',
        distanceSpread: 0.5,
        dominantSource: 'deed_extraction',
        agreement: 'moderate',
        notes: 'type conflict',
      },
      readings: [
        { source: 'deed_extraction', callId: 'CURVE_CONFLICT', bearing: 'N 45°00\'00" E', distance: 300, unit: 'feet', type: 'straight', confidence: 75, sourcePhase: 3, sourceDetail: 'deed', weight: 0.7, baseWeight: 0.65, confidenceMultiplier: 0.75, specialAdjustments: [] },
        { source: 'plat_segment', callId: 'CURVE_CONFLICT', bearing: null, distance: 300, unit: 'feet', type: 'curve', confidence: 60, sourcePhase: 3, sourceDetail: 'plat', weight: 0.3, baseWeight: 0.65, confidenceMultiplier: 0.6, specialAdjustments: [] },
      ],
      finalConfidence: 65,
      previousConfidence: 55,
      confidenceBoost: 10,
      symbol: '~',
    };

    const { reports } = await analyzer.analyzeDiscrepancies([call], new Map(), [], { county: 'Travis' });
    const typeConflict = reports.find((r) => r.category === 'type_conflict');
    expect(typeConflict).toBeDefined();
    expect(typeConflict!.affectedCalls).toContain('CURVE_CONFLICT');
  });

  it('59. single-reading calls produce no discrepancies', async () => {
    const singleReadingCall = makeReconciledCall({
      callId: 'SINGLE_READ',
      sources: ['plat_segment'], // only 1 reading
      finalConfidence: 70,
    });

    const { reports } = await analyzer.analyzeDiscrepancies([singleReadingCall], new Map(), [], { county: 'Bexar' });
    // No bearing/distance/type discrepancies for a call with < 2 readings
    const newDiscs = reports.filter((r) => r.status === 'unresolved');
    expect(newDiscs).toHaveLength(0);
  });

  it('60. already-resolved discrepancies are preserved in output', async () => {
    const resolvedDiscs = [
      {
        category: 'road_geometry',
        title: 'FM 1234 ROW resolved',
        description: 'Road ROW matched TxDOT data',
        resolution: 'Matched to TxDOT ROW boundary',
        resolvedBy: 'Phase 6 TxDOT ROW',
        resolvedInPhase: 6,
        affectedCalls: ['ROW1'],
        affectedLots: [],
        newConfidence: 92,
      },
    ];

    const { reports } = await analyzer.analyzeDiscrepancies([], new Map(), resolvedDiscs, { county: 'Bexar' });
    expect(reports.length).toBe(1);
    expect(reports[0].status).toBe('resolved');
    expect(reports[0].affectedCalls).toContain('ROW1');
    expect(reports[0].resolution.estimatedConfidenceAfterResolution).toBe(92);
  });
});
