// lib/calculators/models/ti-36x-pro/engine.ts
//
// TI-36X Pro algebraic-input engine.
// C-7 of EXAM_CALCULATORS.md.
//
// Pure state machine. The React layer calls `dispatch(state, action)`
// to fold key-press actions into a new state; everything else is just
// presentation. Tokenize → shunting-yard → RPN eval against the shared
// `lib/calculators/math.ts` primitives.

import * as M from '@/lib/calculators/math';

/** TI-36X Pro lettered variable slots (the same labels the device prints). */
export const MEM_SLOTS = ['x', 'y', 'z', 't', 'a', 'b', 'c'] as const;
export type MemSlot = typeof MEM_SLOTS[number];

export interface HistoryEntry {
  entry: string;
  result: string;
  /** Numeric value at the time — useful for recalling into a future expression. */
  value: number;
}

export interface Ti36xState {
  schema_version: 1;
  entry: string;
  result: string;
  shiftActive: boolean;
  angleMode: M.AngleMode;
  displayMode: M.DisplayMode;
  displayDigits: number; // for FIX/SCI/ENG
  lastAnswer: number;
  /** Lettered variable memory — one entry per slot in MEM_SLOTS. */
  memory: Record<MemSlot, number>;
  /** Recent (entry, result) pairs in chronological order. Newest last. */
  history: HistoryEntry[];
  /** When non-null, the next digit key 1-7 picks the slot to STO/RCL. */
  pendingMemOp: 'sto' | 'rcl' | null;
}

const HISTORY_CAP = 10;

export function initialState(): Ti36xState {
  return {
    schema_version: 1,
    entry: '',
    result: '0',
    shiftActive: false,
    angleMode: 'DEG',
    displayMode: 'NORM',
    displayDigits: 10,
    lastAnswer: 0,
    memory: { x: 0, y: 0, z: 0, t: 0, a: 0, b: 0, c: 0 },
    history: [],
    pendingMemOp: null,
  };
}

/** Hydrate a saved state — tolerates older shapes via schema_version. */
export function hydrate(blob: unknown): Ti36xState {
  const base = initialState();
  if (!blob || typeof blob !== 'object') return base;
  const b = blob as Partial<Ti36xState>;
  return {
    ...base,
    entry: typeof b.entry === 'string' ? b.entry : '',
    result: typeof b.result === 'string' ? b.result : '0',
    angleMode: (b.angleMode as M.AngleMode) || 'DEG',
    displayMode: (b.displayMode as M.DisplayMode) || 'NORM',
    displayDigits: typeof b.displayDigits === 'number' ? b.displayDigits : 10,
    lastAnswer: typeof b.lastAnswer === 'number' ? b.lastAnswer : 0,
    memory: hydrateMemory(b.memory),
    history: hydrateHistory(b.history),
  };
}

function hydrateMemory(maybe: unknown): Record<MemSlot, number> {
  const base: Record<MemSlot, number> = { x: 0, y: 0, z: 0, t: 0, a: 0, b: 0, c: 0 };
  if (!maybe || typeof maybe !== 'object') return base;
  for (const slot of MEM_SLOTS) {
    const v = (maybe as Record<string, unknown>)[slot];
    if (typeof v === 'number' && Number.isFinite(v)) base[slot] = v;
  }
  return base;
}

function hydrateHistory(maybe: unknown): HistoryEntry[] {
  if (!Array.isArray(maybe)) return [];
  return maybe
    .filter((h): h is HistoryEntry =>
      !!h && typeof h === 'object'
      && typeof (h as HistoryEntry).entry === 'string'
      && typeof (h as HistoryEntry).result === 'string'
      && typeof (h as HistoryEntry).value === 'number'
    )
    .slice(-HISTORY_CAP);
}

export type Action =
  | { type: 'press'; keyId: string }
  | { type: 'reset' };

/**
 * Maps a key id from keypad-data.ts to the text it appends, or the
 * special action it triggers. Shift-active behavior is checked first;
 * the `false` row is the primary key.
 */
/** When a memory op is pending, these digit keys pick the slot (1..7 → x/y/z/t/a/b/c). */
const DIGIT_TO_SLOT: Record<string, number> = {
  n1: 0, n2: 1, n3: 2, n4: 3, n5: 4, n6: 5, n7: 6,
};

const APPEND: Record<string, { primary: string; shift?: string }> = {
  n0: { primary: '0' }, n1: { primary: '1' }, n2: { primary: '2' },
  n3: { primary: '3' }, n4: { primary: '4' }, n5: { primary: '5' },
  n6: { primary: '6' }, n7: { primary: '7' }, n8: { primary: '8' }, n9: { primary: '9' },
  dot:    { primary: '.' },
  add:    { primary: '+' },
  sub:    { primary: '-' },
  mul:    { primary: '*' },
  div:    { primary: '/' },
  lparen: { primary: '(' },
  rparen: { primary: ')' },
  comma:  { primary: ',' },
  // Functions: appending `name(` matches TI's "press function → opens paren" behavior.
  sin:    { primary: 'sin(',  shift: 'asin(' },
  cos:    { primary: 'cos(',  shift: 'acos(' },
  tan:    { primary: 'tan(',  shift: 'atan(' },
  log:    { primary: 'log(',  shift: '10^(' },
  ln:     { primary: 'ln(',   shift: 'exp(' },
  pi:     { primary: 'π',     shift: 'e' },
  ans:    { primary: 'ans' },
  xsq:    { primary: '^2',    shift: 'sqrt(' },
  xcube:  { primary: '^3',    shift: 'cbrt(' },
  pow:    { primary: '^' },
  fact:   { primary: '!' },
  ee:     { primary: 'E' },
  recip:  { primary: '^-1' },
  absx:   { primary: 'abs(' },
  eepow:  { primary: 'e^(',   shift: '10^(' },
  negate: { primary: '-' },   // entry-time only; tokenizer detects unary
};

export function dispatch(state: Ti36xState, action: Action): Ti36xState {
  if (action.type === 'reset') return { ...initialState(), lastAnswer: state.lastAnswer, angleMode: state.angleMode, memory: state.memory };
  if (action.type !== 'press') return state;
  const id = action.keyId;

  // Memory op pending: catch the next digit and act on the slot.
  if (state.pendingMemOp) {
    const slotIdx = DIGIT_TO_SLOT[id];
    if (slotIdx !== undefined) {
      const slot = MEM_SLOTS[slotIdx];
      if (state.pendingMemOp === 'sto') {
        return {
          ...state,
          memory: { ...state.memory, [slot]: state.lastAnswer },
          pendingMemOp: null,
          shiftActive: false,
        };
      } else { // rcl
        return {
          ...state,
          entry: state.entry + String(state.memory[slot]),
          pendingMemOp: null,
          shiftActive: false,
        };
      }
    }
    // Any other key cancels the pending op.
    return { ...state, pendingMemOp: null };
  }

  // STO / RCL — sto is the `sto` key; rcl is the shifted `apps` key per the
  // TI-36X Pro layout.
  if (id === 'sto') return { ...state, pendingMemOp: 'sto', shiftActive: false };
  if (id === 'apps' && state.shiftActive) return { ...state, pendingMemOp: 'rcl', shiftActive: false };

  // Modifiers / specials
  if (id === '2nd') return { ...state, shiftActive: !state.shiftActive };
  if (id === 'clear') {
    return state.entry
      ? { ...state, entry: '', shiftActive: false }
      : { ...state, entry: '', result: '0', shiftActive: false };
  }
  if (id === 'del') return { ...state, entry: state.entry.slice(0, -1), shiftActive: false };
  if (id === 'mode') {
    const order: M.AngleMode[] = ['DEG', 'RAD', 'GRAD'];
    const next = order[(order.indexOf(state.angleMode) + 1) % order.length];
    return { ...state, angleMode: next, shiftActive: false };
  }
  if (id === 'eq' || id === 'enter') return evaluate(state);

  // Token append
  const mapping = APPEND[id];
  if (mapping) {
    const text = (state.shiftActive && mapping.shift) ? mapping.shift : mapping.primary;
    return { ...state, entry: state.entry + text, shiftActive: false };
  }

  // Anything else (nav arrows, sto, apps, math, frac, pct, comma in unrecognized
  // contexts) — fall through unchanged. Subsequent slices wire as needed.
  return state;
}

// ──────────────────────────────────────────────────────────────────────────
//  Evaluator: tokenize → shunting-yard → RPN eval
// ──────────────────────────────────────────────────────────────────────────

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '^' }
  | { type: 'unary'; op: '-' | '+' }
  | { type: 'func'; name: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'fact' };

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'log', 'ln', 'exp', 'sqrt', 'cbrt', 'abs',
]);
const PRECEDENCE: Record<string, number> = { '+': 2, '-': 2, '*': 3, '/': 3, '^': 4 };
const RIGHT_ASSOC = new Set(['^']);

function tokenize(input: string, ans: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  // Substitute the `ans` keyword + the constants π and e ahead of time.
  let s = input.replace(/ans/g, String(ans))
                .replace(/π/g, String(Math.PI))
                .replace(/(?<![A-Za-z])e(?![A-Za-z(])/g, String(Math.E));
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }

    // Numbers (incl. decimals and "E" scientific notation).
    if (/[0-9.]/.test(c)) {
      let j = i;
      let dot = c === '.';
      let hasE = false;
      while (j < s.length) {
        const d = s[j];
        if (/[0-9]/.test(d)) { j++; continue; }
        if (d === '.' && !dot && !hasE) { dot = true; j++; continue; }
        if ((d === 'E' || d === 'e') && j > i && !hasE) { hasE = true; j++; if (s[j] === '+' || s[j] === '-') j++; continue; }
        break;
      }
      const value = Number(s.slice(i, j));
      if (!Number.isFinite(value)) throw new Error('Syntax');
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }

    // Functions / multi-char identifiers
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z_]/.test(s[j])) j++;
      const word = s.slice(i, j).toLowerCase();
      if (!FUNCTIONS.has(word)) throw new Error('Unknown function');
      tokens.push({ type: 'func', name: word });
      i = j;
      continue;
    }

    // Operators / parens / special
    const last = tokens[tokens.length - 1];
    const isUnaryContext =
      !last ||
      last.type === 'op' ||
      last.type === 'unary' ||
      last.type === 'lparen' ||
      last.type === 'comma' ||
      last.type === 'func';

    if (c === '+' || c === '-') {
      if (isUnaryContext) tokens.push({ type: 'unary', op: c });
      else tokens.push({ type: 'op', op: c });
      i++; continue;
    }
    if (c === '*' || c === '/' || c === '^') {
      tokens.push({ type: 'op', op: c });
      i++; continue;
    }
    if (c === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    if (c === '!') { tokens.push({ type: 'fact' }); i++; continue; }

    throw new Error(`Syntax: unexpected '${c}'`);
  }
  return tokens;
}

function shuntingYard(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (t.type === 'num') { out.push(t); continue; }
    if (t.type === 'func') { ops.push(t); continue; }
    if (t.type === 'comma') {
      while (ops.length && ops[ops.length - 1].type !== 'lparen') out.push(ops.pop()!);
      continue;
    }
    if (t.type === 'op' || t.type === 'unary') {
      const myPrec = t.type === 'unary' ? 5 : PRECEDENCE[t.op];
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type === 'lparen') break;
        const topPrec =
          top.type === 'func' ? 6 :
          top.type === 'unary' ? 5 :
          top.type === 'op' ? PRECEDENCE[top.op] : 0;
        if (topPrec > myPrec || (topPrec === myPrec && t.type === 'op' && !RIGHT_ASSOC.has(t.op))) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(t);
      continue;
    }
    if (t.type === 'fact') { out.push(t); continue; }
    if (t.type === 'lparen') { ops.push(t); continue; }
    if (t.type === 'rparen') {
      while (ops.length && ops[ops.length - 1].type !== 'lparen') out.push(ops.pop()!);
      if (!ops.length) throw new Error('Mismatched parens');
      ops.pop(); // discard lparen
      if (ops.length && ops[ops.length - 1].type === 'func') out.push(ops.pop()!);
      continue;
    }
  }
  while (ops.length) {
    const t = ops.pop()!;
    if (t.type === 'lparen' || t.type === 'rparen') throw new Error('Mismatched parens');
    out.push(t);
  }
  return out;
}

function applyFunc(name: string, x: number, mode: M.AngleMode): number {
  switch (name) {
    case 'sin':  return M.sin(x, mode);
    case 'cos':  return M.cos(x, mode);
    case 'tan':  return M.tan(x, mode);
    case 'asin': return M.asin(x, mode);
    case 'acos': return M.acos(x, mode);
    case 'atan': return M.atan(x, mode);
    case 'sinh': return M.sinh(x);
    case 'cosh': return M.cosh(x);
    case 'tanh': return M.tanh(x);
    case 'asinh': return M.asinh(x);
    case 'acosh': return M.acosh(x);
    case 'atanh': return M.atanh(x);
    case 'log':  return M.log10(x);
    case 'ln':   return M.ln(x);
    case 'exp':  return M.exp(x);
    case 'sqrt': return M.sqrt(x);
    case 'cbrt': return M.cbrt(x);
    case 'abs':  return M.abs(x);
    default: throw new Error(`Unknown function ${name}`);
  }
}

export function evalRpn(rpn: Token[], mode: M.AngleMode): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === 'num') { stack.push(t.value); continue; }
    if (t.type === 'op') {
      const b = stack.pop(); const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('Syntax');
      switch (t.op) {
        case '+': stack.push(M.add(a, b)); break;
        case '-': stack.push(M.sub(a, b)); break;
        case '*': stack.push(M.mul(a, b)); break;
        case '/': stack.push(M.div(a, b)); break;
        case '^': stack.push(M.pow(a, b)); break;
      }
      continue;
    }
    if (t.type === 'unary') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Syntax');
      stack.push(t.op === '-' ? M.neg(a) : a);
      continue;
    }
    if (t.type === 'func') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Syntax');
      stack.push(applyFunc(t.name, a, mode));
      continue;
    }
    if (t.type === 'fact') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Syntax');
      stack.push(M.factorial(a));
      continue;
    }
  }
  if (stack.length !== 1) throw new Error('Syntax');
  return stack[0];
}

export function evaluate(state: Ti36xState): Ti36xState {
  if (!state.entry.trim()) return state;
  try {
    const tokens = tokenize(state.entry, state.lastAnswer);
    const rpn = shuntingYard(tokens);
    const value = evalRpn(rpn, state.angleMode);
    if (!Number.isFinite(value)) {
      return { ...state, result: 'Math ERROR', shiftActive: false };
    }
    const formatted = formatForDisplay(value, state);
    const nextHistory = [...state.history, { entry: state.entry, result: formatted, value }].slice(-HISTORY_CAP);
    // Clear entry on a successful eval so the next keypress starts a new
    // expression. The previous result remains available via `ans`.
    return { ...state, entry: '', result: formatted, lastAnswer: value, shiftActive: false, history: nextHistory };
  } catch {
    return { ...state, result: 'Syntax ERROR', shiftActive: false };
  }
}

function formatForDisplay(value: number, state: Ti36xState): string {
  if (!Number.isFinite(value)) return 'Math ERROR';
  switch (state.displayMode) {
    case 'FIX': return M.formatFix(value, state.displayDigits);
    case 'SCI': return M.formatSci(value, state.displayDigits);
    case 'ENG': return M.formatEng(value, state.displayDigits);
    default:    return M.formatNorm(value, state.displayDigits);
  }
}
