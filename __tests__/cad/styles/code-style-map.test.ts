// __tests__/cad/styles/code-style-map.test.ts — Unit tests for code-to-style mapping
import { describe, it, expect } from 'vitest';
import { buildDefaultCodeStyleMap } from '@/lib/cad/styles/code-style-map';
import type { PointCodeDefinition } from '@/lib/cad/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCode(overrides: Partial<PointCodeDefinition> = {}): PointCodeDefinition {
  return {
    alphaCode: 'BC02', numericCode: '309',
    description: '1/2" Iron Rod', category: 'BOUNDARY_CONTROL',
    subcategory: 'Iron Rod',
    connectType: 'POINT',
    defaultSymbolId: 'MON_IR_050_FOUND',
    defaultColor: '#000000',
    defaultLineTypeId: 'SOLID',
    defaultLineWeight: 0.25,
    defaultLabelFormat: '{code}',
    defaultLayerId: 'BOUNDARY-MON',
    monumentType: 'Iron Rod',
    monumentSize: '1/2"',
    monumentAction: null,
    isBuiltIn: true,
    isNew: false,
    notes: '',
    ...overrides,
  };
}

// ── buildDefaultCodeStyleMap ──────────────────────────────────────────────────

describe('buildDefaultCodeStyleMap', () => {
  it('returns an empty map for empty input', () => {
    const map = buildDefaultCodeStyleMap([]);
    expect(map.size).toBe(0);
  });

  it('indexes by alphaCode', () => {
    const map = buildDefaultCodeStyleMap([makeCode()]);
    expect(map.has('BC02')).toBe(true);
  });

  it('indexes by numericCode when present', () => {
    const map = buildDefaultCodeStyleMap([makeCode()]);
    expect(map.has('309')).toBe(true);
  });

  it('both alphaCode and numericCode entries point to the same mapping', () => {
    const map = buildDefaultCodeStyleMap([makeCode()]);
    expect(map.get('BC02')).toBe(map.get('309'));
  });

  it('uses code defaultSymbolId for symbolId', () => {
    const code = makeCode({ defaultSymbolId: 'MON_IR_050_FOUND' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.symbolId).toBe('MON_IR_050_FOUND');
  });

  it('falls back to GENERIC_CROSS when defaultSymbolId is empty', () => {
    const code = makeCode({ defaultSymbolId: '' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.symbolId).toBe('GENERIC_CROSS');
  });

  it('sets symbolSize to 2.5 for POINT codes', () => {
    const code = makeCode({ connectType: 'POINT' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.symbolSize).toBe(2.5);
  });

  it('sets symbolSize to 0 for LINE/POLYLINE codes (no point symbol needed)', () => {
    const code = makeCode({ connectType: 'POLYLINE' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.symbolSize).toBe(0);
  });

  it('sets lineTypeId from code defaultLineTypeId', () => {
    const code = makeCode({ defaultLineTypeId: 'DASHED' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.lineTypeId).toBe('DASHED');
  });

  it('falls back to SOLID when defaultLineTypeId is falsy', () => {
    const code = makeCode({ defaultLineTypeId: '' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.lineTypeId).toBe('SOLID');
  });

  it('sets lineWeight from code defaultLineWeight', () => {
    const code = makeCode({ defaultLineWeight: 0.5 });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.lineWeight).toBe(0.5);
  });

  it('sets lineColor and symbolColor from code defaultColor', () => {
    const code = makeCode({ defaultColor: '#FF0000' });
    const map = buildDefaultCodeStyleMap([code]);
    const mapping = map.get('BC02')!;
    expect(mapping.lineColor).toBe('#FF0000');
    expect(mapping.symbolColor).toBe('#FF0000');
  });

  it('sets layerId from code defaultLayerId', () => {
    const code = makeCode({ defaultLayerId: 'CONTROL' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.layerId).toBe('CONTROL');
  });

  it('falls back to MISC layerId when defaultLayerId is falsy', () => {
    const code = makeCode({ defaultLayerId: '' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.get('BC02')?.layerId).toBe('MISC');
  });

  it('sets isUserModified to false', () => {
    const map = buildDefaultCodeStyleMap([makeCode()]);
    expect(map.get('BC02')?.isUserModified).toBe(false);
  });

  it('handles multiple codes without cross-contamination', () => {
    const codes = [
      makeCode({ alphaCode: 'BC02', numericCode: '309', defaultColor: '#000000' }),
      makeCode({ alphaCode: 'SC01', numericCode: '300', defaultColor: '#FF0000' }),
    ];
    const map = buildDefaultCodeStyleMap(codes);
    expect(map.get('BC02')?.lineColor).toBe('#000000');
    expect(map.get('SC01')?.lineColor).toBe('#FF0000');
    expect(map.get('309')?.lineColor).toBe('#000000');
    expect(map.get('300')?.lineColor).toBe('#FF0000');
  });

  it('handles code with empty numericCode (no numeric index)', () => {
    const code = makeCode({ numericCode: '' });
    const map = buildDefaultCodeStyleMap([code]);
    expect(map.has('BC02')).toBe(true);
    expect(map.has('')).toBe(false);
  });
});
