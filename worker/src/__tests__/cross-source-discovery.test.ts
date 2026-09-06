import { describe, it, expect, vi } from 'vitest';
import {
  discoverAcrossSources,
  type SourceSearchFn,
  type ManifestEntry,
} from '../research/cross-source-discovery.js';
import { selectionsToWants } from '../research/selection-wants.js';

// Plan A1 — the discovery pass iterates the source registry (A0) and collects each source's
// availability into one manifest, free sources first, isolating a failing source.

const deedWants = selectionsToWants({ items: ['recent_deed'], adjoiners: { enabled: false, items: [] } });
const target = { county: 'Bell', ownerName: 'DOE JOHN' };

function entry(sourceId: string, kind: 'free' | 'paid', instrument: string): ManifestEntry {
  return {
    sourceId, kind, docType: 'deed', instrument,
    unitCostUsd: kind === 'paid' ? 3 : 0,
    canFreeCapture: kind === 'free', canPurchase: kind === 'paid',
  };
}

describe('discoverAcrossSources', () => {
  it('collects every source\'s documents into one manifest and reports per-source counts', async () => {
    const search: SourceSearchFn = async (src) => {
      if (src.source.id === 'kofile') return [entry('kofile', 'free', '2019001')];
      if (src.source.id === 'texasfile') return [entry('texasfile', 'paid', '2019001'), entry('texasfile', 'paid', '2005999')];
      return [];
    };
    const res = await discoverAcrossSources('Bell', deedWants, target, search);
    expect(res.entries.length).toBeGreaterThanOrEqual(3);
    const kofile = res.searched.find((s) => s.sourceId === 'kofile');
    const texasfile = res.searched.find((s) => s.sourceId === 'texasfile');
    expect(kofile?.found).toBe(1);
    expect(texasfile?.found).toBe(2);
  });

  it('searches free sources before paid ones', async () => {
    const order: string[] = [];
    const search: SourceSearchFn = async (src) => { order.push(src.kind); return []; };
    await discoverAcrossSources('Bell', deedWants, target, search);
    const firstPaid = order.indexOf('paid');
    const lastFree = order.lastIndexOf('free');
    expect(lastFree).toBeLessThan(firstPaid);
  });

  it('isolates a failing source — the others still contribute and the failure is recorded', async () => {
    const search: SourceSearchFn = async (src) => {
      if (src.source.id === 'texasfile') throw new Error('login timeout');
      return [entry(src.source.id, 'free', '2020123')];
    };
    const res = await discoverAcrossSources('Bell', deedWants, target, search);
    const tf = res.searched.find((s) => s.sourceId === 'texasfile');
    expect(tf?.error).toMatch(/login timeout/);
    expect(res.entries.some((e) => e.instrument === '2020123')).toBe(true); // free source still landed
  });

  it('does not search paid sources when paid is off', async () => {
    const search = vi.fn<SourceSearchFn>(async () => []);
    await discoverAcrossSources('Bell', deedWants, target, search, { paidEnabled: false });
    const kinds = search.mock.calls.map(([src]) => src.kind);
    expect(kinds).not.toContain('paid');
  });
});
