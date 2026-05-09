import { describe, it, expect } from 'vitest';
import { parseArea } from '@/lib/cad/units';

describe('parseArea', () => {
  it('"2.5ac" → 108,900 sqft', () => {
    const r = parseArea('2.5ac')!;
    expect(r.sqft).toBeCloseTo(108_900, 1);
    expect(r.sourceUnit).toBe('ACRES');
    expect(r.hadExplicitUnit).toBe(true);
  });

  it('"1 hectare" → 107,639 sqft', () => {
    const r = parseArea('1 hectare')!;
    expect(r.sqft).toBeCloseTo(107_639, 0);
    expect(r.sourceUnit).toBe('HECTARES');
  });

  it('"500 sf" → 500 sqft', () => {
    const r = parseArea('500 sf')!;
    expect(r.sqft).toBe(500);
    expect(r.sourceUnit).toBe('SQ_FT');
  });

  it('plain number with default ACRES', () => {
    const r = parseArea('2', 'ACRES')!;
    expect(r.sqft).toBeCloseTo(87_120, 1);
    expect(r.sourceUnit).toBe('ACRES');
    expect(r.hadExplicitUnit).toBe(false);
  });

  it('every acre synonym', () => {
    for (const t of ['2ac', '2 acre', '2 acres']) {
      const r = parseArea(t)!;
      expect(r.sourceUnit).toBe('ACRES');
      expect(r.sqft).toBeCloseTo(87_120, 1);
    }
  });

  it('square meter synonyms', () => {
    for (const t of ['100sqm', '100 sq m', '100 m²', '100 m^2', '100 m2']) {
      const r = parseArea(t)!;
      expect(r.sourceUnit).toBe('SQ_M');
    }
  });

  it('rejects garbage', () => {
    expect(parseArea('')).toBeNull();
    expect(parseArea('xyz')).toBeNull();
    expect(parseArea('5potato')).toBeNull();
  });
});
