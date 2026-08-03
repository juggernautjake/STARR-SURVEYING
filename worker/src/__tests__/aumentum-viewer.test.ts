// Bastrop, where screenshotting really is the right answer (Phase I, S7).
//
// This is the vendor the owner's suggestion was written for — "screenshot the images if we cannot
// find a way to download the files". On Avenu, Tyler Eagle and eDocTec it proved unnecessary: each
// hands over an image or a PDF once you know where to look. Here it does not.
//
// Driven on Bastrop: SearchImage.aspx holds an iframe running a LEADTOOLS Web Image Viewer that
// paints into #divWIV1. There is no <img src> and no PDF handler. So the screenshot is used because
// the alternatives were CHECKED and are absent, and that distinction is what these tests hold.

import { describe, it, expect, vi } from 'vitest';
import {
  AUMENTUM_VIEWER,
  EMPTY_CRITERIA_ALERT,
  SCREENSHOT_FIDELITY_CAVEAT,
  captureViewerPage,
} from '../adapters/aumentum-viewer.js';

function fakeImagePage(opts: { painted?: boolean; shotFails?: boolean } = {}) {
  return {
    waitForSelector: async () => ({}),
    $: async () => ({}),
    evaluate: async () => opts.painted !== false,
    screenshot: async () => {
      if (opts.shotFails) throw new Error('screenshot failed');
      return Buffer.from('PNGDATA');
    },
  } as never;
}

describe('the portal really does expose nothing fetchable', () => {
  it('records the LEADTOOLS viewer container it paints into', () => {
    expect(AUMENTUM_VIEWER.viewerCanvasSelector).toBe('#divWIV1');
    expect(AUMENTUM_VIEWER.viewerIframeSelector).toContain('LTViewer');
  });

  it('records that the image page opens separately from the results grid', () => {
    expect(AUMENTUM_VIEWER.imagePagePath).toBe('/RealEstate/SearchImage.aspx');
  });

  it('records that the row icon is not an anchor', () => {
    // The cell has to be clicked; there is no href to follow.
    expect(AUMENTUM_VIEWER.rowImageIconAlt).toBe('Click here to retrieve document image');
  });
});

describe('the search form raises an alert that would HANG a scraper', () => {
  it('recognises the empty-criteria alert', () => {
    // An unhandled dialog blocks the page and every action after it, so a scraper that does not
    // expect one does not fail — it hangs, which reads as a slow county rather than a bug in us.
    expect(EMPTY_CRITERIA_ALERT.test('Please enter search criteria.')).toBe(true);
    expect(EMPTY_CRITERIA_ALERT.test('No records found')).toBe(false);
  });
});

describe('capturing the page', () => {
  it('captures once the viewer has painted', async () => {
    const r = await captureViewerPage(fakeImagePage());
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]!.imageBase64).toBe(Buffer.from('PNGDATA').toString('base64'));
  });

  it('flags every page as captured by screenshot', async () => {
    // Downstream has to be able to weigh this differently from a fetched scan.
    const r = await captureViewerPage(fakeImagePage());
    expect(r.pages[0]!.capturedByScreenshot).toBe(true);
  });

  it('says the screenshot was a last resort, not a shortcut', async () => {
    const r = await captureViewerPage(fakeImagePage());
    expect(r.statement).toContain('checked for');
    expect(r.statement).toContain('not a shortcut taken instead of one');
  });

  it('states what a screenshot costs, in the terms that matter here', () => {
    // A deed's text is usually fine; a plat's curve table carries a radius to the hundredth in small
    // type, and whether this survives that is exactly the measurement S8 is waiting on.
    expect(SCREENSHOT_FIDELITY_CAVEAT).toContain('exposes no downloadable file');
    expect(SCREENSHOT_FIDELITY_CAVEAT).toContain('NOT established as adequate for fine');
    expect(SCREENSHOT_FIDELITY_CAVEAT).toContain('curve table');
  });
});

describe('a failed capture is never an empty document', () => {
  it('reports a viewer that never painted as a retrieval failure', async () => {
    const r = await captureViewerPage(fakeImagePage({ painted: false }), { timeoutMs: 10 });
    expect(r.pages).toHaveLength(0);
    expect(r.statement).toContain('RETRIEVAL failure');
    expect(r.statement).toContain('not a document without pages');
  });

  it('reports a failed screenshot the same way', async () => {
    const r = await captureViewerPage(fakeImagePage({ shotFails: true }));
    expect(r.pages).toHaveLength(0);
    expect(r.statement).toContain('not a document without pages');
  });

  it('carries the fidelity caveat even when nothing was captured', async () => {
    // The caveat describes the METHOD, not the result, so a caller assembling a report has it either
    // way rather than only on the happy path.
    const r = await captureViewerPage(fakeImagePage({ painted: false }), { timeoutMs: 10 });
    expect(r.fidelityCaveat).toBe(SCREENSHOT_FIDELITY_CAVEAT);
  });
});

describe('the adapter is honest about the artifact', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/adapters/aumentum-clerk-adapter.ts'), 'utf8');

  it('no longer claims a basket flow is the only route', () => {
    expect(src).not.toContain('which is not wired up');
  });

  it('never rates a screenshot as good quality', () => {
    // A quality gate downstream must not treat a picture of a viewer as equivalent to a fetched scan.
    expect(src).toContain("quality: 'fair'");
    expect(src).toContain('Never');
  });
});
