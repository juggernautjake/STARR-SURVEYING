// __tests__/files/labels.test.ts — naming and tagging a file.
//
// The rules that matter here are the ones a UI would get subtly wrong and nobody would notice for a
// month: that an empty box CLEARS a rename rather than erroring, that "Monument" and "monument" are
// one tag, and that selecting two tags narrows rather than widens.

import { describe, it, expect } from 'vitest';
import {
  checkLabel,
  normalizeTag,
  parseTags,
  tagFacets,
  matchesTags,
  MAX_LABEL_LENGTH,
  MAX_TAGS_PER_FILE,
  MAX_TAG_LENGTH,
} from '@/lib/files/labels';

describe('checkLabel', () => {
  it('keeps an ordinary name', () => {
    expect(checkLabel('NW corner monument')).toEqual({ ok: true, value: 'NW corner monument' });
  });

  it('treats an emptied box as CLEARING the rename, not as an error', () => {
    // The behaviour the whole feature turns on: without it, a rename cannot be undone.
    expect(checkLabel('')).toEqual({ ok: true, value: null });
    expect(checkLabel('    ')).toEqual({ ok: true, value: null });
    expect(checkLabel(null)).toEqual({ ok: true, value: null });
    expect(checkLabel(undefined)).toEqual({ ok: true, value: null });
  });

  it('flattens the newlines a paste from a PDF brings along', () => {
    expect(checkLabel('North\nboundary\ttie')).toEqual({ ok: true, value: 'North boundary tie' });
  });

  it('strips control characters rather than storing them invisibly', () => {
    // Built with fromCharCode rather than typed as literals: a raw control byte in a source
    // file makes it binary to git and grep, which this module's own comment records happening once.
    const withControls = ['Corner', String.fromCharCode(7), ' ', String.fromCharCode(127), ' pin'].join('');
    expect(checkLabel(withControls).value).toBe('Corner pin');
  });

  it('refuses a name that is really a note', () => {
    const tooLong = 'x'.repeat(MAX_LABEL_LENGTH + 1);
    const result = checkLabel(tooLong);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(MAX_LABEL_LENGTH));
  });

  it('accepts exactly the maximum length', () => {
    expect(checkLabel('x'.repeat(MAX_LABEL_LENGTH)).ok).toBe(true);
  });

  it('refuses a non-string', () => {
    expect(checkLabel(42).ok).toBe(false);
  });
});

describe('normalizeTag', () => {
  it('folds case, so one tag is one tag', () => {
    expect(normalizeTag('Monument')).toBe('monument');
    expect(normalizeTag('MONUMENT')).toBe('monument');
  });

  it('collapses inner whitespace so "access  road" and "access road" match', () => {
    expect(normalizeTag('access  road')).toBe('access road');
    expect(normalizeTag('  access road  ')).toBe('access road');
  });

  it('keeps letters, digits, spaces, hyphens and underscores', () => {
    expect(normalizeTag('pre-construction_2026')).toBe('pre-construction_2026');
  });

  it('turns punctuation into a separator rather than keeping it', () => {
    expect(normalizeTag('monument!!')).toBe('monument');
    expect(normalizeTag('north/south')).toBe('north south');
  });

  it('keeps non-ASCII letters', () => {
    expect(normalizeTag('Señor')).toBe('señor');
  });

  it('returns null when nothing survives', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('!!!')).toBeNull();
    expect(normalizeTag(null)).toBeNull();
  });

  it('truncates without leaving a trailing space', () => {
    // A cut that lands on a space would otherwise make " x" and "x " two rows in the facet list.
    const long = `${'a'.repeat(MAX_TAG_LENGTH - 1)} bcdef`;
    const tag = normalizeTag(long) as string;
    expect(tag.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
    expect(tag).toBe(tag.trim());
  });
});

describe('parseTags', () => {
  it('splits a typed comma list', () => {
    expect(parseTags('monument, access road,  BEFORE ')).toEqual(['monument', 'access road', 'before']);
  });

  it('accepts an array from the chip editor', () => {
    expect(parseTags(['Monument', 'access'])).toEqual(['monument', 'access']);
  });

  it('drops duplicates and keeps the order typed', () => {
    // The LATER copy drops, so the list does not reshuffle under the cursor while being edited.
    expect(parseTags(['b', 'a', 'B'])).toEqual(['b', 'a']);
  });

  it('drops entries that normalise to nothing', () => {
    expect(parseTags(['monument', '   ', '!!', ''])).toEqual(['monument']);
  });

  it('caps the number of tags on one file', () => {
    const many = Array.from({ length: MAX_TAGS_PER_FILE + 5 }, (_, i) => `tag${i}`);
    expect(parseTags(many)).toHaveLength(MAX_TAGS_PER_FILE);
  });

  it('returns an empty array for anything that is not a list or a string', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(7)).toEqual([]);
  });
});

describe('tagFacets', () => {
  it('counts each tag once per file, most used first', () => {
    const facets = tagFacets([
      { tags: ['monument', 'before'] },
      { tags: ['monument'] },
      { tags: ['access'] },
      { tags: null },
      {},
    ]);
    expect(facets).toEqual([
      { tag: 'monument', count: 2 },
      { tag: 'access', count: 1 },
      { tag: 'before', count: 1 },
    ]);
  });

  it('cannot be inflated by a row that stored the same tag twice', () => {
    expect(tagFacets([{ tags: ['monument', 'monument'] }])).toEqual([{ tag: 'monument', count: 1 }]);
  });

  it('breaks ties alphabetically, so the order is stable between renders', () => {
    const facets = tagFacets([{ tags: ['zulu', 'alpha'] }]);
    expect(facets.map(f => f.tag)).toEqual(['alpha', 'zulu']);
  });
});

describe('matchesTags', () => {
  const file = { tags: ['monument', 'before', 'access'] };

  it('matches everything when nothing is selected', () => {
    expect(matchesTags(file, [])).toBe(true);
    expect(matchesTags({ tags: null }, [])).toBe(true);
  });

  it('narrows with AND rather than widening with OR', () => {
    // Somebody selecting two tags is shrinking a list of four hundred photos, not growing it.
    expect(matchesTags(file, ['monument', 'before'])).toBe(true);
    expect(matchesTags(file, ['monument', 'after'])).toBe(false);
  });

  it('does not match a file with no tags', () => {
    expect(matchesTags({ tags: null }, ['monument'])).toBe(false);
    expect(matchesTags({}, ['monument'])).toBe(false);
  });
});
