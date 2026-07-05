import { describe, it, expect } from 'vitest';
import { toSpeakable, speakableText, latexToSpeech, figureLetter } from '@/lib/learn/speakable';

describe('speakable — units & symbols read naturally', () => {
  it('expands ft/in with singular/plural by the number', () => {
    expect(speakableText('The tape is 100 ft long.')).toContain('100 feet');
    expect(speakableText('Offset is 1 ft.')).toContain('1 foot');
    expect(speakableText('Drop of 6 in over the run.')).toContain('6 inches');
    expect(speakableText('A 1 in gap.')).toContain('1 inch');
  });

  it('does NOT turn the English word "in" into inches', () => {
    // "12 in the field" must stay prose, not "12 inches the field"
    expect(speakableText('There are 12 in the field book.')).not.toContain('inches');
  });

  it('reads square feet and acres', () => {
    expect(speakableText('Area = 500 ft² total.')).toContain('500 square feet');
    expect(speakableText('The parcel is 2 acres.')).toContain('2 acres');
    expect(speakableText('The lot is 1 acre.')).toContain('1 acre');
  });

  it('expands common symbols', () => {
    expect(speakableText('x ± 0.02 result')).toContain('plus or minus');
    expect(speakableText('h ≈ 5 units')).toContain('approximately');
    expect(speakableText('area is 50%')).toContain('percent');
  });

  it('speaks "=" as the word "equals" even in plain prose (no $…$)', () => {
    const out = speakableText('The area A = length times width.');
    expect(out).toContain('equals');
    expect(out).not.toContain('=');
  });

  it('handles compound comparison operators written as ASCII', () => {
    expect(speakableText('require ratio >= 1 here')).toContain('greater than or equal to');
    expect(speakableText('keep error <= 0.1 max')).toContain('less than or equal to');
    expect(speakableText('when a != b then')).toContain('not equal to');
    // must not leave a stray "="
    expect(speakableText('so x >= y today')).not.toContain('=');
  });

  it('speaks decimal fractions digit-by-digit so runs of zeros survive', () => {
    const out = speakableText('The tolerance is 0.000025 meters.');
    expect(out).toContain('0 point zero zero zero zero two five');
    // no raw multi-zero run left for the voice to mangle
    expect(out).not.toContain('000025');
  });

  it('keeps the integer part as a number, only the fraction is spelled', () => {
    expect(speakableText('measured 1450.25 units')).toContain('1450 point two five');
  });

  it('handles a leading-dot decimal', () => {
    expect(speakableText('a value of .5 here')).toContain('zero point five');
  });

  it('speaks degrees-minutes-seconds as angles, not feet/inches', () => {
    const out = speakableText('The bearing is 35°12′30″ here.');
    expect(out).toContain('35 degrees');
    expect(out).toContain('12 minutes');
    expect(out).toContain('30 seconds');
  });
});

describe('speakable — lone variables get their spoken letter name (the "n" fix)', () => {
  it('respells a standalone n as "en"', () => {
    expect(speakableText('Divide by n to get the mean.')).toContain(' en ');
  });
  it('respells x and y', () => {
    const out = speakableText('Plot x against y today.');
    expect(out).toContain(' ex ');
    expect(out).toContain(' why ');
  });
  it('leaves real words and the pronouns a / I / o alone', () => {
    const out = speakableText('I took a shot at the point.');
    expect(out).toContain('I took a shot');
    expect(out).not.toContain(' eye ');
  });
  it('does not corrupt letters inside words', () => {
    expect(speakableText('national boundary')).toContain('national boundary');
  });
});

describe('speakable — LaTeX math becomes words', () => {
  it('speaks powers, fractions and roots', () => {
    expect(latexToSpeech('x^2')).toContain('squared');
    expect(latexToSpeech('x^3')).toContain('cubed');
    expect(latexToSpeech('\\frac{a}{b}')).toContain('over');
    expect(latexToSpeech('\\sqrt{a}')).toContain('square root of');
  });
  it('speaks the mean formula from the tutor prompt', () => {
    const out = latexToSpeech('\\bar{x} = \\frac{\\sum x_i}{n}');
    expect(out).toContain('bar');
    expect(out).toContain('equals');
    expect(out).toContain('the sum of');
    expect(out).toContain('over');
  });
  it('inline $…$ in prose is converted', () => {
    const out = speakableText('The mean is $\\bar{x}$ for the set.');
    expect(out.toLowerCase()).toContain('bar');
    expect(out).not.toContain('$');
    expect(out).not.toContain('\\');
  });
});

describe('speakable — tables become figure references, never read cell-by-cell', () => {
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

  it('replaces the grid with a spoken reference + caption', () => {
    const { text, figures } = toSpeakable(table, { figureGroup: 1 });
    expect(figures).toHaveLength(1);
    expect(figures[0].label).toBe('1A');
    expect(figures[0].caption).toContain('positional error');
    expect(text).toContain('See table 1 A');
    expect(text).toContain('how positional error grows with distance');
    // the raw numbers / pipes are gone
    expect(text).not.toContain('|');
    expect(text).not.toContain('0.04');
  });

  it('labels multiple figures within a reply consistently (1A, 1B)', () => {
    const two = `${table}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n*Chart: a second one*`;
    const { figures } = toSpeakable(two, { figureGroup: 1 });
    expect(figures.map((f) => f.label)).toEqual(['1A', '1B']);
    expect(figures[1].kind).toBe('chart');
  });

  it('numbers figures by the message group', () => {
    const { figures } = toSpeakable(table, { figureGroup: 3 });
    expect(figures[0].label).toBe('3A');
  });

  it('falls back to a generic reference when there is no caption', () => {
    const noCap = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const { text, figures } = toSpeakable(noCap, { figureGroup: 2 });
    expect(figures[0].caption).toBeNull();
    expect(text).toContain('labeled figure 2 A');
  });
});

describe('figureLetter', () => {
  it('counts A..Z then AA', () => {
    expect(figureLetter(0)).toBe('A');
    expect(figureLetter(25)).toBe('Z');
    expect(figureLetter(26)).toBe('AA');
  });
});

describe('speakable — never emits SSML or raw markup (safe for browser voice too)', () => {
  it('produces clean prose with no tags or latex artifacts', () => {
    const md = '## Heading\n\nUse **bold** and `code` and $x^2 + n$ and [a link](http://x).';
    const out = speakableText(md);
    expect(out).not.toMatch(/<break|<phoneme|<speak/);
    expect(out).not.toContain('**');
    expect(out).not.toContain('`');
    expect(out).not.toContain('$');
    expect(out).not.toContain('](');
  });
});
