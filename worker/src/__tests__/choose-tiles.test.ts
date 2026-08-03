// Deciding the grid instead of reporting on it afterwards (plan R18).
//
// `assessCapture()` computed `recommendedTiles` on every single document processed by this platform,
// and nothing ever read it. The verdict arrived AFTER the page had already been cut into a constant
// grid — 3×3 for PDFs, 2×2 for images, whether the page is an 8.5×11 deed or a 36×48 plat.
//
// The two claims worth testing hardest are the ones that are easy to get backwards: that more tiles
// help ONLY by avoiding the API downscale, and that they cannot invent resolution the capture never
// had. Recommending 6×6 for a 150 DPI scan would be advice that looks like a fix, changes nothing,
// and costs 36 vision calls to prove it.

import { describe, it, expect } from 'vitest';
import {
  chooseTiles, effectiveDpi, MAX_TILES_PER_AXIS, MIN_FINE_TEXT_PX, GOOD_FINE_TEXT_PX,
  FINE_TEXT_HEIGHT_IN, API_MAX_PIXELS,
} from '../services/ocr-legibility.js';

const LETTER = { widthIn: 8.5, heightIn: 11, source: 'pdf_mediabox' as const };
/** A 36×48 plat sheet, the size this whole module exists for. */
const PLAT = { widthIn: 36, heightIn: 48, source: 'pdf_mediabox' as const };

describe('a grid is only raised when raising it actually helps', () => {
  it('leaves a comfortable capture alone', () => {
    // A letter page at 288 DPI: 2448×3168, fine text 20 px, nothing downscales.
    const d = chooseTiles(2448, 3168, { rows: 3, cols: 3 }, LETTER);
    expect(d.changed).toBe(false);
    expect(d.tiles).toEqual({ rows: 3, cols: 3 });
    expect(d.statement).toContain('comfortably readable');
  });

  it('raises the grid when the default would be downscaled by the API', () => {
    // A 36×48 plat at 288 DPI is 10368×13824. A 1×1 "grid" hands the API a 13824 px side, which it
    // resizes to 8000 — taking a 20 px bearing down to 11.7 and under the floor. The resolution is
    // in the image; the grid throws it away.
    const d = chooseTiles(10368, 13824, { rows: 1, cols: 1 }, PLAT);
    expect(d.changed).toBe(true);
    expect(d.tiles.rows).toBeGreaterThan(1);
    expect(d.statement).toContain('the default throws it away');
  });

  it('keeps every tile under the API limit when it raises the grid', () => {
    const d = chooseTiles(10368, 13824, { rows: 1, cols: 1 }, PLAT);
    expect(13824 / d.tiles.rows).toBeLessThanOrEqual(API_MAX_PIXELS);
    expect(10368 / d.tiles.cols).toBeLessThanOrEqual(API_MAX_PIXELS);
  });

  it('never goes BELOW the caller\'s default, even when arithmetic would allow it', () => {
    // The existing constants were chosen for plats, and a page can be hard to read for reasons this
    // arithmetic does not model — faint ink, skew, a stamp across the text. Cutting below them to
    // save calls would trade a known-good default for a guess.
    const d = chooseTiles(2448, 3168, { rows: 3, cols: 3 }, LETTER);
    expect(d.tiles.rows).toBeGreaterThanOrEqual(3);
    expect(d.tiles.cols).toBeGreaterThanOrEqual(3);
  });
});

describe('more tiles cannot invent resolution', () => {
  it('refuses to recommend a grid for a capture that never had the detail', () => {
    // A letter page at 150 DPI puts a 0.07" bearing at 10.5 px — under the 13 px floor — and NO grid
    // adds resolution the scan never had.
    const d = chooseTiles(1275, 1650, { rows: 3, cols: 3 }, LETTER);
    expect(d.changed).toBe(false);
    expect(d.statement).toContain('MORE TILES CANNOT HELP');
  });

  it('says the page needs re-capturing rather than re-tiling', () => {
    // The distinction is the actionable part: one is an errand, the other is a setting.
    const d = chooseTiles(1275, 1650, { rows: 3, cols: 3 }, LETTER);
    expect(d.statement).toContain('re-capturing at a higher resolution, not re-tiling');
  });

  it('does not burn 36 vision calls to prove a scan is unreadable', () => {
    const d = chooseTiles(1275, 1650, { rows: 3, cols: 3 }, LETTER);
    expect(d.tiles.rows * d.tiles.cols).toBe(9);
  });
});

describe('the cap is stated when it binds', () => {
  it('never exceeds the per-axis cap', () => {
    // A pathological page must not bill for a hundred vision calls.
    const d = chooseTiles(90_000, 90_000, { rows: 1, cols: 1 }, PLAT);
    expect(d.tiles.rows).toBeLessThanOrEqual(MAX_TILES_PER_AXIS);
    expect(d.tiles.cols).toBeLessThanOrEqual(MAX_TILES_PER_AXIS);
  });

  it('says so, rather than letting a capped grid look like a considered choice', () => {
    const d = chooseTiles(90_000, 90_000, { rows: 1, cols: 1 }, PLAT);
    expect(d.capped).toBe(true);
    expect(d.statement).toContain('CAPPED');
    expect(d.wanted!.rows).toBeGreaterThan(MAX_TILES_PER_AXIS);
  });
});

describe('the arithmetic the code comments claim', () => {
  // These comments drive a real setting change, so the numbers in them are checked rather than
  // trusted.
  it('144 DPI really does put a bearing under the floor', () => {
    // The old PDF render density, from `72 * PDF_RENDER_SCALE` where the scale was 2 — under a
    // comment claiming "2x = ~150 DPI → ~300 DPI". Twice 72 is 144, not 300.
    expect(144 * FINE_TEXT_HEIGHT_IN).toBeLessThan(MIN_FINE_TEXT_PX);
  });

  it('288 DPI really does reach comfortable', () => {
    expect(288 * FINE_TEXT_HEIGHT_IN).toBeGreaterThanOrEqual(GOOD_FINE_TEXT_PX);
  });

  it('and no tiling could have rescued the old setting', () => {
    // Which is the point: this was not a tiling bug, it was a capture bug that tiling cannot fix.
    const d = chooseTiles(Math.round(8.5 * 144), Math.round(11 * 144), { rows: 3, cols: 3 }, LETTER);
    expect(d.statement).toContain('MORE TILES CANNOT HELP');
  });

  it('a letter page at 288 DPI stays inside the API limit undivided', () => {
    expect(Math.round(11 * 288)).toBeLessThan(API_MAX_PIXELS);
  });

  it('effectiveDpi takes the worse axis', () => {
    // A page rendered anisotropically is limited by its worst direction, and fine text is as likely
    // to run one way as the other on a plat.
    expect(effectiveDpi({ widthIn: 8.5, heightIn: 11, pixelWidth: 2448, pixelHeight: 1100 })).toBe(100);
  });
});
