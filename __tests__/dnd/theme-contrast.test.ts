// __tests__/dnd/theme-contrast.test.ts — the token-contrast guardrail (TR-1).
//
// Every sheet component reads the same colour tokens, so legibility is a property of the TOKENS. This audits
// each theme's text/border pairings against WCAG thresholds so an illegible combination can't ship, and pins
// the contrast maths against known values.
import { describe, it, expect } from 'vitest';
import {
  parseColor,
  contrastRatio,
  auditTheme,
  CONTRAST,
  type SheetThemeColors,
} from '@/lib/dnd/theme-contrast';
import {
  lazzuhTheme,
  hextechTheme,
  streamerTheme,
  streamerThemeBlue,
  donataTheme,
  rangorTheme,
  hextechShadowIsles,
  hextechNoxus,
  hextechFreljord,
  hextechVoidProphet,
} from '@/app/dnd/_sheet/theme';

describe('contrast maths', () => {
  it('parses hex (#rgb, #rrggbb, #rrggbbaa) and rgb/rgba', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0a141e')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(139, 92, 246, 0.28)')).toEqual({ r: 139, g: 92, b: 246, a: 0.28 });
    expect(parseColor('linear-gradient(...)')).toBeNull();
  });

  it('computes the canonical WCAG ratios', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0); // black on white = 21:1
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5); // same colour = 1:1
    // A translucent border is composited over its background before scoring.
    const r = contrastRatio('rgba(255,255,255,0.5)', '#000');
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(1);
    expect(r!).toBeLessThan(21);
  });
});

const THEMES: [string, { colors?: SheetThemeColors }][] = [
  ['lazzuh', lazzuhTheme],
  ['hextech', hextechTheme],
  ['streamer/pink', streamerTheme],
  ['streamer/blue', streamerThemeBlue],
  ['donata', donataTheme],
  ['rangor', rangorTheme],
  ['shadow-isles', hextechShadowIsles],
  ['noxus', hextechNoxus],
  ['freljord', hextechFreljord],
  ['void-prophet', hextechVoidProphet],
];

describe('every sheet theme is legible — token contrast meets the thresholds (TR-1/TR-2)', () => {
  for (const [name, theme] of THEMES) {
    it(`${name}: ink/muted/accent/border all clear their bars`, () => {
      const scores = auditTheme(theme.colors ?? {});
      const failures = scores
        .filter((s) => !s.pass)
        .map((s) => `${s.fg} on ${s.bg}: ${s.ratio.toFixed(2)}:1 (needs ${s.min}:1)`);
      expect(scores.length, `${name} should have scorable pairings`).toBeGreaterThan(0);
      expect(failures, `${name} has low-contrast token pairings`).toEqual([]);
    });
  }
});

describe('the thresholds are the documented ones', () => {
  it('body 4.5, secondary 3.0, border 1.3', () => {
    expect(CONTRAST).toEqual({ body: 4.5, secondary: 3.0, border: 1.3 });
  });
});

describe('every theme defines the legibility-critical tokens + a body font (TR-3 structural half)', () => {
  // A theme that OMITS a text token or a body font falls back to whatever the stylesheet default is, which
  // may not suit the skin's grounds — a subtle way an illegible combination slips in. These must be present.
  const REQUIRED = ['void', 'panel', 'ink', 'muted', 'line'] as const;
  for (const [name, theme] of THEMES) {
    it(`${name}: defines ${REQUIRED.join('/')} and a body font`, () => {
      const colors = theme.colors ?? {};
      for (const tok of REQUIRED) {
        expect(colors[tok], `${name} is missing --${tok}`).toBeTruthy();
      }
      // Fonts are optional per SheetTheme, but a theme that sets ANY font must set the body one (the display
      // font is for headings/numerals only — using it for long text is the classic legibility regression).
      const fonts = (theme as { fonts?: Record<string, string | undefined> }).fonts;
      if (fonts && Object.keys(fonts).length > 0) {
        expect(fonts.body, `${name} sets fonts but no body font`).toBeTruthy();
      }
    });
  }
});
