// __tests__/learn/lesson-rendering.test.ts — every word of every module, actually rendered.
//
// Owner, 2026-09-20: "the concepts and ideas and lessons in each module all are perfect in their
// function and presentation … geared so that I can easily digest the information."
//
// ── THE BUG CLASS THIS CATCHES ──────────────────────────────────────────────────────────────────
//
// Every rendering fault in lesson content is the same shape: something in the source survives to
// the screen as raw punctuation. A table shown as `| Quantity | Formula |`. A heading shown as
// `## Angles`. A bullet shown as `- item`. A bold run shown as `**this**`.
//
// None of them throw. None of them look wrong to the code. All of them look broken to the person
// reading, and none of them are visible to anyone who is not scrolling that exact section — which,
// across fifty-five sections and 214,000 characters, is nobody.
//
// So this runs the real content through the real renderer and asserts the raw markers are gone.
//
// ── WHY THE CONTENT IS A FIXTURE AND NOT A DATABASE QUERY ───────────────────────────────────────
//
// A test that reaches production cannot run in CI, fails when the network does, and reports a
// content problem as an infrastructure problem. The fixture is a snapshot, refreshed deliberately
// when the curriculum changes. It going stale is the acceptable failure here: a stale fixture tests
// old content against the current renderer, which is still the check that matters, because the
// renderer is what changes underneath content nobody is re-reading.

import { describe, it, expect } from 'vitest';
import { renderLessonMarkdown } from '@/lib/learn/renderLessonMarkdown';
import { chunkModule } from '@/lib/learn/chunkSection';
import { splitDemos } from '@/lib/learn/demos';
import sections from './__fixtures__/module-content.json';

interface Section {
  module: number;
  moduleTitle: string;
  index: number;
  type: string;
  title: string;
  content: string;
}

const CONTENT = sections as Section[];

/** Text content only, with tags and entities out of the way. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Render a section the way the page does: demos split out, prose rendered. */
function renderSection(s: Section): string {
  return splitDemos(s.content)
    .filter((seg) => seg.kind === 'html')
    .map((seg) => renderLessonMarkdown((seg as { text: string }).text))
    .join('\n');
}

describe('the fixture is worth testing against', () => {
  it('covers every module', () => {
    const modules = new Set(CONTENT.map((s) => s.module));
    expect(modules.size).toBeGreaterThanOrEqual(11);
  });

  it('has real content in every section', () => {
    for (const s of CONTENT) {
      expect(s.content.length, `m${s.module} "${s.title}" is empty`).toBeGreaterThan(200);
    }
  });
});

describe.each(CONTENT.map((s) => [`m${s.module} · ${s.title}`, s] as const))('%s', (_label, section) => {
  const html = renderSection(section);
  const text = visibleText(html);

  it('renders to something', () => {
    expect(html.length).toBeGreaterThan(100);
  });

  it('renders every pipe table as a table element', () => {
    // The single most damaging failure: a formula reference table is the densest, most useful
    // thing in a module, and as raw pipes it is unreadable.
    //
    // Counting bars in the rendered text cannot test this. Two earlier attempts — any |...|, then
    // any |...|...| — both flagged absolute-value notation as broken tables, because
    // `C_lat,i = −(ΣLat)·(|Latᵢ| / Σ|Lat|)` contains four bars and is perfectly correct. A test
    // that cries wolf about good content is worse than no test: the next real failure is read as
    // more of the same.
    //
    // So count the tables in the SOURCE — a header line followed by a |---|---| separator, which
    // no formula can accidentally be — and require the same number of <table> elements out.
    const lines = section.content.split('\n');
    let sourceTables = 0;
    for (let i = 0; i + 1 < lines.length; i += 1) {
      if (lines[i].includes('|') && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        sourceTables += 1;
      }
    }
    // Some sections hand-write their table as HTML rather than as pipes. Those pass through
    // untouched, so they count on both sides.
    sourceTables += (section.content.match(/<table/gi) ?? []).length;
    const rendered = (html.match(/<table/g) ?? []).length;
    expect(rendered, `${sourceTables} table(s) in the source, ${rendered} rendered`).toBe(sourceTables);
  });

  it('renders every markdown heading as a heading element', () => {
    // Structural, not textual. Sniffing the rendered TEXT for a '#' flagged "needs odd # of
    // offsets", where the hash means "number". Counting headings in the SOURCE and requiring the
    // same number of heading elements out cannot be fooled that way.
    const sources = (section.content.match(/^#{1,4}\s+\S/gm) ?? []).length;
    const rendered = (html.match(/<h[234]>/g) ?? []).length;
    expect(rendered, `${sources} heading(s) in the source, ${rendered} rendered`).toBe(sources);
  });

  it('leaves no bold or italic markers as raw text', () => {
    const marks = text.match(/\*\*?\w/g) ?? [];
    expect(marks.slice(0, 3), `${marks.length} raw emphasis marker(s) survived`).toEqual([]);
  });

  it('leaves no backtick code spans as raw text', () => {
    const ticks = text.match(/`/g) ?? [];
    expect(ticks.length, `${ticks.length} raw backtick(s) survived`).toBe(0);
  });

  it('produces balanced tags', () => {
    // An unclosed <p> or <ul> does not throw and does not look wrong here — it leaks into the rest
    // of the page, and the symptom shows up somewhere else entirely.
    for (const tag of ['p', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'figure', 'strong', 'em', 'code']) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      expect(close, `<${tag}>: ${open} opened, ${close} closed`).toBe(open);
    }
  });

  it('has no empty paragraphs or stray line breaks around blocks', () => {
    // Both are invisible to the code and show up as unexplained gaps on the page.
    expect(html).not.toContain('<p></p>');
    expect(html).not.toMatch(/<br\/>\s*<\/p>/);
    expect(html).not.toMatch(/<p>\s*<br\/>/);
  });

  it('never renders the word undefined or NaN into the page', () => {
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/\bNaN\b/);
  });

  it('keeps any demo directive out of the prose', () => {
    // A directive that reached the renderer would be shown to the student as literal
    // `[demo:quadrant azimuth=192]`, which is how a mistyped one announces itself — but a
    // CORRECTLY typed one must never get this far.
    expect(text).not.toMatch(/\[demo:(quadrant|calculator|turn-angle|north-up)\b/);
  });
});

describe('the slideshow view', () => {
  // The step-by-step view chunks each module. A chunk that is enormous defeats the point of the
  // view; one that is empty is a slide with nothing on it.
  const byModule = new Map<number, Section[]>();
  for (const s of CONTENT) {
    const list = byModule.get(s.module) ?? [];
    list.push(s);
    byModule.set(s.module, list);
  }

  for (const [module, secs] of byModule) {
    it(`m${module} chunks into readable slides`, () => {
      const chunks = chunkModule(secs.map((s) => ({ type: s.type, title: s.title, content: s.content })) as never);
      expect(chunks.length, `m${module} produced no chunks`).toBeGreaterThan(0);

      for (const c of chunks) {
        expect(c.content.trim().length, `m${module} "${c.title}" is an empty slide`).toBeGreaterThan(0);
        // Generous, because a table cannot be split and a long one is legitimately a long slide.
        // The point is to catch a chunker that has stopped chunking, not to police prose.
        expect(c.content.length, `m${module} "${c.title}" is ${c.content.length} chars on one slide`)
          .toBeLessThan(9000);
      }
    });
  }
});
