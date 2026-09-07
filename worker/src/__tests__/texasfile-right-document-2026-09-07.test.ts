// The 1401 North East St run (2026-09-07) bought the WRONG deed, then bought it AGAIN, and did both
// AFTER the screen said "Research complete — TexasFile $0.00 of the $10.00 budget":
//   • TexasFile's deed table glues its legal cell — "Lot: 2Block: 5Subdivision: FRENCH ADDITION, W L"
//     — so no subdivision parsed, the chooser could not see the row was about ANOTHER property, and
//     it fell back to the newest filing for the owner's name.
//   • Every `search_required` want runs the same name search, so "most recent deed" and "all deeds"
//     both resolved to that row. The second time, the row's Download button carried no
//     data-for="Download-…", so it read as unowned; TexasFile's begin body named the EXISTING purchase
//     (numeric purchase_id), nothing was charged, and the ledger still booked $3.
//   • Both final purchase passes ran after the meters were read and the run announced its finish.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLegal } from '../services/texasfile-rows.js';
import { chooseTexasFileResult, describeNoChoice, beginNamesExistingPurchase, type TexasFileResult } from '../services/texasfile-buy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

const row = (o: Partial<TexasFileResult> & { guid: string }): TexasFileResult => ({
  instrument: null, instrumentRaw: null, bookVolPage: null, book: null, volume: null, page: null, pages: 3,
  priceUsd: null, type: 'WARRANTY DEED', countyType: null, date: '11/23/2020', grantor: null, grantee: null,
  legal: null, subdivision: null, lots: [], block: null, abstract: null, survey: null, text: '', owned: false,
  ...o,
} as TexasFileResult);

describe('parseLegal reads the deed table\'s GLUED legal cell', () => {
  it('"Lot: 2Block: 5Subdivision: FRENCH ADDITION, W L" → lot 2, block 5, FRENCH ADDITION, W L', () => {
    const p = parseLegal('Lot: 2Block: 5Subdivision: FRENCH ADDITION, W L');
    expect(p.lots).toEqual(['2']);
    expect(p.block).toBe('5');
    expect(p.subdivision).toBe('FRENCH ADDITION, W L');
  });
  it('stops the subdivision at the row\'s trailing labels', () => {
    const p = parseLegal('Lot: 4Block: 1Subdivision: WINNIE MAE ADDReference Documents:Pages: 3Purchased on: 9-7-2026County Type: -');
    expect(p.subdivision).toBe('WINNIE MAE ADDITION');
    expect(p.lots).toEqual(['4']);
  });
  it('the spaced form still parses', () => {
    const p = parseLegal('Lot: 3 Block: 1 Subdivision: WINNIE MAE ADDITION Lot: 4 More Info');
    expect(p.subdivision).toBe('WINNIE MAE ADDITION');
    expect(p.lots).toEqual(['3', '4']);
  });
});

describe('the chooser never buys a document about ANOTHER property', () => {
  const french = row({ guid: 'F-1', instrument: '2020064728', subdivision: 'FRENCH ADDITION, W L', lots: ['2'], block: '5', date: '11/23/2020' });
  const winnie = row({ guid: 'W-1', instrument: '2004034968', subdivision: 'WINNIE MAE ADDITION', lots: ['4'], block: '1', date: '08/13/2004' });
  const blank = row({ guid: 'B-1', instrument: '2015014567', date: '03/01/2015' });

  it('picks the row on the subject\'s subdivision over a newer one elsewhere', () => {
    expect(chooseTexasFileResult([french, winnie], { subdivision: 'WINNIE MAE ADDITION' })?.guid).toBe('W-1');
  });
  it('matches the CAD\'s zero-padded block ("001") against the index\'s "1"', () => {
    const other = row({ guid: 'W-2', instrument: '2010000001', subdivision: 'WINNIE MAE ADDITION', lots: ['7'], block: '1' });
    expect(chooseTexasFileResult([other, winnie], { subdivision: 'WINNIE MAE ADDITION', lot: '4', block: '001' })?.guid).toBe('W-1');
  });
  it('returns null when every row names a different subdivision', () => {
    expect(chooseTexasFileResult([french], { subdivision: 'WINNIE MAE ADDITION' })).toBeNull();
  });
  it('falls back to a row whose legal description is blank, never to one on another lot', () => {
    expect(chooseTexasFileResult([french, blank], { subdivision: 'WINNIE MAE ADDITION' })?.guid).toBe('B-1');
  });
  it('excludes what this run already bought, by instrument (year-tolerant) and by GUID', () => {
    expect(chooseTexasFileResult([french, winnie], { subdivision: 'WINNIE MAE ADDITION', excludeInstruments: ['34968'] })).toBeNull();
    expect(chooseTexasFileResult([winnie, blank], { subdivision: 'WINNIE MAE ADDITION', excludeGuids: ['w-1'] })?.guid).toBe('B-1');
    expect(chooseTexasFileResult([french], { excludeInstruments: ['2020064728'] })).toBeNull();
  });
  it('an explicit GUID still wins outright', () => {
    expect(chooseTexasFileResult([french, winnie], { guid: 'F-1', subdivision: 'WINNIE MAE ADDITION' })?.guid).toBe('F-1');
  });
  it('says why nothing was chosen, in the sentence the buy reports', () => {
    expect(describeNoChoice([french], { name: 'CAFFREY BARBARA', subdivision: 'WINNIE MAE ADD' }))
      .toBe('no TexasFile results on WINNIE MAE ADDITION among 1 row(s) for "CAFFREY BARBARA" — the rest name other properties or another kind of instrument, and neither is bought');
    expect(describeNoChoice([winnie], { excludeInstruments: ['2004034968'] })).toContain('already held by this run');
  });
});

describe('a begin body naming an existing purchase is a $0 re-open', () => {
  it('numeric purchase_id → owned; null → a fresh purchase', () => {
    expect(beginNamesExistingPurchase({ purchase_id: 17446112, pages: ['a.jpg'] })).toBe(true);
    expect(beginNamesExistingPurchase({ purchase_id: null, preview_url: '/document/api/purchase/78642980/complete/' })).toBe(false);
    expect(beginNamesExistingPurchase(null)).toBe(false);
  });
  it('the buy prices by what was charged, and the extractor reads Download / "Purchased on:"', () => {
    const buy = read('services/texasfile-buy.ts');
    expect(buy).toContain('const owned = opts.owned || beginNamesExistingPurchase(body);');
    expect(buy).toContain("const costUsd = bought.charged === false ? 0 : (price ?? pages.length);");
    const rows = read('services/texasfile-rows.ts');
    expect(rows).toContain("const purchasedNote = /Purchased on:/i.test(row.textContent || '');");
    expect(rows).toContain('owned: !purchaseBtn && (!!downloadBtn || purchasedNote)');
  });
});

describe('the thread is WIRED (check the CALLER)', () => {
  it('the orchestrator passes lot/block and what it already bought; the adapter forwards them', () => {
    const orch = read('services/document-purchase-orchestrator.ts');
    expect(orch).toContain('excludeInstruments: boughtThisRun.instruments,');
    expect(orch).toContain('excludeGuids: boughtThisRun.guids,');
    expect(orch).toContain('lot: rec.lot,');
    expect(orch).toContain('if (sold) boughtThisRun.instruments.push(sold);');
    const adapter = read('services/purchase-adapters/texasfile-purchase-adapter.ts');
    expect(adapter).toContain('excludeInstruments: hints.excludeInstruments,');
    expect(adapter).toContain('lot: hints.lot,');
    const sel = read('research/selection-purchases.ts');
    expect(sel).toContain('lot: ctx.lot,');
    expect(sel).toContain('block: ctx.block,');
  });
  it('the buy reports a null choice as "no TexasFile results …" (the adapter reads that as not_available)', () => {
    const buy = read('services/texasfile-buy.ts');
    expect(buy).toContain('const chosen = chooseTexasFileResult(results, input);');
    expect(buy).toContain('const why = describeNoChoice(results, input);');
    const adapter = read('services/purchase-adapters/texasfile-purchase-adapter.ts');
    expect(adapter).toContain("/no TexasFile results|over the \\$/.test(buy.reason)");
  });
  it('index.ts runs the final purchase pass BEFORE the filing window closes and the meters are read', () => {
    const src = read('index.ts');
    // One adjacency match, not an ordering assertion: the pass is awaited and the very next
    // statement closes the filing window (then the meters, then the handshake).
    expect(src).toMatch(/await finalPurchasePass\(\);\n\n      resetFlushClock\(projectId\);\n      const filing = endFiling\(projectId\);/);
    expect(src).toContain("lot: lotBlockOf(r.property).lot,");
    expect(src).toContain("import { parseLotBlock } from './counties/bell/orchestrator.js';");
    // Both passes live inside the one function.
    const fn = src.slice(src.indexOf('const finalPurchasePass = async'), src.indexOf('await finalPurchasePass();'));
    expect(fn).toContain('county-specific checklist purchase failed');
    expect(fn).toContain('could not write the reconciled boundary');
  });
});
