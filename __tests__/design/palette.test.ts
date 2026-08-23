// __tests__/design/palette.test.ts — colour maths, and the generator that must not produce a
// theme nobody can read.
//
// This is the file that earns its keep silently. A hue rotation a few degrees off, a lightness ramp
// that is not monotonic, an auto-assignment that puts 2.8:1 text on a card — every one of those
// produces something that looks plausible in a swatch grid and is wrong. None of them would be
// caught by looking.

import { describe, it, expect } from 'vitest';
import {
  rgbToHsl, hslToHex, hexToHsl, withLightness, rotateHue, withSaturation,
  ramp, RAMP_STEPS, buildPalette, themeFromPalette, enforceContrast, paletteFromTheme, HARMONIES,
} from '@/lib/design/palette';
import { contrastRatio } from '@/lib/design/checks';
import { themeContrastProblems, readableOn, prefersLightText, themeCss, themeStyle, BUILT_IN_THEMES, THEME_TOKENS } from '@/lib/design/theme';

describe('the colour space round-trips', () => {
  it('converts a known colour both ways', () => {
    const hsl = hexToHsl('#1D3095');
    expect(hsl).not.toBeNull();
    expect(Math.round(hsl!.h)).toBe(231);
    // Back again, within a rounding step.
    expect(hslToHex(hsl!)).toBe('#1D3095');
  });

  it('handles pure grey without inventing a hue', () => {
    const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });
    expect(hsl.s).toBe(0);
    expect(hsl.h).toBe(0);
  });

  it('handles black and white', () => {
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe('#000000');
    expect(hslToHex({ h: 0, s: 0, l: 1 })).toBe('#FFFFFF');
  });

  it('wraps the hue rather than clamping it', () => {
    // 350° + 30° is 20°, not 360°. Clamping would make every rotation near the top of the wheel
    // collapse onto red, which is exactly the bug that produces a palette of one colour.
    const rotated = rotateHue('#FF0033', 30);
    const hsl = hexToHsl(rotated)!;
    expect(hsl.h).toBeLessThan(90);
  });

  it('keeps hue and saturation when only lightness moves', () => {
    const before = hexToHsl('#1D3095')!;
    const after = hexToHsl(withLightness('#1D3095', 0.8))!;
    // Within a degree: hex has 8 bits per channel, so a round trip through it moves the hue very
    // slightly. Demanding exact equality would be testing the precision of the format, not the code.
    expect(Math.abs(after.h - before.h)).toBeLessThanOrEqual(2);
    expect(after.l).toBeGreaterThan(before.l);
  });

  it('desaturates to grey', () => {
    const grey = withSaturation('#1D3095', 0);
    const hsl = hexToHsl(grey)!;
    expect(hsl.s).toBe(0);
  });
});

describe('the tint and shade ramp', () => {
  it('runs light to dark, monotonically', () => {
    const steps = ramp('#1D3095').map((s) => hexToHsl(s.value)!.l);
    expect(steps).toHaveLength(RAMP_STEPS.length);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
  });

  it('produces the SAME lightnesses whatever the seed', () => {
    // The steps are absolute, not multiplied from the seed. Multiplying means a pale seed gives
    // nine pale colours — a ramp that depends on where the seed happens to sit is not a ramp.
    const fromDark = ramp('#101820').map((s) => Math.round(hexToHsl(s.value)!.l * 100));
    const fromLight = ramp('#EEF5FF').map((s) => Math.round(hexToHsl(s.value)!.l * 100));
    expect(fromDark).toEqual(fromLight);
  });

  it('eases saturation off at the extremes', () => {
    const steps = ramp('#FF0000');
    const lightest = hexToHsl(steps[0].value)!;
    const middle = hexToHsl(steps[4].value)!;
    expect(lightest.s).toBeLessThan(middle.s);
  });
});

describe('harmonies', () => {
  it('offers every harmony with a description somebody can choose from', () => {
    expect(HARMONIES.length).toBeGreaterThanOrEqual(6);
    expect(HARMONIES.every((h) => h.label && h.description)).toBe(true);
  });

  it('a complementary palette contains the opposite hue', () => {
    const p = buildPalette('#1D3095', 'complementary');
    const hues = p.swatches.map((s) => hexToHsl(s.value)!.h);
    const base = hexToHsl('#1D3095')!.h;
    const opposite = (base + 180) % 360;
    expect(hues.some((h) => Math.abs(h - opposite) < 12)).toBe(true);
  });

  it('a triadic palette has three distinct hues', () => {
    const p = buildPalette('#1D3095', 'triadic');
    const hues = new Set(p.swatches.map((s) => Math.round(hexToHsl(s.value)!.h / 20)));
    expect(hues.size).toBeGreaterThanOrEqual(3);
  });

  it('every palette carries neutrals, or a theme built from it has no background', () => {
    for (const harmony of ['complementary', 'analogous', 'triadic'] as const) {
      const p = buildPalette('#1D3095', harmony);
      expect(p.swatches.some((s) => /neutral/i.test(s.name))).toBe(true);
    }
  });

  it('a monochrome palette is one hue', () => {
    const p = buildPalette('#1D3095', 'monochrome');
    // Only the steps with real saturation: at 6% saturation a near-white is barely a hue at all and
    // quantises to whatever is nearest in hex, which is not the ramp being wrong.
    const hues = new Set(
      p.swatches
        .map((sw) => hexToHsl(sw.value)!)
        .filter((c) => c.s > 0.15)
        .map((c) => Math.round(c.h / 10)),
    );
    expect(hues.size).toBeLessThanOrEqual(2);
  });

  it('survives a colour it cannot parse rather than throwing', () => {
    expect(buildPalette('not a colour', 'triadic').swatches).toEqual([]);
  });
});

describe('turning a palette into a theme', () => {
  const palette = buildPalette('#1D3095', 'split-complementary', 'Test');

  it('assigns roles by measured property, not by position', () => {
    const theme = themeFromPalette(palette);
    const page = hexToHsl(theme.tokens['--theme-bg-page']!)!;
    const text = hexToHsl(theme.tokens['--theme-fg-primary']!)!;
    expect(page.l).toBeGreaterThan(text.l);
  });

  it('produces the same theme when the swatches are shuffled', () => {
    // The whole difference between automation and a lottery.
    const shuffled = { ...palette, swatches: [...palette.swatches].reverse() };
    const a = themeFromPalette(palette);
    const b = themeFromPalette(shuffled);
    expect(b.tokens['--theme-bg-page']).toBe(a.tokens['--theme-bg-page']);
    expect(b.tokens['--theme-accent']).toBe(a.tokens['--theme-accent']);
    expect(b.tokens['--theme-fg-primary']).toBe(a.tokens['--theme-fg-primary']);
  });

  it('inverts surfaces and text for a dark theme', () => {
    const light = themeFromPalette(palette);
    const dark = themeFromPalette(palette, { dark: true });
    expect(hexToHsl(dark.tokens['--theme-bg-page']!)!.l)
      .toBeLessThan(hexToHsl(light.tokens['--theme-bg-page']!)!.l);
    expect(hexToHsl(dark.tokens['--theme-fg-primary']!)!.l)
      .toBeGreaterThan(hexToHsl(light.tokens['--theme-fg-primary']!)!.l);
  });

  it('picks an accent that is neither almost-white nor almost-black', () => {
    const theme = themeFromPalette(palette);
    const l = hexToHsl(theme.tokens['--theme-accent']!)!.l;
    expect(l).toBeGreaterThan(0.15);
    expect(l).toBeLessThan(0.85);
  });

  it('puts readable text on the accent', () => {
    const theme = themeFromPalette(palette);
    const ratio = contrastRatio(theme.tokens['--theme-accent-fg']!, theme.tokens['--theme-accent']!)!;
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the state colours recognisable rather than letting the palette recolour them', () => {
    // A red success pill is a palette winning an argument it should not be in.
    const theme = themeFromPalette(buildPalette('#CC0000', 'monochrome'));
    const successHue = hexToHsl(theme.tokens['--theme-success']!)!.h;
    expect(successHue).toBeGreaterThan(80);
    expect(successHue).toBeLessThan(180);
  });

  it('fills the --color-* family the catalogue reads, not only --theme-*', () => {
    const theme = themeFromPalette(palette);
    expect(theme.tokens['--color-text-primary']).toBeTruthy();
    expect(theme.tokens['--color-bg-card']).toBeTruthy();
    expect(theme.tokens['--color-brand-navy']).toBeTruthy();
  });

  it('does not throw on an empty palette', () => {
    expect(themeFromPalette({ id: 'x', name: 'Empty', swatches: [] }).tokens).toEqual({});
  });
});

describe('the contrast guard', () => {
  it('lifts unreadable text until it passes, and says what it changed', () => {
    const bad = {
      id: 't', name: 'Bad',
      tokens: {
        '--theme-bg-surface': '#FFFFFF',
        '--theme-fg-muted': '#E8E8E8',       // ~1.2:1 — invisible
      },
    };
    const { theme, adjustments } = enforceContrast(bad);
    const ratio = contrastRatio(theme.tokens['--theme-fg-muted']!, '#FFFFFF')!;
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].token).toBe('--theme-fg-muted');
    expect(adjustments[0].why).toContain('below 4.5:1');
  });

  it('keeps the hue, so the fix is the same colour made readable', () => {
    const bad = {
      id: 't', name: 'Bad',
      tokens: { '--theme-bg-surface': '#FFFFFF', '--theme-fg-secondary': '#9AD5FF' },
    };
    const { theme } = enforceContrast(bad);
    const before = hexToHsl('#9AD5FF')!;
    const after = hexToHsl(theme.tokens['--theme-fg-secondary']!)!;
    expect(Math.abs(after.h - before.h)).toBeLessThan(8);
  });

  it('darkens on a light background and lightens on a dark one', () => {
    const onLight = enforceContrast({ id: 'a', name: 'a', tokens: { '--theme-bg-surface': '#FFFFFF', '--theme-fg-primary': '#BBBBBB' } });
    const onDark = enforceContrast({ id: 'b', name: 'b', tokens: { '--theme-bg-surface': '#111111', '--theme-fg-primary': '#444444' } });
    expect(hexToHsl(onLight.theme.tokens['--theme-fg-primary']!)!.l).toBeLessThan(hexToHsl('#BBBBBB')!.l);
    expect(hexToHsl(onDark.theme.tokens['--theme-fg-primary']!)!.l).toBeGreaterThan(hexToHsl('#444444')!.l);
  });

  it('leaves a theme that already passes completely alone', () => {
    const good = { id: 't', name: 'Good', tokens: { '--theme-bg-surface': '#FFFFFF', '--theme-fg-primary': '#0F1419' } };
    const { theme, adjustments } = enforceContrast(good);
    expect(adjustments).toEqual([]);
    expect(theme.tokens).toEqual(good.tokens);
  });

  it('every generated theme passes its own contrast rules after the guard', () => {
    // The property that makes the generator safe to offer at all.
    for (const seed of ['#1D3095', '#CC0000', '#F5F5DC', '#101820', '#7E22CE']) {
      for (const dark of [false, true]) {
        const palette = buildPalette(seed, 'triadic');
        const { theme } = enforceContrast(themeFromPalette(palette, { dark }));
        const problems = themeContrastProblems(theme, () => '#FFFFFF');
        expect(problems, `${seed} ${dark ? 'dark' : 'light'}: ${problems.map((p) => p.label).join(', ')}`).toEqual([]);
      }
    }
  });
});

describe('readable foregrounds', () => {
  it('puts white on dark and ink on light', () => {
    expect(readableOn('#0F1419')).toBe('#FFFFFF');
    expect(readableOn('#FFFFFF')).toBe('#0F1419');
    expect(prefersLightText('#1D3095')).toBe(true);
    expect(prefersLightText('#FEF3C7')).toBe(false);
  });
});

describe('applying a theme', () => {
  it('becomes a style object of custom properties', () => {
    const style = themeStyle(BUILT_IN_THEMES.find((t) => t.id === 'ocean')!);
    expect(style['--theme-bg-page']).toBe('#F0F9FF');
  });

  it('becomes a CSS block for the exported file', () => {
    const css = themeCss(BUILT_IN_THEMES.find((t) => t.id === 'ocean')!);
    expect(css).toContain(':root {');
    expect(css).toContain('--theme-accent: #0369A1;');
  });

  it('an empty theme produces nothing rather than an empty rule', () => {
    expect(themeCss({ id: 'x', name: 'x', tokens: {} })).toBe('');
    expect(themeStyle(null)).toEqual({});
  });

  it('every built-in theme only sets tokens the studio knows about', () => {
    const known = new Set(THEME_TOKENS.map((t) => t.name));
    for (const theme of BUILT_IN_THEMES) {
      for (const token of Object.keys(theme.tokens)) {
        expect(known.has(token as never), `${theme.name} sets unknown token ${token}`).toBe(true);
      }
    }
  });

  it('every built-in theme is readable', () => {
    for (const theme of BUILT_IN_THEMES) {
      if (Object.keys(theme.tokens).length === 0) continue;
      expect(themeContrastProblems(theme, () => '#FFFFFF'), theme.name).toEqual([]);
    }
  });
});

describe('the way back', () => {
  it('extracts a palette from a theme', () => {
    const p = paletteFromTheme(BUILT_IN_THEMES.find((t) => t.id === 'plum')!, 'From plum');
    expect(p.swatches.length).toBeGreaterThan(4);
    expect(p.swatches.some((s) => s.name === 'Accent')).toBe(true);
  });
});
