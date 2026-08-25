// __tests__/helpers/source.ts — one way to read source in a test, instead of thirty-two.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// A lot of tests in this repo assert things about SOURCE TEXT, because the alternative is a live
// database or a running browser. Every one of them has to ignore comments first, for a reason this
// codebase has now paid for repeatedly: a note explaining a rule reads exactly like the rule.
//
//   · the inline-hex scanner counted `#666` and `#ccc` out of a comment warning against raw hex,
//     and reported a two-colour regression for prose about why hard-coded colours are bad
//   · six separate assertions in PAGE_CONSOLIDATION broke because a comment ABOVE the code they
//     checked quoted the very string they asserted was gone
//
// 32 test files strip comments and there were SIX different implementations of it. That is the
// same "two copies of one rule" shape the plan keeps finding in the product, sitting in the tests
// that are supposed to catch it.
//
// ── AND THE ONE THEY ALL GOT WRONG ──────────────────────────────────────────────────────────────
//
// The common form was:
//
//     src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
//
// which eats the rest of any line containing `//` inside a STRING. `const u = 'https://x.com/y';`
// becomes `const u = 'https:` — so an assertion looking for `x.com` fails on source that plainly
// contains it. The dangerous direction is the other one: a `not.toMatch()` over stripped source can
// PASS because the stripper deleted the evidence, and a test that cannot fail looks exactly like a
// test that is passing.
//
// So this tracks string state rather than pattern-matching, which is the difference between a rule
// and an approximation.

/** Quote characters that begin a string in TS/JS. Template literals count; their `${}` interiors are
 *  treated as string text, which is fine here — a comment inside an interpolation is vanishingly
 *  rare and never load-bearing for an assertion. */
const QUOTES = new Set(["'", '"', '`']);

export interface StripOptions {
  /** Strip `//` line comments. Off for CSS, where `//` is not a comment at all. */
  line?: boolean;
}

/**
 * Source with its comments removed and everything else — strings included — left alone.
 *
 * Newlines are preserved so line numbers in a failure message still mean something.
 */
export function stripComments(src: string, { line = true }: StripOptions = {}): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (quote) {
      // Inside a string: copy verbatim, and let a backslash carry its escapee across untouched so
      // `'it\'s'` does not end the string early.
      if (c === '\\') { out += c + (next ?? ''); i += 2; continue; }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }

    if (QUOTES.has(c)) { quote = c; out += c; i += 1; continue; }

    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const body = src.slice(i, end === -1 ? src.length : end + 2);
      // Keep the newlines the comment spanned, so nothing above it shifts up a line.
      out += body.replace(/[^\n]/g, '');
      i = end === -1 ? src.length : end + 2;
      continue;
    }

    if (line && c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

/** The common case, named the way the tests that need it already name it. */
export const code = (src: string) => stripComments(src);

/** CSS has no line comments — `//` there is part of a URL far more often than not. */
export const cssCode = (src: string) => stripComments(src, { line: false });

/**
 * Assert that one piece of source comes before another, and say so plainly when it does not.
 *
 * ── WHY THIS IS NOT JUST TWO indexOf CALLS ──────────────────────────────────────────────────────
 *
 * The idiom across this repo is:
 *
 *     expect(src.indexOf('X')).toBeGreaterThan(src.indexOf('Y'))
 *
 * which has a failure mode in the dangerous direction. When `Y` is absent `indexOf` returns -1, the
 * assertion becomes `toBeGreaterThan(-1)`, and it **passes for any X that exists at all** — order
 * unchecked. A test that cannot fail is indistinguishable from a test that is passing.
 *
 * Measured across the suite: 24 such assertions, 0 currently dead. So this prevents a class rather
 * than repairing a hole — worth doing while the count is zero, for the same reason the deductibility
 * guard was written while there was still one definition.
 *
 * The other half is legibility. Seven assertions in the page-consolidation plan failed because an
 * anchor moved while the rule it guarded did not, and each reported something like *"expected -1 to
 * be greater than 45"* — which says nothing about which anchor went missing. Naming the absent one
 * turns a five-minute puzzle into a one-line fix.
 */
export function expectOrder(src: string, first: string, second: string): void {
  const a = src.indexOf(first);
  const b = src.indexOf(second);
  if (a === -1) throw new Error(`expectOrder: anchor not found in source: ${JSON.stringify(first)}`);
  if (b === -1) throw new Error(`expectOrder: anchor not found in source: ${JSON.stringify(second)}`);
  if (a >= b) {
    throw new Error(
      `expectOrder: expected ${JSON.stringify(first)} (at ${a}) to come before ${JSON.stringify(second)} (at ${b})`,
    );
  }
}
