// lib/cad/calculators/generic-engine.ts
//
// cad-calculator-suite Slice 2 — pure state machine for the
// Windows-style generic calculator. Mirrors the Calculator.exe
// chained-operation contract:
//
//   12 + 3 + 4 =     →  display 19 at the final `=`, with the
//                       running subtotal showing on each `+` press.
//   12 + 3 + =       →  display 18 (the final operator just runs
//                       the pending op against itself, like
//                       Win calc).
//   7 - 2 =          →  display 5.
//   3 * 4 + 2 =      →  display 14 (left-to-right; no precedence,
//                       same as Win calc).
//
// Pure: no React, no DOM. Every action returns a fresh state plus
// an optional `tape` entry (the line that should show up in the
// running history so the surveyor can chain quickly without losing
// what they typed two steps ago).
//
// State invariants:
//   - `display` is always a finite, parseable number string. We
//     hold trailing-decimal cases as `"3."` during entry but
//     normalize on each operator press.
//   - `pending` is the LHS of the in-progress operation (set when
//     the surveyor presses the FIRST operator). null = no
//     in-progress op.
//   - `op` is the operator queued against `pending` + the next
//     digit input. null = no queued op.
//   - `justEvaluated` flag — true the press right after `=` so the
//     next digit starts a fresh display instead of appending.

export type GenericCalcOp = '+' | '-' | '*' | '/';

export interface GenericCalcState {
  /** The current display string (what the surveyor sees). */
  display: string;
  /** The LHS of an in-progress operation. null when no op pending. */
  pending: number | null;
  /** The queued operator. null when nothing queued. */
  op: GenericCalcOp | null;
  /** True the press right after `=` so the next digit replaces
   *  display instead of appending. */
  justEvaluated: boolean;
  /** True right after an operator press so the next digit replaces
   *  the display (start of the RHS) instead of appending. */
  awaitingOperand: boolean;
  /** Running history. Append-only. Caller can render the last N
   *  entries as a tape above the display. */
  tape: string[];
}

export const INITIAL_GENERIC_STATE: GenericCalcState = {
  display: '0',
  pending: null,
  op: null,
  justEvaluated: false,
  awaitingOperand: false,
  tape: [],
};

/** Normalize a display string into a finite number. Treats
 *  `"3."` and `"."` as 3 and 0 respectively (entry-mid states). */
export function parseDisplay(display: string): number {
  if (display === '' || display === '.' || display === '-' || display === '-.') return 0;
  const n = parseFloat(display);
  return Number.isFinite(n) ? n : 0;
}

/** Format a number for display. Strips trailing zeros from the
 *  fractional part + caps at 10 significant digits so a wide
 *  number doesn't overflow the modal. Falls back to scientific
 *  for very large / very small. */
export function formatDisplay(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  // Integers (within safe range) print as-is.
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toString();
  // Cap to 10 sig figs; trim trailing zeros.
  const sig = n.toPrecision(10);
  // toPrecision can switch to exponential automatically for very
  // small / very large numbers — keep it.
  if (sig.includes('e') || sig.includes('E')) return sig;
  return sig.replace(/0+$/, '').replace(/\.$/, '');
}

/** Apply an operator to two numbers. Returns NaN on divide-by-zero
 *  so callers can show "Error" on the display. */
export function applyOp(a: number, b: number, op: GenericCalcOp): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
  }
}

/** Press a digit. Appends to the display unless we're fresh after
 *  `=` / an operator (start over) or the display is just `"0"`
 *  (replace). */
export function inputDigit(s: GenericCalcState, digit: string): GenericCalcState {
  const fresh = s.justEvaluated || s.awaitingOperand || s.display === '0';
  const next = fresh ? digit : s.display + digit;
  return { ...s, display: next, justEvaluated: false, awaitingOperand: false };
}

/** Press the decimal point. No-op if the current display already
 *  has one. */
export function inputDecimal(s: GenericCalcState): GenericCalcState {
  if (s.justEvaluated || s.awaitingOperand) {
    return { ...s, display: '0.', justEvaluated: false, awaitingOperand: false };
  }
  if (s.display.includes('.')) return s;
  return { ...s, display: s.display + '.' };
}

/** Press an operator (+ − × ÷). If a pending op exists, evaluate
 *  it first (so chained presses show the running subtotal). */
export function inputOp(s: GenericCalcState, op: GenericCalcOp): GenericCalcState {
  const current = parseDisplay(s.display);
  // No pending → just queue this op as the first.
  if (s.pending === null || s.op === null) {
    return {
      ...s,
      display: formatDisplay(current),
      pending: current,
      op,
      justEvaluated: false,
      awaitingOperand: true,
      tape: [...s.tape, `${formatDisplay(current)} ${op}`],
    };
  }
  // If awaitingOperand (back-to-back operators with no digit between),
  // just swap the queued operator without evaluating.
  if (s.awaitingOperand) {
    return { ...s, op, awaitingOperand: true };
  }
  // Pending exists → evaluate it, then queue the new op.
  const result = applyOp(s.pending, current, s.op);
  return {
    ...s,
    display: formatDisplay(result),
    pending: result,
    op,
    justEvaluated: false,
    awaitingOperand: true,
    tape: [...s.tape, `${formatDisplay(current)} = ${formatDisplay(result)}`, `${formatDisplay(result)} ${op}`],
  };
}

/** Press `=`. Evaluates the pending op against the current display
 *  and locks `justEvaluated` so the next digit starts fresh. */
export function inputEquals(s: GenericCalcState): GenericCalcState {
  if (s.pending === null || s.op === null) return { ...s, justEvaluated: true, awaitingOperand: false };
  const current = parseDisplay(s.display);
  const result = applyOp(s.pending, current, s.op);
  const display = formatDisplay(result);
  return {
    ...s,
    display,
    pending: null,
    op: null,
    justEvaluated: true,
    awaitingOperand: false,
    tape: [...s.tape, `${formatDisplay(s.pending)} ${s.op} ${formatDisplay(current)} = ${display}`],
  };
}

/** Press `C` — full reset. */
export function inputClear(_: GenericCalcState): GenericCalcState {
  return { ...INITIAL_GENERIC_STATE };
}

/** Press `CE` — clear the current entry (display only). */
export function inputClearEntry(s: GenericCalcState): GenericCalcState {
  return { ...s, display: '0', justEvaluated: false };
}

/** Press `±` — flip sign of the current display. */
export function inputSignFlip(s: GenericCalcState): GenericCalcState {
  if (s.display === '0') return s;
  if (s.display.startsWith('-')) return { ...s, display: s.display.slice(1) };
  return { ...s, display: '-' + s.display };
}

/** Press backspace — drop the rightmost display character (entry
 *  mid-typing only; no-op after `=`). */
export function inputBackspace(s: GenericCalcState): GenericCalcState {
  if (s.justEvaluated) return s;
  if (s.display.length <= 1 || (s.display.length === 2 && s.display.startsWith('-'))) {
    return { ...s, display: '0' };
  }
  return { ...s, display: s.display.slice(0, -1) };
}
