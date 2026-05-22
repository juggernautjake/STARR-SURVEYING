// __tests__/calculators/math.test.ts
//
// Unit tests for lib/calculators/math.ts.
// C-4 of EXAM_CALCULATORS.md.
//
// One assertion per primitive — and the surveying-relevant ones
// (DMS, polar↔rectangular, trig with mode) exercise the kind of
// numbers an exam question would use.

import { describe, it, expect } from 'vitest';
import * as M from '@/lib/calculators/math';

describe('arithmetic', () => {
  it('adds, subs, muls, divs', () => {
    expect(M.add(2, 3)).toBe(5);
    expect(M.sub(7, 4)).toBe(3);
    expect(M.mul(6, 9)).toBe(54);
    expect(M.div(10, 4)).toBe(2.5);
  });
  it('div by zero returns NaN', () => {
    expect(Number.isNaN(M.div(1, 0))).toBe(true);
  });
  it('sqrt of negative is NaN', () => {
    expect(Number.isNaN(M.sqrt(-1))).toBe(true);
  });
  it('reciprocal handles zero', () => {
    expect(Number.isNaN(M.reciprocal(0))).toBe(true);
    expect(M.reciprocal(4)).toBe(0.25);
  });
  it('nthRoot handles negative base for odd n', () => {
    expect(M.nthRoot(3, -8)).toBeCloseTo(-2, 10);
    expect(Number.isNaN(M.nthRoot(2, -4))).toBe(true);
  });
});

describe('logs + exp', () => {
  it('ln(e) = 1', () => { expect(M.ln(Math.E)).toBeCloseTo(1, 12); });
  it('log10(1000) = 3', () => { expect(M.log10(1000)).toBeCloseTo(3, 12); });
  it('exp(1) = e', () => { expect(M.exp(1)).toBeCloseTo(Math.E, 12); });
  it('tenPow(2) = 100', () => { expect(M.tenPow(2)).toBeCloseTo(100, 12); });
  it('ln of non-positive is NaN', () => {
    expect(Number.isNaN(M.ln(0))).toBe(true);
    expect(Number.isNaN(M.ln(-1))).toBe(true);
  });
});

describe('trig — RAD mode', () => {
  it('sin(π/2) = 1', () => { expect(M.sin(Math.PI / 2, 'RAD')).toBeCloseTo(1, 12); });
  it('cos(0) = 1',     () => { expect(M.cos(0, 'RAD')).toBeCloseTo(1, 12); });
  it('tan(π/4) = 1',   () => { expect(M.tan(Math.PI / 4, 'RAD')).toBeCloseTo(1, 12); });
});

describe('trig — DEG mode', () => {
  it('sin(30) = 0.5',  () => { expect(M.sin(30, 'DEG')).toBeCloseTo(0.5, 12); });
  it('cos(60) = 0.5',  () => { expect(M.cos(60, 'DEG')).toBeCloseTo(0.5, 12); });
  it('tan(45) = 1',    () => { expect(M.tan(45, 'DEG')).toBeCloseTo(1, 12); });
});

describe('trig — GRAD mode', () => {
  it('sin(100 grad) = 1 (== 90°)', () => {
    expect(M.sin(100, 'GRAD')).toBeCloseTo(1, 12);
  });
});

describe('inverse trig', () => {
  it('asin(1) in DEG = 90', () => { expect(M.asin(1, 'DEG')).toBeCloseTo(90, 12); });
  it('acos(0.5) in DEG = 60', () => { expect(M.acos(0.5, 'DEG')).toBeCloseTo(60, 12); });
  it('atan(1) in RAD = π/4', () => { expect(M.atan(1, 'RAD')).toBeCloseTo(Math.PI / 4, 12); });
  it('asin out of range is NaN', () => {
    expect(Number.isNaN(M.asin(2, 'DEG'))).toBe(true);
  });
});

describe('combinatorics', () => {
  it('factorial(0) = 1', () => { expect(M.factorial(0)).toBe(1); });
  it('factorial(5) = 120', () => { expect(M.factorial(5)).toBe(120); });
  it('factorial(170) is finite', () => {
    expect(Number.isFinite(M.factorial(170))).toBe(true);
  });
  it('factorial of negative is NaN', () => {
    expect(Number.isNaN(M.factorial(-1))).toBe(true);
  });

  it('permutation(5, 3) = 60', () => { expect(M.permutation(5, 3)).toBe(60); });
  it('combination(5, 2) = 10', () => { expect(M.combination(5, 2)).toBe(10); });
  it('combination(10, 0) = 1', () => { expect(M.combination(10, 0)).toBe(1); });
  it('combination(10, 10) = 1', () => { expect(M.combination(10, 10)).toBe(1); });
});

describe('DMS — surveying-critical', () => {
  it('degToDms(12.5) = 12° 30\' 00"', () => {
    const r = M.degToDms(12.5);
    expect(r.deg).toBe(12);
    expect(r.min).toBe(30);
    expect(r.sec).toBeCloseTo(0, 10);
  });

  it('degToDms(12.51625) = 12° 30\' 58.5"', () => {
    const r = M.degToDms(12.51625);
    expect(r.deg).toBe(12);
    expect(r.min).toBe(30);
    expect(r.sec).toBeCloseTo(58.5, 8);
  });

  it('dmsToDeg(12, 30, 58.5) ≈ 12.51625', () => {
    expect(M.dmsToDeg(12, 30, 58.5)).toBeCloseTo(12.51625, 10);
  });

  it('dmsToDeg roundtrip preserves value', () => {
    const original = 45.123456;
    const { deg, min, sec } = M.degToDms(original);
    expect(M.dmsToDeg(deg, min, sec)).toBeCloseTo(original, 10);
  });

  it('formatDms outputs surveyor notation', () => {
    expect(M.formatDms(12.51625, 2)).toBe('12°30\'58.50"');
  });
});

describe('display formatting', () => {
  it('formatNorm drops trailing zeros', () => {
    expect(M.formatNorm(1.5)).toBe('1.5');
    expect(M.formatNorm(2)).toBe('2');
  });
  it('formatFix(3) shows 3 decimals', () => {
    expect(M.formatFix(1.23456, 3)).toBe('1.235');
    expect(M.formatFix(7, 2)).toBe('7.00');
  });
  it('formatSci uses ×10ⁿ superscript', () => {
    const s = M.formatSci(1234.5, 4);
    expect(s).toMatch(/×10/);
    expect(s).toMatch(/1\.235/);
  });
  it('formatNorm uses SCI for very small / very large', () => {
    expect(M.formatNorm(1e-12)).toMatch(/×10/);
    expect(M.formatNorm(1e15)).toMatch(/×10/);
  });
  it('formatEng exponent is multiple of 3', () => {
    const s = M.formatEng(1234567, 4);
    // 1234567 → 1.235×10⁶
    expect(s).toMatch(/×10⁶/);
  });
});

describe('constants', () => {
  it('PI matches Math.PI', () => { expect(M.PI).toBe(Math.PI); });
  it('E matches Math.E', () => { expect(M.E).toBe(Math.E); });
});

describe('surveying-flavored cross checks', () => {
  it('vertical-angle complement: 90° − angle reads same as cos in DEG', () => {
    // sin(angle) === cos(90 - angle)
    const a = 37.2;
    expect(M.sin(a, 'DEG')).toBeCloseTo(M.cos(90 - a, 'DEG'), 12);
  });

  it('bearing addition: 45° + 22°30\' = 67°30\' via DMS', () => {
    const a = M.dmsToDeg(45, 0, 0);
    const b = M.dmsToDeg(22, 30, 0);
    const sum = a + b;
    expect(M.formatDms(sum, 0)).toBe('67°30\'00"');
  });
});
