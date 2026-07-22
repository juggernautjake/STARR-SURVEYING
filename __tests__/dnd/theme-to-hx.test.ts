// __tests__/dnd/theme-to-hx.test.ts — the theme → bespoke colour bridge (U-2).
//
// `themeToHxVars` recolours the bespoke PF2/IG sheets to any of the 5 universal themes by mapping a
// SheetTheme onto the `--hx-*` token set those sheets read. These pin the contract the sheets rely on:
// every token is emitted, values are usable, the palette differs per theme, and no theme yields {} (which
// would silently leave the sheet on its skin colours).
import { describe, it, expect } from 'vitest';
import { themeToHxVars, themeToShellVars } from '@/lib/dnd/skin-tokens';
import { THEMES } from '@/app/dnd/_sheet/theme';

const HX_TOKENS = [
  '--hx-navy-0', '--hx-navy-1', '--hx-navy-2', '--hx-panel', '--hx-panel-2', '--hx-line',
  '--hx-gold-0', '--hx-gold-1', '--hx-gold-2', '--hx-gold-3', '--hx-teal-1', '--hx-teal-2',
  '--hx-text', '--hx-muted',
] as const;

describe('themeToHxVars — the 5 themes each map to the full --hx-* set', () => {
  it('emits every core token for every theme, all non-empty strings', () => {
    for (const v of THEMES) {
      const vars = themeToHxVars(v.theme) as Record<string, string>;
      for (const t of HX_TOKENS) {
        expect(vars[t], `${v.key} ${t}`).toBeTruthy();
        expect(typeof vars[t]).toBe('string');
      }
    }
  });

  it('the gold/text tokens are concrete colours (hex), not left as CSS var references', () => {
    for (const v of THEMES) {
      const vars = themeToHxVars(v.theme) as Record<string, string>;
      for (const t of ['--hx-gold-2', '--hx-text', '--hx-teal-1', '--hx-navy-0']) {
        expect(vars[t], `${v.key} ${t}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('palettes differ between themes (Hextech gold vs Void Prophet are not identical)', () => {
    const hextech = themeToHxVars(THEMES.find((t) => t.key === 'hextech')!.theme) as Record<string, string>;
    const voidP = themeToHxVars(THEMES.find((t) => t.key === 'void-prophet')!.theme) as Record<string, string>;
    // At least one core colour must differ, or the "5 distinct themes" promise is empty.
    expect(HX_TOKENS.some((t) => hextech[t] !== voidP[t])).toBe(true);
  });

  it('returns {} for no theme, so an unset skinVariant keeps the skin colours', () => {
    expect(themeToHxVars(null)).toEqual({});
    expect(themeToHxVars(undefined)).toEqual({});
    expect(themeToShellVars(null)).toEqual({});
  });

  it('themeToShellVars yields the shell tokens (--gold, --panel-rgb triplet) for a theme', () => {
    const shell = themeToShellVars(THEMES[0].theme) as Record<string, string>;
    expect(shell['--gold']).toBeTruthy();
    expect(shell['--panel-rgb']).toMatch(/^\d+, \d+, \d+$/);
  });
});
