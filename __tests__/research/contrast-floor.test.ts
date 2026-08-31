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
  audit, contrast, parseHex, colourOf, readVars, backgroundFor, requiredRatio, inlinePair, paintsDark,
  auditInline,
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

describe('inline JSX styles — the blind spot the first pass left', () => {
  // F2 measured the stylesheets and reported clean while the portal carried 131 inline
  // `style={{ color: … }}` declarations that no stylesheet contains. One of them sat in the Review
  // tab's own empty state at 2.56:1.
  //
  // A first sweep assumed white behind every one and produced 64 findings, 61 of them wrong:
  // `style={{ background: '#059669', color: '#fff' }}` is a green button with white text and
  // reported at 1:1. What is measured now is a real pair, or the page when the file paints nothing
  // dark anywhere — and nothing else.

  it('measures a pair declared in the same object', () => {
    const got = inlinePair("background: '#FEF2F2', color: '#DC2626'");
    expect(got.color).toEqual(parseHex('#DC2626'));
    expect(got.background).toEqual(parseHex('#FEF2F2'));
  });

  it('reports a background it cannot resolve as DECLARED, not as absent', () => {
    // `background: severity.color` is a coloured pill. Treating it as the page reported white text
    // on it at 1:1 in two components.
    const got = inlinePair("background: severity.color, color: '#fff'");
    expect(got.background).toBeNull();
    expect(got.declaresBackground, 'a declared background must not fall through to the page').toBe(true);
  });

  it('knows when a file paints something dark', () => {
    expect(paintsDark("<div className='bg-gray-900'>")).toBe(true);
    expect(paintsDark("<div style={{ background: '#0F172A' }}>")).toBe(true);
    expect(paintsDark("<div className='bg-white' style={{ color: '#111' }}>")).toBe(false);
  });

  it('and does not read its own prose as paint', () => {
    // Control for the stripper: this repository has had eight guards match their own comments.
    expect(paintsDark('// this file used to use bg-gray-900 everywhere\nconst x = 1;')).toBe(false);
  });
});

describe('a ternary is two colours, and only one of them used to be measured', () => {
  // ── HOW THIS WAS FOUND ────────────────────────────────────────────────────────────────────────
  //
  // Not by this script. By the coherence extraction's own colour test, which noticed `#059669`
  // still sitting in `page.tsx` after the panel had retired it — on the Run Verification button:
  //
  //     style={{ background: isVerifying ? '#6B7280' : '#059669', color: '#fff', … }}
  //
  // White on `#059669` is 3.77:1 at 0.82rem. It rendered that way for the button's whole life, and
  // the pass that reported "no contrast failures" across 799 pairs never measured it — `background`
  // was PRESENT, so `declaresBackground` was true and the pair was counted as *skipped*.
  //
  // The conservative rule was right and stays: an unresolvable background must never be assumed to
  // be the page. It was simply too coarse. A ternary between two literals is not unresolvable — it
  // is two known answers, and the honest reading is the worse of them. Widening it found three more
  // real failures on the first run, including monument condition text at **2.15:1**.

  it('reads BOTH branches of a ternary background', () => {
    const got = inlinePair("background: busy ? '#6B7280' : '#047857', color: '#fff'");
    expect(got.backgrounds).toEqual([parseHex('#6B7280'), parseHex('#047857')]);
  });

  it('reads both branches of a ternary colour too', () => {
    const got = inlinePair("color: ok ? '#047857' : '#B45309'");
    expect(got.colors).toEqual([parseHex('#047857'), parseHex('#B45309')]);
  });

  it('keeps the single-literal case exactly as it was', () => {
    // The overwhelming majority of style objects. If this moves, the widening changed the meaning
    // of every existing measurement rather than adding to it.
    const got = inlinePair("background: '#FEF2F2', color: '#DC2626'");
    expect(got.color).toEqual(parseHex('#DC2626'));
    expect(got.background).toEqual(parseHex('#FEF2F2'));
    expect(got.colors).toHaveLength(1);
    expect(got.backgrounds).toHaveLength(1);
  });

  it('still refuses to resolve a background that is genuinely unknowable', () => {
    // The 61 false findings came from guessing here. A ternary is known; `severity.color` is not,
    // and widening must not have quietly turned one into the other.
    const got = inlinePair("background: severity.color, color: '#fff'");
    expect(got.backgrounds).toEqual([]);
    expect(got.declaresBackground).toBe(true);
  });

  it('and a ternary between two NON-literals stays unresolvable', () => {
    const got = inlinePair('background: busy ? theme.grey : theme.green, color: "#fff"');
    expect(got.backgrounds).toEqual([]);
    expect(got.declaresBackground).toBe(true);
  });

  it('does not run past the value it is reading', () => {
    // `valueSourceOf` stops at the comma that ends the value. Without that, `color: '#111'` followed
    // by `borderColor: '#fff'` would report two colours for one key and measure a border as text.
    const got = inlinePair("color: '#111111', border: '1px solid #FFFFFF', fontSize: '1rem'");
    expect(got.colors).toEqual([parseHex('#111111')]);
  });

  it('is not fooled by a comma inside a quoted value', () => {
    const got = inlinePair("background: 'rgba(0, 0, 0, 0.4)', color: '#FFFFFF'");
    expect(got.colors).toEqual([parseHex('#FFFFFF')]);
  });

  it('resolves an unquoted var() background, which has no string literal at all', () => {
    const got = inlinePair('background: var(--nope, #FFFFFF), color: "#767676"');
    expect(got.backgrounds).toEqual([parseHex('#FFFFFF')]);
  });

  it('reports the WORST branch, not the first', () => {
    // The button above passes disabled (`#6B7280`, 4.83:1) and fails enabled. Taking the first
    // branch would have reported it clean, which is the same bug in a new place.
    const { findings } = auditInline([{
      rel: 'x.tsx',
      src: "<button style={{ background: busy ? '#6B7280' : '#059669', color: '#fff', fontSize: '0.82rem' }} />",
    }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ratio).toBeCloseTo(3.77, 1);
    expect(findings[0].bg).toBe('#059669');
    expect(findings[0].bgFrom).toContain('worst of 2 branches');
  });

  it('reports ONE finding per style object, not one per branch', () => {
    // A button that fails in both states is one thing to fix. Two findings on one line reads as two
    // problems and gets one of them closed as a duplicate.
    const { findings } = auditInline([{
      rel: 'x.tsx',
      src: "<b style={{ background: a ? '#FFFFFF' : '#F9FAFB', color: '#D97706', fontSize: '0.8rem' }} />",
    }]);
    expect(findings).toHaveLength(1);
  });

  it('and the widened path can still report a pass', () => {
    // Control: a check that fails everything is as useless as one that passes everything.
    const { findings, checked } = auditInline([{
      rel: 'x.tsx',
      src: "<b style={{ background: a ? '#FFFFFF' : '#F9FAFB', color: '#B45309', fontSize: '0.8rem' }} />",
    }]);
    expect(checked).toBe(1);
    expect(findings).toEqual([]);
  });

  it('sees a dark branch when deciding whether a file paints dark', () => {
    expect(paintsDark("<div style={{ background: dark ? '#0F172A' : '#FFFFFF' }} />")).toBe(true);
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
    // The other half of the control. Skipping is honest — an unresolvable background must not be
    // guessed — but skipping everything is not a pass.
    //
    // The threshold is 0.4, not the 0.25 it started at, and the reason is worth stating rather than
    // quietly raising: adding inline-style scanning brought in ~130 more colours, most of which have
    // no paired background, so the skip rate moved from 12% to 25% BY DESIGN. 0.4 still catches the
    // failure this guards against — a parser change that makes everything unresolvable — while
    // leaving room for the inline half. If it ever creeps toward 0.4 for real, that is a signal the
    // resolution rules have stopped working, not a number to raise again.
    const ratio = result.skipped / (result.checked + result.skipped);
    expect(ratio, `skipping ${(ratio * 100).toFixed(0)}% of colour pairs`).toBeLessThan(0.4);
  });

  it('has no failures', () => {
    const lines = result.findings.map(
      (f: { ratio: number; need: number; selector: string; fg: string; bg: string; file: string; line: number }) =>
        `  ${f.ratio}:1 (need ${f.need}) ${f.selector} — ${f.fg} on ${f.bg}  ${f.file}:${f.line}`,
    );
    expect(result.findings, `contrast failures:\n${lines.join('\n')}`).toEqual([]);
  });
});
