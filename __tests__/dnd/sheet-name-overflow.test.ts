// __tests__/dnd/sheet-name-overflow.test.ts — a long character name must not be clipped on a phone.
//
// Slice 80. The walkthrough's open item asks for "styling, formatting, readability … spacing, contrast,
// alignment, **overflow, mobile width**". Contrast was swept exhaustively across slices 18–72; overflow
// and mobile width never were, beyond one screen at 390px in slice 9. Sweeping them found this.
//
// `h1.name` is `font-size: clamp(44px, 8vw, 82px)`. At 360px the middle term is only 28.8px, so the
// **floor wins and the name stops shrinking at 44px**. A long name is then wider than the phone, and
// `.hero` carries `overflow-x: hidden`, so the excess is CLIPPED rather than scrolled — cut off with no
// gesture that reveals it. Measured on Perrin Underbough at 360px: `.hero` scrollWidth **365** against
// clientWidth **315**, so 50px of the name simply gone.
//
// WHY `anywhere` AND NOT `break-word`, which is the more familiar spelling: the two behave identically
// once a line is being laid out, but only `anywhere` also reduces the element's **min-content** size —
// and min-content was what propagated up and held the block at 350px inside a 285px container. This was
// not reasoned out, it was measured by applying each candidate alone in the browser:
//
//     baseline                      item 350px   50px clipped
//     min-width: 0 on the flex item item 350px   50px clipped   ← no effect at all
//     overflow-wrap: anywhere       item 285px    0px clipped   ← the whole fix
//     both                          item 285px    0px clipped
//
// The `min-width: 0` row matters: that was my diagnosis before measuring (the classic flexbox
// `min-width: auto` story), and it was wrong. Same lesson as slices 72/75/77/79 — the mechanism is worth
// checking separately from the outcome, because a fix that works can still be understood incorrectly.
//
// Desktop is unaffected: at 1280px the name renders at 82px across exactly two lines (height 148px =
// 2 × 73.8px line-height), i.e. `anywhere` engages only when a word genuinely does not fit.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'app/dnd/_sheet/styles/theme.css'), 'utf8');

/** The `.dnd-sheet h1.name` rule body. */
function nameRule(): string {
  const start = CSS.indexOf('.dnd-sheet h1.name {');
  expect(start, 'the h1.name rule must exist for this test to mean anything').toBeGreaterThan(-1);
  const end = CSS.indexOf('}', start);
  return CSS.slice(start, end);
}

describe('the character name survives a phone', () => {
  it('h1.name can break a word that does not fit', () => {
    expect(nameRule()).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('and specifically NOT break-word, which would not shrink min-content', () => {
    // If someone "tidies" this to the more common spelling the clipping returns silently, because
    // break-word leaves min-content at the unbroken word's width. Named so the swap fails here.
    expect(nameRule()).not.toMatch(/overflow-wrap:\s*break-word/);
  });

  it('the clamp still floors at 44px — the fix does not depend on changing the type scale', () => {
    // Recorded because the other obvious fix is lowering the floor, which changes the design on every
    // screen to solve a problem that only exists on narrow ones. This fix leaves the scale alone.
    expect(nameRule()).toMatch(/font-size:\s*clamp\(44px,\s*8vw,\s*82px\)/);
  });

  it('the hero still clips rather than scrolls, so the break is what prevents loss', () => {
    // The fix works *because* .hero keeps overflow-x: hidden — if that changed to auto the symptom
    // would become a stray horizontal scrollbar instead. Pinned so the pair stays understood together.
    const start = CSS.indexOf('.dnd-sheet .hero {');
    expect(start).toBeGreaterThan(-1);
    expect(CSS.slice(start, CSS.indexOf('}', start))).toMatch(/overflow-x:\s*hidden|overflow:\s*hidden/);
  });
});
