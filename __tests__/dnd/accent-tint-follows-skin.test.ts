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
    const badge = CSS.slice(CSS.indexOf('.pf2RankTrained'), CSS.indexOf('.pf2RankUntrained'));
    expect(badge).toContain('var(--hx-teal-1)');            // its text
    expect(badge).toContain('rgba(var(--hx-teal-1-rgb)');   // and now its fill, from the same family
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
