// __tests__/marketing/funnel-stage-labels.test.ts
//
// Owner, 2026-08-12, looking at the Advertising page on his phone: *"can we fix the weird formatting on
// mobile for the one picture with showing the funnel stages and stuff"*.
//
// ── THE DEFECT, AND WHY IT WAS NOT A MOBILE DEFECT ────────────────────────────────────────────────
//
// `.mk__stagebar` shared one CSS rule with `.mk__bar`:
//
//     .mk__stagebar, .mk__bar { display:flex; height:12px; overflow:hidden; … }
//
// `.mk__bar` is the attribution bar — a pure 12px pill with no text in it, for which that rule is
// exactly right. But `.mk__stagebar` CONTAINS its own label:
//
//     <div class="mk__stagebar"><span style="width:…%"/><strong>Inquiry</strong></div>
//
// so every stage name was clipped to a 12px-tall box **at every viewport**, not just on a phone.
// Measured: a 21px label inside a 12px clipping box. It reads as a font-rendering artifact because the
// text is *almost* legible and the eye repairs it, which is how it survived review — and it looks worst
// on a phone only because that is where the column is narrowest and the reader is closest.
//
// Two things are pinned here, both of which would silently return if the rules were merged again:
//   1. `.mk__stagebar` must NOT carry a fixed height, and must not be styled by the `.mk__bar` rule.
//   2. Its proportional fill must be absolutely positioned, so it cannot sit in the flex line and
//      compete with the label for width — the other half of the original bug.
//
// A CSS-text test rather than a rendered one on purpose: the rendered check needs a dev server and live
// marketing data, so it cannot run in this suite. This runs everywhere and fails on the exact edit that
// would reintroduce the bug.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(process.cwd(), 'app/admin/marketing/Marketing.css'), 'utf8');

/** Body of the first rule whose selector list matches `selector`, comments stripped. */
function rule(selector: string): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Match a selector list containing `selector` as a whole token, then capture the block.
  const re = new RegExp(`(^|\\})([^{}]*${selector.replace('.', '\\.')}[^{}]*)\\{([^}]*)\\}`, 'm');
  const m = stripped.match(re);
  return m ? m[3] : null;
}

/** Selector list of the first rule that mentions `selector`. */
function selectorList(selector: string): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp(`(^|\\})([^{}]*${selector.replace('.', '\\.')}[^{}]*)\\{`, 'm');
  const m = stripped.match(re);
  return m ? m[2].trim() : null;
}

describe('the funnel stage bar contains its own label, so it cannot be a 12px pill', () => {
  it('.mk__stagebar has its own rule — it is no longer styled by .mk__bar', () => {
    const list = selectorList('.mk__stagebar');
    expect(list, '.mk__stagebar has no rule at all').not.toBeNull();
    expect(
      list,
      '.mk__stagebar is sharing a rule with .mk__bar again — .mk__bar is a 12px pill with no text in '
      + 'it, and that height clips every stage label',
    ).not.toMatch(/\.mk__bar/);
  });

  it('does not pin a height that would clip the label', () => {
    const body = rule('.mk__stagebar')!;
    // `min-height` is fine — it grows with the text. A plain `height` is the bug.
    expect(body, 'a fixed height on .mk__stagebar clips the stage name').not.toMatch(/(^|;|\s)height\s*:/);
    expect(body, 'the bar should still have a floor so short labels line up').toMatch(/min-height\s*:/);
  });

  it('centres the label rather than letting it sit on the box edge', () => {
    expect(rule('.mk__stagebar')!).toMatch(/align-items\s*:\s*center/);
  });

  it('positions the fill absolutely so it cannot squeeze the label', () => {
    // A flex `<span>` with a percentage width next to the text competes with it for room; absolute
    // takes it out of the flow so the label always gets the full cell.
    const fill = rule('.mk__stagebar > span');
    expect(fill, 'no rule for the stage bar’s fill').not.toBeNull();
    expect(fill!).toMatch(/position\s*:\s*absolute/);
  });

  it('keeps overflow hidden — it is what rounds the fill, not what clips the text', () => {
    // Still wanted: the fill must be clipped to the rounded corners. Harmless now that the box height
    // is driven by the label instead of a literal 12px.
    expect(rule('.mk__stagebar')!).toMatch(/overflow\s*:\s*hidden/);
  });

  it('.mk__bar keeps its 12px pill, since nothing renders inside it', () => {
    const body = rule('.mk__bar');
    expect(body).not.toBeNull();
    expect(body!).toMatch(/height\s*:\s*12px/);
  });

  it('derives the fill colour from the theme instead of a second palette', () => {
    // A5 validated --theme-accent against every skin's surface with the dataviz validator; a literal
    // hex here would also add to the hardcoded-colour ratchet.
    const fill = rule('.mk__stagebar > span')!;
    expect(fill).toMatch(/var\(--theme-accent/);
    expect(fill, 'the label sits on top of this fill, so it must be a tint, not full-strength accent')
      .toMatch(/color-mix\(/);
  });
});

describe('the funnel’s stage column survives a sideways scroll', () => {
  it('pins the first column so the numbers can scroll without losing the stage name', () => {
    // The table is deliberately wider than a phone and scrolls inside .mk__scroll (M4's
    // reformat-vs-scroll rule). Without a pinned first column, scrolling to "From previous" leaves a
    // list of bare percentages with nothing saying which stage each belongs to.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).toMatch(/\[data-testid=['"]mk-funnel['"]\][^{]*td:first-child/);
    const body = rule("\\[data-testid='mk-funnel'\\] .mk__table th:first-child");
    expect(body, 'no sticky rule for the funnel’s first column').not.toBeNull();
    expect(body!).toMatch(/position\s*:\s*sticky/);
    // Opaque, or the scrolling numbers show through the pinned cell.
    expect(body!).toMatch(/background\s*:/);
  });

  it('scopes the pin to the funnel, not every table on the page', () => {
    // The other tables lead with a campaign name or a date, where pinning only eats width.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const generic = stripped.match(/(^|\})\s*\.mk__table\s+td:first-child\s*\{/m);
    expect(generic, 'the sticky column leaked onto every .mk__table').toBeNull();
  });
});
