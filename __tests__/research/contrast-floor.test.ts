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
import fs from 'node:fs';
import path from 'node:path';
import {
  audit, contrast, parseHex, colourOf, readVars, backgroundFor, requiredRatio, inlinePair, paintsDark,
  auditInline, jsxTags, ancestorSurfaces, styleObjects,
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

describe('G15 — the colour and the surface are almost never on the same element', () => {
  // ── WHAT THIS FOUND ───────────────────────────────────────────────────────────────────────────
  //
  // Everything above measures a `color` against a `background` in the SAME style object. That is
  // not how these screens are built: a card sets the background, its children set the text. So the
  // common shape was unmeasurable, and the fallback — "the page, if the file paints nothing dark" —
  // blinded a whole FILE the moment one card in it was dark.
  //
  // `page.tsx` has dark `#0f172a` cards on two tabs. That one fact skipped every unpaired inline
  // colour in its 3,200 lines, including the Survey Data tab's chain of title:
  //
  //     <table className="review-table">                       ← defined in no stylesheet
  //       <td style={{ color: '#e2e8f0' }}>{link.instrumentNumber}</td>
  //
  // Surface `#fff`, text `#e2e8f0`. **1.23:1** — the date, grantor, grantee and instrument number
  // of every link in the chain of title, white on white.
  //
  // Nineteen findings on the first run, all real. Skipped fell 278 → 120.

  it('parses the tags it needs and ignores the ones it must not', () => {
    const tags = jsxTags("<div a={1}><span /></div>");
    expect(tags.map((t) => `${t.kind}:${t.name}`)).toEqual(['open:div', 'self:span', 'close:div']);
  });

  it('does not read a generic or a comparison as a tag', () => {
    // `useState<'a' | 'b'>` and `{i < 3 && …}` are both in this codebase. A `<` followed by a quote
    // or a space is not a tag; `<Foo>` from a real generic IS indistinguishable and is handled by
    // being harmless rather than by being detected — see the pop-until-match rule.
    expect(jsxTags("useState<'summary' | 'property'>('summary')")).toEqual([]);
    expect(jsxTags('{i < 3 && x}')).toEqual([]);
    expect(jsxTags('<>{x}</>'), 'fragments have no attributes and no background').toEqual([]);
  });

  it('keeps a `>` inside an attribute expression out of the tag name', () => {
    const [tag] = jsxTags('<div onClick={() => go()} className="a">');
    expect(tag.kind).toBe('open');
    expect(tag.name).toBe('div');
    expect(tag.attrs).toContain('className="a"');
  });

  it('finds the enclosing background for a child element', () => {
    const src = "<div style={{ background: '#0f172a' }}><span style={{ color: '#4B5563' }}>x</span></div>";
    const marks = ancestorSurfaces(src);
    const child = marks.find((m) => src.slice(m.at).startsWith("style={{ color: '#4B5563'"));
    expect(child, 'the child style object was not marked').toBeTruthy();
    expect(child!.surface).toEqual(parseHex('#0f172a'));
  });

  it('leaves the outermost element with no surface, so the caller can use the page', () => {
    const src = "<div style={{ color: '#e2e8f0' }}>x</div>";
    expect(ancestorSurfaces(src)[0].surface).toBeUndefined();
  });

  it('does not attribute a SIBLING background to the text beside it', () => {
    // The whole reason the stylesheet half of this checker was wrong four times. A sibling is not
    // an ancestor, and reporting it as one produced twenty false findings in one run.
    const src = "<div><i style={{ background: '#0f172a' }} /><span style={{ color: '#4B5563' }}>x</span></div>";
    const child = ancestorSurfaces(src).find((m) => src.slice(m.at).startsWith("style={{ color:"));
    expect(child!.surface, 'a self-closing sibling painted the text next to it').toBeUndefined();
  });

  it('closes the subtree at the closing tag', () => {
    const src = "<a style={{ background: '#0f172a' }}><b>x</b></a><c style={{ color: '#4B5563' }}>y</c>";
    const after = ancestorSurfaces(src).find((m) => src.slice(m.at).startsWith("style={{ color:"));
    expect(after!.surface, 'the dark card leaked past its own closing tag').toBeUndefined();
  });

  it('skips rather than guesses when an ancestor paints something it cannot read', () => {
    const src = "<div style={{ background: severity.color }}><span style={{ color: '#4B5563' }}>x</span></div>";
    const child = ancestorSurfaces(src).find((m) => src.slice(m.at).startsWith("style={{ color:"));
    expect(child!.surface, 'an unreadable ancestor background must be null, not undefined').toBeNull();
  });

  it('treats a dark Tailwind ancestor as unreadable rather than as the page', () => {
    const src = '<div className="bg-gray-900"><span style={{ color: \'#4B5563\' }}>x</span></div>';
    const child = ancestorSurfaces(src).find((m) => src.slice(m.at).startsWith("style={{ color:"));
    expect(child!.surface).toBeNull();
  });

  it('and a light Tailwind ancestor does not blind it', () => {
    const src = '<div className="bg-white p-4"><span style={{ color: \'#e2e8f0\' }}>x</span></div>';
    const child = ancestorSurfaces(src).find((m) => src.slice(m.at).startsWith("style={{ color:"));
    expect(child!.surface).toBeUndefined();
  });

  it('measures a child against its card, end to end', () => {
    const { findings, checked } = auditInline([{
      rel: 'x.tsx',
      src: "<div style={{ background: '#0f172a' }}><span style={{ color: '#4B5563', fontSize: '0.85rem' }}>x</span></div>",
    }]);
    expect(checked).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0].ratio).toBeCloseTo(2.36, 1);
    expect(findings[0].bgFrom).toBe('the nearest ancestor that paints one');
  });

  it('and the white-on-white case that started this', () => {
    const { findings } = auditInline([{
      rel: 'x.tsx',
      src: '<table className="review-table"><td style={{ color: \'#e2e8f0\' }}>Vol 412</td></table>',
    }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ratio).toBeCloseTo(1.23, 2);
  });

  it('one dark card no longer blinds the rest of the file', () => {
    // This is the regression the whole change is about. Before, `paintsDark` was a FILE-level fact:
    // the dark div below made the white-on-white table beside it unmeasurable.
    const { findings } = auditInline([{
      rel: 'x.tsx',
      src: "<div><i style={{ background: '#0f172a', color: '#e2e8f0' }}>ok</i>"
        + "<td style={{ color: '#e2e8f0' }}>invisible</td></div>",
    }]);
    expect(findings, 'the dark card is still blinding the file').toHaveLength(1);
    expect(findings[0].fg).toBe('#e2e8f0');
  });

  it('but a dark Tailwind class still does, because nothing can resolve it', () => {
    const { findings, skipped } = auditInline([{
      rel: 'x.tsx',
      src: '<div className="bg-gray-900"><span style={{ color: \'#e2e8f0\' }}>x</span></div>',
    }]);
    expect(findings).toEqual([]);
    expect(skipped).toBe(1);
  });
});

describe('the style object matcher brace-matches', () => {
  // `[^{}]*` stopped at the first nested brace, so a style object containing a template literal
  // with `${…}` was invisible ENTIRELY — SurveyPlanPanel's done/not-done checkbox. The finding on
  // it was real but named the wrong surface, and a checker that names the wrong surface gets
  // argued with rather than fixed.

  it('reads through a template literal that contains braces', () => {
    const src = "<div style={{ border: `2px solid ${d ? '#059669' : '#ccc'}`, background: '#059669' }}>";
    const [o] = styleObjects(src);
    expect(o, 'the style object was invisible').toBeTruthy();
    expect(inlinePair(o.body).backgrounds).toEqual([parseHex('#059669')]);
  });

  it('reads through a nested object', () => {
    const [o] = styleObjects("<div style={{ a: { b: 1 }, color: '#111111' }}>");
    expect(inlinePair(o.body).colors).toEqual([parseHex('#111111')]);
  });

  it('reports the offset of `style=`, which is what the ancestor map keys on', () => {
    const src = "  <div style={{ color: '#111111' }}>";
    expect(styleObjects(src)[0].at).toBe(src.indexOf('style={{'));
  });

  it('finds every object in a file, not just the first', () => {
    expect(styleObjects("<a style={{ color: '#111' }} /><b style={{ color: '#222' }} />")).toHaveLength(2);
  });

  it('and drops an unterminated one rather than swallowing the file', () => {
    expect(styleObjects("<div style={{ color: '#111111' ")).toEqual([]);
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

// ── WHAT THE STATIC AUDIT CANNOT SEE, AND WHERE IT WAS NOT LOOKING (U4) ─────────────────────────
//
// Everything above reads stylesheets. The browser sweep reads rendered pages. Both had been green
// for a week, and both were only ever pointed at INDEX routes — `/admin/research`, the eight
// portal tabs. A detail route cannot be reached by typing a path with no id in it, so the route
// list quietly described "the pages that are easy to name" rather than "the pages people use".
//
// The first run against `/admin/research/<projectId>` found two real defects on all four dark
// palettes. Neither is exotic; both had been on screen the whole time.

describe('the two defects the project-scoped sweep found', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('the idle panel takes its BACKGROUND from the theme, not only its text', () => {
    // 1.05:1, measured. The text already read `var(--theme-fg-primary, #1F2937)`; the panel under
    // it was a hard-coded #F9FAFB. On a dark palette --theme-fg-primary is near-white, so
    // "No Active Research" rendered white on white.
    //
    // Half-tokenised is worse than neither. Two literals would have been self-consistent and
    // merely off-palette; tokenising exactly one of the pair is what made the panel invisible.
    // The panel this measured was deleted on 2026-09-02. The DEFECT it pins is not about that file:
    // it is that an idle surface must take its background from the theme, because tokenising the
    // text and hard-coding the ground is what rendered "No Active Research" white on white.
    //
    // In the one-view rebuild the idle state is a tone on the shared status block, so the guarantee
    // is now structural: there is one background declaration, it is themed, and no tone variant
    // overrides it with a literal. That is stronger than the original — it cannot be reintroduced
    // for the idle case alone without failing here.
    const src = read('app/admin/research/components/ResearchRunView.tsx');
    const at = src.indexOf(`.rrv__status {`);
    expect(at, 'the status block is gone').toBeGreaterThan(-1);
    const block = src.slice(at, at + 400);
    expect(block).toContain('background: var(--theme-bg-elevated');

    // And the idle tone must not re-hard-code one.
    const idleAt = src.indexOf(`.rrv__status--idle`);
    if (idleAt > -1) {
      const idleBlock = src.slice(idleAt, src.indexOf(`}`, idleAt));
      expect(idleBlock, 'the idle tone hard-codes a background again').not.toMatch(/background:s*#/);
    }
  });

  it('and the completed-stage green is defined for dark grounds', () => {
    // #047857 was audited once, against white — "5.48:1 on white" — which was true, and silent
    // about which surface. On the dark palettes' ~#111935 page it is 3.15:1, making the labels for
    // the stages a person has ALREADY FINISHED the least readable text on the screen.
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css, 'the light-surface green is still the only definition')
      .toContain('--recon-success: #34D399');
    const at = css.indexOf('--recon-success: #34D399');
    const selector = css.slice(Math.max(0, at - 400), at);
    for (const theme of ['starr-dark', 'slate-dark', 'forest-dark', 'high-contrast-dark']) {
      expect(selector, `${theme} does not get the dark-ground green`).toContain(theme);
    }
  });

  it('control: the light palettes keep the audited hex', () => {
    // Overriding it globally would undo the original 5.48:1 finding rather than complete it.
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('--recon-success: #047857');
  });
});

describe('the sweep can reach a detail route at all', () => {
  it('a :projectId in --routes is expanded from the database', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/check-portal-themes.mjs'), 'utf8');
    expect(src).toContain(':projectId');
    expect(src).toContain('research_projects?select=id');
  });

  it('and an unresolvable id FAILS rather than skipping the route', () => {
    // A silently-skipped route is exactly how this gap lasted: a green run that checked eight of
    // ten pages and said so nowhere.
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/check-portal-themes.mjs'), 'utf8');
    const at = src.indexOf('no research project could be resolved');
    expect(at, 'the unresolvable case is not handled').toBeGreaterThan(-1);
    expect(src.slice(at, at + 120)).toContain('process.exit(2)');
  });
});

// ── TWO TOKEN FAMILIES FOR ONE JOB, AND THE PORTAL USED THE WRONG ONE ───────────────────────────
//
// `themes.css` carries a block dated THEME-STATUS-PAIRS-2026-08-24 whose comment describes this
// exact bug being fixed once already: *"a dark theme repainted the app around a #FFFAEB amber panel
// and left it there: .worker-status--warn measured 1.16:1 on forest-dark."* Its answer is the
// `-surface` / `-text` pair, derived per palette — 12% of the hue over this theme's surface,
// 55% toward this theme's foreground — and it is defined in all twelve palette blocks.
//
// A later slice (C2) then added `--color-*-bg` and `--color-*-border` to `tokens.css`, in ONE
// place, with no palette definitions. Two families for one job, and the newer one is the unthemed
// one. Its own comments in CountyNote.css and primitives.css read *"--color-warning-border did not
// exist until that slice"* — written by somebody who had looked for a token, not found it, and
// created it, without knowing the themed pair was already there under a different name.
//
// The result is half a pair following the theme: `-text` adapts, `-bg` does not. On the four
// dark palettes that is light text on a permanently cream panel. The GIS quality card measured
// **1.31:1** before the swap and 4.55:1 after.
//
// `DesignStudio.css:1436` names it best, having hit it independently a third time:
// *"the ink followed the theme and the paper did not."*

describe('the research portal uses the THEMED half of the status pair', () => {
  const FILES = [
    'app/admin/research/components/CountyNote.css',
    'app/admin/research/components/ScopeNotice.css',
    'app/admin/research/components/ui/primitives.css',
    'app/admin/research/components/VerificationPanel.tsx',
    'app/admin/research/_tabs/PortalWatchPanel.tsx',
    'app/admin/styles/AdminResearch.css',
  ];

  const readFile = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('control: the themed pair really is defined per palette, and the other really is not', () => {
    // Without this the rule below could be enforcing a swap to a token that does not exist, which
    // would render everything as its hex fallback and pass anyway.
    const themes = readFile('app/styles/themes.css');
    const tokens = readFile('app/styles/tokens.css');
    for (const tone of ['success', 'warning', 'error', 'info']) {
      expect(themes.split(`--color-${tone}-surface:`).length - 1,
        `--color-${tone}-surface is not defined per palette`).toBe(12);
      expect(themes, `--color-${tone}-bg has become themed; re-read this rule`)
        .not.toContain(`--color-${tone}-bg:`);
      expect(tokens, `--color-${tone}-bg is gone from tokens.css`).toContain(`--color-${tone}-bg:`);
    }
  });

  for (const f of FILES) {
    it(`${f.split('/').pop()} reads no unthemed status background`, () => {
      const src = readFile(f);
      // Comments are stripped: several of these files EXPLAIN the old tokens by name, and a scan
      // that matched prose would report a file that had been fixed. Fifteenth instance.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      const bad = [...code.matchAll(/var\(--color-(success|warning|error|info)-(bg|border)/g)]
        .map((m) => m[0]);
      expect(bad, `${f} paints a themed foreground on a fixed light panel`).toEqual([]);
    });
  }

  it('control: the scan can fail', () => {
    const sample = 'background: var(--color-warning-bg, #FFFBEB);';
    expect([...sample.matchAll(/var\(--color-(success|warning|error|info)-(bg|border)/g)]).toHaveLength(1);
  });

  it('and the border is derived from the token that IS themed', () => {
    // The pattern app/admin/components/PageOffGate.css already uses. A fixed #FDE68A border around
    // a dark panel is the same defect one layer out.
    const css = readFile('app/admin/styles/AdminResearch.css');
    expect(css).toContain('color-mix(in srgb, var(--color-warning-text) 25%, transparent)');
  });
});

describe('a mix is not its first ingredient', () => {
  it('color-mix() is skipped, not misread as its first variable', () => {
    // `color-mix(in srgb, var(--theme-warning) 38%, var(--theme-fg-primary))` resolved to #f59e0b,
    // because the var() match is not anchored and found the first variable in the string. The
    // auditor then measured pure amber on white and reported 2.15:1 for a rule the BROWSER sweep
    // measures at 4.55:1 on its worst palette. A confident false finding.
    const vars = new Map([['--theme-warning', [245, 158, 11]], ['--theme-fg-primary', [17, 24, 39]]]);
    expect(colourOf('color-mix(in srgb, var(--theme-warning) 38%, var(--theme-fg-primary))', vars))
      .toBeNull();
  });

  it('control: an ordinary var() still resolves, so the skip is narrow', () => {
    // If the guard were too broad it would silently stop auditing everything, and this file's
    // "skips less than 40% of pairs" ratchet is the second line of defence for that.
    const vars = new Map([['--theme-warning', [245, 158, 11]]]);
    expect(colourOf('var(--theme-warning)', vars)).toEqual([245, 158, 11]);
    expect(colourOf('#B54708', vars)).toEqual([181, 71, 8]);
  });
});
