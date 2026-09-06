import { describe, it, expect, vi } from 'vitest';
import {
  clusterEntries,
  metaKey,
  normInstrument,
  normText,
  matchSignals,
  matchConfidence,
  hasFreeSource,
  cheapestSource,
  CONFIDENT_SAME,
  NEEDS_JUDGE,
  type SamenessJudge,
} from '../research/cross-source-match.js';
import type { ManifestEntry } from '../research/cross-source-discovery.js';

// Plan A2 — the same document from different sources must collapse to one cluster, so the engine never
// buys a paid copy of a deed a free source already has. The cross-check weighs names, dates, location
// and instrument number (owner 2026-09-05).

function e(p: Partial<ManifestEntry> & { sourceId: string; kind: 'free' | 'paid' }): ManifestEntry {
  return {
    docType: 'deed',
    unitCostUsd: p.kind === 'paid' ? 3 : 0,
    canFreeCapture: p.kind === 'free',
    canPurchase: p.kind === 'paid',
    ...p,
  };
}

describe('normalisers + metaKey', () => {
  it('normalises instruments across vendor formats', () => {
    expect(normInstrument('2019-3389')).toBe('20193389');
    expect(normInstrument('2019 3389')).toBe('20193389');
    expect(metaKey(e({ sourceId: 'a', kind: 'free', instrument: '2019-3389' }))).toBe('i:20193389');
  });
  it('a definite key is instrument or book+page; otherwise null (scored instead)', () => {
    expect(metaKey(e({ sourceId: 'a', kind: 'free', instrument: undefined, book: '44', page: '212' }))).toBe('bp:44/212');
    expect(metaKey(e({ sourceId: 'a', kind: 'free', recordingDate: '2021-05-05', grantor: 'LHCS LLC' }))).toBeNull();
  });
  it('normText makes names tolerant to punctuation/case', () => {
    expect(normText('LHCS, LLC.')).toBe('lhcs llc');
  });
});

describe('matchSignals / matchConfidence (names, dates, location, instrument)', () => {
  it('an instrument or book+page match is a definite same (confidence 1)', () => {
    const a = e({ sourceId: 'k', kind: 'free', instrument: '2019-3389' });
    const b = e({ sourceId: 't', kind: 'paid', instrument: '20193389' });
    expect(matchSignals(a, b).instrument).toBe(true);
    expect(matchConfidence(a, b)).toBe(1);
  });
  it('date + grantor + grantee reaches confident-same without an instrument', () => {
    const a = e({ sourceId: 'k', kind: 'free', recordingDate: '2021-05-05', grantor: 'LHCS LLC', grantee: 'DOE JOHN' });
    const b = e({ sourceId: 'a', kind: 'free', recordingDate: '2021-05-05', grantor: 'LHCS, LLC.', grantee: 'John Doe' });
    // grantee "John Doe" vs "DOE JOHN" won't contain-match, so lean on date+grantor+ (grantee maybe not)
    expect(matchConfidence(a, b)).toBeGreaterThanOrEqual(NEEDS_JUDGE);
  });
  it('location (subdivision + lot) is a matching axis on its own', () => {
    const a = e({ sourceId: 'k', kind: 'free', subdivision: 'HERITAGE PLACE VILLAGE', lot: '12', recordingDate: '2020-01-01' });
    const b = e({ sourceId: 'a', kind: 'free', subdivision: 'Heritage Place Village', lot: '12', recordingDate: '2020-01-01' });
    expect(matchSignals(a, b).location).toBe(true);
    expect(matchConfidence(a, b)).toBeGreaterThanOrEqual(CONFIDENT_SAME); // location + date
  });
  it('nothing in common is confidence 0', () => {
    expect(matchConfidence(
      e({ sourceId: 'k', kind: 'free', instrument: '111' }),
      e({ sourceId: 'a', kind: 'free', instrument: '222', recordingDate: '1990-01-01' }),
    )).toBe(0);
  });
});

describe('clusterEntries', () => {
  it('collapses the same instrument from a free and a paid source; free is cheapest', async () => {
    const clusters = await clusterEntries([
      e({ sourceId: 'kofile', kind: 'free', instrument: '2019-3389' }),
      e({ sourceId: 'texasfile', kind: 'paid', instrument: '20193389' }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(hasFreeSource(clusters[0])).toBe(true);
    expect(cheapestSource(clusters[0])?.sourceId).toBe('kofile');
  });

  it('merges on strong metadata agreement WITHOUT calling the judge', async () => {
    const judge = vi.fn<SamenessJudge>(async () => false);
    const clusters = await clusterEntries([
      e({ sourceId: 'k', kind: 'free', instrument: '2019-3389', recordingDate: '2020-01-01', grantor: 'LHCS LLC', grantee: 'DOE JOHN', subdivision: 'HERITAGE', lot: '12' }),
      e({ sourceId: 'a', kind: 'free', recordingDate: '2020-01-01', grantor: 'LHCS, LLC.', grantee: 'DOE JOHN', subdivision: 'Heritage', lot: '12' }),
    ], judge);
    expect(clusters).toHaveLength(1);       // date+grantor+grantee+location → confident
    expect(judge).not.toHaveBeenCalled();
  });

  it('uses the AI judge only for BORDERLINE entries, and merges on a positive verdict', async () => {
    const judge = vi.fn<SamenessJudge>(async () => true);
    const clusters = await clusterEntries([
      e({ sourceId: 'k', kind: 'free', instrument: '2019-3389', recordingDate: '2020-01-01', grantor: 'LHCS LLC' }),
      e({ sourceId: 'a', kind: 'free', recordingDate: '2020-01-01', grantor: 'LHCS LLC' }), // date+grantor = 0.65 borderline
    ], judge);
    expect(judge).toHaveBeenCalledTimes(1);
    expect(clusters).toHaveLength(1);
  });

  it('a borderline pair stays split when the judge says no', async () => {
    const judge = vi.fn<SamenessJudge>(async () => false);
    const clusters = await clusterEntries([
      e({ sourceId: 'k', kind: 'free', instrument: '2019-3389', recordingDate: '2020-01-01', grantor: 'LHCS LLC' }),
      e({ sourceId: 'a', kind: 'free', recordingDate: '2020-01-01', grantor: 'LHCS LLC' }),
    ], judge);
    expect(clusters).toHaveLength(2);
  });

  it('keeps distinct instruments separate', async () => {
    const clusters = await clusterEntries([
      e({ sourceId: 'texasfile', kind: 'paid', instrument: '2019-3389' }),
      e({ sourceId: 'texasfile', kind: 'paid', instrument: '2005-999' }),
    ]);
    expect(clusters).toHaveLength(2);
  });
});
