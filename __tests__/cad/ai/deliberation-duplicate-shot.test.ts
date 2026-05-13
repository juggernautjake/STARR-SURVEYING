// __tests__/cad/ai/deliberation-duplicate-shot.test.ts
//
// Phase 6 §28.2 step-7 — Duplicate-shot disambiguation.
// Covers §3093 from `docs/planning/in-progress/STARR_CAD/STARR_CAD_PHASE_6_AI_ENGINE.md`:
//   "Duplicate shots → 'which is final?' question generated"
//
// The deliberation step receives PointGroup[] and emits a HIGH-priority
// DUPLICATE_SHOT question when the group carries both a CALC and a
// field (SET / FOUND) position and their delta crosses the 0.10 ft
// threshold baked into `lib/cad/codes/point-grouping.ts`.

import { describe, it, expect } from 'vitest';
import { runDeliberation } from '@/lib/cad/ai-engine/deliberation';
import type { PointGroup, SurveyPoint } from '@/lib/cad/types';

function mkPoint(overrides: Partial<SurveyPoint> & { id: string }): SurveyPoint {
  return {
    pointNumber: 1,
    pointName: '1',
    parsedName: {
      baseNumber: 1,
      suffix: '',
      normalizedSuffix: 'NONE',
      suffixVariant: '',
      suffixConfidence: 1.0,
      isRecalc: false,
      recalcSequence: 0,
    },
    northing: 0,
    easting: 0,
    elevation: null,
    rawCode: 'BC01',
    parsedCode: {
      rawCode: 'BC01',
      baseCode: 'BC01',
      isNumeric: false,
      isAlpha: true,
      suffix: null,
      isValid: true,
      isLineCode: false,
      isAutoSpline: false,
    },
    resolvedAlphaCode: 'BC01',
    resolvedNumericCode: '308',
    codeSuffix: null,
    codeDefinition: null,
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: 'test',
    layerId: '0',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1.0,
    isAccepted: true,
    ...overrides,
  } as SurveyPoint;
}

function mkGroup(over: Partial<PointGroup>): PointGroup {
  const setPoint = mkPoint({ id: 'set', pointName: '1set' });
  return {
    baseNumber: 1,
    allPoints: [setPoint],
    calculated: [],
    found: null,
    set: setPoint,
    none: [],
    finalPoint: setPoint,
    finalSource: 'SET',
    calcSetDelta: null,
    calcFoundDelta: null,
    hasBothCalcAndField: false,
    deltaWarning: false,
    ...over,
  };
}

describe('Phase 6 §28.2 step-7 — duplicate-shot deliberation', () => {
  it('§3093 — group with deltaWarning + hasBothCalcAndField emits a DUPLICATE_SHOT question', () => {
    const calc = mkPoint({ id: 'calc', pointName: '1calc' });
    const set = mkPoint({ id: 'set', pointName: '1set', easting: 0.5 });
    const group = mkGroup({
      allPoints: [calc, set],
      calculated: [calc],
      set,
      finalPoint: set,
      finalSource: 'SET',
      calcSetDelta: 0.5,
      hasBothCalcAndField: true,
      deltaWarning: true,
    });
    const result = runDeliberation({
      features: [],
      classified: [],
      reconciliation: null,
      offsetDetail: null,
      enrichment: null,
      scores: new Map(),
      pointGroups: [group],
    });
    const dupes = result.questions.filter(
      (q) => q.category === 'DUPLICATE_SHOT'
    );
    expect(dupes).toHaveLength(1);
    expect(dupes[0].priority).toBe('HIGH');
    expect(dupes[0].relatedIds).toEqual(['calc', 'set']);
    expect(dupes[0].options).toEqual([
      'Use set shot (current)',
      'Use calculated position',
      'Flag for surveyor review',
    ]);
    expect(dupes[0].question).toContain('0.50');
  });

  it('§3093 — group without deltaWarning produces no DUPLICATE_SHOT question', () => {
    const group = mkGroup({
      hasBothCalcAndField: true,
      calcSetDelta: 0.05, // well below the 0.10 ft tolerance
      deltaWarning: false,
    });
    const result = runDeliberation({
      features: [],
      classified: [],
      reconciliation: null,
      offsetDetail: null,
      enrichment: null,
      scores: new Map(),
      pointGroups: [group],
    });
    expect(
      result.questions.filter((q) => q.category === 'DUPLICATE_SHOT')
    ).toHaveLength(0);
  });

  it('§3093 — group without both calc + field (SET-only) is skipped', () => {
    const group = mkGroup({
      hasBothCalcAndField: false,
      // hypothetical deltaWarning without a paired calc — should not fire
      deltaWarning: true,
    });
    const result = runDeliberation({
      features: [],
      classified: [],
      reconciliation: null,
      offsetDetail: null,
      enrichment: null,
      scores: new Map(),
      pointGroups: [group],
    });
    expect(
      result.questions.filter((q) => q.category === 'DUPLICATE_SHOT')
    ).toHaveLength(0);
  });

  it('§3093 — group with calc + FOUND emits "Use found shot" option', () => {
    const calc = mkPoint({ id: 'calc' });
    const found = mkPoint({ id: 'found', pointName: '1fnd' });
    const group = mkGroup({
      allPoints: [calc, found],
      calculated: [calc],
      set: null,
      found,
      finalPoint: found,
      finalSource: 'FOUND',
      calcSetDelta: null,
      calcFoundDelta: 0.25,
      hasBothCalcAndField: true,
      deltaWarning: true,
    });
    const result = runDeliberation({
      features: [],
      classified: [],
      reconciliation: null,
      offsetDetail: null,
      enrichment: null,
      scores: new Map(),
      pointGroups: [group],
    });
    const dupes = result.questions.filter(
      (q) => q.category === 'DUPLICATE_SHOT'
    );
    expect(dupes).toHaveLength(1);
    expect(dupes[0].options?.[0]).toBe('Use found shot (current)');
    expect(dupes[0].question).toContain('found');
  });
});
