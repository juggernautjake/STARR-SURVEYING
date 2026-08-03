// The legibility check has to RUN, not merely exist (Phase I, S8).
//
// `ocr-legibility.ts` was written, exported, tested and had ZERO consumers in the real pipeline —
// only comments and its own tests referenced it. That is the authored-but-not-wired shape this
// session has found five times in other people's code and then produced once itself.
//
// A legibility check nobody calls prevents nothing. Its unit tests pass either way, which is exactly
// what makes the gap invisible.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assessCapture, US_LETTER } from '@/worker/src/services/ocr-legibility';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const documentService = read('lib/research/document.service.ts');
const analysisService = read('lib/research/analysis.service.ts');

describe('it is called where the capture happens', () => {
  it('assesses at OCR time, where the pixel size and tile grid are both known', () => {
    expect(documentService).toContain('assessCapture(imgW, imgH');
    expect(documentService).toContain('{ rows: TILE_ROWS, cols: TILE_COLS }');
  });

  it('stores the verdict WITH the segments, because it describes the capture', () => {
    // The same deed at 300 DPI and at 36 DPI is readable in one and not the other — the verdict
    // belongs to the capture, not to the document.
    expect(documentService).toContain('legibility?: CaptureAssessment');
    expect(documentService).toContain('legibility }');
  });

  it('prefers the image\'s embedded DPI over a guess when one exists', () => {
    expect(documentService).toContain("source: 'image_density'");
  });
});

describe('it is surfaced where the facts are written', () => {
  it('warns when facts come from a capture that is not rated good', () => {
    // A run that extracts twelve bearings from a 36 DPI scan produces twelve confident values and no
    // error anywhere. This is the only place that knows both things at once.
    expect(analysisService).toContain("legibility.verdict !== 'good'");
    expect(analysisService).toContain('should be treated as unverified');
  });

  it('names what specifically is at risk, not just "quality"', () => {
    expect(analysisService).toContain('bearings, distances, curve data');
  });
});

describe('an assumed page size never passes silently', () => {
  it('marks a guessed size as assumed', () => {
    const r = assessCapture(2550, 3300, { rows: 3, cols: 3 });
    expect(r.sizeSource).toBe('assumed_letter');
    expect(r.sizeAssumed).toBe(true);
  });

  it('says the assumption out loud, and what it would cost on a plat', () => {
    // A 36×48 plat assumed to be letter reports FOUR TIMES its true DPI — turning an unreadable
    // capture into a comfortable-looking one, which is precisely the failure this module exists for.
    const r = assessCapture(2550, 3300, { rows: 3, cols: 3 });
    expect(r.fullStatement).toContain('ASSUMED to be US Letter');
    expect(r.fullStatement).toContain('QUARTER');
    expect(r.fullStatement).toContain('provisional');
  });

  it('does not add the caveat when the size was actually read', () => {
    const r = assessCapture(2550, 3300, { rows: 3, cols: 3 },
      { ...US_LETTER, source: 'pdf_mediabox' });
    expect(r.sizeAssumed).toBe(false);
    expect(r.fullStatement).not.toContain('ASSUMED');
  });

  it('flags embedded DPI as the weaker source it is', () => {
    const r = assessCapture(2550, 3300, { rows: 3, cols: 3 },
      { ...US_LETTER, source: 'image_density' });
    expect(r.fullStatement).toContain('scanners often set wrongly');
  });
});

describe('the recommendation is acted on, not just recorded (R18)', () => {
  // `assessCapture` computed `recommendedTiles` on every document and NOTHING read it. The verdict
  // arrived after the page had already been cut into a constant grid, so the one number that could
  // have changed the outcome was produced and discarded. Consolidating the two tiling paths is what
  // R18 had left.
  it('both paths choose the grid from the same policy', () => {
    expect(documentService).toContain('chooseTiles(imgW, imgH, { rows: PDF_TILE_ROWS, cols: PDF_TILE_COLS }');
    expect(documentService).toContain('chooseTiles(imgW, imgH, { rows: TILE_ROWS, cols: TILE_COLS }');
  });

  it('the loops iterate the chosen grid, not the constant', () => {
    // The failure available here is choosing a grid and then tiling by the old constant anyway,
    // which would look correct in a log and change nothing.
    expect(documentService).toMatch(/for \(let row = 0; row < rowsN; row\+\+\)/);
    expect(documentService).toMatch(/for \(let col = 0; col < colsN; col\+\+\)/);
    expect(documentService).not.toMatch(/for \(let row = 0; row < TILE_ROWS/);
    expect(documentService).not.toMatch(/for \(let row = 0; row < PDF_TILE_ROWS/);
  });

  it('assesses against the grid actually used', () => {
    // Filing a verdict about the default while a different grid ran describes a capture that never
    // happened — and that verdict is what a reviewer later reads to decide whether to trust numbers.
    expect(documentService).toContain('assessCapture(imgW, imgH, grid.tiles, imagePhysical)');
  });

  it('records the grid actually used in the stored method string', () => {
    expect(documentService).toContain('ocr-tiled-${rowsN}x${colsN}');
    expect(documentService).toContain('gridsUsed');
  });

  it('takes the PDF page size from the render density, which is exact', () => {
    // The only path in this file where the physical size is known rather than assumed: sharp renders
    // the MediaBox at a density we choose, so inches = pixels ÷ that density.
    expect(documentService).toContain('widthIn: imgW / PDF_RENDER_DPI');
  });

  it('does not read the rendered pixel size as if it were points', () => {
    // `pdfPageSize` holds rendered PIXELS. Dividing it by 72 would call every letter-size deed a
    // 35-inch sheet and report ~72 DPI for it — an unreadable verdict on a readable page.
    expect(documentService).not.toContain('pdfPageSize.width / 72');
  });
});

describe('the PDF render density is high enough for a bearing to exist', () => {
  it('renders at 288 DPI, not the old 144', () => {
    // 72 × 2 = 144 DPI puts a 0.07" bearing at 10.1 px, under the 13 px floor — so fine text on a
    // plat was unreadable BEFORE any tiling, and no grid could recover it. The old comment claimed
    // "2x = ~150 DPI → ~300 DPI", which is not what 2 × 72 is.
    expect(documentService).toContain('const PDF_RENDER_DPI = 288');
    expect(documentService).not.toContain('PDF_RENDER_SCALE');
  });

  it('passes it to sharp as the density', () => {
    expect(documentService).toContain('density: PDF_RENDER_DPI');
  });
});
