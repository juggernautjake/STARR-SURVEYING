// __tests__/dnd/skin-tokens.test.ts — the skin → bespoke-sheet token bridge (PF2/IG restyle).
//
// skinHxVars() is what makes the skin picker actually restyle the Pathfinder 2e and Intuitive Games
// sheets: it maps a `sheet_type` to the `--hx-*` overrides those sheets read. The claims that matter
// and are checked here:
//   · default is a NO-OP — it is the baseline token set, so the Hextech look must be untouched;
//   · every catalogued skin returns without throwing (a bad swatch must degrade, never crash render);
//   · the CRUCIAL correctness point — a LIGHT skin must set a genuinely DARK `--hx-text`, because the
//     default near-white text is invisible on a near-white background. This is asserted numerically
//     (a luminance check), not just "is a string", since "readable" is the whole reason this exists.
import { describe, it, expect } from 'vitest';
import { skinHxVars } from '@/lib/dnd/skin-tokens';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';

// Local copy of the WCAG luminance the module uses, so the test independently judges "dark" / "light".
function luminance(hex: string): number {
  const h = hex.replace(/^#/, '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((s) => (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

describe('skinHxVars', () => {
  it('returns no overrides for the default (Hextech) skin — it IS the baseline', () => {
    expect(skinHxVars('default')).toEqual({});
  });

  it('returns no overrides for an unknown / undefined id (fail safe to the baseline)', () => {
    expect(skinHxVars(undefined)).toEqual({});
    expect(skinHxVars('not-a-real-skin')).toEqual({});
  });

  it('every catalogued skin resolves without throwing', () => {
    for (const style of SHEET_STYLES) {
      expect(() => skinHxVars(style.id)).not.toThrow();
    }
  });

  it('a non-default skin actually overrides the core tokens', () => {
    const vars = skinHxVars('lazzuh') as Record<string, string>;
    // The bg/panel/accent/gold family must all be present so var(--hx-…) re-resolves across the sheet.
    for (const key of ['--hx-navy-0', '--hx-panel', '--hx-gold-2', '--hx-teal-1', '--hx-text']) {
      expect(vars[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('LIGHT skins set a dark --hx-text so it is legible on their near-white panels', () => {
    for (const style of SHEET_STYLES.filter((s) => s.light)) {
      const vars = skinHxVars(style.id) as Record<string, string>;
      const text = vars['--hx-text'];
      const panel = vars['--hx-panel'];
      // The ink must be genuinely dark (low luminance) …
      expect(luminance(text)).toBeLessThan(0.25);
      // … and clearly darker than the panel it sits on (the panel is light).
      expect(luminance(panel)).toBeGreaterThan(luminance(text) + 0.3);
    }
  });

  it('DARK skins keep a light --hx-text (near-white) against their dark panels', () => {
    for (const style of SHEET_STYLES.filter((s) => !s.light && s.id !== 'default')) {
      const vars = skinHxVars(style.id) as Record<string, string>;
      expect(luminance(vars['--hx-text'])).toBeGreaterThan(0.5);
    }
  });
});
