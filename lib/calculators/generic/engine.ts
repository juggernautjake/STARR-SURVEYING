// lib/calculators/generic/engine.ts
//
// cad-trv-fidelity Slice 14 — a simple Windows-calculator-style
// arithmetic engine for the default "Generic Calculator". Pure +
// framework-free so it unit-tests cleanly; the React component is a thin
// view over `genericCalcReducer`.
//
// Semantics mirror the Windows calculator's standard mode: digit entry
// with overwrite, binary operator chaining (pressing a new operator
// evaluates the pending one), `=` repeat (pressing `=` again repeats the
// last operator + operand), %, ±, ., C (all), CE (entry), ⌫ (backspace),
// and a divide-by-zero guard.

export type GenericOp = '+' | '-' | '*' | '/';

export interface GenericCalcState {
  /** The string shown on the display (always a valid number, or an error). */
  display: string;
  /** Left-hand operand held while an operator is pending. */
  accumulator: number | null;
  /** Operator awaiting its right-hand operand. */
  pendingOp: GenericOp | null;
  /** True when the next digit starts a fresh entry (replaces the display). */
  overwrite: boolean;
  /** Last operator + operand, so a repeated `=` re-applies them. */
  lastOp: GenericOp | null;
  lastOperand: number | null;
  /** Non-null when the last op errored (e.g. ÷0). Any input clears it. */
  error: string | null;
}

export type GenericAction =
  | { type: 'digit'; value: string }
  | { type: 'dot' }
  | { type: 'op'; value: GenericOp }
  | { type: 'equals' }
  | { type: 'percent' }
  | { type: 'negate' }
  | { type: 'clearAll' }
  | { type: 'clearEntry' }
  | { type: 'backspace' };

export const DIVIDE_BY_ZERO = 'Cannot divide by zero';
const MAX_DIGITS = 16;

export const initialGenericState: GenericCalcState = {
  display: '0',
  accumulator: null,
  pendingOp: null,
  overwrite: true,
  lastOp: null,
  lastOperand: null,
  error: null,
};

/** Format a JS number for the display: trim float noise, avoid `Infinity`. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return DIVIDE_BY_ZERO;
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return String(n);
  // Round to ~12 significant digits to hide binary-float artifacts, then
  // strip trailing zeros.
  let s = n.toPrecision(12);
  if (s.includes('e')) return String(Number(s)); // keep exponential compact
  s = s.replace(/\.?0+$/, '');
  return s;
}

function compute(a: number, b: number, op: GenericOp): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
  }
}

const current = (s: GenericCalcState): number => parseFloat(s.display) || 0;

export function genericCalcReducer(state: GenericCalcState, action: GenericAction): GenericCalcState {
  // Any keypress after an error (other than the explicit clears handled
  // below) starts fresh from 0.
  if (state.error && action.type !== 'clearAll' && action.type !== 'clearEntry') {
    state = { ...initialGenericState };
  }

  switch (action.type) {
    case 'digit': {
      if (state.overwrite) {
        return { ...state, display: action.value === '0' ? '0' : action.value, overwrite: false };
      }
      if (state.display === '0') {
        return { ...state, display: action.value === '0' ? '0' : action.value };
      }
      const digits = state.display.replace(/[^0-9]/g, '').length;
      if (digits >= MAX_DIGITS) return state;
      return { ...state, display: state.display + action.value };
    }

    case 'dot': {
      if (state.overwrite) return { ...state, display: '0.', overwrite: false };
      if (state.display.includes('.')) return state;
      return { ...state, display: state.display + '.' };
    }

    case 'op': {
      // Chain: if an operator is already pending and the user has typed a
      // new operand, evaluate it first so 2 + 3 + shows 5.
      if (state.pendingOp !== null && !state.overwrite && state.accumulator !== null) {
        const result = compute(state.accumulator, current(state), state.pendingOp);
        if (!Number.isFinite(result)) return divideError();
        return {
          ...state,
          display: formatNumber(result),
          accumulator: result,
          pendingOp: action.value,
          overwrite: true,
          lastOp: null,
          lastOperand: null,
        };
      }
      return {
        ...state,
        accumulator: current(state),
        pendingOp: action.value,
        overwrite: true,
        lastOp: null,
        lastOperand: null,
      };
    }

    case 'equals': {
      // Fresh `=` with a pending op: evaluate accumulator <op> current,
      // and remember op+operand for a repeated `=`.
      if (state.pendingOp !== null && state.accumulator !== null) {
        const operand = current(state);
        const result = compute(state.accumulator, operand, state.pendingOp);
        if (!Number.isFinite(result)) return divideError();
        return {
          ...state,
          display: formatNumber(result),
          accumulator: null,
          pendingOp: null,
          overwrite: true,
          lastOp: state.pendingOp,
          lastOperand: operand,
        };
      }
      // Repeated `=`: re-apply the last op + operand to the shown value.
      if (state.lastOp !== null && state.lastOperand !== null) {
        const result = compute(current(state), state.lastOperand, state.lastOp);
        if (!Number.isFinite(result)) return divideError();
        return { ...state, display: formatNumber(result), overwrite: true };
      }
      return { ...state, overwrite: true };
    }

    case 'percent': {
      // Binary context: a + b% = a + (a*b/100); standalone: b/100.
      const base = state.pendingOp !== null && state.accumulator !== null ? state.accumulator : 0;
      const pct = state.pendingOp !== null ? (base * current(state)) / 100 : current(state) / 100;
      return { ...state, display: formatNumber(pct), overwrite: true };
    }

    case 'negate':
      if (current(state) === 0) return state;
      return { ...state, display: formatNumber(-current(state)) };

    case 'clearAll':
      return { ...initialGenericState };

    case 'clearEntry':
      return { ...state, display: '0', overwrite: true, error: null };

    case 'backspace': {
      if (state.overwrite) return state;
      const next = state.display.length > 1 ? state.display.slice(0, -1) : '0';
      return { ...state, display: next === '' || next === '-' ? '0' : next, overwrite: next === '0' };
    }
  }
}

function divideError(): GenericCalcState {
  return { ...initialGenericState, display: DIVIDE_BY_ZERO, error: DIVIDE_BY_ZERO, overwrite: true };
}
