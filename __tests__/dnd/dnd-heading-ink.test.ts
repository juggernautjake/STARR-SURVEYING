// __tests__/dnd/dnd-heading-ink.test.ts — a bare heading on a dark /dnd page (P11-10).
//
// `app/styles/globals.css` colours `h1…h6` with `var(--brand-dark)` for the main Starr Surveying site,
// where headings sit on white. That rule reaches every /dnd page too, so any heading written without a
// class rendered near-black on navy. Measured on the level walker: **1.17:1** — the same `#0f1419` that
// hid the sheet's buttons (bespokeButtons.css) and the shells' footer, in a fourth place.
//
// Source assertions because the fix IS the rule; the behaviour was verified in a browser, where the
// heading went from `rgb(15, 20, 25)` to `rgb(240, 230, 210)` and a deliberately CLASSED heading planted
// in the same root stayed dark — which is the scope working, not a blunt override.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');
const GLOBALS = readFileSync(join(process.cwd(), 'app/styles/globals.css'), 'utf8');

describe('bare headings inside /dnd take the sheet ink', () => {
  it('the rule exists and is scoped to unclassed headings', () => {
    expect(CSS).toMatch(/\.root :is\(h1, h2, h3, h4, h5, h6\):not\(\[class\]\) \{[^}]*color: inherit/s);
  });

  it('uses `inherit`, not a hardcoded cream', () => {
    // The page is skinnable. A fixed `#f0e6d2` would be right on the dark chrome and wrong the moment a
    // heading sits inside a light-skinned panel — which is exactly how the bugs this fixes were born.
    const rule = CSS.slice(CSS.indexOf('.root :is(h1, h2, h3, h4, h5, h6)'));
    expect(rule.slice(0, 120)).toContain('color: inherit');
    expect(rule.slice(0, 120)).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('does NOT touch a heading that carries a class', () => {
    // `:not([class])` is the whole scope. A heading with a class is one someone has already decided
    // about — a `.title`, a gradient-clipped masthead — and overriding those would be a new bug.
    expect(CSS).toContain(':not([class])');
  });

  it('the global rule this compensates for is still there — if it goes, so should this', () => {
    // Pins the premise. If someone scopes globals.css away from /dnd properly, this override becomes
    // dead weight, and a test that never mentions the cause leaves the next person guessing why it exists.
    expect(GLOBALS).toMatch(/h1, h2, h3, h4, h5, h6 \{[^}]*color: var\(--brand-dark\)/s);
  });
});
