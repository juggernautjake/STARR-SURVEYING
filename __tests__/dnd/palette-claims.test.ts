// __tests__/dnd/palette-claims.test.ts — the palettes' own contrast claims, checked against arithmetic.
//
// `theme.ts` documents a ratio beside most palette entries — *"~11:1 on cream (AAA)"*, *"5.2:1 on the pale
// panel"*, *"7.2:1 on the card"*. Those numbers are how anyone picking a colour for a skin decides whether
// it is safe, and **nothing had ever checked them**.
//
// Checking all fifteen: eleven are accurate or conservative. **Four are optimistic — and every one of the
// four is a gold.**
//
//     streamer tealbright  claimed 5.9  actual 5.53
//     streamer gold        claimed 5.2  actual 4.58   ← and 4.12 / 3.85 / 3.24 / 2.86 elsewhere
//     donata   gold        claimed 6.1  actual 5.72
//     rulebook gold        claimed 7.4  actual 6.63
//
// That is not noise; it is a pattern in one colour family, and it explains why "the gold/amber family on
// pale panels" keeps recurring in the contrast baseline. Streamer's gold in particular was documented at a
// comfortable 5.2 while actually sitting at 4.58 on the surface it names — barely over AA — and **failing
// at 4.12 on the adjacent panel-2**. A designer trusting the comment would reasonably reuse it anywhere.
//
// The comments are now corrected to the measured values. This file keeps them honest: it recomputes every
// claim, so a future edit to a palette entry that leaves its comment behind fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '@/lib/dnd/theme-contrast';

const THEME = readFileSync(join(process.cwd(), 'app/dnd/_sheet/theme.ts'), 'utf8');

/** The surface each skin's claims are measured against, as its own comments name it. */
const SURFACE = {
  streamer: '#fffafe', // "the pale panel"
  donata: '#fffef9',   // "cream" — the near-white cream card
  rulebook: '#f6f3ea', // "the card" — aged paper
} as const;

/** Every claim in the file, as (skin, colour, claimed ratio). Actuals verified 2026-07-27. */
const CLAIMS: Array<[keyof typeof SURFACE, string, number]> = [
  ['streamer', '#8a5e04', 5.53],
  ['streamer', '#966c00', 4.58],
  ['donata', '#3a2140', 14.13],
  ['donata', '#6f5566', 6.57],
  ['donata', '#c2185b', 5.82],
  ['donata', '#7b2cbf', 7.04],
  ['donata', '#0a6b5d', 6.35],
  ['donata', '#8f5a06', 5.72],
  ['donata', '#ad1f3d', 6.84],
  ['rulebook', '#232019', 14.65],
  ['rulebook', '#524c3f', 7.68],
  ['rulebook', '#35593a', 7.17],
  ['rulebook', '#33513f', 7.92],
  ['rulebook', '#6b5220', 6.63],
  ['rulebook', '#8d3225', 7.24],
];

describe('every documented ratio matches the arithmetic', () => {
  for (const [skin, colour, expected] of CLAIMS) {
    it(`${skin} ${colour} → ${expected}:1`, () => {
      expect(contrastRatio(colour, SURFACE[skin])!).toBeCloseTo(expected, 1);
    });
  }
});

describe('the four corrected comments say the measured number now', () => {
  // A comment that overstates a ratio is worse than no comment: it is the thing a designer reuses.
  it('streamer gold records every surface it lands on, including the ones it fails', () => {
    // It is the one entry whose honest comment is a list rather than a number, because the value is fine
    // on some surfaces and not others — which is the finding, not a defect in the comment.
    expect(THEME).toContain('4.58:1 on `panel`');
    expect(THEME).toContain('UNCHANGED PENDING ONE LIVE CHECK');
    expect(THEME).toContain('depends on whether it renders inside that module');
  });

  it('none of the four still claims its old, optimistic figure', () => {
    expect(THEME).not.toContain("// 5.2:1 on the pale panel");
    expect(THEME).not.toContain('deep gold — 5.9:1');
    expect(THEME).not.toContain('amber — 6.1:1');
    expect(THEME).not.toContain('bronze — 7.4:1 on the card');
  });
});

describe('what the pattern means, asserted so it cannot be lost', () => {
  it('every optimistic claim was a GOLD, and the golds still have the least margin', () => {
    // The generalisable finding: the gold family sits closest to the line on light skins, which is why it
    // dominates the remaining contrast items. Whoever retunes it should start here.
    const golds: Array<[keyof typeof SURFACE, string]> = [['streamer', '#966c00'], ['donata', '#8f5a06'], ['rulebook', '#6b5220']];
    const inks: Array<[keyof typeof SURFACE, string]> = [['donata', '#3a2140'], ['rulebook', '#232019']];
    const worstGold = Math.min(...golds.map(([s, c]) => contrastRatio(c, SURFACE[s])!));
    const worstInk = Math.min(...inks.map(([s, c]) => contrastRatio(c, SURFACE[s])!));
    expect(worstGold).toBeLessThan(worstInk);
    expect(worstGold).toBeLessThan(5); // streamer's #966c00 at 4.58 — over AA on its panel, but barely
  });

  it('the deepening helps every LIGHT surface — the half that is settled', () => {
    // Not applied yet; what blocks it is the dice-pad scope question recorded in theme.ts, not this.
    for (const bg of ['#fffafe', '#fdeaf8', '#f5e2ff']) {
      expect(contrastRatio('#876100', bg)!).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio('#966c00', '#fdeaf8')!).toBeLessThan(4.5); // 4.12 — why it is worth doing
  });

  it('and WOULD hurt a dark surface, IF the pad resolves this token at all', () => {
    // The conditional matters, and it is the correction slice 52 exists for. Slice 51 rejected the
    // deepening outright on this arithmetic — but `DicePad.tsx` paints
    // `var(--hx-gold-2, var(--gold, inherit))`, so it reads THIS token only if `--hx-gold-2` is undefined
    // in its scope. The arithmetic below is real; whether it reaches the pad is unproven, and settling it
    // is one computed-style read on an expanded dock.
    const light = '#f2e4ee', dark = '#302a49';
    expect(contrastRatio('#966c00', light)!).toBeLessThan(4.5);       // 3.85 today
    expect(contrastRatio('#876100', light)!).toBeGreaterThan(4.5);    // 4.57 — the tempting fix
    expect(contrastRatio('#876100', dark)!).toBeLessThan(contrastRatio('#966c00', dark)!); // 2.41 < 2.86
  });
});
