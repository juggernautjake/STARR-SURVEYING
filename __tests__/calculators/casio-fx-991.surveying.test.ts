// __tests__/calculators/casio-fx-991.surveying.test.ts
//
// V-3 of EXAM_CALCULATORS.md.
//
// End-to-end surveying scenarios for the Casio fx-991ES PLUS engine.
// Stresses the same exam-question categories as V-2 but exercises the
// Casio-specific parsing rules — implicit multiplication and the
// frac{}{}-style natural-fraction syntax.

import { describe, it, expect } from 'vitest';
import { dispatch, evaluate, initialState, type CasioFx991State } from '@/lib/calculators/models/casio-fx-991/engine';

function press(state: CasioFx991State, ...ids: string[]): CasioFx991State {
  return ids.reduce((s, id) => dispatch(s, { type: 'press', keyId: id }), state);
}

describe('Casio fx-991 surveying scenarios (V-3)', () => {
  it('hypotenuse via implicit multiplication: 2*5 = 10', () => {
    // Casio shorthand pattern.
    let s: CasioFx991State = { ...initialState(), entry: '2(3+2)' };
    s = evaluate(s);
    expect(Number(s.result)).toBe(10);
  });

  it('chord length using implicit-mult and natural fraction', () => {
    // c = 2R · sin(A/2) — Casio user types this as: 2(500)sin(60/2)
    let s: CasioFx991State = { ...initialState(), entry: '2(500)sin(60/2)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(500, 8);
  });

  it('horizontal distance from slope distance and zenith angle', () => {
    const zenith = 87 + 15 / 60;
    let s: CasioFx991State = { ...initialState(), entry: `124.50sin(${zenith})` };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(124.354, 2);
  });

  it('coordinate inverse via pol() — distance 100,200 to 400,600 = 500', () => {
    let s: CasioFx991State = { ...initialState(), entry: 'pol(400-100,600-200)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(500, 10);
  });

  it('natural fraction in a coordinate problem: y = x + frac{1}{2}·dx', () => {
    // y at x=10, dx=4 → 10 + 0.5·4 = 12
    let s: CasioFx991State = { ...initialState(), entry: '10+frac{1}{2}*4' };
    s = evaluate(s);
    expect(Number(s.result)).toBe(12);
  });

  it('right-triangle area: 1/2 · b · h with implicit mult', () => {
    // 0.5 · 30 · 40 → 600. Casio user types: frac{1}{2}(30)(40)
    let s: CasioFx991State = { ...initialState(), entry: 'frac{1}{2}(30)(40)' };
    s = evaluate(s);
    expect(Number(s.result)).toBe(600);
  });

  it('bearing addition routed through →DMS', () => {
    const bearing1 = 45 + 15 / 60 + 30 / 3600;
    const bearing2 = 22 + 30 / 60;
    let s: CasioFx991State = { ...initialState(), entry: `${bearing1}+${bearing2}` };
    s = evaluate(s);
    s = press(s, 'shift', 'dms');
    expect(s.result).toBe('67°45\'30.00"');
  });

  it('factorial in combinatorics: 7!/(3!4!) = 35', () => {
    let s: CasioFx991State = { ...initialState(), entry: '7!/(3!4!)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(35, 12);
  });
});
