// __tests__/dnd/skin-theme-composition.test.ts — a Style and a Theme must BOTH still matter (P11-3).
//
// The sheet's stated model is "the Style sets the structure; a Theme recolours it". The code did something
// stronger: `{...skinHxVars(skin), ...themeToHxVars(theme)}` let the theme win on every token, and the five
// shared themes are authored FOR Hextech — they hardcode `HEXTECH_GROUNDS` and `fonts: hextechTheme.fonts`.
//
// Measured on a live PF2 sheet before the fix, holding the theme at Noxus Crimson: Hextech, Neon Odyssey,
// Candy Bazaar and Homebrew Rulebook resolved to BYTE-IDENTICAL tokens — same gold #b68a37, same accent
// #d98a45, same 'Cinzel'. Four of five styles were inert and the two LIGHT styles rendered dark navy.
//
// These are unit assertions on the composition function because that is where the decision lives; the
// numbers above came from `scripts/contact-sheet.mjs`, which re-measures the same thing in a browser.
import { describe, it, expect } from 'vitest';
import { skinThemeHxVars } from '@/lib/dnd/skin-tokens';
import { THEMES, lazzuhTheme, donataTheme, rangorTheme } from '@/app/dnd/_sheet/theme';

/** The four non-default styles, with the typeface each is supposed to keep. */
const SKINS = [
  { id: 'lazzuh', font: lazzuhTheme.fonts?.display },
  { id: 'donata', font: donataTheme.fonts?.display },
  { id: 'jack', font: rangorTheme.fonts?.display },
] as const;

const vars = (skin: string, theme: unknown) =>
  skinThemeHxVars(skin, theme as never) as unknown as Record<string, string>;

describe('a theme recolours a skin without replacing it', () => {
  for (const { key, label, theme } of THEMES) {
    it(`"${label}" (${key}) leaves every style distinguishable`, () => {
      const seen = new Map<string, string[]>();
      for (const id of ['default', ...SKINS.map((s) => s.id)]) {
        const fp = JSON.stringify(vars(id, theme));
        seen.set(fp, [...(seen.get(fp) ?? []), id]);
      }
      // One fingerprint per style. Before the fix this collapsed to a single entry holding all four.
      const twins = [...seen.values()].filter((g) => g.length > 1);
      expect(twins, `styles that resolve identically under ${label}: ${JSON.stringify(twins)}`).toEqual([]);
    });
  }

  for (const { id, font } of SKINS) {
    it(`"${id}" keeps its typeface under every theme`, () => {
      // Typography is the STYLE's identity, and the shared themes all carry Hextech's serif. A theme that
      // retypes the sheet is not recolouring it.
      for (const { label, theme } of THEMES) {
        expect(vars(id, theme)['--hx-font-display'], `${id} under ${label}`).toBe(font);
      }
    });

    it(`"${id}" keeps its own grounds under every theme`, () => {
      // The tokens a theme must NOT move: the page and panel tones. This is what keeps the light styles
      // light — `HEXTECH_GROUNDS` is deep navy, so inheriting it flipped Candy Bazaar and Homebrew
      // Rulebook to a dark sheet.
      const native = vars(id, null);
      for (const { label, theme } of THEMES) {
        const themed = vars(id, theme);
        for (const token of ['--hx-navy-0', '--hx-navy-1', '--hx-panel', '--hx-panel-2']) {
          expect(themed[token], `${id} ${token} under ${label}`).toBe(native[token]);
        }
      }
    });

    it(`"${id}" keeps its ink on the same side of its panel`, () => {
      // NOT byte-identical, deliberately. On a DARK style the ink is `lighten(gold, 0.85)` — a near-white
      // warmed by the style's gold — so once the theme supplies the gold, the ink picks up the theme's
      // warmth too: lazzuh's cyan-tinted #defafa becomes #f7f2e9 under Hextech Gold. That is a tint of
      // near-white, not a change of side, and it is the derivation working as written.
      //
      // What must hold is the RELATIONSHIP: dark ground → light ink, light ground → dark ink. Asserting
      // the exact hex would pin an implementation detail and fail the moment a swatch is retuned; this
      // asserts the thing that would actually make a sheet unreadable.
      const lum = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const native = vars(id, null);
      const inkIsLighter = lum(native['--hx-text']) > lum(native['--hx-panel']);
      for (const { label, theme } of THEMES) {
        const themed = vars(id, theme);
        expect(lum(themed['--hx-text']) > lum(themed['--hx-panel']), `${id} under ${label}`).toBe(inkIsLighter);
      }
    });

    it(`"${id}" DOES take the theme's accent — a theme that changes nothing is not a theme`, () => {
      // The other half of the guarantee. Asserting only "the skin survives" would pass a function that
      // ignored the theme outright, which is the opposite defect and just as wrong.
      const accents = new Set(THEMES.map(({ theme }) => vars(id, theme)['--hx-teal-1']));
      expect(accents.size).toBe(THEMES.length);
    });
  }
});

describe('the default (Hextech) style is deliberately exempt', () => {
  it('still takes the theme whole, grounds included', () => {
    // The shared themes ARE Hextech's — grounds, ink and all — so composing would be a downgrade there.
    // `hextechShadowIsles` sets `panel: '#0a1626'` via HEXTECH_GROUNDS; the baseline `.root` panel is
    // `#0b1a2c`, so a default skin that ignored the theme's grounds would show the baseline instead.
    const themed = vars('default', THEMES.find((t) => t.key === 'shadow-isles')!.theme);
    expect(themed['--hx-panel']).toBe('#0a1626');
    // And the accent is the theme's, unclamped-by-a-skin: Shadow Isles' spectral green.
    expect(themed['--hx-teal-1']).toBeTruthy();
  });

  it('with no theme chosen, emits nothing — the baseline stylesheet is the default', () => {
    expect(vars('default', null)).toEqual({});
  });
});
