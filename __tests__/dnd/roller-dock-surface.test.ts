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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CORRECTION, 2026-07-26, from measuring a real browser instead of modelling one.
//
// Everything below this line is still true, and it is NOT what makes the tab labels legible. The model these
// tests encode — dock surface from `--hx-panel-rgb`, ink from the skin's clamped `--hx-muted` — assumes both
// token families are applied wherever the dock lives. On a real 5e sheet they are not:
//
//   · the shell root carries `--panel-rgb: 255,250,254` and `--ink`/`--muted` (shellVarsFromHx, skin-derived)
//   · `--hx-panel` is still the DEFAULT `#0b1a2c` and `--hx-muted` the default `#a09b8c`
//   · `--hx-panel-rgb` — the token slice 23 added — is EMPTY there
//
// So the dock was light (from the shell family) while `RollerTemplateBar`'s inline styles reached for
// `--hx-muted`, a light warm grey meant for a dark panel: measured **2.59:1**, and the active teal tab
// **1.76:1**. Slice 23's claim that "the clamp's precondition now holds" was therefore wrong for that scope.
//
// The actual fix is the INK FAMILY: the bar now uses `--muted`/`--ink` (the family that paints the surface)
// with the `--hx-*` pair as the fallback for a scope where only that one exists. Measured after the change,
// per skin, in a browser: streamer 6.36, jack 7.69, donata 6.32, lazzuh 6.13, default 7.54 — worst 6.13,
// active tabs 10.8–13.2. See `docs/planning/qa-evidence/contrast-sweep.md`.
//
// These tests are kept rather than deleted because the hx-scope case is real (a surface should follow its
// skin, and where `skinHxVars` IS applied this arithmetic is what holds) — but they must not be read as
// evidence that the labels are legible. The last describe in this file is that evidence.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('IN THE HX SCOPE: the tab labels clear AA on a panel-derived dock', () => {
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

describe('THE RULE THAT ACTUALLY MAKES THE LABELS LEGIBLE: ink from the surface\'s own family', () => {
  // Browser-verified 2026-07-26 across all five skins (worst 6.13:1, was 2.59). The source assertion is what
  // keeps it: `.fld`'s gradient reads `--panel-rgb`, and `shellVarsFromHx` sets `--ink`/`--muted` from the
  // SAME skin in the SAME place — so taking the ink from that family is correct by construction, on a light
  // skin and a dark one alike, without anyone computing a ratio.
  const bar = read('app/dnd/_sheet/components/rollers/RollerTemplateBar.tsx');

  it('an inactive tab takes the shell muted, falling back to the sheet family', () => {
    expect(bar).toContain("'var(--muted, var(--hx-muted, #93a1b5))'");
  });

  it('an ACTIVE tab takes the ink, not the accent', () => {
    // Neither family's teal clears AA on a near-white dock (measured 1.76:1), so the active tab is ink text
    // and stays recognisable through its teal border and background tint.
    expect(bar).toContain("'var(--ink, var(--hx-text, #e8e6f0))'");
    expect(bar).not.toMatch(/color: on\s*\?\s*'var\(--hx-teal-1/);
  });

  it('the animation toggle on the same strip matches', () => {
    expect(bar).toContain("color: 'var(--muted, var(--hx-muted, #93a1b5))'");
  });

  it('the fallback ORDER is shell-then-sheet, never the other way round', () => {
    // `var(--hx-muted, var(--muted, …))` would reinstate the bug wherever the hx default exists, which is
    // everywhere — the default is what was being picked up.
    expect(bar).not.toContain('var(--hx-muted, var(--muted');
    expect(bar).not.toContain('var(--hx-text, var(--ink');
  });

  it('the stylesheet already used that family, which is why only the inline styles were wrong', () => {
    const css = read('app/dnd/_sheet/components/rollers/floatingRoller.css');
    expect(css).toContain('color: var(--ink, #e8e6f0)');
    expect(css).toContain('color: var(--muted, #9a97ad)');
    expect(css).not.toContain('var(--hx-muted');
  });
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
