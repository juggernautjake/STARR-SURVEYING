// __tests__/research/county-input.test.ts
//
// The motivating case is the first test: the owner typed "Texas" in the County box while creating
// the first real research run, and nothing on the screen disagreed. County is the routing key —
// Bell goes to Kofile for free, an unmatched county goes nowhere — so a wrong one costs a run and,
// in a TexasFile county, money.

import { describe, it, expect } from 'vitest';
import {
  checkCounty,
  normalizeCounty,
  suggestCounties,
} from '@/lib/research/county-input';
import { TEXAS_COUNTIES } from '@/worker/src/lib/county-fips';

describe('the mistake that prompted this', () => {
  it('answers "Texas" as a category error, not a misspelling', () => {
    const r = checkCounty('Texas');
    expect(r.kind).toBe('is-state');
    if (r.kind !== 'is-state') return;
    // "Did you mean Bexar?" would be a terrible reply. The message has to say what is wrong.
    expect(r.message).toContain('state, not the county');
    expect(r.message).toContain('Bell');
  });

  it('answers the abbreviation the same way', () => {
    expect(checkCounty('TX').kind).toBe('is-state');
    expect(checkCounty('  tx  ').kind).toBe('is-state');
  });
});

describe('recognising a real county', () => {
  it('accepts the plain name', () => {
    expect(checkCounty('Bell')).toEqual({ kind: 'ok', canonical: 'Bell' });
  });

  it('accepts the way people actually type it', () => {
    // All of these are the same county, and none of them should need a second attempt.
    for (const typed of ['bell', 'BELL', '  Bell  ', 'Bell County', 'bell county']) {
      expect(checkCounty(typed)).toEqual({ kind: 'ok', canonical: 'Bell' });
    }
  });

  it('ignores the punctuation and spacing in awkward names', () => {
    expect(checkCounty('de witt').kind).toBe('ok');
    expect(checkCounty('DeWitt').kind).toBe('ok');
    expect(checkCounty('mclennan')).toEqual({ kind: 'ok', canonical: 'McLennan' });
    expect(checkCounty('val verde').kind).toBe('ok');
  });

  it('returns the canonical casing so a typed name is stored consistently', () => {
    const r = checkCounty('MCLENNAN');
    expect(r.kind === 'ok' && r.canonical).toBe('McLennan');
  });

  it('accepts every one of the 254 counties by its own name', () => {
    // A scanner that passes nothing is as useless as one that passes everything.
    expect(TEXAS_COUNTIES).toHaveLength(254);
    const rejected = TEXAS_COUNTIES.filter((c) => checkCounty(c.name).kind !== 'ok');
    expect(rejected.map((c) => c.name)).toEqual([]);
  });
});

describe('an empty box is not an error', () => {
  it('reports empty rather than unknown', () => {
    expect(checkCounty('').kind).toBe('empty');
    expect(checkCounty('   ').kind).toBe('empty');
    expect(checkCounty(null).kind).toBe('empty');
    expect(checkCounty(undefined).kind).toBe('empty');
    // Punctuation alone normalises away to nothing, and "-" is not a wrong county.
    expect(checkCounty('--').kind).toBe('empty');
  });
});

describe('suggestions', () => {
  it('puts prefix matches first — a half-typed name is not a misspelling', () => {
    const s = suggestCounties('Will');
    // Willacy and Williamson start with "Will". Wilson does NOT — it is Wil-s-on — and asserting
    // otherwise was this test's own bug on the first run. Worth keeping the note: the obvious
    // neighbour in a person's head is not always a prefix.
    expect(s).toContain('Williamson');
    expect(s).toContain('Willacy');
    // Ordering matters: no distance metric should outrank what the person is clearly typing.
    // "Hill" is one edit from "Will" and must not come first.
    expect(s[0]!.startsWith('Wil')).toBe(true);
  });

  it('catches a one-letter slip', () => {
    expect(suggestCounties('Bel')).toContain('Bell');
    expect(suggestCounties('Travs')).toContain('Travis');
    expect(suggestCounties('Harriss')).toContain('Harris');
  });

  it('offers nothing for a string with no near neighbour, rather than reaching', () => {
    // A bad suggestion is worse than none — it invites a wrong click.
    expect(suggestCounties('Zzzzqqqq')).toEqual([]);
  });

  it('scales tolerance to the length of what was typed', () => {
    // One wrong letter in a four-letter name is a different kind of wrong from one in an
    // eleven-letter name; a fixed threshold treats them the same.
    expect(suggestCounties('Nacogdoces')).toContain('Nacogdoches');
    expect(suggestCounties('Bxxx')).not.toContain('Bell');
  });

  it('is capped so the hint stays a hint', () => {
    expect(suggestCounties('Sa').length).toBeLessThanOrEqual(3);
  });
});

describe('an unknown county explains what the field is for', () => {
  it('names the consequence rather than just refusing', () => {
    const r = checkCounty('Nowhere');
    expect(r.kind).toBe('unknown');
    if (r.kind !== 'unknown') return;
    expect(r.message).toContain('Nowhere');
  });

  it('says the county chooses the portal when it has nothing to suggest', () => {
    const r = checkCounty('Zzzzqqqq');
    if (r.kind !== 'unknown') throw new Error('expected unknown');
    expect(r.suggestions).toEqual([]);
    expect(r.message).toContain('clerk portal');
  });

  it('does not claim a county from another state is a Texas one', () => {
    // Bell County exists in Texas; Orange County exists in both. Maricopa does not.
    expect(checkCounty('Maricopa').kind).toBe('unknown');
    expect(checkCounty('Cook').kind).toBe('unknown');
  });
});

describe('normalizeCounty', () => {
  it('folds the things that should not distinguish two spellings', () => {
    expect(normalizeCounty('Bell County')).toBe('bell');
    expect(normalizeCounty('  BELL  ')).toBe('bell');
    expect(normalizeCounty('De Witt')).toBe('dewitt');
  });

  it('does not eat a name that merely contains the word', () => {
    // There is no Texas county whose name contains "county", but the guard is cheap and the
    // failure — silently deleting part of a real name — would be invisible.
    expect(normalizeCounty('Countyx')).toBe('countyx');
  });
});
