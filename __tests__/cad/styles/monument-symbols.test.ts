// __tests__/cad/styles/monument-symbols.test.ts — Unit tests for monument resolution
import { describe, it, expect } from 'vitest';
import { resolveMonumentVisuals } from '@/lib/cad/styles/monument-symbols';
import type { PointCodeDefinition } from '@/lib/cad/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeBoundaryCode(overrides: Partial<PointCodeDefinition> = {}): PointCodeDefinition {
  return {
    alphaCode: 'BC02', numericCode: '309',
    description: '1/2" IR', category: 'BOUNDARY_CONTROL',
    subcategory: 'Iron Rod',
    connectType: 'POINT',
    isAutoSpline: false,
    defaultSymbolId: '',
    defaultColor: '#000000',
    defaultLineTypeId: 'SOLID',
    defaultLineWeight: 0.25,
    defaultLabelFormat: '{code}',
    defaultLayerId: 'BOUNDARY-MON',
    simplifiedCode: 'BC02',
    simplifiedDescription: '1/2" IR',
    collapses: false,
    monumentType: 'Iron Rod',
    monumentSize: '1/2"',
    monumentAction: null,
    isBuiltIn: true,
    isNew: false,
    notes: '',
    ...overrides,
  };
}

// ── resolveMonumentVisuals ────────────────────────────────────────────────────

describe('resolveMonumentVisuals', () => {
  it('returns GENERIC_CROSS with black for null codeDefinition', () => {
    const result = resolveMonumentVisuals(null, null);
    expect(result.symbolId).toBe('GENERIC_CROSS');
    expect(result.color).toBe('#000000');
  });

  it('returns code defaultSymbolId when set on non-BOUNDARY_CONTROL code', () => {
    const code = makeBoundaryCode({ category: 'UTILITIES', defaultSymbolId: 'UTIL_HYDRANT' });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBe('UTIL_HYDRANT');
  });

  it('returns GENERIC_CROSS for non-BOUNDARY_CONTROL code without defaultSymbolId', () => {
    const code = makeBoundaryCode({ category: 'UTILITIES', defaultSymbolId: '' });
    const result = resolveMonumentVisuals(code, null);
    expect(result.symbolId).toBe('GENERIC_CROSS');
    expect(result.color).toBe('#000000');
  });

  it('uses expanded code defaultSymbolId when set (bypasses monument action logic)', () => {
    const code = makeBoundaryCode({ defaultSymbolId: 'MON_IR_050_SET' });
    const result = resolveMonumentVisuals(code, 'FOUND'); // action ignored when symbolId is set
    expect(result.symbolId).toBe('MON_IR_050_SET');
  });

  // ── Monument action → symbol resolution ──────────────────────────────────

  it('FOUND action resolves to black color', () => {
    const result = resolveMonumentVisuals(makeBoundaryCode(), 'FOUND');
    expect(result.color).toBe('#000000');
  });

  it('SET action resolves to red color', () => {
    const result = resolveMonumentVisuals(makeBoundaryCode(), 'SET');
    expect(result.color).toBe('#FF0000');
  });

  it('CALCULATED action resolves to magenta color', () => {
    const result = resolveMonumentVisuals(makeBoundaryCode(), 'CALCULATED');
    expect(result.color).toBe('#FF00FF');
  });

  it('null monument action defaults to FOUND (black)', () => {
    const result = resolveMonumentVisuals(makeBoundaryCode(), null);
    expect(result.color).toBe('#000000');
    expect(result.symbolId).toBeTruthy();
  });

  it('UNKNOWN monument action defaults to FOUND (black)', () => {
    const result = resolveMonumentVisuals(makeBoundaryCode(), 'UNKNOWN');
    expect(result.color).toBe('#000000');
  });

  // ── Iron rod size resolution ──────────────────────────────────────────────

  it('1/2" IR FOUND → MON_IR_050_FOUND', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Rod', monumentSize: '1/2"' });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBe('MON_IR_050_FOUND');
    expect(result.color).toBe('#000000');
  });

  it('1/2" IR SET → MON_IR_050_SET', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Rod', monumentSize: '1/2"' });
    const result = resolveMonumentVisuals(code, 'SET');
    expect(result.symbolId).toBe('MON_IR_050_SET');
    expect(result.color).toBe('#FF0000');
  });

  it('1/2" IR CALC → MON_IR_050_CALC', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Rod', monumentSize: '1/2"' });
    const result = resolveMonumentVisuals(code, 'CALCULATED');
    expect(result.symbolId).toBe('MON_IR_050_CALC');
    expect(result.color).toBe('#FF00FF');
  });

  it('5/8" IR FOUND → MON_IR_058_FOUND', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Rod', monumentSize: '5/8"' });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBe('MON_IR_058_FOUND');
  });

  it('3/8" IR SET → MON_IR_038_SET', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Rod', monumentSize: '3/8"' });
    const result = resolveMonumentVisuals(code, 'SET');
    expect(result.symbolId).toBe('MON_IR_038_SET');
  });

  it('3/4" IR CALC → MON_IR_075_CALC', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Rod', monumentSize: '3/4"' });
    const result = resolveMonumentVisuals(code, 'CALCULATED');
    expect(result.symbolId).toBe('MON_IR_075_CALC');
  });

  // ── Iron pipe resolution ──────────────────────────────────────────────────

  it('Iron Pipe FOUND → MON_IP_FOUND', () => {
    const code = makeBoundaryCode({ monumentType: 'Iron Pipe', monumentSize: '' });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBe('MON_IP_FOUND');
  });

  // ── Concrete monument resolution ──────────────────────────────────────────

  it('Concrete Monument FOUND → MON_CONC_FOUND', () => {
    const code = makeBoundaryCode({ monumentType: 'Concrete Monument', monumentSize: '' });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBe('MON_CONC_FOUND');
  });

  // ── Unknown type falls back gracefully ────────────────────────────────────

  it('unknown monument type falls back to MON_GENERIC_FOUND (not crash)', () => {
    const code = makeBoundaryCode({ monumentType: 'Mystery Metal', monumentSize: '' });
    const result = resolveMonumentVisuals(code, 'FOUND');
    // Should fall back to generic, not throw
    expect(result.symbolId).toBeTruthy();
    expect(result.symbolId).toContain('GENERIC');
    expect(result.color).toBe('#000000');
  });

  it('unknown monument type SET falls back to MON_GENERIC_SET', () => {
    const code = makeBoundaryCode({ monumentType: 'UNKNOWN_TYPE', monumentSize: '' });
    const result = resolveMonumentVisuals(code, 'SET');
    expect(result.symbolId).toBeTruthy();
    expect(result.color).toBe('#FF0000');
  });

  it('unknown monument type CALCULATED falls back to MON_GENERIC_CALC', () => {
    const code = makeBoundaryCode({ monumentType: 'UNKNOWN_TYPE', monumentSize: '' });
    const result = resolveMonumentVisuals(code, 'CALCULATED');
    expect(result.symbolId).toBeTruthy();
    expect(result.color).toBe('#FF00FF');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('handles null monumentType gracefully (defaults to Generic)', () => {
    const code = makeBoundaryCode({ monumentType: null });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBeTruthy();
    expect(result.color).toBe('#000000');
  });

  it('handles null monumentSize gracefully', () => {
    const code = makeBoundaryCode({ monumentSize: null });
    const result = resolveMonumentVisuals(code, 'FOUND');
    expect(result.symbolId).toBeTruthy();
  });

  it('symbolId is never empty string', () => {
    const cases: Array<[PointCodeDefinition | null, Parameters<typeof resolveMonumentVisuals>[1]]> = [
      [null, null],
      [makeBoundaryCode(), 'FOUND'],
      [makeBoundaryCode(), 'SET'],
      [makeBoundaryCode(), 'CALCULATED'],
      [makeBoundaryCode({ monumentType: 'UNKNOWN' }), 'FOUND'],
    ];
    for (const [code, action] of cases) {
      const result = resolveMonumentVisuals(code, action);
      expect(result.symbolId, `symbolId for action=${action}`).toBeTruthy();
    }
  });
});
