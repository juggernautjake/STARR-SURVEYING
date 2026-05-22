// __tests__/calculators/v6-cross-engine.test.ts
//
// V-6 of EXAM_CALCULATORS.md.
//
// Cross-engine convergence: the same surveying calculations evaluated
// through every approved-calculator engine must produce the same answer.
// A regression in any one engine's tokenizer / RPN handler surfaces here
// because the result diverges from the other two.

import { describe, it, expect } from 'vitest';

import {
  dispatch as tiDispatch,
  evaluate as tiEvaluate,
  initialState as tiInitial,
  type Ti36xState,
} from '@/lib/calculators/models/ti-36x-pro/engine';
import {
  dispatch as casioDispatch,
  evaluate as casioEvaluate,
  initialState as casioInitial,
  type CasioFx991State,
} from '@/lib/calculators/models/casio-fx-991/engine';
import {
  dispatch as hpDispatch,
  initialState as hpInitial,
  type Hp35sState,
} from '@/lib/calculators/models/hp-35s/engine';

function tiPress(state: Ti36xState, ...ids: string[]): Ti36xState {
  return ids.reduce((s, id) => tiDispatch(s, { type: 'press', keyId: id }), state);
}
function casioPress(state: CasioFx991State, ...ids: string[]): CasioFx991State {
  return ids.reduce((s, id) => casioDispatch(s, { type: 'press', keyId: id }), state);
}
function hpPress(state: Hp35sState, ...ids: string[]): Hp35sState {
  return ids.reduce((s, id) => hpDispatch(s, { type: 'press', keyId: id }), state);
}

describe('V-6 cross-engine convergence', () => {
  it('right-triangle hypotenuse — all three engines return 50', () => {
    // TI: typed expression
    const ti = tiEvaluate({ ...tiInitial(), entry: 'sqrt(30^2+40^2)' });
    expect(Number(ti.result)).toBeCloseTo(50, 12);

    // Casio: same expression
    const casio = casioEvaluate({ ...casioInitial(), entry: 'sqrt(30^2+40^2)' });
    expect(Number(casio.result)).toBeCloseTo(50, 12);

    // HP 35s: RPN keystrokes
    let hp = hpPress(hpInitial(), 'n3', 'n0', 'enter', 'n3', 'n0', 'mul');
    hp = hpPress(hp, 'n4', 'n0', 'enter', 'n4', 'n0', 'mul');
    hp = hpPress(hp, 'add', 'sqrt');
    expect(hp.stack.x).toBeCloseTo(50, 12);
  });

  it('sin(30°) in DEG = 0.5 across all engines', () => {
    const ti = tiEvaluate({ ...tiInitial(), entry: 'sin(30)' });
    expect(Number(ti.result)).toBeCloseTo(0.5, 12);

    const casio = casioEvaluate({ ...casioInitial(), entry: 'sin(30)' });
    expect(Number(casio.result)).toBeCloseTo(0.5, 12);

    const hp = hpPress(hpInitial(), 'n3', 'n0', 'sin');
    expect(hp.stack.x).toBeCloseTo(0.5, 12);
  });

  it('combinatorial 7!/(3!·4!) = 35 across all engines', () => {
    const ti = tiEvaluate({ ...tiInitial(), entry: '7!/(3!*4!)' });
    expect(Number(ti.result)).toBeCloseTo(35, 12);

    const casio = casioEvaluate({ ...casioInitial(), entry: '7!/(3!*4!)' });
    expect(Number(casio.result)).toBeCloseTo(35, 12);

    // HP RPN: 7! / (3! * 4!)
    let hp = hpPress(hpInitial(), 'n7', 'fact');                    // 5040
    hp = hpPress(hp, 'n3', 'fact');                                 // X=6, Y=5040
    hp = hpPress(hp, 'n4', 'fact');                                 // X=24, Y=6
    hp = hpPress(hp, 'mul');                                        // X=144, Y=5040
    hp = hpPress(hp, 'div');                                        // 5040/144 = 35
    expect(hp.stack.x).toBeCloseTo(35, 12);
  });

  it('vertical-curve elevation y = 100 + 0.02·50 + (-0.03)/(2·200)·50² = 100.8125', () => {
    const expr = '100+0.02*50+(0-0.03)/(2*200)*50^2';
    const ti = tiEvaluate({ ...tiInitial(), entry: expr });
    expect(Number(ti.result)).toBeCloseTo(100.8125, 6);

    const casio = casioEvaluate({ ...casioInitial(), entry: expr });
    expect(Number(casio.result)).toBeCloseTo(100.8125, 6);
    // HP convergence covered by its own surveying suite (V-4).
  });
});
