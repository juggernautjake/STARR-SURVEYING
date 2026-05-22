// __tests__/calculators/ti-36x-pro.surveying.test.ts
//
// V-2 of EXAM_CALCULATORS.md.
//
// Worked surveying examples that an FS/PS exam student would punch into
// the TI-36X Pro. Each test runs through the engine end-to-end (press
// sequence → evaluate → result string) and asserts against the answer
// a published guidebook would give. If a future engine change breaks one
// of these, V-2 catches it before the user does.

import { describe, it, expect } from 'vitest';
import { dispatch, evaluate, initialState, type Ti36xState } from '@/lib/calculators/models/ti-36x-pro/engine';

function press(state: Ti36xState, ...ids: string[]): Ti36xState {
  return ids.reduce((s, id) => dispatch(s, { type: 'press', keyId: id }), state);
}

describe('TI-36X Pro surveying scenarios (V-2)', () => {
  it('right-triangle hypotenuse — 30 ft × 40 ft sides → 50 ft', () => {
    // Build sqrt(30^2 + 40^2) and evaluate.
    let s: Ti36xState = { ...initialState(), entry: 'sqrt(30^2+40^2)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(50, 10);
  });

  it('chord length from radius + central angle — c = 2R sin(A/2)', () => {
    // R = 500 ft, central angle A = 60° → chord = 2·500·sin(30°) = 500 ft.
    let s: Ti36xState = { ...initialState(), entry: '2*500*sin(60/2)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(500, 8);
  });

  it('bearing addition through DMS', () => {
    // N 45°15'30" + 22°30'00" → expected 67°45'30".
    const bearing1 = 45 + 15 / 60 + 30 / 3600;
    const bearing2 = 22 + 30 / 60;
    let s: Ti36xState = { ...initialState(), entry: `${bearing1}+${bearing2}` };
    s = evaluate(s);
    // F-1 fidelity: ►DMS is the primary (unshifted) press of `pct`.
    s = press(s, 'pct');
    expect(s.result).toBe('67°45\'30.00"');
  });

  it('horizontal distance from slope distance and zenith angle', () => {
    // HD = SD · sin(zenith). SD = 124.50, zenith = 87°15'.
    const zenith = 87 + 15 / 60;
    let s: Ti36xState = { ...initialState(), entry: `124.50*sin(${zenith})` };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(124.354, 2);
  });

  it('coordinate inverse via pol() — distance between (100, 200) and (400, 600)', () => {
    // dx = 300, dy = 400 → distance = 500.
    let s: Ti36xState = { ...initialState(), entry: 'pol(400-100,600-200)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(500, 10);
  });

  it('coordinate forward via rec() — x-component at 100 ft along az 60°', () => {
    // x = d · cos(az) = 100 · cos(60°) = 50.
    let s: Ti36xState = { ...initialState(), entry: 'rec(100,60)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(50, 10);
  });

  it('vertical curve elevation — y = y_BVC + g1·x + (g2-g1)/(2L)·x²', () => {
    // BVC elev 100, g1 = +2%, g2 = -1%, L = 200, x = 50 (50 ft into the curve).
    // y = 100 + 0.02·50 + (-0.03)/(2·200)·50² = 100 + 1 + (-0.0000075·2500)
    // Let me just verify the canonical formula evaluates: 100+0.02*50+(-0.03)/(2*200)*50^2
    let s: Ti36xState = { ...initialState(), entry: '100+0.02*50+(0-0.03)/(2*200)*50^2' };
    s = evaluate(s);
    // = 100 + 1 + (-0.03/400)·2500 = 100 + 1 - 0.1875 = 100.8125
    expect(Number(s.result)).toBeCloseTo(100.8125, 6);
  });

  it('factorial in combinatorics — 7! / (3! · 4!) = 35', () => {
    let s: Ti36xState = { ...initialState(), entry: '7!/(3!*4!)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(35, 12);
  });
});
