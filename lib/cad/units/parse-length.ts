// lib/cad/units/parse-length.ts
//
// Phase 8 §11.5 — unit-aware linear-distance parser. Accepts
// every reasonable surveyor-input form for a length and
// returns the canonical value in US Survey Feet (the world
// coordinate unit). Pure: no DOM, no React, no store reads.
//
// Supported suffix forms (case-insensitive, optional whitespace):
//   feet:        ft, feet, foot, ′, '
//   inches:      in, inch, inches, ″, "
//   miles:       mi, mile, miles
//   meters:      m, meter, meters, metre, metres
//   centimeters: cm, centimeter, centimeters
//   millimeters: mm, millimeter, millimeters
//
// Compound forms:
//   5'6"        → 5.5 ft (architectural feet-and-inches)
//   5 ft 6 in   → 5.5 ft
//   5'-6"       → 5.5 ft (hyphen separator common in CAD)
//   1/2"        → 0.04167 ft (fraction → decimal first)
//   1 1/2 ft    → 1.5 ft (mixed number)
//
// Returns `null` for empty input, NaN, or an unrecognized suffix.

export type LinearUnit = 'FT' | 'IN' | 'MILE' | 'M' | 'CM' | 'MM';

export interface ParsedLength {
  /** Canonical value in US Survey Feet. */
  feet: number;
  /** The unit the surveyor typed (or `defaultUnit` if no suffix). */
  sourceUnit: LinearUnit;
  /** Numeric value in `sourceUnit` (pre-conversion). */
  sourceValue: number;
  /** True when the input contained an explicit unit suffix. */
  hadExplicitUnit: boolean;
}

const FT_TO_IN = 12;
const M_TO_FT = 1 / 0.3048; // 1 US survey foot = 0.3048 m exactly

const UNIT_TO_FT: Record<LinearUnit, number> = {
  FT:   1,
  IN:   1 / FT_TO_IN,
  MILE: 5280,
  M:    M_TO_FT,
  CM:   M_TO_FT / 100,
  MM:   M_TO_FT / 1000,
};

/** Map a suffix token (already lowercased + trimmed) to its canonical unit. */
function suffixToUnit(suffix: string): LinearUnit | null {
  switch (suffix) {
    case 'ft': case 'feet': case 'foot': case "'": case '′':
      return 'FT';
    case 'in': case 'inch': case 'inches': case '"': case '″': case "''":
      return 'IN';
    case 'mi': case 'mile': case 'miles':
      return 'MILE';
    case 'm': case 'meter': case 'meters': case 'metre': case 'metres':
      return 'M';
    case 'cm': case 'centimeter': case 'centimeters':
      return 'CM';
    case 'mm': case 'millimeter': case 'millimeters':
      return 'MM';
    default:
      return null;
  }
}

/** Parse a number that may be `12`, `1.5`, `1/2`, or `1 1/2`. Returns null on failure. */
function parseNumeric(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  // Mixed number: `1 1/2`
  const mixed = t.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const num   = parseInt(mixed[2], 10);
    const den   = parseInt(mixed[3], 10);
    if (den === 0) return null;
    const sign = whole < 0 ? -1 : 1;
    return whole + sign * (num / den);
  }
  // Pure fraction: `1/2`
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (den === 0) return null;
    return num / den;
  }
  // Plain decimal — be strict so we don't accept `12abc` partials.
  const dec = t.match(/^-?\d+(?:\.\d+)?$/);
  if (!dec) return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

/**
 * Try to split a single chunk like `5'`, `6"`, `5ft`, `0.5 ft`, `1 1/2 ft`
 * into a (numeric, suffix) pair. Returns null when nothing matches.
 *
 * Greedy from the right: walks the suffix backwards looking for the
 * longest known unit token, leaving the rest as the numeric portion.
 */
function splitChunk(chunk: string): { value: number; unit: LinearUnit | null } | null {
  const c = chunk.trim();
  if (!c) return null;

  // Special-case the prime / double-prime markers since they're
  // single chars without a leading space.
  // `'` and `′` → feet, `"` and `″` → inches, `''` → inches.
  for (const [marker, unit] of [
    ['′', 'FT'], ["'", 'FT'],
    ['″', 'IN'], ['"', 'IN'],
  ] as const) {
    if (c.endsWith(marker)) {
      const num = parseNumeric(c.slice(0, -marker.length));
      if (num != null) return { value: num, unit };
    }
  }
  if (c.endsWith("''")) {
    const num = parseNumeric(c.slice(0, -2));
    if (num != null) return { value: num, unit: 'IN' };
  }

  // Word-form suffix: try the last 1–11 chars (longest known is 'centimeters' = 11).
  for (let len = 11; len >= 1; len -= 1) {
    if (c.length <= len) continue;
    const tail = c.slice(c.length - len).toLowerCase();
    const unit = suffixToUnit(tail);
    if (!unit) continue;
    // Tail must be preceded by either whitespace or a digit/fraction.
    // Reject "5min" matching "in" — but accept "5in" and "5 in".
    const head = c.slice(0, c.length - len);
    const lastChar = head[head.length - 1];
    if (head.length === 0) continue;
    if (lastChar !== ' ' && !/[\d/]/.test(lastChar)) continue;
    const num = parseNumeric(head);
    if (num != null) return { value: num, unit };
  }

  // Numeric only — no suffix in this chunk.
  const num = parseNumeric(c);
  if (num != null) return { value: num, unit: null };
  return null;
}

export function parseLength(
  input: string,
  defaultUnit: LinearUnit = 'FT',
): ParsedLength | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // Compound architectural form: `5'-6"` — strip the `-` connector
  // before chunking so we treat it as `5' 6"`.
  const normalised = raw.replace(/'\s*-\s*/g, "' ");

  // Split on the prime markers so `5'6"` → ['5', "'", '6', '"', ''].
  // Cleaner approach: replace `'` and `"` with `'<space>` / `"<space>`
  // so the whitespace splitter handles the rest.
  const tokenised = normalised
    .replace(/(['′"″])/g, '$1 ')
    .trim()
    .replace(/\s+/g, ' ');

  // Walk left-to-right greedily, gathering a number-then-suffix pair
  // each iteration. A pair without a suffix counts as `defaultUnit`.
  // Mixed numbers like `1 1/2 ft` need special handling — we look
  // ahead one token to detect the `<int> <frac>/<int>` pattern.
  const tokens = tokenised.split(' ');
  let totalFeet = 0;
  let firstUnit: LinearUnit | null = null;
  let firstValue = 0;
  let hadExplicitUnit = false;
  let i = 0;

  while (i < tokens.length) {
    let chunk = tokens[i];
    // Detect mixed number: integer + fraction.
    if (/^-?\d+$/.test(chunk) && i + 1 < tokens.length && /^\d+\/\d+$/.test(tokens[i + 1])) {
      chunk = `${chunk} ${tokens[i + 1]}`;
      i += 1;
    }
    // Detect "<num> <suffix>" — chunk doesn't include the suffix.
    if (i + 1 < tokens.length) {
      const peek = tokens[i + 1].toLowerCase();
      // Strip any trailing punctuation from the peek (e.g. comma after a value).
      const cleanPeek = peek.replace(/[,;]$/, '');
      const peekUnit = suffixToUnit(cleanPeek);
      if (peekUnit && parseNumeric(chunk) != null) {
        chunk = `${chunk} ${cleanPeek === peek ? peek : cleanPeek}`;
        i += 1;
      }
    }
    const parsed = splitChunk(chunk);
    if (!parsed) return null;
    const unit = parsed.unit ?? defaultUnit;
    if (parsed.unit) hadExplicitUnit = true;
    if (firstUnit === null) {
      firstUnit = unit;
      firstValue = parsed.value;
    }
    totalFeet += parsed.value * UNIT_TO_FT[unit];
    i += 1;
  }

  if (firstUnit === null) return null;

  // For a single-chunk parse, sourceValue is the surveyor's typed
  // value; for compound parses, we surface the dominant first chunk
  // so a UI re-render can show the original feet portion of `5'6"`.
  return {
    feet: totalFeet,
    sourceUnit: firstUnit,
    sourceValue: firstValue,
    hadExplicitUnit,
  };
}

/** Convert canonical feet to any other linear unit. */
export function feetTo(value: number, unit: LinearUnit): number {
  return value / UNIT_TO_FT[unit];
}

/** Inverse: any-unit value → canonical feet. */
export function toFeet(value: number, unit: LinearUnit): number {
  return value * UNIT_TO_FT[unit];
}
