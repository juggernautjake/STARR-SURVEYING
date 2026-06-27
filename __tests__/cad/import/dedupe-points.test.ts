// __tests__/cad/import/dedupe-points.test.ts
//
// cad-duplicate-point-handling Slice 1 — pure deduper for
// colliding pointNumbers across or within layers.

import { describe, it, expect } from 'vitest';
import { dedupePointNumbers, formatRenames } from '@/lib/cad/import/dedupe-points';
import type { SurveyPoint } from '@/lib/cad/types';

function mk(over: Partial<SurveyPoint> & Pick<SurveyPoint, 'id' | 'pointNumber' | 'pointName' | 'layerId'>): SurveyPoint {
  return {
    parsedName: { rawName: '', basePart: '', numericPart: over.pointNumber, suffix: null, normalizedSuffix: 'NONE', suffixConfidence: 1 } as never,
    northing: 0, easting: 0, elevation: 0,
    rawCode: '', parsedCode: { rawCode: '', baseCode: '', numericCode: '', alphaCode: '' } as never,
    resolvedAlphaCode: '', resolvedNumericCode: '', codeSuffix: null,
    codeDefinition: { name: 'x', baseCode: 'x', connectType: 'POINT' } as never,
    monumentAction: null, description: '', rawRecord: '', importSource: '',
    featureId: '', lineStringIds: [], validationIssues: [],
    confidence: 1, isAccepted: true,
    ...over,
  } as SurveyPoint;
}

describe('dedupePointNumbers — Slice 1', () => {
  it('leaves a clean set untouched (no collisions, no renames)', () => {
    const points = [
      mk({ id: 'a', pointNumber: 1, pointName: '1', layerId: 'Topo' }),
      mk({ id: 'b', pointNumber: 2, pointName: '2', layerId: 'Topo' }),
      mk({ id: 'c', pointNumber: 3, pointName: '3', layerId: 'Bound' }),
    ];
    const { renamed, renames } = dedupePointNumbers(points);
    expect(renames).toEqual([]);
    expect(renamed.map((p) => p.pointName)).toEqual(['1', '2', '3']);
  });

  it('renames a SAME-LAYER duplicate to <name>:1', () => {
    const points = [
      mk({ id: 'a', pointNumber: 23, pointName: '23', layerId: 'Topo' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23', layerId: 'Topo' }),
    ];
    const { renamed, renames } = dedupePointNumbers(points);
    expect(renamed[0].pointName).toBe('23');
    expect(renamed[1].pointName).toBe('23:1');
    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatchObject({
      surveyPointId: 'b',
      fromName: '23',
      toName: '23:1',
      baseLayerId: 'Topo',
      thisLayerId: 'Topo',
      kind: 'SAME_LAYER',
    });
  });

  it('renames a CROSS-LAYER duplicate + tags the kind', () => {
    const points = [
      mk({ id: 'a', pointNumber: 23, pointName: '23', layerId: 'Topo' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23', layerId: 'Boundaries' }),
    ];
    const { renamed, renames } = dedupePointNumbers(points);
    expect(renamed[1].pointName).toBe('23:1');
    expect(renames[0]).toMatchObject({
      kind: 'CROSS_LAYER',
      baseLayerId: 'Topo',
      thisLayerId: 'Boundaries',
    });
  });

  it('multiple collisions count up: 23 → 23 / 23:1 / 23:2 / 23:3', () => {
    const points = [
      mk({ id: 'a', pointNumber: 23, pointName: '23', layerId: 'A' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23', layerId: 'B' }),
      mk({ id: 'c', pointNumber: 23, pointName: '23', layerId: 'C' }),
      mk({ id: 'd', pointNumber: 23, pointName: '23', layerId: 'D' }),
    ];
    const { renamed } = dedupePointNumbers(points);
    expect(renamed.map((p) => p.pointName)).toEqual(['23', '23:1', '23:2', '23:3']);
  });

  it('skips suffixes already in use by the source (existing :1 stays, new dup gets :2)', () => {
    const points = [
      mk({ id: 'a', pointNumber: 23, pointName: '23', layerId: 'A' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23:1', layerId: 'A' }), // distinct name — NOT a collision
      mk({ id: 'c', pointNumber: 23, pointName: '23', layerId: 'B' }),
    ];
    const { renamed, renames } = dedupePointNumbers(points);
    // `a` keeps `23`. `b` is named `23:1` — a DISTINCT name, so it is
    // left untouched (no collision on name). `c` is the second `23`,
    // so it collides; the next free suffix is `:2` since `23:1` is
    // already taken by `b`.
    expect(renamed[0].pointName).toBe('23');
    expect(renamed[1].pointName).toBe('23:1');
    expect(renamed[2].pointName).toBe('23:2');
    expect(renames).toHaveLength(1);
  });

  it('keeps distinct codes that share leading digits (the user\'s 23calc/23cald/23set case)', () => {
    // Regression: the parser derives pointNumber from leading digits,
    // so "23calc", "23cald" and "23set" all become pointNumber 23.
    // Dedup must key on the displayed NAME, not the number — these are
    // three genuinely different point codes and must import as-is.
    const points = [
      mk({ id: 'a', pointNumber: 23, pointName: '23calc', layerId: 'A' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23cald', layerId: 'A' }),
      mk({ id: 'c', pointNumber: 23, pointName: '23set', layerId: 'A' }),
      mk({ id: 'd', pointNumber: 24, pointName: '24calc', layerId: 'A' }),
      mk({ id: 'e', pointNumber: 24, pointName: '24cald', layerId: 'A' }),
    ];
    const { renamed, renames } = dedupePointNumbers(points);
    expect(renames).toEqual([]);
    expect(renamed.map((p) => p.pointName)).toEqual([
      '23calc', '23cald', '23set', '24calc', '24cald',
    ]);
  });

  it('preserves source order in the renamed array', () => {
    const points = [
      mk({ id: 'a', pointNumber: 5, pointName: '5', layerId: 'A' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23', layerId: 'A' }),
      mk({ id: 'c', pointNumber: 5, pointName: '5', layerId: 'B' }),
      mk({ id: 'd', pointNumber: 23, pointName: '23', layerId: 'B' }),
    ];
    const { renamed } = dedupePointNumbers(points);
    expect(renamed.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(renamed.map((p) => p.pointName)).toEqual(['5', '23', '5:1', '23:1']);
  });

  it('stamps originalPointName on every renamed entry (untouched on the base)', () => {
    const points = [
      mk({ id: 'a', pointNumber: 23, pointName: '23', layerId: 'A' }),
      mk({ id: 'b', pointNumber: 23, pointName: '23', layerId: 'B' }),
    ];
    const { renamed } = dedupePointNumbers(points) as { renamed: Array<SurveyPoint & { originalPointName?: string }> };
    expect(renamed[0].originalPointName).toBeUndefined();
    expect(renamed[1].originalPointName).toBe('23');
  });

  it('handles the same pointNumber appearing 20 times (the user\'s extreme case)', () => {
    const points: SurveyPoint[] = [];
    for (let i = 0; i < 20; i++) {
      points.push(mk({ id: `p${i}`, pointNumber: 31, pointName: '31', layerId: i % 2 === 0 ? 'A' : 'B' }));
    }
    const { renamed, renames } = dedupePointNumbers(points);
    expect(renames).toHaveLength(19);
    expect(renamed[0].pointName).toBe('31');
    expect(renamed[19].pointName).toBe('31:19');
    // Cross-layer kind toggles based on the FIRST occurrence's layer.
    expect(renames[0].kind).toBe('CROSS_LAYER'); // p1 (layer B) vs p0 (layer A)
  });
});

describe('formatRenames — pretty-print', () => {
  it('returns an empty string for no renames', () => {
    expect(formatRenames([])).toBe('');
  });

  it('two-line format includes name change + layer info per entry', () => {
    const lines = formatRenames([
      { surveyPointId: 'x', fromName: '23', toName: '23:1', baseLayerId: 'Topo', thisLayerId: 'Boundaries', kind: 'CROSS_LAYER' },
      { surveyPointId: 'y', fromName: '23', toName: '23:2', baseLayerId: 'Topo', thisLayerId: 'Topo', kind: 'SAME_LAYER' },
    ]).split('\n');
    expect(lines[0]).toContain('23 → 23:1');
    expect(lines[0]).toContain('cross-layer: Topo → Boundaries');
    expect(lines[1]).toContain('23 → 23:2');
    expect(lines[1]).toContain('same-layer (Topo)');
  });
});
