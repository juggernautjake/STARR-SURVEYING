// Capturing the free watermarked pages Avenu already shows (Phase I, S7).
//
// Nineteen counties route to this vendor and `getDocumentImages` threw *"the viewer is not wired
// up"*. The portal's own text says watermarked viewing is free, so the pages were available the
// whole time.
//
// Every selector and wait pinned here was read off the LIVE Val Verde viewer on 2026-08-03 — driven,
// not guessed. Three facts made it look harder than it is, and each is the kind of thing that would
// be silently re-broken by someone tidying the code:
//
//   1. The viewer opens in a NEW TAB. Clicking and then waiting on the current page waits forever
//      and reports no images — indistinguishable from a document that has none.
//   2. The render signal is the image `src` TOKEN CHANGING, not elapsed time. Each page is served
//      from ACSResource.axd with a different encrypted key.
//   3. The pager RENAMES its Next button (`#…BtnNext` → `#…BtnNext_Disabled`) rather than disabling
//      it, so the end condition is the element's absence.

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_MAX_PAGES,
  RENDERED_PREDICATE,
  USLR_VIEWER,
  CAPTURE_VIEWPORT,
  capturePages,
  legibilityWarningFor,
} from '../adapters/uslandrecords-viewer.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQ==';

/** A viewer that renders `total` pages, handing back a different token each time — as the real one
 *  does — and dropping its Next button on the last page. */
function fakeViewer(total: number, opts: { failAtPage?: number } = {}) {
  let page = 1;
  return {
    page: () => page,
    async waitForFunction(_fn: unknown, _args: unknown, _o: unknown) {
      if (opts.failAtPage === page) throw new Error('timeout');
      return true;
    },
    async evaluate(_fn: unknown, _sel: unknown) {
      return { data: PNG, src: `https://x/ACSResource.axd?SCTKEY=token-${page}`, w: 1224, h: 1584 };
    },
    async $(sel: string) {
      // Next exists only while there is a next page.
      if (sel === USLR_VIEWER.nextSelector) return page < total ? {} : null;
      return null;
    },
    async click() { page += 1; },
  } as never;
}

describe('the selectors and waits are the ones driven on the live viewer', () => {
  it('opens the viewer from the results-page tab control', () => {
    expect(USLR_VIEWER.viewerTabSelector).toBe('#TabController1_ImageViewertabitem');
  });

  it('knows the viewer is a separate page', () => {
    expect(USLR_VIEWER.viewerUrlFragment).toBe('ImageViewerEx.aspx');
  });

  it('reads the document image, not a thumbnail', () => {
    expect(USLR_VIEWER.imageSelector).toBe('#ImageViewer1_docImage');
  });

  it('ends on the RENAMED next button, not on parsed page text', () => {
    // The page text is laid out with tabs and newlines through the middle of "2 of 2"; the element's
    // absence is exact.
    expect(USLR_VIEWER.nextSelector).toBe('#ImageViewer1_BtnNext');
    expect(USLR_VIEWER.nextDisabledSelector).toBe('#ImageViewer1_BtnNext_Disabled');
  });
});

describe('the render signal is not a sleep', () => {
  it('requires the src to have CHANGED', () => {
    // A fixed wait is too short on a slow county server and too long twenty times over. Each page is
    // a different encrypted token, so "changed" is exact.
    expect(RENDERED_PREDICATE).toContain('img.src === previousSrc');
  });

  it('requires the image to have actually decoded, not merely be complete', () => {
    // `complete` is true for a BROKEN image. naturalWidth is what says pixels arrived.
    expect(RENDERED_PREDICATE).toContain('img.complete && img.naturalWidth > 0');
  });
});

describe('capturing a document', () => {
  it('captures every page and stops on the last', async () => {
    const r = await capturePages(fakeViewer(3));
    expect(r.pages).toHaveLength(3);
    expect(r.stop).toBe('last_page');
    expect(r.statement).toContain('this is the whole document');
  });

  it('numbers the pages in order', async () => {
    const r = await capturePages(fakeViewer(3));
    expect(r.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });

  it('strips the data-URL prefix so the bytes are storable', async () => {
    const r = await capturePages(fakeViewer(1));
    expect(r.pages[0]!.imageBase64.startsWith('data:')).toBe(false);
    expect(r.pages[0]!.imageBase64).toMatch(/^iVBOR/);
  });

  it('keeps the tokenised source URL for provenance', async () => {
    const r = await capturePages(fakeViewer(1));
    expect(r.pages[0]!.sourceUrl).toContain('ACSResource.axd');
  });

  it('captures at natural size, because the viewer scales to fit its frame', async () => {
    // Capturing the displayed size throws away the resolution OCR needs to read a bearing.
    const r = await capturePages(fakeViewer(1));
    expect(r.pages[0]!.width).toBe(1224);
  });
});

describe('a partial capture never reads as a complete one', () => {
  it('says the rest was NOT retrieved when a page fails to render', async () => {
    const r = await capturePages(fakeViewer(5, { failAtPage: 3 }), { renderTimeoutMs: 10 });
    expect(r.stop).toBe('render_timeout');
    expect(r.pages.length).toBeLessThan(5);
    expect(r.statement).toContain('NOT retrieved and is not known to be absent');
  });

  it('calls a first-page failure a retrieval failure, not an imageless document', async () => {
    const r = await capturePages(fakeViewer(3, { failAtPage: 1 }), { renderTimeoutMs: 10 });
    expect(r.pages).toHaveLength(0);
    expect(r.statement).toContain('RETRIEVAL failure');
    expect(r.statement).toContain('not a document without images');
  });

  it('says a truncation is OUR ceiling, not the document\'s length', async () => {
    const r = await capturePages(fakeViewer(50), { maxPages: 3 });
    expect(r.stop).toBe('max_pages');
    expect(r.statement).toContain("that is our limit, not the document's length");
  });

  it('has a ceiling at all, so one long document cannot consume a run', () => {
    expect(DEFAULT_MAX_PAGES).toBeGreaterThan(0);
    expect(DEFAULT_MAX_PAGES).toBeLessThanOrEqual(50);
  });
});

describe('the adapter no longer refuses outright', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/uslandrecords-adapter.ts'), 'utf8');

  it('does not still throw "the viewer is not wired up"', () => {
    expect(src).not.toContain('the viewer is not wired up');
  });

  it('arms the new-tab wait BEFORE clicking', () => {
    // Armed after the click, the tab can open and be missed in the gap between the two.
    const armIdx = src.indexOf("waitForEvent('page'");
    const clickIdx = src.indexOf('viewerTabSelector');
    expect(armIdx).toBeGreaterThan(-1);
    expect(armIdx).toBeLessThan(clickIdx);
  });

  it('closes the viewer tab afterwards', () => {
    // A tab per document would exhaust a long run's memory.
    expect(src).toContain('viewer.close()');
  });
});

describe('the default render is too small to contain a bearing', () => {
  // Measured 2026-08-03: this viewer paints a letter page at 304×561 — about 36 DPI, putting a 0.07"
  // bearing at ~2.5 px. Not a marginal capture: the digits are NOT IN THE IMAGE. OCR asked to read
  // them does not fail, it returns something plausible, which is the one failure mode this platform
  // exists to prevent.
  it('warns on a capture that cannot hold fine text', () => {
    const w = legibilityWarningFor(304, 561);
    expect(w).toBeDefined();
    expect(w).toContain('NOT');
    expect(w).toContain('PRESENT in this image');
    expect(w).toContain('a guess by the model, not a reading');
  });

  it('names the fix as a bigger render, not a better capture', () => {
    // The capture already takes natural size. The natural size IS the problem.
    expect(legibilityWarningFor(304, 561)).toContain('WIDTH/HEIGHT/ZOOM');
  });

  it('is silent on a capture large enough to be worth assessing properly', () => {
    // Silence here is not a claim of legibility — ocr-legibility.ts is what judges that.
    expect(legibilityWarningFor(2550, 3300)).toBeUndefined();
  });

  it('attaches the warning to the captured page, not only to the log', async () => {
    // A log line is not a result. The warning has to travel with the page so anything reading a
    // bearing off it can say where that bearing came from.
    const r = await capturePages({
      waitForFunction: async () => true,
      evaluate: async () => ({ data: 'data:image/png;base64,AAAA', src: 'https://x/ACSResource.axd?k=1', w: 304, h: 561 }),
      $: async () => null,
      click: async () => {},
    } as never);
    expect(r.pages[0]!.legibilityWarning).toBeDefined();
  });

  it('leaves a usable capture unwarned', async () => {
    const r = await capturePages(fakeViewer(1));   // 1224×1584
    expect(r.pages[0]!.legibilityWarning).toBeUndefined();
  });
});

describe('the render size is set by the viewport, not by the URL', () => {
  // The finding that made this slice matter. Measured 2026-08-03:
  //
  //   viewport 1280x720   ->  304x561    ~36 DPI   bearing ~2.5 px   unreadable
  //   viewport 2400x3200  ->  1712x3162  ~287 DPI  bearing ~20 px    comfortable
  //
  // The image token SIGNS the render dimensions: re-requesting with CNTHEIGHT edited fails, while the
  // byte-identical original URL succeeds. So the size cannot be asked for after the fact — it has to
  // be set before the viewer generates the URL, which makes the viewport a correctness setting rather
  // than a cosmetic one.

  it('opens the viewer tab large enough to render a readable page', () => {
    expect(CAPTURE_VIEWPORT.height).toBeGreaterThanOrEqual(3000);
    expect(CAPTURE_VIEWPORT.width).toBeGreaterThanOrEqual(2000);
  });

  it('records that the URL cannot be edited to ask for more', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/uslandrecords-viewer.ts'), 'utf8');
    // Someone will try. The reason it fails needs to be where they will look.
    expect(src).toContain('token signs the render size');
    expect(src).toContain('even re-sending the identical width');
  });

  it('sets the viewport before capturing, in the adapter', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/uslandrecords-adapter.ts'), 'utf8');
    const sizeIdx = src.indexOf('setViewportSize');
    const captureIdx = src.indexOf('capturePages(viewer');
    expect(sizeIdx).toBeGreaterThan(-1);
    expect(sizeIdx).toBeLessThan(captureIdx);
  });

  it('reloads after resizing, so the portal issues a token for the bigger render', () => {
    // The URL was generated from whatever the container was when the tab opened; resizing alone does
    // not re-request the image.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/uslandrecords-adapter.ts'), 'utf8');
    expect(src).toContain('viewer.reload(');
  });

  it('a page rendered at the capture viewport clears the legibility warning', () => {
    // 3162 px for a letter page is ~287 DPI — a bearing is ~20 px, comfortably readable.
    expect(legibilityWarningFor(1712, 3162)).toBeUndefined();
  });
});
