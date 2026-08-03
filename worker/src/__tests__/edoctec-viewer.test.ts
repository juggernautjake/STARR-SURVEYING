// eDocTec's preview PDF is free (Phase I, S7 — Coryell and Lampasas).
//
// `getDocumentImages` threw "image retrieval goes through the site's paid cart". Driving Coryell
// showed both things are true at once and the note collapsed them into the pessimistic one: the
// detail page has a Document Preview iframe serving application/pdf FREE (153 KB, no login), and a
// SEPARATE "Purchase Pages" cart at $1.00 for CERTIFIED copies.
//
// That mattered more here than anywhere else. Coryell is Gatesville and Copperas Cove, Lampasas is
// the other county on this vendor, and all of them were named by the owner as places this firm
// works — so the wrong note said the firm's own back yard was paywalled when it is not.

import { describe, it, expect } from 'vitest';
import {
  EDOCTEC_VIEWER,
  fetchPreviewPdf,
  previewUrl,
  refFromIframeSrc,
  refFromRowText,
} from '../adapters/edoctec-viewer.js';

const BASE = 'https://mclennan.edoctec.com/CoryellPublicRecords';
const REF = { imageFileName: '395664.DI', imageFileVolume: '255' };

describe('building the free preview URL', () => {
  it('matches the URL the portal itself uses', () => {
    expect(previewUrl(BASE, REF)).toBe(
      `${BASE}/Document/View?imageFileName=395664.DI&imageFileVolume=255`,
    );
  });

  it('tolerates a trailing slash on the base', () => {
    expect(previewUrl(`${BASE}/`, REF)).toBe(previewUrl(BASE, REF));
  });

  it('escapes the parameters', () => {
    const url = previewUrl(BASE, { imageFileName: 'A B.DI', imageFileVolume: '2/5' });
    expect(url).toContain('A%20B.DI');
    expect(url).toContain('2%2F5');
  });
});

describe('finding the reference without a second round trip', () => {
  it('reads it off the results row, which prints both', () => {
    // The grid shows "395664.DI Vol: 255", so a run that has already searched does not need to open
    // the detail page at all.
    const row = ' 395664 07/30/2026 0 0 Grantor SMITH JONATHAN JR ETAL UCC 1 STANDARD 3 395664.DI Vol: 255 ';
    expect(refFromRowText(row)).toEqual(REF);
  });

  it('falls back to the detail page iframe', () => {
    const src = `${BASE}/Document/View?imageFileName=395664.DI&imageFileVolume=255`;
    expect(refFromIframeSrc(src, BASE)).toEqual(REF);
  });

  it('returns null rather than guessing when a row carries neither', () => {
    // A row without a file reference is not a document without an image — it is a signal to open the
    // detail page.
    expect(refFromRowText('SMITH JONATHAN 07/30/2026')).toBeNull();
    expect(refFromIframeSrc(null, BASE)).toBeNull();
    expect(refFromIframeSrc(`${BASE}/Document/View`, BASE)).toBeNull();
  });
});

describe('fetching it', () => {
  const fakePage = (result: unknown) => ({ evaluate: async () => result });

  it('returns the bytes for a real PDF', async () => {
    const r = await fetchPreviewPdf(
      fakePage({ ok: true, magic: '%PDF-', base64: Buffer.from('%PDF-1.4').toString('base64'), length: 153043 }),
      previewUrl(BASE, REF),
    );
    expect(r.pdf).not.toBeNull();
    expect(r.bytes).toBe(153043);
  });

  it('says the cart is for CERTIFIED copies, a different artifact', async () => {
    const r = await fetchPreviewPdf(
      fakePage({ ok: true, magic: '%PDF-', base64: Buffer.from('%PDF-1.4').toString('base64'), length: 153043 }),
      previewUrl(BASE, REF),
    );
    expect(r.statement).toContain('free preview PDF');
    expect(r.statement).toContain('CERTIFIED');
    expect(r.statement).toContain('not for reading a boundary');
  });

  it('refuses HTML masquerading as a document', async () => {
    const r = await fetchPreviewPdf(fakePage({ ok: true, magic: '<html', base64: '', length: 900 }), previewUrl(BASE, REF));
    expect(r.pdf).toBeNull();
    expect(r.statement).toContain('NOT a PDF');
  });

  it('calls a non-200 a retrieval failure and says the preview is free', async () => {
    const r = await fetchPreviewPdf(fakePage({ ok: false, status: 500 }), previewUrl(BASE, REF));
    expect(r.pdf).toBeNull();
    expect(r.statement).toContain('its preview is free');
    expect(r.statement).toContain('not a document without pages');
  });
});

describe('the adapter no longer says the cart is required', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/edoctec-clerk-adapter.ts'), 'utf8');

  it('drops the claim that retrieval needs a purchase', () => {
    expect(src).not.toContain("goes through the site's paid cart, which is not wired up");
  });

  it('offers getDocumentPdf', () => {
    expect(src).toContain('async getDocumentPdf');
  });

  it('keeps the record of what the old note got wrong', () => {
    // The mistake is worth remembering: it is the third vendor whose "not wired up" note misread
    // what the portal offers.
    expect(src).toContain('both things are true at once');
  });

  it('names why these two counties in particular mattered', () => {
    expect(src).toContain('Gatesville and Copperas Cove');
  });
});

describe('the paid path is still named, not hidden', () => {
  it('keeps the purchase label, because certified copies are a real need', () => {
    expect(EDOCTEC_VIEWER.purchaseLabel).toBe('Purchase Pages');
  });
});
