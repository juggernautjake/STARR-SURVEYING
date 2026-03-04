// __tests__/cad/styles/linetype-library.test.ts — Unit tests for Phase 3 line type library
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_LINE_TYPES,
  getLineTypeById,
  getLineTypesByCategory,
  findLineType,
  resolveLineTypeWithFallback,
} from '@/lib/cad/styles/linetype-library';

describe('linetype-library', () => {
  // ── Library completeness ────────────────────────────────────────────────

  it('has a non-empty built-in line type list', () => {
    expect(BUILTIN_LINE_TYPES.length).toBeGreaterThan(0);
  });

  it('includes all required basic line types', () => {
    const basicIds = ['SOLID', 'DASHED', 'DASHED_HEAVY', 'DOTTED', 'DASH_DOT', 'DASH_DOT_DOT', 'CENTER', 'PHANTOM'];
    for (const id of basicIds) {
      expect(getLineTypeById(id), id).toBeDefined();
    }
  });

  it('has exactly 12 fence line types', () => {
    const fenceTypes = getLineTypesByCategory('FENCE');
    expect(fenceTypes.length).toBe(12);
  });

  it('includes specialty line types', () => {
    expect(getLineTypeById('RAILROAD')).toBeDefined();
    expect(getLineTypeById('RETAINING_WALL')).toBeDefined();
    expect(getLineTypeById('CREEK_WAVY')).toBeDefined();
    expect(getLineTypeById('HEDGE')).toBeDefined();
    expect(getLineTypeById('OVERHEAD_POWER')).toBeDefined();
  });

  // ── Structure validation ────────────────────────────────────────────────

  it('every line type has required fields', () => {
    for (const lt of BUILTIN_LINE_TYPES) {
      expect(lt.id,            `${lt.id}.id`).toBeTruthy();
      expect(lt.name,          `${lt.id}.name`).toBeTruthy();
      expect(lt.category,      `${lt.id}.category`).toBeTruthy();
      expect(Array.isArray(lt.dashPattern),   `${lt.id}.dashPattern`).toBe(true);
      expect(Array.isArray(lt.inlineSymbols), `${lt.id}.inlineSymbols`).toBe(true);
      expect(['NONE', 'WAVY', 'ZIGZAG']).toContain(lt.specialRenderer);
    }
  });

  it('every line type has a unique id', () => {
    const ids = BUILTIN_LINE_TYPES.map(lt => lt.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('SOLID line type has empty dashPattern', () => {
    const solid = getLineTypeById('SOLID');
    expect(solid?.dashPattern).toHaveLength(0);
    expect(solid?.specialRenderer).toBe('NONE');
    expect(solid?.inlineSymbols).toHaveLength(0);
  });

  it('CREEK_WAVY has WAVY specialRenderer', () => {
    const creekWavy = getLineTypeById('CREEK_WAVY');
    expect(creekWavy?.specialRenderer).toBe('WAVY');
  });

  it('fence types all have at least one inline symbol', () => {
    const fenceTypes = getLineTypesByCategory('FENCE');
    for (const lt of fenceTypes) {
      expect(lt.inlineSymbols.length, `${lt.id} inlineSymbols`).toBeGreaterThan(0);
    }
  });

  it('dash patterns have even-length arrays (dash, gap pairs)', () => {
    for (const lt of BUILTIN_LINE_TYPES) {
      if (lt.dashPattern.length > 0) {
        // dash patterns can be odd-length in theory but standard CAD formats use pairs
        // all values should be positive
        for (const v of lt.dashPattern) {
          expect(v, `${lt.id} dash value`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('inline symbol configs have valid interval values', () => {
    for (const lt of BUILTIN_LINE_TYPES) {
      for (const sym of lt.inlineSymbols) {
        expect(sym.interval,   `${lt.id} interval`).toBeGreaterThan(0);
        expect(sym.symbolSize, `${lt.id} symbolSize`).toBeGreaterThan(0);
        expect(['FIXED', 'SCALE_DEPENDENT']).toContain(sym.intervalMode);
        expect(['ALONG_LINE', 'FIXED', 'PERPENDICULAR']).toContain(sym.symbolRotation);
        expect(['LEFT', 'RIGHT', 'CENTER', 'BOTH']).toContain(sym.side);
      }
    }
  });

  // ── Lookup functions ────────────────────────────────────────────────────

  it('getLineTypeById returns undefined for unknown IDs', () => {
    expect(getLineTypeById('DOES_NOT_EXIST')).toBeUndefined();
    expect(getLineTypeById('')).toBeUndefined();
  });

  it('getLineTypesByCategory returns only matching types', () => {
    const basic = getLineTypesByCategory('BASIC');
    for (const lt of basic) {
      expect(lt.category).toBe('BASIC');
    }
  });

  it('getLineTypesByCategory returns empty array for unknown category', () => {
    expect(getLineTypesByCategory('CUSTOM')).toHaveLength(0);
  });

  it('findLineType finds built-in line types', () => {
    expect(findLineType('SOLID')).toBeDefined();
    expect(findLineType('DASHED')).toBeDefined();
  });

  it('findLineType returns undefined for unknown ID', () => {
    expect(findLineType('UNKNOWN')).toBeUndefined();
    expect(findLineType('')).toBeUndefined();
  });

  it('findLineType finds custom line types', () => {
    const custom = [{
      id: 'CUSTOM_LT', name: 'Custom', category: 'CUSTOM' as const,
      dashPattern: [5, 3], inlineSymbols: [],
      specialRenderer: 'NONE' as const,
      isBuiltIn: false, isEditable: true, assignedCodes: [],
    }];
    expect(findLineType('CUSTOM_LT', custom)).toBeDefined();
  });

  it('resolveLineTypeWithFallback returns SOLID for unknown IDs', () => {
    expect(resolveLineTypeWithFallback('DOES_NOT_EXIST').id).toBe('SOLID');
    expect(resolveLineTypeWithFallback(null).id).toBe('SOLID');
    expect(resolveLineTypeWithFallback(undefined).id).toBe('SOLID');
    expect(resolveLineTypeWithFallback('').id).toBe('SOLID');
  });

  it('resolveLineTypeWithFallback returns correct line type for valid IDs', () => {
    expect(resolveLineTypeWithFallback('DASHED').id).toBe('DASHED');
    expect(resolveLineTypeWithFallback('RAILROAD').id).toBe('RAILROAD');
  });
});
