// Turning a lesson into something you can step through.
//
// Owner, 2026-09-19: "I want it so that the information is sectioned into easy to understand
// chunks, kind of like a slide show. I want arrows that can navigate back and forth."
//
// The chunks are DERIVED from the headings the author already wrote, not authored separately, so
// every module gets the stepped view with no content work and the two views cannot drift apart.
// Most of what follows is about the content that does NOT divide neatly: the overview sections,
// which are one heading over 2,200 characters, and the raw HTML tables that a naive paragraph
// split would cut in half.
import { describe, it, expect } from 'vitest';
import {
  chunkSection, chunkModule, chunkPosition, firstChunkOfSection,
  MAX_CHUNK_CHARS, type Section,
} from '@/lib/learn/chunkSection';

const section = (o: Partial<Section> & { content: string }): Section =>
  ({ type: 'concepts', title: 'Key Concepts', ...o });

describe('splitting at the author’s headings', () => {
  it('makes one chunk per heading, keeping the heading with its text', () => {
    const out = chunkSection(section({
      content: '## Accuracy vs precision\n\nAccuracy is closeness to truth.\n\n## The three error types\n\nGross, systematic, random.',
    }));
    expect(out).toHaveLength(2);
    expect(out[0]!.title).toBe('Accuracy vs precision');
    expect(out[0]!.content).toContain('## Accuracy vs precision');
    expect(out[1]!.title).toBe('The three error types');
  });

  it('gives every chunk a stable, contiguous id', () => {
    // The id goes in the URL and into progress. It must not shift when an unrelated section changes.
    const out = chunkSection(section({ content: '## A\n\nx\n\n## B\n\ny\n\n## C\n\nz' }));
    expect(out.map((c) => c.id)).toEqual(['concepts.0', 'concepts.1', 'concepts.2']);
  });

  it('falls back to the section’s own title when there is no heading', () => {
    const out = chunkSection(section({ content: 'Just prose, no headings at all.' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('Key Concepts');
  });

  it('keeps a short lead-in with the heading it introduces', () => {
    // One orphaned sentence is not a slide.
    const out = chunkSection(section({ content: 'A quick word first.\n\n## Real heading\n\nBody.' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toContain('A quick word first.');
    expect(out[0]!.content).toContain('## Real heading');
  });

  it('gives a substantial lead-in its own slide', () => {
    const lead = 'x'.repeat(260);
    const out = chunkSection(section({ content: `${lead}\n\n## Real heading\n\nBody.` }));
    expect(out).toHaveLength(2);
    expect(out[0]!.content).toBe(lead);
  });

  it('has nothing to say about an empty section', () => {
    expect(chunkSection(section({ content: '' }))).toEqual([]);
    expect(chunkSection(section({ content: '   \n  ' }))).toEqual([]);
  });
});

describe('the walls the headings do not break up', () => {
  it('splits an oversized block at its sub-headings', () => {
    const big = `## One heading\n\n${'### Sub A\n\n' + 'a'.repeat(900)}\n\n### Sub B\n\n${'b'.repeat(900)}`;
    const out = chunkSection(section({ content: big }));
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.content.length <= big.length)).toBe(true);
  });

  it('splits at paragraphs when there are no sub-headings', () => {
    const para = `${'p'.repeat(700)}`;
    const out = chunkSection(section({ content: `## Long\n\n${para}\n\n${para}\n\n${para}` }));
    expect(out.length).toBeGreaterThan(1);
  });

  it('marks which part of a heading you are on, so the UI can say "2 of 3"', () => {
    const para = `${'p'.repeat(700)}`;
    const out = chunkSection(section({ content: `## Long\n\n${para}\n\n${para}\n\n${para}` }));
    expect(out[0]!.part).toBe(1);
    expect(out[0]!.partsInHeading).toBe(out.length);
    expect(out.every((c) => c.title === 'Long'), 'every part keeps the heading it came from').toBe(true);
  });

  it('does not mark a part number when a heading was not split', () => {
    const out = chunkSection(section({ content: '## Short\n\nA sentence.' }));
    expect(out[0]!.part).toBe(0);
  });
});

describe('never cutting through markup', () => {
  const table = `<table border="1">\n<tr><th>A</th></tr>\n\n<tr><td>1</td></tr>\n\n<tr><td>2</td></tr>\n</table>`;

  it('keeps a table whole even though it contains blank lines', () => {
    // The whole reason paragraph splitting is dangerous: a blank line inside raw HTML is still a
    // blank line, and splitting there yields two slides each holding half a table.
    const content = `## With a table\n\n${'x'.repeat(1200)}\n\n${table}\n\n${'y'.repeat(1200)}`;
    const out = chunkSection(section({ content }));
    for (const c of out) {
      const opens = (c.content.match(/<table\b/gi) ?? []).length;
      const closes = (c.content.match(/<\/table>/gi) ?? []).length;
      expect(opens, `chunk "${c.id}" has ${opens} <table> and ${closes} </table>`).toBe(closes);
    }
    expect(out.some((c) => c.content.includes('</table>'))).toBe(true);
  });

  it('keeps a list whole', () => {
    const list = `<ul>\n<li>one</li>\n\n<li>two</li>\n</ul>`;
    const content = `## With a list\n\n${'x'.repeat(1200)}\n\n${list}\n\n${'y'.repeat(1200)}`;
    for (const c of chunkSection(section({ content }))) {
      expect((c.content.match(/<ul\b/gi) ?? []).length).toBe((c.content.match(/<\/ul>/gi) ?? []).length);
    }
  });

  it('keeps an embedded figure whole', () => {
    const svg = `<svg viewBox="0 0 10 10">\n\n<rect/>\n\n</svg>`;
    const content = `## With a figure\n\n${'x'.repeat(1200)}\n\n${svg}\n\n${'y'.repeat(1200)}`;
    for (const c of chunkSection(section({ content }))) {
      expect((c.content.match(/<svg\b/gi) ?? []).length).toBe((c.content.match(/<\/svg>/gi) ?? []).length);
    }
  });

  it('ignores a heading that only appears inside a table cell', () => {
    // `## ` at the start of a line inside raw HTML is not a heading, and splitting there would open
    // a slide with a fragment of a table.
    const content = `## Real\n\n<table>\n<tr><td>\n## not a heading\n</td></tr>\n</table>\n\nAfter.`;
    const out = chunkSection(section({ content }));
    expect(out).toHaveLength(1);
  });

  it('would rather hand back one long slide than a broken one', () => {
    // A single oversized block with nowhere legal to break stays whole. Measured against the real
    // FS content this happens a handful of times and tops out near 2,500 characters — a
    // readability problem, where the alternative is a page of broken HTML.
    const content = `## Unbreakable\n\n<table>${'x'.repeat(3000)}</table>`;
    const out = chunkSection(section({ content }));
    expect(out).toHaveLength(1);
    expect(out[0]!.content.length).toBeGreaterThan(MAX_CHUNK_CHARS);
  });
});

describe('a whole module', () => {
  const sections: Section[] = [
    { type: 'tips', title: 'Exam Tips', content: '## Tip\n\nt' },
    { type: 'concepts', title: 'Key Concepts', content: '## Concept\n\nc' },
    { type: 'overview', title: 'Module Overview', content: '## Overview\n\no' },
    { type: 'formulas', title: 'Essential Formulas', content: '## Formula\n\nf' },
    { type: 'examples', title: 'Worked Examples', content: '## Example\n\ne' },
  ];

  it('teaches the sections in the order they are taught, not the order they are stored', () => {
    expect(chunkModule(sections).map((c) => c.sectionType))
      .toEqual(['overview', 'concepts', 'formulas', 'examples', 'tips']);
  });

  it('still teaches a section whose type nobody planned for', () => {
    // Rather than silently dropping it from the stepped view while it remains in the full one.
    const extra = [...sections, { type: 'appendix', title: 'Appendix', content: '## Extra\n\nx' }];
    expect(chunkModule(extra).map((c) => c.sectionType)).toContain('appendix');
  });

  it('skips a section that is not there at all', () => {
    expect(chunkModule([sections[1]!]).map((c) => c.sectionType)).toEqual(['concepts']);
  });

  it('can say where you are', () => {
    const chunks = chunkModule(sections);
    expect(chunkPosition(chunks, 'formulas.0')).toEqual({ index: 2, total: 5 });
    // An id that is not there resolves to the start rather than to -1, so the UI cannot render a
    // negative step number while somebody is following a stale link.
    expect(chunkPosition(chunks, 'nonsense')).toEqual({ index: 0, total: 5 });
  });

  it('can jump into a section from the tab strip', () => {
    const chunks = chunkModule(sections);
    expect(firstChunkOfSection(chunks, 'examples')?.title).toBe('Example');
    expect(firstChunkOfSection(chunks, 'missing')).toBeNull();
  });
});
