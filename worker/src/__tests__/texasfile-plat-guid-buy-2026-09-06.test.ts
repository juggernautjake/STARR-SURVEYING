// A plat the discovery pass FOUND on TexasFile was never bought (2026-09-06 audit, plan 6.7 note):
// the search-only pass returned the plat's GUID, the manifest carried it as `previewRef`, and then
// the buy threw it away and re-searched TexasFile's DEED records by an instrument number a plat does
// not have. This pins the whole thread — GUID on the recommendation, forwarded through the
// orchestrator and the adapter, and a plat buy that runs the PLAT search and picks that GUID.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chooseTexasFileResult,
  priceTexasFileResult,
  PLAT_FLAT_USD,
  type TexasFileResult,
} from '../services/texasfile-buy.js';
import { describePurchasedDocument } from '../services/purchase-adapters/texasfile-purchase-adapter.js';
import { texasFilePlatResultToManifest } from '../research/live-source-adapters.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const r = (over: Partial<TexasFileResult>): TexasFileResult => ({
  guid: 'AAAA-1111', instrument: null, bookVolPage: null, pages: null, type: null, date: null, text: '', ...over,
});

describe('chooseTexasFileResult — the GUID names the exact document', () => {
  const rows = [r({ guid: 'AAAA-1111', instrument: '2019-100', pages: 3 }), r({ guid: 'BBBB-2222', instrument: '2019-200', pages: 5 })];

  it('picks the row whose GUID the discovery pass recorded, case-insensitively', () => {
    expect(chooseTexasFileResult(rows, { guid: 'bbbb-2222' })?.instrument).toBe('2019-200');
  });
  it('falls back to the instrument match when no GUID is given', () => {
    expect(chooseTexasFileResult(rows, { instrumentNumber: '2019200' })?.guid).toBe('BBBB-2222');
  });
  it('prefers the GUID over a conflicting instrument (the GUID is the more exact key)', () => {
    expect(chooseTexasFileResult(rows, { guid: 'AAAA-1111', instrumentNumber: '2019-200' })?.guid).toBe('AAAA-1111');
  });
  it('takes the first row when nothing identifies one (a name/vol-page search is already narrow)', () => {
    expect(chooseTexasFileResult(rows, {})?.guid).toBe('AAAA-1111');
  });
  it('returns null on no results', () => {
    expect(chooseTexasFileResult([], { guid: 'AAAA-1111' })).toBeNull();
  });
});

describe('priceTexasFileResult — plats are flat, deeds are per page', () => {
  it('prices a plat at the flat rate whatever its page count', () => {
    expect(priceTexasFileResult(r({ type: 'plat', pages: null }), 'plat')).toBe(PLAT_FLAT_USD);
    expect(priceTexasFileResult(r({ type: 'plat', pages: 4 }), 'instrument')).toBe(PLAT_FLAT_USD);
  });
  it('prices a deed at $1/page, or unknown when the page count is not listed', () => {
    expect(priceTexasFileResult(r({ pages: 3 }), 'instrument')).toBe(3);
    expect(priceTexasFileResult(r({ pages: null }), 'instrument')).toBeNull();
  });
});

describe('describePurchasedDocument — Review never sees the search_required placeholder', () => {
  it('labels a plat by its subdivision and cabinet/slide', () => {
    const d = describePurchasedDocument('Bell', 'search_required', 'plat', { guid: 'AAAA-1111' }, {
      product: 'plat', subdivision: 'OAK CREEK ADDITION', book: 'C', page: '312-A',
    });
    expect(d.documentLabel).toBe('Plat — OAK CREEK ADDITION (Bell)');
    expect(d.recordingInfo).toContain('Cabinet C, Slide 312-A');
    expect(d.label).not.toContain('search_required');
  });
  it('labels a name-searched deed by the instrument TexasFile actually sold', () => {
    const d = describePurchasedDocument('Bell', 'search_required', 'deed', { instrument: '2021-45678' }, { name: 'SMITH JOHN' });
    expect(d.documentLabel).toBe('Deed — Instr. 2021-45678 (Bell)');
    expect(d.recordingInfo).toBe('Instrument No. 2021-45678');
  });
  it('labels a vol/page deed the vendor did not number by its volume and page', () => {
    const d = describePurchasedDocument('Bell', 'search_required', 'deed', {}, { book: '1234', page: '56' });
    expect(d.documentLabel).toBe('Deed — Vol. 1234, Pg. 56 (Bell)');
    expect(d.recordingInfo).toBe('Volume 1234, Page 56');
  });
  it('keeps the plain instrument label for an instrument-keyed buy', () => {
    const d = describePurchasedDocument('Bell', '2019-100', 'deed', {}, {});
    expect(d.documentLabel).toBe('Deed — Instr. 2019-100 (Bell)');
  });
});

describe('the plat manifest entry carries the query that found it', () => {
  it('sets subdivision from the plat search input', () => {
    const e = texasFilePlatResultToManifest(r({ guid: 'CCCC-3333', type: 'plat', bookVolPage: 'C/312-A' }), 'Bell', 'OAK CREEK ADDITION');
    expect(e.previewRef).toBe('CCCC-3333');
    expect(e.subdivision).toBe('OAK CREEK ADDITION');
    expect(e.docType).toBe('plat');
  });
});

describe('the thread is WIRED at every hop (check the CALLER, not the module)', () => {
  it('live-search hands each plat result its search input', () => {
    const src = read('research/live-search.ts');
    expect(src).toContain('texasFilePlatResultToManifest(r, cfg.county, platQueryFor.get(r.guid))');
  });
  it('the engine recommendation carries the GUID, the product and the subdivision', () => {
    const src = read('index.ts');
    expect(src).toContain('vendorRef: a.source.previewRef');
    expect(src).toContain("vendorProduct: dt === 'plat' ? 'plat' : 'instrument'");
    expect(src).toContain('subdivision: a.cluster.subdivision');
  });
  it('the orchestrator forwards them into the TexasFile buy, and keys the library on the GUID', () => {
    const src = read('services/document-purchase-orchestrator.ts');
    expect(src).toContain('guid: rec.vendorRef');
    expect(src).toContain('product: rec.vendorProduct');
    expect(src).toContain('subdivision: rec.subdivision');
    // The prior-round dedup: a GUID-only document is looked up AND recorded under the same key.
    expect(src).toContain('rec.vendorRef ? `texasfile:${rec.vendorRef}` : null');
    expect(src).toContain('? `texasfile:${rec.vendorRef}` // the same key the library lookup above used');
  });
  it('the adapter passes them to buyDocument', () => {
    const src = read('services/purchase-adapters/texasfile-purchase-adapter.ts');
    expect(src).toContain('guid: hints.guid');
    expect(src).toContain('product: hints.product');
    expect(src).toContain('subdivision: hints.subdivision');
  });
  it('buyDocument runs the PLAT search for a plat and buys through /plat/', () => {
    const src = read('services/texasfile-buy.ts');
    const start = src.indexOf('export async function buyDocument');
    const body = src.slice(start, start + 4000);
    expect(body).toContain("product === 'plat'");
    expect(body).toContain('searchTexasFilePlats(page');
    expect(body).toContain('chooseTexasFileResult(results, input)');
    expect(body).toContain('purchaseTexasFile(page, input.county, chosen.guid, searchId, log, product)');
  });
});
