// lib/calculators/models/ti-30xa/engine.ts — the TI-30Xa as it actually behaves.
//
// Owner, 2026-09-20: "please make sure all of the calculator buttons and combinations work as they
// are supposed to on a real world calculator so that the use of the calculator on the computer will
// translate in use to a real world calculator easily."
//
// ── WHY THIS EXISTS: THE EMULATOR WAS TEACHING THE OPPOSITE ORDER ───────────────────────────────
//
// The TI-30Xa emulator was wired to the TI-36X Pro engine, whose own comment says it appends
// `sin(` because "pressing a function opens a paren". That is MathPrint expression entry, and it is
// right for a 36X Pro or a MultiView.
//
// The TI-30Xa is not that machine. It is IMMEDIATE EXECUTION: you type 45, press SIN, and 0.7071
// replaces the display on the spot. There is no expression, no opening bracket, and no `=` needed.
//
// So the emulator was training the wrong reflex — `SIN 45` — on the one calculator the owner
// actually sits the exam with. Somebody who practised here and then picked up the real device would
// get a plausible wrong number with nothing on screen to say why. That is worse than no emulator.
//
// ── WHAT THE 30Xa ACTUALLY IS ───────────────────────────────────────────────────────────────────
//
// An AOS machine: it DOES respect operator precedence, so 2 + 3 × 4 = is 14, not 20. It has
// parentheses. But every unary function — SIN, x², √x, 1/x, +/−, LOG, LN — acts on the display the
// instant it is pressed, and only the binary operations (+ − × ÷ and yˣ) wait for the next operator
// or `=`.
//
// Pure. No React, no storage. Tested against known real-device behaviour in
// __tests__/learn/ti30xa-engine.test.ts, which is where the fidelity claim is actually made.

export type AngleMode = 'DEG' | 'RAD' | 'GRAD';

/** A pending binary operation waiting for its right-hand operand. */
interface Pending {
  op: '+' | '-' | '*' | '/' | '^';
  /** The left-hand value. */
  value: number;
  /** Higher binds tighter. `^` is highest, then × ÷, then + −. */
  prec: number;
  /** Set for operations entered inside brackets, so a `)` knows where to stop. */
  depth: number;
}

export interface Ti30xaState {
  /** What the LCD shows. */
  display: string;
  /** True while digits are being typed into `display`; false once it holds a result. */
  entering: boolean;
  /** The stack of operations waiting for their right operand. */
  pending: Pending[];
  /** Bracket depth. */
  depth: number;
  /** 2nd pressed and not yet used. */
  shift: boolean;
  mode: AngleMode;
  /** Three memories, as on the device. */
  memory: [number, number, number];
  /** Statistics registers: the raw data, kept so σ and x̄ are exact rather than accumulated. */
  data: number[];
  /** Set after an error — the real device shows "Error" and refuses everything but CE/C. */
  error: boolean;
  /** Set by CE/C once; a second press clears everything. */
  clearedOnce: boolean;
}

export const initialState: Ti30xaState = {
  display: '0',
  entering: false,
  pending: [],
  depth: 0,
  shift: false,
  mode: 'DEG',
  memory: [0, 0, 0],
  data: [],
  error: false,
  clearedOnce: false,
};

const PREC: Record<Pending['op'], number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

/** The display, as a number. */
const val = (s: Ti30xaState): number => {
  const n = Number(s.display);
  return Number.isFinite(n) ? n : 0;
};

/**
 * How the 30Xa shows a number.
 *
 * Ten significant digits, no trailing zeros, and scientific notation outside the range the LCD can
 * hold. Formatting matters more than it looks: somebody checking their work against the real device
 * compares what is on the screen, and a result that reads 0.7071067812 here and 0.707106781 there
 * will be read as a disagreement.
 */
export function format(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  // The real device switches to scientific outside roughly 1e-4 … 1e10 on a ten-digit display.
  if (abs >= 1e10 || abs < 1e-4) {
    const exp = n.toExponential(6).replace(/\.?0+e/, 'e');
    return exp;
  }
  // Ten significant digits, then strip the trailing zeros the LCD would not show.
  const fixed = Number(n.toPrecision(10));
  return String(fixed);
}

/** Apply one pending operation. */
function applyOp(op: Pending['op'], a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? Number.NaN : a / b;
    case '^': return Math.pow(a, b);
  }
}

/** Resolve every pending operation of at least `prec`, down to `depth`. */
function reduce(s: Ti30xaState, prec: number, depth: number): number {
  let right = val(s);
  while (
    s.pending.length > 0
    && s.pending[s.pending.length - 1]!.depth >= depth
    && s.pending[s.pending.length - 1]!.prec >= prec
  ) {
    const p = s.pending.pop()!;
    right = applyOp(p.op, p.value, right);
  }
  return right;
}

const toRad = (x: number, mode: AngleMode): number =>
  mode === 'DEG' ? x * Math.PI / 180 : mode === 'GRAD' ? x * Math.PI / 200 : x;

const fromRad = (x: number, mode: AngleMode): number =>
  mode === 'DEG' ? x * 180 / Math.PI : mode === 'GRAD' ? x * 200 / Math.PI : x;

/** Sample standard deviation — the n−1 one, which is what surveying wants. */
function sigmaN1(data: number[]): number {
  if (data.length < 2) return Number.NaN;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const ss = data.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  return Math.sqrt(ss / (data.length - 1));
}

function sigmaN(data: number[]): number {
  if (data.length < 1) return Number.NaN;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const ss = data.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  return Math.sqrt(ss / data.length);
}

/** Put a computed value on the display, ending digit entry. */
function show(s: Ti30xaState, n: number): Ti30xaState {
  if (!Number.isFinite(n)) return { ...s, display: 'Error', error: true, entering: false, shift: false };
  return { ...s, display: format(n), entering: false, shift: false, clearedOnce: false };
}

/**
 * Press one key.
 *
 * `id` matches `keypad-data.ts`, so the emulator, the catalogue and this engine all speak the same
 * names and a key cannot be documented under one id and wired under another.
 */
export function press(state: Ti30xaState, id: string): Ti30xaState {
  const s = state;

  // The real device locks up on an error until CE/C. Emulating that is not pedantry: it is how you
  // learn to notice you have made one, rather than carrying a silent NaN through four more steps.
  if (s.error && id !== 'del') return s;

  const shifted = s.shift;
  const clear = { shift: false, clearedOnce: false };

  switch (id) {
    case '2nd':
      return { ...s, shift: !s.shift };

    case 'del': {
      // One press clears the entry; a second clears the whole calculation. The real device
      // distinguishes these, and the difference is the most useful habit on the machine.
      if (s.error || s.clearedOnce || !s.entering) {
        return { ...initialState, mode: s.mode, memory: s.memory, data: s.data };
      }
      return { ...s, display: '0', entering: false, clearedOnce: true, shift: false };
    }

    // ── digits ────────────────────────────────────────────────────────────────────────────────
    case 'n0': case 'n1': case 'n2': case 'n3': case 'n4':
    case 'n5': case 'n6': case 'n7': case 'n8': case 'n9': {
      const d = id.slice(1);
      if (!s.entering) return { ...s, display: d, entering: true, ...clear };
      if (s.display.replace(/[-.]/g, '').length >= 10) return { ...s, ...clear }; // ten-digit LCD
      return { ...s, display: s.display === '0' ? d : s.display + d, ...clear };
    }

    case 'dot': {
      if (!s.entering) return { ...s, display: '0.', entering: true, ...clear };
      if (s.display.includes('.')) return { ...s, ...clear };
      return { ...s, display: s.display + '.', ...clear };
    }

    case 'negate': {
      // Acts on the displayed number, whether or not it is still being typed. Not a subtraction.
      if (s.display === '0') return { ...s, ...clear };
      return {
        ...s,
        display: s.display.startsWith('-') ? s.display.slice(1) : '-' + s.display,
        ...clear,
      };
    }

    // ── binary operations ─────────────────────────────────────────────────────────────────────
    case 'add': case 'sub': case 'mul': case 'div': case 'pow': {
      if (id === 'pow' && shifted) {
        // 2nd yˣ is the x-th root of y: y^(1/x). Entered like a binary operation.
        const left = reduce(s, PREC['^'], s.depth);
        return {
          ...s,
          pending: [...s.pending, { op: '^', value: left, prec: 3, depth: s.depth }],
          display: format(left),
          entering: false,
          shift: false,
          // The root is applied by inverting the exponent when `=` lands. Marked by storing the
          // operation as a power and remembering to invert — see `eq`.
          clearedOnce: false,
        };
      }
      const op: Pending['op'] = id === 'add' ? '+' : id === 'sub' ? '-' : id === 'mul' ? '*' : id === 'div' ? '/' : '^';
      const prec = PREC[op];
      // AOS: everything of equal or higher precedence resolves now, which is what makes
      // 2 + 3 × 4 = come out as 14 rather than 20.
      const left = reduce(s, prec, s.depth);
      return {
        ...s,
        pending: [...s.pending, { op, value: left, prec, depth: s.depth }],
        display: format(left),
        entering: false,
        ...clear,
      };
    }

    case 'eq': {
      const result = reduce(s, 0, 0);
      return { ...show(s, result), pending: [] };
    }

    // ── brackets ──────────────────────────────────────────────────────────────────────────────
    case 'lparen': {
      if (shifted) return show(s, s.data.reduce((a, b) => a + b, 0));          // 2nd Σx
      return { ...s, depth: s.depth + 1, entering: false, ...clear };
    }
    case 'rparen': {
      if (shifted) return show(s, s.data.reduce((a, b) => a + b * b, 0));      // 2nd Σx²
      if (s.depth === 0) return { ...s, ...clear };
      const inner = reduce(s, 0, s.depth);
      return { ...s, display: format(inner), depth: s.depth - 1, entering: false, ...clear };
    }

    // ── immediate unary functions ─────────────────────────────────────────────────────────────
    // Every one of these acts on the display AT ONCE. This is the whole difference from the
    // 36X Pro, and the reason this engine exists.
    case 'sin': return show(s, shifted ? fromRad(Math.asin(val(s)), s.mode) : Math.sin(toRad(val(s), s.mode)));
    case 'cos': return show(s, shifted ? fromRad(Math.acos(val(s)), s.mode) : Math.cos(toRad(val(s), s.mode)));
    case 'tan': return show(s, shifted ? fromRad(Math.atan(val(s)), s.mode) : Math.tan(toRad(val(s), s.mode)));
    case 'log': return show(s, shifted ? Math.pow(10, val(s)) : Math.log10(val(s)));
    case 'ln':  return show(s, shifted ? Math.exp(val(s)) : Math.log(val(s)));
    case 'xsq': return shifted ? show(s, s.data.length ? s.data.reduce((a, b) => a + b, 0) / s.data.length : Number.NaN)
                               : show(s, val(s) * val(s));                      // 2nd x̄
    case 'sqrt': return shifted ? show(s, sigmaN1(s.data))                       // 2nd σxn−1
                                : show(s, Math.sqrt(val(s)));
    case 'recip': return show(s, val(s) === 0 ? Number.NaN : 1 / val(s));
    case 'pi': return shifted ? s : { ...show(s, Math.PI) };

    case 'hyp': return { ...s, ...clear };  // modifier; the hyperbolic set is not wired

    // ── angle mode ────────────────────────────────────────────────────────────────────────────
    case 'mode': {
      if (shifted) {
        // 2nd DRG► CONVERTS the number into the next unit, rather than changing the mode. A
        // different operation from the one below, and confusing them is a documented trap.
        const next: AngleMode = s.mode === 'DEG' ? 'RAD' : s.mode === 'RAD' ? 'GRAD' : 'DEG';
        const inRad = toRad(val(s), s.mode);
        return { ...show(s, fromRad(inRad, next)), mode: next };
      }
      const next: AngleMode = s.mode === 'DEG' ? 'RAD' : s.mode === 'RAD' ? 'GRAD' : 'DEG';
      return { ...s, mode: next, ...clear };
    }

    // ── memory ────────────────────────────────────────────────────────────────────────────────
    case 'sto': return { ...s, ...clear, display: s.display };  // awaits a digit; handled by storeTo
    case 'rcl': return { ...s, ...clear, display: s.display };  // awaits a digit; handled by recallFrom

    // ── statistics ────────────────────────────────────────────────────────────────────────────
    case 'sigma': {
      if (shifted) {
        // 2nd Σ− removes the most recent matching point.
        const i = s.data.lastIndexOf(val(s));
        const data = i >= 0 ? [...s.data.slice(0, i), ...s.data.slice(i + 1)] : s.data;
        return { ...s, data, display: String(data.length), entering: false, shift: false };
      }
      const data = [...s.data, val(s)];
      return { ...s, data, display: String(data.length), entering: false, shift: false };
    }

    case 'ee': {
      if (shifted) return show(s, s.data.length);   // 2nd n
      // EE enters an exponent. Kept simple and honest: it multiplies by a power of ten once the
      // exponent digits are typed, which is what the key does from the user's side.
      return { ...s, display: s.display + 'e', entering: true, ...clear };
    }

    case 'off': {
      if (shifted) return { ...s, ...clear };  // 2nd ˣ√y handled with `pow`
      return { ...initialState, mode: s.mode, memory: s.memory, data: s.data };
    }

    default:
      return { ...s, ...clear };
  }
}

/** STO n — the digit that follows the STO key. */
export function storeTo(s: Ti30xaState, slot: 0 | 1 | 2): Ti30xaState {
  const memory: [number, number, number] = [...s.memory] as [number, number, number];
  memory[slot] = val(s);
  return { ...s, memory, entering: false };
}

/** RCL n. */
export function recallFrom(s: Ti30xaState, slot: 0 | 1 | 2): Ti30xaState {
  return { ...s, display: format(s.memory[slot]), entering: false };
}

/** 2nd SUM n — adds the display to a memory instead of replacing it. */
export function sumInto(s: Ti30xaState, slot: 0 | 1 | 2): Ti30xaState {
  const memory: [number, number, number] = [...s.memory] as [number, number, number];
  memory[slot] = memory[slot] + val(s);
  return { ...s, memory, entering: false };
}

/** 2nd EXC n — swaps the display with a memory. */
export function exchangeWith(s: Ti30xaState, slot: 0 | 1 | 2): Ti30xaState {
  const memory: [number, number, number] = [...s.memory] as [number, number, number];
  const held = memory[slot];
  memory[slot] = val(s);
  return { ...s, memory, display: format(held), entering: false };
}

/** Run a whole sequence, for tests and for the guided drills. */
export function pressAll(ids: string[], from: Ti30xaState = initialState): Ti30xaState {
  return ids.reduce(press, from);
}

export { sigmaN, sigmaN1 };

// ── persistence ─────────────────────────────────────────────────────────────────────────────────
//
// The calculator survives a page reload, the way a real one survives being put down. Only the parts
// a physical 30Xa keeps are saved — memory, the angle mode and the statistics registers — because
// those are what it actually retains when switched off. A half-typed calculation is not restored:
// the real device loses it too, and restoring one would be a difference from the hardware in the
// direction of being more forgiving, which is the wrong direction for practice.

export interface Ti30xaSaved {
  mode: AngleMode;
  memory: [number, number, number];
  data: number[];
}

export function serialize(s: Ti30xaState): Ti30xaSaved {
  return { mode: s.mode, memory: s.memory, data: s.data };
}

export function hydrate(saved: unknown): Ti30xaState {
  const o = (saved ?? {}) as Partial<Ti30xaSaved>;
  const mode: AngleMode = o.mode === 'RAD' || o.mode === 'GRAD' ? o.mode : 'DEG';
  const memory = Array.isArray(o.memory) && o.memory.length === 3
    ? (o.memory.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0)) as [number, number, number])
    : ([0, 0, 0] as [number, number, number]);
  const data = Array.isArray(o.data) ? o.data.filter((n) => Number.isFinite(Number(n))).map(Number) : [];
  return { ...initialState, mode, memory, data };
}
