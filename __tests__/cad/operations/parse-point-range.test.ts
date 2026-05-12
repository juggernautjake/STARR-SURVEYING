import { describe, it, expect } from 'vitest';
import {
  parsePointRangeString,
  buildPointNoIndex,
} from '@/lib/cad/operations/parse-point-range';

const idx = (entries: Array<[number, string[]]>) =>
  new Map<number, ReadonlyArray<string>>(entries);

describe('parsePointRangeString — happy paths', () => {
  it('single number resolves', () => {
    const r = parsePointRangeString('12', idx([[12, ['feat-12']]]));
    expect(r.resolvedFeatureIds).toEqual(['feat-12']);
    expect(r.missingNumbers).toEqual([]);
  });

  it('comma-separated list', () => {
    const r = parsePointRangeString(
      '12, 14, 19',
      idx([[12, ['a']], [14, ['b']], [19, ['c']]]),
    );
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c']);
  });

  it('hyphen range expands inclusive', () => {
    const map = idx([
      [14, ['a']], [15, ['b']], [16, ['c']],
      [17, ['d']], [18, ['e']], [19, ['f']],
    ]);
    const r = parsePointRangeString('14-19', map);
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(r.tokens[0].numbers).toEqual([14, 15, 16, 17, 18, 19]);
  });

  it('mixed comma + range', () => {
    const map = idx([
      [12, ['a']], [14, ['b']], [15, ['c']],
      [22, ['d']], [30, ['e']], [31, ['f']],
    ]);
    const r = parsePointRangeString('12, 14-15, 22, 30-31', map);
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('whitespace acts as separator', () => {
    const r = parsePointRangeString(
      '12 14 19',
      idx([[12, ['a']], [14, ['b']], [19, ['c']]]),
    );
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c']);
  });

  it('reversed range still expands lo→hi', () => {
    const map = idx([[14, ['a']], [15, ['b']], [16, ['c']]]);
    const r = parsePointRangeString('16-14', map);
    expect(r.tokens[0].numbers).toEqual([14, 15, 16]);
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c']);
  });

  it('semicolons accepted as separators', () => {
    const r = parsePointRangeString('12;14;19', idx([[12, ['a']], [14, ['b']], [19, ['c']]]));
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c']);
  });

  it('trailing comma ignored', () => {
    const r = parsePointRangeString('12, 14,', idx([[12, ['a']], [14, ['b']]]));
    expect(r.resolvedFeatureIds).toEqual(['a', 'b']);
  });

  it('dedupes when ranges overlap', () => {
    const map = idx([[14, ['a']], [15, ['b']], [16, ['c']]]);
    const r = parsePointRangeString('14-16, 15-16', map);
    expect(r.resolvedFeatureIds).toEqual(['a', 'b', 'c']);
  });
});

describe('parsePointRangeString — missing / ambiguous / invalid', () => {
  it('missing numbers surface in missingNumbers', () => {
    const r = parsePointRangeString('12, 27', idx([[12, ['a']]]));
    expect(r.resolvedFeatureIds).toEqual(['a']);
    expect(r.missingNumbers).toEqual([27]);
  });

  it('duplicate point numbers across layers flagged ambiguous', () => {
    const r = parsePointRangeString('12', idx([[12, ['a-on-bdy', 'a-on-mon']]]));
    expect(r.resolvedFeatureIds).toEqual([]);
    expect(r.ambiguousNumbers).toEqual([12]);
    expect(r.tokens[0].resolutions[0]).toMatchObject({
      status: 'AMBIGUOUS',
      pointNo: 12,
      featureIds: ['a-on-bdy', 'a-on-mon'],
    });
  });

  it('invalid token surfaces in invalidTokens', () => {
    const r = parsePointRangeString('12, foo, 19', idx([[12, ['a']], [19, ['b']]]));
    expect(r.invalidTokens).toEqual(['foo']);
    expect(r.resolvedFeatureIds).toEqual(['a', 'b']);
  });

  it('giant range silently rejected', () => {
    const r = parsePointRangeString('1-50000', idx([]));
    expect(r.invalidTokens).toEqual(['1-50000']);
    expect(r.tokens.length).toBe(0);
  });

  it('empty input → all-empty result', () => {
    const r = parsePointRangeString('', idx([]));
    expect(r.tokens).toEqual([]);
    expect(r.resolvedFeatureIds).toEqual([]);
    expect(r.missingNumbers).toEqual([]);
    expect(r.invalidTokens).toEqual([]);
  });

  it('whitespace-only input → all-empty result', () => {
    const r = parsePointRangeString('   ', idx([]));
    expect(r.tokens).toEqual([]);
  });
});

describe('buildPointNoIndex', () => {
  it('groups POINTs by numeric pointNo', () => {
    const features = [
      { id: 'a', type: 'POINT', properties: { pointNo: 12 } },
      { id: 'b', type: 'POINT', properties: { pointNo: 14 } },
      { id: 'c', type: 'POINT', properties: { pointNo: 12 } }, // dupe
      { id: 'd', type: 'POINT', properties: {} },              // missing
      { id: 'e', type: 'LINE',  properties: { pointNo: 99 } }, // non-POINT
    ];
    const map = buildPointNoIndex(features);
    expect(map.get(12)).toEqual(['a', 'c']);
    expect(map.get(14)).toEqual(['b']);
    expect(map.get(99)).toBeUndefined();
  });

  it('parses string-encoded pointNo', () => {
    const features = [{ id: 'a', type: 'POINT', properties: { pointNo: '14' } }];
    const map = buildPointNoIndex(features);
    expect(map.get(14)).toEqual(['a']);
  });
});
