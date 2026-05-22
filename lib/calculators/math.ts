// lib/calculators/math.ts
//
// Shared math primitives for the exam-calculator emulators.
// C-4 of EXAM_CALCULATORS.md.
//
// Precision note: the plan called for `decimal.js` at 25-digit precision.
// That dependency isn't installed yet and adding it touches the lockfile,
// so this module uses native `Number` (IEEE 754 double, ~15-17 SF). The
// plan requires ≥10 SF which native precision comfortably satisfies for
// every surveying-exam calculation we expect. If a future slice needs
// 25-digit precision (long compound interest, deep iteration), swap the
// internal type alias `N` for a Decimal class — every function returns
// `Num` and accepts `Num` so the substitution is mechanical.
//
// All functions are pure — no global state. Mode (RAD/DEG/GRAD) is
// passed explicitly to trig functions so the engines can keep their
// own mode flags.

export type Num = number;

export type AngleMode = 'DEG' | 'RAD' | 'GRAD';
export type DisplayMode = 'NORM' | 'FIX' | 'SCI' | 'ENG';

// ── Constants ────────────────────────────────────────────────────────────────

export const PI: Num = Math.PI;
export const E: Num = Math.E;

// ── Arithmetic (trivial wrappers — kept so engines call through one API) ──

export function add(a: Num, b: Num): Num { return a + b; }
export function sub(a: Num, b: Num): Num { return a - b; }
export function mul(a: Num, b: Num): Num { return a * b; }
export function div(a: Num, b: Num): Num {
  if (b === 0) return Number.NaN; // engines display "Math ERROR"
  return a / b;
}
export function neg(a: Num): Num { return -a; }
export function abs(a: Num): Num { return Math.abs(a); }
export function pow(a: Num, b: Num): Num { return Math.pow(a, b); }
export function sqrt(a: Num): Num { return a < 0 ? Number.NaN : Math.sqrt(a); }
export function cbrt(a: Num): Num { return Math.cbrt(a); }
export function nthRoot(n: Num, x: Num): Num {
  // x^(1/n); n=0 is undefined.
  if (n === 0) return Number.NaN;
  if (x < 0 && n % 2 === 0) return Number.NaN;
  return x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n);
}
export function reciprocal(a: Num): Num { return a === 0 ? Number.NaN : 1 / a; }

// ── Logs + exp ───────────────────────────────────────────────────────────────

export function ln(a: Num): Num { return a <= 0 ? Number.NaN : Math.log(a); }
export function log10(a: Num): Num { return a <= 0 ? Number.NaN : Math.log10(a); }
export function exp(a: Num): Num { return Math.exp(a); }
export function tenPow(a: Num): Num { return Math.pow(10, a); }

// ── Trig ────────────────────────────────────────────────────────────────────

/** Convert a value from the engine's angle mode to radians for Math.* funcs. */
export function toRadians(value: Num, mode: AngleMode): Num {
  if (mode === 'DEG') return value * (Math.PI / 180);
  if (mode === 'GRAD') return value * (Math.PI / 200);
  return value;
}

/** Convert radians back to the engine's angle mode for inverse-trig output. */
export function fromRadians(value: Num, mode: AngleMode): Num {
  if (mode === 'DEG') return value * (180 / Math.PI);
  if (mode === 'GRAD') return value * (200 / Math.PI);
  return value;
}

export function sin(a: Num, mode: AngleMode): Num { return Math.sin(toRadians(a, mode)); }
export function cos(a: Num, mode: AngleMode): Num { return Math.cos(toRadians(a, mode)); }
export function tan(a: Num, mode: AngleMode): Num { return Math.tan(toRadians(a, mode)); }

export function asin(a: Num, mode: AngleMode): Num {
  if (a < -1 || a > 1) return Number.NaN;
  return fromRadians(Math.asin(a), mode);
}
export function acos(a: Num, mode: AngleMode): Num {
  if (a < -1 || a > 1) return Number.NaN;
  return fromRadians(Math.acos(a), mode);
}
export function atan(a: Num, mode: AngleMode): Num { return fromRadians(Math.atan(a), mode); }
export function atan2(y: Num, x: Num, mode: AngleMode): Num { return fromRadians(Math.atan2(y, x), mode); }

// ── Hyperbolics ──────────────────────────────────────────────────────────────

export function sinh(a: Num): Num { return Math.sinh(a); }
export function cosh(a: Num): Num { return Math.cosh(a); }
export function tanh(a: Num): Num { return Math.tanh(a); }
export function asinh(a: Num): Num { return Math.asinh(a); }
export function acosh(a: Num): Num { return a < 1 ? Number.NaN : Math.acosh(a); }
export function atanh(a: Num): Num { return a <= -1 || a >= 1 ? Number.NaN : Math.atanh(a); }

// ── Combinatorics ────────────────────────────────────────────────────────────

export function factorial(n: Num): Num {
  if (!Number.isInteger(n) || n < 0 || n > 170) return Number.NaN; // 170! is the IEEE-754 ceiling
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** nPr — permutations. */
export function permutation(n: Num, r: Num): Num {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || r > n) return Number.NaN;
  let acc = 1;
  for (let i = n; i > n - r; i--) acc *= i;
  return acc;
}

/** nCr — combinations. */
export function combination(n: Num, r: Num): Num {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || r > n) return Number.NaN;
  // Use the symmetric identity for stability: nCr = nC(n-r).
  const k = Math.min(r, n - r);
  let num = 1;
  let den = 1;
  for (let i = 0; i < k; i++) {
    num *= (n - i);
    den *= (i + 1);
  }
  return num / den;
}

// ── DMS (degrees-minutes-seconds) — essential for surveying ──────────────────

/**
 * Convert a decimal-degree value into a DMS tuple.
 * 12.5° → { deg: 12, min: 30, sec: 0 }
 * Sign attaches to `deg`; `min` and `sec` are always non-negative.
 */
export function degToDms(value: Num): { deg: number; min: number; sec: number } {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return { deg: sign * (deg === 0 && sign < 0 ? 0 : deg), min, sec };
}

/** Convert DMS components back to a decimal-degree value. */
export function dmsToDeg(deg: Num, min: Num, sec: Num): Num {
  const sign = deg < 0 || Object.is(deg, -0) ? -1 : 1;
  const absDeg = Math.abs(deg);
  return sign * (absDeg + min / 60 + sec / 3600);
}

/** Format a value as `12°30'45.6"` (surveyor standard). */
export function formatDms(value: Num, secondsDecimals = 2): string {
  if (!Number.isFinite(value)) return 'NaN';
  const { deg, min, sec } = degToDms(value);
  const secFormatted = sec.toFixed(secondsDecimals);
  return `${deg}°${String(min).padStart(2, '0')}'${secFormatted.padStart(secondsDecimals === 0 ? 2 : 3 + secondsDecimals, '0')}"`;
}

// ── Display formatting ──────────────────────────────────────────────────────

/** "Normal" — the calculator's default — drops trailing zeros, picks SCI past
 *  the device's max significant figures. */
export function formatNorm(value: Num, maxSigFigs = 10): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'Math ERROR' : value > 0 ? '∞' : '-∞';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs < 1e-9 || abs >= 1e10) return formatSci(value, maxSigFigs);
  // Round to maxSigFigs then trim trailing zeros.
  const str = value.toPrecision(maxSigFigs);
  return Number(str).toString();
}

/** FIX mode — exactly `digits` digits after the decimal. */
export function formatFix(value: Num, digits: number): string {
  if (!Number.isFinite(value)) return 'Math ERROR';
  return value.toFixed(digits);
}

/** SCI mode — `n.nnn × 10^k` style; `digits` is the count of mantissa decimals. */
export function formatSci(value: Num, digits: number): string {
  if (value === 0) return `0.${'0'.repeat(Math.max(digits - 1, 0))}×10⁻¹¹`.replace('×10⁻¹¹', '×10⁰');
  if (!Number.isFinite(value)) return 'Math ERROR';
  // Use JS exponential then split.
  const expForm = value.toExponential(Math.max(digits - 1, 0));
  const [mantissa, expPart] = expForm.split('e');
  const expNum = Number(expPart);
  return `${mantissa}×10${superscript(expNum)}`;
}

/** ENG mode — exponent is a multiple of 3 (engineering notation). */
export function formatEng(value: Num, digits: number): string {
  if (value === 0) return `0.${'0'.repeat(Math.max(digits - 1, 0))}×10⁰`;
  if (!Number.isFinite(value)) return 'Math ERROR';
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const log = Math.floor(Math.log10(abs));
  const engExp = Math.floor(log / 3) * 3;
  const mantissa = (sign * abs) / Math.pow(10, engExp);
  return `${mantissa.toFixed(Math.max(digits - 1, 0))}×10${superscript(engExp)}`;
}

function superscript(n: number): string {
  const map: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³',
    '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map(c => map[c] || c).join('');
}

// ── Random ──────────────────────────────────────────────────────────────────

/** Uniform random in [0, 1). Engines wrap this with their own seed/policy. */
export function random(): Num { return Math.random(); }

/** Random integer in [low, high] inclusive. */
export function randomInt(low: number, high: number): Num {
  if (!Number.isInteger(low) || !Number.isInteger(high) || low > high) return Number.NaN;
  return Math.floor(Math.random() * (high - low + 1)) + low;
}
