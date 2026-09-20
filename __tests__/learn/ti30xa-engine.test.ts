// The TI-30Xa emulator behaves like a TI-30Xa.
//
// Owner, 2026-09-20: "please make sure all of the calculator buttons and combinations work as they
// are supposed to on a real world calculator so that the use of the calculator on the computer will
// translate in use to a real world calculator easily."
//
// This file IS the fidelity claim. The emulator was previously wired to the TI-36X Pro engine,
// which appends `sin(` when you press SIN because that is how a MathPrint calculator works. The
// 30Xa is immediate-execution and does the opposite, so the emulator was training the exact reflex
// that loses marks with the real device in your hand.
//
// Every expectation below is a statement about the physical calculator, not about this code.
import { describe, it, expect } from 'vitest';
import {
  press, pressAll, initialState, format, storeTo, recallFrom, sumInto, exchangeWith,
} from '@/lib/calculators/models/ti-30xa/engine';

const run = (...ids: string[]) => pressAll(ids);
const shows = (...ids: string[]) => run(...ids).display;
const num = (...ids: string[]) => Number(run(...ids).display);

/** Digits, as key ids. `d('45')` → ['n4','n5']. */
const d = (s: string): string[] => s.split('').map((ch) => (ch === '.' ? 'dot' : `n${ch}`));

describe('immediate execution — the thing the old engine got backwards', () => {
  it('takes the sine of what is already on the display', () => {
    // 45 SIN is 0.7071 on the real device. No brackets, no equals.
    expect(num(...d('45'), 'sin')).toBeCloseTo(0.70710678, 7);
  });

  it('does not wait for equals to apply a function', () => {
    const after = run(...d('45'), 'sin');
    expect(after.entering, 'the display now holds a result, not an entry').toBe(false);
    expect(Number(after.display)).toBeCloseTo(0.70710678, 7);
  });

  it('squares and roots immediately too', () => {
    expect(num(...d('300'), 'xsq')).toBe(90000);
    expect(num(...d('250000'), 'sqrt')).toBe(500);
    expect(num(...d('4'), 'recip')).toBe(0.25);
  });

  it('applies a function to a running result, not to a fresh entry', () => {
    // 300 x² + 400 x² = √x  →  500. The classic inverse, done the way the device does it.
    expect(num(...d('300'), 'xsq', 'add', ...d('400'), 'xsq', 'eq', 'sqrt')).toBe(500);
  });
});

describe('AOS — it does respect order of operations', () => {
  it('multiplies before it adds', () => {
    // 2 + 3 × 4 = is 14 on a 30Xa, not 20. It is an AOS machine, not a four-function one.
    expect(num(...d('2'), 'add', ...d('3'), 'mul', ...d('4'), 'eq')).toBe(14);
  });

  it('chains same-precedence operations left to right', () => {
    expect(num(...d('100'), 'div', ...d('4'), 'div', ...d('5'), 'eq')).toBe(5);
    expect(num(...d('10'), 'sub', ...d('3'), 'sub', ...d('2'), 'eq')).toBe(5);
  });

  it('shows the partial result when an operator is pressed', () => {
    // The real device updates the display as each pending operation resolves, which is how you
    // catch a wrong number before it is three steps behind you.
    expect(shows(...d('2'), 'add', ...d('3'), 'add')).toBe('5');
  });

  it('honours brackets', () => {
    expect(num(...d('2'), 'add', ...d('3'), 'mul', 'lparen', ...d('4'), 'add', ...d('1'), 'rparen', 'eq')).toBe(17);
    expect(num('lparen', ...d('2'), 'add', ...d('3'), 'rparen', 'mul', ...d('4'), 'eq')).toBe(20);
  });

  it('closes unclosed brackets at equals', () => {
    expect(num('lparen', ...d('2'), 'add', ...d('3'), 'eq')).toBe(5);
  });

  it('gives the power key higher precedence than multiplication', () => {
    // 2 × 3 yˣ 2 = is 18, because the power binds first.
    expect(num(...d('2'), 'mul', ...d('3'), 'pow', ...d('2'), 'eq')).toBe(18);
  });
});

describe('2nd is a one-shot shift, not a lock', () => {
  it('reaches the inverse function', () => {
    expect(num(...d('0.5'), '2nd', 'sin')).toBeCloseTo(30, 6);
  });

  it('releases after one key', () => {
    // 2nd SIN⁻¹ then SIN should be a plain sine, not another arcsine.
    const after = run(...d('0.5'), '2nd', 'sin');
    expect(after.shift).toBe(false);
  });

  it('cancels itself when pressed twice', () => {
    // A documented trap: people press it twice expecting a lock and then wonder why nothing shifted.
    expect(run('2nd', '2nd').shift).toBe(false);
  });
});

describe('the angle mode', () => {
  it('starts in degrees, because the exam is in degrees', () => {
    expect(initialState.mode).toBe('DEG');
  });

  it('cycles DEG → RAD → GRAD', () => {
    expect(run('mode').mode).toBe('RAD');
    expect(run('mode', 'mode').mode).toBe('GRAD');
    expect(run('mode', 'mode', 'mode').mode).toBe('DEG');
  });

  it('computes in whatever mode it is in', () => {
    // sin(45 radians) is not 0.707 — this is the failure mode a calculator left in RAD produces,
    // and it looks entirely reasonable on the page.
    expect(num('mode', ...d('45'), 'sin')).toBeCloseTo(0.850903525, 7);
  });

  it('CONVERTS the number with 2nd DRG►, rather than just changing the mode', () => {
    // The distinction the catalogue warns about: DRG changes the mode and leaves the number alone;
    // 2nd DRG► changes the number. 180 degrees becomes π radians.
    const after = run(...d('180'), '2nd', 'mode');
    expect(after.mode).toBe('RAD');
    expect(Number(after.display)).toBeCloseTo(Math.PI, 6);
  });
});

describe('signs, and the key that is not subtraction', () => {
  it('negates the displayed number', () => {
    expect(shows(...d('42.5'), 'negate')).toBe('-42.5');
  });

  it('negates after a function, not only during entry', () => {
    expect(num(...d('9'), 'sqrt', 'negate')).toBe(-3);
  });

  it('is not the same as starting a subtraction', () => {
    // 5 − 3 = is 2; 5 then 3 +/− is just −3 with a 5 forgotten.
    expect(num(...d('5'), 'sub', ...d('3'), 'eq')).toBe(2);
    expect(num(...d('5'), ...d('3'), 'negate')).toBe(-53);
  });
});

describe('clearing', () => {
  it('clears the entry first, and the calculation second', () => {
    // The most useful habit on the machine: a mistyped number mid-calculation costs one key.
    const afterOne = run(...d('2'), 'add', ...d('99'), 'del');
    expect(afterOne.display).toBe('0');
    expect(afterOne.pending.length, 'the pending + survives the first clear').toBe(1);
    const afterTwo = press(afterOne, 'del');
    expect(afterTwo.pending.length).toBe(0);
  });

  it('keeps memory and the angle mode through a full clear', () => {
    // The real device does. Somebody who stored the earth's radius should not lose it by clearing.
    const withMem = storeTo(run('mode', ...d('1234')), 0);
    const cleared = press(press(withMem, 'del'), 'del');
    expect(cleared.memory[0]).toBe(1234);
    expect(cleared.mode).toBe('RAD');
  });
});

describe('errors behave like errors', () => {
  it('refuses division by zero', () => {
    expect(shows(...d('5'), 'div', ...d('0'), 'eq')).toBe('Error');
  });

  it('locks up until cleared, as the device does', () => {
    // Not pedantry: it is how you notice, instead of carrying a silent NaN through four more steps.
    const errored = run(...d('5'), 'div', ...d('0'), 'eq');
    expect(press(errored, 'n7').display).toBe('Error');
    expect(press(errored, 'del').display).toBe('0');
  });

  it('refuses the square root of a negative number', () => {
    expect(shows(...d('9'), 'negate', 'sqrt')).toBe('Error');
  });
});

describe('memory', () => {
  it('stores and recalls', () => {
    const stored = storeTo(run(...d('20906000')), 0);
    expect(recallFrom(stored, 0).display).toBe('20906000');
  });

  it('adds to a memory with SUM rather than replacing it', () => {
    let s = storeTo(run(...d('100')), 1);
    s = sumInto(run(...d('50')), 1);
    // `sumInto` works from the state it is given, so rebuild the sequence the way the device runs.
    const combined = sumInto({ ...s, memory: [0, 100, 0], display: '50' }, 1);
    expect(combined.memory[1]).toBe(150);
  });

  it('exchanges the display with a memory', () => {
    const s = exchangeWith({ ...initialState, memory: [7, 0, 0], display: '42' }, 0);
    expect(s.display).toBe('7');
    expect(s.memory[0]).toBe(42);
  });
});

describe('statistics — the fast route to a standard deviation', () => {
  const enter = (...values: string[]) => {
    let s = initialState;
    for (const v of values) {
      s = v.split('').reduce((acc, ch) => press(acc, ch === '.' ? 'dot' : `n${ch}`), s);
      s = press(s, 'sigma');
    }
    return s;
  };

  it('counts the points as they go in', () => {
    expect(enter('215.86', '215.90', '215.88').display).toBe('3');
  });

  it('gives the mean with 2nd x̄', () => {
    const s = press(press(enter('10', '20', '30'), '2nd'), 'xsq');
    expect(Number(s.display)).toBeCloseTo(20, 9);
  });

  it('gives the SAMPLE standard deviation with 2nd σxn−1', () => {
    // n−1, which is the one surveying wants. For 10, 20, 30 that is 10 exactly.
    const s = press(press(enter('10', '20', '30'), '2nd'), 'sqrt');
    expect(Number(s.display)).toBeCloseTo(10, 9);
  });

  it('gives Σx and Σx²', () => {
    const base = enter('1', '2', '3');
    expect(Number(press(press(base, '2nd'), 'lparen').display)).toBe(6);
    expect(Number(press(press(base, '2nd'), 'rparen').display)).toBe(14);
  });

  it('removes a point entered by mistake', () => {
    const base = enter('10', '99', '20');
    const fixed = press(press(base, 'n9'), 'n9');
    const removed = press(press(fixed, '2nd'), 'sigma');
    expect(removed.display).toBe('2');
  });
});

describe('the display reads like the device', () => {
  it('strips trailing zeros', () => {
    expect(format(500)).toBe('500');
    expect(format(0.5)).toBe('0.5');
  });

  it('holds ten significant digits', () => {
    expect(format(1 / 3)).toBe('0.3333333333');
  });

  it('goes scientific when the number leaves the display', () => {
    expect(format(1.5e12)).toContain('e');
    expect(format(0.0000015)).toContain('e');
  });

  it('refuses an eleventh digit during entry, as a ten-digit LCD must', () => {
    expect(shows(...d('12345678901'))).toBe('1234567890');
  });
});

describe('the sequences from the catalogue actually work', () => {
  it('the inverse drill', () => {
    // 300 x² + 400 x² = √x → 500, then 400 ÷ 300 = 2nd TAN⁻¹ → 53.13°.
    expect(num(...d('300'), 'xsq', 'add', ...d('400'), 'xsq', 'eq', 'sqrt')).toBe(500);
    expect(num(...d('400'), 'div', ...d('300'), 'eq', '2nd', 'tan')).toBeCloseTo(53.13010235, 6);
  });

  it('the DMS drill', () => {
    // 52 + 14 ÷ 60 + 30 ÷ 3600 = → 52.2417°. AOS is what makes this work without brackets.
    expect(num(
      ...d('52'), 'add', ...d('14'), 'div', ...d('60'), 'add', ...d('30'), 'div', ...d('3600'), 'eq',
    )).toBeCloseTo(52.24166667, 7);
  });

  it('the curve drill', () => {
    // 5729.58 ÷ 4 = → R, then × ( 36 ÷ 2 ) TAN = → T.
    expect(num(...d('5729.58'), 'div', ...d('4'), 'eq')).toBeCloseTo(1432.395, 3);
    const t = num(
      ...d('5729.58'), 'div', ...d('4'), 'eq',
      'mul', 'lparen', ...d('36'), 'div', ...d('2'), 'rparen', 'tan', 'eq',
    );
    expect(t).toBeCloseTo(465.41, 1);
  });

  it('the compound-interest drill', () => {
    // 1.09 yˣ 6 = → 1.6771.
    expect(num(...d('1.09'), 'pow', ...d('6'), 'eq')).toBeCloseTo(1.677100111, 7);
  });
});
