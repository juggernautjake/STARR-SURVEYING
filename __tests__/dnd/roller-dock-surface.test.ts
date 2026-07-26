// __tests__/dnd/roller-dock-surface.test.ts — the floating roller dock's SURFACE and its INK must come
// from the same source (final-QA walkthrough, slice 23).
//
// The arc this closes. Slice 18 measured the roller tab labels at 2.78:1 (dark) / 2.83:1 (light) — sub-AA.
// Slice 19 "fixed" them by swapping `--hx-muted` → `--hx-text`; slice 21 caught that this computed to
// 1.13–1.17:1 on the light skins and reverted it, concluding the bar "sits on the roller, which is dark on
// every skin" and that a correct fix needed a colour clamped against the roller's own surface.
//
// **That conclusion was half wrong, and it is why two attempts missed.** The dock's background is
// `rgba(var(--panel-rgb), .98) → rgba(var(--void-rgb), .98)`, and those triplets are NOT one thing:
//
//   - the bespoke PF2/IG shells get them from `shellVarsFromHx`, i.e. DERIVED FROM THE SKIN, so their dock
//     is light on a light skin and the panel-clamped ink on it is correct — no defect there, ever;
//   - the 5e engine gets them from `theme.css`, which pins them to a fixed dark purple for EVERY skin.
//
// So the real defect was a mismatch inside one scope: on the three light skins the 5e dock stayed near-black
// while every token inside it was clamped for a near-white panel. Not "the roller is dark everywhere" — the
// roller is dark in ONE scope, and that scope's ink assumed otherwise.
//
// The fix is therefore not a hand-picked colour (which is what the previous two attempts reached for, and
// why they had to be measured in a browser to be trusted). It makes the 5e dock panel-derived like the
// shells' already is, so the clamp's own precondition — "the ink is clamped against the colour actually
// behind it" — holds by construction. This file pins that precondition for every skin, and pins that the
// OLD fixed-dark surface fails it, so nobody re-pins the dock to a constant colour again.
import { describe, it, expect } from 'vitest';
import { skinHxVars, themeToHxVars, shellThemeVars } from '@/lib/dnd/skin-tokens';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';
import { parseColor, composite, contrastRatio, type RGBA } from '@/lib/dnd/theme-contrast';

type Vars = Record<string, string>;
const varsFor = (id: string) => skinHxVars(id) as unknown as Vars;

// `theme.css` — the fixed triplet the 5e sheet used for the dock on every skin. The "before".
const THEME_CSS_PANEL_RGB = '19, 10, 32';

const rgb = (triplet: string, alpha: number): RGBA => {
  const [r, g, b] = triplet.split(',').map((s) => Number(s.trim()));
  return { r, g, b, a: alpha };
};
const css = (c: RGBA) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

/** What is ACTUALLY behind a roller tab label: the dock's top gradient stop at 98% over the page, then the
 *  tab's own `rgba(255,255,255,0.03)` pill. Flattened in that order — the same stack the browser composites. */
function labelBackdrop(panelTriplet: string, pageHex: string): string {
  const page = parseColor(pageHex)!;
  const dock = composite(rgb(panelTriplet, 0.98), page);
  const pill = composite({ r: 255, g: 255, b: 255, a: 0.03 }, dock);
  return css(pill);
}

const SKINS = SHEET_STYLES.filter((s) => s.id !== 'default');

describe('every skin ships a dock surface derived from its own panel', () => {
  for (const skin of SKINS) {
    it(`${skin.id} emits --hx-panel-rgb / --hx-void-rgb`, () => {
      const v = varsFor(skin.id);
      expect(v['--hx-panel-rgb'], `${skin.id} must not leave the dock on the fixed triplet`).toBeTruthy();
      expect(v['--hx-void-rgb']).toBeTruthy();
      // Derived from the skin's OWN swatch, not a constant.
      expect(v['--hx-panel-rgb']).toBe(parseColor(skin.swatch.panel)
        ? [parseColor(skin.swatch.panel)!.r, parseColor(skin.swatch.panel)!.g, parseColor(skin.swatch.panel)!.b].join(', ')
        : '');
    });
  }

  it('the unskinned default emits nothing, so it keeps theme.css and stays pixel-identical', () => {
    expect(varsFor('default')['--hx-panel-rgb']).toBeUndefined();
    expect(Object.keys(skinHxVars('default'))).toEqual([]);
  });
});

describe('the tab labels clear AA on the dock, on every skin', () => {
  for (const skin of SKINS) {
    it(`${skin.id}: --hx-muted on the dock`, () => {
      const v = varsFor(skin.id);
      const bg = labelBackdrop(v['--hx-panel-rgb'], skin.swatch.bg);
      const r = contrastRatio(v['--hx-muted'], bg)!;
      expect(r, `${skin.id} muted=${v['--hx-muted']} on ${bg} → ${r?.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${skin.id}: --hx-text on the dock (body ink)`, () => {
      const v = varsFor(skin.id);
      const bg = labelBackdrop(v['--hx-panel-rgb'], skin.swatch.bg);
      expect(contrastRatio(v['--hx-text'], bg)!).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('the OLD fixed-dark surface is what failed — and only on the light skins', () => {
  // Pinned so the arithmetic that justified this change is visible, and so re-pinning the dock to a
  // constant colour fails here instead of shipping. This is the same guard shape slice 21 used: assert
  // that the wrong answer looks fine on the skin you happened to be testing.
  const LIGHT = ['streamer', 'donata', 'jack'];

  for (const id of LIGHT) {
    it(`${id} was sub-AA on the fixed dark dock`, () => {
      const v = varsFor(id);
      const skin = SHEET_STYLES.find((s) => s.id === id)!;
      const before = contrastRatio(v['--hx-muted'], labelBackdrop(THEME_CSS_PANEL_RGB, skin.swatch.bg))!;
      const after = contrastRatio(v['--hx-muted'], labelBackdrop(v['--hx-panel-rgb'], skin.swatch.bg))!;
      expect(before, `${id} before → ${before.toFixed(2)}:1`).toBeLessThan(4.5);
      expect(after).toBeGreaterThanOrEqual(4.5);
      expect(after).toBeGreaterThan(before);
    });
  }

  it('lazzuh (dark) passed either way — which is exactly why this hid for two slices', () => {
    const v = varsFor('lazzuh');
    const skin = SHEET_STYLES.find((s) => s.id === 'lazzuh')!;
    expect(contrastRatio(v['--hx-muted'], labelBackdrop(THEME_CSS_PANEL_RGB, skin.swatch.bg))!).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v['--hx-muted'], labelBackdrop(v['--hx-panel-rgb'], skin.swatch.bg))!).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the bespoke shells were already correct, and stay correct', () => {
  // `shellVarsFromHx` has always derived the shells' triplets from the skin — this asserts the 5e engine
  // now agrees with it rather than the other way round.
  for (const skin of SKINS) {
    it(`${skin.id}: the shell bridge derives the same panel triplet`, () => {
      const shell = shellThemeVars(skin.id) as unknown as Vars;
      expect(shell['--panel-rgb']).toBe(varsFor(skin.id)['--hx-panel-rgb']);
    });
  }
});

describe('a theme (not a skin) gets the same treatment', () => {
  it('themeToHxVars emits the triplets too, so a themed dock is panel-derived as well', () => {
    const v = themeToHxVars({
      id: 't', label: 'T',
      colors: { void: '#fdf4e3', panel: '#fffef9', ink: '#201a12', gold: '#b8730a', teal: '#c2185b' },
    } as Parameters<typeof themeToHxVars>[0]) as unknown as Vars;
    expect(v['--hx-panel-rgb']).toBeTruthy();
    const bg = labelBackdrop(v['--hx-panel-rgb'], '#fdf4e3');
    expect(contrastRatio(v['--hx-muted'], bg)!).toBeGreaterThanOrEqual(4.5);
  });
});
