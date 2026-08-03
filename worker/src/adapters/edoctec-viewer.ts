// worker/src/adapters/edoctec-viewer.ts — eDocTec's preview PDF is free; the cart is for certified copies.
//
// `getDocumentImages` threw: *"Image retrieval goes through the site's paid cart, which is not wired
// up."* Driving Coryell on 2026-08-03 shows that is wrong, and it is the third vendor in a row whose
// "not wired up" note misread what the portal actually offers.
//
// The document detail page has a **Document Preview** section holding an iframe:
//
//     /CoryellPublicRecords/Document/View?imageFileName=395664.DI&imageFileVolume=255
//
// which returns `application/pdf`, 153 KB, `%PDF-1.4`, with no login and no cart. The cart on that
// same page is a SEPARATE action — "Purchase Pages", $1.00 — for **certified** copies. Both things
// are true at once, and the previous note collapsed them into the more pessimistic one.
//
// ── WHY THE DISTINCTION IS WORTH KEEPING STRAIGHT ───────────────────────────────────────────────
//
// Coryell is Gatesville *and* Copperas Cove, and Lampasas is the other county here — all named by the
// owner as places this firm actually works. Believing these two needed a purchase meant believing
// the firm's own back yard was paywalled when it is not.
//
// A certified copy is a different artifact with a different purpose: it is what a court wants. For
// reading a boundary, the free preview is the same scan.
//
// ── THE PARAMETERS COME FROM THE SEARCH ROW, NOT ONLY THE DETAIL PAGE ───────────────────────────
//
// `imageFileName` and `imageFileVolume` are printed in the results grid itself ("395664.DI Vol: 255"),
// so a run that has already searched does NOT need a second round trip to the detail page. The
// detail-page iframe is the fallback for rows where the grid did not carry them.

export const EDOCTEC_VIEWER = {
  /** Detail page for one document, from the results grid. */
  detailPath: 'Home/ViewDetails?documentIndexingId=',
  /** The free preview PDF. */
  documentViewPath: 'Document/View',
  /** The iframe on the detail page that holds it. */
  previewIframeSelector: 'iframe[src*="Document/View"]',
  /** Paid, and separate: certified copies. Not needed to read a document. */
  purchaseLabel: 'Purchase Pages',
} as const;

export interface EdoctecImageRef {
  /** e.g. `395664.DI` */
  imageFileName: string;
  /** e.g. `255` */
  imageFileVolume: string;
}

/** Build the free preview URL for a document. */
export function previewUrl(baseUrl: string, ref: EdoctecImageRef): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/${EDOCTEC_VIEWER.documentViewPath}` +
    `?imageFileName=${encodeURIComponent(ref.imageFileName)}` +
    `&imageFileVolume=${encodeURIComponent(ref.imageFileVolume)}`;
}

/** Read the image reference out of a results-grid row.
 *
 *  The grid prints them together — `395664.DI Vol: 255`. Returns null when the row does not carry
 *  them, which is a signal to fall back to the detail page rather than to give up: a row without a
 *  file reference is not a document without an image. */
export function refFromRowText(rowText: string | null | undefined): EdoctecImageRef | null {
  const t = (rowText ?? '').replace(/\s+/g, ' ');
  const file = /\b([0-9A-Z_-]+\.[A-Z]{2,4})\b/i.exec(t)?.[1];
  const vol = /\bVol\.?\s*:?\s*([0-9A-Z-]+)/i.exec(t)?.[1];
  return file && vol ? { imageFileName: file, imageFileVolume: vol } : null;
}

/** Read it out of the detail page's preview iframe instead. */
export function refFromIframeSrc(iframeSrc: string | null | undefined, origin: string): EdoctecImageRef | null {
  if (!iframeSrc) return null;
  try {
    const u = new URL(iframeSrc, origin);
    const file = u.searchParams.get('imageFileName');
    const vol = u.searchParams.get('imageFileVolume');
    return file && vol ? { imageFileName: file, imageFileVolume: vol } : null;
  } catch {
    return null;
  }
}

export interface EdoctecFetchResult {
  pdf: Buffer | null;
  bytes: number;
  statement: string;
}

/** Fetch the preview PDF using the page's own session.
 *
 *  Fetched through the browser rather than a bare client for the same reason as Tyler: the portal
 *  sets a session, and a request arriving without it is refused in a way that looks like a missing
 *  document. */
export async function fetchPreviewPdf(
  page: { evaluate: (fn: string, arg: unknown) => Promise<unknown> },
  url: string,
): Promise<EdoctecFetchResult> {
  const FETCH = `async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const magic = String.fromCharCode(...bytes.slice(0, 5));
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { ok: true, magic, base64: btoa(binary), length: bytes.length };
  }`;

  const raw = (await page.evaluate(FETCH, url)) as
    | { ok: false; status: number }
    | { ok: true; magic: string; base64: string; length: number };

  if (!raw.ok) {
    return {
      pdf: null, bytes: 0,
      statement:
        `The portal answered ${raw.status} for this document's preview PDF. A retrieval failure — the ` +
        `document exists and its preview is free — not a document without pages.`,
    };
  }
  if (!raw.magic.startsWith('%PDF')) {
    return {
      pdf: null, bytes: raw.length,
      statement:
        `The preview URL returned ${raw.length} bytes that are NOT a PDF (starts "${raw.magic}"). Usually a ` +
        `session that has lapsed and is serving HTML with a 200; storing that as a document would be worse ` +
        `than failing.`,
    };
  }

  return {
    pdf: Buffer.from(raw.base64, 'base64'),
    bytes: raw.length,
    statement:
      `Retrieved the free preview PDF (${Math.round(raw.length / 1024)} KB). The cart on this portal sells ` +
      `CERTIFIED copies at $1.00 a page — a different artifact, needed for a court and not for reading a ` +
      `boundary.`,
  };
}
