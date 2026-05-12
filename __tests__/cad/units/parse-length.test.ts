import { describe, it, expect } from 'vitest';
import { parseLength, feetTo, toFeet } from '@/lib/cad/units';

describe('parseLength — basic suffixes', () => {
  it('"6in" → 0.5 ft, sourceUnit IN', () => {
    const r = parseLength('6in')!;
    expect(r.feet).toBeCloseTo(0.5, 6);
    expect(r.sourceUnit).toBe('IN');
    expect(r.sourceValue).toBe(6);
    expect(r.hadExplicitUnit).toBe(true);
  });

  it('"0.5ft" → 0.5 ft, sourceUnit FT', () => {
    const r = parseLength('0.5ft')!;
    expect(r.feet).toBeCloseTo(0.5, 6);
    expect(r.sourceUnit).toBe('FT');
  });

  it('"150" with default FT → 150 ft, hadExplicitUnit false', () => {
    const r = parseLength('150')!;
    expect(r.feet).toBe(150);
    expect(r.sourceUnit).toBe('FT');
    expect(r.hadExplicitUnit).toBe(false);
  });

  it('"150" with default IN → 12.5 ft', () => {
    const r = parseLength('150', 'IN')!;
    expect(r.feet).toBeCloseTo(12.5, 6);
    expect(r.sourceUnit).toBe('IN');
  });

  it('every inch synonym resolves to IN', () => {
    for (const t of ['12in', '12 in', '12 inch', '12 inches', '12"']) {
      const r = parseLength(t)!;
      expect(r.sourceUnit).toBe('IN');
      expect(r.feet).toBeCloseTo(1, 6);
    }
  });

  it('every foot synonym resolves to FT', () => {
    for (const t of ['1ft', '1 ft', '1 foot', '1 feet', "1'"]) {
      const r = parseLength(t)!;
      expect(r.sourceUnit).toBe('FT');
      expect(r.feet).toBe(1);
    }
  });

  it('every meter synonym resolves to M', () => {
    for (const t of ['1m', '1 m', '1 meter', '1 meters', '1 metre', '1 metres']) {
      const r = parseLength(t)!;
      expect(r.sourceUnit).toBe('M');
    }
  });

  it('miles, cm, mm', () => {
    expect(parseLength('1mi')!.feet).toBe(5280);
    expect(parseLength('100cm')!.feet).toBeCloseTo(3.2808, 4);
    expect(parseLength('1000mm')!.feet).toBeCloseTo(3.2808, 4);
  });
});

describe('parseLength — compound and fraction forms', () => {
  it('"5\'6\\"" → 5.5 ft', () => {
    const r = parseLength('5\'6"')!;
    expect(r.feet).toBeCloseTo(5.5, 6);
  });

  it('"5 ft 6 in" → 5.5 ft', () => {
    const r = parseLength('5 ft 6 in')!;
    expect(r.feet).toBeCloseTo(5.5, 6);
  });

  it('"5\'-6\\"" architectural hyphen → 5.5 ft', () => {
    const r = parseLength('5\'-6"')!;
    expect(r.feet).toBeCloseTo(5.5, 6);
  });

  it('"1/2\\"" → 1/24 ft', () => {
    const r = parseLength('1/2"')!;
    expect(r.feet).toBeCloseTo(1 / 24, 6);
    expect(r.sourceUnit).toBe('IN');
  });

  it('"1 1/2 ft" mixed number → 1.5 ft', () => {
    const r = parseLength('1 1/2 ft')!;
    expect(r.feet).toBeCloseTo(1.5, 6);
  });
});

describe('parseLength — rejected inputs', () => {
  it('empty', () => {
    expect(parseLength('')).toBeNull();
    expect(parseLength('   ')).toBeNull();
  });

  it('only suffix, no number', () => {
    expect(parseLength('inches')).toBeNull();
    expect(parseLength('ft')).toBeNull();
  });

  it('garbage', () => {
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('5xyz')).toBeNull();
  });

  it('does not collide on partial substring "min"', () => {
    // "5min" should not accidentally match "in" — there's no
    // valid space/digit between "5m" and "in".
    expect(parseLength('5min')).toBeNull();
  });
});

describe('feetTo / toFeet round-trip', () => {
  it('round-trips every unit', () => {
    for (const u of ['FT', 'IN', 'MILE', 'M', 'CM', 'MM'] as const) {
      const v = 12.345;
      const ft = toFeet(v, u);
      const back = feetTo(ft, u);
      expect(back).toBeCloseTo(v, 6);
    }
  });
});
