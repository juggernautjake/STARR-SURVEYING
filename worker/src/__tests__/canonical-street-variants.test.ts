// worker/src/__tests__/canonical-street-variants.test.ts
//
// ── THE RUN THAT PROMPTED THIS ──────────────────────────────────────────────────────────────────
//
// Job 26144, Williamson County, 2026-09-21. The job's address is "1007 Cushing Dirve" — a typo for
// Drive. Stage 0B geocoded it correctly to "1007 CUSHING DR, ROUND ROCK, TX, 78664" and printed
// that to the operator's console.
//
// Then every search used the typo. `result.canonical` was read by exactly ONE line in the whole
// repository — the log statement that showed it to the operator — while `result.variants`, which is
// what Stage 1 and Stage 2 actually search, is built from the operator's raw field.
//
// So two county systems were asked about a street called Dirve, and the corrected form the app had
// already worked out was discarded.
//
// ── WHAT MUST NOT REGRESS ───────────────────────────────────────────────────────────────────────
//
// Seed 624 established that the operator's typed parts beat any geocoder's guess, for a good
// reason: the app's own composed strings were worse than what a person typed. That is untouched.
// These variants are APPENDED at a lower priority — typed first, corrected second — so a correction
// is a fallback rather than an override.

import { describe, it, expect } from 'vitest';
import { canonicalStreetVariants } from '../services/address-utils';
import type { AddressVariant } from '../types/index';

const parsed = (over: Partial<Record<string, string | null>> = {}) => ({
  streetNumber: '1007',
  streetName: 'CUSHING DIRVE',
  streetType: '',
  preDirection: null,
  postDirection: null,
  unit: null,
  ...over,
}) as never;

const variant = (streetNumber: string, streetName: string, priority: number): AddressVariant =>
  ({ streetNumber, streetName, format: 'canonical', priority, isPartial: false }) as AddressVariant;

const typedVariants = [variant('1007', 'CUSHING DIRVE', 1), variant('1007', 'CUSHING', 2)];

describe('job 26144 — the typo that cost a run', () => {
  const out = canonicalStreetVariants({
    canonical: '1007 CUSHING DR, ROUND ROCK, TX, 78664',
    parsed: parsed(),
    variants: typedVariants,
  }, '1007 Cushing Dirve');

  it('produces the corrected street as a searchable variant', () => {
    expect(out).toHaveLength(1);
    expect(out[0]!.streetNumber).toBe('1007');
    expect(out[0]!.streetName).toBe('CUSHING DR');
  });

  it('sorts AFTER everything the operator typed', () => {
    // Seed 624's rule survives: what a person entered is tried first.
    const highestTyped = Math.max(...typedVariants.map((v) => v.priority));
    expect(out[0]!.priority).toBeGreaterThan(highestTyped);
  });

  it('is marked partial, because it is derived rather than stated', () => {
    expect(out[0]!.isPartial).toBe(true);
  });

  it('says where it came from', () => {
    expect(out[0]!.format).toBe('geocoded');
  });
});

describe('it stays quiet when it has nothing to add', () => {
  it('no canonical form at all', () => {
    expect(canonicalStreetVariants({ canonical: null, parsed: parsed(), variants: typedVariants })).toEqual([]);
    expect(canonicalStreetVariants({ canonical: '  ', parsed: parsed(), variants: typedVariants })).toEqual([]);
  });

  it('the geocoder agreed with what was typed', () => {
    const out = canonicalStreetVariants({
      canonical: '1007 CUSHING DR, ROUND ROCK, TX, 78664',
      parsed: parsed({ streetName: 'CUSHING', streetType: 'DR' }),
      variants: [variant('1007', 'CUSHING DR', 1)],
    }, '1007 Cushing Dr');
    expect(out).toEqual([]);
  });

  it('it differs only by case or punctuation', () => {
    const out = canonicalStreetVariants({
      canonical: '1007 Cushing Dr, Round Rock, TX',
      parsed: parsed({ streetName: 'CUSHING', streetType: 'DR' }),
      variants: [variant('1007', 'CUSHING DR', 1)],
    }, '1007 cushing dr.');
    expect(out).toEqual([]);
  });

  it('the canonical form is unparseable', () => {
    for (const canonical of ['Round Rock, TX', 'TX', '78664', '   ,  ,  ']) {
      expect(canonicalStreetVariants({ canonical, parsed: parsed(), variants: typedVariants }), canonical).toEqual([]);
    }
  });
});

describe('a changed HOUSE NUMBER is refused outright', () => {
  it('does not search a different property', () => {
    // The dangerous case, and the reason the number is checked. A geocoder that "corrects" 1007 to
    // 1009 has found somebody else's parcel. Searching for it returns a confident, complete,
    // entirely wrong answer — which is worse than returning nothing.
    const out = canonicalStreetVariants({
      canonical: '1009 CUSHING DR, ROUND ROCK, TX, 78664',
      parsed: parsed(),
      variants: typedVariants,
    }, '1007 Cushing Dirve');
    expect(out).toEqual([]);
  });

  it('accepts a number with a letter suffix when it matches', () => {
    const out = canonicalStreetVariants({
      canonical: '1007A CUSHING DR, ROUND ROCK, TX',
      parsed: parsed({ streetNumber: '1007A' }),
      variants: [variant('1007A', 'CUSHING DIRVE', 1)],
    });
    expect(out).toHaveLength(1);
  });

  it('proceeds when the parsed number is empty rather than blocking on it', () => {
    // Nothing to contradict, so the correction is still worth having.
    const out = canonicalStreetVariants({
      canonical: '1007 CUSHING DR, ROUND ROCK, TX',
      parsed: parsed({ streetNumber: '' }),
      variants: [],
    });
    expect(out).toHaveLength(1);
  });
});

describe('it never duplicates a search', () => {
  it('skips a street already in the variant list', () => {
    const out = canonicalStreetVariants({
      canonical: '1007 CUSHING DR, ROUND ROCK, TX',
      parsed: parsed(),
      variants: [...typedVariants, variant('1007', 'CUSHING DR', 3)],
    });
    expect(out).toEqual([]);
  });

  it('matches case-insensitively when deduping', () => {
    const out = canonicalStreetVariants({
      canonical: '1007 Cushing Dr, Round Rock, TX',
      parsed: parsed(),
      variants: [variant('1007', 'CUSHING DR', 1)],
    });
    expect(out).toEqual([]);
  });
});

describe('only the STREET is taken from the correction', () => {
  it('a different city on its own produces nothing', () => {
    // compareAddress reports a city/ZIP disagreement and deliberately does not resolve it — that
    // cannot tell a typo from a rural mailing-address convention. Only the street, where a single
    // confident geocode is good evidence, is used here.
    const out = canonicalStreetVariants({
      canonical: '1007 CUSHING DIRVE, GEORGETOWN, TX, 78626',
      parsed: parsed(),
      variants: typedVariants,
    }, '1007 Cushing Dirve');
    expect(out).toEqual([]);
  });
});
