// __tests__/dnd/theme-contrast-alternates.test.ts — the derived legibility alternates hold for EVERY
// skin × theme combination, including ones nobody hand-checked.
//
// THE PROBLEM THIS REPLACES. `--danger` was a single literal per theme, and three of the seven failed AA
// as text on their own panels (hextech #c8413f → 3.06, streamer/streamerBlue #e5344f → 3.49/3.58).
// Hand-picking a replacement does not work, because the token is used in BOTH directions and they pull
// apart: every value that fixes text-on-panel breaks label-on-fill.
//
//     #c8413f  text on hextech panel-3  3.06 fail  |  white label on it as a fill  4.90 pass
//     #e77a79  text on hextech panel-3  5.32 pass  |  white label on it as a fill  2.82 fail
//
// And the combinations are not enumerable by hand: `themeVariantsFor` offers the five universal themes to
// every non-streamer skin, so donata's `.btn.danger` (which hardcoded `color: #fff`) can be handed
// Noxus's danger. The fix is to DERIVE `--<token>-ink` and `--<token>-on` per theme in `themeToCssVars`.
// This file asserts the derivation actually holds — for all nine accents, on all ten themes, against the
// theme's own grounds (and, for `danger` alone, the self-tints its buttons paint over; see
// SELF_TINTED_TOKENS). The backdrop set is per-token on purpose: applying the self-tints to every accent
// pushed donata's hand-verified `hotpink` off a value it was annotated as passing, correcting it against
// a backdrop it never lands on. Over-correction is a regression too.
import { describe, it, expect } from 'vitest';
import {
  lazzuhTheme, hextechTheme, streamerTheme, streamerThemeBlue, donataTheme, rangorTheme,
  hextechShadowIsles, hextechNoxus, hextechFreljord, hextechVoidProphet, themeToCssVars,
} from '@/app/dnd/_sheet/theme';
import { parseHex, contrast, composite, worstContrast, AA_TEXT, type Rgb } from '@/app/dnd/_sheet/contrast';

const THEMES = {
  lazzuh: lazzuhTheme, hextech: hextechTheme, streamer: streamerTheme, streamerBlue: streamerThemeBlue,
  donata: donataTheme, rangor: rangorTheme, shadowIsles: hextechShadowIsles, noxus: hextechNoxus,
  freljord: hextechFreljord, voidProphet: hextechVoidProphet,
};
const ACCENTS = ['pink', 'hotpink', 'violet', 'violet-2', 'teal', 'tealbright', 'gold', 'danger', 'good'] as const;

/** Rebuild the same backdrop family `themeToCssVars` derives against, from the theme's own grounds.
 *  Only `danger` includes its self-tints — it is the one token whose own text sits on a tint of itself
 *  (`.btn.danger`, `.adv-seg .on-dis`, the danger chip). See SELF_TINTED_TOKENS in theme.ts. */
function backdrops(theme: typeof lazzuhTheme, token: string, accentHex: string): Rgb[] {
  const accent = parseHex(accentHex)!;
  const grounds = (['void', 'void-2', 'panel', 'panel-2', 'panel-3'] as const)
    .map((k) => theme.colors?.[k]).filter((v): v is string => !!v).map(parseHex).filter((v): v is Rgb => !!v);
  if (token !== 'danger') return grounds;
  const panels = grounds.slice(2);
  return [...grounds, ...panels.flatMap((p) => [composite(accent, 0.14, p), composite(accent, 0.22, p)])];
}

describe('every accent has a text alternate that clears AA on its own theme', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const vars = themeToCssVars(theme) as unknown as Record<string, string>;
    for (const token of ACCENTS) {
      const base = theme.colors?.[token];
      if (!base) continue;
      it(`${name} · --${token}-ink is readable as text`, () => {
        const ink = vars[`--${token}-ink`];
        expect(ink, `--${token}-ink was not emitted`).toBeTruthy();
        const worst = worstContrast(parseHex(ink)!, backdrops(theme, token, base));
        // The bar is 4.5 (WCAG 1.4.3 normal text) — these tokens paint 12px error text.
        expect(worst, `${name} --${token}-ink (${ink}) worst contrast ${worst.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
      });
      it(`${name} · --${token}-on is readable as a label on a ${token} fill`, () => {
        const on = vars[`--${token}-on`];
        expect(on, `--${token}-on was not emitted`).toBeTruthy();
        const r = contrast(parseHex(on)!, parseHex(base)!);
        expect(r, `${name} --${token}-on (${on}) on ${base} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }
});

describe('the derivation leaves correct themes alone', () => {
  // A theme whose author already picked a legible value must pass through UNCHANGED — otherwise the
  // mechanism silently redesigns palettes that were fine, which is a worse failure than the one it fixes.
  it('a token that already clears AA is returned byte-identical', () => {
    // Asserted as a PROPERTY over every theme × accent rather than as memorised hex values: an accent
    // whose base already clears must come back unchanged, and only a failing one may move. Written the
    // other way round it encoded my guess — I expected donata's #ad1f3d to pass and it does not (4.42
    // against its own tint, vs the 4.51 it scores against the hardcoded #ff5252 tint it used to sit on).
    let unchanged = 0;
    let moved = 0;
    for (const [name, theme] of Object.entries(THEMES)) {
      const vars = themeToCssVars(theme) as unknown as Record<string, string>;
      for (const token of ACCENTS) {
        const base = theme.colors?.[token];
        if (!base) continue;
        const alreadyClears = worstContrast(parseHex(base)!, backdrops(theme, token, base)) >= AA_TEXT;
        if (alreadyClears) {
          expect(vars[`--${token}-ink`], `${name} --${token} already cleared and must not be rewritten`).toBe(base);
          unchanged++;
        } else {
          expect(vars[`--${token}-ink`], `${name} --${token} failed and should have moved`).not.toBe(base);
          moved++;
        }
      }
    }
    // Both branches must be exercised, or the property is vacuous.
    expect(unchanged, 'no token passed through unchanged — the derivation is over-correcting').toBeGreaterThan(0);
    expect(moved, 'nothing moved — the fixture no longer contains the defect this guards').toBeGreaterThan(0);
  });

  it('and the three that failed are the three that moved', () => {
    // Recorded as the actual before-numbers so a future palette edit that re-breaks them is visible.
    for (const [name, theme, before] of [
      ['hextech', hextechTheme, '#c8413f'], ['streamer', streamerTheme, '#e5344f'],
      ['streamerBlue', streamerThemeBlue, '#e5344f'],
    ] as const) {
      const vars = themeToCssVars(theme) as unknown as Record<string, string>;
      expect(vars['--danger'], `${name} identity colour must NOT change — it is the design`).toBe(before);
      expect(vars['--danger-ink'], `${name} should have derived a different ink`).not.toBe(before);
    }
  });

  it('the identity token is never rewritten, for any theme', () => {
    // `--danger` still drives fills, borders and the codex HP bar, which need only 3:1. Deriving the
    // alternate must not disturb the colour the designer chose for those.
    for (const [name, theme] of Object.entries(THEMES)) {
      const vars = themeToCssVars(theme) as unknown as Record<string, string>;
      for (const token of ACCENTS) {
        if (theme.colors?.[token]) expect(vars[`--${token}`], `${name} --${token}`).toBe(theme.colors[token]);
      }
    }
  });
});
