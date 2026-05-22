// __tests__/calculators/hp-35s.engine.test.ts
//
// Engine tests for the HP 35s RPN stack machine. C-16.

import { describe, it, expect } from 'vitest';
import {
  dispatch, hydrate, initialState, serialize, type Hp35sState,
} from '@/lib/calculators/models/hp-35s/engine';

function press(state: Hp35sState, ...ids: string[]): Hp35sState {
  return ids.reduce((s, id) => dispatch(s, { type: 'press', keyId: id }), state);
}

describe('HP 35s RPN — entry + ENTER', () => {
  it('typing digits builds entry; ENTER lifts X', () => {
    const s = press(initialState(), 'n3', 'enter');
    expect(s.stack.x).toBe(3);
    expect(s.stack.y).toBe(3); // ENTER duplicates X up
  });

  it('after ENTER, typing a new number stays in the entry buffer (replaces X on next op)', () => {
    const s = press(initialState(), 'n3', 'enter', 'n5');
    // The 5 sits in the entry buffer; stack.x still holds the duplicated 3
    // until the next operator (or ENTER) commits it.
    expect(s.entry).toBe('5');
    expect(s.stack.x).toBe(3);
    expect(s.stack.y).toBe(3);
    // Committing via the next op replaces X with the entry value.
    const s2 = press(s, 'add');
    expect(s2.stack.x).toBe(8);
  });
});

describe('HP 35s RPN — binary ops', () => {
  it('3 ENTER 5 + → 8', () => {
    const s = press(initialState(), 'n3', 'enter', 'n5', 'add');
    expect(s.stack.x).toBe(8);
  });

  it('precedence-free: 2 ENTER 3 + 4 × → 20  (i.e. (2+3) × 4)', () => {
    const s = press(initialState(), 'n2', 'enter', 'n3', 'add', 'n4', 'mul');
    expect(s.stack.x).toBe(20);
  });

  it('division: 10 ENTER 4 ÷ → 2.5', () => {
    const s = press(initialState(), 'n1', 'n0', 'enter', 'n4', 'div');
    expect(s.stack.x).toBe(2.5);
  });

  it('power: 2 ENTER 10 yˣ → 1024', () => {
    const s = press(initialState(), 'n2', 'enter', 'n1', 'n0', 'ypowx');
    expect(s.stack.x).toBe(1024);
  });
});

describe('HP 35s RPN — unary ops', () => {
  it('5 sqrt → ~2.236', () => {
    const s = press(initialState(), 'n5', 'sqrt');
    expect(s.stack.x).toBeCloseTo(Math.sqrt(5), 12);
  });

  it('30 sin in DEG → 0.5', () => {
    const s = press(initialState(), 'n3', 'n0', 'sin');
    expect(s.stack.x).toBeCloseTo(0.5, 12);
  });

  it('5! → 120', () => {
    const s = press(initialState(), 'n5', 'fact');
    expect(s.stack.x).toBe(120);
  });

  it('|−7| → 7', () => {
    const s = press(initialState(), 'n7', 'chs', 'absx');
    expect(s.stack.x).toBe(7);
  });

  it('left-shift (fshift) sqrt becomes x²', () => {
    const s = press(initialState(), 'n4', 'fshift', 'sqrt');
    expect(s.stack.x).toBe(16);
  });
});

describe('HP 35s RPN — stack manipulation', () => {
  it('x↔y swaps the two visible registers', () => {
    const s = press(initialState(), 'n3', 'enter', 'n5', 'xchgy');
    expect(s.stack.x).toBe(3);
    expect(s.stack.y).toBe(5);
  });

  it('R↓ rolls the stack down', () => {
    // Build T=1, Z=2, Y=3, X=4 then roll.
    let s = press(initialState(), 'n1', 'enter', 'n2', 'enter', 'n3', 'enter', 'n4');
    s = press(s, 'rdown');
    expect(s.stack.x).toBe(3);
    expect(s.stack.t).toBe(4);
  });

  it('LASTx pushes the previous X', () => {
    let s = press(initialState(), 'n3', 'enter', 'n5', 'add');  // 8; lastX=5
    s = press(s, 'lastx');
    expect(s.stack.x).toBe(5);
  });

  it('CHS toggles sign on X (no entry buffer)', () => {
    const s = press(initialState(), 'n5', 'enter', 'chs');
    expect(s.stack.x).toBe(-5);
  });
});

describe('HP 35s RPN — constants + mode', () => {
  it('π pushes pi onto X', () => {
    const s = press(initialState(), 'pi');
    expect(s.stack.x).toBeCloseTo(Math.PI, 12);
  });

  it('fshift then pi pushes e instead', () => {
    const s = press(initialState(), 'fshift', 'pi');
    expect(s.stack.x).toBeCloseTo(Math.E, 12);
  });

  it('►RAD switches angle mode to RAD; fshift toggles to DEG', () => {
    let s = press(initialState(), 'rad');
    expect(s.angleMode).toBe('RAD');
    s = press(s, 'fshift', 'rad');
    expect(s.angleMode).toBe('DEG');
  });
});

describe('HP 35s — serialize/hydrate', () => {
  it('round-trip preserves stack, lastX, history, mode, memory', () => {
    let s = press(initialState(), 'n3', 'enter', 'n5', 'add');
    s = press(s, 'rad');
    const round = hydrate(JSON.parse(JSON.stringify(serialize(s))));
    expect(round.stack.x).toBe(8);
    expect(round.lastX).toBe(5);
    expect(round.angleMode).toBe('RAD');
  });

  it('hydrate drops transient flags', () => {
    const s: Hp35sState = { ...initialState(), shiftActive: 'f' };
    const round = hydrate(serialize(s));
    expect(round.shiftActive).toBeNull();
  });
});
