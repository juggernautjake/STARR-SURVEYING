import { describe, it, expect, vi } from 'vitest';
import { makeSourceSearch, buildTexasFileSearchInputs, buildTexasFilePlatInputs, buildDiscoveryTarget, type LiveSearchConfig } from '../research/live-search.js';
import type { AcquisitionSource, } from '../research/acquisition-sources.js';
import type { DiscoveryTarget, ManifestEntry } from '../research/cross-source-discovery.js';
import type { TexasFileResult, TexasFileBuyInput, TexasFilePlatInput } from '../services/texasfile-buy.js';

/** Keep makeSourceSearch tests hermetic: a plat search that hits no browser unless a test injects its own. */
const noPlats = async (): Promise<TexasFileResult[]> => [];
const tfPlat = (guid: string): TexasFileResult =>
  ({ guid, instrument: null, bookVolPage: 'A/166', pages: null, type: 'plat', date: '1978-04-01', text: '' } as TexasFileResult);

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
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch, texasFilePlatSearch: noPlats });
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
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch, texasFilePlatSearch: noPlats });
    const entries = await search(src('texasfile', 'paid'), target);
    expect(entries.map((e) => e.previewRef)).toContain('G2');
  });
});

// Plan 1.3 — the DiscoveryTarget the run is searched by.

describe('buildDiscoveryTarget', () => {
  it('combines owner + supplemental (instrument + vol/page) + CAD-known instruments, de-duped', () => {
    const t = buildDiscoveryTarget({
      county: 'Bell',
      ownerName: '  FERRELL  ',
      subdivision: 'Heritage',
      supplemental: { instrumentNumbers: ['2020-1', ' '], volumePages: [{ volume: '5456', page: '704' }, { volume: '', page: '' }] },
      knownInstruments: ['2020-1', '2015014567'],
    });
    expect(t.ownerName).toBe('FERRELL');
    expect(t.subdivision).toBe('Heritage');
    expect(t.instruments).toEqual(['2020-1', '2015014567']); // de-duped, empties dropped
    expect(t.bookPages).toEqual([{ volume: '5456', page: '704' }]); // empty vp dropped
  });
  it('omits empty arrays when there is nothing supplemental', () => {
    const t = buildDiscoveryTarget({ county: 'Bell', ownerName: 'DOE' });
    expect(t.instruments).toBeUndefined();
    expect(t.bookPages).toBeUndefined();
  });
});

// Plan 1.3 — the TexasFile PLAT search (the gap the 1401 North East St run exposed).

describe('buildTexasFilePlatInputs', () => {
  it('makes a plat query from the subdivision the run identified', () => {
    const inputs = buildTexasFilePlatInputs({ county: 'Bell', subdivision: 'WINNIE MAE ADDITION' }, 'Bell');
    expect(inputs).toContainEqual({ county: 'Bell', subdivision: 'WINNIE MAE ADDITION' });
  });
  it('also tries a cabinet/slide (vol/page) reference as a plat query', () => {
    const inputs = buildTexasFilePlatInputs({ county: 'Bell', bookPages: [{ volume: 'A', page: '166' }] }, 'Bell');
    expect(inputs).toContainEqual({ county: 'Bell', volume: 'A', page: '166' });
  });
  it('is empty for a bare tract with no subdivision or cabinet reference', () => {
    expect(buildTexasFilePlatInputs({ county: 'Bell', ownerName: 'DOE' }, 'Bell')).toEqual([]);
  });
});

describe('makeSourceSearch runs the PLAT search too (plan 1.3)', () => {
  it('a subdivision target finds the plat and maps it to a $10 paid-exclusive entry', async () => {
    const texasFileSearch = vi.fn<(i: TexasFileBuyInput) => Promise<TexasFileResult[]>>(async () => []);
    const texasFilePlatSearch = vi.fn<(i: TexasFilePlatInput) => Promise<TexasFileResult[]>>(async (i) =>
      i.subdivision ? [tfPlat('PLAT-GUID-1')] : []);
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch, texasFilePlatSearch });
    const entries = await search(src('texasfile', 'paid'), { county: 'Bell', subdivision: 'WINNIE MAE ADDITION' });
    expect(texasFilePlatSearch).toHaveBeenCalledWith({ county: 'Bell', subdivision: 'WINNIE MAE ADDITION' });
    const plat = entries.find((e) => e.docType === 'plat');
    expect(plat, 'the WINNIE MAE plat should be discovered').toBeTruthy();
    expect(plat!.unitCostUsd).toBe(10);       // $10 flat, NOT $1/page
    expect(plat!.kind).toBe('paid');
    expect(plat!.canPurchase).toBe(true);
    expect(plat!.previewRef).toBe('PLAT-GUID-1');
  });

  it('returns deed AND plat entries together, each de-duped by GUID', async () => {
    const texasFileSearch = vi.fn<(i: TexasFileBuyInput) => Promise<TexasFileResult[]>>(async (i) => i.name ? [tfResult('D1', '1')] : []);
    const texasFilePlatSearch = vi.fn<(i: TexasFilePlatInput) => Promise<TexasFileResult[]>>(async () => [tfPlat('P1'), tfPlat('P1')]);
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch, texasFilePlatSearch });
    const entries = await search(src('texasfile', 'paid'), { county: 'Bell', ownerName: 'FERRELL', subdivision: 'HERITAGE' });
    expect(entries.filter((e) => e.docType === 'plat')).toHaveLength(1); // P1 de-duped
    expect(entries.some((e) => e.previewRef === 'D1')).toBe(true);
  });

  it('a failing plat query does not sink the deed results', async () => {
    const texasFileSearch = vi.fn<(i: TexasFileBuyInput) => Promise<TexasFileResult[]>>(async (i) => i.name ? [tfResult('D1', '1')] : []);
    const texasFilePlatSearch = vi.fn<(i: TexasFilePlatInput) => Promise<TexasFileResult[]>>(async () => { throw new Error('plat 403'); });
    const search = makeSourceSearch({ county: 'Bell', texasfileEnabled: true, texasFileSearch, texasFilePlatSearch });
    const entries = await search(src('texasfile', 'paid'), { county: 'Bell', ownerName: 'FERRELL', subdivision: 'HERITAGE' });
    expect(entries.some((e) => e.previewRef === 'D1')).toBe(true);
  });
});
