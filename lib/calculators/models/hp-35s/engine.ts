// lib/calculators/models/hp-35s/engine.ts
//
// HP 35s RPN stack machine. C-16 of EXAM_CALCULATORS.md.
//
// Classic 4-level RPN stack (T / Z / Y / X). X is the visible bottom
// register the user interacts with; new numbers push older values up.
// Operations follow the HP rules:
//   • Digit press while in entry mode appends to the entry buffer.
//   • Digit press after an op clears the entry buffer (stack lift enabled).
//   • ENTER pushes X up (T←Z, Z←Y, Y←X) and stops auto-lift on the next
//     digit so the typed number replaces X (rather than pushing again).
//   • Binary op: pop X and Y, push result as new X; T duplicates downward.
//   • Unary op: replace X.
//   • R↓: T→Z, Z→Y, Y→X, X→T (rotates stack down).
//   • R↑: inverse roll (T→X, X→Y, Y→Z, Z→T).
//   • x↔y: swap.
//   • LASTx: push previous X.
//
// Algebraic mode (HP 35s ALG=) is recognized in `state.entryMode` for
// future expansion; v1 routes everything through RPN.

import * as M from '@/lib/calculators/math';

export interface Hp35sStack {
  /** Top of the visible stack (least-recent). */
  t: number;
  z: number;
  y: number;
  /** Bottom — what the user sees. */
  x: number;
}

export type Hp35sEntryMode = 'RPN' | 'ALG';

export interface Hp35sHistoryEntry {
  op: string;            // e.g. "+", "sin", "ENTER 3"
  x: number;             // X after the op
}

export interface Hp35sState {
  schema_version: 1;
  /** Buffer the user is currently typing. Empty = no entry in progress. */
  entry: string;
  /** The 4-register stack. */
  stack: Hp35sStack;
  /** LASTx — the X register's value before the most-recent operation. */
  lastX: number;
  /** Whether the next digit press should lift the stack (true) or replace
   *  X (false). Cleared by ENTER, set by any op that produces a result. */
  liftEnabled: boolean;
  /** Display result string (formatted X). */
  result: string;
  shiftActive: 'f' | 'g' | null;
  angleMode: M.AngleMode;
  displayMode: M.DisplayMode;
  displayDigits: number;
  entryMode: Hp35sEntryMode;
  history: Hp35sHistoryEntry[];
  /** A26 lettered slots: HP 35s exposes A-Z plus i. We'll seed 26 + i. */
  memory: Record<string, number>;
}

const HISTORY_CAP = 12;

export function initialState(): Hp35sState {
  return {
    schema_version: 1,
    entry: '',
    stack: { t: 0, z: 0, y: 0, x: 0 },
    lastX: 0,
    liftEnabled: false,
    result: '0',
    shiftActive: null,
    angleMode: 'DEG',
    displayMode: 'NORM',
    displayDigits: 10,
    entryMode: 'RPN',
    history: [],
    memory: {},
  };
}

export interface Hp35sSerialized {
  schema_version: 1;
  stack: Hp35sStack;
  lastX: number;
  result: string;
  angleMode: M.AngleMode;
  displayMode: M.DisplayMode;
  displayDigits: number;
  entryMode: Hp35sEntryMode;
  history: Hp35sHistoryEntry[];
  memory: Record<string, number>;
}

export function serialize(state: Hp35sState): Hp35sSerialized {
  return {
    schema_version: 1,
    stack: state.stack,
    lastX: state.lastX,
    result: state.result,
    angleMode: state.angleMode,
    displayMode: state.displayMode,
    displayDigits: state.displayDigits,
    entryMode: state.entryMode,
    history: state.history,
    memory: state.memory,
  };
}

export function hydrate(blob: unknown): Hp35sState {
  const base = initialState();
  if (!blob || typeof blob !== 'object') return base;
  const b = blob as Partial<Hp35sState>;
  return {
    ...base,
    stack: hydrateStack(b.stack),
    lastX: typeof b.lastX === 'number' ? b.lastX : 0,
    result: typeof b.result === 'string' ? b.result : '0',
    angleMode: (b.angleMode as M.AngleMode) || 'DEG',
    displayMode: (b.displayMode as M.DisplayMode) || 'NORM',
    displayDigits: typeof b.displayDigits === 'number' ? b.displayDigits : 10,
    entryMode: (b.entryMode as Hp35sEntryMode) || 'RPN',
    history: Array.isArray(b.history) ? b.history.slice(-HISTORY_CAP) : [],
    memory: hydrateMemory(b.memory),
  };
}

function hydrateStack(maybe: unknown): Hp35sStack {
  if (!maybe || typeof maybe !== 'object') return { t: 0, z: 0, y: 0, x: 0 };
  const m = maybe as Partial<Hp35sStack>;
  return {
    t: typeof m.t === 'number' ? m.t : 0,
    z: typeof m.z === 'number' ? m.z : 0,
    y: typeof m.y === 'number' ? m.y : 0,
    x: typeof m.x === 'number' ? m.x : 0,
  };
}

function hydrateMemory(maybe: unknown): Record<string, number> {
  if (!maybe || typeof maybe !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(maybe as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatX(value: number, displayMode: M.DisplayMode, digits: number): string {
  if (!Number.isFinite(value)) return 'Math ERROR';
  switch (displayMode) {
    case 'FIX': return M.formatFix(value, digits);
    case 'SCI': return M.formatSci(value, digits);
    case 'ENG': return M.formatEng(value, digits);
    default:    return M.formatNorm(value, digits);
  }
}

/** Commit the entry buffer (if any) to X as the current value. Stack-lift
 *  semantics: if liftEnabled, push X up first. */
function commitEntry(state: Hp35sState): Hp35sState {
  if (!state.entry) return state;
  const value = Number(state.entry);
  if (!Number.isFinite(value)) return { ...state, entry: '', result: 'Math ERROR' };
  const stack = state.liftEnabled
    ? { t: state.stack.z, z: state.stack.y, y: state.stack.x, x: value }
    : { ...state.stack, x: value };
  return {
    ...state,
    stack,
    entry: '',
    liftEnabled: true,
    result: formatX(value, state.displayMode, state.displayDigits),
  };
}

function pushHistory(state: Hp35sState, op: string): Hp35sState {
  const entry: Hp35sHistoryEntry = { op, x: state.stack.x };
  return { ...state, history: [...state.history, entry].slice(-HISTORY_CAP) };
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export type Action =
  | { type: 'press'; keyId: string }
  | { type: 'reset' };

export function dispatch(state: Hp35sState, action: Action): Hp35sState {
  if (action.type === 'reset') return { ...initialState(), memory: state.memory, angleMode: state.angleMode };
  if (action.type !== 'press') return state;
  const id = action.keyId;
  const shift = state.shiftActive;

  // Modifiers
  if (id === 'fshift') return { ...state, shiftActive: shift === 'f' ? null : 'f' };
  if (id === 'gshift') return { ...state, shiftActive: shift === 'g' ? null : 'g' };

  // Digit entry
  const digit = DIGIT_KEY[id];
  if (digit !== undefined) return appendEntry(state, digit);
  if (id === 'dot') return appendEntry(state, '.');
  if (id === 'chs') return chs(state);

  // Stack / control
  if (id === 'enter') return enter(state);
  if (id === 'del') {
    if (state.entry) return { ...state, entry: state.entry.slice(0, -1), shiftActive: null };
    return { ...state, stack: { ...state.stack, x: 0 }, result: formatX(0, state.displayMode, state.displayDigits), shiftActive: null };
  }
  if (id === 'on') return { ...state, entry: '', shiftActive: null };
  if (id === 'xchgy') return swapXY(state);
  if (id === 'rdown') return shift === 'f' ? rollUp(state) : rollDown(state);
  if (id === 'lastx') return pushLastX(state);

  // Mode toggle (►RAD / ►DEG)
  if (id === 'rad') {
    const next: M.AngleMode = shift === 'f' ? 'DEG' : 'RAD';
    return { ...state, angleMode: next, shiftActive: null };
  }
  if (id === 'dms') {
    if (shift === 'g') {
      // ►HR (C-17): the inverse of ►H.MS. Parse the current display as a
      // DMS string and write the decimal-degree value back into X.
      const m = state.result.match(/^(-?\d+)°(\d+)'([\d.]+)"$/);
      if (m) {
        const value = M.dmsToDeg(Number(m[1]), Number(m[2]), Number(m[3]));
        return {
          ...state,
          stack: { ...state.stack, x: value },
          result: formatX(value, state.displayMode, state.displayDigits),
          shiftActive: null,
        };
      }
      // No DMS on display — leave state unchanged but clear shift.
      return { ...state, shiftActive: null };
    }
    // ►H.MS — convert X to DMS notation in the result. Stack X stays decimal
    // for chained calcs; just format the display.
    const committed = commitEntry(state);
    return { ...committed, result: M.formatDms(committed.stack.x, 2), shiftActive: null };
  }

  // Binary ops
  const bin = BINARY[id];
  if (bin) return binaryOp(state, bin, id);

  // Unary functions
  const unary = unaryFor(id, shift);
  if (unary) return unaryOp(state, unary.fn, unary.label);

  // Constants
  if (id === 'pi') return pushNumber(state, shift === 'f' ? Math.E : Math.PI, shift === 'f' ? 'e' : 'π');

  return state;
}

const DIGIT_KEY: Record<string, string> = {
  n0: '0', n1: '1', n2: '2', n3: '3', n4: '4',
  n5: '5', n6: '6', n7: '7', n8: '8', n9: '9',
};

function appendEntry(state: Hp35sState, ch: string): Hp35sState {
  // Stack-lift on the first digit after an op result.
  if (!state.entry && state.liftEnabled) {
    return {
      ...state,
      stack: { t: state.stack.z, z: state.stack.y, y: state.stack.x, x: 0 },
      entry: ch,
      liftEnabled: false,
      shiftActive: null,
    };
  }
  if (!state.entry && ch === '.') {
    return { ...state, entry: '0.', liftEnabled: false, shiftActive: null };
  }
  return {
    ...state,
    entry: state.entry + ch,
    liftEnabled: false,
    shiftActive: null,
  };
}

function chs(state: Hp35sState): Hp35sState {
  if (state.entry) {
    const next = state.entry.startsWith('-') ? state.entry.slice(1) : '-' + state.entry;
    return { ...state, entry: next, shiftActive: null };
  }
  const x = -state.stack.x;
  return {
    ...state,
    stack: { ...state.stack, x },
    result: formatX(x, state.displayMode, state.displayDigits),
    shiftActive: null,
  };
}

function enter(state: Hp35sState): Hp35sState {
  // First commit any pending entry buffer.
  const s = state.entry ? commitEntry(state) : state;
  // ENTER duplicates X up and clears liftEnabled so the next digit press
  // replaces X rather than pushing again.
  const stack = { t: s.stack.z, z: s.stack.y, y: s.stack.x, x: s.stack.x };
  return pushHistory({ ...s, stack, liftEnabled: false, shiftActive: null }, 'ENTER');
}

function swapXY(state: Hp35sState): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const stack = { ...s.stack, x: s.stack.y, y: s.stack.x };
  return pushHistory({
    ...s,
    stack,
    liftEnabled: true,
    result: formatX(stack.x, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, 'x↔y');
}

function rollDown(state: Hp35sState): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const stack = { t: s.stack.x, z: s.stack.t, y: s.stack.z, x: s.stack.y };
  return pushHistory({
    ...s,
    stack,
    liftEnabled: true,
    result: formatX(stack.x, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, 'R↓');
}

function rollUp(state: Hp35sState): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const stack = { t: s.stack.z, z: s.stack.y, y: s.stack.x, x: s.stack.t };
  return pushHistory({
    ...s,
    stack,
    liftEnabled: true,
    result: formatX(stack.x, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, 'R↑');
}

function pushLastX(state: Hp35sState): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const stack = { t: s.stack.z, z: s.stack.y, y: s.stack.x, x: s.lastX };
  return pushHistory({
    ...s,
    stack,
    liftEnabled: true,
    result: formatX(stack.x, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, 'LASTx');
}

function pushNumber(state: Hp35sState, value: number, label: string): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const stack = s.liftEnabled
    ? { t: s.stack.z, z: s.stack.y, y: s.stack.x, x: value }
    : { ...s.stack, x: value };
  return pushHistory({
    ...s,
    stack,
    liftEnabled: true,
    result: formatX(value, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, label);
}

const BINARY: Record<string, '+' | '-' | '*' | '/' | '^' | 'mod'> = {
  add: '+', sub: '-', mul: '*', div: '/', ypowx: '^', mod: 'mod',
};

function binaryOp(state: Hp35sState, op: '+' | '-' | '*' | '/' | '^' | 'mod', label: string): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const a = s.stack.y;
  const b = s.stack.x;
  let result: number;
  switch (op) {
    case '+': result = M.add(a, b); break;
    case '-': result = M.sub(a, b); break;
    case '*': result = M.mul(a, b); break;
    case '/': result = M.div(a, b); break;
    case '^': result = M.pow(a, b); break;
    case 'mod': result = a - Math.floor(a / b) * b; break;
  }
  // Pop Y; T duplicates downward into Z.
  const stack = { t: s.stack.t, z: s.stack.t, y: s.stack.z, x: result };
  return pushHistory({
    ...s,
    stack,
    lastX: b,
    liftEnabled: true,
    result: formatX(result, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, label);
}

interface UnaryDef { fn: (x: number, mode: M.AngleMode) => number; label: string; }

function unaryFor(id: string, shift: 'f' | 'g' | null): UnaryDef | null {
  // Map keys (with shift) to math functions. C-17 added the g-shift
  // (blue / right-shift) column for hyperbolic trig.
  const TABLE: Record<string, { primary?: UnaryDef; f?: UnaryDef; g?: UnaryDef }> = {
    sin:   { primary: { fn: M.sin, label: 'sin' },
             f:       { fn: M.asin, label: 'sin⁻¹' },
             g:       { fn: (x) => M.sinh(x), label: 'sinh' } },
    cos:   { primary: { fn: M.cos, label: 'cos' },
             f:       { fn: M.acos, label: 'cos⁻¹' },
             g:       { fn: (x) => M.cosh(x), label: 'cosh' } },
    tan:   { primary: { fn: M.tan, label: 'tan' },
             f:       { fn: M.atan, label: 'tan⁻¹' },
             g:       { fn: (x) => M.tanh(x), label: 'tanh' } },
    sqrt:  { primary: { fn: (x) => M.sqrt(x), label: '√x' },
             f:       { fn: (x) => x * x,    label: 'x²' },
             g:       { fn: (x) => M.cbrt(x), label: '³√x' } },
    log:   { primary: { fn: (x) => M.log10(x), label: 'log' },
             f:       { fn: (x) => M.tenPow(x), label: '10ˣ' } },
    ln:    { primary: { fn: (x) => M.ln(x),    label: 'ln' },
             f:       { fn: (x) => M.exp(x),   label: 'eˣ' } },
    recip: { primary: { fn: (x) => M.reciprocal(x), label: '1/x' } },
    fact:  { primary: { fn: (x) => M.factorial(x),  label: 'x!' } },
    absx:  { primary: { fn: (x) => M.abs(x),        label: '|x|' } },
  };
  const entry = TABLE[id];
  if (!entry) return null;
  if (shift === 'f' && entry.f) return entry.f;
  if (shift === 'g' && entry.g) return entry.g;
  return entry.primary || null;
}

function unaryOp(state: Hp35sState, fn: (x: number, mode: M.AngleMode) => number, label: string): Hp35sState {
  const s = state.entry ? commitEntry(state) : state;
  const result = fn(s.stack.x, s.angleMode);
  return pushHistory({
    ...s,
    stack: { ...s.stack, x: result },
    lastX: s.stack.x,
    liftEnabled: true,
    result: formatX(result, s.displayMode, s.displayDigits),
    shiftActive: null,
  }, label);
}
