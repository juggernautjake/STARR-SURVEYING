// The argument R14 was missing.
//
// `chain-gaps`, `chain-walker`, `chain-errands` and `chain-builder` are all real, all tested, and
// all reached from `worker/src/index.ts`. The backward re-query was still completely inert, because
// the builder takes its searches as OPTIONAL constructor options and its only caller passed no
// options object at all:
//
//     new ChainOfTitleBuilder(maxDepth || 5, ANALYSIS_DIR)
//
// Every module degrades honestly when its dependency is absent — which is precisely why nothing
// failed, no test caught it, and a feature that never once queried a clerk index looked like a
// working one. "Wired but never fed" is a quieter version of authored-but-not-wired and does not
// show up in a caller grep.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { searchDepsFromAdapter, toWalkCandidate } from '../chain-of-title/chain-search-deps.js';
import type { ClerkAdapter, ClerkDocumentResult } from '../adapters/clerk-adapter.js';

const row = (o: Partial<ClerkDocumentResult> = {}): ClerkDocumentResult => ({
  instrumentNumber: '2014-0012345',
  documentType: 'deed' as ClerkDocumentResult['documentType'],
  recordingDate: '2014-06-02',
  grantors: ['SMITH, JOHN'],
  grantees: ['JONES, MARY'],
  source: 'test',
  ...o,
});

/** Only the three methods the deps use. */
const fakeAdapter = (over: Partial<ClerkAdapter> = {}) => ({
  searchByGranteeName: async () => [row()],
  searchByVolumePage: async () => [row()],
  searchByInstrumentNumber: async () => [row()],
  ...over,
}) as unknown as ClerkAdapter;

describe('a clerk result becomes something the walk can use', () => {
  it('keeps every grantor rather than the first', () => {
    // A deed from three siblings to one buyer names three grantors. Dropping two breaks the NEXT
    // link: the following deed's grantee is a name this one no longer mentions, and the chain
    // reports a broken link that is only broken because we discarded the evidence.
    const c = toWalkCandidate(row({ grantors: ['SMITH, JOHN', 'SMITH, ANN', 'SMITH, RAY'] }));
    expect(c.grantor).toBe('SMITH, JOHN; SMITH, ANN; SMITH, RAY');
  });

  it('falls back to the volume/page when there is no instrument number', () => {
    // Avenu's records have no instrument numbers at all; an empty identifier would make the link
    // unciteable in the packet.
    const c = toWalkCandidate(row({ instrumentNumber: '', volumePage: { volume: '412', page: '88' } }));
    expect(c.instrument).toBe('Vol 412 Pg 88');
  });

  it('does not invent a confidence score', () => {
    // The adapters do not offer one. Scoring here would be scoring our own guess — chain-walker has
    // its own matching rules and is the right place for it.
    expect(toWalkCandidate(row()).score).toBeUndefined();
  });

  it('survives a row with no parties rather than throwing', () => {
    const c = toWalkCandidate(row({ grantors: undefined as never, grantees: undefined as never }));
    expect(c.grantor).toBe('');
    expect(c.grantee).toBe('');
  });
});

describe('the deps built from an adapter', () => {
  it('gives the builder all three searches', () => {
    const d = searchDepsFromAdapter(fakeAdapter());
    expect(typeof d.searchAsGrantee).toBe('function');
    expect(typeof d.fetchByVolumePage).toBe('function');
    expect(typeof d.fetchByInstrument).toBe('function');
  });

  it('searches BEFORE the date, which is what keeps the walk going backwards', () => {
    // The deed that conveyed TO this person was recorded before the deed that conveyed FROM them.
    // Without `dateTo` the search finds the same conveyance again and the walk stalls.
    let seen: unknown = null;
    const d = searchDepsFromAdapter(fakeAdapter({
      searchByGranteeName: (async (_n: string, o: unknown) => { seen = o; return [row()]; }) as never,
    }));
    return d.searchAsGrantee!('JONES, MARY', '2014-06-02').then(() => {
      expect(seen).toMatchObject({ dateTo: '2014-06-02' });
    });
  });

  it('returns no deps at all when there is no adapter', () => {
    // Which restores the previous behaviour exactly: walk the harvested documents, search nothing.
    expect(searchDepsFromAdapter(null)).toEqual({});
  });

  it('lets a "capability missing" throw travel, instead of turning it into an empty result', async () => {
    // Several adapters deliberately throw on searchByVolumePage. chain-errands has five outcomes and
    // `capability_missing` is a different fact from `not_found` — collapsing them puts
    // "Volume 412, Page 88 — not found" in a packet about a deed sitting in the courthouse,
    // indexed and findable by anyone who walks in. The surveyor stops looking.
    const d = searchDepsFromAdapter(fakeAdapter({
      searchByVolumePage: (async () => {
        throw new Error('Book/volume/page search is NOT implemented for this portal.');
      }) as never,
    }));
    await expect(d.fetchByVolumePage!('412', '88')).rejects.toThrow('NOT implemented');
  });

  it('does not decide for the adapter what it cannot do', () => {
    // Omitting a dep because we guessed the portal lacked the search would be us answering a
    // question the portal answers. The dep is always supplied when an adapter exists.
    const d = searchDepsFromAdapter(fakeAdapter({
      searchByVolumePage: (async () => { throw new Error('nope'); }) as never,
    }));
    expect(d.fetchByVolumePage).toBeDefined();
  });
});

describe('the endpoint actually supplies them', () => {
  // The entire point. A dep factory nobody calls leaves the re-query exactly as inert as it was.
  const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('builds the deps from the county\'s clerk adapter', () => {
    expect(index).toContain('searchDepsFromAdapter(getClerkAdapter(fips, name))');
  });

  it('passes them to the builder, which previously got no options at all', () => {
    expect(index).toMatch(/new ChainOfTitleBuilder\(\s*maxDepth \|\| 5,\s*ANALYSIS_DIR,\s*searchDeps,/);
  });

  it('passes the index horizon through', () => {
    // Turns "we found nothing earlier" into "the clerk's index begins in 1902" — the difference
    // between an unfinished job and a finished one.
    expect(index).toContain('indexBeginsYear ? { indexBeginsYear } : {}');
  });

  it('says when NO searches were run, rather than leaving the two cases identical', () => {
    // A chain built without a county walks only harvested documents, and a reader cannot tell that
    // from the chain itself. It is the difference between "no earlier deed exists" and "nobody went
    // to look".
    expect(index).toContain('NO clerk searches were run');
    expect(index).toContain('searchedWith');
  });
});
