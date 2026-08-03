// How Texas plats actually write things down.
//
// The centrepiece is the ditto trap. On a subdivision plat a lot table lists a distance once and
// marks the identical lots below it with `"`. Read those as empty and eleven lots lose their
// frontage. But `"` is ALSO the seconds symbol in a bearing — so a reader that treats every `"` as a
// ditto corrupts every bearing on the sheet, turning a correctness fix into a much larger
// correctness bug on the one field a boundary depends on.

import { describe, it, expect } from 'vitest';
import {
  isDitto, resolveDittoColumn, parseDistance, findPlatFeatures,
} from '../services/plat-notation.js';

describe('a ditto is a whole cell, not a character', () => {
  it('recognises the marks a draughtsman actually inks', () => {
    for (const d of ['"', '〃', "''", 'do.', '-do-', 'ditto', 'same', '  "  ']) {
      expect(isDitto(d), d).toBe(true);
    }
  });

  it('does NOT treat the seconds symbol in a bearing as a ditto', () => {
    // The whole reason `isDitto` tests the entire cell. Getting this wrong destroys every bearing.
    expect(isDitto('N 45°30\'15" E')).toBe(false);
    expect(isDitto('15"')).toBe(false);
    expect(isDitto('247.50\'')).toBe(false);
  });

  it('does not treat a real value as a ditto because it contains a quote', () => {
    expect(isDitto('100\'')).toBe(false);
    expect(isDitto('S 89°59\'59" W')).toBe(false);
  });

  it('is not fooled by an empty cell', () => {
    // Empty means "nothing written", which is different from "same as above" — one is a gap and the
    // other is a value.
    expect(isDitto('')).toBe(false);
    expect(isDitto(null)).toBe(false);
  });
});

describe('a ditto repeats the cell above it, in its own column', () => {
  const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

  it('fills a run of lots from one stated distance', () => {
    const r = resolveDittoColumn(['60.00', '"', '"', '"'], num);
    expect(r.values).toEqual([60, 60, 60, 60]);
    expect(r.resolvedFrom.size).toBe(3);
  });

  it('picks up the NEAREST value above, not the first', () => {
    const r = resolveDittoColumn(['60.00', '"', '75.00', '"'], num);
    expect(r.values).toEqual([60, 60, 75, 75]);
  });

  it('leaves a ditto with nothing above it empty rather than guessing', () => {
    // A mark at the top of a column repeats nothing. Borrowing from the row below, or from another
    // column, would invent a distance.
    const r = resolveDittoColumn(['"', '60.00'], num);
    expect(r.values).toEqual([null, 60]);
    expect(r.unresolved).toEqual([0]);
    expect(r.statement).toContain('repeats nothing');
  });

  it('says which values were inferred rather than read', () => {
    const r = resolveDittoColumn(['60.00', '"'], num);
    expect(r.statement).toContain('as reliable as the value they repeat, and no more');
  });

  it('reports honestly when there are no dittos at all', () => {
    expect(resolveDittoColumn(['60', '75'], num).statement).toContain('No ditto marks');
  });
});

describe('distances, as Texas has written them across two centuries', () => {
  it('reads a compound chains-and-links call', () => {
    // `5 chs 50 lks` read by parseFloat is 5 — two thirds of the call silently lost.
    const d = parseDistance('5 chs 50 lks')!;
    expect(d.value).toBeCloseTo(5.5, 6);
    expect(d.unit).toBe('chains');
    expect(d.compound).toBe(true);
  });

  it('reads varas', () => {
    expect(parseDistance('1900 vrs')).toMatchObject({ value: 1900, unit: 'varas' });
  });

  it('reads a vulgar fraction, typeset and written', () => {
    expect(parseDistance('247½ ft')!.value).toBeCloseTo(247.5, 6);
    expect(parseDistance('247 1/2 ft')!.value).toBeCloseTo(247.5, 6);
  });

  it('reads poles and rods, which older deeds use', () => {
    expect(parseDistance('16 poles')).toMatchObject({ unit: 'poles' });
    expect(parseDistance('16 rds')).toMatchObject({ unit: 'rods' });
  });

  it('treats a bare number as feet, which is what it means in Texas', () => {
    expect(parseDistance('247.50')).toMatchObject({ value: 247.5, unit: 'feet' });
  });

  it('returns null rather than zero for something unreadable', () => {
    // Zero is a distance. Absence is not.
    expect(parseDistance('illegible')).toBeNull();
    expect(parseDistance('')).toBeNull();
  });
});

describe('what else is drawn on the sheet', () => {
  it('finds a named creek', () => {
    const f = findPlatFeatures('THENCE along Salado Creek to a point');
    expect(f[0]!.kind).toBe('watercourse');
    expect(f[0]!.name).toContain('Salado');
  });

  it('distinguishes a waterbody from a watercourse', () => {
    // They matter differently: a creek can be a boundary that MOVES.
    expect(findPlatFeatures('a stock tank in the NE corner')[0]!.kind).toBe('waterbody');
  });

  it('finds an easement and its width, which is what makes it actionable', () => {
    const f = findPlatFeatures('a 20 foot wide utility easement along the North line');
    expect(f[0]!.kind).toBe('easement');
    expect(f[0]!.widthFt).toBe(20);
  });

  it('prefers right-of-way over road when both words appear', () => {
    // A ROW is an encumbrance; a road is a feature. Reporting the wrong one loses the encumbrance.
    expect(findPlatFeatures('the right-of-way of F.M. 436')[0]!.kind).toBe('right_of_way');
  });

  it('recognises a Texas farm-to-market designation', () => {
    expect(findPlatFeatures('fronting on FM 2843')[0]!.kind).toBe('road');
  });

  it('finds a railroad', () => {
    expect(findPlatFeatures('the M.K.&T. Railroad right of way')[0]!.kind).toBe('right_of_way');
  });

  it('returns nothing for text with no features rather than guessing', () => {
    expect(findPlatFeatures('THENCE N 45°30\'00" E 247.50 feet')).toEqual([]);
  });
});
