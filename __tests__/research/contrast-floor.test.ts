// __tests__/research/contrast-floor.test.ts — F2.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────────
//
// `scripts/check-portal-themes.mjs` is the real instrument: eleven palettes across twenty-five
// routes, rendered in a browser, measuring what a reader sees. It needs a running server, and it
// reported 232 problems repo-wide — a programme, not a slice.
//
// This is the half that runs with no server. It measures the DEFAULT theme only, from the
// stylesheet, and it cannot see cascade, inheritance across components, or what a themed token
// resolves to in the other ten palettes. **A clean run here does not mean the browser check is
// clean.** It is a floor.
//
// ── THE AUDITOR WAS WRONG FOUR TIMES BEFORE IT WAS RIGHT ────────────────────────────────────────
//
// Worth recording, because each wrong version produced a confident list of findings:
//
//   1. **Siblings read as ancestors.** "The longest selector in the same BEM block that declares a
//      background" is almost always a sibling — it measured `.research-page__title` against a blue
//      chip elsewhere on the page. Twenty of the first twenty-two findings were that artefact.
//   2. **An unresolvable background read as white.** `background: var(--recon-brand)` has no hex
//      fallback, so fifteen perfectly legible buttons reported white-on-white at 1:1.
//   3. **A defined token read as its fallback.** `color: var(--theme-fg-muted, #9CA3AF)` appears 45
//      times; the token is declared on bare `:root`, so the fallback never renders. Measuring it
//      produced 58 false failures — a fifth of the run.
//   4. **"First definition wins" across a themed sheet.** `themes.css` declares every token once per
//      palette, so the first match came from a DARK block and the checker reported white-on-white
//      headings throughout the portal.
//
// 158 findings became 28 once it was right. All 28 were real and are fixed.

import { describe, it, expect } from 'vitest';
import {
  audit, contrast, parseHex, colourOf, readVars, backgroundFor, requiredRatio,
} from '../../scripts/audit-research-contrast.mjs';

describe('the contrast maths', () => {
  it('matches the WCAG reference values', () => {
    // Black on white is exactly 21:1, and a colour against itself is exactly 1:1. If these move,
    // every number this file reports is wrong.
    expect(contrast(parseHex('#000000')!, parseHex('#ffffff')!)).toBeCloseTo(21, 5);
    expect(contrast(parseHex('#777777')!, parseHex('#ffffff')!)).toBeCloseTo(4.48, 2);
    expect(contrast(parseHex('#ffffff')!, parseHex('#ffffff')!)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    const a = parseHex('#1D3095')!;
    const b = parseHex('#F8FAFC')!;
    expect(contrast(a, b)).toBeCloseTo(contrast(b, a), 10);
  });

  it('knows large text clears at 3:1 and body text at 4.5:1', () => {
    expect(requiredRatio('font-size: 1.5rem; font-weight: 700;')).toBe(3);
    expect(requiredRatio('font-size: 1.25rem; font-weight: 700;')).toBe(3);
    expect(requiredRatio('font-size: 0.8125rem;')).toBe(4.5);
    expect(requiredRatio('font-size: 1.25rem;')).toBe(4.5);   // large but not bold
    expect(requiredRatio('')).toBe(4.5);                       // unknown size — assume body
  });
});

describe('token resolution — the part that was wrong twice', () => {
  it('prefers a DEFINED token over its fallback', () => {
    const vars = readVars(':root { --tok: #606F86; }');
    expect(colourOf('var(--tok, #9CA3AF)', vars)).toEqual(parseHex('#606F86'));
  });

  it('falls back only when the token is defined nowhere', () => {
    expect(colourOf('var(--absent, #9CA3AF)', new Map())).toEqual(parseHex('#9CA3AF'));
  });

  it('returns unknown for a token with neither a definition nor a fallback', () => {
    // This is what makes `background: var(--recon-brand)` a SKIP rather than a white background.
    expect(colourOf('var(--absent)', new Map())).toBeNull();
  });

  it('reads only the default theme, never a [data-theme] block', () => {
    // `themes.css` declares each token once per palette. Taking the first match pulled `#FFFFFF`
    // out of a dark block and reported white-on-white headings across the portal.
    const css = ':root { --fg: #0F172A; }\n[data-theme="dark"] { --fg: #FFFFFF; }';
    expect(readVars(css).get('--fg')).toEqual(parseHex('#0F172A'));
    expect(readVars(css).size).toBe(1);
  });
});

describe('background resolution — the part that was wrong twice more', () => {
  const rules = [
    { selector: '.blk', background: parseHex('#ffffff'), declaresBackground: true, color: null },
    { selector: '.blk__chip--on', background: parseHex('#2563eb'), declaresBackground: true, color: null },
    { selector: '.blk__title', background: null, declaresBackground: false, color: parseHex('#111827') },
    { selector: '.blk__btn', background: null, declaresBackground: true, color: parseHex('#ffffff') },
    { selector: '.blk__cta', background: parseHex('#1e3a8a'), declaresBackground: true, color: null },
    { selector: '.blk__cta:hover', background: null, declaresBackground: false, color: parseHex('#ffffff') },
  ];

  it('does NOT treat a sibling element as an ancestor', () => {
    // The first version measured a heading against a blue chip elsewhere on the page.
    const got = backgroundFor(rules[2], rules);
    expect(got).not.toBeNull();
    expect(got!.bg).toEqual(parseHex('#ffffff'));
  });

  it('skips a rule whose declared background cannot be resolved', () => {
    // Not white. Guessing white here reported fifteen legible buttons at 1:1.
    expect(backgroundFor(rules[3], rules)).toBeNull();
  });

  it('gives a :hover rule the background its BASE rule painted', () => {
    const got = backgroundFor(rules[5], rules);
    expect(got).not.toBeNull();
    expect(got!.bg).toEqual(parseHex('#1e3a8a'));
  });
});

describe('the research stylesheets clear WCAG AA on the default theme', () => {
  const result = audit();

  it('checks a substantial number of pairs', () => {
    // Control. A parser that stops matching reports zero pairs and zero failures, and zero failures
    // is what this file exists to assert — the check would pass by measuring nothing.
    expect(result.checked, `only ${result.checked} colour pairs were measured`).toBeGreaterThan(500);
  });

  it('and does not skip most of them', () => {
    // The other half of the control. Skipping is honest, but skipping everything is not a pass.
    expect(result.skipped / (result.checked + result.skipped)).toBeLessThan(0.25);
  });

  it('has no failures', () => {
    const lines = result.findings.map(
      (f: { ratio: number; need: number; selector: string; fg: string; bg: string; file: string; line: number }) =>
        `  ${f.ratio}:1 (need ${f.need}) ${f.selector} — ${f.fg} on ${f.bg}  ${f.file}:${f.line}`,
    );
    expect(result.findings, `contrast failures:\n${lines.join('\n')}`).toEqual([]);
  });
});
