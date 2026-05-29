// __tests__/theme/contrast.test.ts
//
// Slice 105 — WCAG 2.2 contrast calculator. Spot-checks against
// known WCAG examples + edge cases.

import { describe, it, expect } from 'vitest';
import {
  adjustForegroundToTarget,
  contrastLevel,
  contrastRatio,
  contrastVerdictFor,
  darken,
  lighten,
  parseHexColor,
  passesAA,
  passesAAA,
  pickForegroundForBackground,
  relativeLuminance,
  srgbChannelToLinear,
  toHexColor,
  WCAG_AA_BODY,
  WCAG_AAA_BODY,
} from '@/lib/theme/contrast';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0,   g: 0,   b: 0   };

describe('parseHexColor', () => {
  it('parses #rrggbb', () => {
    expect(parseHexColor('#FF8040')).toEqual({ r: 255, g: 128, b: 64 });
  });

  it('parses 3-digit shorthand', () => {
    expect(parseHexColor('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('returns null for invalid input', () => {
    expect(parseHexColor('rgb(1,2,3)')).toBeNull();
    expect(parseHexColor('#12')).toBeNull();
    expect(parseHexColor('')).toBeNull();
    expect(parseHexColor('not a hex')).toBeNull();
  });

  it('round-trips with toHexColor', () => {
    const parsed = parseHexColor('#3C7A89');
    expect(parsed).not.toBeNull();
    expect(toHexColor(parsed!)).toBe('#3C7A89');
  });
});

describe('srgbChannelToLinear', () => {
  it('returns 0 for pure black channel', () => {
    expect(srgbChannelToLinear(0)).toBe(0);
  });
  it('returns 1 for pure white channel', () => {
    expect(srgbChannelToLinear(255)).toBeCloseTo(1, 6);
  });
  it('passes through small values as linear', () => {
    // ≤ 0.04045 ⇒ c / 12.92. 10/255 = 0.0392, below threshold.
    expect(srgbChannelToLinear(10)).toBeCloseTo(0.0392 / 12.92, 4);
  });
});

describe('relativeLuminance — anchors', () => {
  it('pure white is 1.0', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1.0, 4);
  });

  it('pure black is 0.0', () => {
    expect(relativeLuminance(BLACK)).toBeCloseTo(0.0, 4);
  });

  it('mid-grey is ~0.215 (per WCAG example)', () => {
    // #777777 luminance ~0.183
    const grey = { r: 0x77, g: 0x77, b: 0x77 };
    expect(relativeLuminance(grey)).toBeGreaterThan(0.15);
    expect(relativeLuminance(grey)).toBeLessThan(0.25);
  });
});

describe('contrastRatio — known anchors', () => {
  it('white-on-black hits 21.0', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21.0, 2);
  });

  it('same color hits 1.0', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1.0, 2);
    expect(contrastRatio(BLACK, BLACK)).toBeCloseTo(1.0, 2);
  });

  it('is symmetric (order independent)', () => {
    const a = parseHexColor('#3C7A89')!;
    const b = parseHexColor('#F0F0F0')!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });

  it('#1F2937 on white passes AA body (≥ 4.5)', () => {
    // Slate-800 — modern dark text on white.
    const fg = parseHexColor('#1F2937')!;
    expect(contrastRatio(WHITE, fg)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
  });

  it('#666666 on white passes AA body but fails AAA', () => {
    const fg = parseHexColor('#666666')!;
    const r = contrastRatio(WHITE, fg);
    expect(r).toBeGreaterThan(WCAG_AA_BODY);
    expect(r).toBeLessThan(WCAG_AAA_BODY);
  });

  it('#AAAAAA on white fails AA body', () => {
    const fg = parseHexColor('#AAAAAA')!;
    expect(contrastRatio(WHITE, fg)).toBeLessThan(WCAG_AA_BODY);
  });
});

describe('contrastLevel + verdict', () => {
  it('21.0 reports AAA', () => {
    expect(contrastLevel(21.0)).toBe('AAA');
  });

  it('4.5 exactly is AA', () => {
    expect(contrastLevel(4.5)).toBe('AA');
  });

  it('3.5 is large-text-only', () => {
    expect(contrastLevel(3.5)).toBe('AA-large-only');
  });

  it('2.0 fails', () => {
    expect(contrastLevel(2.0)).toBe('fail');
  });

  it('contrastVerdictFor returns ratio + level', () => {
    const v = contrastVerdictFor(WHITE, BLACK);
    expect(v.ratio).toBeCloseTo(21, 2);
    expect(v.level).toBe('AAA');
  });
});

describe('passesAA / passesAAA helpers', () => {
  it('passesAA threshold at 4.5', () => {
    expect(passesAA(4.5)).toBe(true);
    expect(passesAA(4.49)).toBe(false);
  });
  it('passesAAA threshold at 7.0', () => {
    expect(passesAAA(7.0)).toBe(true);
    expect(passesAAA(6.9)).toBe(false);
  });
});

describe('pickForegroundForBackground', () => {
  it('returns black on a light bg', () => {
    expect(pickForegroundForBackground({ r: 240, g: 240, b: 240 })).toEqual(BLACK);
  });

  it('returns white on a dark bg', () => {
    expect(pickForegroundForBackground({ r: 32, g: 32, b: 32 })).toEqual(WHITE);
  });
});

describe('lighten / darken', () => {
  it('lighten(black, 1) === white', () => {
    expect(lighten(BLACK, 1)).toEqual(WHITE);
  });
  it('darken(white, 1) === black', () => {
    expect(darken(WHITE, 1)).toEqual(BLACK);
  });
  it('lighten with amount=0 is identity', () => {
    const c = { r: 32, g: 64, b: 128 };
    expect(lighten(c, 0)).toEqual(c);
  });
  it('clamps the amount to [0, 1]', () => {
    expect(darken(WHITE, 2)).toEqual(BLACK);
    expect(lighten(BLACK, -1)).toEqual(BLACK);
  });
});

describe('adjustForegroundToTarget', () => {
  it('returns the input when it already passes', () => {
    const fg = BLACK;
    const out = adjustForegroundToTarget(WHITE, fg, WCAG_AA_BODY);
    expect(out).toEqual(BLACK);
  });

  it('darkens a light fg on a light bg until AA passes', () => {
    const out = adjustForegroundToTarget({ r: 245, g: 245, b: 245 }, { r: 200, g: 200, b: 200 }, WCAG_AA_BODY);
    expect(out).not.toBeNull();
    expect(contrastRatio({ r: 245, g: 245, b: 245 }, out!)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
  });

  it('lightens a dark fg on a dark bg until AA passes', () => {
    const out = adjustForegroundToTarget({ r: 30, g: 30, b: 30 }, { r: 60, g: 60, b: 60 }, WCAG_AA_BODY);
    expect(out).not.toBeNull();
    expect(contrastRatio({ r: 30, g: 30, b: 30 }, out!)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
  });

  it('returns null for an unreachable target (>21)', () => {
    expect(adjustForegroundToTarget(WHITE, WHITE, 25)).toBeNull();
  });
});
