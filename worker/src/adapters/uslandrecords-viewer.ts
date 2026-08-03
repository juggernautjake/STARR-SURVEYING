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
  /** Set when the capture is too small for fine survey text to exist in it (see below). */
  legibilityWarning?: string;
}

// ── THE RENDER SIZE IS SET BY THE VIEWPORT, AND THE DEFAULT IS UNREADABLE ───────────────────────
//
// Measured 2026-08-03. At an ordinary browser size this viewer paints a letter-size page at
// **304×561** — about 36 DPI, which puts a 0.07" bearing label at roughly **2.5 pixels**.
//
// That is not a marginal capture. The digits are not in the image at all, and OCR asked to read them
// does not fail — it returns something *plausible*, which is the single failure mode this platform is
// built to prevent. Nineteen counties route here, so capturing at the default size would have meant
// nineteen counties of confident nonsense.
//
// **The token signs the render size, so the URL cannot be edited.** The image comes from
// `ACSResource.axd?SCTTYPE=ENCRYPTED&SCTKEY=…&CNTWIDTH=…&CNTHEIGHT=…&FITTYPE=Height&ZOOM=1`, and
// changing *any* of those parameters — even re-sending the identical width — fails, while the exact
// original URL succeeds. `CNTWIDTH`/`CNTHEIGHT` are inside what the key covers.
//
// What DOES work is asking the viewer for a bigger one. Those parameters track the browser viewport,
// so the render is set before the URL is ever generated:
//
//     viewport 1280×720   →  304×561    ~36 DPI   bearing ~2.5 px   unreadable
//     viewport 2400×3200  →  1712×3162  ~201 DPI  bearing ~14 px    MARGINAL
//
// So `CAPTURE_VIEWPORT` below is not a cosmetic preference — it is the difference between a document
// and a picture of one. A context opened at a normal size and pointed at this viewer produces files
// that look fine in a gallery and cannot be read.
//
// **It is still only marginal, and the tempting number is the wrong one.** The render is fitted to
// HEIGHT, so the height axis reads ~287 DPI — but the WIDTH is 1712 px across 8.5", which is 201 DPI,
// and legibility is set by the worse axis. Reaching a comfortable 20 px needs ~286 DPI, i.e. ~2430 px
// of image width and therefore a taller viewport still. Untested: a headed browser cannot be sized
// past the screen, and whether this portal renders that large is unknown. A headless worker has no
// such limit, so raising this is worth trying there and measuring with `ocr-legibility.ts`.

/** The viewport the viewer tab must be opened at.
 *
 *  Driven: this produces a ~1712×3162 render of a letter page (~287 DPI), where the default browser
 *  size produces 304×561 (~36 DPI). The height is what matters — `FITTYPE=Height` means the render is
 *  fitted to the container's height — but the width is set generously too, so a landscape plat is not
 *  the one shape that comes back small.
 *
 *  Larger would be better still and is untested; this is the size actually measured. */
export const CAPTURE_VIEWPORT = { width: 2400, height: 3200 } as const;

/** Height in pixels below which a captured page cannot contain readable fine text.
 *
 *  A US-letter page is 11" tall; 13 px of 0.07" text needs ~186 DPI, so ~2000 px of page height. Set
 *  conservatively at 1200 — a capture under this is certainly unusable for a bearing; one above it is
 *  not thereby proven usable, which is what `ocr-legibility.ts` is for. */
export const MIN_USABLE_PAGE_HEIGHT_PX = 1200;

export function legibilityWarningFor(width: number, height: number): string | undefined {
  if (height >= MIN_USABLE_PAGE_HEIGHT_PX) return undefined;
  return (
    `Captured at ${width}×${height}, which is roughly ${Math.round(height / 11)} DPI for a letter page — a 0.07" ` +
    `bearing label is about ${(((height / 11) * 0.07)).toFixed(1)} px tall here, so fine survey text is NOT ` +
    `PRESENT in this image. Readable for layout and large type only. Anything fine "read" from this is a guess ` +
    `by the model, not a reading. The viewer's image URL takes WIDTH/HEIGHT/ZOOM — a larger render is the fix.`
  );
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

    const warning = legibilityWarningFor(shot.w, shot.h);
    pages.push({
      pageNumber: n,
      imageBase64: shot.data.replace(/^data:image\/png;base64,/, ''),
      sourceUrl: shot.src,
      width: shot.w,
      height: shot.h,
      legibilityWarning: warning,
    });
    previousSrc = shot.src;
    log(`[USLandRecords viewer] captured page ${n} (${shot.w}×${shot.h})`);
    if (warning) log(`[USLandRecords viewer] page ${n}: ${warning}`);

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
