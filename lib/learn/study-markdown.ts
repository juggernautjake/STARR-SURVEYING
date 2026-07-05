// lib/learn/study-markdown.ts
//
// Markdown → safe HTML for AI-generated study text (the "deeper learning"
// tutor). LLM replies use headings, bold/italic/code, bullet + numbered
// lists, GitHub-flavored pipe tables, blockquotes, and LaTeX math. The old
// tutor renderer only did bold/code/bullets, so tables rendered as raw pipes
// and equations as raw `$$…$$`.
//
// Pipeline: protect math (so markdown can't mangle LaTeX) → HTML-escape the
// rest (model output is untrusted) → markdown transforms → restore rendered
// KaTeX. Escaping first is what keeps this XSS-safe even though the result is
// injected via dangerouslySetInnerHTML.

import { protectMath } from './math';
import { figureLetter } from './speakable';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const splitCells = (row: string): string[] =>
  row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim());
const isSepRow = (l: string): boolean => l.includes('|') && /-/.test(l) && /^[\s|:-]+$/.test(l);

// Inline transforms reused inside table cells + prose (input already escaped).
function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
}

// A caption line the tutor emits after a table, e.g. "*Figure: what it shows*".
// Kept in sync with lib/learn/speakable.ts so the on-screen badge and the spoken
// reference use the same caption.
const CAPTION_RE =
  /^\s*(?:[>*_]+\s*)?(?:figure|fig\.?|caption|chart|table|spreadsheet|diagram)\b\s*\d*\s*[:.\-–—]\s*(.+?)[*_\s]*$/i;

// GitHub pipe tables → styled HTML wrapped in a <figure> with a "Figure 1A"
// caption. `figureGroup` is the reply's ordinal so the label matches the voice
// ("figure 1A" spoken == "Figure 1A" shown). Runs before the newline pass so the
// multi-line <table> survives (a lone `\n → <br/>` inside a table is exactly what
// made the error-type table look broken).
function convertPipeTables(src: string, figureGroup: number): string {
  const lines = src.split('\n');
  const acc: string[] = [];
  let figIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('|') && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      const head = splitCells(line);
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        rows.push(splitCells(lines[j]));
        j++;
      }
      const label = `${figureGroup}${figureLetter(figIdx)}`;
      figIdx++;

      // Caption: look forward past blank lines, else back at the previous line.
      let caption = '';
      let consumeUpto = j - 1; // last table row; extended if a caption follows
      let c = j;
      while (c < lines.length && lines[c].trim() === '') c++;
      const mAfter = c < lines.length ? CAPTION_RE.exec(lines[c]) : null;
      if (mAfter && mAfter[1].trim()) {
        caption = mAfter[1].trim();
        consumeUpto = c; // swallow the caption line (and any blank lines) too
      } else {
        for (let k = acc.length - 1; k >= 0 && k >= acc.length - 2; k--) {
          if (acc[k].trim() === '') continue;
          const mBefore = CAPTION_RE.exec(acc[k]);
          if (mBefore && mBefore[1].trim()) { caption = mBefore[1].trim(); acc[k] = ''; }
          break;
        }
      }

      const th = head.map((h) => `<th>${inline(h)}</th>`).join('');
      const body = rows
        .map((r) => `<tr>${r.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('');
      const cap = `<figcaption class="study-md__figcap"><span class="study-md__figlabel">Figure ${label}</span>${caption ? ` — ${inline(caption)}` : ''}</figcaption>`;
      acc.push(`<figure class="study-md__figure">${cap}<table class="study-md__table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></figure>`);
      i = consumeUpto;
    } else {
      acc.push(line);
    }
  }
  return acc.join('\n');
}

/** Render AI study markdown (with LaTeX math) to safe HTML. */
export function renderStudyMarkdown(input: string, opts: { figureGroup?: number } = {}): string {
  if (!input) return '';
  const figureGroup = opts.figureGroup ?? 1;
  const { text, restore } = protectMath(input);

  // Multi-line blocks (code / tables) are swapped for an alnum placeholder so
  // the paragraph/line-break passes can't inject <br/> inside them, then
  // restored verbatim at the end.
  const stash: string[] = [];
  const keep = (html: string): string => `zzblockzz${stash.push(html) - 1}zz`;

  let out = escapeHtml(text);

  // Fenced code blocks (verbatim), then blockquotes.
  out = out
    .replace(/```(?:[a-zA-Z0-9]*)\n?([\s\S]*?)```/g, (_m, code: string) =>
      keep(`<pre class="study-md__pre"><code>${(code as string).replace(/\n$/, '')}</code></pre>`))
    .replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>');

  // GFM pipe tables → <figure> HTML, then stash the whole figure.
  out = convertPipeTables(out, figureGroup).replace(/<figure[\s\S]*?<\/figure>/gi, (m) => keep(m));

  out = out
    // headings (#### … #)
    .replace(/^#### (.*)$/gm, '<h5>$1</h5>')
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    // horizontal rule
    .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, '<hr/>')
    // numbered lists → <ol>
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<oli>$1</oli>')
    .replace(/(?:^<oli>.*$\n?)+/gm, (m) => `<ol>${m.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>').replace(/\n/g, '')}</ol>`)
    // bullet lists → <ul>
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(?:^<li>.*$\n?)+/gm, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`);

  // Inline emphasis / code on prose lines (skip lines that are block elements).
  out = out
    .split('\n')
    .map((ln) => (/^\s*<(h\d|ul|ol|blockquote|hr|table|pre)/.test(ln) ? ln : inline(ln)))
    .join('\n');

  // Paragraphs + line breaks.
  out = `<p>${out.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

  // Lift block elements out of any <p>/<br/> hugging them, drop empties.
  out = out
    .replace(/<br\/>\s*(<h\d|<ul|<ol|<blockquote|<hr)/g, '$1')
    .replace(/(<\/h\d>|<\/ul>|<\/ol>|<\/blockquote>|<hr\/>)\s*<br\/>/g, '$1')
    .replace(/<p>\s*(<h\d|<ul|<ol|<blockquote|<hr)/g, '$1')
    .replace(/(<\/h\d>|<\/ul>|<\/ol>|<\/blockquote>|<hr\/>)\s*<\/p>/g, '$1')
    .replace(/<p>\s*<\/p>/g, '');

  // Restore stashed blocks (code / tables), then the rendered KaTeX.
  out = out.replace(/zzblockzz(\d+)zz/g, (_m, i: string) => stash[Number(i)] ?? '');
  return restore(out);
}
