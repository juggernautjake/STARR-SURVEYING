// __tests__/lib/problemEngine.test.ts
//
// Coverage for two pure-function pillars of the problem-template engine:
//   * evalFormula — the math sandbox used by problem-template solutions.
//     Surveying-specific helpers (toRad, dmsToDecimal, round-with-precision)
//     are in scope; everything else is JS Math.
//   * substituteTemplate — the `{{name[:format]}}` placeholder renderer used
//     in problem prompts and solution steps.

import { describe, it, expect } from 'vitest';
import { evalFormula, substituteTemplate } from '@/lib/problemEngine';

describe('evalFormula — basic arithmetic', () => {
  it('evaluates with vars in scope', () => {
    expect(evalFormula('a + b', { a: 2, b: 3 })).toBe(5);
  });

  it('honors operator precedence', () => {
    expect(evalFormula('2 + 3 * 4', {})).toBe(14);
  });

  it('returns NaN on a syntactically broken formula', () => {
    expect(evalFormula('a +', { a: 1 })).toBeNaN();
  });

  it('returns NaN on an empty formula', () => {
    expect(evalFormula('', {})).toBeNaN();
  });

  it('returns NaN when the result is not a number (string concat)', () => {
    // 'foo' + 'bar' is a string — typeof check should reject.
    expect(evalFormula('"foo" + "bar"', {})).toBeNaN();
  });
});

describe('evalFormula — Math helpers in scope', () => {
  it('exposes Math.sqrt', () => {
    expect(evalFormula('sqrt(16)', {})).toBe(4);
  });

  it('exposes Math.hypot for surveying distance calcs', () => {
    expect(evalFormula('hypot(3, 4)', {})).toBe(5);
  });

  it('exposes PI and trig (cos(PI) == -1)', () => {
    expect(evalFormula('cos(PI)', {})).toBeCloseTo(-1, 10);
  });

  it('exposes Math.atan2', () => {
    // atan2(1, 0) = π/2
    expect(evalFormula('atan2(1, 0)', {})).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe('evalFormula — surveying helpers', () => {
  it('toRad converts 180° to π', () => {
    expect(evalFormula('toRad(180)', {})).toBeCloseTo(Math.PI, 10);
  });

  it('toDeg converts π to 180°', () => {
    expect(evalFormula('toDeg(PI)', {})).toBeCloseTo(180, 10);
  });

  it('dmsToDecimal converts 45°30\'00" to 45.5', () => {
    expect(evalFormula('dmsToDecimal(45, 30, 0)', {})).toBeCloseTo(45.5, 10);
  });

  it('round(n, d) uses precision-aware rounding (no float drift)', () => {
    // 1.005 to 2 decimals: bare Math.round((1.005)*100)/100 = 1 due to float
    // representation; the engine's round() adds Number.EPSILON to win.
    expect(evalFormula('round(1.005, 2)', {})).toBe(1.01);
  });

  it('exposes vars alongside helpers (mixed call)', () => {
    // bearing → radians → x = cos × dist
    expect(
      evalFormula('cos(toRad(bearing)) * dist', { bearing: 0, dist: 100 })
    ).toBe(100);
  });
});

describe('substituteTemplate — basic substitution', () => {
  it('replaces a plain placeholder', () => {
    expect(substituteTemplate('a={{x}}', { x: 5 })).toBe('a=5');
  });

  it('replaces multiple placeholders in one string', () => {
    expect(substituteTemplate('{{a}}+{{b}}={{c}}', { a: 1, b: 2, c: 3 })).toBe('1+2=3');
  });

  it('leaves an unknown var as the original placeholder text', () => {
    // Helps surface bugs in solution templates — better than rendering "undefined".
    expect(substituteTemplate('a={{missing}}', {})).toBe('a={{missing}}');
  });

  it('returns empty string when template is empty', () => {
    expect(substituteTemplate('', { x: 1 })).toBe('');
  });

  it('accepts string values verbatim', () => {
    expect(substituteTemplate('{{label}}', { label: 'BM-1' })).toBe('BM-1');
  });
});

describe('substituteTemplate — format specifiers', () => {
  it('f2 formats a number to two decimals', () => {
    expect(substituteTemplate('{{x:f2}}', { x: 1.2345 })).toBe('1.23');
  });

  it('f0 formats a number to zero decimals', () => {
    expect(substituteTemplate('{{x:f0}}', { x: 1.6 })).toBe('2');
  });

  it('dms renders degrees-minutes-seconds glyphs', () => {
    expect(substituteTemplate('{{b:dms}}', { b: 45.5 })).toBe('45°30\'0"');
  });

  it('abs renders the absolute value as a number string', () => {
    expect(substituteTemplate('{{x:abs}}', { x: -7 })).toBe('7');
  });

  it('sign renders + or -', () => {
    expect(substituteTemplate('{{x:sign}}', { x: -1 })).toBe('-');
    expect(substituteTemplate('{{x:sign}}', { x: 0 })).toBe('+');
    expect(substituteTemplate('{{x:sign}}', { x: 1 })).toBe('+');
  });

  it('falls through to String(val) for unknown format specifier', () => {
    expect(substituteTemplate('{{x:nope}}', { x: 7 })).toBe('7');
  });
});
