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
  it('the default (hextech) skin offers a 3–4 palette set; unknown skins fall back to it', () => {
    const def = themeVariantsFor('hextech');
    expect(def.length).toBeGreaterThanOrEqual(3);
    expect(def.map((v) => v.key)).toContain('noxus');
    expect(themeVariantsFor('totally-unknown').map((v) => v.key)).toEqual(def.map((v) => v.key));
  });
  it('streamer keeps its pink/blue pair', () => {
    expect(themeVariantsFor('streamer').map((v) => v.key).sort()).toEqual(['blue', 'pink']);
  });
  it('resolveThemeVariant falls back to the first variant on a missing/bad key', () => {
    expect(resolveThemeVariant('hextech', 'nope').key).toBe('hextech');
    expect(resolveThemeVariant('hextech', 'noxus').key).toBe('noxus');
    expect(resolveThemeVariant(undefined, undefined).key).toBe('hextech');
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
