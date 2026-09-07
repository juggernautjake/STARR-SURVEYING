// Plan PLATS_FIRST_AND_VIEWER 2.1–2.2 + 3.1: the early TexasFile buy runs FIRST (before the
// captures), plats/drawings first and newest first; an owned row is read, priced $0 and re-opened
// rather than re-bought; the CAD deed history keeps the subject's own deed in the relevance check.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderPlatsFirstNewestFirst, recordingDateKey, describeBuyOrder } from '../research/plats-first.js';
import { parseTexasFileRow, type RawTexasFileRow } from '../services/texasfile-rows.js';
import { chooseTexasFileResult, priceTexasFileResult } from '../services/texasfile-buy.js';
import { texasFilePlatResultToManifest } from '../research/live-source-adapters.js';
import { clusterEntries, cheapestSource } from '../research/cross-source-match.js';
import { inCadDeedHistory } from '../counties/bell/analyzers/document-relevance-validator.js';
import type { PurchaseRecommendation } from '../types/confidence.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const rec = (over: Partial<PurchaseRecommendation>): PurchaseRecommendation => ({
  documentType: 'deed', instrument: 'search_required', source: 'texasfile', estimatedCost: '$3', confidenceImpact: '', callsImproved: 0,
  reason: '', priority: 1, roi: 1, ...over,
});

describe('orderPlatsFirstNewestFirst', () => {
  it('puts every plat/drawing before every deed, newest plat first, and keeps the rest in relevance order', () => {
    const out = orderPlatsFirstNewestFirst([
      rec({ documentType: 'deed', instrument: '2004034968', recordingDate: '08/13/2004' }),
      rec({ documentType: 'plat', vendorProduct: 'plat', recordingDate: '09/21/1954', subdivision: 'WINNIE MAE ADDITION' }),
      rec({ documentType: 'deed', instrument: '2020064728', recordingDate: '11/23/2020' }),
      rec({ documentType: 'plat', vendorProduct: 'plat', recordingDate: '03/02/1988', subdivision: 'WINNIE MAE ADDITION REPLAT' }),
      rec({ documentType: 'easement', recordingDate: '2019-01-23' }),
    ]);
    expect(out.map((r) => `${r.documentType}:${r.recordingDate}`)).toEqual([
      'plat:03/02/1988', 'plat:09/21/1954', 'deed:08/13/2004', 'deed:11/23/2020', 'easement:2019-01-23',
    ]);
  });
  it('reads both date shapes and treats an unknown date as oldest', () => {
    expect(recordingDateKey('09/21/1954')).toBe(19540921);
    expect(recordingDateKey('2004-08-12')).toBe(20040812);
    expect(recordingDateKey(null)).toBe(0);
    expect(recordingDateKey('1954')).toBe(19540000);
  });
  it('says the order in one line before money moves', () => {
    const line = describeBuyOrder([rec({ documentType: 'plat', recordingDate: '09/21/1954', subdivision: 'WINNIE MAE ADDITION', book: 'A', page: '166A' }), rec({})]);
    expect(line).toBe('Buy order: 1 plat/drawing(s) first, newest first — WINNIE MAE ADDITION A/166A (09/21/1954); then 1 other document(s) by relevance.');
  });
});

describe('an owned document (Download button, no Purchase button)', () => {
  const PLAT_HEADERS = ['', 'Filed Date', 'Subdivision Name', 'Number', 'Cabinet/Volume', 'Slide/Page', 'Description'];
  const owned: RawTexasFileRow = { guid: '0FE0A9D8-E8E0-4B47-804C-9DAB544CE025', headers: PLAT_HEADERS, cells: ['Download Cart My File', '09/21/1954', 'WINNIE MAE ADD', '-', 'A', '166A', '-'], tooltip: '', detail: '', owned: true };
  const dup: RawTexasFileRow = { guid: 'D5C38C1F-FB36-4974-AEB5-669A09849164', headers: PLAT_HEADERS, cells: ['Purchase Cart My File', '09/21/1954', 'WINNIE MAE ADD', '-', 'A', '166A', '-'], tooltip: 'Purchase: Click to purchase 1 pages for $10.00', detail: '' };

  it('is parsed with owned=true and priced at $0', () => {
    const r = parseTexasFileRow(owned, 'plat');
    expect(r.owned).toBe(true);
    expect(priceTexasFileResult(r, 'plat')).toBe(0);
    expect(priceTexasFileResult(parseTexasFileRow(dup, 'plat'), 'plat')).toBe(10);
  });
  it('is chosen over an unowned duplicate of the same document', () => {
    const rows = [parseTexasFileRow(dup, 'plat'), parseTexasFileRow(owned, 'plat')];
    expect(chooseTexasFileResult(rows, { subdivision: 'WINNIE MAE ADDITION' })?.guid).toBe(owned.guid);
    expect(chooseTexasFileResult(rows, {})?.guid).toBe(owned.guid);
  });
  it('clusters with the duplicate row and the planner takes the $0 owned source — no second $10', async () => {
    const entries = [dup, owned].map((raw) => texasFilePlatResultToManifest(parseTexasFileRow(raw, 'plat'), 'Bell'));
    const clusters = await clusterEntries(entries);
    expect(clusters).toHaveLength(1);
    const cheapest = cheapestSource(clusters[0]!);
    expect(cheapest?.previewRef).toBe(owned.guid);
    expect(cheapest?.unitCostUsd).toBe(0);
  });
  it('the extractor keys rows on any action button and flags Download-without-Purchase', () => {
    const src = read('services/texasfile-rows.ts');
    expect(src).toContain(`document.querySelectorAll('button[value^="14:"], button[name="btnPurchaseFromSearch"], button[data-for^="Purchase-"]')`);
    expect(src).toContain('owned: !purchaseBtn && !!downloadBtn');
  });
  it('the buy re-opens an owned document without the charging step', () => {
    const src = read('services/texasfile-buy.ts');
    expect(src).toContain('if (documentId != null && opts.owned) {');
    expect(src).toContain("purchaseTexasFile(page, input.county, chosen.guid, searchId, log, product, { owned: chosen.owned === true })");
    expect(src).toContain('timeout: 90_000');
  });
});

describe('the run order: TexasFile plats FIRST, then the captures', () => {
  it('onPropertyIdentified buys before it captures', () => {
    const src = read('index.ts');
    const at = src.indexOf('onPropertyIdentified: async (identified) => {');
    const block = src.slice(at, at + 1400);
    const buy = block.indexOf('await runEarlyChecklistPurchase(identified);');
    const capture = block.indexOf('await captureVisualsAtIdentification(projectId, county, identified);');
    expect(buy).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(-1);
    expect(buy).toBeLessThan(capture);
  });
  it('the early buy orders plats first and says so', () => {
    const src = read('index.ts');
    expect(src).toContain('const recs = orderPlatsFirstNewestFirst([...suppRecs, ...paidRecs]);');
    expect(src).toContain("handshakeLogger.attempt('[Purchase]', 'info', 'Buy order', describeBuyOrder(recs))");
  });
});

describe('the CAD deed history keeps the subject’s own deed', () => {
  const history = [{ deedDate: '08/12/2004', volume: '5456', page: '704' }, { instrumentNumber: '2015014567' }];
  it('matches by volume/page, by instrument (year-tolerant), and not otherwise', () => {
    expect(inCadDeedHistory({ instrumentNumber: '2004034968', volume: '5456', page: '704' }, history)).toBe(true);
    expect(inCadDeedHistory({ instrumentNumber: '34968', volume: null, page: null }, [{ instrumentNumber: '2004034968' }])).toBe(true);
    expect(inCadDeedHistory({ instrumentNumber: '2015014567', volume: null, page: null }, history)).toBe(true);
    expect(inCadDeedHistory({ instrumentNumber: '2020064728', volume: '1', page: '2' }, history)).toBe(false);
    expect(inCadDeedHistory({ instrumentNumber: '2004034968', volume: null, page: null }, null)).toBe(false);
  });
  it('the Bell orchestrator passes the CAD deed history into the identifiers', () => {
    expect(read('counties/bell/orchestrator.ts')).toContain('deedHistory: cad?.deedHistory ?? null,');
    const v = read('counties/bell/analyzers/document-relevance-validator.ts');
    expect(v).toContain('if (inCadDeedHistory(deed, property.deedHistory)) {');
    expect(v).toContain('score += 60;');
  });
});
