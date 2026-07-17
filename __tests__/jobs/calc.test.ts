import { describe, it, expect } from 'vitest';
import { evalArithmetic, formatCalcResult } from '@/lib/jobs/calc';

describe('evalArithmetic', () => {
  it('does basic arithmetic with precedence', () => {
    expect(evalArithmetic('2+3')).toBe(5);
    expect(evalArithmetic('2+3*4')).toBe(14);
    expect(evalArithmetic('(2+3)*4')).toBe(20);
    expect(evalArithmetic('10/4')).toBe(2.5);
  });
  it('accepts the display operators × ÷ − and whitespace', () => {
    expect(evalArithmetic('6 × 7')).toBe(42);
    expect(evalArithmetic('84 ÷ 2')).toBe(42);
    expect(evalArithmetic('10 − 3')).toBe(7);
  });
  it('handles decimals and unary minus', () => {
    expect(evalArithmetic('1.5+2.25')).toBe(3.75);
    expect(evalArithmetic('-5+8')).toBe(3);
    expect(evalArithmetic('3*-2')).toBe(-6);
  });
  it('returns null for divide-by-zero, unbalanced parens, or garbage', () => {
    expect(evalArithmetic('5/0')).toBeNull();
    expect(evalArithmetic('(2+3')).toBeNull();
    expect(evalArithmetic('2++')).toBeNull();
    expect(evalArithmetic('abc')).toBeNull();
    expect(evalArithmetic('')).toBeNull();
  });
  it('never executes code — only arithmetic tokens are allowed', () => {
    expect(evalArithmetic('process')).toBeNull();
    expect(evalArithmetic('1;2')).toBeNull();
  });
});

describe('formatCalcResult', () => {
  it('trims floating-point noise', () => {
    expect(formatCalcResult(0.1 + 0.2)).toBe('0.3');
    expect(formatCalcResult(42)).toBe('42');
  });
});
