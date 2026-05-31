// __tests__/cad/calculators/generic-engine.test.ts
//
// cad-calculator-suite Slice 2 — pure state machine for the
// Windows-style generic calculator. Locks the chained-operation
// contract + every public action's behavior.

import { describe, it, expect } from 'vitest';
import {
  INITIAL_GENERIC_STATE,
  applyOp,
  formatDisplay,
  inputBackspace,
  inputClear,
  inputClearEntry,
  inputDecimal,
  inputDigit,
  inputEquals,
  inputOp,
  inputSignFlip,
  parseDisplay,
  type GenericCalcState,
} from '@/lib/cad/calculators/generic-engine';

// Convenience: chain a list of single-character key presses through
// the engine. Digits become inputDigit; +, -, *, / become inputOp;
// `=` is inputEquals; `.` is inputDecimal; `C` is clear;
// `B` is backspace; `±` is sign flip.
function chain(presses: string): GenericCalcState {
  let s = INITIAL_GENERIC_STATE;
  for (const ch of presses) {
    if (/[0-9]/.test(ch)) s = inputDigit(s, ch);
    else if (ch === '+') s = inputOp(s, '+');
    else if (ch === '-') s = inputOp(s, '-');
    else if (ch === '*') s = inputOp(s, '*');
    else if (ch === '/') s = inputOp(s, '/');
    else if (ch === '=') s = inputEquals(s);
    else if (ch === '.') s = inputDecimal(s);
    else if (ch === 'C') s = inputClear(s);
    else if (ch === 'E') s = inputClearEntry(s);
    else if (ch === 'B') s = inputBackspace(s);
    else if (ch === '±') s = inputSignFlip(s);
  }
  return s;
}

describe('formatDisplay', () => {
  it('renders integers as-is', () => {
    expect(formatDisplay(0)).toBe('0');
    expect(formatDisplay(42)).toBe('42');
    expect(formatDisplay(-17)).toBe('-17');
  });

  it('trims trailing zeros from fractional numbers', () => {
    expect(formatDisplay(3.14)).toBe('3.14');
    expect(formatDisplay(0.5)).toBe('0.5');
  });

  it('returns "Error" for non-finite values (divide-by-zero etc.)', () => {
    expect(formatDisplay(NaN)).toBe('Error');
    expect(formatDisplay(Infinity)).toBe('Error');
  });
});

describe('parseDisplay', () => {
  it('handles mid-entry decimal-only strings', () => {
    expect(parseDisplay('.')).toBe(0);
    expect(parseDisplay('-')).toBe(0);
    expect(parseDisplay('3.')).toBe(3);
  });
});

describe('applyOp', () => {
  it('performs each operator', () => {
    expect(applyOp(2, 3, '+')).toBe(5);
    expect(applyOp(2, 3, '-')).toBe(-1);
    expect(applyOp(2, 3, '*')).toBe(6);
    expect(applyOp(6, 2, '/')).toBe(3);
  });

  it('returns NaN on divide-by-zero', () => {
    expect(Number.isNaN(applyOp(7, 0, '/'))).toBe(true);
  });
});

describe('inputDigit', () => {
  it('replaces the leading 0 on the first digit', () => {
    expect(chain('7').display).toBe('7');
  });

  it('appends subsequent digits', () => {
    expect(chain('123').display).toBe('123');
  });

  it('starts a fresh display after `=`', () => {
    expect(chain('1+2=5').display).toBe('5');
  });
});

describe('inputDecimal', () => {
  it('adds a single decimal', () => {
    expect(chain('3.14').display).toBe('3.14');
  });

  it('ignores extra decimals', () => {
    expect(chain('3.1.4').display).toBe('3.14');
  });

  it('starts a fresh `0.` after =', () => {
    expect(chain('1+2=.5').display).toBe('0.5');
  });
});

describe('inputOp — chained operations show running subtotals', () => {
  it('12 + 3 + 4 = 19 (the canonical chained-op test)', () => {
    expect(chain('12+3+4=').display).toBe('19');
  });

  it('each `+` press displays the running subtotal mid-chain', () => {
    // After "12 + 3 +": display should be 15 (= 12+3), with op +
    // queued for the next number.
    const after = chain('12+3+');
    expect(after.display).toBe('15');
    expect(after.op).toBe('+');
    expect(after.pending).toBe(15);
  });

  it('left-to-right evaluation (no operator precedence)', () => {
    expect(chain('3*4+2=').display).toBe('14');
  });

  it('handles subtraction', () => {
    expect(chain('7-2=').display).toBe('5');
  });

  it('handles division', () => {
    expect(chain('20/4=').display).toBe('5');
  });
});

describe('inputEquals', () => {
  it('finalizes the in-progress op + locks justEvaluated', () => {
    const s = chain('1+2=');
    expect(s.display).toBe('3');
    expect(s.pending).toBeNull();
    expect(s.op).toBeNull();
    expect(s.justEvaluated).toBe(true);
  });

  it('shows Error on divide-by-zero', () => {
    expect(chain('5/0=').display).toBe('Error');
  });

  it('is a no-op when no operator is pending', () => {
    expect(chain('5=').display).toBe('5');
  });
});

describe('inputClear / inputClearEntry', () => {
  it('C resets everything', () => {
    const s = chain('1+2');
    const cleared = inputClear(s);
    expect(cleared).toEqual(INITIAL_GENERIC_STATE);
  });

  it('CE clears the display only (keeps pending op)', () => {
    const s = chain('1+');
    const cleared = inputClearEntry(s);
    expect(cleared.display).toBe('0');
    expect(cleared.pending).toBe(1);
    expect(cleared.op).toBe('+');
  });
});

describe('inputSignFlip / inputBackspace', () => {
  it('± toggles the sign of the display', () => {
    expect(chain('5±').display).toBe('-5');
    expect(chain('5±±').display).toBe('5');
  });

  it('± is a no-op on 0', () => {
    expect(chain('±').display).toBe('0');
  });

  it('backspace drops the rightmost character', () => {
    expect(chain('123B').display).toBe('12');
    expect(chain('1B').display).toBe('0');
  });

  it('backspace is a no-op right after =', () => {
    const s = chain('1+2=');
    expect(inputBackspace(s).display).toBe('3');
  });
});

describe('tape', () => {
  it('logs each operator press + each = press', () => {
    const s = chain('12+3+4=');
    // Tape entries: '12 +', '3 = 15', '15 +', '15 + 4 = 19'.
    expect(s.tape.length).toBeGreaterThan(0);
    expect(s.tape[s.tape.length - 1]).toContain('= 19');
  });
});
