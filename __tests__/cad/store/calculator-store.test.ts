// __tests__/cad/store/calculator-store.test.ts
//
// cad-calculator-suite Slice 1 — pure zustand store for the
// calculator suite. Locks the default active id, the per-calc
// state isolation (switching preserves each one's data), and the
// reset path.

import { describe, it, expect, beforeEach } from 'vitest';
import { useCalculatorStore, DEFAULT_CALCULATOR_ID } from '@/lib/cad/store/calculator-store';

interface GenericState {
  display: string;
  tape: string[];
}

interface CurveState {
  radius: number;
}

beforeEach(() => {
  useCalculatorStore.getState().resetAll();
});

describe('calculatorStore — defaults', () => {
  it('defaults the active calculator id to "generic"', () => {
    expect(useCalculatorStore.getState().activeCalculatorId).toBe('generic');
    expect(DEFAULT_CALCULATOR_ID).toBe('generic');
  });

  it('starts with no per-calculator state', () => {
    expect(useCalculatorStore.getState().states).toEqual({});
  });

  it('getActiveState returns null on a fresh store', () => {
    expect(useCalculatorStore.getState().getActiveState<GenericState>()).toBeNull();
  });
});

describe('calculatorStore — switching + per-calc isolation', () => {
  it('setActiveCalculator updates the active id', () => {
    useCalculatorStore.getState().setActiveCalculator('curve');
    expect(useCalculatorStore.getState().activeCalculatorId).toBe('curve');
  });

  it('switching between calculators preserves each one\'s state independently', () => {
    const store = useCalculatorStore.getState();
    // Set generic state, switch to curve, set curve state, switch back.
    store.setActiveState({ display: '42', tape: ['1+2', '+3'] } satisfies GenericState);
    store.setActiveCalculator('curve');
    store.setActiveState({ radius: 100 } satisfies CurveState);
    store.setActiveCalculator('generic');
    expect(useCalculatorStore.getState().getActiveState<GenericState>()).toEqual({
      display: '42',
      tape: ['1+2', '+3'],
    });
    useCalculatorStore.getState().setActiveCalculator('curve');
    expect(useCalculatorStore.getState().getActiveState<CurveState>()).toEqual({ radius: 100 });
  });

  it('setCalculatorState writes a specific id without changing the active id', () => {
    const store = useCalculatorStore.getState();
    store.setActiveCalculator('generic');
    store.setCalculatorState('curve', { radius: 5 } satisfies CurveState);
    expect(useCalculatorStore.getState().activeCalculatorId).toBe('generic');
    expect(useCalculatorStore.getState().getCalculatorState<CurveState>('curve')).toEqual({ radius: 5 });
  });
});

describe('calculatorStore — reset', () => {
  it('resetAll wipes states + restores the default active id', () => {
    const store = useCalculatorStore.getState();
    store.setActiveCalculator('curve');
    store.setActiveState({ radius: 7 } satisfies CurveState);
    store.resetAll();
    expect(useCalculatorStore.getState().activeCalculatorId).toBe('generic');
    expect(useCalculatorStore.getState().states).toEqual({});
  });
});

describe('calculatorStore — getActiveState narrows correctly', () => {
  it('returns the active calculator\'s state cast to the generic param', () => {
    useCalculatorStore.getState().setActiveCalculator('generic');
    useCalculatorStore.getState().setActiveState({ display: '7', tape: [] } satisfies GenericState);
    const s = useCalculatorStore.getState().getActiveState<GenericState>();
    expect(s?.display).toBe('7');
    expect(s?.tape).toEqual([]);
  });
});
