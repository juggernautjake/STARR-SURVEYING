// worker/src/__tests__/paid-path-audit-fixes.test.ts — the paid avenue, wired end to end.
//
// From the 2026-09-06 trace of the free and paid document avenues. Five gaps on the path that spends
// money, each guarded here:
//   1. the purchase never called TexasFile's `/complete/` step — the call that charges the wallet;
//   2. a `search_required` want collapsed to ONE ledger key per county, so after the first such
//      purchase every later one was "already owned" and never bought;
//   3. `research_document_purchases.run_id` was always null;
//   4. the in-run purchase sites never passed what earlier rounds hold, so prior-round dedup was off
//      exactly for the follow-up rounds the iterative loop runs;
//   5. the early refusal filed no skip row, so the Analysis-stage notice stayed silent.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { purchaseCompleteUrl, purchaseApiUrl } from '../services/texasfile-buy.js';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('TexasFile purchase completes (step 2 of the mapped flow)', () => {
  it('builds the complete URL the live site expects', () => {
    expect(purchaseCompleteUrl(126088572, '56812446')).toBe(
      'https://www.texasfile.com/document/api/purchase/126088572/complete/?from_product_content_type=search&from_product_object_id=56812446',
    );
    // and step 1 is unchanged
    expect(purchaseApiUrl('Bell', 'GUID', '56812446')).toMatch(/\/document\/api\/purchase\/texas\/[a-z-]+\/instrument\/GUID\//);
  });
  it('purchaseTexasFile calls complete after a begun purchase and keeps the begun pages if it fails', () => {
    const src = read('src/services/texasfile-buy.ts');
    const fn = src.slice(src.indexOf('export async function purchaseTexasFile('), src.indexOf('export async function downloadTexasFilePages('));
    // Since 2026-09-07 the document id comes from the begin body's URLs when purchase_id is null (a
    // plat), and the complete call is preview_url itself — texasfile-pdf-2026-09-07.test.ts pins it.
    expect(fn).toContain('const documentId = documentIdFromBegin(body);');
    expect(fn).toContain('purchaseCompleteUrl(documentId, searchId)');
    expect(fn).toContain("using the begun purchase's pages");
    // the sold instrument rides back on the buy result
    expect(src).toContain('instrument: chosen.instrument ?? undefined,');
  });
});

describe('search_required wants are keyed by what was actually sold', () => {
  const orch = read('src/services/document-purchase-orchestrator.ts');
  it('skips the ledger lookup for the placeholder and records under the resolved instrument', () => {
    expect(orch).toContain("const searchRequired = rec.instrument === 'search_required';");
    expect(orch).toContain('const soldAs = result.instrumentNumber && result.instrumentNumber !== \'search_required\'');
    expect(orch).toContain('instrument: soldAs,');
    // a vendor that names nothing still gets a per-want key, not the shared placeholder
    expect(orch).toContain('`search_required:${rec.searchName ??');
  });
  it('the TexasFile adapter reports the instrument it sold', () => {
    expect(read('src/services/purchase-adapters/texasfile-purchase-adapter.ts')).toContain('result.instrumentNumber = buy.instrument ?? instrumentNumber;');
  });
});

describe('purchases carry their run and check what earlier rounds hold', () => {
  it('the ledger row gets the run id from the orchestrator config, passed by all three in-run sites', () => {
    const orch = read('src/services/document-purchase-orchestrator.ts');
    expect(orch).toContain('runId: config.runId ?? null,');
    expect(read('src/types/purchase.ts')).toContain('runId?: string | null;');
    const index = read('src/index.ts');
    const sites = index.split('orchestrator.executePurchases(').length - 1;
    expect(sites).toBe(4); // three in-run + the standalone endpoint
    expect((index.match(/autoReanalyze: false,\s*runId: activePipelines\.get\(projectId\)\?\.runId \?\? null,/g) ?? []).length).toBe(3);
  });
  it('the orchestrator loads the project library itself when no held index was passed', () => {
    const orch = read('src/services/document-purchase-orchestrator.ts');
    expect(orch).toContain("if (!heldDocuments && projectId !== 'unknown-project')");
    expect(orch).toContain("heldDocuments = library.toDocumentIndex('paid');");
    // before the recommendation loop, so every rec is checked against it
    expect(orch.indexOf("heldDocuments = library.toDocumentIndex('paid')")).toBeLessThan(orch.indexOf('if (heldDocuments) {'));
  });
});

describe('the early refusal files skip rows', () => {
  it('records one skip row per checklist want when the permission carries a skip status', () => {
    const index = read('src/index.ts');
    const early = index.slice(index.indexOf("'Nothing purchased (early)'") - 1600, index.indexOf("'Nothing purchased (early)'"));
    expect(early).toContain('recordSkippedPurchases(');
    expect(early).toContain('permission.skipStatus');
    expect(early).toContain('wantsToPurchaseRecommendations(');
  });
});
