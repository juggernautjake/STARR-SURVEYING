// worker/src/adapters/uslandrecords-viewer.ts — capturing the page images Avenu shows for free.
//
// Nineteen counties route to this vendor and `getDocumentImages` threw: *"Watermarked viewing is free
// on this portal but the viewer is not wired up."* The portal says the same thing in its own words —
// *"Searching and watermarked document viewing is provided as a free service"* — so the pages were
// there for the taking the whole time.
//
// Every selector and every wait below was read off the live Val Verde viewer on 2026-08-03, not
// guessed. What made this look hard is the first line of it.
//
// ── THE VIEWER OPENS IN A NEW TAB ───────────────────────────────────────────────────────────────
//
// Clicking the Image Viewer tab does not navigate the results page. It opens `ImageViewerEx.aspx` as
// a SECOND browser tab, and the original page stays exactly as it was. Code that clicks and then
// waits on the current page waits forever and then reports no images — which is indistinguishable
// from a document that has none, and is very likely why this was left unwired.
//
// ── THE RENDER SIGNAL IS THE src CHANGING, NOT A SLEEP ──────────────────────────────────────────
//
// The owner's instinct — *"maybe we just need to wait a bit longer for the images to render"* — is
// right about the cause and a fixed sleep is the wrong cure: too short and pages come back blank,
// too long and twenty pages costs ten minutes, and it is flaky either way on a slow county server.
//
// The image is served from `ACSResource.axd?SCTTYPE=ENCRYPTED&SCTKEY=…`, and the token is DIFFERENT
// for every page. So "this page has finished rendering" has an exact test: the `src` of
// `#ImageViewer1_docImage` differs from the one before it AND the image reports `complete` with a
// non-zero `naturalWidth`. Both halves are needed — `complete` alone is true for a broken image.
//
// ── AND THE PAGER SAYS WHEN IT IS DONE ──────────────────────────────────────────────────────────
//
// The viewer renames its buttons rather than disabling them: on the last page `#ImageViewer1_BtnNext`
// ceases to exist and `#ImageViewer1_BtnNext_Disabled` appears in its place. That is a far more
// reliable end condition than parsing "2 of 2" out of the page text, which is laid out with tabs and
// newlines through the middle of it.

import type { Page } from 'playwright';

/** Read off the live viewer, 2026-08-03. */
export const USLR_VIEWER = {
  /** The tab control on the results page. Clicking it opens a NEW TAB. */
  viewerTabSelector: '#TabController1_ImageViewertabitem',
  /** The document image itself, in the new tab. */
  imageSelector: '#ImageViewer1_docImage',
  nextSelector: '#ImageViewer1_BtnNext',
  /** Present INSTEAD of the above once there is no next page. */
  nextDisabledSelector: '#ImageViewer1_BtnNext_Disabled',
  /** The viewer page, so a new tab can be recognised. */
  viewerUrlFragment: 'ImageViewerEx.aspx',
  /** Images are served through this handler with a per-page encrypted token. */
  resourceFragment: 'ACSResource.axd',
} as const;

/** A page is rendered when its src has CHANGED and the image actually decoded. */
export const RENDERED_PREDICATE = `(sel, previousSrc) => {
  const img = document.querySelector(sel);
  if (!img) return false;
  if (!img.src || img.src === previousSrc) return false;
  // complete alone is true for a broken image — naturalWidth is what says pixels arrived.
  return img.complete && img.naturalWidth > 0;
}`;

export interface CapturedPage {
  pageNumber: number;
  /** PNG bytes, base64. */
  imageBase64: string;
  /** The tokenised URL it came from, for provenance. Expires — kept for the record, not for refetch. */
  sourceUrl: string;
  width: number;
  height: number;
}

export interface CaptureResult {
  pages: CapturedPage[];
  /** Why capture stopped, always stated. */
  stop: 'last_page' | 'max_pages' | 'render_timeout' | 'no_viewer' | 'no_image';
  statement: string;
}

export const DEFAULT_MAX_PAGES = 25;
export const RENDER_TIMEOUT_MS = 30_000;

/** Capture every page of the document currently selected in the results grid.
 *
 *  `openViewer` is injected rather than assumed: the caller owns the browser context and is the only
 *  thing that can wait for a new tab on it. */
export async function capturePages(
  viewerPage: Page,
  opts: { maxPages?: number; renderTimeoutMs?: number; log?: (m: string) => void } = {},
): Promise<CaptureResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const timeout = opts.renderTimeoutMs ?? RENDER_TIMEOUT_MS;
  const log = opts.log ?? (() => {});
  const pages: CapturedPage[] = [];

  // Page one: no previous src to compare against, so wait for the image to simply be there and
  // decoded. Passing '' as the previous src makes the same predicate serve both cases.
  const firstReady = await viewerPage
    .waitForFunction(RENDERED_PREDICATE, [USLR_VIEWER.imageSelector, ''], { timeout, polling: 250 })
    .then(() => true)
    .catch(() => false);

  if (!firstReady) {
    return {
      pages, stop: 'render_timeout',
      statement:
        `The viewer opened but no page image finished rendering within ${timeout / 1000}s. That is a ` +
        `RETRIEVAL failure — the document has pages, we did not get them — not a document without images.`,
    };
  }

  let previousSrc = '';
  for (let n = 1; n <= maxPages; n++) {
    const shot = await viewerPage.evaluate(
      (sel) => {
        const img = document.querySelector(sel) as HTMLImageElement | null;
        if (!img) return null;
        // Draw at NATURAL size, not the displayed size. The viewer scales to fit its frame, and
        // capturing the scaled version throws away resolution the OCR needs to read a bearing.
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        try {
          return { data: canvas.toDataURL('image/png'), src: img.src, w: img.naturalWidth, h: img.naturalHeight };
        } catch {
          // A cross-origin taint would land here. The image is same-origin through ACSResource.axd,
          // but saying so beats returning a blank page if that ever changes.
          return null;
        }
      },
      USLR_VIEWER.imageSelector,
    );

    if (!shot) {
      return {
        pages, stop: 'no_image',
        statement:
          `Page ${n} could not be read out of the viewer (the image element was missing or could not be ` +
          `copied). ${pages.length} page(s) were captured before that.`,
      };
    }

    pages.push({
      pageNumber: n,
      imageBase64: shot.data.replace(/^data:image\/png;base64,/, ''),
      sourceUrl: shot.src,
      width: shot.w,
      height: shot.h,
    });
    previousSrc = shot.src;
    log(`[USLandRecords viewer] captured page ${n} (${shot.w}×${shot.h})`);

    // The pager renames the button rather than disabling it.
    const hasNext = await viewerPage.$(USLR_VIEWER.nextSelector);
    if (!hasNext) {
      return {
        pages, stop: 'last_page',
        statement: `Captured all ${pages.length} page(s) — the viewer's Next control is disabled, so this is the whole document.`,
      };
    }

    await viewerPage.click(USLR_VIEWER.nextSelector, { timeout: 10_000 }).catch(() => undefined);

    const advanced = await viewerPage
      .waitForFunction(RENDERED_PREDICATE, [USLR_VIEWER.imageSelector, previousSrc], { timeout, polling: 250 })
      .then(() => true)
      .catch(() => false);

    if (!advanced) {
      return {
        pages, stop: 'render_timeout',
        statement:
          `Page ${n + 1} did not finish rendering within ${timeout / 1000}s. ${pages.length} page(s) were ` +
          `captured; the rest of this document was NOT retrieved and is not known to be absent.`,
      };
    }
  }

  return {
    pages, stop: 'max_pages',
    statement:
      `Stopped at the ${maxPages}-page ceiling with more pages remaining. The document is longer than this ` +
      `capture — that is our limit, not the document's length.`,
  };
}
