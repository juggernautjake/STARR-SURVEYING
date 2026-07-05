import { describe, it, expect } from 'vitest';
import { renderStudyMarkdown } from '@/lib/learn/study-markdown';
import { toSpeakable } from '@/lib/learn/speakable';

const table = [
  'Here is the data:',
  '',
  '| Distance | Error |',
  '| --- | --- |',
  '| 100 | 0.01 |',
  '| 200 | 0.04 |',
  '',
  '*Figure: how positional error grows with distance*',
  '',
  'So error accumulates.',
].join('\n');

describe('study-markdown figures — on-screen badge matches the spoken label', () => {
  it('wraps the table in a <figure> with a "Figure 1A" caption badge', () => {
    const html = renderStudyMarkdown(table, { figureGroup: 1 });
    expect(html).toContain('study-md__figure');
    expect(html).toContain('Figure 1A');
    expect(html).toContain('how positional error grows with distance');
    // caption line is not also rendered as a stray paragraph
    expect(html).not.toMatch(/<p>[^<]*\*Figure:/);
  });

  it('uses the same label the voice speaks (render 1A == speech 1 A)', () => {
    const html = renderStudyMarkdown(table, { figureGroup: 2 });
    const { text } = toSpeakable(table, { figureGroup: 2 });
    expect(html).toContain('Figure 2A');
    expect(text).toContain('table 2 A'); // "See table 2 A, which shows …"
  });

  it('numbers multiple tables in one reply A, B in order', () => {
    const two = `${table}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n*Chart: a second one*`;
    const html = renderStudyMarkdown(two, { figureGroup: 1 });
    expect(html).toContain('Figure 1A');
    expect(html).toContain('Figure 1B');
  });

  it('still renders a table with no caption (generic badge)', () => {
    const html = renderStudyMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |', { figureGroup: 1 });
    expect(html).toContain('Figure 1A');
    expect(html).toContain('<table');
  });
});
