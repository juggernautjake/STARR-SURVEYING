// Can the model actually read this, before we ask it (Phase I, S8).
//
// S8 was parked as "needs a golden plat to measure". Most of it is not a measurement — it is
// arithmetic, and it can be settled before spending an API call: a bearing on a Texas plat is ~0.07"
// tall, and whether a model can read it comes down to how many pixels of the ORIGINAL survive into
// the image it is finally shown.
//
// The finding that made this urgent is in the last block: Avenu's viewer paints a letter page at
// 304×561 by default, which puts a bearing at 2.5 px. That is not marginal — the digits are not in
// the image at all, and OCR asked to read them will return something plausible.

import { describe, it, expect } from 'vitest';
import {
  API_MAX_PIXELS,
  GOOD_FINE_TEXT_PX,
  MIN_FINE_TEXT_PX,
  OBSERVED_CAPTURES,
  assessLegibility,
  effectiveDpi,
  recommendTiles,
} from '../services/ocr-legibility.js';

/** A 36×48 plat scanned at 300 DPI — 10800 × 14400 px. */
const PLAT_300 = { widthIn: 36, heightIn: 48, pixelWidth: 10800, pixelHeight: 14400 };
/** The same plat scanned at 150, which counties do. */
const PLAT_150 = { widthIn: 36, heightIn: 48, pixelWidth: 5400, pixelHeight: 7200 };
/** An ordinary deed at 300 DPI. */
const DEED_300 = { widthIn: 8.5, heightIn: 11, pixelWidth: 2550, pixelHeight: 3300 };

describe('effective DPI is measured against the physical page', () => {
  it('reads a 300 DPI scan as 300', () => {
    expect(effectiveDpi(PLAT_300)).toBeCloseTo(300, 0);
  });

  it('takes the WORSE axis', () => {
    // A page rendered anisotropically is limited by its worst direction, and fine text is as likely
    // to run one way as the other on a plat.
    expect(effectiveDpi({ widthIn: 10, heightIn: 10, pixelWidth: 3000, pixelHeight: 1000 })).toBeCloseTo(100, 0);
  });
});

describe('a deed at 300 DPI is comfortable', () => {
  it('reads fine text well above the floor', () => {
    const r = assessLegibility(DEED_300, { rows: 3, cols: 3 });
    expect(r.verdict).toBe('good');
    expect(r.fineTextPxAtModel).toBeGreaterThanOrEqual(GOOD_FINE_TEXT_PX);
  });

  it('needs no downscale at 3x3', () => {
    expect(assessLegibility(DEED_300, { rows: 3, cols: 3 }).apiWillDownscale).toBe(false);
  });
});

describe('a 36x48 plat is where the fixed grid starts to matter', () => {
  it('survives 3x3 at 300 DPI', () => {
    // 14400 / 3 = 4800 px, under the 8000 limit, so nothing is thrown away.
    const r = assessLegibility(PLAT_300, { rows: 3, cols: 3 });
    expect(r.apiWillDownscale).toBe(false);
    expect(r.verdict).toBe('good');
  });

  it('is WRECKED by 1x1 on the same image', () => {
    // 14400 px on a side is downscaled to 8000 — a 44% loss that takes 21 px of bearing text down to
    // under 12. The resolution existed; the tiling threw it away.
    const r = assessLegibility(PLAT_300, { rows: 1, cols: 1 });
    expect(r.apiWillDownscale).toBe(true);
    expect(r.verdict).not.toBe('good');
    expect(r.statement).toContain('the tiling throws it away');
  });

  it('names the grid that would fix a throw-away', () => {
    const r = assessLegibility(PLAT_300, { rows: 1, cols: 1 });
    expect(r.recommendedTiles).toEqual({ rows: 2, cols: 2 });
  });

  it('is marginal at 150 DPI however it is tiled', () => {
    // 150 × 0.07 = 10.5 px. Below the floor, and no grid adds resolution the scan never had.
    const r = assessLegibility(PLAT_150, { rows: 3, cols: 3 });
    expect(r.verdict).toBe('unreadable');
    expect(r.recommendedTiles).toBeNull();
  });

  it('says plainly when more tiles CANNOT help', () => {
    // The most important sentence in the module: cutting a blurry image up further only makes
    // smaller pictures of the same blur.
    const r = assessLegibility(PLAT_150, { rows: 3, cols: 3 });
    expect(r.statement).toContain('MORE TILES CANNOT FIX IT');
    expect(r.statement).toContain('Re-fetch at a higher render size or scan');
    expect(r.statement).toContain('treated as unverified');
  });
});

describe('marginal is called marginal, not passed', () => {
  it('warns that a misread will look like a plausible bearing', () => {
    // 200 DPI puts fine text at 14 px — over the floor, under comfortable. This is the dangerous
    // band, because OCR does not fail there, it guesses.
    const plat200 = { widthIn: 36, heightIn: 48, pixelWidth: 7200, pixelHeight: 9600 };
    const r = assessLegibility(plat200, { rows: 3, cols: 3 });
    expect(r.verdict).toBe('marginal');
    expect(r.fineTextPxAtModel).toBeGreaterThanOrEqual(MIN_FINE_TEXT_PX);
    expect(r.statement).toContain('look like a plausible bearing rather than an error');
  });
});

describe('the recommendation only ever avoids waste', () => {
  it('keeps every tile under the API limit', () => {
    const rec = recommendTiles(PLAT_300)!;
    expect(PLAT_300.pixelWidth / rec.cols).toBeLessThanOrEqual(API_MAX_PIXELS);
    expect(PLAT_300.pixelHeight / rec.rows).toBeLessThanOrEqual(API_MAX_PIXELS);
  });

  it('refuses to recommend a grid for an image that lacks the resolution', () => {
    // Advice that cannot work is worse than none: it looks like a fix and changes nothing.
    expect(recommendTiles(PLAT_150)).toBeNull();
  });
});

describe('what the portals actually served us', () => {
  it('shows Avenu\'s default viewer render is far too small to read a bearing', () => {
    // Measured on 2026-08-03: 304×561 for a letter page — about 36 DPI, putting a 0.07" bearing at
    // ~2.5 px. Not marginal: the digits are not in the image, and OCR asked to read them will return
    // something plausible.
    const r = assessLegibility(OBSERVED_CAPTURES.avenuDefaultViewer, { rows: 1, cols: 1 });
    expect(r.effectiveDpi).toBeLessThan(60);
    expect(r.fineTextPxAtModel).toBeLessThan(4);
    expect(r.verdict).toBe('unreadable');
  });

  it('shows the viewport fix moved Avenu from unreadable to MARGINAL — not to safe', () => {
    // 304x561 -> 1712x3162 purely by opening the capture tab larger. A large improvement, and still
    // only marginal: the tempting number is the height axis (~287 DPI), but the WIDTH is 1712 px
    // across 8.5" = 201 DPI, and legibility is set by the worse axis. A bearing is ~14 px.
    const r = assessLegibility(OBSERVED_CAPTURES.avenuLargeViewport, { rows: 1, cols: 1 });
    expect(r.verdict).toBe('marginal');
    expect(r.effectiveDpi).toBeCloseTo(201, 0);
  });

  it('both fixed vendors land in the same marginal band, which is the open question', () => {
    // Avenu at the capture viewport and Tyler's DEGRADED copy are both ~200 DPI. Whether a 14 px
    // bearing is read correctly or confidently wrong is the one thing arithmetic cannot settle.
    const avenu = assessLegibility(OBSERVED_CAPTURES.avenuLargeViewport, { rows: 1, cols: 1 });
    const tyler = assessLegibility(OBSERVED_CAPTURES.tylerEagleDegraded, { rows: 3, cols: 3 });
    expect(avenu.verdict).toBe('marginal');
    expect(tyler.verdict).toBe('marginal');
  });

  it('measures Tyler DEGRADED at 200 DPI — the MARGINAL band, not the safe one', () => {
    // Read out of the PDF's own image XObjects: 1699x2220 against a 611x799pt MediaBox. A 0.07" bearing
    // is 14 px — over the 13 px floor, under the 20 px comfort mark. That is exactly where OCR does not
    // fail but guesses, across nine counties.
    const r = assessLegibility(OBSERVED_CAPTURES.tylerEagleDegraded, { rows: 3, cols: 3 });
    expect(r.effectiveDpi).toBeGreaterThan(190);
    expect(r.effectiveDpi).toBeLessThan(210);
    expect(r.verdict).toBe('marginal');
    expect(r.statement).toContain('look like a plausible bearing rather than an error');
  });

  it('says the fix is a bigger render, not more tiles', () => {
    const r = assessLegibility(OBSERVED_CAPTURES.avenuDefaultViewer, { rows: 1, cols: 1 });
    expect(r.recommendedTiles).toBeNull();
    expect(r.statement).toContain('Re-fetch at a higher render size');
  });
});
