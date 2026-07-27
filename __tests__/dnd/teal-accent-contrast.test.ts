// __tests__/dnd/teal-accent-contrast.test.ts — the accent token clears AA as TEXT, on every skin.
//
// The sibling of `bespoke-heading-contrast.test.ts`, and the same bug in the same shape. `skin-tokens.ts`
// says of this token: *"teal-1 is used both as an accent border AND as roll-result / interactive text, so
// clamp it for legibility too"* — the intent was right and the clamp did not aim where text is read:
//
//   · SURFACE — content sits on the framed panel's gradient TOP (`panel2`), the worse backdrop in both
//     directions, while the clamp measured against `panel`.
//   · THRESHOLD — 4 (light skins) and 3 (dark) are both short of AA's 4.5 for text under 18.66px.
//
// FOUND BY MEASUREMENT, not by reading. Slice 58's live sweep of a PF2 sheet put its 18px modifiers at
// **4.38** — just under, which is the signature of a clamp aiming at 4. Reading the derivation then showed
// the same two faults slice 47 had already fixed in `gold2`, still present in its sibling.
//
// The dark-skin half matters and is easy to miss: `lazzuh` measured **4.24** on panel2, so the dark skins
// were failing too. A fix checked only on light skins would have left that.
import { describe, it, expect } from 'vitest';
import { skinHxVars } from '@/lib/dnd/skin-tokens';
import { contrastRatio, aaThresholdForSize } from '@/lib/dnd/theme-contrast';

const SKINS = ['streamer', 'donata', 'jack', 'lazzuh'] as const;
const AA = aaThresholdForSize(15, false); // the smallest size this token paints; 4.5

const tok = (skin: string) => {
  const v = skinHxVars(skin) as Record<string, string>;
  return { teal1: v['--hx-teal-1'], panel: v['--hx-panel'], panel2: v['--hx-panel-2'] };
};

describe('the threshold is the strict one', () => {
  it('accent text under 18.66px needs 4.5, not 3', () => {
    expect(AA).toBe(4.5);
  });
});

describe('teal-1 clears AA on the surface it is actually read on', () => {
  for (const skin of SKINS) {
    it(`${skin}: on panel-2, the gradient top where content sits`, () => {
      const t = tok(skin);
      expect(contrastRatio(t.teal1, t.panel2)!).toBeGreaterThanOrEqual(AA);
    });

    it(`${skin}: and on panel, the easier stop`, () => {
      const t = tok(skin);
      expect(contrastRatio(t.teal1, t.panel)!).toBeGreaterThanOrEqual(AA);
    });
  }

  it('the DARK skin was failing too — a light-only fix would have missed it', () => {
    // lazzuh measured 4.24 before. Slice 21's lesson: checking one skin makes a wrong swap look right.
    const t = tok('lazzuh');
    expect(contrastRatio(t.teal1, t.panel2)!).toBeGreaterThan(4.5);
  });
});

describe('the hue survives — these are still each skin’s accent', () => {
  it('the clamp deepens or lifts, it does not replace', () => {
    // `ensureContrast` steps 4% and stops the moment the ratio is met, and picks its DIRECTION from the
    // background: it lightened lazzuh's pink on a dark panel and darkened the light skins'. A runaway to
    // black or white would still satisfy the ratio assertions above, so the channels are checked too.
    for (const skin of SKINS) {
      const hex = tok(skin).teal1.replace('#', '');
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      expect(max, `${skin} not black`).toBeGreaterThan(40);
      expect(min, `${skin} not white`).toBeLessThan(230);
      // A real hue, not a grey: some channel separation survives.
      expect(max - min, `${skin} keeps its hue`).toBeGreaterThan(30);
    }
  });

  it('donata was already passing and is untouched', () => {
    // 5.20 before and after — the clamp is a no-op where the accent already read.
    expect(contrastRatio(tok('donata').teal1, tok('donata').panel2)!).toBeCloseTo(5.2, 1);
  });
});

describe('both derivations were fixed, not just the one that was measured', () => {
  it('the skin path and the theme path use the same clamp', () => {
    // `skin-tokens.ts` derives this token twice — once for a skin, once for a colour theme layered over
    // it. Fixing one and not the other is how a defect survives a fix, which this file has seen before.
    const src = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'lib/dnd/skin-tokens.ts'), 'utf8');
    // UPDATED slice 67: the backdrop moved again, from `panel2` to `inkSurface` (the chip surface on light
    // skins). This asserted the literal `panel2` form and so failed the moment the clamp got MORE correct
    // — the same "pins the implementation, not the rule" trap that slice 64 had to fix in a sibling file.
    // What matters is that BOTH derivations clamp the accent against the shared worst-case surface.
    expect(src.split('ensureContrast(accent, inkSurface, 4.5)').length - 1).toBe(2);
    expect(src).not.toContain('ensureContrast(accent, panel, light ? 4 : 3)');
  });
});
