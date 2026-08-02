// Which plat actually governs this lot (research plan R15).
//
// `searchForAmendments()` finds replats, amended plats and vacating plats and returns a flat list.
// Nothing decided WHICH controls the lot being surveyed, so the pipeline read dimensions off
// whichever plat was found first. `lot-correlator.ts:530` already carried the comment — "WARNING:
// The CAD lot number may not always match the plat if the subdivision was replatted" — so the risk
// was known and unhandled.
//
// Reading lot dimensions off a superseded plat does not give a slightly stale answer. It gives a
// boundary in the wrong place, staked in the ground.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPlatHistory,
  classifyPlat,
  governingPlatFor,
  platPacketFor,
  platScope,
  type PlatInstrument,
} from '../services/plat-history.js';

const plat = (over: Partial<PlatInstrument> = {}): PlatInstrument => ({
  instrument: 'PLAT-1',
  title: 'Sunset Acres Subdivision',
  recordingDate: '1962-04-01',
  ...over,
});

describe('classifying the instrument', () => {
  it('reads an amended replat as a REPLAT', () => {
    // It redrew lot lines. Calling it a plain amendment loses that.
    expect(classifyPlat('Amended Replat of Sunset Acres')).toBe('replat');
  });

  it('recognises the forms a clerk actually types', () => {
    expect(classifyPlat('RE-PLAT OF LOTS 4-7')).toBe('replat');
    expect(classifyPlat('Plat Vacating Sunset Acres Unit 2')).toBe('vacating');
    expect(classifyPlat('Certificate of Correction to Plat')).toBe('correction');
    expect(classifyPlat('Sunset Acres, Section One')).toBe('original');
  });
});

describe('a replat almost never covers the whole subdivision', () => {
  it('reads an explicit lot range', () => {
    const s = platScope('Replat of Lots 4 through 7, Block 2, Sunset Acres');
    expect(s.whole).toBe(false);
    expect(s.basis).toBe('stated');
    expect(s.lots.map((l) => l.lot)).toEqual(['4', '5', '6', '7']);
    expect(s.lots.every((l) => l.block === '2')).toBe(true);
  });

  it('reads the shorthand and the ampersand forms', () => {
    expect(platScope('Replat of Lots 4-7, Block 2').lots).toHaveLength(4);
    expect(platScope('Replat of Lots 4 & 5, Block 2').lots).toHaveLength(2);
    expect(platScope('Replat of Lot 12, Block A').lots).toEqual([{ block: 'A', lot: '12' }]);
  });

  it('assumes the WHOLE subdivision when no lots are named', () => {
    // The fail-safe direction is the whole design: assuming a replat covers NOTHING would silently
    // hand back the superseded original as governing.
    const s = platScope('Replat of Sunset Acres');
    expect(s.whole).toBe(true);
    expect(s.basis).toBe('assumed_whole_no_lots_named');
  });

  it('assumes the whole subdivision when the lot clause will not parse', () => {
    // Over-claiming costs a surveyor one extra document to read. Under-claiming costs them a corner.
    const s = platScope('Replat of Lots SEVEN through TWELVE, Block 2');
    expect(s.whole).toBe(true);
    expect(s.basis).toBe('assumed_whole_unparseable');
  });

  it('refuses an absurd range rather than inventing 10,000 lots', () => {
    expect(platScope('Replat of Lots 1 through 99999').basis).toBe('assumed_whole_unparseable');
    expect(platScope('Replat of Lots 7 through 4').basis).toBe('assumed_whole_unparseable');
  });
});

describe('the governing plat is a property of the LOT', () => {
  const history = buildPlatHistory('Sunset Acres', [
    plat({ instrument: 'ORIG', title: 'Sunset Acres Subdivision', recordingDate: '1962-04-01' }),
    plat({ instrument: 'REPLAT-A', title: 'Replat of Lots 4 through 7, Block 2, Sunset Acres', recordingDate: '1998-09-15' }),
  ]);

  it('gives a replatted lot the replat', () => {
    const g = governingPlatFor(history, '5', '2');
    expect(g.governing?.instrument).toBe('REPLAT-A');
    expect(g.superseded.map((s) => s.instrument)).toEqual(['ORIG']);
    expect(g.statement).toContain('superseded ORIG');
  });

  it('leaves the other ninety lots on the original — the common case', () => {
    const g = governingPlatFor(history, '40', '2');
    expect(g.governing?.instrument).toBe('ORIG');
    expect(g.superseded).toHaveLength(0);
  });

  it('does not let a Block 2 replat govern the same lot number in Block 3', () => {
    expect(governingPlatFor(history, '5', '3').governing?.instrument).toBe('ORIG');
  });

  it('keeps the superseded plats in the packet', () => {
    // The old plat describes the monumentation actually in the ground.
    const g = governingPlatFor(history, '5', '2');
    expect(platPacketFor(g).map((p) => p.instrument)).toEqual(['REPLAT-A', 'ORIG']);
  });
});

describe('vacation removes the lot', () => {
  const history = buildPlatHistory('Sunset Acres', [
    plat({ instrument: 'ORIG', recordingDate: '1962-04-01' }),
    plat({ instrument: 'VAC', title: 'Vacating Plat of Lots 4 through 7, Block 2, Sunset Acres', recordingDate: '2004-02-11' }),
  ]);

  it('reports no governing plat and says why', () => {
    const g = governingPlatFor(history, '5', '2');
    expect(g.vacated).toBe(true);
    expect(g.governing).toBeNull();
    expect(g.statement).toContain('VACATED by VAC');
    expect(g.statement).toContain('may no longer exist');
  });

  it('does not vacate the lots it did not name', () => {
    expect(governingPlatFor(history, '40', '2').vacated).toBe(false);
  });
});

describe('a correction modifies rather than replaces', () => {
  it('keeps the plat governing and lists the correction beside it', () => {
    const history = buildPlatHistory('Sunset Acres', [
      plat({ instrument: 'ORIG', recordingDate: '1962-04-01' }),
      plat({ instrument: 'CORR', title: 'Certificate of Correction to Plat of Sunset Acres', recordingDate: '1963-01-05' }),
    ]);
    const g = governingPlatFor(history, '5', '2');
    expect(g.governing?.instrument).toBe('ORIG');
    expect(g.modifiedBy.map((m) => m.instrument)).toEqual(['CORR']);
    expect(platPacketFor(g).map((p) => p.instrument)).toEqual(['ORIG', 'CORR']);
  });
});

describe('what makes the answer uncertain is said out loud', () => {
  it('flags a replat whose scope could not be read', () => {
    const history = buildPlatHistory('Sunset Acres', [
      plat({ instrument: 'ORIG', recordingDate: '1962-04-01' }),
      plat({ instrument: 'REPLAT-B', title: 'Replat of Sunset Acres', recordingDate: '1998-09-15' }),
    ]);
    const g = governingPlatFor(history, '5', '2');
    expect(g.governing?.instrument).toBe('REPLAT-B');
    expect(g.caveats.join(' ')).toContain('does not state which lots it covers');
  });

  it('does not caveat the ORIGINAL plat for covering everything', () => {
    // An original plat covering the whole subdivision is not an assumption, it is the definition.
    const history = buildPlatHistory('Sunset Acres', [plat({ instrument: 'ORIG' })]);
    expect(governingPlatFor(history, '5', '2').caveats).toHaveLength(0);
  });

  it('says when the original plat was never retrieved', () => {
    // The replat shows what changed, not what was set.
    const history = buildPlatHistory('Sunset Acres', [
      plat({ instrument: 'REPLAT-A', title: 'Replat of Lots 4-7, Block 2', recordingDate: '1998-09-15' }),
    ]);
    expect(governingPlatFor(history, '5', '2').caveats.join(' ')).toContain('original plat');
  });

  it('will not let an undated plat quietly supersede a dated one', () => {
    const history = buildPlatHistory('Sunset Acres', [
      plat({ instrument: 'ORIG', recordingDate: '1962-04-01' }),
      plat({ instrument: 'NODATE', title: 'Replat of Sunset Acres', recordingDate: '' }),
    ]);
    expect(history.undated).toEqual(['NODATE']);
    expect(governingPlatFor(history, '5', '2').caveats.join(' ')).toContain('assumed rather than established');
  });

  it('is wired into the step that used to only bucket the amendments', () => {
    // "STEP 6: Plat Amendment Chain" split the list into replats and everything else and called that
    // the chain. Nothing decided which plat CONTROLS a lot.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/services/subdivision-intelligence.ts'), 'utf8',
    );
    expect(src).toContain('buildPlatHistory(subdivisionName');
    expect(src).toContain('governingPlatFor(platHistory');
    // Computed and then dropped would be no better than not computing it.
    expect(src).toContain('platGovernance,');
  });

  it('calls an uncovered lot a retrieval gap, not an unplatted lot', () => {
    const history = buildPlatHistory('Sunset Acres', [
      plat({ instrument: 'REPLAT-A', title: 'Replat of Lots 4-7, Block 2', recordingDate: '1998-09-15' }),
    ]);
    const g = governingPlatFor(history, '40', '2');
    expect(g.governing).toBeNull();
    expect(g.statement).toContain('not evidence that the lot is unplatted');
  });
});
