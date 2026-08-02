// Going back for the deeds we do not have (research plan R14, second half).
//
// R14 made the chain honest: it says why it stopped and lists the instruments it cites but does not
// contain. What it could not do is FETCH them — `traceChain()` walks only documents already
// harvested, so `grantor_deed_not_found` was reported as a gap rather than closed.
//
// Every iteration here is a clerk search and usually a document fetch — minutes, and on a paid
// platform money. A walk that runs until it finds nothing spends the whole run budget on one
// property's 1890s history while the rest of the research does not happen.
//
// And a wrong link does not give a slightly wrong chain. It gives a chain for SOMEBODY ELSE'S LAND,
// and every conclusion after it is about the wrong tract.

import { describe, it, expect, vi } from 'vitest';
import {
  AMBIGUITY_MARGIN,
  DEFAULT_MAX_LINKS,
  chooseCandidate,
  scoreCandidate,
  walkBack,
  type WalkCandidate,
} from '../chain-of-title/chain-walker.js';

const cand = (over: Partial<WalkCandidate> = {}): WalkCandidate => ({
  instrument: 'I-1',
  grantor: 'ADAMS, ROBERT',
  grantee: 'SMITH, JOHN A',
  recordingDate: '1974-03-02',
  documentType: 'warranty deed',
  ...over,
});

describe('scoring a candidate', () => {
  it('scores a full name match above a surname-only one', () => {
    // A surname alone is not an identification.
    const full = scoreCandidate(cand(), 'SMITH, JOHN A', '2019-06-01');
    const surname = scoreCandidate(cand({ grantee: 'SMITH, WILLIAM' }), 'SMITH, JOHN A', '2019-06-01');
    expect(full).toBeGreaterThan(surname);
  });

  it('refuses a candidate recorded AFTER the deed it should precede', () => {
    // A later instrument is a subsequent conveyance, not the acquisition we are looking for.
    expect(scoreCandidate(cand({ recordingDate: '2020-01-01' }), 'SMITH, JOHN A', '2019-06-01')).toBe(0);
  });

  it('scores on the NAME only, leaving date to the chooser', () => {
    // Mixing the two produced a scorer that called two deeds to one person "ambiguous" merely
    // because one was 5 years before and the other 25 — which is the normal case, not an ambiguity.
    const near = scoreCandidate(cand({ recordingDate: '2015-01-01' }), 'SMITH, JOHN A', '2019-06-01');
    const far = scoreCandidate(cand({ recordingDate: '1930-01-01' }), 'SMITH, JOHN A', '2019-06-01');
    expect(near).toBe(far);
  });

  it('discounts an undated candidate rather than trusting it', () => {
    // It cannot be shown to precede anything.
    const dated = scoreCandidate(cand(), 'SMITH, JOHN A', '2019-06-01');
    const undated = scoreCandidate(cand({ recordingDate: '' }), 'SMITH, JOHN A', '2019-06-01');
    expect(undated).toBeLessThan(dated);
  });

  it('scores a name with nothing in common at zero', () => {
    expect(scoreCandidate(cand({ grantee: 'JONES, MARY' }), 'SMITH, JOHN A', '2019-06-01')).toBe(0);
  });

  it('ignores entity boilerplate', () => {
    // "Smith Family Trust" and "Jones Family Trust" share FAMILY and TRUST and are different parties.
    expect(scoreCandidate(cand({ grantee: 'JONES FAMILY TRUST' }), 'SMITH FAMILY TRUST', '2019-06-01')).toBe(0);
  });
});

describe('choosing, and refusing to choose', () => {
  it('takes a clear best match', () => {
    const c = chooseCandidate([cand(), cand({ instrument: 'I-2', grantee: 'JONES, MARY' })], 'SMITH, JOHN A', '2019-06-01');
    expect(c.chosen?.instrument).toBe('I-1');
  });

  it('stops on two same-day matches instead of guessing', () => {
    // Taking either builds a chain that looks complete and may be somebody else's land.
    const c = chooseCandidate([
      cand({ instrument: 'A' }),
      cand({ instrument: 'B' }),
    ], 'SMITH, JOHN A', '2019-06-01');
    expect(c.chosen).toBeNull();
    expect(c.ambiguous).toBe(true);
    expect(c.reason).toContain("somebody else's land");
  });

  it('takes the most recent conveyance when a party acquired more than once', () => {
    // Bought, sold, bought again is ordinary. The acquisition is the one immediately before the
    // deed we hold — exactly as a surveyor would take it — not an ambiguity to stop on.
    const c = chooseCandidate([
      cand({ instrument: 'OLD', recordingDate: '1970-01-01' }),
      cand({ instrument: 'RECENT', recordingDate: '1990-01-01' }),
    ], 'SMITH, JOHN A', '2019-06-01');
    expect(c.chosen?.instrument).toBe('RECENT');
    expect(c.ambiguous).toBe(false);
    // The one it passed over is reported, not silently dropped.
    expect(c.reason).toContain('passed over as predecessors');
  });

  it('refuses an undated instrument and says that is why', () => {
    // It cannot be shown to precede the deed we hold. Saying so specifically beats "no good match":
    // the record may well be the right one and only its date is missing.
    const c = chooseCandidate([cand({ instrument: 'A', recordingDate: '' })], 'SMITH, JOHN A', '2019-06-01');
    expect(c.chosen).toBeNull();
    expect(c.reason).toContain('no usable recording date');
    expect(c.reason).toContain('read them by hand');
  });

  it('refuses a weak partial match', () => {
    const c = chooseCandidate([cand({ grantee: 'SMITH, WILLIAM T' })], 'SMITH, JOHN A ET UX', '2019-06-01');
    expect(c.chosen).toBeNull();
    expect(c.reason).toContain('not an identification');
  });

  it('says plainly when nothing came back', () => {
    const c = chooseCandidate([], 'SMITH, JOHN A', '2019-06-01');
    expect(c.chosen).toBeNull();
    expect(c.ambiguous).toBe(false);
    expect(c.reason).toContain('No instrument was returned');
  });

  it('keeps a margin wide enough to matter', () => {
    expect(AMBIGUITY_MARGIN).toBeGreaterThan(0.05);
  });
});

describe('the walk stops, and says which stop it was', () => {
  const chain = (n: number): WalkCandidate[] =>
    Array.from({ length: n }, (_, i) => cand({
      instrument: `I-${i}`,
      grantee: i === 0 ? 'ADAMS, ROBERT' : `OWNER${i - 1}`,
      grantor: `OWNER${i}`,
      recordingDate: `${1990 - i * 5}-01-01`,
    }));

  it('walks back through several links', async () => {
    const links = chain(3);
    const search = vi.fn(async (grantee: string) => links.filter(l => l.grantee.includes(grantee.split(',')[0]!)));
    const r = await walkBack({ grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' }, { searchAsGrantee: search });
    expect(r.links.length).toBeGreaterThan(0);
  });

  it('calls the index horizon a COMPLETE chain, not a failure', async () => {
    const r = await walkBack(
      { grantor: 'ADAMS, ROBERT', recordingDate: '1900-01-01' },
      { searchAsGrantee: async () => [] },
      { indexBeginsYear: 1902 },
    );
    expect(r.stop).toBe('index_horizon');
    expect(r.statement).toContain('complete as far as the record goes');
    expect(r.nextStep).toBe('');
  });

  /** A clerk that always answers: the instrument conveys TO whoever is being sought, from a new
   *  party, dated earlier each time. This is what an endless chain looks like. */
  const endlessClerk = () => {
    let n = 0;
    return async (grantee: string, before: string) => {
      const year = new Date(Date.parse(before)).getUTCFullYear() - 5;
      n++;
      return [cand({
        instrument: `X-${n}`,
        grantee,                       // matches who we asked for
        grantor: `PRIOR OWNER ${n}`,   // a new party each time
        recordingDate: `${year}-01-01`,
      })];
    };
  };

  it('names the depth limit as OUR limit', async () => {
    const r = await walkBack(
      { grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' },
      { searchAsGrantee: endlessClerk() },
      { maxLinks: 3 },
    );
    expect(r.stop).toBe('max_links');
    expect(r.links).toHaveLength(3);
    expect(r.statement).toContain('NOT at the end of the record');
  });

  it('stops when the run budget says so', async () => {
    let calls = 0;
    const r = await walkBack(
      { grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' },
      { searchAsGrantee: endlessClerk() },
      { mayContinue: () => ++calls <= 2 },
    );
    expect(r.stop).toBe('budget_exhausted');
    expect(r.nextStep).toContain('larger chain budget');
    // It stopped well before the depth limit, which is the point.
    expect(r.links.length).toBeLessThan(DEFAULT_MAX_LINKS);
  });

  it('caps the searches, which are the real cost', async () => {
    const search = vi.fn(async () => []);
    await walkBack({ grantor: 'A', recordingDate: '1995-01-01' }, { searchAsGrantee: search }, { maxSearches: 1 });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('does NOT stop merely because a name repeats', async () => {
    // Chains genuinely revisit names: land goes into a trust and back out, a widow reconveys to
    // herself and a new spouse. Stopping at the first repeated name would truncate real chains.
    const deeds = [
      cand({ instrument: 'A', grantee: 'ADAMS, ROBERT', grantor: 'ADAMS FAMILY HOLDINGS', recordingDate: '1990-01-01' }),
      cand({ instrument: 'B', grantee: 'ADAMS FAMILY HOLDINGS', grantor: 'ADAMS, ROBERT', recordingDate: '1985-01-01' }),
      cand({ instrument: 'C', grantee: 'ADAMS, ROBERT', grantor: 'PRIOR OWNER', recordingDate: '1970-01-01' }),
    ];
    const search = async (grantee: string, before: string) =>
      deeds.filter(d => d.grantee === grantee && Date.parse(d.recordingDate) < Date.parse(before));

    const r = await walkBack({ grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' }, { searchAsGrantee: search });
    // ADAMS, ROBERT is sought twice and the walk keeps going.
    expect(r.links.map(l => l.instrument)).toEqual(['A', 'B', 'C']);
  });

  it('stops when the same INSTRUMENT comes back a second time', async () => {
    // The same instrument twice means we are going round.
    const loop = [
      cand({ instrument: 'LOOP', grantee: 'ADAMS, ROBERT', grantor: 'BAKER, SUE', recordingDate: '1990-01-01' }),
      cand({ instrument: 'LOOP', grantee: 'BAKER, SUE', grantor: 'ADAMS, ROBERT', recordingDate: '1985-01-01' }),
    ];
    let call = 0;
    const search = async () => [loop[call++] ?? loop[1]!];
    const r = await walkBack({ grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' }, { searchAsGrantee: search });
    expect(r.stop).toBe('circular_instrument');
    expect(r.nextStep).toContain('correction deed');
  });

  it('tells a person what to do when the search finds nothing', async () => {
    const r = await walkBack({ grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' }, { searchAsGrantee: async () => [] });
    expect(r.stop).toBe('no_match_found');
    expect(r.nextStep).toContain('indexed under a spelling');
  });

  it('records every step, including the ones that found nothing', async () => {
    // A walk that reports only its successes cannot be diagnosed.
    const r = await walkBack({ grantor: 'ADAMS, ROBERT', recordingDate: '1995-01-01' }, { searchAsGrantee: async () => [] });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.searchedFor).toBe('ADAMS, ROBERT');
    expect(r.searchesMade).toBe(1);
  });

  it('has a default depth that will not eat a run', async () => {
    expect(DEFAULT_MAX_LINKS).toBeLessThanOrEqual(20);
  });
});
