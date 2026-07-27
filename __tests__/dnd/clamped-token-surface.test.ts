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
import { contrastRatio, aaThresholdForSize } from '@/lib/dnd/theme-contrast';

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

  it('no text token is still clamped against the bare panel', () => {
    // The exact forms that were wrong. Listed literally so the failure names what regressed.
    expect(SRC).not.toContain('ensureContrast(accent, panel, light ? 4 : 3)');
    expect(SRC).not.toContain('ensureContrast(gold, panel, light ? 4 : 3)');
    expect(SRC).not.toMatch(/ensureContrast\(mix\(text, toRgb\(panel\), 0\.42\), panel, 4\.5\)/);
  });

  it('and each fix landed in BOTH derivations — the skin path and the theme path', () => {
    // This file derives the token set twice. Fixing one copy is how a defect survives its own fix, which
    // is why every one of these three corrections had to be applied in duplicate.
    expect(SRC.split('ensureContrast(accent, panel2, 4.5)').length - 1).toBe(2);
    expect(SRC.split('ensureContrast(gold, panel2, 4.5)').length - 1).toBe(2);
    expect(SRC.split(', panel2, 4.5)').length - 1).toBeGreaterThanOrEqual(6);
  });
});
