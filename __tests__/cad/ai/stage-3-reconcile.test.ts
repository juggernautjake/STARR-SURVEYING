// __tests__/cad/ai/stage-3-reconcile.test.ts
//
// Phase 6 Stage-3 Deed Reconciliation — unit tests for the
// pure reconciler in `lib/cad/ai-engine/stage-3-reconcile.ts`.
// Covers §1889-1892 in
// `docs/planning/in-progress/STARR_CAD/STARR_CAD_PHASE_6_AI_ENGINE.md`:
//
//   §1889 — Bearing differences > 60" flagged as BEARING_MISMATCH
//   §1890 — Distance differences > 0.50' flagged as DISTANCE_MISMATCH
//   §1891 — Call count mismatch detected
//   §1892 — Overall match score computed correctly

import { describe, it, expect } from 'vitest';
import { reconcileDeed } from '@/lib/cad/ai-engine/stage-3-reconcile';
import type {
  DeedData,
  DeedCall,
} from '@/lib/cad/ai-engine/types';
import type { Traverse, TraverseLeg, SurveyPoint } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLeg(over: Partial<TraverseLeg> = {}): TraverseLeg {
  return {
    fromPointId: 'p1',
    toPointId: 'p2',
    bearing: 90, // East
    distance: 100,
    deltaNorth: 0,
    deltaEast: 100,
    isArc: false,
    curveData: null,
    ...over,
  };
}

function makeTraverse(legs: TraverseLeg[]): Traverse {
  return {
    id: 't1',
    name: 'test',
    pointIds: ['p1', 'p2', 'p3', 'p4', 'p5'].slice(0, legs.length + 1),
    isClosed: false,
    legs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeCall(over: Partial<DeedCall> = {}, index = 0): DeedCall {
  return {
    index,
    type: 'LINE',
    bearing: 90,
    distance: 100,
    curveData: null,
    monument: null,
    rawText: '',
    ...over,
  };
}

function makeDeed(calls: DeedCall[]): DeedData {
  return {
    source: 'LEGAL_DESCRIPTION',
    rawText: '',
    calls,
    curves: [],
    basisOfBearings: null,
    beginningMonument: null,
    county: null,
    survey: null,
    abstract: null,
    volume: null,
    page: null,
  };
}

// ── §1889: Bearing differences > 60" flagged ────────────────────────────────

describe('Phase 6 Stage 3 — Deed Reconciliation', () => {
  it('§1889 — bearing diff > 60 arc-seconds → BEARING_MISMATCH discrepancy', () => {
    // Field: 90.00000°, deed: 90.01°. 0.01° = 36" — under tolerance.
    // Field: 90.0°, deed: 90.02° = 72" → over tolerance.
    const traverse = makeTraverse([makeLeg({ bearing: 90.0, distance: 100 })]);
    const deed = makeDeed([makeCall({ bearing: 90.02, distance: 100 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons).toHaveLength(1);
    expect(result.callComparisons[0].bearingOk).toBe(false);
    const mismatches = result.discrepancies.filter((d) => d.type === 'BEARING_MISMATCH');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].difference).toMatch(/seconds/);
  });

  it('§1889 — bearing diff ≤ 60 arc-seconds → no BEARING_MISMATCH', () => {
    // 0.015° = 54" — under the 60" tolerance.
    const traverse = makeTraverse([makeLeg({ bearing: 90.0, distance: 100 })]);
    const deed = makeDeed([makeCall({ bearing: 90.015, distance: 100 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons[0].bearingOk).toBe(true);
    expect(
      result.discrepancies.find((d) => d.type === 'BEARING_MISMATCH'),
    ).toBeUndefined();
  });

  // ── §1890: Distance differences > 0.50' flagged ──────────────────────────

  it('§1890 — distance diff > 0.50 ft → DISTANCE_MISMATCH discrepancy', () => {
    const traverse = makeTraverse([makeLeg({ bearing: 90, distance: 100.0 })]);
    const deed = makeDeed([makeCall({ bearing: 90, distance: 100.6 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons[0].distanceOk).toBe(false);
    const mismatches = result.discrepancies.filter((d) => d.type === 'DISTANCE_MISMATCH');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].difference).toMatch(/feet/);
  });

  it('§1890 — distance diff ≤ 0.50 ft → no DISTANCE_MISMATCH', () => {
    const traverse = makeTraverse([makeLeg({ bearing: 90, distance: 100.0 })]);
    const deed = makeDeed([makeCall({ bearing: 90, distance: 100.4 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons[0].distanceOk).toBe(true);
    expect(
      result.discrepancies.find((d) => d.type === 'DISTANCE_MISMATCH'),
    ).toBeUndefined();
  });

  // ── §1891: Call count mismatch detected ───────────────────────────────────

  it('§1891 — deed call count != traverse leg count → CALL_COUNT_MISMATCH', () => {
    const traverse = makeTraverse([makeLeg({}), makeLeg({}), makeLeg({})]);
    const deed = makeDeed([makeCall({}, 0), makeCall({}, 1)]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    const ccm = result.discrepancies.find((d) => d.type === 'CALL_COUNT_MISMATCH');
    expect(ccm).toBeDefined();
    expect(ccm!.fieldValue).toBe('3 legs');
    expect(ccm!.recordValue).toBe('2 calls');
  });

  it('§1891 — matching call count → no CALL_COUNT_MISMATCH', () => {
    const traverse = makeTraverse([makeLeg({}), makeLeg({})]);
    const deed = makeDeed([makeCall({}, 0), makeCall({}, 1)]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(
      result.discrepancies.find((d) => d.type === 'CALL_COUNT_MISMATCH'),
    ).toBeUndefined();
  });

  // ── §1892: Overall match score / confidence contribution ─────────────────

  it('§1892 — both bearing + distance match → confidenceContribution = 1.0', () => {
    const traverse = makeTraverse([makeLeg({ bearing: 90, distance: 100 })]);
    const deed = makeDeed([makeCall({ bearing: 90, distance: 100 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons[0].overallMatch).toBe(true);
    expect(result.callComparisons[0].confidenceContribution).toBeCloseTo(1.0, 5);
  });

  it('§1892 — bearing matches, distance fails → contribution 0.5', () => {
    const traverse = makeTraverse([makeLeg({ bearing: 90, distance: 100 })]);
    const deed = makeDeed([makeCall({ bearing: 90, distance: 110 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons[0].confidenceContribution).toBeCloseTo(0.5, 5);
    expect(result.callComparisons[0].overallMatch).toBe(false);
  });

  it('§1892 — both bearing and distance fail → contribution 0.0', () => {
    const traverse = makeTraverse([makeLeg({ bearing: 90, distance: 100 })]);
    const deed = makeDeed([makeCall({ bearing: 100, distance: 110 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.callComparisons[0].confidenceContribution).toBeCloseTo(0.0, 5);
    expect(result.callComparisons[0].overallMatch).toBe(false);
  });

  it('§1892 — per-feature confidenceAdjustment: full match → +15', () => {
    const traverse = makeTraverse([
      makeLeg({ fromPointId: 'p1', bearing: 90, distance: 100 }),
    ]);
    const deed = makeDeed([makeCall({ bearing: 90, distance: 100 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.confidenceAdjustments.get('p1')).toBe(15);
  });

  it('§1892 — per-feature confidenceAdjustment: both fail → -20', () => {
    const traverse = makeTraverse([
      makeLeg({ fromPointId: 'p1', bearing: 90, distance: 100 }),
    ]);
    const deed = makeDeed([makeCall({ bearing: 100, distance: 110 })]);
    const result = reconcileDeed(traverse, deed, [], new Map());
    expect(result.confidenceAdjustments.get('p1')).toBe(-20);
  });
});

// Silence unused-import warning for SurveyPoint — kept as a type hint
// for future point-aware tests.
void (null as SurveyPoint | null);
