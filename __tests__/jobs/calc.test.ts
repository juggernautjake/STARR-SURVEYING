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
  it('handles unary minus in every position, including before a parenthesis', () => {
    expect(evalArithmetic('-(2+3)')).toBe(-5);   // leading unary before '('
    expect(evalArithmetic('3*-(2)')).toBe(-6);   // unary after an operator, before '('
    expect(evalArithmetic('10--4')).toBe(14);    // subtract a negative
    expect(evalArithmetic('2*(3+-1)')).toBe(4);  // unary inside parens
  });
  it('rejects malformed input rather than guessing', () => {
    expect(evalArithmetic('1.2.3')).toBeNull();  // a number with two dots
    expect(evalArithmetic('()')).toBeNull();     // empty parens are not a value
    expect(evalArithmetic('2+3)')).toBeNull();   // a right paren with no left
    expect(evalArithmetic('5*')).toBeNull();     // a dangling operator
  });
  it('nested parentheses and deep precedence', () => {
    expect(evalArithmetic('((1+2)*(3+4))')).toBe(21);
    expect(evalArithmetic('2+3*4-10/2')).toBe(9); // 2 + 12 − 5
  });
});

describe('formatCalcResult', () => {
  it('trims floating-point noise', () => {
    expect(formatCalcResult(0.1 + 0.2)).toBe('0.3');
    expect(formatCalcResult(42)).toBe('42');
  });
  it('drops trailing zeros and caps at 6 decimals', () => {
    expect(formatCalcResult(2.0)).toBe('2');          // a whole-number float shows as an integer
    expect(formatCalcResult(10 / 3)).toBe('3.333333'); // repeating decimal, 6 places
    expect(formatCalcResult(1.5)).toBe('1.5');
    expect(formatCalcResult(NaN)).toBe('');            // non-finite → empty, never "NaN"
  });
});
