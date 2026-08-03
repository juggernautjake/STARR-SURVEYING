// The coverage facts are only worth having if a search actually sets them.
//
// This repo's most common defect is authored-but-not-wired: a function that computes the right
// thing, exported, tested in isolation, and never called on the path that matters. `coverageWarning`
// and `coverageConfidence` are exactly that shape — pure functions over a table — so the wiring is
// pinned here rather than assumed.
//
// The searches themselves are not run: `nameSearch` needs a browser. The assertions are on what
// `noteCoverage` leaves behind, which is what a report reads.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn(async () => { throw new Error('no browser in tests'); }) },
}));

import { USLandRecordsAdapter } from '../adapters/uslandrecords-adapter.js';

/** Drive only the coverage bookkeeping — the network search is expected to fail and is irrelevant. */
async function searchAndIgnoreNetwork(adapter: USLandRecordsAdapter, from?: Date): Promise<void> {
  await adapter
    .searchByGrantorName('SMITH', from ? ({ from } as never) : undefined)
    .catch(() => undefined);
}

describe('a search records what is known about the county s coverage', () => {
  let adapter: USLandRecordsAdapter;

  beforeEach(() => {
    adapter = new USLandRecordsAdapter('48465', 'Val Verde');
  });

  it('starts with nothing claimed', () => {
    expect(adapter.lastCoverageConfidence).toBeNull();
    expect(adapter.lastCoverageWarning).toBeNull();
  });

  it('sets the confidence on every search, warning or not', async () => {
    await searchAndIgnoreNetwork(adapter);
    // Val Verde publishes no certification banner — its coverage comes from a welcome sentence.
    expect(adapter.lastCoverageConfidence).toContain('STATED IN PROSE, not certified');
  });

  it('sets it even when the search window is well inside coverage', async () => {
    await searchAndIgnoreNetwork(adapter, new Date(2015, 0, 1));
    expect(adapter.lastCoverageWarning).toBeNull();       // nothing wrong with this search…
    expect(adapter.lastCoverageConfidence).not.toBeNull(); // …but the county is still prose-only
  });

  it('warns when the search reaches before the index does', async () => {
    await searchAndIgnoreNetwork(adapter, new Date(1950, 0, 1));
    expect(adapter.lastCoverageWarning).toContain('UNSEARCHABLE ONLINE, never as "no records"');
  });

  it('reports a certified county as certified', async () => {
    const robertson = new USLandRecordsAdapter('48395', 'Robertson');
    await searchAndIgnoreNetwork(robertson);
    expect(robertson.lastCoverageConfidence).toContain('CERTIFIED');
  });

  it('reports the self-contradicting county as disputed', async () => {
    const sanAugustine = new USLandRecordsAdapter('48405', 'San Augustine');
    await searchAndIgnoreNetwork(sanAugustine, new Date(1838, 1, 26));
    expect(sanAugustine.lastCoverageConfidence).toContain('DISPUTED');
    expect(sanAugustine.lastCoverageWarning).toContain('an EMPTY result is UNCERTAIN');
  });
});

describe('a county with no portal here is refused, not guessed', () => {
  it('names the counties it does serve instead of returning nothing', () => {
    // Constructing for an unknown county must throw with the list, not silently pick a subdomain.
    expect(() => new USLandRecordsAdapter('48035', 'Bosque')).toThrow(/no known portal/i);
    expect(() => new USLandRecordsAdapter('48035', 'Bosque')).toThrow(/Val Verde/);
  });

  it('builds the multi-word counties that would 404 if the path were derived from the name', () => {
    expect(() => new USLandRecordsAdapter('48407', 'San Jacinto')).not.toThrow();
    expect(() => new USLandRecordsAdapter('48405', 'San Augustine')).not.toThrow();
    expect(() => new USLandRecordsAdapter('48465', 'Val Verde')).not.toThrow();
  });
});
