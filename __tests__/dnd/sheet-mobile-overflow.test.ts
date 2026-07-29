// __tests__/dnd/sheet-mobile-overflow.test.ts — the sheet must not scroll sideways on a phone (P11-5).
//
// Measured in a real browser at 390px: the PF2 sheet reported `scrollWidth` 521 against a 390 viewport —
// 131px of horizontal overflow, so reading a stat block meant dragging the page left and right.
//
// THE CAUSE WAS ONE MISSING TRACK DEFINITION, and it is the kind of thing that reads as correct. A grid
// with no declared columns gets one implicit `auto` column, and an `auto` track sizes to its content's
// min-content — NOT to its container. The widest unbreakable descendant set a 504px floor, the column
// became 504px inside a 375px panel, and every child inherited it. The jump-nav already had
// `flex-wrap: wrap` and still never wrapped, because from its point of view there was always room.
//
// These are source assertions because the fix IS the declaration; the behaviour was verified in the
// browser, and the numbers above are what it reported before and after (521 → 375, 12 offenders → 0).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the bespoke sheet shells cap their grid track', () => {
  // Both shells are one `display: grid` panel wrapping the whole sheet, and both had the same hole.
  for (const file of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
    it(`${file} declares minmax(0, 1fr)`, () => {
      const src = read(file);
      expect(src).toContain("gridTemplateColumns: 'minmax(0, 1fr)'");
    });

    it(`${file} still declares display: grid — the fix is the TRACK, not the layout`, () => {
      // Someone "simplifying" this to `display: block` would also stop the overflow and would break the
      // panel ordering the shells depend on. The pairing is the point.
      const src = read(file);
      expect(src).toMatch(/display: 'grid', gridTemplateColumns: 'minmax\(0, 1fr\)'/);
    });
  }
});

describe('a heading that carries a note wraps on a phone', () => {
  const css = read('app/dnd/_ui/hextech.module.css');

  it('`.pf2SectionTitle` is nowrap by default — that is deliberate on a desktop', () => {
    // The headings are the sheet's scan-anchors; one solid line is right when there is room for it.
    expect(css).toMatch(/\.pf2SectionTitle \{[^}]*white-space: nowrap/s);
  });

  it('and the phone breakpoint lets it wrap, which was the LAST overflow', () => {
    // "Conditions · folded into rolls (worst applies)" measured 478px inside a 358px column. With the grid
    // track capped, this was the only thing still pushing the page wide.
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(mobile).toMatch(/\.pf2SectionHead \{ flex-wrap: wrap; \}/);
    expect(mobile).toMatch(/\.pf2SectionTitle \{ white-space: normal; \}/);
  });
});
