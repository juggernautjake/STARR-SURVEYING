// worker/src/adapters/tyler-eagle-viewer.ts — Tyler Eagle serves the PDF outright.
//
// Nine counties route here and `getDocumentImages` threw: *"Image retrieval goes through the
// portal's cart, which is not wired up."* That was wrong, and wrong in the direction that costs
// money — there is no cart involved in getting a readable copy.
//
// Driven on McLennan's live portal 2026-08-03. The document page embeds **PDF.js in an iframe**, and
// the iframe's `file=` parameter is a plain URL on the same host serving a real
// `application/pdf` — 210 KB for a two-page deed, `%PDF-1.4`, fetched with the session cookie and no
// purchase:
//
//     /web/document/servepdf/DEGRADED-DOC351S369.1.pdf/2020045566.pdf?index=1
//     ...&allowDownload=true&allowPrint=true
//
// That is better than anything a screenshot fallback could produce. Avenu needed the viewer captured
// page by page because it paints an `<img>`; this vendor hands over the file.
//
// ── "DEGRADED" IS IN THE FILENAME, AND IT MEANS SOMETHING ───────────────────────────────────────
//
// The free copy is served as `DEGRADED-<docId>`. The portal is telling us plainly that this is a
// reduced-quality rendering, and the paid copy is a different file.
//
// That matters more here than a watermark does. A watermark is an overlay a reader can see past; a
// degraded scan is *lower resolution*, and resolution is precisely what OCR needs to read a bearing
// to the second or a curve's radius to the hundredth. So `degraded` travels with the document, and
// a run that extracts fine geometry from one of these should be able to say that its source was the
// free rendering rather than the record copy.
//
// Whether the degradation is bad enough to matter is a MEASUREMENT nobody has taken — it needs a
// plat whose values are already known. Until then this claims only what it can see: the file is the
// free rendering, and that fact is attached to everything read from it.
//
// ── THE TOO-BROAD RESPONSE, IN A THIRD COSTUME ──────────────────────────────────────────────────
//
// A bare surname search returns *"We found more documents than the maximum allowed. It may be
// necessary to refine your search."* with an empty result area. Unhandled, that is indistinguishable
// from "this name owns nothing in this county" — the same defect Kofile's empty department and
// Avenu's timeout modal wear, now on a third vendor.

export const TYLER_EAGLE_VIEWER = {
  /** The disclaimer gate every Eagle portal shows before anything else works. */
  disclaimerAcceptSelector: '#submitDisclaimerAccept',
  /** Land records search, relative to the portal root. Other paths are marriage/birth/death. */
  searchPath: 'search/DOCSEARCH402S1',
  searchButtonSelector: '#searchButton',
  /** Result rows link to /web/document/<docId>?search=<searchId>. */
  documentHrefPattern: /\/web\/document\/([A-Z0-9]+)\?/i,
  /** The document page embeds PDF.js; the real file is in its `file=` query parameter. */
  viewerIframeSelector: 'iframe[src*="tylerPdfJsViewer"]',
  /** Marks the free rendering rather than the record copy. */
  degradedMarker: 'DEGRADED-',
} as const;

/** Tyler's "your search was too broad" text. Empty results plus this is NOT an empty county. */
export const TOO_BROAD_PATTERN = /more documents than the maximum allowed/i;

export interface TylerPdfRef {
  /** Absolute URL of the PDF, ready to fetch with the session's cookies. */
  url: string;
  /** True when the file served is the free, reduced-quality rendering. */
  degraded: boolean;
  /** The instrument number, which Tyler puts in the filename. */
  instrumentNumber: string | null;
}

/** Pull the PDF URL out of the PDF.js iframe on a document page.
 *
 *  Returns null when the iframe or its `file=` parameter is absent — which is a RETRIEVAL failure to
 *  be reported, not a document without pages. The caller must not turn this into an empty array. */
export function pdfRefFromIframeSrc(iframeSrc: string, origin: string): TylerPdfRef | null {
  if (!iframeSrc) return null;
  let file: string | null = null;
  try {
    file = new URL(iframeSrc, origin).searchParams.get('file');
  } catch {
    return null;
  }
  if (!file) return null;

  let url: string;
  try {
    url = new URL(file, origin).href;
  } catch {
    return null;
  }

  // `…/servepdf/DEGRADED-DOC351S369.1.pdf/2020045566.pdf?index=1` — the second filename is the
  // county's own instrument number, which is more trustworthy than anything scraped off the page.
  const instrument = /\/([0-9][0-9A-Z-]{3,})\.pdf/i.exec(file)?.[1] ?? null;

  return {
    url,
    degraded: file.includes(TYLER_EAGLE_VIEWER.degradedMarker),
    instrumentNumber: instrument,
  };
}

export interface TylerFetchResult {
  pdf: Buffer | null;
  degraded: boolean;
  bytes: number;
  statement: string;
}

/** Fetch the PDF with the browser's own cookies.
 *
 *  Deliberately fetched through the PAGE rather than with a bare HTTP client: the file is behind the
 *  session established by accepting the disclaimer, and a fetch from outside the browser context
 *  arrives without it and is refused. That refusal would look like a missing document. */
export async function fetchPdfInPage(
  page: { evaluate: (fn: string, arg: unknown) => Promise<unknown> },
  ref: TylerPdfRef,
): Promise<TylerFetchResult> {
  const FETCH = `async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Confirm it really is a PDF: a session that has expired returns an HTML login page with a
    // perfectly good 200, and storing that as a deed is worse than failing.
    const magic = String.fromCharCode(...bytes.slice(0, 5));
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { ok: true, magic, base64: btoa(binary), length: bytes.length };
  }`;

  const raw = (await page.evaluate(FETCH, ref.url)) as
    | { ok: false; status: number }
    | { ok: true; magic: string; base64: string; length: number };

  if (!raw.ok) {
    return {
      pdf: null, degraded: ref.degraded, bytes: 0,
      statement: `The portal answered ${raw.status} for this document's PDF. A retrieval failure — the document exists, we did not get it.`,
    };
  }
  if (!raw.magic.startsWith('%PDF')) {
    return {
      pdf: null, degraded: ref.degraded, bytes: raw.length,
      statement:
        `The URL returned ${raw.length} bytes that are NOT a PDF (starts "${raw.magic}"). Usually an expired ` +
        `session returning a login page with a 200 — storing that as a deed would be worse than failing.`,
    };
  }

  return {
    pdf: Buffer.from(raw.base64, 'base64'),
    degraded: ref.degraded,
    bytes: raw.length,
    statement: ref.degraded
      ? `Retrieved the free DEGRADED rendering (${Math.round(raw.length / 1024)} KB). It is a reduced-resolution ` +
        `copy, not the record copy — resolution is what OCR needs to read a bearing to the second, so anything ` +
        `fine read from it should carry that caveat.`
      : `Retrieved the document PDF (${Math.round(raw.length / 1024)} KB).`,
  };
}
