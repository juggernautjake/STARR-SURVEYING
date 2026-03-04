// __tests__/cad/styles/symbol-library.test.ts — Unit tests for Phase 3 symbol library
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_SYMBOLS,
  getSymbolById,
  getSymbolsByCategory,
  getSymbolsByAssignedCode,
  findSymbol,
  resolveSymbolWithFallback,
} from '@/lib/cad/styles/symbol-library';

describe('symbol-library', () => {
  // ── Library completeness ────────────────────────────────────────────────

  it('has a non-empty built-in symbol list', () => {
    expect(BUILTIN_SYMBOLS.length).toBeGreaterThan(0);
  });

  it('includes all required generic fallback symbols', () => {
    expect(getSymbolById('GENERIC_CROSS')).toBeDefined();
    expect(getSymbolById('GENERIC_DOT')).toBeDefined();
    expect(getSymbolById('GENERIC_QUESTION')).toBeDefined();
  });

  it('includes MON_GENERIC_FOUND, MON_GENERIC_SET, MON_GENERIC_CALC', () => {
    expect(getSymbolById('MON_GENERIC_FOUND')).toBeDefined();
    expect(getSymbolById('MON_GENERIC_SET')).toBeDefined();
    expect(getSymbolById('MON_GENERIC_CALC')).toBeDefined();
  });

  it('includes iron rod found/set/calc symbols for common sizes', () => {
    const sizes = ['038', '050', '058', '075'];
    for (const size of sizes) {
      expect(getSymbolById(`MON_IR_${size}_FOUND`), `MON_IR_${size}_FOUND`).toBeDefined();
      expect(getSymbolById(`MON_IR_${size}_SET`),   `MON_IR_${size}_SET`).toBeDefined();
      expect(getSymbolById(`MON_IR_${size}_CALC`),  `MON_IR_${size}_CALC`).toBeDefined();
    }
  });

  it('includes fence inline symbols used by line type library', () => {
    expect(getSymbolById('FENCE_BARB_X')).toBeDefined();
    expect(getSymbolById('FENCE_CL_DIAMOND')).toBeDefined();
    expect(getSymbolById('FENCE_BOARD_TICK')).toBeDefined();
    expect(getSymbolById('RR_CROSSTIE')).toBeDefined();
  });

  it('includes utility point symbols', () => {
    expect(getSymbolById('UTIL_HYDRANT')).toBeDefined();
    expect(getSymbolById('UTIL_WATER_METER')).toBeDefined();
    expect(getSymbolById('UTIL_MANHOLE')).toBeDefined();
    expect(getSymbolById('UTIL_POWER_POLE')).toBeDefined();
  });

  it('includes vegetation symbols', () => {
    expect(getSymbolById('VEG_TREE_DECID')).toBeDefined();
    expect(getSymbolById('VEG_TREE_EVERG')).toBeDefined();
  });

  it('includes survey control symbols', () => {
    expect(getSymbolById('CTRL_TRIANGLE')).toBeDefined();
    expect(getSymbolById('CTRL_BENCHMARK')).toBeDefined();
  });

  // ── Symbol structure validation ─────────────────────────────────────────

  it('every symbol has required fields', () => {
    for (const sym of BUILTIN_SYMBOLS) {
      expect(sym.id,            `${sym.id}.id`).toBeTruthy();
      expect(sym.name,          `${sym.id}.name`).toBeTruthy();
      expect(sym.category,      `${sym.id}.category`).toBeTruthy();
      expect(Array.isArray(sym.paths), `${sym.id}.paths`).toBe(true);
      expect(typeof sym.defaultSize, `${sym.id}.defaultSize`).toBe('number');
      expect(sym.defaultSize,   `${sym.id}.defaultSize`).toBeGreaterThan(0);
      expect(sym.minSize,       `${sym.id}.minSize`).toBeGreaterThan(0);
      expect(sym.maxSize,       `${sym.id}.maxSize`).toBeGreaterThanOrEqual(sym.defaultSize);
      expect(['FIXED', 'LAYER', 'CODE']).toContain(sym.colorMode);
    }
  });

  it('every symbol has a unique id', () => {
    const ids = BUILTIN_SYMBOLS.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('MONUMENT_FOUND symbols have black fixedColor and FIXED colorMode', () => {
    const foundSymbols = getSymbolsByCategory('MONUMENT_FOUND');
    expect(foundSymbols.length).toBeGreaterThan(0);
    for (const sym of foundSymbols) {
      expect(sym.colorMode,   `${sym.id} colorMode`).toBe('FIXED');
      expect(sym.fixedColor,  `${sym.id} fixedColor`).toBe('#000000');
    }
  });

  it('MONUMENT_SET symbols have red fixedColor and FIXED colorMode', () => {
    const setSymbols = getSymbolsByCategory('MONUMENT_SET');
    expect(setSymbols.length).toBeGreaterThan(0);
    for (const sym of setSymbols) {
      expect(sym.colorMode,  `${sym.id} colorMode`).toBe('FIXED');
      expect(sym.fixedColor, `${sym.id} fixedColor`).toBe('#FF0000');
    }
  });

  it('MONUMENT_CALC symbols have magenta fixedColor and FIXED colorMode', () => {
    const calcSymbols = getSymbolsByCategory('MONUMENT_CALC');
    expect(calcSymbols.length).toBeGreaterThan(0);
    for (const sym of calcSymbols) {
      expect(sym.colorMode,  `${sym.id} colorMode`).toBe('FIXED');
      expect(sym.fixedColor, `${sym.id} fixedColor`).toBe('#FF00FF');
    }
  });

  // ── Lookup functions ────────────────────────────────────────────────────

  it('getSymbolById returns undefined for unknown IDs', () => {
    expect(getSymbolById('DOES_NOT_EXIST')).toBeUndefined();
    expect(getSymbolById('')).toBeUndefined();
  });

  it('getSymbolsByCategory returns only matching symbols', () => {
    const monFound = getSymbolsByCategory('MONUMENT_FOUND');
    for (const s of monFound) {
      expect(s.category).toBe('MONUMENT_FOUND');
    }
  });

  it('getSymbolsByCategory returns empty array for category with no symbols', () => {
    // CUSTOM category has no built-in symbols
    expect(getSymbolsByCategory('CUSTOM')).toHaveLength(0);
  });

  it('getSymbolsByAssignedCode finds symbols by code', () => {
    // BC02 is assigned to MON_IR_050_FOUND
    const results = getSymbolsByAssignedCode('BC02');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(s => s.id.includes('IR') || s.id.includes('050'))).toBe(true);
  });

  it('getSymbolsByAssignedCode returns empty array for unassigned code', () => {
    expect(getSymbolsByAssignedCode('NONEXISTENT_CODE_XYZ')).toHaveLength(0);
  });

  it('getSymbolsByAssignedCode searches custom symbols too', () => {
    const customSym = {
      id: 'CUSTOM_TEST',
      name: 'Custom Test',
      category: 'CUSTOM' as const,
      paths: [],
      insertionPoint: { x: 0, y: 0 },
      defaultSize: 2, minSize: 1, maxSize: 5,
      colorMode: 'LAYER' as const, fixedColor: null,
      defaultRotation: 0, rotatable: false,
      isBuiltIn: false, isEditable: true,
      assignedCodes: ['MY_CODE'],
    };
    const results = getSymbolsByAssignedCode('MY_CODE', [customSym]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('CUSTOM_TEST');
  });

  it('findSymbol finds built-in symbols', () => {
    expect(findSymbol('GENERIC_CROSS')).toBeDefined();
  });

  it('findSymbol returns undefined for unknown ID', () => {
    expect(findSymbol('UNKNOWN')).toBeUndefined();
    expect(findSymbol('')).toBeUndefined();
  });

  it('findSymbol finds custom symbols', () => {
    const custom = [{
      id: 'CUSTOM_SYM', name: 'Custom', category: 'CUSTOM' as const,
      paths: [], insertionPoint: { x: 0, y: 0 },
      defaultSize: 2, minSize: 1, maxSize: 5,
      colorMode: 'LAYER' as const, fixedColor: null,
      defaultRotation: 0, rotatable: false,
      isBuiltIn: false, isEditable: true, assignedCodes: [],
    }];
    expect(findSymbol('CUSTOM_SYM', custom)).toBeDefined();
    expect(findSymbol('GENERIC_CROSS', custom)).toBeDefined();
  });

  it('resolveSymbolWithFallback returns GENERIC_QUESTION for unknown ID', () => {
    const sym = resolveSymbolWithFallback('DOES_NOT_EXIST');
    expect(sym.id).toBe('GENERIC_QUESTION');
  });

  it('resolveSymbolWithFallback returns GENERIC_QUESTION for null/undefined', () => {
    expect(resolveSymbolWithFallback(null).id).toBe('GENERIC_QUESTION');
    expect(resolveSymbolWithFallback(undefined).id).toBe('GENERIC_QUESTION');
    expect(resolveSymbolWithFallback('').id).toBe('GENERIC_QUESTION');
  });

  it('resolveSymbolWithFallback returns the correct symbol when ID is valid', () => {
    const sym = resolveSymbolWithFallback('GENERIC_CROSS');
    expect(sym.id).toBe('GENERIC_CROSS');
  });
});
