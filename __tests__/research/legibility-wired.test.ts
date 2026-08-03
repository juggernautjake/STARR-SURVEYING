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
