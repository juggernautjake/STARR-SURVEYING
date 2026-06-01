// __tests__/calculators/generic-engine.test.ts
//
// cad-trv-fidelity Slice 14 — the Generic Calculator's Windows-style
// arithmetic engine.

import { describe, it, expect } from 'vitest';
import {
  genericCalcReducer as r,
  initialGenericState,
  DIVIDE_BY_ZERO,
  type GenericAction,
  type GenericCalcState,
} from '@/lib/calculators/generic/engine';

/** Apply a sequence of actions from the initial state. */
function run(...actions: GenericAction[]): GenericCalcState {
  return actions.reduce((s, a) => r(s, a), initialGenericState);
}
const d = (value: string): GenericAction => ({ type: 'digit', value });
const op = (value: '+' | '-' | '*' | '/'): GenericAction => ({ type: 'op', value });
const eq: GenericAction = { type: 'equals' };

describe('generic calculator engine', () => {
  it('enters digits replacing the leading zero', () => {
    expect(run(d('4'), d('2')).display).toBe('42');
  });

  it('adds: 2 + 3 = 5', () => {
    expect(run(d('2'), op('+'), d('3'), eq).display).toBe('5');
  });

  it('chains operators: 2 + 3 × 4 evaluates the pending op (so shows 5 then 20)', () => {
    const afterTimes = run(d('2'), op('+'), d('3'), op('*'));
    expect(afterTimes.display).toBe('5');
    expect(r(r(afterTimes, d('4')), eq).display).toBe('20');
  });

  it('repeats the last op on repeated equals: 5 + = = ', () => {
    const once = run(d('5'), op('+'), d('3'), eq); // 8
    expect(once.display).toBe('8');
    const twice = r(once, eq); // 8 + 3 = 11
    expect(twice.display).toBe('11');
    expect(r(twice, eq).display).toBe('14');
  });

  it('subtracts, multiplies, divides', () => {
    expect(run(d('9'), op('-'), d('4'), eq).display).toBe('5');
    expect(run(d('6'), op('*'), d('7'), eq).display).toBe('42');
    expect(run(d('8'), op('/'), d('2'), eq).display).toBe('4');
  });

  it('guards divide-by-zero', () => {
    const s = run(d('5'), op('/'), d('0'), eq);
    expect(s.display).toBe(DIVIDE_BY_ZERO);
    expect(s.error).toBe(DIVIDE_BY_ZERO);
    // Any digit after the error starts fresh.
    expect(r(s, d('7')).display).toBe('7');
  });

  it('negate (±) flips sign; percent divides standalone by 100', () => {
    expect(run(d('5'), { type: 'negate' }).display).toBe('-5');
    expect(run(d('5'), { type: 'percent' }).display).toBe('0.05');
  });

  it('percent in a binary context: 200 + 10% = +20', () => {
    const s = run(d('2'), d('0'), d('0'), op('+'), d('1'), d('0'), { type: 'percent' });
    expect(s.display).toBe('20');
    expect(r(s, eq).display).toBe('220');
  });

  it('decimal point: 1 . 5 + 0 . 5 = 2', () => {
    expect(run(d('1'), { type: 'dot' }, d('5'), op('+'), d('0'), { type: 'dot' }, d('5'), eq).display).toBe('2');
  });

  it('only one decimal point allowed', () => {
    expect(run(d('1'), { type: 'dot' }, d('5'), { type: 'dot' }, d('2')).display).toBe('1.52');
  });

  it('backspace drops the last digit; clearEntry zeroes the entry; clearAll resets', () => {
    expect(run(d('1'), d('2'), d('3'), { type: 'backspace' }).display).toBe('12');
    expect(run(d('1'), d('2'), { type: 'clearEntry' }).display).toBe('0');
    const cleared = run(d('5'), op('+'), d('3'), { type: 'clearAll' });
    expect(cleared).toEqual(initialGenericState);
  });
});
