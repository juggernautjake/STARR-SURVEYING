// Why the chain stopped, and what is missing (research plan R14).
//
// `traceChain()` ended on a bare `break`. Four completely different endings produced the identical
// result — a chain of N links and nothing else:
//
//   • we reached the sovereignty grant and there IS nothing earlier
//   • we hit maxDepth, which defaults to 5 and silently truncates a 1900s chain
//   • the grantor's deed exists at the courthouse but was never harvested
//   • the current owner has no deed in the harvested set at all
//
// Only the first is a complete chain. A surveyor reading the packet could not tell which of the four
// they were holding — this repo's recurring defect (an unknown rendered as an answer) applied to the
// document that decides where a boundary is.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  citedInstruments,
  describeTermination,
  findGaps,
  namesOverlap,
  summariseChain,
} from '../chain-of-title/chain-gaps.js';
import type { ChainLink } from '../types/expansion.js';

const link = (over: Partial<ChainLink> = {}): ChainLink => ({
  instrument: '2019-12345',
  type: 'deed',
  grantor: 'SMITH, JOHN A',
  grantee: 'JONES, MARY',
  recordingDate: '2019-06-01',
  considerationAmount: null,
  legalDescription: '',
  acreage: null,
  boundaryCallsExtracted: false,
  boundaryChangesDetected: [],
  measurementSystem: 'unknown',
  datumDetected: null,
  source: 'kofile',
  imagePaths: [],
  ...over,
} as unknown as ChainLink);

describe('only one ending means the chain is finished', () => {
  const chain = [link({ recordingDate: '1974-03-02', grantor: 'ADAMS, R' })];

  it('calls the depth limit OUR limit, not the record ending', () => {
    const t = describeTermination('max_depth', chain);
    expect(t.complete).toBe(false);
    expect(t.statement).toContain('NOT because the record ends');
    // Actionable: this is the one ending fixable by changing a number.
    expect(t.nextStep).toContain('depth limit');
  });

  it('distinguishes "not harvested" from "does not exist"', () => {
    const t = describeTermination('grantor_deed_not_found', chain, { countyName: 'Bell' });
    expect(t.complete).toBe(false);
    expect(t.statement).toContain('was not retrieved');
    expect(t.nextStep).toContain('as GRANTEE');
  });

  it('says an empty chain is a retrieval failure, not a finding', () => {
    // The most dangerous ending to render as an empty list, which reads as "nothing to report".
    const t = describeTermination('no_starting_deed', []);
    expect(t.complete).toBe(false);
    expect(t.statement).toContain('not a finding about the property');
  });

  it('names the index horizon when we know it', () => {
    // "We found nothing earlier" vs "the clerk's index begins in 1902" is the difference between an
    // unfinished job and a finished one.
    const t = describeTermination('reached_earliest_available', chain, {
      countyName: 'Bell', indexBeginsYear: 1902,
    });
    expect(t.complete).toBe(true);
    expect(t.statement).toContain('index begins in 1902');
    expect(t.nextStep).toBe('');
  });

  it('explains a same-party deed instead of just stopping', () => {
    const t = describeTermination('circular_reference', chain);
    expect(t.statement).toMatch(/correction deed|trust/);
  });
});

describe('what the chain cites but does not contain', () => {
  it('finds a volume-and-page recital however the typist wrote it', () => {
    const forms = ['Volume 412, Page 88', 'Vol. 412 Pg 88', 'Book 412 Page 88', 'VOL 412, PG 88'];
    for (const f of forms) {
      const [c] = citedInstruments(`being the same land conveyed in ${f} of the Deed Records`);
      expect(c?.key).toBe('VOL412PG88');
    }
  });

  it('requires a LABEL before an instrument number', () => {
    // A bare 2019-12345 in a legal description is as likely to be a lot number or a date range, and
    // a wrong citation sends somebody to the courthouse for nothing.
    expect(citedInstruments('Lot 5, Block 2019-12345')).toHaveLength(0);
    expect(citedInstruments('Instrument No. 2019-12345')).toHaveLength(1);
  });

  it('turns a recital into an errand, not a caveat', () => {
    // "87% complete" is unusable. "Pull Vol 412 Pg 88" is an afternoon's work.
    const gaps = findGaps([
      link({ instrument: '2019-12345', legalDescription: 'being the same land conveyed in Volume 412, Page 88' }),
    ]);
    const g = gaps.find((x) => x.kind === 'unfollowed_citation');
    expect(g?.missing).toContain('412');
    expect(g?.nextStep).toContain('Pull');
  });

  it('does not report a citation the chain already contains', () => {
    const gaps = findGaps([
      link({ instrument: '2019-12345', legalDescription: 'conveyed in Volume 412, Page 88' }),
      link({ instrument: 'Vol 412 Pg 88', grantee: 'SMITH, JOHN A', grantor: 'ADAMS, R', recordingDate: '1974-03-02' }),
    ]);
    expect(gaps.filter((g) => g.kind === 'unfollowed_citation')).toHaveLength(0);
  });

  it('flags an undated link, because the chain’s order is then assumed', () => {
    const gaps = findGaps([link({ recordingDate: '' })]);
    expect(gaps.some((g) => g.kind === 'undated_link')).toBe(true);
  });
});

describe('links that do not join', () => {
  it('reports a break and names the likely instrument type', () => {
    const gaps = findGaps([
      link({ instrument: 'A', grantor: 'WILLIAMS, PAT', grantee: 'JONES, MARY' }),
      link({ instrument: 'B', grantor: 'ADAMS, R', grantee: 'SMITH, JOHN A', recordingDate: '1974-03-02' }),
    ]);
    const g = gaps.find((x) => x.kind === 'broken_link');
    expect(g?.statement).toContain('does not join here');
    expect(g?.nextStep).toMatch(/probate|divorce|name change/);
  });

  it('does not invent a break from a name written two ways', () => {
    // "SMITH, JOHN A" / "John A. Smith" / "John Smith and wife Mary" are one grantee written three
    // ways. A false break in EVERY chain trains people to ignore the gap list entirely.
    expect(namesOverlap('SMITH, JOHN A', 'John A. Smith')).toBe(true);
    expect(namesOverlap('SMITH, JOHN A ET UX', 'John Smith and wife Mary Smith')).toBe(true);
    expect(namesOverlap('SMITH FAMILY TRUST', 'Jones Family Trust')).toBe(false);
  });

  it('does not treat boilerplate as identity', () => {
    // Two unrelated LLCs share the word LLC and nothing else.
    expect(namesOverlap('ACME LLC', 'BOREALIS LLC')).toBe(false);
  });
});

describe('the sentence a surveyor reads first', () => {
  const chain = [link({ recordingDate: '1974-03-02' })];

  it('leads with INCOMPLETE when it is', () => {
    const t = describeTermination('max_depth', chain);
    const s = summariseChain(chain, t, findGaps(chain));
    expect(s.complete).toBe(false);
    expect(s.headline).toContain('INCOMPLETE');
    expect(s.headline).toContain('1974');
  });

  it('will not call a chain complete while it has gaps', () => {
    // Reaching the earliest record is necessary but not sufficient: a cited deed we never pulled is
    // still a hole, whatever the walk's ending was.
    const gappy = [link({ legalDescription: 'conveyed in Volume 412, Page 88' })];
    const t = describeTermination('reached_earliest_available', gappy);
    expect(t.complete).toBe(true);
    expect(summariseChain(gappy, t, findGaps(gappy)).complete).toBe(false);
  });

  it('says complete only when the walk finished and nothing is missing', () => {
    const t = describeTermination('reached_earliest_available', chain);
    expect(summariseChain(chain, t, []).headline).toContain('Chain complete');
  });
});

describe('the wiring', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/chain-of-title/chain-builder.ts'), 'utf8',
  );

  it('returns a reason from the walk instead of a bare break', () => {
    for (const reason of ['grantor_deed_not_found', 'max_depth', 'no_starting_deed', 'circular_reference']) {
      expect(src).toContain(`'${reason}'`);
    }
    // The old shape returned a bare array, so no caller could be told why it ended.
    expect(src).toContain('{ chain: ChainLink[]; reason: TerminationReason }');
  });

  it('puts the termination and gaps on the result', () => {
    expect(src).toMatch(/termination,\s*\n\s*gaps,\s*\n\s*completeness,/);
  });

  it('stops logging "Complete" for a truncated chain', () => {
    expect(src).not.toContain('[ChainOfTitle] Complete:');
  });
});
