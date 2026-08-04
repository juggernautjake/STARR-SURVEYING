// __tests__/helpers/expect-order.ts
//
// Assert that one thing appears before another in a source file — without the trap.
//
// ── THE TRAP ────────────────────────────────────────────────────────────────────────────────────
// The obvious way to write an ordering check is:
//
//     expect(src.indexOf('a')).toBeLessThan(src.indexOf('b'));
//
// `indexOf` returns **-1** when the needle is absent, and -1 is less than every real index. So the
// assertion **passes hardest at the exact moment the thing it guards stops existing**: delete `a`
// entirely and the check goes green. A guard that cannot tell "correctly ordered" from "gone" is
// defending nothing, while looking like it defends something.
//
// This was found three times on 2026-08-04, in three unrelated places, each caught only by deleting
// the guarded call and watching the test stay green:
//
//   * a CAD wiring guard asserting `confirmAction(` came before `addFeatures(`;
//   * the same file's `addLayer(` / `addFeatures(` ordering;
//   * `research-modes`' free-before-paid check, via `Math.max(...[])` / `Math.min(...[])` —
//     `-Infinity < Infinity` is true, so a plan with no paid steps passed a check whose entire
//     purpose was to stop paid sources running first. That one guarded a SPENDING rule.
//
// A sweep afterwards found **38** ordering assertions across the suite, **30** of them written in
// the vulnerable direction.
//
// ── THE FIX ─────────────────────────────────────────────────────────────────────────────────────
// Assert presence first, then order, and say which part failed. One line at the call site, and the
// failure message names the missing needle instead of reporting a confusing numeric comparison.

import { expect } from 'vitest';

/**
 * Assert that `first` occurs before `second` in `haystack`, and that **both are present**.
 *
 * @param haystack the source text being checked
 * @param first    the string that must appear earlier
 * @param second   the string that must appear later
 * @param label    optional context for the failure message, e.g. the rule being defended
 */
export function expectOrder(haystack: string, first: string, second: string, label?: string): void {
  const prefix = label ? `${label}: ` : '';
  const a = haystack.indexOf(first);
  const b = haystack.indexOf(second);
  // Presence before ordering — this is the whole point of the helper.
  expect(a, `${prefix}expected to find ${JSON.stringify(first)}`).toBeGreaterThan(-1);
  expect(b, `${prefix}expected to find ${JSON.stringify(second)}`).toBeGreaterThan(-1);
  expect(a, `${prefix}expected ${JSON.stringify(first)} to appear before ${JSON.stringify(second)}`)
    .toBeLessThan(b);
}

/**
 * Assert that every value in `earlier` appears before every value in `later`, and that both lists
 * are non-empty.
 *
 * The numeric counterpart to `expectOrder`, for the `Math.max(...) < Math.min(...)` shape. Empty
 * lists are rejected explicitly because `Math.max(...[])` is `-Infinity` and `Math.min(...[])` is
 * `Infinity`, which compare as ordered no matter what.
 */
export function expectAllBefore(
  earlier: readonly number[],
  later: readonly number[],
  label?: string,
): void {
  const prefix = label ? `${label}: ` : '';
  expect(earlier.length, `${prefix}the earlier group must not be empty`).toBeGreaterThan(0);
  expect(later.length, `${prefix}the later group must not be empty`).toBeGreaterThan(0);
  expect(Math.max(...earlier), `${prefix}every earlier item must precede every later one`)
    .toBeLessThan(Math.min(...later));
}
