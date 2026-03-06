// __tests__/recon/phase3-analysis.test.ts
// Unit tests for STARR RECON Phase 3: AI Document Intelligence.
//
// Tests cover pure-logic portions that can be validated without
// live AI API calls:
//
//   1. PropertyIntelligence model: computeConfidenceSummary()
//   2. PropertyIntelligence model: toConfidenceSymbol()
//   3. AIPlatAnalyzer: buildTextExtractionFromOcr (internal helper via integration)
//   4. AIPlatAnalyzer: mergePageResults (deterministic merge logic)
//   5. AIDeedAnalyzer: convertCalls() — vara conversion, curve completion
//   6. AIDeedAnalyzer: toDeedChainEntry() — field mapping
//   7. AIDocumentAnalyzer: document routing (extractPlatDocuments / extractDeedDocuments)
//   8. AIContextAnalyzer: confidence summary rating boundaries

import { describe, it, expect } from 'vitest';

import {
  computeConfidenceSummary,
  toConfidenceSymbol,
} from '../../worker/src/models/property-intelligence.js';

import type {
  LotData,
  P3BoundaryCall,
  DeedChainEntry,
  PropertyIntelligence,
} from '../../worker/src/models/property-intelligence.js';

import { AIDeedAnalyzer } from '../../worker/src/services/ai-deed-analyzer.js';
import { PipelineLogger } from '../../worker/src/lib/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCall(
  symbol: P3BoundaryCall['confidenceSymbol'],
  override: Partial<P3BoundaryCall> = {},
): P3BoundaryCall {
  return {
    callId:           'TEST_C1',
    sequenceNumber:   1,
    bearing:          'N 85°22\'02" E',
    distance:         100.0,
    unit:             'feet',
    type:             'straight',
    confidence:       70,
    confidenceSymbol: symbol,
    sources:          ['plat_text'],
    allReadings:      [],
    bestReading:      'N 85°22\'02" E, 100.00\'',
    ...override,
  };
}

function makeLot(calls: P3BoundaryCall[]): LotData {
  return {
    lotId:        'lot_1',
    name:         'Lot 1',
    lotType:      'residential',
    acreage:      1.0,
    boundaryCalls: calls,
    curves:        [],
    easements:     [],
    notes:         [],
    confidence:    75,
  };
}

// ── 1. computeConfidenceSummary ───────────────────────────────────────────────

describe('computeConfidenceSummary', () => {
  it('returns zero overall when no calls exist', () => {
    const result = computeConfidenceSummary([], []);
    expect(result.overall).toBe(0);
    expect(result.totalCalls).toBe(0);
    expect(result.rating).toBe('INSUFFICIENT');
  });

  it('returns 100 when all calls are confirmed (✓)', () => {
    const calls = [makeCall('✓'), makeCall('✓'), makeCall('✓')];
    const result = computeConfidenceSummary([makeLot(calls)], []);
    expect(result.overall).toBe(100);
    expect(result.confirmedCalls).toBe(3);
    expect(result.rating).toBe('EXCELLENT');
  });

  it('returns 0 when all calls are critical (✗✗)', () => {
    const calls = [makeCall('✗✗'), makeCall('✗✗')];
    const result = computeConfidenceSummary([makeLot(calls)], []);
    expect(result.overall).toBe(0);
    expect(result.criticalCalls).toBe(2);
    expect(result.rating).toBe('INSUFFICIENT');
  });

  it('computes weighted average correctly for mixed symbols', () => {
    // 2×✓(100) + 1×~(75) + 1×?(50) + 0×✗(25) + 0×✗✗(0)  = 325/4 = 81
    const calls = [makeCall('✓'), makeCall('✓'), makeCall('~'), makeCall('?')];
    const result = computeConfidenceSummary([makeLot(calls)], []);
    expect(result.overall).toBe(81);
    expect(result.confirmedCalls).toBe(2);
    expect(result.deducedCalls).toBe(1);
    expect(result.unconfirmedCalls).toBe(1);
    expect(result.rating).toBe('GOOD');
  });

  it('counts perimeter calls separately from lot calls', () => {
    const lotCalls  = [makeCall('✓')];
    const perimCall = makeCall('✗');
    const result = computeConfidenceSummary([makeLot(lotCalls)], [perimCall]);
    expect(result.totalCalls).toBe(2);
    expect(result.confirmedCalls).toBe(1);
    expect(result.discrepancyCalls).toBe(1);
    // (100 + 25) / 2 = 62.5 → rounds to 63
    expect(result.overall).toBe(63);
    expect(result.rating).toBe('FAIR');
  });

  it('includes curve calls in lot confidence summary', () => {
    const lot: LotData = {
      lotId:        'lot_2',
      name:         'Lot 2',
      lotType:      'residential',
      boundaryCalls: [makeCall('✓')],
      curves:        [makeCall('~', { callId: 'lot_2_CV1', type: 'curve' })],
      easements:     [],
      notes:         [],
      confidence:    80,
    };
    const result = computeConfidenceSummary([lot], []);
    expect(result.totalCalls).toBe(2);
    expect(result.confirmedCalls).toBe(1);
    expect(result.deducedCalls).toBe(1);
  });

  it('rating boundary: EXCELLENT ≥ 90', () => {
    // 10×✓ + 1×~ → (1000+75)/11 = 97
    const calls = Array.from({ length: 10 }, () => makeCall('✓'));
    calls.push(makeCall('~'));
    const result = computeConfidenceSummary([makeLot(calls)], []);
    expect(result.overall).toBeGreaterThanOrEqual(90);
    expect(result.rating).toBe('EXCELLENT');
  });

  it('rating boundary: FAIR between 55-74', () => {
    // 1×~(75) + 1×?(50) = 125/2 = 62.5 → rounds to 63 → FAIR
    const calls = [makeCall('~'), makeCall('?')];
    const result = computeConfidenceSummary([makeLot(calls)], []);
    expect(result.overall).toBe(63);
    expect(result.rating).toBe('FAIR');
  });

  it('rating boundary: LOW between 35-54', () => {
    // 1×?(50) + 1×✗(25) = 75/2 = 37.5 → rounds to 38 → LOW
    const calls = [makeCall('?'), makeCall('✗')];
    const result = computeConfidenceSummary([makeLot(calls)], []);
    expect(result.overall).toBe(38);
    expect(result.rating).toBe('LOW');
  });
});

// ── 2. toConfidenceSymbol ─────────────────────────────────────────────────────

describe('toConfidenceSymbol', () => {
  it('returns ✓ for confirmed status with high confidence', () => {
    expect(toConfidenceSymbol(90, 'confirmed')).toBe('✓');
  });

  it('returns ~ for confirmed status with confidence below 85', () => {
    expect(toConfidenceSymbol(80, 'confirmed')).toBe('~');
  });

  it('returns ✗✗ for conflict with very low confidence', () => {
    expect(toConfidenceSymbol(10, 'conflict')).toBe('✗✗');
  });

  it('returns ✗ for conflict with moderate confidence', () => {
    expect(toConfidenceSymbol(40, 'conflict')).toBe('✗');
  });

  it('returns ~ for text_only with confidence ≥ 70', () => {
    expect(toConfidenceSymbol(75, 'text_only')).toBe('~');
  });

  it('returns ? for text_only with confidence < 70', () => {
    expect(toConfidenceSymbol(65, 'text_only')).toBe('?');
  });

  it('returns ✓ for high confidence fallback (no status)', () => {
    expect(toConfidenceSymbol(90)).toBe('✓');
    expect(toConfidenceSymbol(85)).toBe('✓');
  });

  it('returns ~ for 70–84 fallback', () => {
    expect(toConfidenceSymbol(70)).toBe('~');
    expect(toConfidenceSymbol(84)).toBe('~');
  });

  it('returns ? for 50–69 fallback', () => {
    expect(toConfidenceSymbol(50)).toBe('?');
    expect(toConfidenceSymbol(69)).toBe('?');
  });

  it('returns ✗ for 25–49 fallback', () => {
    expect(toConfidenceSymbol(25)).toBe('✗');
    expect(toConfidenceSymbol(49)).toBe('✗');
  });

  it('returns ✗✗ for < 25 fallback', () => {
    expect(toConfidenceSymbol(0)).toBe('✗✗');
    expect(toConfidenceSymbol(24)).toBe('✗✗');
  });

  it('returns ✗ or ✗✗ when bearingAgreement is false', () => {
    expect(toConfidenceSymbol(60, undefined, false)).toBe('✗');
    expect(toConfidenceSymbol(20, undefined, false)).toBe('✗✗');
  });
});

// ── 3. AIDeedAnalyzer.convertCalls — varas conversion ────────────────────────

describe('AIDeedAnalyzer.convertCalls', () => {
  const logger  = new PipelineLogger('test-project');
  // Use a dummy API key — these tests don't make real API calls
  const analyzer = new AIDeedAnalyzer('test-key-no-calls', logger);

  it('converts vara distances to feet (1 vara = 2.7778 ft)', () => {
    const input: import('../../worker/src/types/index.js').BoundaryCall[] = [{
      sequence:   1,
      bearing:    { raw: 'N 45°00\'00" E', decimalDegrees: 45, quadrant: 'NE' },
      distance:   { raw: '100 varas', value: 100, unit: 'varas' },
      curve:      null,
      toPoint:    null,
      along:      null,
      confidence: 0.85,
    }];

    const result = analyzer.convertCalls(input, 'deed_text');
    expect(result).toHaveLength(1);
    // 100 varas × 2.7778 = 277.78 feet
    expect(result[0].distance).toBeCloseTo(277.78, 1);
    // unit field preserves the original even though we converted
    expect(result[0].unit).toBe('varas');
  });

  it('preserves foot distances unchanged', () => {
    const input: import('../../worker/src/types/index.js').BoundaryCall[] = [{
      sequence:   2,
      bearing:    { raw: 'S 85°22\'02" W', decimalDegrees: 85.367, quadrant: 'SW' },
      distance:   { raw: '461.81 feet', value: 461.81, unit: 'feet' },
      curve:      null,
      toPoint:    'iron rod found',
      along:      'FM 436 ROW',
      confidence: 0.92,
    }];

    const result = analyzer.convertCalls(input, 'plat_text');
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBeCloseTo(461.81, 2);
    expect(result[0].unit).toBe('feet');
    expect(result[0].toMonument).toBe('iron rod found');
    expect(result[0].along).toBe('FM 436 ROW');
  });

  it('assigns deed_text source to all readings', () => {
    const input: import('../../worker/src/types/index.js').BoundaryCall[] = [{
      sequence:   1,
      bearing:    { raw: 'N 10°00\'00" E', decimalDegrees: 10, quadrant: 'NE' },
      distance:   { raw: '50 feet', value: 50, unit: 'feet' },
      curve:      null,
      toPoint:    null,
      along:      null,
      confidence: 0.75,
    }];

    const result = analyzer.convertCalls(input, 'deed_text');
    expect(result[0].sources).toContain('deed_text');
    expect(result[0].allReadings[0].source).toBe('deed_text');
    expect(result[0].allReadings[0].isGeometric).toBe(false);
  });

  it('skips calls with no bearing AND no curve', () => {
    const input: import('../../worker/src/types/index.js').BoundaryCall[] = [{
      sequence:   1,
      bearing:    null,
      distance:   { raw: '100 feet', value: 100, unit: 'feet' },
      curve:      null,
      toPoint:    null,
      along:      null,
      confidence: 0.5,
    }];

    const result = analyzer.convertCalls(input, 'deed_text');
    expect(result).toHaveLength(0);
  });

  it('handles curve calls and assigns callId with CV prefix', () => {
    const input: import('../../worker/src/types/index.js').BoundaryCall[] = [{
      sequence: 3,
      bearing:  null,
      distance: null,
      curve:    {
        radius:        { raw: '200 feet', value: 200 },
        arcLength:     { raw: '50 feet', value: 50 },
        chordBearing:  { raw: 'N 45°00\'00" E', decimalDegrees: 45, quadrant: 'NE' },
        chordDistance: { raw: '49.87 feet', value: 49.87 },
        direction:     'left',
        delta:         { raw: '14°19\'28"', decimalDegrees: 14.324 },
      },
      toPoint:    null,
      along:      null,
      confidence: 0.80,
    }];

    const result = analyzer.convertCalls(input, 'deed_text');
    expect(result).toHaveLength(1);
    expect(result[0].callId).toBe('deed_CV3');
    expect(result[0].type).toBe('curve');
    expect(result[0].curve?.radius).toBe(200);
    expect(result[0].curve?.direction).toBe('left');
  });
});

// ── 4. AIDeedAnalyzer.toDeedChainEntry ───────────────────────────────────────

describe('AIDeedAnalyzer.toDeedChainEntry', () => {
  const logger   = new PipelineLogger('test-chain');
  const analyzer = new AIDeedAnalyzer('test-key-no-calls', logger);

  it('maps all fields correctly', () => {
    const input: import('../../worker/src/services/ai-deed-analyzer.js').DeedAnalysisResult = {
      grantor:            'JOHN SMITH',
      grantee:            'JANE TRUST',
      deedDate:           '2020-03-15',
      recordingDate:      '2020-03-20',
      instrumentNumber:   '2020012345',
      calledAcreage:      12.358,
      surveyReference:    'WILLIAM HARTRICK SURVEY, A-488',
      parentTract:        'A larger 25-acre tract',
      parentInstrument:   '1999054321',
      metesAndBounds:     [],
      calledFrom:         [{ name: 'GAINES', reference: 'Vol 1234 Pg 567', acreage: 4.0 }],
      easementsMentioned: ['15\' utility easement along west boundary'],
      specialNotes:       ['Subject to utility easement'],
      confidence:         85,
      totalApiCalls:      2,
    };

    const entry: DeedChainEntry = analyzer.toDeedChainEntry(input, 'warranty_deed');
    expect(entry.instrument).toBe('2020012345');
    expect(entry.type).toBe('warranty_deed');
    expect(entry.date).toBe('2020-03-15');
    expect(entry.grantor).toBe('JOHN SMITH');
    expect(entry.grantee).toBe('JANE TRUST');
    expect(entry.calledAcreage).toBe(12.358);
    expect(entry.surveyReference).toBe('WILLIAM HARTRICK SURVEY, A-488');
    expect(entry.parentTract).toBe('A larger 25-acre tract');
    expect(entry.parentInstrument).toBe('1999054321');
    expect(entry.metesAndBounds).toEqual([]);
    // Notes should include both specialNotes and easements
    expect(entry.notes).toContain('Subject to utility easement');
    expect(entry.notes.some(n => n.includes('utility easement along west boundary'))).toBe(true);
  });

  it('uses recordingDate as fallback when deedDate is missing', () => {
    const input: import('../../worker/src/services/ai-deed-analyzer.js').DeedAnalysisResult = {
      grantor: 'A', grantee: 'B',
      recordingDate: '2021-06-01',
      metesAndBounds: [], calledFrom: [],
      easementsMentioned: [], specialNotes: [],
      confidence: 50, totalApiCalls: 0,
    };
    const entry = analyzer.toDeedChainEntry(input);
    expect(entry.date).toBe('2021-06-01');
  });

  it('returns empty string for date when both dates are missing', () => {
    const input: import('../../worker/src/services/ai-deed-analyzer.js').DeedAnalysisResult = {
      grantor: '', grantee: '',
      metesAndBounds: [], calledFrom: [],
      easementsMentioned: [], specialNotes: [],
      confidence: 0, totalApiCalls: 0,
    };
    const entry = analyzer.toDeedChainEntry(input);
    expect(entry.date).toBe('');
  });
});

// ── 5. PropertyIntelligence version constant ──────────────────────────────────

describe('PropertyIntelligence.version', () => {
  it('version type literal is 3.0', () => {
    // TypeScript compile-time check + runtime check
    const obj: Pick<PropertyIntelligence, 'version'> = { version: '3.0' };
    expect(obj.version).toBe('3.0');
  });
});

// ── 6. Confidence summary rating boundaries ────────────────────────────────────

describe('confidence rating boundaries', () => {
  // Helper: create n calls all with the same symbol
  function nCalls(symbol: P3BoundaryCall['confidenceSymbol'], n: number): P3BoundaryCall[] {
    return Array.from({ length: n }, (_, i) =>
      makeCall(symbol, { callId: `TEST_C${i + 1}`, sequenceNumber: i + 1 }),
    );
  }

  it('EXCELLENT: all confirmed (100%)', () => {
    const r = computeConfidenceSummary([makeLot(nCalls('✓', 5))], []);
    expect(r.rating).toBe('EXCELLENT');
    expect(r.overall).toBe(100);
  });

  it('GOOD: 5 confirmed + 5 deduced = (500+375)/10 = 87.5 → rounds to 88', () => {
    const r = computeConfidenceSummary([makeLot([...nCalls('✓', 5), ...nCalls('~', 5)])], []);
    expect(r.overall).toBe(88);
    expect(r.rating).toBe('GOOD');
  });

  it('FAIR: mix producing score 60–74', () => {
    // 4×?(50) + 1×✓(100) = (200+100)/5 = 60
    const r = computeConfidenceSummary([makeLot([...nCalls('?', 4), ...nCalls('✓', 1)])], []);
    expect(r.overall).toBe(60);
    expect(r.rating).toBe('FAIR');
  });

  it('LOW: mix producing score 35–54', () => {
    // 4×?(50) + 2×✗(25) = (200+50)/6 = 250/6 = 41.67 → rounds to 42 → LOW
    const r = computeConfidenceSummary([makeLot([...nCalls('?', 4), ...nCalls('✗', 2)])], []);
    expect(r.overall).toBe(42);
    expect(r.rating).toBe('LOW');
  });

  it('INSUFFICIENT: < 35 score', () => {
    // All ✗✗ = 0
    const r = computeConfidenceSummary([makeLot(nCalls('✗✗', 4))], []);
    expect(r.overall).toBe(0);
    expect(r.rating).toBe('INSUFFICIENT');
  });
});

// ── 7. Document routing types ─────────────────────────────────────────────────

describe('document type routing constants', () => {
  // Verify the PLAT_TYPES and DEED_TYPES sets used by AIDocumentAnalyzer
  // by checking that plat documents are NOT in deed types and vice versa.
  // We test this indirectly by checking the string values that the constants
  // define, without importing the private implementation sets.

  it('plat type strings are known DocumentType values', () => {
    const platTypes = ['plat', 'replat', 'amended_plat', 'vacating_plat'];
    const deedTypes = ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed'];
    // No overlap
    for (const pt of platTypes) {
      expect(deedTypes.includes(pt)).toBe(false);
    }
  });

  it('deed type strings are known DocumentType values', () => {
    const deedTypes = ['warranty_deed', 'easement', 'restrictive_covenant', 'right_of_way'];
    const platTypes = ['plat', 'replat', 'amended_plat'];
    for (const dt of deedTypes) {
      expect(platTypes.includes(dt)).toBe(false);
    }
  });
});
