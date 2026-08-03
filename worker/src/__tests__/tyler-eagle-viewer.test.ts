// Tyler Eagle hands over the PDF (Phase I, S7 — 9 counties).
//
// `getDocumentImages` said image retrieval "goes through the portal's cart, which is not wired up".
// That was wrong in the direction that costs money: driving McLennan's portal showed the document
// page embeds PDF.js, and its `file=` parameter is a plain same-host URL serving a real
// application/pdf — 210 KB for a two-page deed, fetched with the session cookie and no purchase.
//
// Every string pinned below was read off that live portal, not guessed.

import { describe, it, expect } from 'vitest';
import {
  TOO_BROAD_PATTERN,
  TYLER_EAGLE_VIEWER,
  fetchPdfInPage,
  pdfRefFromIframeSrc,
} from '../adapters/tyler-eagle-viewer.js';

const ORIGIN = 'https://mclennancountytx-web.tylerhost.net';
const IFRAME_SRC =
  `${ORIGIN}/web/resources/pdfjs/web/tylerPdfJsViewer.html` +
  `?file=/web/document/servepdf/DEGRADED-DOC351S369.1.pdf/2020045566.pdf?index=1` +
  `&allowDownload=true&allowPrint=true`;

describe('finding the PDF behind the viewer', () => {
  it('pulls the file URL out of the PDF.js iframe', () => {
    const ref = pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!;
    expect(ref.url).toBe(`${ORIGIN}/web/document/servepdf/DEGRADED-DOC351S369.1.pdf/2020045566.pdf?index=1`);
  });

  it('takes the instrument number from the filename, which the county wrote', () => {
    // More trustworthy than anything scraped off the results grid.
    expect(pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!.instrumentNumber).toBe('2020045566');
  });

  it('notices that the free copy is the DEGRADED rendering', () => {
    expect(pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!.degraded).toBe(true);
  });

  it('does not mark a non-degraded file as degraded', () => {
    const clean = IFRAME_SRC.replace('DEGRADED-', '');
    expect(pdfRefFromIframeSrc(clean, ORIGIN)!.degraded).toBe(false);
  });

  it('returns null rather than guessing when there is no viewer', () => {
    // The caller must report a retrieval failure, not an empty page list.
    expect(pdfRefFromIframeSrc('', ORIGIN)).toBeNull();
    expect(pdfRefFromIframeSrc(`${ORIGIN}/web/resources/pdfjs/web/tylerPdfJsViewer.html`, ORIGIN)).toBeNull();
  });
});

describe('fetching it', () => {
  const fakePage = (result: unknown) => ({ evaluate: async () => result });

  it('returns the bytes when the portal serves a real PDF', async () => {
    const r = await fetchPdfInPage(
      fakePage({ ok: true, magic: '%PDF-', base64: Buffer.from('%PDF-1.4 x').toString('base64'), length: 210145 }),
      pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!,
    );
    expect(r.pdf).not.toBeNull();
    expect(r.bytes).toBe(210145);
  });

  it('says the free copy is reduced resolution, and why that matters', () => {
    // A watermark is an overlay a reader can see past. A degraded scan is LOWER RESOLUTION, and
    // resolution is exactly what OCR needs to read a bearing to the second.
    return fetchPdfInPage(
      fakePage({ ok: true, magic: '%PDF-', base64: Buffer.from('%PDF-1.4').toString('base64'), length: 210145 }),
      pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!,
    ).then((r) => {
      expect(r.degraded).toBe(true);
      expect(r.statement).toContain('DEGRADED');
      expect(r.statement).toContain('read a bearing to the second');
    });
  });

  it('refuses HTML masquerading as a document', async () => {
    // An expired session returns a login page with a perfectly good 200. Storing that as a deed is
    // worse than failing.
    const r = await fetchPdfInPage(
      fakePage({ ok: true, magic: '<!DOC', base64: '', length: 4000 }),
      pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!,
    );
    expect(r.pdf).toBeNull();
    expect(r.statement).toContain('NOT a PDF');
    expect(r.statement).toContain('expired');
  });

  it('reports a non-200 as a retrieval failure, not a missing document', async () => {
    const r = await fetchPdfInPage(fakePage({ ok: false, status: 403 }), pdfRefFromIframeSrc(IFRAME_SRC, ORIGIN)!);
    expect(r.pdf).toBeNull();
    expect(r.statement).toContain('the document exists, we did not get it');
  });
});

describe('the portal quirks that were driven', () => {
  it('knows about the disclaimer gate every Eagle portal shows first', () => {
    expect(TYLER_EAGLE_VIEWER.disclaimerAcceptSelector).toBe('#submitDisclaimerAccept');
  });

  it('uses the LAND records search path, not marriage or birth', () => {
    expect(TYLER_EAGLE_VIEWER.searchPath).toBe('search/DOCSEARCH402S1');
  });

  it('recognises Tyler\'s too-broad response', () => {
    // A bare surname returns this with an EMPTY result area — indistinguishable from "this name owns
    // nothing here" unless it is matched. The third vendor to wear this costume, after Kofile's
    // empty department and Avenu's timeout modal.
    expect(TOO_BROAD_PATTERN.test('We found more documents than the maximum allowed. It may be necessary to refine your search.')).toBe(true);
    expect(TOO_BROAD_PATTERN.test('No records found')).toBe(false);
  });
});

describe('the adapter no longer claims a cart is involved', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/tyler-eagle-adapter.ts'), 'utf8');

  it('no longer THROWS the cart claim', () => {
    // The phrase still appears once, in the comment recording what the method used to say and why it
    // was wrong. Asserting on its total absence would forbid keeping that history, which is the part
    // worth keeping — the claim cost nine counties their documents.
    expect(src).not.toContain('which is not wired up');
    expect(src).toContain('The previous version of this method said');
  });

  it('offers getDocumentPdf and points getDocumentImages at it', () => {
    expect(src).toContain('async getDocumentPdf');
    expect(src).toContain('use ');
    expect(src).toContain('Free, no cart');
  });
});
