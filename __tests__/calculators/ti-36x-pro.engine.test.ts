// __tests__/calculators/ti-36x-pro.engine.test.ts
//
// Engine tests for the TI-36X Pro algebraic input parser.
// C-7 of EXAM_CALCULATORS.md.

import { describe, it, expect } from 'vitest';
import { dispatch, evaluate, hydrate, initialState, serialize, type Ti36xState } from '@/lib/calculators/models/ti-36x-pro/engine';

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

describe('TI-36X Pro — memory + history (C-8)', () => {
  it('stores lastAnswer into the x slot via sto+1', () => {
    let s = press(initialState(), 'n4', 'n2', 'eq');           // result 42
    s = press(s, 'sto', 'n1');                                  // store into slot x
    expect(s.memory.x).toBe(42);
    expect(s.pendingMemOp).toBeNull();
  });

  it('recalls slot via 2nd+apps then digit', () => {
    let s: Ti36xState = { ...initialState(), memory: { x: 17, y: 0, z: 0, t: 0, a: 0, b: 0, c: 0 } };
    s = press(s, '2nd', 'apps', 'n1');
    expect(s.entry).toBe('17');
  });

  it('non-digit key cancels a pending memory op', () => {
    let s = press(initialState(), 'sto');
    expect(s.pendingMemOp).toBe('sto');
    s = press(s, 'add');
    expect(s.pendingMemOp).toBeNull();
  });

  it('history captures successful evaluations newest-last, capped at 10', () => {
    let s = initialState();
    for (let i = 1; i <= 12; i++) {
      s = press(s, `n${(i % 10)}`, 'eq');
    }
    expect(s.history.length).toBe(10);
    expect(s.history[s.history.length - 1].result).toBe(String(12 % 10));
  });
});

describe('TI-36X Pro — surveying functions (C-10)', () => {
  it('→DMS shifts lastAnswer into DMS notation', () => {
    // F-1 fidelity audit: ►DMS is now the primary (unshifted) press of
    // the `pct` key, matching the real device's screen-print.
    let s: Ti36xState = { ...initialState(), lastAnswer: 12.51625, result: '12.51625' };
    s = press(s, 'pct');
    expect(s.result).toBe('12°30\'58.50"');
  });

  it('F-1: pct primary press is ►DMS (no shift required)', () => {
    let s: Ti36xState = { ...initialState(), lastAnswer: 45.5, result: '45.5' };
    s = press(s, 'pct');
    expect(s.result).toBe('45°30\'00.00"');
  });

  it('F-1: SHIFT+pct triggers ►HR (DMS → decimal) on the same key', () => {
    let s: Ti36xState = { ...initialState(), result: '90°15\'00.00"' };
    s = press(s, '2nd', 'pct');
    expect(s.lastAnswer).toBeCloseTo(90.25, 8);
  });

  it('F↔D round-trips a DMS string back to decimal degrees', () => {
    let s: Ti36xState = { ...initialState(), result: '12°30\'58.50"' };
    s = press(s, '2nd', 'frac');
    expect(Number(s.result)).toBeCloseTo(12.51625, 6);
    expect(s.lastAnswer).toBeCloseTo(12.51625, 6);
  });

  it('pol(3, 4) magnitude = 5', () => {
    let s: Ti36xState = { ...initialState(), entry: 'pol(3,4)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(5, 12);
  });

  it('atan2(1, 1) in DEG = 45', () => {
    let s: Ti36xState = { ...initialState(), entry: 'atan2(1,1)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(45, 12);
  });

  it('rec(10, 60) x-component in DEG = 5', () => {
    let s: Ti36xState = { ...initialState(), entry: 'rec(10,60)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(5, 6);
  });

  it('mod(10, 3) = 1', () => {
    let s: Ti36xState = { ...initialState(), entry: 'mod(10,3)' };
    s = evaluate(s);
    expect(Number(s.result)).toBeCloseTo(1, 12);
  });
});

describe('TI-36X Pro — serialize / hydrate round-trip (C-9)', () => {
  it('serialize drops transient flags', () => {
    const s: Ti36xState = { ...initialState(), shiftActive: true, pendingMemOp: 'sto' };
    const json = serialize(s);
    expect('shiftActive' in json).toBe(false);
    expect('pendingMemOp' in json).toBe(false);
  });

  it('hydrate(serialize(state)) preserves all persisted fields', () => {
    let s = press(initialState(), 'n4', 'n2', 'eq');
    s = press(s, 'sto', 'n1');                          // memory.x = 42
    s = press(s, 'mode');                               // RAD
    const json = serialize(s);
    const round = hydrate(JSON.parse(JSON.stringify(json)));
    expect(round.lastAnswer).toBe(42);
    expect(round.memory.x).toBe(42);
    expect(round.angleMode).toBe('RAD');
    expect(round.history.length).toBe(1);
    // Transient flags reset to defaults.
    expect(round.shiftActive).toBe(false);
    expect(round.pendingMemOp).toBeNull();
  });

  it('hydrate of malformed blob falls back to initial state', () => {
    const r1 = hydrate(null);
    expect(r1.entry).toBe('');
    expect(r1.lastAnswer).toBe(0);
    const r2 = hydrate({ memory: 'not an object' });
    expect(r2.memory.x).toBe(0);
  });

  it('hydrate truncates oversized history to cap', () => {
    const oversized = Array.from({ length: 25 }, (_, i) => ({ entry: String(i), result: String(i), value: i }));
    const r = hydrate({ history: oversized });
    expect(r.history.length).toBe(10);
    // Latest 10 retained (slice(-10)).
    expect(r.history[0].value).toBe(15);
    expect(r.history[9].value).toBe(24);
  });
});
