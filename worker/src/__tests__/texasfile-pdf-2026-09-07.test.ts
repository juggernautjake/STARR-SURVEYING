// A TexasFile PLAT is served as one PDF, not as page-image URLs, and its begin body carries the
// document id only inside two URLs (plan PLATS_FIRST_AND_VIEWER 1.1–1.2). Every body below was
// recorded from the live site on 2026-09-07 (Bell, GUID 0FE0A9D8-…, document 126110904).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentIdFromBegin, isTexasFilePdfResponse, pdfFilenameFromUrl, pageOrder, rasterisePdf } from '../services/texasfile-pdf.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const PLAT_BEGIN = { preview_url: '/document/api/purchase/126110904/complete/?from_product_content_type=search&from_product_object_id=56831957', retrieval_url: '/document/api/status/126110904/purchase/', images_available: true, purchase_id: null };
const PLAT_COMPLETE = { purchase_url: '/document/viewer/126110904/', user_balance: '$57.00', purchase_id: 17446050 };
const DEED_BEGIN = { pages: ['https://media.texasfile.com/x/p1.jpg'], purchase_id: 126088572, user_balance: '$67.00', images_available: true };
const PDF_URL = 'https://media.texasfile.com/documents/2026-09-06/148ebff2-07d9-4f0f-a9e4-ee2a8c00e27e.pdf?response-content-disposition=inline%3Bfilename%3D%22Bell_1954-09-21_V_A_P_166A.pdf%22&Expires=4102444800&Signature=abc';

describe('documentIdFromBegin — the id is in the URLs when purchase_id is null', () => {
  it('reads the plat begin body (purchase_id null) from preview_url', () => {
    expect(documentIdFromBegin(PLAT_BEGIN)).toBe(126110904);
  });
  it('falls back to retrieval_url, then purchase_url', () => {
    expect(documentIdFromBegin({ retrieval_url: '/document/api/status/999/purchase/' })).toBe(999);
    expect(documentIdFromBegin({ purchase_url: '/document/viewer/555/' })).toBe(555);
  });
  it('prefers a numeric purchase_id (the deed shape), and is null with nothing', () => {
    expect(documentIdFromBegin(DEED_BEGIN)).toBe(126088572);
    expect(documentIdFromBegin({ images_available: null })).toBeNull();
    expect(documentIdFromBegin(null)).toBeNull();
  });
  it('the complete body names the receipt and the viewer', () => {
    expect(PLAT_COMPLETE.purchase_id).toBe(17446050);
    expect(documentIdFromBegin(PLAT_COMPLETE)).toBe(17446050); // purchase_id wins when present
  });
});

describe('the document PDF', () => {
  it('is recognised by content type or by its media URL', () => {
    expect(isTexasFilePdfResponse(PDF_URL, 'application/pdf')).toBe(true);
    expect(isTexasFilePdfResponse(PDF_URL, undefined)).toBe(true);
    expect(isTexasFilePdfResponse('https://media.texasfile.com/association/2025/04/03/AAPL.png', 'image/png')).toBe(false);
    expect(isTexasFilePdfResponse('https://www.texasfile.com/document/viewer/1/', 'text/html')).toBe(false);
  });
  it('carries the recorded filename (county, date, cabinet, slide)', () => {
    expect(pdfFilenameFromUrl(PDF_URL)).toBe('Bell_1954-09-21_V_A_P_166A.pdf');
  });
  it('orders pdftoppm output numerically, not lexically', () => {
    expect(['page-10.png', 'page-2.png', 'page-1.png'].sort(pageOrder)).toEqual(['page-1.png', 'page-2.png', 'page-10.png']);
  });
  it('rasterisePdf states it when poppler is missing rather than returning zero pages', async () => {
    // On a machine with pdftoppm this rasterises a trivially invalid PDF and fails on the file; either
    // way the failure is a thrown, worded error — never an empty array.
    await expect(rasterisePdf(Buffer.from('%PDF-1.4 not really'))).rejects.toThrow(/pdftoppm/);
  });
});

describe('WIRED: the purchase completes via preview_url and takes pages from the PDF', () => {
  const src = read('services/texasfile-buy.ts');
  const fn = src.slice(src.indexOf('export async function purchaseTexasFile('), src.indexOf('export async function downloadTexasFilePages('));
  it('derives the document id from the begin body and completes through preview_url', () => {
    expect(fn).toContain('const documentId = documentIdFromBegin(body);');
    expect(fn).toContain('const completeUrl = body.preview_url ? `${TF}${body.preview_url}` : purchaseCompleteUrl(documentId, searchId);');
  });
  it('keeps the deed path (page URLs) and adds the PDF path (viewer → rasterise)', () => {
    expect(fn).toContain("method: 'page-urls'");
    expect(fn).toContain('capturePdfPages(page, viewerUrl ?? `${TF}/document/viewer/${documentId}/`, log)');
  });
  it('buyDocument uses the rasterised pages when present', () => {
    expect(src).toContain('const pages = bought.pageImages ?? await downloadTexasFilePages(page, bought.pages);');
  });
  it('the worker image installs poppler for pdftoppm', () => {
    expect(read('../Dockerfile')).toMatch(/apt-get install -y --no-install-recommends poppler-utils/);
  });
});
