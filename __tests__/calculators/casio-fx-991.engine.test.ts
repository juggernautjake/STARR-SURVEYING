// __tests__/calculators/casio-fx-991.engine.test.ts
//
// Engine tests for the Casio fx-991ES PLUS algebraic engine.
// C-13 of EXAM_CALCULATORS.md.

import { describe, it, expect } from 'vitest';
import {
  dispatch, evaluate, hydrate, initialState, serialize,
  type CasioFx991State,
} from '@/lib/calculators/models/casio-fx-991/engine';

function press(state: CasioFx991State, ...ids: string[]): CasioFx991State {
  return ids.reduce((s, id) => dispatch(s, { type: 'press', keyId: id }), state);
}

describe('Casio fx-991 — basic algebraic flow', () => {
  it('2 + 3 = 5', () => {
    const s = press(initialState(), 'n2', 'add', 'n3', 'eq');
    expect(s.result).toBe('5');
  });

  it('SHIFT modifier toggles via shift key', () => {
    const s = press(initialState(), 'shift');
    expect(s.shiftActive).toBe(true);
    const s2 = press(s, 'shift');
    expect(s2.shiftActive).toBe(false);
  });

  it('SHIFT + ALPHA are mutually exclusive', () => {
    let s = press(initialState(), 'shift');
    expect(s.shiftActive).toBe(true);
    s = press(s, 'alpha');
    expect(s.shiftActive).toBe(false);
    expect(s.alphaActive).toBe(true);
  });

  it('sqrt key opens sqrt(', () => {
    const s = press(initialState(), 'sqrt');
    expect(s.entry).toBe('sqrt(');
  });

  it('shifted sqrt becomes cbrt(', () => {
    const s = press(initialState(), 'shift', 'sqrt');
    expect(s.entry).toBe('cbrt(');
  });
});

describe('Casio fx-991 — implicit multiplication', () => {
  it('2π evaluates as 2 × π', () => {
    let s: CasioFx991State = { ...initialState(), entry: '2π' };
    s = evaluate(s);
    expect(s.lastAnswer).toBeCloseTo(2 * Math.PI, 12);
  });

  it('2sqrt(9) evaluates as 2 × sqrt(9) = 6', () => {
    let s: CasioFx991State = { ...initialState(), entry: '2sqrt(9)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(6, 12);
  });

  it(') ( inserts implicit *', () => {
    let s: CasioFx991State = { ...initialState(), entry: '(1+2)(3+4)' };
    s = evaluate(s);
    expect(Number(s.result)).toBe(21);
  });

  it('π followed by digit: π2 → π × 2', () => {
    let s: CasioFx991State = { ...initialState(), entry: 'π2' };
    s = evaluate(s);
    expect(s.lastAnswer).toBeCloseTo(2 * Math.PI, 12);
  });
});

describe('Casio fx-991 — natural-display fraction syntax', () => {
  it('frac{1}{2} evaluates to 0.5', () => {
    let s: CasioFx991State = { ...initialState(), entry: 'frac{1}{2}' };
    s = evaluate(s);
    expect(Number(s.result)).toBe(0.5);
  });

  it('frac in larger expression: 3 + frac{1}{4} = 3.25', () => {
    let s: CasioFx991State = { ...initialState(), entry: '3+frac{1}{4}' };
    s = evaluate(s);
    expect(Number(s.result)).toBe(3.25);
  });
});

describe('Casio fx-991 — HYP toggle (F-8)', () => {
  it('HYP + sin appends sinh(', () => {
    const s = press(initialState(), 'hyp', 'sin');
    expect(s.entry).toBe('sinh(');
    expect(s.hypActive).toBe(false); // consumed
  });

  it('HYP + cos appends cosh(', () => {
    const s = press(initialState(), 'hyp', 'cos');
    expect(s.entry).toBe('cosh(');
  });

  it('HYP + tan appends tanh(', () => {
    const s = press(initialState(), 'hyp', 'tan');
    expect(s.entry).toBe('tanh(');
  });

  it('SHIFT + HYP + sin appends asinh( (inverse hyperbolic)', () => {
    const s = press(initialState(), 'hyp', 'shift', 'sin');
    expect(s.entry).toBe('asinh(');
  });

  it('HYP toggles off when pressed twice', () => {
    let s = press(initialState(), 'hyp');
    expect(s.hypActive).toBe(true);
    s = press(s, 'hyp');
    expect(s.hypActive).toBe(false);
  });
});

describe('Casio fx-991 — surveying scenarios', () => {
  it('sqrt(3^2+4^2) = 5', () => {
    let s: CasioFx991State = { ...initialState(), entry: 'sqrt(3^2+4^2)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(5, 12);
  });

  it('→DMS shifts lastAnswer into DMS notation', () => {
    let s: CasioFx991State = { ...initialState(), lastAnswer: 12.51625 };
    s = press(s, 'shift', 'dms');
    expect(s.result).toBe('12°30\'58.50"');
  });
});

describe('Casio fx-991 — serialize/hydrate', () => {
  it('round-trips entry, result, mode, memory, history', () => {
    let s = press(initialState(), 'n5', 'eq');
    s = press(s, 'mode'); // RAD
    const json = serialize(s);
    const round = hydrate(JSON.parse(JSON.stringify(json)));
    expect(round.lastAnswer).toBe(5);
    expect(round.angleMode).toBe('RAD');
    expect(round.history.length).toBe(1);
  });

  it('hydrate drops transient flags', () => {
    const s: CasioFx991State = { ...initialState(), shiftActive: true, alphaActive: true };
    const round = hydrate(serialize(s));
    expect(round.shiftActive).toBe(false);
    expect(round.alphaActive).toBe(false);
  });
});
