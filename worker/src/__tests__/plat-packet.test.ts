// The plat packet, and whether it actually contains the plats (plan R15).
//
// R15's acceptance is "for a platted lot the packet contains the governing plat". The pipeline named
// the governing plat and stopped — `platPacketFor()` had no callers, and `PlatInstrument.imagePaths`
// was declared and never populated. In a rendered packet, a lot governed by an instrument number
// with no image looks exactly like a lot whose replat is there to be opened.
//
// The distribution of that failure is the reason it matters. The plat we are most likely to HOLD is
// the superseded one — it is the one the CAD and the deed reference, so it is the one the harvest
// found. So the packet tends to be missing an image for precisely the document that governs, while
// showing one for the document that does not.

import { describe, it, expect } from 'vitest';
import {
  assemblePlatPacket,
  findHeldPlat,
  summarisePlatPackets,
  type HeldPlatDocument,
} from '../services/plat-packet.js';
import { buildPlatHistory, governingPlatFor } from '../services/plat-history.js';

/** Sunset Acres: an original plat, and a replat covering Lots 4-7 of Block 2 only. */
function history() {
  return buildPlatHistory('Sunset Acres', [
    { instrument: '1962-100', title: 'Sunset Acres', recordingDate: '1962-05-01' },
    { instrument: '2004-11872', title: 'Replat of Lots 4-7, Block 2, Sunset Acres', recordingDate: '2004-09-14' },
  ]);
}

const held = (instrument: string, over: Partial<HeldPlatDocument> = {}): HeldPlatDocument => ({
  instrument,
  documentLabel: `Plat ${instrument}`,
  pagesPdfUrl: `https://example.test/${instrument}.pdf`,
  pageCount: 2,
  ...over,
});

/** Lot 5 Block 2 — governed by the replat. */
const lot5 = () => governingPlatFor(history(), '5', '2');
/** Lot 40 Block 3 — the replat does not reach it, so the original still governs. */
const lot40 = () => governingPlatFor(history(), '40', '3');

describe('naming a plat is not containing it', () => {
  it('says the governing plat is NOT in the packet when we do not hold it', () => {
    // We hold the ORIGINAL — the one the CAD references — and not the replat that governs.
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), [held('1962-100')]);

    expect(p.governingInstrument).toBe('2004-11872');
    expect(p.governingImageStatus).toBe('not_held');
    expect(p.statement).toContain('NOT in this packet');
    expect(p.statement).toContain('only its number is');
  });

  it('warns against reading dimensions off the superseded plat we DO hold', () => {
    // This is the specific way the failure hurts: the plat that is present is the wrong one.
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), [held('1962-100')]);
    expect(p.statement).toContain('must not be read from the superseded plats');
  });

  it('raises an errand naming the plat to pull', () => {
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), [held('1962-100')]);
    expect(p.nextSteps.some((s) => s.includes('2004-11872') && /governs/.test(s))).toBe(true);
  });

  it('is satisfied when the governing plat is in hand', () => {
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), [held('2004-11872'), held('1962-100')]);
    expect(p.governingImageStatus).toBe('held');
    expect(p.statement).toContain('which is in this packet');
    expect(p.nextSteps.filter((s) => s.includes('2004-11872'))).toHaveLength(0);
  });
});

describe('"not checked" is not "not held"', () => {
  it('claims nothing when no document list was supplied', () => {
    const p = assemblePlatPacket('Lot 5 Block 2', lot5());          // undefined, not []
    expect(p.governingImageStatus).toBe('not_checked');
    expect(p.statement).toContain('was not checked');
    // No errands — we have not established that anything is missing.
    expect(p.nextSteps).toHaveLength(0);
  });

  it('treats an empty list as a finding, because it is one', () => {
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), []);       // we looked; we hold nothing
    expect(p.governingImageStatus).toBe('not_held');
    expect(p.nextSteps.length).toBeGreaterThan(0);
  });
});

describe('matching a plat to a document we hold', () => {
  it('matches across punctuation, as the purchase ledger does', () => {
    // `2004-11872` cited, `200411872` stored. A literal comparison reports a plat we are holding as
    // missing, and sends somebody to the courthouse for it.
    expect(findHeldPlat('2004-11872', [held('200411872')])).not.toBeNull();
  });

  it('matches through the storage filename prefix', () => {
    expect(findHeldPlat('2004-11872', [held('plat_2004-11872')])).not.toBeNull();
  });

  it('does not match a different instrument', () => {
    expect(findHeldPlat('2004-11872', [held('1962-100')])).toBeNull();
  });

  it('does not match on an empty instrument', () => {
    expect(findHeldPlat('', [held('1962-100')])).toBeNull();
    expect(findHeldPlat('2004-11872', [held('')])).toBeNull();
  });
});

describe('superseded plats stay, and are labelled as not controlling', () => {
  it('includes them for the monumentation they describe', () => {
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), [held('1962-100'), held('2004-11872')]);
    const superseded = p.entries.filter((e) => e.role === 'superseded');
    expect(superseded.length).toBeGreaterThan(0);
    expect(p.statement).toContain('for the monumentation they describe');
    expect(p.statement).toContain('none of them governs this lot');
  });

  it('gives every entry a role', () => {
    const p = assemblePlatPacket('Lot 5 Block 2', lot5(), [held('1962-100')]);
    for (const e of p.entries) expect(['governing', 'modifies', 'superseded']).toContain(e.role);
  });
});

describe('a lot the replat never reached', () => {
  it('is still governed by the original', () => {
    const p = assemblePlatPacket('Lot 40 Block 3', lot40(), [held('1962-100')]);
    expect(p.governingInstrument).toBe('1962-100');
    expect(p.governingImageStatus).toBe('held');
  });
});

describe('the run-level headline leads with what is missing', () => {
  it('names the lots whose governing plat is not held', () => {
    const packets = [
      assemblePlatPacket('Lot 5 Block 2', lot5(), [held('1962-100')]),
      assemblePlatPacket('Lot 40 Block 3', lot40(), [held('1962-100')]),
    ];
    const s = summarisePlatPackets(packets);
    expect(s).toContain('1 of 2 lot(s) are governed by a plat we do NOT hold');
    expect(s).toContain('2004-11872');
  });

  it('says so plainly when everything is in hand', () => {
    const packets = [assemblePlatPacket('Lot 40 Block 3', lot40(), [held('1962-100')])];
    expect(summarisePlatPackets(packets)).toContain('have their governing plat in the packet');
  });

  it('separates unchecked from missing', () => {
    const packets = [assemblePlatPacket('Lot 5 Block 2', lot5())];
    const s = summarisePlatPackets(packets);
    expect(s).toContain('not established either way');
    expect(s).not.toContain('do NOT hold');
  });

  it('says there is nothing to report rather than reporting nothing', () => {
    expect(summarisePlatPackets([])).toContain('No platted lots');
  });
});
