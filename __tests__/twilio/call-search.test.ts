// __tests__/twilio/call-search.test.ts — searching the call log.
//
// Owner, 2026-09-21: "It should primarily filter by location and name."
//
// The two failures that matter, in order:
//   1. a call the person KNOWS exists does not come back — they decide the search is broken
//   2. the right call comes back buried under twenty transcript matches

import { describe, it, expect } from 'vitest';
import {
  scoreCall, searchCalls, matchedFields, normalizeForSearch, digitsOf,
  supabaseSearchFilter, MATCH_WEIGHT,
} from '@/lib/receptionist/call-search';
import type { PhoneCall } from '@/lib/receptionist/calls';

type Call = Partial<PhoneCall>;

const dana: Call = {
  id: '1',
  caller_name: 'Dana Whitfield',
  from_number: '+12545550188',
  caller_email: 'dwhitfield@gmail.com',
  property_address: '2117 Pecan Hollow Drive, Harker Heights',
  service: 'boundary survey',
  summary: 'Wants her back corners found before putting up a fence.',
  transcript: [{ role: 'caller', text: 'I want to put up a privacy fence in the back' }] as PhoneCall['transcript'],
};

const raymond: Call = {
  id: '2',
  caller_name: 'Raymond Pruitt',
  from_number: '+12545550231',
  property_address: 'FM 2484, Salado',
  service: 'boundary and plat',
  summary: 'Thirteen acres, six corners, selling the forty next door.',
  transcript: [{ role: 'caller', text: 'there is a house a shed and a barn' }] as PhoneCall['transcript'],
};

/** A voicemail-only call: no columns filled in, everything the analysis read out of the words. */
const voicemailOnly: Call = {
  id: '3',
  from_number: '+15125550119',
  voicemail_text: 'Hi this is Curtis Nakamura calling about a survey in Georgetown',
  analysis: {
    summary: 'Asking about survey types, no property yet.',
    contact: { name: 'Curtis Nakamura', address: 'Georgetown' },
  } as PhoneCall['analysis'],
};

const ALL = [dana, raymond, voicemailOnly];

describe('normalising', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(normalizeForSearch('  Pecan   HOLLOW ')).toBe('pecan hollow');
  });

  it('drops the punctuation people type inconsistently', () => {
    // "O'Brien" and "OBrien", "Pecan Hollow Dr." and "Pecan Hollow Dr"
    expect(normalizeForSearch("O'Brien")).toBe('o brien');
    expect(normalizeForSearch('254-555-0188')).toBe('254 555 0188');
  });

  it('survives null and undefined', () => {
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
  });
});

describe('digits', () => {
  it('pulls the digits out of anything', () => {
    expect(digitsOf('(254) 555-0188')).toBe('2545550188');
  });

  it('ignores a run too short to mean anything', () => {
    // Fewer than three and every call in the log contains it.
    expect(digitsOf('12')).toBeNull();
    expect(digitsOf('a')).toBeNull();
  });
});

describe('what a search finds', () => {
  it('finds a call by the caller name', () => {
    expect(searchCalls(ALL, 'whitfield').map((c) => c.id)).toEqual(['1']);
  });

  it('finds a call by part of the address', () => {
    expect(searchCalls(ALL, 'pecan').map((c) => c.id)).toEqual(['1']);
  });

  it('finds a call by town', () => {
    expect(searchCalls(ALL, 'salado').map((c) => c.id)).toEqual(['2']);
  });

  it('finds a voicemail-only call through its analysis', () => {
    // Nothing is in the columns — the name and the town were read out of the words. A search that
    // only looked at caller_name would miss every voicemail, which is most of the log.
    expect(searchCalls(ALL, 'nakamura').map((c) => c.id)).toEqual(['3']);
    expect(searchCalls(ALL, 'georgetown').map((c) => c.id)).toEqual(['3']);
  });

  it('finds a call by a word deep in the transcript', () => {
    // Least specific, still a match. Omitting it is how somebody concludes the search is broken.
    expect(searchCalls(ALL, 'barn').map((c) => c.id)).toEqual(['2']);
  });

  it('finds a call by phone number however it is typed', () => {
    for (const typed of ['2545550188', '254-555-0188', '(254) 555-0188', '254 555 0188']) {
      expect(searchCalls(ALL, typed).map((c) => c.id), typed).toEqual(['1']);
    }
  });

  it('finds a call by email', () => {
    expect(searchCalls(ALL, 'dwhitfield').map((c) => c.id)).toEqual(['1']);
  });

  it('returns everything for an empty query, in the order it arrived', () => {
    // Newest first is what somebody who has not typed anything wants.
    expect(searchCalls(ALL, '').map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(searchCalls(ALL, '   ').map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchCalls(ALL, 'zzzzz')).toEqual([]);
  });
});

describe('several words describe ONE call, not one field', () => {
  it('matches words across different fields', () => {
    // "whitfield pecan" is somebody describing one call using two facts about it. Requiring both
    // in one field would find nothing.
    expect(searchCalls(ALL, 'whitfield pecan').map((c) => c.id)).toEqual(['1']);
  });

  it('excludes a call when ANY word is missing', () => {
    // Anything looser turns a two-word search into a list of everything mentioning "the".
    expect(searchCalls(ALL, 'whitfield salado')).toEqual([]);
  });
});

describe('ranking — name and address first', () => {
  it('weights a name above an address, and an address above a transcript', () => {
    expect(MATCH_WEIGHT.name).toBeGreaterThan(MATCH_WEIGHT.address);
    expect(MATCH_WEIGHT.address).toBeGreaterThan(MATCH_WEIGHT.transcript);
  });

  it('puts a name match above a transcript match for the same word', () => {
    const named: Call = { id: 'a', caller_name: 'Fence Guy' };
    const mentioned: Call = {
      id: 'b',
      caller_name: 'Somebody Else',
      transcript: [{ role: 'caller', text: 'a fence' }] as PhoneCall['transcript'],
    };
    expect(searchCalls([mentioned, named], 'fence').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('puts a call matching two fields above one matching a single field', () => {
    const both: Call = { id: 'a', caller_name: 'Pecan', property_address: 'Pecan Hollow' };
    const one: Call = { id: 'b', caller_name: 'Pecan' };
    expect(searchCalls([one, both], 'pecan').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('says which fields matched, so the list can explain itself', () => {
    expect(matchedFields(dana, 'pecan')).toEqual(['address']);
    expect(matchedFields(dana, 'whitfield')).toContain('name');
    expect(matchedFields(raymond, 'nothinghere')).toEqual([]);
  });
});

describe('scoreCall', () => {
  it('returns null rather than a zero score when nothing matched', () => {
    expect(scoreCall(dana, 'zzzz')).toBeNull();
    expect(scoreCall(dana, '')).toBeNull();
  });

  it('copes with a call that has almost no fields', () => {
    // Rows exist mid-call with nothing but a number on them.
    expect(scoreCall({ id: 'x' }, 'anything')).toBeNull();
    expect(() => scoreCall({ id: 'x', transcript: null as never }, 'anything')).not.toThrow();
  });
});

describe('the server-side narrowing filter', () => {
  it('is null for an empty query, so no filter is applied at all', () => {
    expect(supabaseSearchFilter('')).toBeNull();
    expect(supabaseSearchFilter('   ')).toBeNull();
  });

  it('covers the name and address columns', () => {
    const f = supabaseSearchFilter('pecan')!;
    expect(f).toContain('caller_name.ilike.%pecan%');
    expect(f).toContain('property_address.ilike.%pecan%');
  });

  it('matches a phone number on digits', () => {
    const f = supabaseSearchFilter('254-555-0188')!;
    expect(f).toContain('from_number.ilike.%2545550188%');
  });

  it('strips the characters that would change the shape of the filter', () => {
    // A `,` or `)` ends a PostgREST filter group and `%` is the wildcard. Left in, they would not
    // be searched for — they would rewrite the query.
    const f = supabaseSearchFilter('pe,can)%')!;
    expect(f).not.toMatch(/ilike\.%pe,/);
    expect(f).toContain('%pecan%');
  });

  it('is null when the query is nothing BUT those characters', () => {
    expect(supabaseSearchFilter('%%%')).toBeNull();
    expect(supabaseSearchFilter(',,,')).toBeNull();
  });

  it('sends only the first word, because the browser applies the rest', () => {
    // PostgREST cannot express an AND across two `or` groups in one filter. The server narrows and
    // the browser ranks, so this errs toward returning a call `scoreCall` will drop rather than
    // toward missing one.
    const f = supabaseSearchFilter('whitfield pecan')!;
    expect(f).toContain('%whitfield%');
    expect(f).not.toContain('%pecan%');
  });
});
