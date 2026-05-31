// __tests__/cad/import/unknown-refs.test.ts
//
// cad-duplicate-point-handling Slice 2 — UNKNOWN_POINT_REFERENCE
// detection. Line-strings that reference a point uuid not in the
// points list surface as structured WARNING issues so the
// Validate UI can group + count + link to them.

import { describe, it, expect } from 'vitest';
import { findUnknownPointRefs, findOrphanPoints } from '@/lib/cad/import/unknown-refs';
import { validatePoints } from '@/lib/cad/import/validation';
import type { SurveyPoint, LineString } from '@/lib/cad/types';

function mkPoint(id: string, pointNumber: number, pointName = String(pointNumber)): SurveyPoint {
  return {
    id, pointNumber, pointName,
    parsedName: { rawName: '', basePart: '', numericPart: pointNumber, suffix: null, normalizedSuffix: 'NONE', suffixConfidence: 1 } as never,
    northing: 100, easting: 100, elevation: 0,
    rawCode: '', parsedCode: { rawCode: '', baseCode: '', numericCode: '', alphaCode: '' } as never,
    resolvedAlphaCode: '', resolvedNumericCode: '', codeSuffix: null,
    codeDefinition: { name: 'x', baseCode: 'x', connectType: 'POINT' } as never,
    monumentAction: null, description: '', rawRecord: '', importSource: '',
    layerId: 'A', featureId: '', lineStringIds: [], validationIssues: [],
    confidence: 1, isAccepted: true,
  } as SurveyPoint;
}

function mkLs(id: string, codeBase: string, pointIds: string[]): LineString {
  return { id, codeBase, pointIds, isClosed: false, segments: [], featureId: null } as LineString;
}

describe('findUnknownPointRefs', () => {
  it('returns no issues when every ref resolves', () => {
    const points = [mkPoint('a', 1), mkPoint('b', 2)];
    const lines = [mkLs('ls1', 'BL', ['a', 'b'])];
    expect(findUnknownPointRefs(points, lines)).toEqual([]);
  });

  it('emits ONE WARNING per dangling ref', () => {
    const points = [mkPoint('a', 1)];
    const lines = [mkLs('ls1', 'BL', ['a', 'ghost', 'phantom'])];
    const issues = findUnknownPointRefs(points, lines);
    expect(issues).toHaveLength(2);
    for (const i of issues) {
      expect(i.type).toBe('UNKNOWN_POINT_REFERENCE');
      expect(i.severity).toBe('WARNING');
      expect(i.pointId).toBe('ls1');
    }
    expect(issues[0].message).toContain('ghost');
    expect(issues[1].message).toContain('phantom');
  });

  it('the message names the code base + the missing ref', () => {
    const points = [mkPoint('a', 1)];
    const lines = [mkLs('ls1', 'BACKWALL', ['a', 'missing-23'])];
    const [issue] = findUnknownPointRefs(points, lines);
    expect(issue.message).toBe('Line string BACKWALL references unknown point id "missing-23"');
  });
});

describe('findOrphanPoints', () => {
  it('returns no issues when every point is referenced', () => {
    const points = [mkPoint('a', 1), mkPoint('b', 2)];
    const lines = [mkLs('ls', 'BL', ['a', 'b'])];
    expect(findOrphanPoints(points, lines)).toEqual([]);
  });

  it('emits an INFO issue per orphan point', () => {
    const points = [mkPoint('a', 1, 'a'), mkPoint('b', 2, 'b'), mkPoint('c', 3, 'c')];
    const lines = [mkLs('ls', 'BL', ['a'])];
    const issues = findOrphanPoints(points, lines);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'INFO')).toBe(true);
    expect(issues.map((i) => i.pointId).sort()).toEqual(['b', 'c']);
  });
});

describe('validatePoints — integrates findUnknownPointRefs', () => {
  it('a polyline with one missing ref surfaces an UNKNOWN_POINT_REFERENCE issue', () => {
    const points = [mkPoint('a', 1, 'a'), mkPoint('b', 2, 'b')];
    const lines = [mkLs('ls1', 'EDGE', ['a', 'phantom'])];
    const issues = validatePoints(points, lines, new Map());
    const unknown = issues.filter((i) => i.type === 'UNKNOWN_POINT_REFERENCE');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].message).toContain('phantom');
  });
});
