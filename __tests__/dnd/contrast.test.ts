// __tests__/dnd/contrast.test.ts — the maths behind the skin sweep, including the bug it once had.
//
// These exercise `lib/dnd/theme-contrast.ts`, which already owned WCAG contrast for the THEME audit. The
// sweep needed two things it lacked — flattening a STACK of translucent layers (it composited only one),
// and the per-SIZE AA threshold — so those were added there rather than in a second contrast module. A
// rival implementation of the same maths is how two answers to one question start drifting apart.
import { describe, it, expect } from 'vitest';
import {
  parseColor as parseCssColor, composite as compositeOver, flattenStack as flattenBackground,
  relativeLuminance, contrastRatio as ratioOf, aaThresholdForSize as aaThreshold, passesAAForSize as passesAA,
} from '@/lib/dnd/theme-contrast';

const OPAQUE = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });
/** The real `contrastRatio` takes CSS strings (its audit callers hold tokens, not parsed colours), so the
 *  tests go in through that door rather than a private one. */
const css = (c: { r: number; g: number; b: number }) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
const contrastRatio = (fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }) =>
  ratioOf(css(fg), css(bg)) as number;

describe('parsing', () => {
  it('reads rgb and rgba, defaulting alpha to 1', () => {
    expect(parseCssColor('rgb(1, 10, 19)')).toEqual({ r: 1, g: 10, b: 19, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0.08)')).toEqual({ r: 0, g: 0, b: 0, a: 0.08 });
  });
  it('reads hex too — the theme audit holds tokens, not computed styles', () => {
    expect(parseCssColor('#f0e6d2')).toEqual({ r: 240, g: 230, b: 210, a: 1 });
    expect(parseCssColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });
  it('returns null for anything it cannot read, rather than a wrong colour', () => {
    // Strings only — the signature is `(css: string)` and callers hold either a token or a computed
    // style, both of which are strings. Not asserting null/undefined here: that would be inventing a
    // contract the function does not claim, and "hardening" it would be a change made for a test's sake.
    for (const v of ['', 'transparent', 'none', '#12', 'rgb(1,2)']) expect(parseCssColor(v)).toBeNull();
  });
});

describe('the compositing bug this module exists to prevent', () => {
  // Slice 19's first pass read `rgba(0,0,0,0.08)` as pure black and scored purple-on-pink at 1.62:1,
  // flagging 42 healthy samples. The alpha is the whole story.
  const pinkPage = OPAQUE(255, 240, 250);
  const veil = { r: 0, g: 0, b: 0, a: 0.08 };
  const purpleText = OPAQUE(90, 16, 80);

  it('an 8%-black veil over a pink page is still light, not black', () => {
    const flat = flattenBackground([veil], pinkPage);
    expect(Math.round(flat.r)).toBe(235);
    expect(relativeLuminance(flat)).toBeGreaterThan(0.6);
  });

  it('and the text therefore PASSES, where the naive reading failed it', () => {
    const naive = contrastRatio(purpleText, OPAQUE(0, 0, 0));          // what the buggy version compared against
    const correct = contrastRatio(purpleText, flattenBackground([veil], pinkPage));
    expect(naive).toBeLessThan(2);            // the false alarm
    expect(correct).toBeGreaterThan(4.5);     // the truth
  });
});

describe('flattening a stack', () => {
  const base = OPAQUE(255, 255, 255);
  it('stops at the first opaque layer — nothing behind it is visible', () => {
    const flat = flattenBackground([{ r: 0, g: 0, b: 0, a: 0.5 }, OPAQUE(255, 0, 0), OPAQUE(0, 255, 0)], base);
    expect(Math.round(flat.r)).toBe(128);   // 50% black over red
    expect(Math.round(flat.g)).toBe(0);     // the green never shows
  });
  it('ignores fully transparent layers', () => {
    expect(flattenBackground([{ r: 9, g: 9, b: 9, a: 0 }], base)).toEqual({ ...base, a: 1 });
  });
  it('falls back to the page base when every layer is transparent', () => {
    expect(flattenBackground([], base)).toEqual({ ...base, a: 1 });
  });
  it('composites nearest-first, so layer order matters', () => {
    // Deliberately asymmetric alpha. At a/1-a of 0.5 the operation is symmetric — 50% red over blue and
    // 50% blue over red both land on (128, 0, 128) — so a half-and-half example proves nothing. The first
    // draft of this test used one and failed for exactly that reason.
    const near = flattenBackground([{ r: 255, g: 0, b: 0, a: 0.8 }, OPAQUE(0, 0, 255)], base);
    const far  = flattenBackground([{ r: 0, g: 0, b: 255, a: 0.8 }, OPAQUE(255, 0, 0)], base);
    expect(Math.round(near.r)).toBe(204);   // mostly the near red
    expect(Math.round(far.r)).toBe(51);     // mostly the near blue, letting a little red through
  });
});

describe('ratio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio(OPAQUE(0, 0, 0), OPAQUE(255, 255, 255))).toBe(21);
    expect(contrastRatio(OPAQUE(50, 60, 70), OPAQUE(50, 60, 70))).toBe(1);
  });
  it('is symmetric — which colour is the text does not change the ratio', () => {
    const a = OPAQUE(15, 20, 25), b = OPAQUE(240, 230, 210);
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });
  it('reproduces the two real measurements from the sweep', () => {
    // The invisible `.btn` (slice 18) and what it became.
    expect(contrastRatio(OPAQUE(15, 20, 25), OPAQUE(1, 10, 19))).toBeCloseTo(1.08, 1);
    expect(contrastRatio(OPAQUE(240, 230, 210), OPAQUE(1, 10, 19))).toBeGreaterThan(15);
  });
});

describe('the AA threshold depends on size', () => {
  it('asks 4.5 of body text and 3 of large text', () => {
    expect(aaThreshold(11)).toBe(4.5);
    expect(aaThreshold(23)).toBe(4.5);        // 23px regular is NOT large
    expect(aaThreshold(24)).toBe(3);
    expect(aaThreshold(19, true)).toBe(3);    // bold lowers the bar to 18.66px
  });
  it('judges the sweep’s two borderline cases correctly', () => {
    expect(passesAA(2.83, 11)).toBe(false);   // the roller tab label — a real defect
    expect(passesAA(3.85, 23)).toBe(false);   // 23px is not large; 3.85 does not clear 4.5
    expect(passesAA(3.85, 24)).toBe(true);    // …one pixel bigger and it would
  });
});
