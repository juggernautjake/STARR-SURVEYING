// __tests__/cad/units/area-multi-unit.test.ts
//
// Slice 227 of cad-area-calculation-multi-unit-2026-05-29.md. Locks
// the widened parser + formatter contract: every common surveying
// area unit round-trips through `parseArea` ↔ `sqftTo` and the
// abbreviation table reports the conventional Unicode label.

import { describe, it, expect } from 'vitest';
import {
  parseArea,
  sqftTo,
  toSqft,
  UNIT_TO_SQFT,
  UNIT_LABEL,
  type AreaUnit,
} from '@/lib/cad/units/parse-area';

const ALL_UNITS: AreaUnit[] = [
  'SQ_IN', 'SQ_FT', 'SQ_YD', 'SQ_MI',
  'SQ_MM', 'SQ_CM', 'SQ_M',  'SQ_KM',
  'ACRES', 'HECTARES',
];

describe('UNIT_TO_SQFT — anchor multipliers', () => {
  it('SQ_FT is the canonical 1×', () => {
    expect(UNIT_TO_SQFT.SQ_FT).toBe(1);
  });
  it('144 sq inches = 1 sq foot', () => {
    expect(UNIT_TO_SQFT.SQ_IN).toBeCloseTo(1 / 144, 10);
  });
  it('1 sq yard = 9 sq feet', () => {
    expect(UNIT_TO_SQFT.SQ_YD).toBeCloseTo(9, 10);
  });
  it('1 sq mile = 5280² sq feet (27,878,400)', () => {
    expect(UNIT_TO_SQFT.SQ_MI).toBeCloseTo(5280 * 5280, 6);
  });
  it('1 acre = 43,560 sq feet', () => {
    expect(UNIT_TO_SQFT.ACRES).toBe(43560);
  });
  it('1 hectare = 10,000 sq meters = ~107,639.1 sq ft', () => {
    expect(UNIT_TO_SQFT.HECTARES).toBeCloseTo(107639.10416, 3);
  });
  it('1 sq meter ≈ 10.7639 sq ft (US survey foot)', () => {
    expect(UNIT_TO_SQFT.SQ_M).toBeCloseTo(10.7639, 3);
  });
  it('1 sq km = 1,000,000 sq m', () => {
    expect(UNIT_TO_SQFT.SQ_KM).toBeCloseTo(UNIT_TO_SQFT.SQ_M * 1_000_000, 3);
  });
  it('1 sq cm = 1/10,000 sq m', () => {
    expect(UNIT_TO_SQFT.SQ_CM).toBeCloseTo(UNIT_TO_SQFT.SQ_M / 10_000, 10);
  });
  it('1 sq mm = 1/1,000,000 sq m', () => {
    expect(UNIT_TO_SQFT.SQ_MM).toBeCloseTo(UNIT_TO_SQFT.SQ_M / 1_000_000, 12);
  });
});

describe('UNIT_LABEL — abbreviations', () => {
  it.each<[AreaUnit, string]>([
    ['SQ_IN', 'in²'],
    ['SQ_FT', 'ft²'],
    ['SQ_YD', 'yd²'],
    ['SQ_MI', 'mi²'],
    ['SQ_MM', 'mm²'],
    ['SQ_CM', 'cm²'],
    ['SQ_M',  'm²'],
    ['SQ_KM', 'km²'],
    ['ACRES', 'ac'],
    ['HECTARES', 'ha'],
  ])('%s → "%s"', (unit, label) => {
    expect(UNIT_LABEL[unit]).toBe(label);
  });
});

describe('parseArea — accepts every surveying suffix', () => {
  it.each<[string, AreaUnit]>([
    ['100 sq in',          'SQ_IN'],
    ['100 in²',            'SQ_IN'],
    ['100 in2',            'SQ_IN'],
    ['100 square inches',  'SQ_IN'],
    ['100 sq ft',          'SQ_FT'],
    ['100 sqft',           'SQ_FT'],
    ['100 ft²',            'SQ_FT'],
    ['100 ft2',            'SQ_FT'],
    ['100 sf',             'SQ_FT'],
    ['100 sq yd',          'SQ_YD'],
    ['100 yd²',            'SQ_YD'],
    ['100 sq mi',          'SQ_MI'],
    ['100 mi²',            'SQ_MI'],
    ['100 sq mm',          'SQ_MM'],
    ['100 mm²',            'SQ_MM'],
    ['100 sq cm',          'SQ_CM'],
    ['100 cm²',            'SQ_CM'],
    ['100 sq m',           'SQ_M'],
    ['100 m²',             'SQ_M'],
    ['100 sq km',          'SQ_KM'],
    ['100 km²',            'SQ_KM'],
    ['100 ac',             'ACRES'],
    ['100 acres',          'ACRES'],
    ['100 ha',             'HECTARES'],
    ['100 hectares',       'HECTARES'],
  ])('"%s" parses as %s', (input, expectedUnit) => {
    const r = parseArea(input);
    expect(r).not.toBeNull();
    expect(r!.sourceUnit).toBe(expectedUnit);
    expect(r!.sourceValue).toBe(100);
  });

  it('returns null on a completely unparseable input', () => {
    expect(parseArea('twelve sq ft')).toBeNull();
  });

  it('returns null on an unknown unit suffix', () => {
    expect(parseArea('100 zorks')).toBeNull();
  });

  it('uses the supplied default unit when no suffix is present', () => {
    const r = parseArea('5', 'ACRES');
    expect(r!.sourceUnit).toBe('ACRES');
    expect(r!.sqft).toBeCloseTo(5 * 43560, 4);
    expect(r!.hadExplicitUnit).toBe(false);
  });
});

describe('sqftTo + toSqft — round-trips', () => {
  for (const unit of ALL_UNITS) {
    it(`SQ_FT → ${unit} → SQ_FT is identity`, () => {
      const back = toSqft(sqftTo(1234.5, unit), unit);
      expect(back).toBeCloseTo(1234.5, 6);
    });
  }
});
