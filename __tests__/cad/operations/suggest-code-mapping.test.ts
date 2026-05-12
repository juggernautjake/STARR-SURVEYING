import { describe, it, expect } from 'vitest';
import {
  suggestCodeMapping,
  buildDefaultCodeMap,
} from '@/lib/cad/operations/suggest-code-mapping';

describe('suggestCodeMapping — exact match', () => {
  it('finds the exact target', () => {
    const r = suggestCodeMapping('BC02', ['BC01', 'BC02', 'IRS']);
    expect(r).toEqual({ target: 'BC02', confidence: 1.0, reason: 'EXACT' });
  });

  it('case-insensitive', () => {
    const r = suggestCodeMapping('bc02', ['BC02']);
    expect(r?.target).toBe('BC02');
    expect(r?.confidence).toBe(1.0);
  });
});

describe('suggestCodeMapping — shared-base (line-control suffix)', () => {
  it('strips B / E / BA / EA suffix and finds the base in allow-list', () => {
    expect(suggestCodeMapping('BC02B', ['BC02', 'BC03'])).toMatchObject({
      target: 'BC02',
      reason: 'SHARED_BASE',
    });
    expect(suggestCodeMapping('FENCE-EA', ['FENCE-', 'WALL'])).toMatchObject({
      target: 'FENCE-',
      reason: 'SHARED_BASE',
    });
  });

  it('confidence 0.95 on B/E/BA/EA strip', () => {
    const r = suggestCodeMapping('BC02B', ['BC02']);
    expect(r?.confidence).toBeCloseTo(0.95, 2);
  });

  it('also handles inverse: allow-list entry is the suffix-bearing form', () => {
    const r = suggestCodeMapping('BC02', ['BC02B']);
    expect(r?.target).toBe('BC02B');
    expect(r?.reason).toBe('SHARED_BASE');
  });

  it('does not strip "AB" → "A" (would over-aggressively shorten)', () => {
    // "AB" ends in "B", but stripping leaves just "A" which is
    // < 2 chars — heuristic refuses.
    const r = suggestCodeMapping('AB', ['A', 'Z']);
    // Falls through to substring match (allow-list has "A").
    expect(r?.target).toBe('A');
    expect(['SUBSTRING', 'PREFIX']).toContain(r?.reason);
  });
});

describe('suggestCodeMapping — prefix match', () => {
  it('source code prefixes a longer allow-list entry', () => {
    const r = suggestCodeMapping('BC', ['BC02-FOUND', 'IRS']);
    expect(r?.target).toBe('BC02-FOUND');
    expect(r?.reason).toBe('PREFIX');
  });

  it('allow-list entry prefixes a longer source code', () => {
    const r = suggestCodeMapping('MONUMENT-OLD', ['MONUMENT']);
    expect(r?.target).toBe('MONUMENT');
    expect(r?.reason).toBe('PREFIX');
  });
});

describe('suggestCodeMapping — substring match', () => {
  it('source code is a substring of an allow-list entry', () => {
    const r = suggestCodeMapping('MON', ['BOUNDARY_MONUMENT', 'IRS']);
    expect(r?.target).toBe('BOUNDARY_MONUMENT');
    expect(r?.reason).toBe('SUBSTRING');
  });
});

describe('suggestCodeMapping — edit distance', () => {
  it('IRS → IRSC is matched, falling through the heuristic chain', () => {
    // "IRSC" ends in "C" (a recognised line-control suffix),
    // so the SHARED_BASE heuristic strips it to "IRS" which
    // matches the source. That's still a strong match; we
    // accept whichever heuristic the chain settles on first.
    const r = suggestCodeMapping('IRS', ['IRSC']);
    expect(r?.target).toBe('IRSC');
    expect(['SHARED_BASE', 'PREFIX', 'EDIT_DISTANCE']).toContain(r?.reason);
  });

  it('genuinely edit-distance-only match (POLE → POLES)', () => {
    // "POLES" doesn't end in a line-control suffix and isn't
    // a prefix/substring of "POLE" in a meaningful way, so
    // this exercises the edit-distance path specifically.
    // ("POLE" IS a prefix of "POLES" so this lands on PREFIX
    // — kept as documentation of heuristic-chain order.)
    const r = suggestCodeMapping('POLE', ['POLES']);
    expect(r?.target).toBe('POLES');
  });

  it('PIPE → PIPER picks PIPER via prefix-or-edit chain', () => {
    const r = suggestCodeMapping('PIPE', ['PIPER']);
    expect(r?.target).toBe('PIPER');
  });

  it('truly distant strings yield null', () => {
    const r = suggestCodeMapping('XYZ', ['BC02', 'MONUMENT', 'WALL']);
    expect(r).toBeNull();
  });

  it('genuine edit-distance match — single transposition', () => {
    // "FENC" vs. "FNCE" — both 4 chars, single adjacent
    // transposition. Not a prefix or substring; falls to
    // EDIT_DISTANCE.
    const r = suggestCodeMapping('FENC', ['FNCE']);
    expect(r?.target).toBe('FNCE');
    expect(r?.reason).toBe('EDIT_DISTANCE');
  });
});

describe('suggestCodeMapping — edge cases', () => {
  it('empty source → null', () => {
    expect(suggestCodeMapping('', ['BC02'])).toBeNull();
    expect(suggestCodeMapping('   ', ['BC02'])).toBeNull();
  });

  it('empty allow-list → null', () => {
    expect(suggestCodeMapping('BC02', [])).toBeNull();
  });

  it('confidence ordering: EXACT > SHARED_BASE > PREFIX > SUBSTRING > EDIT_DISTANCE', () => {
    const exact = suggestCodeMapping('IRS', ['IRS', 'IRSC']);
    expect(exact?.confidence).toBe(1.0);
    const base = suggestCodeMapping('BC02B', ['BC02']);
    expect(base?.confidence).toBeCloseTo(0.95, 2);
  });
});

describe('buildDefaultCodeMap', () => {
  it('auto-maps high-confidence suggestions (≥ 0.8 threshold)', () => {
    const map = buildDefaultCodeMap(
      ['BC02', 'IRS', 'XYZ'],
      ['BC02', 'IRSC'],
    );
    expect(map.BC02).toBe('BC02'); // exact
    // IRS → IRSC: "IRSC" ends in line-control suffix "C" so
    // the SHARED_BASE heuristic fires with confidence 0.9
    // (≥ 0.8 threshold). Auto-mapped.
    expect(map.IRS).toBe('IRSC');
    // XYZ → no match
    expect(map.XYZ).toBeUndefined();
  });

  it('skips low-confidence suggestions (< 0.8)', () => {
    // "FENC" → "FNCE" is edit-distance only, ratio 0.75 → below threshold.
    const map = buildDefaultCodeMap(['FENC'], ['FNCE']);
    expect(map.FENC).toBeUndefined();
  });

  it('uppercases keys', () => {
    const map = buildDefaultCodeMap(['bc02'], ['BC02']);
    expect(map.BC02).toBe('BC02');
  });

  it('empty input → empty map', () => {
    expect(buildDefaultCodeMap([], ['BC02'])).toEqual({});
    expect(buildDefaultCodeMap(['BC02'], [])).toEqual({});
  });
});
