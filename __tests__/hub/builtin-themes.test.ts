// __tests__/hub/builtin-themes.test.ts
//
// Verifies that importing the register-builtins side-effect module
// populates the registry with the expected built-in themes. Each
// slice that adds new built-ins extends this test (or its own).
//
// Also runs a smoke contrast check: primary text on surface should
// pass WCAG AA (4.5:1). We use a tiny inlined luminance helper here
// because the full lib/theme/contrast.ts utility doesn't land until
// Slice 105.

import { describe, it, expect } from 'vitest';
import { allThemes, isThemeRegistered, getTheme } from '@/lib/hub/themes';

// Import the side-effect registry — its evaluation calls defineTheme()
// for every shipped built-in theme.
import '@/lib/hub/themes/register-builtins';

describe('built-in theme registry', () => {
  it('starr-default is registered after importing register-builtins', () => {
    expect(isThemeRegistered('starr-default')).toBe(true);
    const def = getTheme('starr-default');
    expect(def?.label).toBe('Starr Default');
    expect(def?.isDark).toBe(false);
  });

  it('starr-dark is registered', () => {
    expect(isThemeRegistered('starr-dark')).toBe(true);
    const def = getTheme('starr-dark');
    expect(def?.label).toBe('Starr Dark');
    expect(def?.isDark).toBe(true);
  });

  it('every registered palette has all 14 fields populated and valid hex', () => {
    for (const def of allThemes()) {
      const keys: (keyof typeof def.palette)[] = [
        'bgPage', 'bgSurface', 'bgElevated',
        'fgPrimary', 'fgSecondary', 'fgMuted',
        'accent', 'accentFg',
        'border', 'borderStrong',
        'success', 'warning', 'danger', 'info',
      ];
      for (const k of keys) {
        const v = def.palette[k];
        expect(v, `${def.id}.${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('built-in themes pass WCAG AA spot-check', () => {
  // Standard sRGB relative-luminance + contrast-ratio implementation.
  // Replaced by the full lib/theme/contrast.ts utility in Slice 105.
  function rel(c: number): number {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  function lum(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * rel(r) + 0.7152 * rel(g) + 0.0722 * rel(b);
  }
  function ratio(a: string, b: string): number {
    const la = lum(a);
    const lb = lum(b);
    const [lo, hi] = la > lb ? [lb, la] : [la, lb];
    return (hi + 0.05) / (lo + 0.05);
  }

  for (const id of [
    'starr-default', 'starr-dark',
    'slate-light', 'slate-dark',
    'forest-light', 'sunset', 'ocean', 'plum',
  ] as const) {
    it(`${id}: fgPrimary on bgSurface ≥ 4.5:1 (WCAG AA body text)`, () => {
      const def = getTheme(id)!;
      const r = ratio(def.palette.fgPrimary, def.palette.bgSurface);
      expect(r, `${id} fg-primary on bg-surface = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${id}: accentFg on accent ≥ 4.5:1 (button text on button)`, () => {
      const def = getTheme(id)!;
      const r = ratio(def.palette.accentFg, def.palette.accent);
      expect(r, `${id} accent-fg on accent = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
