// __tests__/calculators/ti-36x-pro.engine.test.ts
//
// Engine tests for the TI-36X Pro algebraic input parser.
// C-7 of EXAM_CALCULATORS.md.

import { describe, it, expect } from 'vitest';
import { dispatch, evaluate, initialState, type Ti36xState } from '@/lib/calculators/models/ti-36x-pro/engine';

function press(state: Ti36xState, ...ids: string[]): Ti36xState {
  return ids.reduce((s, id) => dispatch(s, { type: 'press', keyId: id }), state);
}

describe('TI-36X Pro — entry buffer', () => {
  it('appends digits', () => {
    const s = press(initialState(), 'n1', 'n2', 'n3');
    expect(s.entry).toBe('123');
  });

  it('clear wipes the entry', () => {
    const s1 = press(initialState(), 'n5');
    const s2 = press(s1, 'clear');
    expect(s2.entry).toBe('');
  });

  it('del backspaces', () => {
    const s = press(initialState(), 'n4', 'n2', 'del');
    expect(s.entry).toBe('4');
  });

  it('2nd modifier toggles shiftActive', () => {
    const s = press(initialState(), '2nd');
    expect(s.shiftActive).toBe(true);
    const s2 = press(s, '2nd');
    expect(s2.shiftActive).toBe(false);
  });

  it('functions append "name("', () => {
    const s = press(initialState(), 'sin');
    expect(s.entry).toBe('sin(');
  });

  it('shifted sin becomes asin', () => {
    const s = press(initialState(), '2nd', 'sin');
    expect(s.entry).toBe('asin(');
    expect(s.shiftActive).toBe(false); // consumed
  });
});

describe('TI-36X Pro — evaluator', () => {
  it('2 + 3 = 5', () => {
    const s = press(initialState(), 'n2', 'add', 'n3', 'eq');
    expect(s.result).toBe('5');
    expect(s.lastAnswer).toBe(5);
  });

  it('precedence: 2 + 3 * 4 = 14', () => {
    const s = press(initialState(), 'n2', 'add', 'n3', 'mul', 'n4', 'eq');
    expect(s.result).toBe('14');
  });

  it('parens: (2 + 3) * 4 = 20', () => {
    const s = press(initialState(), 'lparen', 'n2', 'add', 'n3', 'rparen', 'mul', 'n4', 'eq');
    expect(s.result).toBe('20');
  });

  it('power is right-associative: 2 ^ 3 ^ 2 = 512', () => {
    const s = press(initialState(), 'n2', 'pow', 'n3', 'pow', 'n2', 'eq');
    expect(s.result).toBe('512');
  });

  it('sin(30) in DEG = 0.5', () => {
    const s = press(initialState(), 'sin', 'n3', 'n0', 'rparen', 'eq');
    expect(Number(s.result)).toBeCloseTo(0.5, 12);
  });

  it('unary minus: -5 + 3 = -2', () => {
    const s = press(initialState(), 'sub', 'n5', 'add', 'n3', 'eq');
    expect(s.result).toBe('-2');
  });

  it('factorial: 5! = 120', () => {
    const s = press(initialState(), 'n5', 'fact', 'eq');
    expect(s.result).toBe('120');
  });

  it('π as a constant: π = pi value', () => {
    const s = press(initialState(), 'pi', 'eq');
    // Display is 10-SF rounded; lastAnswer holds full precision.
    expect(s.lastAnswer).toBeCloseTo(Math.PI, 12);
  });

  it('shifted π becomes e: e = Math.E', () => {
    const s = press(initialState(), '2nd', 'pi', 'eq');
    expect(s.lastAnswer).toBeCloseTo(Math.E, 12);
  });

  it('ans recall uses lastAnswer', () => {
    let s = press(initialState(), 'n7', 'eq');           // result 7
    s = press(s, 'ans', 'add', 'n3', 'eq');              // 7 + 3
    expect(s.result).toBe('10');
  });

  it('mode cycles DEG → RAD → GRAD → DEG', () => {
    let s = initialState();
    expect(s.angleMode).toBe('DEG');
    s = press(s, 'mode');
    expect(s.angleMode).toBe('RAD');
    s = press(s, 'mode');
    expect(s.angleMode).toBe('GRAD');
    s = press(s, 'mode');
    expect(s.angleMode).toBe('DEG');
  });

  it('syntax error displays "Syntax ERROR"', () => {
    const s = press(initialState(), 'n1', 'add', 'add', 'eq');
    expect(s.result).toBe('Syntax ERROR');
  });

  it('div by zero displays Math ERROR', () => {
    const s = press(initialState(), 'n1', 'div', 'n0', 'eq');
    expect(s.result).toBe('Math ERROR');
  });

  it('surveying example: sqrt(3² + 4²) = 5', () => {
    // Build via shifted x² becomes sqrt(. Use direct evaluate path.
    let s: Ti36xState = { ...initialState(), entry: 'sqrt(3^2+4^2)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(5, 12);
  });
});
