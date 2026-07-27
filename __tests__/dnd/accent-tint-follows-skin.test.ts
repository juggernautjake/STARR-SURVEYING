// __tests__/dnd/accent-tint-follows-skin.test.ts — an accent TINT follows the skin's accent.
//
// THE DEFECT, measured in slice 61 rather than guessed. On the streamer skin (accent purple `#9b3fd0`) the
// PF2 rank badge composited to **`#d6e1e7` — a blue-grey — under purple text**, because `.pf2RankTrained`
// painted `background: rgba(10, 200, 185, 0.12)`: the DEFAULT Hextech cyan, hard-coded, while its `color`
// came from `var(--hx-teal-1)` and did follow the skin.
//
// A surface from one family with text from the other. That is exactly the roller-dock defect this codebase
// already fixed once — *"the dock was light from one family and its labels were coloured from the other"* —
// recurring in 23 places nobody had swept.
//
// THE FIX IS THE ESTABLISHED PATTERN: `skin-tokens.ts` already emits `--hx-panel-rgb` / `--hx-void-rgb`
// through `trip()` for precisely this reason ("surfaces painted `rgba(var(--…-rgb), α)`"). `--hx-teal-1-rgb`
// joins them.
//
// AND THE SWEEP IS SAFE IN A WAY SLICE 34'S WAS NOT, which is why it was done wholesale rather than one at a
// time: the default `--hx-teal-1` is `#0ac8b9` = exactly `10, 200, 185`, so on an unskinned sheet the
// substitution is a **no-op**. It can only change what was already wrong.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skinHxVars } from '@/lib/dnd/skin-tokens';
import { contrastRatio, flattenStack, parseColor } from '@/lib/dnd/theme-contrast';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CSS = read('app/dnd/_ui/hextech.module.css');
const PF2 = read('app/dnd/_ui/pf2/usePf2Panels.tsx');
const IG = read('app/dnd/_ui/ig/useIgPanels.tsx');

describe('the substitution is a no-op on the default skin', () => {
  it('the declared triplet equals the declared hex', () => {
    // #0ac8b9 → 10, 200, 185. If either moves without the other, every accent tint silently shifts on the
    // UNSKINNED sheet — the one case this change was supposed to leave untouched.
    expect(CSS).toContain('--hx-teal-1: #0ac8b9');
    expect(CSS).toContain('--hx-teal-1-rgb: 10, 200, 185');
  });
});

describe('the triplet follows the skin', () => {
  for (const skin of ['streamer', 'donata', 'jack', 'lazzuh'] as const) {
    it(`${skin} emits a triplet matching its own --hx-teal-1`, () => {
      const v = skinHxVars(skin) as Record<string, string>;
      const hex = v['--hx-teal-1'].replace('#', '');
      const expected = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
      expect(v['--hx-teal-1-rgb']).toBe(expected);
    });
  }

  it('and streamer’s is NOT the Hextech cyan — the case that produced the blue-grey badge', () => {
    const v = skinHxVars('streamer') as Record<string, string>;
    expect(v['--hx-teal-1-rgb']).not.toBe('10, 200, 185');
  });
});

describe('nothing paints the hard-coded cyan any more', () => {
  it('not in the shared hextech module', () => {
    expect(CSS).not.toMatch(/rgba\(10,\s*200,\s*185/);
  });

  it('nor in either bespoke sheet', () => {
    expect(PF2).not.toMatch(/rgba\(10,\s*200,\s*185/);
    expect(IG).not.toMatch(/rgba\(10,\s*200,\s*185/);
  });

  it('and the tints really were replaced, not deleted', () => {
    // 23 call sites moved. If a future edit strips them rather than converting them, the accent tint
    // disappears instead of following the skin — a different bug wearing this fix's clothes.
    expect(CSS.split('rgba(var(--hx-teal-1-rgb)').length - 1).toBeGreaterThanOrEqual(17);
  });

  it('the rank badge specifically — the element slice 61 measured', () => {
    // UPDATED in slice 64. This asserted the badge's TEXT was `var(--hx-teal-1)`, which was true when
    // slice 62 wrote it and is no longer: once the tint followed the skin, accent-on-accent lost its
    // separation and the glyph moved to the ink. What this test is really for is that the FILL comes from
    // the accent family, so that is what it now pins.
    const badge = CSS.slice(CSS.indexOf('.pf2RankTrained'), CSS.indexOf('.pf2RankUntrained'));
    expect(badge).toContain('rgba(var(--hx-teal-1-rgb)');
    expect(badge).not.toMatch(/rgba\(10,\s*200,\s*185/);
  });
});

describe('both derivations emit it', () => {
  it('the skin path and the theme path, since this file builds the set twice', () => {
    const SRC = read('lib/dnd/skin-tokens.ts');
    expect(SRC.split("'--hx-teal-1-rgb': trip(teal1)").length - 1).toBe(2);
    expect(SRC.split("'--hx-gold-2-rgb': trip(gold2)").length - 1).toBe(2);
  });
});

describe('GOLD tints had the identical defect, found by asking the same question', () => {
  // The sibling sweep. `--hx-gold-2` is skin-derived too, so a hard-coded `rgba(200,170,110,α)` fill was
  // Hextech gold sitting under a skin's own gold text — the same mismatch, four more places.
  it('the declared triplet equals the declared hex, so the default stays a no-op', () => {
    expect(CSS).toContain('--hx-gold-2: #c8aa6e');
    expect(CSS).toContain('--hx-gold-2-rgb: 200, 170, 110');
  });

  it('nothing paints the hard-coded gold any more', () => {
    for (const src of [CSS, PF2, IG]) expect(src).not.toMatch(/rgba\(200,\s*170,\s*110/);
  });

  it('and the triplet follows each skin', () => {
    for (const skin of ['streamer', 'donata', 'jack', 'lazzuh'] as const) {
      const v = skinHxVars(skin) as Record<string, string>;
      const hex = v['--hx-gold-2'].replace('#', '');
      expect(v['--hx-gold-2-rgb']).toBe([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', '));
    }
  });
});

describe('accent text on an accent TINT — the trade slice 62 exposed', () => {
  // Once the tint followed the skin, the fill became the accent's own hue, and accent-coloured TEXT on it
  // lost its separation. Measured on every skin, not just the one that was rendered:
  //
  //     accent on tint   streamer 3.76 · donata 4.28 · jack 4.09 · lazzuh 4.00   — ALL failing
  //     ink on tint      streamer 10.26 · donata 11.59 · jack 11.53 · lazzuh 11.69
  //
  // So this was never a streamer-only problem; the cyan-under-purple mismatch had merely been hiding it
  // behind an accidental hue separation. The roller dock reached the same conclusion and recorded the
  // remedy: keep the accent as BORDER and TINT, move the glyph to the ink.
  const tintBg = (skin: string) => {
    const v = skinHxVars(skin) as Record<string, string>;
    const bg = flattenStack([parseColor(`rgba(${v['--hx-teal-1-rgb']}, 0.12)`)!], parseColor(v['--hx-panel-2'])!);
    return { v, rgb: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})` };
  };

  for (const skin of ['streamer', 'donata', 'jack', 'lazzuh'] as const) {
    it(`${skin}: the ink clears AA on the tint, comfortably`, () => {
      const { v, rgb } = tintBg(skin);
      expect(contrastRatio(v['--hx-text'], rgb)!).toBeGreaterThan(7);
    });

    it(`${skin}: and the accent would NOT have — which is why the glyph moved`, () => {
      const { v, rgb } = tintBg(skin);
      expect(contrastRatio(v['--hx-teal-1'], rgb)!).toBeLessThan(4.5);
    });
  }

  it('the badge keeps its identity: accent border and tint, ink glyph', () => {
    const badge = CSS.slice(CSS.indexOf('.pf2RankTrained'), CSS.indexOf('.pf2RankUntrained'));
    expect(badge).toContain('color: var(--hx-text)');
    expect(badge).toContain('border: 1px solid var(--hx-teal-2)');
    expect(badge).toContain('rgba(var(--hx-teal-1-rgb)');
  });
});

describe('DANGER tints are the deliberate exception', () => {
  it('stay hard-coded, because that token is not skin-derived', () => {
    // `skin-tokens.ts` says so outright: "--hx-danger is intentionally left to inherit the default red: it
    // reads on both dark and light panels, and skins don't ship a 'danger' swatch to derive one from."
    // So a `rgba(198,64,59,α)` fill is CORRECT, and converting it would invent a derivation that has no
    // source. Asserted so the next person doing this sweep does not "finish the job" wrongly.
    expect(read('lib/dnd/skin-tokens.ts')).toContain('--hx-danger is intentionally left to inherit');
    expect(IG).toMatch(/rgba\(198,\s*64,\s*59/);
  });
});
