// A ratchet on ordering assertions that can fail by passing.
//
// ── WHY ─────────────────────────────────────────────────────────────────────────────────────────
//     expect(src.indexOf('a')).toBeLessThan(src.indexOf('b'));
//
// `indexOf` returns **-1** when the needle is absent, and -1 is less than every real index. So this
// **passes hardest at the exact moment the thing it guards stops existing** — delete `a` and the
// check goes green. A guard that cannot tell "correctly ordered" from "gone" defends nothing while
// looking like it defends something.
//
// Found three times on 2026-08-04, in unrelated places, each caught only by deleting the guarded
// call and watching the test stay green — never by reading the assertion:
//
//   1. a CAD wiring guard on `confirmAction(` before `addFeatures(`;
//   2. the `addLayer(` / `addFeatures(` ordering beside it;
//   3. `research-modes`' free-before-paid check, via `Math.max(...[])` / `Math.min(...[])` —
//      `-Infinity < Infinity` is true, so a plan with no paid steps satisfied a check whose whole
//      purpose was to stop paid sources running first. **That one guarded a spending rule.**
//
// A sweep then found 38 such assertions across the suite, 30 in the vulnerable direction.
//
// ── WHY A RATCHET AND NOT A BAN ─────────────────────────────────────────────────────────────────
// Rewriting every one in a single pass would be a large mechanical change across unrelated suites,
// which is its own risk — and most are probably fine today, because the strings they look for do
// currently exist. The danger is not the existing ones; it is that the shape keeps being written.
// So: the count may fall and may not rise. `expectOrder` / `expectAllBefore` in
// `__tests__/helpers/expect-order.ts` are the replacement, and they assert presence before order.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { code } from './helpers/source';

/** Ordering assertions written the unsafe way — MEASURED 2026-08-04, after converting the five in
 *  the CAD suites authored that day (38 found, 5 converted, 33 remain). The first value written here
 *  was a guess of 25 and the ratchet immediately rejected it, which is the behaviour wanted: a
 *  baseline nobody measured is a baseline that hides drift. It may go DOWN. If it needs to go UP,
 *  the new assertion should use `expectOrder` instead. */
const BASELINE = 33;

const ROOTS = ['__tests__', 'worker/src/__tests__'];

/** `expect(<anything>.indexOf(…)).toBeLessThan(` / `.toBeGreaterThan(` — the shape where an absent
 *  needle silently satisfies the comparison. */
const UNSAFE = /expect\([^)]*\.indexOf\([^)]*\)\)\s*\.\s*toBe(?:Less|Greater)Than\(/g;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function findUnsafe(): Array<{ file: string; count: number }> {
  const hits: Array<{ file: string; count: number }> = [];
  for (const root of ROOTS) {
    for (const f of walk(path.join(process.cwd(), root))) {
      // ── COMMENTS STRIPPED BEFORE COUNTING (2026-08-25) ────────────────────────────────────────
      //
      // This ratchet counted its own explanation. A test file that QUOTES the unsafe shape in a
      // comment — to say why it is unsafe — was scored as containing one, and the count went 33 → 34
      // for a note about the hazard rather than an instance of it.
      //
      // The inline-hex scanner learned this exact lesson and wrote it down: *"a guard that fires on
      // prose about the thing it guards teaches people to stop writing the prose."* Same repository,
      // same failure, applied here late. `code()` is the shared stripper, which tracks string state
      // rather than pattern-matching, so a `//` inside a quoted example survives.
      const n = (code(fs.readFileSync(f, 'utf8')).match(UNSAFE) ?? []).length;
      if (n > 0) hits.push({ file: path.relative(process.cwd(), f).replace(/\\/g, '/'), count: n });
    }
  }
  return hits;
}

describe('THE RATCHET — ordering assertions that can pass when the thing is gone', () => {
  it('finds test files at all', () => {
    // Guards the guard: a walker returning [] would make the ratchet below pass forever.
    const all = ROOTS.flatMap((r) => walk(path.join(process.cwd(), r)));
    expect(all.length).toBeGreaterThan(200);
  });

  it('does not grow', () => {
    const hits = findUnsafe();
    const total = hits.reduce((s, h) => s + h.count, 0);
    // Named files in the failure, so the offending one is obvious rather than a bare number.
    expect(
      { total, files: hits },
      `Unsafe ordering assertions went ${total > BASELINE ? 'UP' : 'DOWN'} (${BASELINE} → ${total}). `
      + 'indexOf returns -1 when absent, and -1 is less than every real index, so this shape passes '
      + 'when the guarded string is deleted. Use expectOrder() from __tests__/helpers/expect-order.ts, '
      + 'which asserts presence before order. If the count went DOWN, lower BASELINE to match.',
    ).toMatchObject({ total: expect.any(Number) });
    expect(total).toBeLessThanOrEqual(BASELINE);
  });
});

describe('the helper it points people at', () => {
  it('catches a missing needle instead of passing', async () => {
    // The behaviour the whole ratchet exists to promote, asserted rather than described.
    const { expectOrder } = await import('./helpers/expect-order');
    expect(() => expectOrder('b comes first', 'a-not-present', 'b')).toThrow();
  });

  it('still passes when the order is genuinely correct', async () => {
    const { expectOrder } = await import('./helpers/expect-order');
    expect(() => expectOrder('alpha then beta', 'alpha', 'beta')).not.toThrow();
  });

  it('rejects the empty-group case in the numeric form', async () => {
    // Math.max(...[]) is -Infinity and Math.min(...[]) is Infinity, which compare as ordered no
    // matter what — the exact hole that let a spending rule go unguarded.
    const { expectAllBefore } = await import('./helpers/expect-order');
    expect(() => expectAllBefore([], [1, 2])).toThrow();
    expect(() => expectAllBefore([0, 1], [])).toThrow();
    expect(() => expectAllBefore([0, 1], [2, 3])).not.toThrow();
  });
});
