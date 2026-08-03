// Running the errands the gap list writes (plan R14, third half).
//
// The assertions that matter most here are the ones separating "we searched and it is not there"
// from "we could not search". Several adapters deliberately THROW on searchByVolumePage —
// USLandRecords says so in as many words: "a missing capability, not an empty result" — and the
// obvious implementation of this module (try/catch → return []) would convert that sentence back
// into the defect it was written to prevent.
//
// The damage is specific and quiet. The packet would report "Volume 412, Page 88 — not found" about
// a deed sitting in the courthouse, indexed, findable by anyone who walks in, and the surveyor stops
// looking.

import { describe, it, expect, vi } from 'vitest';
import {
  classifyFetchError,
  errandsFromGaps,
  parseCitation,
  runErrands,
  type Errand,
} from '../chain-of-title/chain-errands.js';
import type { ChainGap } from '../chain-of-title/chain-gaps.js';

const gap = (over: Partial<ChainGap> = {}): ChainGap => ({
  kind: 'unfollowed_citation',
  citedIn: '2019-3389',
  missing: 'Volume 412, Page 88',
  statement: '',
  nextStep: '',
  ...over,
});

const candidate = (instrument = 'V412P88') => ({
  instrument,
  grantor: 'SMITH JOHN',
  grantee: 'JONES MARY',
  recordingDate: '1974-06-02',
});

describe('reading a citation back into something searchable', () => {
  it('parses volume and page, stripping display padding', () => {
    expect(parseCitation('Volume 412, Page 88')).toMatchObject({ kind: 'volume_page', volume: '412', page: '88' });
    expect(parseCitation('Vol. 0412 Pg 088')).toMatchObject({ volume: '412', page: '88' });
    expect(parseCitation('Book 5, Page 100')).toMatchObject({ volume: '5', page: '100' });
  });

  it('parses an instrument number', () => {
    expect(parseCitation('Instrument No. 2019-12345')).toMatchObject({
      kind: 'instrument_number',
      instrument: '2019-12345',
    });
  });

  it('returns null rather than guessing at something unreadable', () => {
    expect(parseCitation('the deed recorded in the old book')).toBeNull();
  });
});

describe('the worklist', () => {
  it('takes only unfollowed citations', () => {
    // A broken_link names no instrument to fetch, and an undated_link is a document we already hold.
    // Searching for either spends budget on a search that cannot succeed.
    const { errands } = errandsFromGaps([
      gap(),
      gap({ kind: 'broken_link', missing: undefined }),
      gap({ kind: 'undated_link', missing: undefined }),
    ]);
    expect(errands).toHaveLength(1);
  });

  it('runs one citation once, however many deeds recite it', () => {
    const { errands } = errandsFromGaps([
      gap({ citedIn: '2019-3389' }),
      gap({ citedIn: '1998-2211', missing: 'Vol. 0412 Pg 088' }),
    ]);
    expect(errands).toHaveLength(1);
    expect(errands[0]!.citedIn).toEqual(['2019-3389', '1998-2211']);
  });

  it('puts the most-cited citation first, because that is where the budget should go', () => {
    const { errands } = errandsFromGaps([
      gap({ citedIn: 'a', missing: 'Volume 1, Page 1' }),
      gap({ citedIn: 'b', missing: 'Volume 2, Page 2' }),
      gap({ citedIn: 'c', missing: 'Volume 2, Page 2' }),
    ]);
    expect(errands[0]!.key).toBe('VOL2PG2');
  });

  it('keeps an unreadable citation as an errand instead of dropping it', () => {
    const { errands, unparseable } = errandsFromGaps([gap({ missing: 'the old deed book' })]);
    expect(errands).toHaveLength(0);
    expect(unparseable).toHaveLength(1);
  });
});

describe('"could not be searched" is never reported as "not found"', () => {
  const errandList = (): Errand[] => errandsFromGaps([gap()]).errands;

  it('says so when the county offers no book/page search at all', async () => {
    // No fetchByVolumePage wired for this county.
    const r = await runErrands(errandList(), {});
    expect(r.counts.capability_missing).toBe(1);
    expect(r.counts.not_found).toBe(0);
    expect(r.outcomes[0]!.statement).toContain('says nothing about whether the instrument exists');
  });

  it('says so when the adapter throws its missing-capability error', async () => {
    const fetchByVolumePage = vi.fn(async () => {
      throw new Error(
        '[USLandRecords/Falls] Book/volume/page search (vol 412 pg 88) is NOT implemented — ' +
          'the portal\'s Book Search tab has not been driven. A missing capability, not an empty result.',
      );
    });
    const r = await runErrands(errandList(), { fetchByVolumePage });
    expect(r.counts.capability_missing).toBe(1);
    expect(r.counts.not_found).toBe(0);
  });

  it('reports a genuine empty index result as not_found, and only then', async () => {
    const r = await runErrands(errandList(), { fetchByVolumePage: async () => [] });
    expect(r.counts.not_found).toBe(1);
    expect(r.outcomes[0]!.statement).toContain("county's ONLINE index");
  });

  it('does not misfile a network error as a missing capability', async () => {
    // A transient failure recorded as "this county does not offer book/page search" would stop us
    // ever asking again.
    const r = await runErrands(errandList(), {
      fetchByVolumePage: async () => { throw new Error('socket hang up'); },
    });
    expect(r.counts.search_failed).toBe(1);
    expect(r.counts.capability_missing).toBe(0);
    expect(r.outcomes[0]!.nextStep).toContain('Retry');
  });

  it('classifies the adapters\' real phrasings', () => {
    expect(classifyFetchError('A missing capability, not an empty result.')).toBe('capability_missing');
    expect(classifyFetchError('Book search is NOT implemented')).toBe('capability_missing');
    expect(classifyFetchError('No legal-description search is offered')).toBe('capability_missing');
    expect(classifyFetchError('This vendor publishes NO instrument numbers')).toBe('capability_missing');
    expect(classifyFetchError('ETIMEDOUT')).toBe('search_failed');
    expect(classifyFetchError('Target page, context or browser has been closed')).toBe('search_failed');
  });

  it('never totals the unresolved reasons together', async () => {
    const r = await runErrands(
      errandsFromGaps([
        gap({ citedIn: 'a', missing: 'Volume 1, Page 1' }),
        gap({ citedIn: 'b', missing: 'Volume 2, Page 2' }),
      ]).errands,
      { fetchByVolumePage: async (v) => (v === '1' ? [] : Promise.reject(new Error('socket hang up'))) },
    );
    expect(r.statement).toContain('NOT in the county');
    expect(r.statement).toContain('worth retrying');
    expect(r.statement).not.toMatch(/2 unresolved/);
  });
});

describe('what it retrieves', () => {
  it('resolves a citation to an instrument', async () => {
    const r = await runErrands(errandsFromGaps([gap()]).errands, {
      fetchByVolumePage: async () => [candidate()],
    });
    expect(r.counts.resolved).toBe(1);
    expect(r.resolved).toHaveLength(1);
    expect(r.outcomes[0]!.statement).toContain('SMITH JOHN to JONES MARY');
  });

  it('uses the instrument search for an instrument citation', async () => {
    const fetchByInstrument = vi.fn(async () => [candidate('2019-12345')]);
    const r = await runErrands(
      errandsFromGaps([gap({ missing: 'Instrument No. 2019-12345' })]).errands,
      { fetchByInstrument },
    );
    expect(fetchByInstrument).toHaveBeenCalledWith('2019-12345');
    expect(r.counts.resolved).toBe(1);
  });

  it('does not silently pick one when a citation matches several', async () => {
    // Two documents at one citation is a fact about the county's index, not an ambiguity for us to
    // resolve. Adding a guess to the chain builds it for possibly the wrong land.
    const r = await runErrands(errandsFromGaps([gap()]).errands, {
      fetchByVolumePage: async () => [candidate('A'), candidate('B')],
    });
    expect(r.resolved).toHaveLength(0);
    expect(r.outcomes[0]!.statement).toContain('not unique in this county');
    expect(r.statement).toContain('left for a person to choose between');
  });
});

describe('it stops, and says it stopped', () => {
  it('respects the search ceiling and marks the rest as unreached', async () => {
    const gaps = Array.from({ length: 5 }, (_, i) => gap({ citedIn: `d${i}`, missing: `Volume ${i + 1}, Page 1` }));
    const r = await runErrands(errandsFromGaps(gaps).errands, {
      fetchByVolumePage: async () => [candidate()],
    }, { maxSearches: 2 });

    expect(r.searchesMade).toBe(2);
    expect(r.counts.skipped_budget).toBe(3);
    // Not reported as absent — nobody looked.
    expect(r.counts.not_found).toBe(0);
    expect(r.statement).toContain('never reached');
  });

  it('lets the run budget stop it', async () => {
    const r = await runErrands(errandsFromGaps([gap()]).errands, {
      fetchByVolumePage: async () => [candidate()],
    }, { mayContinue: () => false });
    expect(r.counts.skipped_budget).toBe(1);
    expect(r.searchesMade).toBe(0);
  });

  it('one broken search does not discard the others', async () => {
    let n = 0;
    const r = await runErrands(
      errandsFromGaps([
        gap({ citedIn: 'a', missing: 'Volume 1, Page 1' }),
        gap({ citedIn: 'b', missing: 'Volume 2, Page 2' }),
      ]).errands,
      { fetchByVolumePage: async () => { if (n++ === 0) throw new Error('socket hang up'); return [candidate()]; } },
    );
    expect(r.outcomes).toHaveLength(2);
    expect(r.counts.resolved).toBe(1);
  });

  it('says plainly when there was nothing to do', async () => {
    const r = await runErrands([], {});
    expect(r.statement).toContain('cites no instruments it does not already contain');
  });
});

describe('a citation and the instrument it returns must match up again', () => {
  // The round trip that did not hold: the deed recites "Volume 412, Page 88", which normalises to
  // VOL412PG88; the county returns that instrument numbered V412P88. Nothing derived one from the
  // other, so the gap stayed open with the deed already in hand — and the next run would fetch it
  // again, paying again on a paid platform.

  it('derives the volume/page key from a lettered instrument number', async () => {
    const { linkInstrumentKeys } = await import('../chain-of-title/chain-gaps.js');
    const link = { instrument: 'V412P88' } as never;
    expect(linkInstrumentKeys(link)).toContain('VOL412PG88');
  });

  it('handles the other spellings counties use', async () => {
    const { linkInstrumentKeys } = await import('../chain-of-title/chain-gaps.js');
    for (const raw of ['V412P88', 'V.412 PG.88', 'VOL412PG88', 'Volume 412 Page 88', '412/88']) {
      expect(linkInstrumentKeys({ instrument: raw } as never), raw).toContain('VOL412PG88');
    }
  });

  it('trusts the recorded citation key over any derivation', async () => {
    // Instrument formats vary by county and century; a derivation good enough for Bell will be wrong
    // somewhere. The key we actually searched for is not an inference.
    const { linkInstrumentKeys } = await import('../chain-of-title/chain-gaps.js');
    const link = { instrument: 'SOMETHING-ODD-1234', resolvedCitations: ['VOL412PG88'] } as never;
    expect(linkInstrumentKeys(link)).toContain('VOL412PG88');
  });

  it('pairs each retrieval with the citation that asked for it', async () => {
    const r = await runErrands(errandsFromGaps([gap()]).errands, {
      fetchByVolumePage: async () => [candidate('V412P88')],
    });
    expect(r.resolved[0]).toMatchObject({ citationKey: 'VOL412PG88', citationRaw: 'Volume 412, Page 88' });
    expect(r.resolved[0]!.link.instrument).toBe('V412P88');
  });
});
