// __tests__/dnd/theme-variants.test.ts — Area TH2/TH4. Each template offers a set of colour themes, and every
// theme is READABLE: computed WCAG contrast of body ink vs the panel/void grounds must clear AA (4.5:1). This
// is the browser-free guarantee behind the owner's "3–4 color variation templates per template, readable".
import { describe, it, expect } from 'vitest';
import { themeVariantsFor, resolveThemeVariant, type ThemeVariant } from '@/app/dnd/_sheet/theme';

function lum(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return NaN;
  const n = parseInt(m[1], 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function contrast(a: string, b: string): number {
  const [la, lb] = [lum(a), lum(b)];
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SKINS = ['hextech', 'streamer', 'donata', 'rulebook', undefined];

describe('theme variants per template (TH2)', () => {
  it('the default (hextech) skin offers a 3–4 palette set', () => {
    const def = themeVariantsFor('hextech');
    expect(def.length).toBeGreaterThanOrEqual(3);
    expect(def.map((v) => v.key)).toContain('noxus');
  });
  it('the 5 shared themes apply to EVERY style (U-1) — including base + unknown skins', () => {
    const five = ['hextech', 'shadow-isles', 'noxus', 'freljord', 'void-prophet'];
    expect(themeVariantsFor(undefined).map((v) => v.key)).toEqual(five);
    expect(themeVariantsFor('totally-unknown').map((v) => v.key)).toEqual(five);
    expect(themeVariantsFor('donata').map((v) => v.key)).toEqual(five);
    expect(themeVariantsFor('hextech').map((v) => v.key)).toEqual(five);
  });
  it('the new unique 5th theme (Void Prophet) exists and is distinct', () => {
    const v = themeVariantsFor('hextech').find((t) => t.key === 'void-prophet');
    expect(v?.label).toBe('Void Prophet');
    expect(v?.theme.colors?.hotpink).toBe('#9d4edd'); // arcane violet — none of the other four use it
  });
  it('streamer keeps its pink/blue pair (drives its .variant-<id> art-swap, not just a palette)', () => {
    expect(themeVariantsFor('streamer').map((v) => v.key).sort()).toEqual(['blue', 'pink']);
  });
  it('resolveThemeVariant falls back to the first shared theme on a missing/bad key', () => {
    expect(resolveThemeVariant('hextech', 'nope').key).toBe('hextech');
    expect(resolveThemeVariant('hextech', 'noxus').key).toBe('noxus');
    expect(resolveThemeVariant('donata', 'void-prophet').key).toBe('void-prophet'); // shared on every style
    expect(resolveThemeVariant(undefined, undefined).key).toBe('hextech'); // first shared theme
  });
});

describe('every theme variant is readable (TH4 — WCAG AA)', () => {
  const all: ThemeVariant[] = SKINS.flatMap((s) => themeVariantsFor(s));
  for (const v of all) {
    it(`"${v.label}" body ink clears 4.5:1 on panel + void`, () => {
      const ink = v.theme.colors?.ink;
      const panel = v.theme.colors?.panel;
      const voidc = v.theme.colors?.void;
      expect(ink && panel && voidc).toBeTruthy();
      expect(contrast(ink!, panel!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink!, voidc!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('theme picker wiring (TH3)', () => {
  const app = readFileSync(join(process.cwd(), 'app/dnd/_sheet/App.tsx'), 'utf8');
  const picker = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/SkinSwitch.tsx'), 'utf8');

  it('App resolves the chosen variant to a theme, keeping the sheet_type theme when none is chosen', () => {
    expect(app).toContain('const themeVariants = themeVariantsFor(config.skin)');
    expect(app).toContain('const hasThemePicker = themeVariants.length > 1');
    // no chosen variant → the sheet_type theme EXACTLY (no regression); chosen → resolveThemeVariant
    expect(app).toContain('char.skinVariant ? resolveThemeVariant(config.skin, char.skinVariant).theme : config.theme');
    expect(app).toContain('{hasThemePicker && <SkinSwitch variants={themeVariants} />}');
  });

  it('the picker renders every variant with a swatch and persists the choice to char.skinVariant', () => {
    expect(picker).toContain('variants }: { variants: ThemeVariant[] }');
    expect(picker).toContain('skinVariant: v.key');
    expect(picker).toContain('v.theme.colors'); // builds a colour swatch from the palette
  });
});
