// The builder must actually RUN the errands (plan R14, third half).
//
// chain-errands.ts is a pure module over a gap list, so its own tests pass whether or not anything
// calls it — the authored-but-not-wired shape this repo keeps producing, and which S-13/S-14 caught
// two days ago in the purchase path. These assertions are about ChainOfTitleBuilder: given a deed
// that recites an ancestor nobody harvested, does the chain come back longer?
//
// One behaviour here is easy to get wrong and worth stating. The NAME walk only runs when the chain
// ended in `grantor_deed_not_found` — searching after we reached the sovereignty grant would spend a
// run's budget re-proving what we know. The ERRANDS are not conditional on the ending at all: a
// chain can be complete by every other measure and still recite a partition deed nobody pulled.
// Being named is what makes an instrument fetchable, and the walk's stopping condition says nothing
// about it.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import { ChainOfTitleBuilder } from '../chain-of-title/chain-builder.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() };
});

const OUT = '/tmp/analysis-test';

/** Two harvested deeds that join, the older of which recites an ancestor nobody harvested. */
function documents() {
  return [
    { instrument: '2019-3389', type: 'deed', recordingDate: '2019-03-14', source: 'kofile' },
    { instrument: '1974-118', type: 'deed', recordingDate: '1974-06-02', source: 'kofile' },
  ];
}

function extraction() {
  return {
    documents: [
      { instrument: '2019-3389', grantor: 'JONES MARY', grantee: 'CURRENT OWNER', legalDescription: 'Lot 4, Block 2' },
      {
        instrument: '1974-118',
        grantor: 'SMITH JOHN',
        grantee: 'JONES MARY',
        // The citation that becomes the errand.
        legalDescription: 'being the same land conveyed in Volume 412, Page 88',
      },
    ],
  };
}

const ancestor = {
  instrument: 'V412P88',
  grantor: 'EARLY OWNER',
  grantee: 'SMITH JOHN',
  recordingDate: '1951-04-10',
};

describe('the builder runs the errands its own gap list wrote', () => {
  it('fetches a cited instrument and adds it to the chain', async () => {
    const fetchByVolumePage = vi.fn(async () => [ancestor]);
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage });

    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());

    expect(fetchByVolumePage).toHaveBeenCalledWith('412', '88');
    expect(result.chain.map((l) => l.instrument)).toContain('V412P88');
    expect(result.chainErrands?.counts.resolved).toBe(1);
  });

  it('marks a fetched link as coming from a citation, and names the citation', async () => {
    // Stronger provenance than the name walk's links, and the packet should be able to say which
    // deed sent us for it.
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage: async () => [ancestor] });
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());
    const added = result.chain.find((l) => l.instrument === 'V412P88');
    expect(added?.source).toContain('clerk-search (cited as');
    expect(added?.source).toContain('Volume 412, Page 88');
  });

  it('records the citation key on the link, so the gap can be matched to the deed', async () => {
    // The load-bearing detail: `VOL412PG88` and the county's own `V412P88` do not normalise to each
    // other, so without this the gap stays open with the deed in hand — and the next run re-fetches
    // it, paying again on a paid platform.
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage: async () => [ancestor] });
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());
    const added = result.chain.find((l) => l.instrument === 'V412P88');
    expect(added?.resolvedCitations).toContain('VOL412PG88');
  });

  it('keeps the chain in date order after inserting an older link', async () => {
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage: async () => [ancestor] });
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());
    const dates = result.chain.map((l) => l.recordingDate);
    expect([...dates]).toEqual([...dates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime()));
  });

  it('closes the gap it just filled', async () => {
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage: async () => [ancestor] });
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());
    const stillUnfollowed = (result.gaps ?? []).filter(
      (g) => g.kind === 'unfollowed_citation' && /412/.test(g.missing ?? ''),
    );
    expect(stillUnfollowed).toHaveLength(0);
  });
});

describe('with no citation search wired', () => {
  it('reports the errand as unsearchable rather than as absent', async () => {
    const builder = new ChainOfTitleBuilder(5, OUT);   // no fetchers
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());

    expect(result.chainErrands?.counts.capability_missing).toBe(1);
    expect(result.chainErrands?.counts.not_found).toBe(0);
    expect(result.chainErrands?.statement).toContain('unknown, not absent');
  });

  it('leaves the gap open — an errand nobody could run is still an errand', async () => {
    const builder = new ChainOfTitleBuilder(5, OUT);
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());
    expect((result.gaps ?? []).some((g) => /412/.test(g.missing ?? ''))).toBe(true);
  });

  it('does not report the chain as complete on the strength of an unrun errand', async () => {
    const builder = new ChainOfTitleBuilder(5, OUT);
    const result = await builder.buildChain('p1', 'CURRENT OWNER', documents(), extraction());
    expect(result.completeness?.complete).toBe(false);
  });
});

describe('errands do not depend on how the chain ended', () => {
  it('runs them even when nothing was left to walk', async () => {
    // Only one deed, and it recites an ancestor. There is no name walk to do here — the point is
    // that the citation is still fetchable, and a chain that ends "cleanly" can still be short a deed.
    const fetchByVolumePage = vi.fn(async () => [ancestor]);
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage });

    const result = await builder.buildChain(
      'p1',
      'CURRENT OWNER',
      [{ instrument: '2019-3389', type: 'deed', recordingDate: '2019-03-14' }],
      {
        documents: [
          {
            instrument: '2019-3389',
            grantor: 'SMITH JOHN',
            grantee: 'CURRENT OWNER',
            legalDescription: 'being the same land conveyed in Volume 412, Page 88',
          },
        ],
      },
    );

    expect(fetchByVolumePage).toHaveBeenCalled();
    expect(result.chain.map((l) => l.instrument)).toContain('V412P88');
  });

  it('is absent entirely when the chain cites nothing it lacks', async () => {
    const builder = new ChainOfTitleBuilder(5, OUT, { fetchByVolumePage: async () => [] });
    const result = await builder.buildChain(
      'p1',
      'CURRENT OWNER',
      [{ instrument: '2019-3389', type: 'deed', recordingDate: '2019-03-14' }],
      { documents: [{ instrument: '2019-3389', grantor: 'SMITH JOHN', grantee: 'CURRENT OWNER', legalDescription: 'Lot 4, Block 2' }] },
    );
    expect(result.chainErrands).toBeUndefined();
  });
});
