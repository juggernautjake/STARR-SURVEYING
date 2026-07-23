// __tests__/dnd/skin-fonts-bridge.test.ts — skins/themes carry their TYPEFACE to the bespoke PF2/IG sheets.
//
// The gap: PF2/IG restyled only colours, because skinHxVars/themeToHxVars never emitted the skin's fonts and
// the fonts weren't loaded off the 5e sheet. These pin the font-var emission (CS-1); the webfont loading is
// checked by the layout importing fonts.css.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skinHxVars, themeToHxVars } from '@/lib/dnd/skin-tokens';
import { lazzuhTheme, donataTheme, rangorTheme, streamerTheme, resolveThemeVariant } from '@/app/dnd/_sheet/theme';

const vars = (o: unknown) => o as Record<string, string>;

describe('skinHxVars carries the skin typeface', () => {
  it('a non-default skin emits its --hx-font-* (Neon Odyssey = Oswald)', () => {
    const v = vars(skinHxVars('lazzuh'));
    expect(v['--hx-font-display']).toBe(lazzuhTheme.fonts!.display);
    expect(v['--hx-font-body']).toBe(lazzuhTheme.fonts!.body);
    expect(v['--hx-font-mono']).toBe(lazzuhTheme.fonts!.mono);
  });
  it('the candy + rulebook skins bring their distinctive faces', () => {
    expect(vars(skinHxVars('donata'))['--hx-font-display']).toBe(donataTheme.fonts!.display); // Baloo 2
    expect(vars(skinHxVars('jack'))['--hx-font-display']).toBe(rangorTheme.fonts!.display); // Zilla Slab
    expect(vars(skinHxVars('streamer'))['--hx-font-display']).toBe(streamerTheme.fonts!.display); // Pixelify Sans
  });
  it('default (Hextech) stays on the baseline — no font override', () => {
    expect(vars(skinHxVars('default'))['--hx-font-display']).toBeUndefined();
    expect(vars(skinHxVars(undefined))['--hx-font-display']).toBeUndefined();
  });
  it('the four skins use FOUR different display faces (a switch is visible)', () => {
    const faces = ['lazzuh', 'streamer', 'donata', 'jack'].map((s) => vars(skinHxVars(s))['--hx-font-display']);
    expect(new Set(faces).size).toBe(4);
  });
});

describe('themeToHxVars carries a theme typeface', () => {
  it('a themed variant emits its font (streamer pink = Pixelify)', () => {
    const theme = resolveThemeVariant('streamer', 'pink').theme;
    expect(vars(themeToHxVars(theme))['--hx-font-display']).toBe(theme.fonts!.display);
  });
});

describe('the skin webfonts load on every /dnd page', () => {
  it('the dnd layout imports fonts.css', () => {
    const layout = readFileSync(join(process.cwd(), 'app/dnd/layout.tsx'), 'utf8');
    expect(layout).toContain("import './_sheet/styles/fonts.css'");
  });
  it('fonts.css @imports the skin font families', () => {
    const css = readFileSync(join(process.cwd(), 'app/dnd/_sheet/styles/fonts.css'), 'utf8');
    for (const fam of ['Oswald', 'Pixelify+Sans', 'Baloo+2', 'Zilla+Slab', 'Cinzel']) expect(css).toContain(fam);
  });
});
