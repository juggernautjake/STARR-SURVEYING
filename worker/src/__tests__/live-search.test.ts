import { describe, it, expect, vi } from 'vitest';
import { makeSourceSearch, buildTexasFileSearchInputs, type LiveSearchConfig } from '../research/live-search.js';
import type { AcquisitionSource, } from '../research/acquisition-sources.js';
import type { DiscoveryTarget, ManifestEntry } from '../research/cross-source-discovery.js';
import type { TexasFileResult, TexasFileBuyInput } from '../services/texasfile-buy.js';

// Plan 1.2 — the SourceSearchFn dispatches TexasFile to a live search (mapped to paid entries) and a
// free source to the run's known-free documents, so the engine can compare per document.

const src = (id: string, kind: 'free' | 'paid'): AcquisitionSource => ({
  source: { id, label: id, cost: kind, capabilities: ['conveyances'], counties: '*', estimatedSeconds: 60 },
  kind,
});
const tfResult = (guid: string, instrument: string): TexasFileResult =>
  ({ guid, instrument, bookVolPage: null, pages: 3, type: 'Deed', date: '2020-01-01', text: '' } as TexasFileResult);

const target: DiscoveryTarget = {
  county: 'Bell', ownerName: 'FERRELL', bookPages: [{ volume: '5456', page: '704' }], instruments: ['2020-1'],
};

describe('buildTexasFileSearchInputs', () => {
  it('makes a name query, a vol/page query, and an instrument query', () => {
    const inputs = buildTexasFileSearchInputs(target, 'Bell');
    expect(inputs).toContainEqual({ county: 'Bell', name: 'FERRELL' });
    expect(inputs).toContainEqual({ county: 'Bell', volume: '5456', page: '704' });
    expect(inputs).toContainEqual({ county: 'Bell', instrumentNumber: '2020-1' });
  });
  it('is empty when the target has no searchable keys', () => {
    expect(buildTexasFileSearchInputs({ county: 'Bell' }, 'Bell')).toEqual([]);
  });
});

describe('makeSourceSearch', () => {
  it('TexasFile → live search across all queries, de-duped, mapped to paid entries', async () => {
    const texasFileSearch = vi.fn<(i: TexasFileBuyInput) => Promise<TexasFileResult[]>>(async (i) =>
      i.name ? [tfResult('G1', '111'), tfResult('G1', '111')] : i.volume ? [tfResult('G2', '222')] : []);
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch });
    const entries = await search(src('texasfile', 'paid'), target);
    expect(texasFileSearch).toHaveBeenCalledTimes(3);          // name + vol/page + instrument
    expect(entries.map((e) => e.previewRef).sort()).toEqual(['G1', 'G2']); // de-duped by GUID
    expect(entries.every((e) => e.kind === 'paid' && e.sourceId === 'texasfile')).toBe(true);
  });

  it('a free source returns the run\'s known-free documents', async () => {
    const known: ManifestEntry[] = [{ sourceId: 'cad', kind: 'free', docType: 'deed', instrument: '999', unitCostUsd: 0, canFreeCapture: true, canPurchase: false }];
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, knownFreeDocuments: known });
    expect(await search(src('kofile', 'free'), target)).toEqual(known);
  });

  it('does not search TexasFile when disabled', async () => {
    const texasFileSearch = vi.fn<(i: TexasFileBuyInput) => Promise<TexasFileResult[]>>(async () => [tfResult('G', '1')]);
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: false, texasFileSearch });
    expect(await search(src('texasfile', 'paid'), target)).toEqual([]);
    expect(texasFileSearch).not.toHaveBeenCalled();
  });

  it('isolates a failing TexasFile query — the others still land', async () => {
    const texasFileSearch = vi.fn<(i: TexasFileBuyInput) => Promise<TexasFileResult[]>>(async (i) => {
      if (i.name) throw new Error('login timeout');
      return [tfResult('G2', '222')];
    });
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch });
    const entries = await search(src('texasfile', 'paid'), target);
    expect(entries.map((e) => e.previewRef)).toContain('G2');
  });
});
