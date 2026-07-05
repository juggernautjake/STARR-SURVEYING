// lib/learn/math.ts
//
// Shared KaTeX math rendering for the whole Learn area (AI tutor chat, lesson
// content, FS/SIT study modules, practice problems, articles, the lesson
// builder preview). Everything funnels through here so `$…$` / `$$…$$` (and
// `\(…\)` / `\[…\]`) LaTeX renders as real math instead of raw source.
//
// KaTeX is isomorphic (renderToString runs in node + the browser), so the same
// helpers work in SSR, client render, and unit tests. Callers inject the
// returned HTML via dangerouslySetInnerHTML; KaTeX output is trusted markup
// (we run with trust:false so it can't emit \href/\html escapes).

import katex from 'katex';

/** Render a bare LaTeX string to KaTeX HTML. `displayMode` = centered block. */
export function renderMath(latex: string, displayMode = false): string {
  const tex = (latex ?? '').trim();
  if (!tex) return '';
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false, // render a red error node instead of throwing
      strict: false,       // tolerate the informal LaTeX an LLM tends to emit
      trust: false,        // never honor \href / \htmlClass etc. (XSS safety)
      output: 'html',
    });
  } catch {
    // KaTeX should not throw with throwOnError:false, but never break a render.
    return `<code class="math-fallback">${escapeHtml(tex)}</code>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Find every math span in `text` and hand each (latex, displayMode) to `fn`,
 * substituting the return value. Recognizes, in priority order:
 *   $$ … $$   and   \[ … \]   → display (block)
 *   \( … \)                   → inline
 *   $ … $                     → inline, with a currency guard so "$5" / "$5 and
 *                               $10" are left alone (remark-math style rules:
 *                               no space just inside the delimiters, and a
 *                               closing `$` may not be followed by a digit).
 */
export function replaceMathSpans(
  text: string,
  fn: (latex: string, displayMode: boolean) => string,
): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => fn(tex, true));
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => fn(tex, true));
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => fn(tex, false));
  // Inline $…$. `pre` captures the char before the opening `$` (so we don't need
  // a lookbehind for it and consecutive matches don't overlap); the opening `$`
  // must not be escaped or preceded by another `$`, must not be followed by
  // whitespace; the closing `$` must not be preceded by whitespace nor followed
  // by a digit (currency).
  out = out.replace(
    /(^|[^\\$])\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/g,
    (_m, pre: string, tex: string) => `${pre}${fn(tex, false)}`,
  );
  return out;
}

/**
 * Render any inline/block math inside an HTML (or plain-text) string, leaving
 * the surrounding markup untouched. Use for already-rich content: lesson
 * blocks, article bodies, problem text.
 */
export function renderMathInHtml(html: string): string {
  if (!html || (html.indexOf('$') === -1 && html.indexOf('\\(') === -1 && html.indexOf('\\[') === -1)) {
    return html; // fast path — nothing math-like to do
  }
  return replaceMathSpans(html, (tex, display) => renderMath(tex, display));
}

/**
 * Render a PLAIN-TEXT string (no markdown) that may contain LaTeX math: escape
 * the prose (so it's safe to inject as HTML), render the math. Use for short
 * fields like a practice-problem question or a solution-step formula.
 */
export function renderMathText(text: string): string {
  if (!text) return '';
  const { text: protectedText, restore } = protectMath(text);
  return restore(escapeHtml(protectedText));
}

/**
 * Pull math out of a markdown source BEFORE the markdown transforms run, so
 * markdown can't mangle LaTeX (a `_` subscript becoming italics, a `*` etc.).
 * Returns the text with each math span swapped for an alnum placeholder token
 * (survives every markdown pass — no markdown-special chars, no spaces) plus a
 * `restore` that swaps the rendered KaTeX back into the final HTML.
 */
export function protectMath(src: string): { text: string; restore: (html: string) => string } {
  const rendered: string[] = [];
  const token = (i: number) => `zzmathspanzz${i}zz`;
  const text = replaceMathSpans(src, (tex, display) => {
    const i = rendered.length;
    rendered.push(renderMath(tex, display));
    return token(i);
  });
  const restore = (html: string) =>
    rendered.length === 0
      ? html
      : html.replace(/zzmathspanzz(\d+)zz/g, (_m, i: string) => rendered[Number(i)] ?? '');
  return { text, restore };
}
