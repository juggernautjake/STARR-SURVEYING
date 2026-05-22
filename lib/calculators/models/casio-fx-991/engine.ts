// lib/calculators/models/casio-fx-991/engine.ts
//
// Casio fx-991ES PLUS algebraic engine. C-13 of EXAM_CALCULATORS.md.
//
// Shares ~95% of the TI-36X Pro engine's logic (same precedence, same
// math primitives) but has its own key-id → token mapping for the
// Casio keypad and an implicit-multiplication pass in the tokenizer
// (Casio's natural-display behavior — `2π`, `2sqrt(3)` evaluate as
// `2*π`, `2*sqrt(3)`).
//
// Mode keys (COMP / STAT / TABLE) are recognized but a non-COMP mode
// is a no-op for v1 — surveying exam questions only need COMP.

import * as M from '@/lib/calculators/math';

export const CASIO_MEM_SLOTS = ['A', 'B', 'C', 'D', 'X', 'Y', 'M'] as const;
export type CasioMemSlot = typeof CASIO_MEM_SLOTS[number];

export interface CasioHistoryEntry {
  entry: string;
  result: string;
  value: number;
}

export type CasioMode = 'COMP' | 'STAT' | 'TABLE';

export interface CasioFx991State {
  schema_version: 1;
  entry: string;
  result: string;
  shiftActive: boolean;
  alphaActive: boolean;
  angleMode: M.AngleMode;
  displayMode: M.DisplayMode;
  displayDigits: number;
  mode: CasioMode;
  lastAnswer: number;
  memory: Record<CasioMemSlot, number>;
  history: CasioHistoryEntry[];
}

const HISTORY_CAP = 10;

export function initialState(): CasioFx991State {
  return {
    schema_version: 1,
    entry: '',
    result: '0',
    shiftActive: false,
    alphaActive: false,
    angleMode: 'DEG',
    displayMode: 'NORM',
    displayDigits: 10,
    mode: 'COMP',
    lastAnswer: 0,
    memory: { A: 0, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 0 },
    history: [],
  };
}

export interface CasioFx991Serialized {
  schema_version: 1;
  entry: string;
  result: string;
  angleMode: M.AngleMode;
  displayMode: M.DisplayMode;
  displayDigits: number;
  mode: CasioMode;
  lastAnswer: number;
  memory: Record<CasioMemSlot, number>;
  history: CasioHistoryEntry[];
}

export function serialize(state: CasioFx991State): CasioFx991Serialized {
  return {
    schema_version: 1,
    entry: state.entry,
    result: state.result,
    angleMode: state.angleMode,
    displayMode: state.displayMode,
    displayDigits: state.displayDigits,
    mode: state.mode,
    lastAnswer: state.lastAnswer,
    memory: state.memory,
    history: state.history,
  };
}

export function hydrate(blob: unknown): CasioFx991State {
  const base = initialState();
  if (!blob || typeof blob !== 'object') return base;
  const b = blob as Partial<CasioFx991State>;
  return {
    ...base,
    entry: typeof b.entry === 'string' ? b.entry : '',
    result: typeof b.result === 'string' ? b.result : '0',
    angleMode: (b.angleMode as M.AngleMode) || 'DEG',
    displayMode: (b.displayMode as M.DisplayMode) || 'NORM',
    displayDigits: typeof b.displayDigits === 'number' ? b.displayDigits : 10,
    mode: (b.mode as CasioMode) || 'COMP',
    lastAnswer: typeof b.lastAnswer === 'number' ? b.lastAnswer : 0,
    memory: hydrateMemory(b.memory),
    history: hydrateHistory(b.history),
  };
}

function hydrateMemory(maybe: unknown): Record<CasioMemSlot, number> {
  const base: Record<CasioMemSlot, number> = { A: 0, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 0 };
  if (!maybe || typeof maybe !== 'object') return base;
  for (const slot of CASIO_MEM_SLOTS) {
    const v = (maybe as Record<string, unknown>)[slot];
    if (typeof v === 'number' && Number.isFinite(v)) base[slot] = v;
  }
  return base;
}

function hydrateHistory(maybe: unknown): CasioHistoryEntry[] {
  if (!Array.isArray(maybe)) return [];
  return maybe
    .filter((h): h is CasioHistoryEntry =>
      !!h && typeof h === 'object'
      && typeof (h as CasioHistoryEntry).entry === 'string'
      && typeof (h as CasioHistoryEntry).result === 'string'
      && typeof (h as CasioHistoryEntry).value === 'number'
    )
    .slice(-HISTORY_CAP);
}

export type Action =
  | { type: 'press'; keyId: string }
  | { type: 'reset' };

const APPEND: Record<string, { primary: string; shift?: string }> = {
  n0: { primary: '0' }, n1: { primary: '1' }, n2: { primary: '2' },
  n3: { primary: '3' }, n4: { primary: '4' }, n5: { primary: '5' },
  n6: { primary: '6' }, n7: { primary: '7' }, n8: { primary: '8' }, n9: { primary: '9' },
  dot:    { primary: '.' },
  add:    { primary: '+' },
  sub:    { primary: '-' },
  mul:    { primary: '*' },
  div:    { primary: '/' },
  lparen: { primary: '(',  shift: '%' },
  rparen: { primary: ')',  shift: ',' },
  comma:  { primary: ',' },
  sin:    { primary: 'sin(',  shift: 'asin(' },
  cos:    { primary: 'cos(',  shift: 'acos(' },
  tan:    { primary: 'tan(',  shift: 'atan(' },
  log:    { primary: 'log(',  shift: '10^(' },
  ln:     { primary: 'ln(',   shift: 'exp(' },
  sqrt:   { primary: 'sqrt(', shift: 'cbrt(' },
  pi:     { primary: 'π',     shift: 'e' },
  ans:    { primary: 'ans' },
  xsq:    { primary: '^2',    shift: '^-1' },
  pow:    { primary: '^',     shift: 'sqrt(' },
  fact:   { primary: '!' },
  ee:     { primary: 'E' },
  recip:  { primary: '^-1' },
  absx:   { primary: 'abs(' },
  neg:    { primary: '-' },
};

export function dispatch(state: CasioFx991State, action: Action): CasioFx991State {
  if (action.type === 'reset') return { ...initialState(), lastAnswer: state.lastAnswer, angleMode: state.angleMode, memory: state.memory };
  if (action.type !== 'press') return state;
  const id = action.keyId;

  // Modifiers
  if (id === 'shift') return { ...state, shiftActive: !state.shiftActive, alphaActive: false };
  if (id === 'alpha') return { ...state, alphaActive: !state.alphaActive, shiftActive: false };
  if (id === 'ac' || id === 'on') {
    return state.entry
      ? { ...state, entry: '', shiftActive: false, alphaActive: false }
      : { ...state, entry: '', result: '0', shiftActive: false, alphaActive: false };
  }
  if (id === 'del') return { ...state, entry: state.entry.slice(0, -1), shiftActive: false, alphaActive: false };
  if (id === 'mode') {
    // Cycle the angle mode via shifted MODE (SETUP). Mode-key itself in
    // the real device opens a menu — emulator cycles modes inline.
    const order: M.AngleMode[] = ['DEG', 'RAD', 'GRAD'];
    const next = order[(order.indexOf(state.angleMode) + 1) % order.length];
    return { ...state, angleMode: next, shiftActive: false, alphaActive: false };
  }
  if (id === 'eq') return evaluate(state);

  // → DMS (shifted dms key): format lastAnswer as surveyor DMS.
  if (id === 'dms' && state.shiftActive) {
    return { ...state, result: M.formatDms(state.lastAnswer, 2), shiftActive: false };
  }

  // Token append
  const mapping = APPEND[id];
  if (mapping) {
    const text = (state.shiftActive && mapping.shift) ? mapping.shift : mapping.primary;
    return { ...state, entry: state.entry + text, shiftActive: false, alphaActive: false };
  }

  return state;
}

// ── Evaluator ─────────────────────────────────────────────────────────────

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
const TWO_ARG_FUNCTIONS = new Set(['pol', 'rec', 'atan2', 'mod']);
const PRECEDENCE: Record<string, number> = { '+': 2, '-': 2, '*': 3, '/': 3, '^': 4 };
const RIGHT_ASSOC = new Set(['^']);

/** Pre-process the entry buffer:
 *   • frac{n}{d} → (n)/(d) so the evaluator treats it as division
 *   • × ÷ − → ASCII *, /, -
 *   • implicit multiplication: 2π → 2*π, 2sqrt → 2*sqrt, )( → )*(
 */
function normalize(input: string): string {
  let s = input
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  // Implicit-multiplication insertions.
  // 1. digit/closing-paren followed by letter or open-paren or π/e
  s = s.replace(/(\d|\))(?=[a-zA-Zπe(])/g, '$1*');
  // 2. closing-paren followed by digit
  s = s.replace(/\)(?=\d)/g, ')*');
  // 3. constant π/e followed by digit/letter/open-paren
  s = s.replace(/([πe])(?=[\dA-Za-z(])/g, '$1*');
  // 4. factorial postfix followed by digit/letter/open-paren — e.g. 3!4! → 3!*4!
  s = s.replace(/!(?=[\dA-Za-zπe(])/g, '!*');
  return s;
}

function tokenize(input: string, ans: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let s = normalize(input)
    .replace(/ans/g, String(ans))
    .replace(/π/g, String(Math.PI))
    .replace(/(?<![A-Za-z])e(?![A-Za-z(])/g, String(Math.E));

  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }

    if (/[0-9.]/.test(c)) {
      let j = i;
      let dot = c === '.';
      let hasE = false;
      while (j < s.length) {
        const d = s[j];
        if (/[0-9]/.test(d)) { j++; continue; }
        if (d === '.' && !dot && !hasE) { dot = true; j++; continue; }
        if ((d === 'E' || d === 'e') && j > i && !hasE) {
          hasE = true; j++;
          if (s[j] === '+' || s[j] === '-') j++;
          continue;
        }
        break;
      }
      const value = Number(s.slice(i, j));
      if (!Number.isFinite(value)) throw new Error('Syntax');
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      const word = s.slice(i, j).toLowerCase();
      if (!FUNCTIONS.has(word) && !TWO_ARG_FUNCTIONS.has(word)) throw new Error('Unknown function');
      tokens.push({ type: 'func', name: word });
      i = j;
      continue;
    }

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
    if (c === '*' || c === '/' || c === '^') { tokens.push({ type: 'op', op: c }); i++; continue; }
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
      ops.pop();
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

function applyFunc2(name: string, a: number, b: number, mode: M.AngleMode): number {
  switch (name) {
    case 'pol':   return Math.sqrt(a * a + b * b);
    case 'rec':   return a * Math.cos(M.toRadians(b, mode));
    case 'atan2': return M.atan2(a, b, mode);
    case 'mod':   return a - Math.floor(a / b) * b;
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
      if (TWO_ARG_FUNCTIONS.has(t.name)) {
        const b = stack.pop(); const a = stack.pop();
        if (a === undefined || b === undefined) throw new Error('Syntax');
        stack.push(applyFunc2(t.name, a, b, mode));
        continue;
      }
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

export function evaluate(state: CasioFx991State): CasioFx991State {
  if (!state.entry.trim()) return state;
  try {
    const tokens = tokenize(state.entry, state.lastAnswer);
    const rpn = shuntingYard(tokens);
    const value = evalRpn(rpn, state.angleMode);
    if (!Number.isFinite(value)) {
      return { ...state, result: 'Math ERROR', shiftActive: false, alphaActive: false };
    }
    const formatted = formatForDisplay(value, state);
    const nextHistory = [...state.history, { entry: state.entry, result: formatted, value }].slice(-HISTORY_CAP);
    return { ...state, entry: '', result: formatted, lastAnswer: value, shiftActive: false, alphaActive: false, history: nextHistory };
  } catch {
    return { ...state, result: 'Syntax ERROR', shiftActive: false, alphaActive: false };
  }
}

function formatForDisplay(value: number, state: CasioFx991State): string {
  if (!Number.isFinite(value)) return 'Math ERROR';
  switch (state.displayMode) {
    case 'FIX': return M.formatFix(value, state.displayDigits);
    case 'SCI': return M.formatSci(value, state.displayDigits);
    case 'ENG': return M.formatEng(value, state.displayDigits);
    default:    return M.formatNorm(value, state.displayDigits);
  }
}
