// __tests__/dnd/clamped-token-surface.test.ts — every text-bearing token is clamped against the surface
// text is actually read on.
//
// THE SAME BUG, THREE TIMES. `skin-tokens.ts` contrast-clamps each token that paints text, which is the
// right idea and is why light skins are legible at all. But three of them clamped against `panel` while
// content sits on the framed panel's gradient TOP — `panel2`, the worse backdrop in both directions:
//
//     gold2   fixed slice 47   streamer 3.70 → 4.77   (also aimed at 4, not 4.5)
//     teal1   fixed slice 59   streamer 3.69 → 4.52   (also aimed at 4/3, not 4.5)
//     muted   fixed slice 60   streamer 4.21 → 4.74   (threshold was right; only the surface was wrong)
//
// Each was found separately, and the third only because the second's write-up said to check the siblings.
// So this asserts the RULE across every such token at once, rather than adding a fourth per-token file:
// a new clamped token, or a regression in an existing one, fails here.
//
// `--hx-text` is the deliberate exception, asserted as such below.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skinHxVars } from '@/lib/dnd/skin-tokens';
import { contrastRatio, aaThresholdForSize, flattenStack, parseColor } from '@/lib/dnd/theme-contrast';

const SKINS = ['streamer', 'donata', 'jack', 'lazzuh'] as const;
/** The tokens that paint TEXT and are therefore clamped. */
const TEXT_TOKENS = ['--hx-muted', '--hx-gold-2', '--hx-teal-1'] as const;
const AA = aaThresholdForSize(13, false); // 4.5 — the size these paint at, and under 18.66px

const vars = (skin: string) => skinHxVars(skin) as Record<string, string>;

describe('every clamped text token clears AA on the WORSE panel stop', () => {
  for (const skin of SKINS) {
    for (const token of TEXT_TOKENS) {
      it(`${skin} ${token}`, () => {
        const v = vars(skin);
        // panel2 is the gradient top, and the worse backdrop in both directions: DARKER than panel on
        // light skins, LIGHTER on dark ones. Measuring against `panel` flattered every one of these by
        // roughly half a point, which is the whole difference between passing and failing.
        expect(contrastRatio(v[token], v['--hx-panel-2'])!).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('and on the easier stop too, so neither end of the gradient fails', () => {
    for (const skin of SKINS) {
      const v = vars(skin);
      for (const token of TEXT_TOKENS) {
        expect(contrastRatio(v[token], v['--hx-panel'])!).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('AND on the CHIP surface — the inset over the panel, which is where most of them actually sit', () => {
    // The fourth and final correction to this clamp's backdrop (slice 67). `panel2` was still not the
    // worst case: chips, tiles and rows paint `var(--hx-inset)` OVER the panel. Measured there BEFORE,
    // 8 of 9 token×skin combinations were under AA — gold 4.07–4.28, muted 4.14–4.26, teal 4.06–4.29 on
    // the light skins. The clamp now targets whichever surface the ink is least separated from, which
    // flips with the skin: the inset on light skins, `panel2` on dark ones.
    for (const skin of SKINS) {
      const v = vars(skin);
      const inset = v['--hx-inset'] ?? 'rgba(1, 10, 19, 0.4)'; // dark skins inherit the default recess
      const chip = flattenStack([parseColor(inset)!], parseColor(v['--hx-panel-2'])!);
      const rgb = `rgb(${Math.round(chip.r)}, ${Math.round(chip.g)}, ${Math.round(chip.b)})`;
      for (const token of TEXT_TOKENS) {
        expect(contrastRatio(v[token], rgb)!, `${skin} ${token} on chip`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('the dark skin is untouched by that choice, which is the point of making it per-skin', () => {
    // On a dark skin `--hx-inset` is a near-black recess that INCREASES separation, so clamping against
    // it would relax the clamp rather than tighten it. lazzuh's gold measured 9.04 on panel2 before this
    // change and must still.
    expect(contrastRatio(vars('lazzuh')['--hx-gold-2'], vars('lazzuh')['--hx-panel-2'])!).toBeCloseTo(9.04, 1);
  });
});

describe('--hx-text is the deliberate exception', () => {
  it('stays clamped against `panel`, because a ratio of 7 leaves it headroom either way', () => {
    // Moving it would change colours for no legibility gain — it measures 12.3–14.1 on panel2 already.
    for (const skin of SKINS) {
      const v = vars(skin);
      expect(contrastRatio(v['--hx-text'], v['--hx-panel-2'])!).toBeGreaterThan(7);
    }
  });
});

describe('the derivations say so, in both copies', () => {
  const SRC = readFileSync(join(process.cwd(), 'lib/dnd/skin-tokens.ts'), 'utf8');

  it('no text token is still clamped against a surface that is not the worst one', () => {
    // Every form this clamp has worn while being wrong. Listed literally so a regression names itself.
    expect(SRC).not.toContain('ensureContrast(accent, panel, light ? 4 : 3)');   // slice 59 fixed
    expect(SRC).not.toContain('ensureContrast(gold, panel, light ? 4 : 3)');     // slice 47 fixed
    expect(SRC).not.toContain('ensureContrast(accent, panel2, 4.5)');            // slice 67 superseded
    expect(SRC).not.toContain('ensureContrast(gold, panel2, 4.5)');              // slice 67 superseded
    expect(SRC).not.toMatch(/ensureContrast\(mix\(text, toRgb\(panel\), 0\.42\), panel2?, 4\.5\)/);
  });

  it('and each fix landed in BOTH derivations — the skin path and the theme path', () => {
    // This file derives the token set twice, and fixing one copy is how a defect survives its own fix.
    // That is not hypothetical: slice 67's first attempt converted only `skinHxVars`, and THIS assertion
    // is what caught it before it shipped.
    expect(SRC.split('const inkSurface').length - 1).toBe(2);
    expect(SRC.split('inkSurface, 4.5)').length - 1).toBe(6); // 3 tokens × 2 derivations
  });
});
