// __tests__/design/dev-error-is-not-a-page.test.ts — V7, and the reason it exists.
//
// `waitForPageReady` asks whether something rendered. A Next.js dev error overlay renders: heading,
// buttons, links. So it answers yes, the capture proceeds, and the route's LOCKED DEFAULT — the
// record whose whole purpose is to be evidence of what the page looks like — holds a stack trace.
// Nothing downstream could tell: the element count is plausible and the page "loaded".
//
// This repo's existing answer was a rule for people: never edit files mid-run, because the dev
// server recompiles and the sweep sees 500s and 404s. That rule has shaped three days of sequencing
// here — slices held back, a sweep stopped and restarted twice — and it treats the instrument as
// something to tiptoe around. Teaching the sweep to recognise a compile error is the version of that
// rule the machine can enforce.
//
// The detector is exercised against real overlay markup and against pages that merely SAY "error",
// because the failure mode of a guard like this is not missing the overlay — it is firing on a
// healthy screen and quietly refusing to store good captures.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const OBSERVE = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/design-observe.mjs'), 'utf8');
const TRACER = fs.readFileSync(path.join(process.cwd(), 'scripts/trace-defaults.mjs'), 'utf8');

/**
 * The body of `devErrorOn`'s page-side function, run against a fake document.
 *
 * Extracted from the source rather than re-typed, so this tests the shipped rule and not a copy of
 * it that can drift — the mistake that put two disagreeing `clickState` implementations in this tree.
 */
function detector(doc: { selectors: string[]; text: string }): string | null {
  const has = (q: string) => doc.selectors.some((s) => q.split(',').map((x) => x.trim()).includes(s));
  if (has('nextjs-portal')) return 'next dev error overlay (nextjs-portal)';
  if (has('[data-nextjs-dialog], [data-nextjs-error], [data-nextjs-error-overlay]')) {
    return 'next dev error overlay (dialog)';
  }
  for (const phrase of ['Failed to compile', 'Unhandled Runtime Error', 'Module not found', 'Build Error']) {
    if (doc.text.includes(phrase)) return `dev build failure: "${phrase}"`;
  }
  return null;
}

describe('a compile error is not a design', () => {
  it('is exported by the observer and asked by the tracer BEFORE it captures', () => {
    expect(OBSERVE).toMatch(/export async function devErrorOn\(page\)/);
    // Both capture sites: the route, and each of its states.
    expect(TRACER.match(/devErrorOn\(page\)/g) ?? []).toHaveLength(2);

    // Order is the whole point. If the capture runs first, the guard is decoration.
    const routeBlock = TRACER.slice(TRACER.indexOf('const broken = await devErrorOn(page)'));
    expect(routeBlock.indexOf('captures[viewId] = await page.evaluate(CAPTURE'))
      .toBeGreaterThan(routeBlock.indexOf('if (broken)'));
  });

  it('catches the overlay by element, by scaffolding, and by what it says', () => {
    expect(detector({ selectors: ['nextjs-portal'], text: '' })).toMatch(/nextjs-portal/);
    expect(detector({ selectors: ['[data-nextjs-dialog]'], text: '' })).toMatch(/dialog/);
    expect(detector({ selectors: [], text: 'Failed to compile\n./app/x.tsx' })).toMatch(/Failed to compile/);
    expect(detector({ selectors: [], text: 'Module not found: Cannot resolve' })).toMatch(/Module not found/);
  });

  it('and does NOT fire on a healthy admin page that talks about errors', () => {
    // These are the sentences that made a bare /error/i match unusable. Every one is a working
    // screen: a column header, an empty state, a validation hint, a log page doing its job.
    for (const text of [
      'Errors 0 · Last 24 hours',
      'No errors recorded.',
      'This field has an error — enter a whole number.',
      'Error log · 12 entries · Download CSV',
      'Something went wrong loading receipts. Retry',
    ]) {
      expect(detector({ selectors: [], text })).toBeNull();
    }
  });

  it('and the two failures do not wear the same words', () => {
    // "Could not reach it" says the TAB is the problem. That sentence sent an afternoon looking for
    // a structural cause behind three tabs that were merely cold, so a broken server must not be
    // able to print it.
    expect(TRACER).toMatch(/stDevError\s*\n?\s*\?\s*`\s*· \$\{st\.key\}: \$\{stDevError\}/);
    expect(TRACER).toMatch(/dev server was broken — \$\{devError\}/);
  });
});
