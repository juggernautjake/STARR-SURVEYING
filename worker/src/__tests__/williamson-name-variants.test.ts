/**
 * Asking Williamson's clerk how IT spells a name.
 *
 * The county's own disclaimer says to "search all possible spelling variations", and on 2026-09-21
 * the index turned out to hold six spellings of one housing authority — including a truncated
 * "AUTHORIT" left by whatever field width was in force when that book was indexed.
 *
 * The variants are not guessed. They are asked for, against the same index the search runs on.
 */

import { describe, it, expect } from 'vitest';
import {
  variantStem, readSuggestions, rankVariants, variantsToSearch, lookupNameVariants, MAX_SUGGESTIONS,
} from '../counties/williamson/name-variants.js';

/** Verbatim from POST /search/suggest/BothNamesID?searchText=ROUND%20ROCK%20HOUSING, 2026-09-21. */
const ROUND_ROCK_HOUSING = [
  'ROUND ROCK HOUSING',
  'ROUND ROCK HOUSING AUTH',
  'ROUND ROCK HOUSING AUTHORIT',
  'ROUND ROCK HOUSING AUTHORITY',
];

/** From searchText=VILLAGE%20GREEN — note the strangers. */
const VILLAGE_GREEN = [
  'VILLAGE GREEN 3.00 AC',
  'VILLAGE GREEN BREWERY',
  'VILLAGE GREEN EVENTS VENUE',
  'VILLAGE GREEN MANAGEMENT COMPANY',
];

describe('the stem — what to ask the index', () => {
  it('drops the entity designator, because that is the word that gets truncated', () => {
    // Asking the full name finds only the exact entry. Asking the stem found all four, including
    // the one the index had cut to "AUTHORIT".
    expect(variantStem('ROUND ROCK HOUSING AUTHORITY')).toBe('ROUND ROCK HOUSING');
  });

  it.each([
    ['ACME PARTNERS LP', 'ACME PARTNERS'],
    ['CEDAR HOLDINGS LLC', 'CEDAR HOLDINGS'],
    ['SMITH FAMILY TRUST', 'SMITH FAMILY'],
    ['HILL COUNTRY DEVELOPMENT CORPORATION', 'HILL COUNTRY DEVELOPMENT'],
  ])('%s → %s', (name, want) => {
    expect(variantStem(name)).toBe(want);
  });

  it('leaves a personal name alone', () => {
    // "SMITH JAMES" has no designator, and trimming it to "SMITH" would pull in every Smith in the
    // county.
    expect(variantStem('SMITH JAMES')).toBe('SMITH JAMES');
  });

  it('refuses to trim down to a single word', () => {
    expect(variantStem('THE TRUST')).toBe('THE TRUST');
    expect(variantStem('ACME LLC')).toBe('ACME LLC');
  });

  it.each([['empty', ''], ['spaces', '   ']])('%s is empty', (_l, v) => {
    expect(variantStem(v)).toBe('');
  });
});

describe('reading the response, whose shape is undocumented', () => {
  it('accepts a bare array of strings', () => {
    expect(readSuggestions(['A', 'B'])).toEqual(['A', 'B']);
  });

  it.each([
    ['suggestions wrapper', { suggestions: ['A'] }],
    ['data wrapper', { data: ['A'] }],
    ['results wrapper', { results: ['A'] }],
  ])('accepts a %s', (_l, body) => {
    expect(readSuggestions(body)).toEqual(['A']);
  });

  it('accepts objects and finds the name field', () => {
    expect(readSuggestions([{ value: 'A' }, { name: 'B' }, { text: 'C' }])).toEqual(['A', 'B', 'C']);
  });

  it('dedupes case-insensitively and collapses whitespace', () => {
    expect(readSuggestions(['ACME  LLC', 'acme llc', ' ACME LLC '])).toEqual(['ACME LLC']);
  });

  it.each([['null', null], ['a string', 'nope'], ['a number', 7], ['an empty object', {}]])(
    '%s yields nothing rather than throwing', (_l, body) => {
      expect(readSuggestions(body)).toEqual([]);
    },
  );
});

describe('ranking — a wide net catches strangers', () => {
  const ranked = rankVariants('ROUND ROCK HOUSING AUTHORITY', ROUND_ROCK_HOUSING);

  it('believes every spelling of the authority', () => {
    expect(ranked.every((r) => r.confident)).toBe(true);
  });

  it('recognises the truncated one as the same entity', () => {
    const t = ranked.find((r) => r.name === 'ROUND ROCK HOUSING AUTHORIT')!;
    expect(t.confident).toBe(true);
    expect(t.why).toMatch(/truncated|abbreviated|same words/i);
  });

  it('rejects the brewery when asked about the subdivision', () => {
    // "VILLAGE GREEN" returns a brewery and an events venue. They are real index entries and they
    // are not this property.
    const r = rankVariants('VILLAGE GREEN', VILLAGE_GREEN);
    const brewery = r.find((x) => x.name.includes('BREWERY'))!;
    expect(brewery.confident, 'a brewery is not a subdivision').toBe(false);
    expect(brewery.why).toMatch(/different party/i);
  });

  it('keeps a fuller form of the same name', () => {
    const r = rankVariants('HOUSING AUTHORITY ROUND ROCK', ['HOUSING AUTHORITY OF CITY OF ROUND ROCK']);
    expect(r[0]!.confident).toBe(true);
    expect(r[0]!.why).toMatch(/fuller form/i);
  });

  it('is order-insensitive, which edit distance is not', () => {
    // "ROUND ROCK HOUSING AUTHORITY" and "HOUSING AUTHORITY CITY OF ROUND ROCK" are the same entity
    // with the words rearranged; no edit-distance threshold calls those close while also rejecting
    // the brewery.
    const r = rankVariants('ROUND ROCK HOUSING AUTHORITY', ['HOUSING AUTHORITY CITY OF ROUND ROCK']);
    expect(r[0]!.confident).toBe(true);
  });
});

describe('what actually goes in the chip list', () => {
  it('the confident variants, and what the operator said', () => {
    const out = variantsToSearch('ROUND ROCK HOUSING AUTHORITY', ROUND_ROCK_HOUSING);
    expect(out).toContain('ROUND ROCK HOUSING AUTHORITY');
    expect(out).toContain('ROUND ROCK HOUSING AUTHORIT');
    expect(out.length).toBeGreaterThanOrEqual(4);
  });

  it('always includes the asked name even when the index has no entry for it', () => {
    // Its absence from the RESULTS is then a finding, rather than a step that was skipped.
    const out = variantsToSearch('NOBODY AT ALL LLC', []);
    expect(out).toEqual(['NOBODY AT ALL LLC']);
  });

  it('drops the strangers', () => {
    const out = variantsToSearch('VILLAGE GREEN', VILLAGE_GREEN);
    expect(out.some((n) => n.includes('BREWERY'))).toBe(false);
  });

  it('never duplicates', () => {
    const out = variantsToSearch('ACME LLC', ['ACME LLC', 'acme llc']);
    expect(out).toHaveLength(1);
  });
});

describe('the lookup call', () => {
  const fake = (body: unknown, ok = true, status = 200) => {
    const calls: string[] = [];
    const impl = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return { ok, status, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    return { impl, calls };
  };

  it('POSTs to the suggest endpoint with the STEM, not the full name', async () => {
    const { impl, calls } = fake(ROUND_ROCK_HOUSING);
    const r = await lookupNameVariants('ROUND ROCK HOUSING AUTHORITY', { fetchImpl: impl });
    expect(r.stem).toBe('ROUND ROCK HOUSING');
    expect(calls[0]).toMatch(/^POST /);
    expect(calls[0]).toContain('/search/suggest/BothNamesID');
    expect(decodeURIComponent(calls[0]!).split('+').join(' ')).toContain('searchText=ROUND ROCK HOUSING');
    expect(r.variants).toHaveLength(4);
  });

  it('asks for a generous number of suggestions', async () => {
    const { impl, calls } = fake([]);
    await lookupNameVariants('ACME PARTNERS LP', { fetchImpl: impl });
    expect(calls[0]).toContain(`maxValues=${MAX_SUGGESTIONS}`);
  });

  it('can target the grantor or grantee field', async () => {
    const { impl, calls } = fake([]);
    await lookupNameVariants('ACME PARTNERS LP', { field: 'GrantorID', fetchImpl: impl });
    expect(calls[0]).toContain('/suggest/GrantorID');
  });

  it('a non-200 is an error rather than an empty variant list', async () => {
    // An empty list looks exactly like a name the county has never recorded.
    const { impl } = fake(null, false, 503);
    const r = await lookupNameVariants('ACME PARTNERS LP', { fetchImpl: impl });
    expect(r.error).toContain('503');
    expect(r.variants).toEqual([]);
  });

  it('a thrown fetch is reported', async () => {
    const impl = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    const r = await lookupNameVariants('ACME PARTNERS LP', { fetchImpl: impl });
    expect(r.error).toContain('ECONNRESET');
  });

  it('an empty name makes no request', async () => {
    const { impl, calls } = fake([]);
    const r = await lookupNameVariants('  ', { fetchImpl: impl });
    expect(calls).toHaveLength(0);
    expect(r.error).toBeTruthy();
  });
});
