// __tests__/cad/import/validation-dedup.test.ts
//
// cad-import-validation-dedup-and-copy Slice 1 — pure validator
// now dedupes duplicate-point warnings (1 per id instead of 1 per
// occurrence) + splits zero-coords into aggregated (both axes 0
// = placeholder) vs per-point (one axis 0 = suspect partial
// export).

import { describe, it, expect } from 'vitest';
import { validatePoints } from '@/lib/cad/import/validation';
import type { SurveyPoint } from '@/lib/cad/types';

function mkPoint(over: Partial<SurveyPoint> & Pick<SurveyPoint, 'id' | 'pointNumber' | 'northing' | 'easting'>): SurveyPoint {
  return {
    pointName: String(over.pointNumber),
    parsedName: { rawName: '', basePart: '', numericPart: over.pointNumber, suffix: null, normalizedSuffix: 'NONE', suffixConfidence: 1 } as never,
    elevation: 0,
    rawCode: '',
    parsedCode: { rawCode: '', baseCode: '', numericCode: '', alphaCode: '' } as never,
    resolvedAlphaCode: '',
    resolvedNumericCode: '',
    codeSuffix: null,
    codeDefinition: { name: 'x', baseCode: 'x', connectType: 'POINT' } as never,
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: 't',
    layerId: '0',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1,
    isAccepted: true,
    ...over,
  } as SurveyPoint;
}

describe('validatePoints — Slice 1: duplicate-point dedup', () => {
  it('20 occurrences of point number 31 emit ONE warning (was: 20)', () => {
    const points: SurveyPoint[] = [];
    for (let i = 0; i < 20; i++) points.push(mkPoint({ id: `p31-${i}`, pointNumber: 31, northing: 100 + i, easting: 200 + i }));
    const issues = validatePoints(points, [], new Map());
    const dupIssues = issues.filter((i) => i.type === 'DUPLICATE_POINT_NUMBER');
    expect(dupIssues.length).toBe(1);
    expect(dupIssues[0].message).toBe('Duplicate point number 31 (20 occurrences)');
    expect(dupIssues[0].severity).toBe('WARNING');
  });

  it('multiple distinct duplicate ids each get their own single issue', () => {
    const points: SurveyPoint[] = [
      mkPoint({ id: 'a1', pointNumber: 31, northing: 1, easting: 1 }),
      mkPoint({ id: 'a2', pointNumber: 31, northing: 2, easting: 2 }),
      mkPoint({ id: 'b1', pointNumber: 42, northing: 3, easting: 3 }),
      mkPoint({ id: 'b2', pointNumber: 42, northing: 4, easting: 4 }),
      mkPoint({ id: 'b3', pointNumber: 42, northing: 5, easting: 5 }),
    ];
    const issues = validatePoints(points, [], new Map());
    const dupIssues = issues.filter((i) => i.type === 'DUPLICATE_POINT_NUMBER');
    expect(dupIssues.length).toBe(2);
    expect(dupIssues.map((i) => i.message).sort()).toEqual([
      'Duplicate point number 31 (2 occurrences)',
      'Duplicate point number 42 (3 occurrences)',
    ]);
  });

  it('the duplicate issue carries affectedPointIds for downstream linking', () => {
    const points: SurveyPoint[] = [
      mkPoint({ id: 'a', pointNumber: 31, northing: 1, easting: 1 }),
      mkPoint({ id: 'b', pointNumber: 31, northing: 2, easting: 2 }),
      mkPoint({ id: 'c', pointNumber: 31, northing: 3, easting: 3 }),
    ];
    const issues = validatePoints(points, [], new Map()) as Array<typeof points[number]['validationIssues'][number] & { affectedPointIds?: string[] }>;
    const dup = issues.find((i) => i.type === 'DUPLICATE_POINT_NUMBER')!;
    expect(dup.affectedPointIds).toEqual(['a', 'b', 'c']);
  });
});

describe('validatePoints — Slice 1: zero-coord triage', () => {
  it('132 points with both N and E === 0 produce ONE aggregated WARNING (was: 132 ERRORs)', () => {
    const points: SurveyPoint[] = [];
    for (let i = 0; i < 132; i++) points.push(mkPoint({ id: `z${i}`, pointNumber: 100 + i, northing: 0, easting: 0 }));
    const issues = validatePoints(points, [], new Map());
    const zeroIssues = issues.filter((i) => i.type === 'ZERO_COORDINATES');
    expect(zeroIssues.length).toBe(1);
    expect(zeroIssues[0].severity).toBe('WARNING');
    expect(zeroIssues[0].message).toMatch(/^132 points have placeholder \(0, 0\) coordinates/);
  });

  it('a point with only northing === 0 stays a per-point ERROR (suspect partial-export)', () => {
    const points: SurveyPoint[] = [
      mkPoint({ id: 'a', pointNumber: 1, northing: 0, easting: 50, pointName: 'a' }),
    ];
    const issues = validatePoints(points, [], new Map());
    const zeroIssues = issues.filter((i) => i.type === 'ZERO_COORDINATES');
    expect(zeroIssues.length).toBe(1);
    expect(zeroIssues[0].severity).toBe('ERROR');
    expect(zeroIssues[0].message).toMatch(/zero northing.*partial-export bug/);
  });

  it('a point with only easting === 0 also stays a per-point ERROR', () => {
    const points: SurveyPoint[] = [
      mkPoint({ id: 'b', pointNumber: 2, northing: 100, easting: 0, pointName: 'b' }),
    ];
    const issues = validatePoints(points, [], new Map());
    const zeroIssues = issues.filter((i) => i.type === 'ZERO_COORDINATES');
    expect(zeroIssues[0].severity).toBe('ERROR');
    expect(zeroIssues[0].message).toMatch(/zero easting.*partial-export bug/);
  });

  it('mixed: 5 placeholders + 2 partial-export bugs → 1 aggregated warning + 2 per-point errors', () => {
    const points: SurveyPoint[] = [];
    for (let i = 0; i < 5; i++) points.push(mkPoint({ id: `p${i}`, pointNumber: 50 + i, northing: 0, easting: 0 }));
    points.push(mkPoint({ id: 'q1', pointNumber: 99, northing: 0, easting: 10, pointName: 'q1' }));
    points.push(mkPoint({ id: 'q2', pointNumber: 100, northing: 20, easting: 0, pointName: 'q2' }));
    const issues = validatePoints(points, [], new Map());
    const zeroErrors = issues.filter((i) => i.type === 'ZERO_COORDINATES' && i.severity === 'ERROR');
    const zeroWarnings = issues.filter((i) => i.type === 'ZERO_COORDINATES' && i.severity === 'WARNING');
    expect(zeroErrors.length).toBe(2);
    expect(zeroWarnings.length).toBe(1);
    expect(zeroWarnings[0].message).toMatch(/^5 points have placeholder/);
  });

  it('the aggregated placeholder warning includes the first 5 point names as a preview', () => {
    const points: SurveyPoint[] = [];
    for (let i = 1; i <= 7; i++) points.push(mkPoint({ id: `p${i}`, pointNumber: i, pointName: String(i), northing: 0, easting: 0 }));
    const issues = validatePoints(points, [], new Map());
    const w = issues.find((i) => i.type === 'ZERO_COORDINATES' && i.severity === 'WARNING')!;
    expect(w.message).toMatch(/1, 2, 3, 4, 5, and 2 more/);
  });
});
