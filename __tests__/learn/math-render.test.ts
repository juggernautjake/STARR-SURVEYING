// __tests__/learn/math-render.test.ts
//
// KaTeX math rendering for the Learn area (tutor chat + lesson/module/article
// content). Covers the delimiter matching, the currency guard, the
// protect/restore round-trip, and the study-markdown pipeline (tables +
// headings + math + XSS-escaping).

import { describe, it, expect } from 'vitest';
import { renderMath, renderMathInHtml, replaceMathSpans, protectMath } from '@/lib/learn/math';
import { renderStudyMarkdown } from '@/lib/learn/study-markdown';

const hasKatex = (s: string) => /class="katex/.test(s);

describe('renderMath', () => {
  it('renders LaTeX to KaTeX HTML', () => {
    expect(hasKatex(renderMath('\\frac{a}{b}'))).toBe(true);
  });
  it('display mode produces a katex-display block', () => {
    expect(renderMath('\\bar{x}', true)).toMatch(/katex-display/);
  });
  it('empty input → empty string', () => {
    expect(renderMath('')).toBe('');
    expect(renderMath('   ')).toBe('');
  });
  it('does not throw on malformed LaTeX (throwOnError:false)', () => {
    expect(() => renderMath('\\frac{a}{')).not.toThrow();
  });
});

describe('replaceMathSpans — delimiters', () => {
  it('matches $$…$$ as display', () => {
    const seen: Array<[string, boolean]> = [];
    replaceMathSpans('a $$x^2$$ b', (tex, d) => { seen.push([tex.trim(), d]); return 'M'; });
    expect(seen).toEqual([['x^2', true]]);
  });
  it('matches \\[…\\] display and \\(…\\) inline', () => {
    const seen: Array<[string, boolean]> = [];
    replaceMathSpans('\\[a\\] and \\(b\\)', (tex, d) => { seen.push([tex.trim(), d]); return 'M'; });
    expect(seen).toEqual([['a', true], ['b', false]]);
  });
  it('matches inline $…$', () => {
    const seen: string[] = [];
    replaceMathSpans('the mean $\\bar{x}$ here', (tex) => { seen.push(tex); return 'M'; });
    expect(seen).toEqual(['\\bar{x}']);
  });
});

describe('renderMathInHtml — currency guard + passthrough', () => {
  it('renders inline + block math', () => {
    const out = renderMathInHtml('mean $\\bar{x}$ and $$\\frac{\\sum x_i}{n}$$');
    expect(hasKatex(out)).toBe(true);
    expect(out).not.toContain('$'); // both spans consumed
  });
  it('leaves currency alone', () => {
    const out = renderMathInHtml('It costs $5 and $10 total');
    expect(out).toBe('It costs $5 and $10 total');
    expect(hasKatex(out)).toBe(false);
  });
  it('fast-path returns identical string when no math markers', () => {
    const s = 'plain text, no math';
    expect(renderMathInHtml(s)).toBe(s);
  });
  it('leaves surrounding HTML untouched', () => {
    const out = renderMathInHtml('<p>hi <b>x</b> $x^2$</p>');
    expect(out).toContain('<p>hi <b>x</b> ');
    expect(out).toContain('</p>');
    expect(hasKatex(out)).toBe(true);
  });
});

describe('protectMath — round-trip', () => {
  it('placeholder survives an intervening markdown-ish transform, then restores KaTeX', () => {
    const { text, restore } = protectMath('area $A = \\pi r^2$ done');
    expect(text).not.toContain('$');
    // Simulate markdown mangling: underscores→italics, asterisks, newlines.
    const mangled = text.replace(/_/g, '<em>').replace(/\n/g, '<br/>');
    expect(mangled).toBe(text); // token has no _, no newline → untouched
    expect(hasKatex(restore(mangled))).toBe(true);
  });
  it('no math → restore is a no-op', () => {
    const { text, restore } = protectMath('nothing here');
    expect(restore(text)).toBe('nothing here');
  });
});

describe('renderStudyMarkdown — the tutor pipeline', () => {
  it('renders a GFM pipe table as a real <table>', () => {
    const md = '| Type | Symbol |\n|------|--------|\n| Systematic | δ |';
    const out = renderStudyMarkdown(md);
    expect(out).toContain('<table');
    expect(out).toContain('<th>Type</th>');
    expect(out).toContain('<td>Systematic</td>');
    expect(out).not.toContain('| Type |');
  });
  it('renders block + inline math instead of raw $$', () => {
    const out = renderStudyMarkdown('The mean is $$\\bar{x} = \\frac{\\sum x_i}{n}$$ where $n$ is the count.');
    expect(hasKatex(out)).toBe(true);
    expect(out).not.toContain('$$');
    expect(out).not.toContain('\\bar');
  });
  it('renders ### headings, **bold**, and bullet lists', () => {
    const out = renderStudyMarkdown('### Types of Errors\n\n**Systematic** bias\n\n- one\n- two');
    expect(out).toContain('<h4>Types of Errors</h4>');
    expect(out).toContain('<strong>Systematic</strong>');
    expect(out).toContain('<ul><li>one</li><li>two</li></ul>');
  });
  it('escapes raw HTML (XSS-safe) even though it emits an HTML string', () => {
    const out = renderStudyMarkdown('hello <img src=x onerror=alert(1)> world');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
  it('empty input → empty string', () => {
    expect(renderStudyMarkdown('')).toBe('');
  });
});
