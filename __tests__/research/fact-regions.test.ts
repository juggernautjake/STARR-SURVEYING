// Giving a fact a place on the page (plan R17).
//
// The assertions that matter here are the REFUSALS. A bounding box's whole value is that a reviewer
// can trust where it points; a box that lands confidently on the wrong part of a plat is worse than
// no box at all, because the reviewer stops looking once they have "found" the value.
//
// So: ambiguous quotes get no box, boxes that do not fit the page get no box, and a missing page
// size gets no box rather than a guessed one. Each refusal says why.

import { describe, it, expect } from 'vitest';
import {
  locateFactRegion,
  normaliseBox,
  normaliseForMatch,
  summariseLocations,
  type OcrRegion,
} from '@/lib/research/fact-regions';
import { isNormalisedBox } from '@/lib/research/fact-evidence';

const PAGE = { width: 2000, height: 4000 };

const region = (over: Partial<OcrRegion> = {}): OcrRegion => ({
  segmentId: 'r0c0',
  boundingBox: { x: 0, y: 0, w: 1000, h: 2000 },
  text: 'BEING 12.43 ACRES OF LAND IN THE JOSE ORTIZ SURVEY, ABSTRACT 123',
  depth: 0,
  page: 1,
  ...over,
});

describe('a located fact', () => {
  it('returns a box for a quote found in exactly one region', () => {
    const r = locateFactRegion('12.43 acres', [region()], PAGE);
    expect(r.region).not.toBeNull();
    expect(r.region!.segmentId).toBe('r0c0');
  });

  it('produces a box the fact table will accept', () => {
    // The contract lives in fact-evidence.ts and rejects pixel values. If these two ever disagree,
    // every region this module produces is silently dropped at write time.
    const r = locateFactRegion('12.43 acres', [region()], PAGE);
    expect(isNormalisedBox(r.region!.box)).toBe(true);
  });

  it('matches across the line breaks and casing OCR introduces', () => {
    // The model quotes "12.43 acres"; the page reads "12.43\n  ACRES". A literal comparison misses
    // almost every real quote.
    const r = locateFactRegion('12.43 acres', [region({ text: 'BEING 12.43\n   ACRES OF LAND' })], PAGE);
    expect(r.region).not.toBeNull();
  });

  it('prefers the zoom sub-segment over the quadrant containing it', () => {
    // The pipeline escalated that area because it was dense — the finer box is both more useful and
    // more likely to be where the value is.
    const r = locateFactRegion('12.43 acres', [
      region({ segmentId: 'r0c0', depth: 0 }),
      region({ segmentId: 'r0c0-z1', depth: 1, boundingBox: { x: 100, y: 200, w: 300, h: 250 } }),
    ], PAGE);
    expect(r.region!.segmentId).toBe('r0c0-z1');
    expect(r.region!.precision).toBe('zoom_segment');
  });

  it('says a quadrant is a quadrant rather than implying word-level precision', () => {
    const r = locateFactRegion('12.43 acres', [region()], PAGE);
    expect(r.region!.precision).toBe('segment');
    expect(r.region!.statement).toContain('a quadrant, not a word');
  });
});

describe('when it refuses, and why', () => {
  it('refuses an ambiguous quote rather than picking one', () => {
    // Two regions contain it; we do not know which it was read from. Scrolling to a plausible wrong
    // place and letting the reviewer believe it is the failure the box contract exists to prevent.
    const r = locateFactRegion('12.43 acres', [
      region({ segmentId: 'r0c0' }),
      region({ segmentId: 'r1c1', boundingBox: { x: 1000, y: 2000, w: 1000, h: 2000 } }),
    ], PAGE);
    expect(r.region).toBeNull();
    expect(r.failure).toBe('ambiguous');
    expect(r.reason).toContain('rather than scrolling to a plausible wrong one');
  });

  it('refuses when there is no page size to divide by', () => {
    const r = locateFactRegion('12.43 acres', [region()], null);
    expect(r.failure).toBe('no_page_size');
    expect(r.reason).toContain('wrong at every other zoom level');
  });

  it('refuses a box that does not fit the page it was supposedly measured on', () => {
    // A box needing clamping was measured against a different rendering. Squashing it to fit
    // produces a plausible box pointing at the wrong place.
    const r = locateFactRegion('12.43 acres', [region({ boundingBox: { x: 0, y: 0, w: 9999, h: 9999 } })], PAGE);
    expect(r.region).toBeNull();
    expect(r.reason).toContain('measured against a different rendering');
  });

  it('says so when the document has no regions at all', () => {
    const r = locateFactRegion('12.43 acres', [], PAGE);
    expect(r.failure).toBe('no_regions');
    expect(r.reason).toContain('not read through the vision pipeline');
  });

  it('says so when the fact carries no quote to search for', () => {
    expect(locateFactRegion(null, [region()], PAGE).failure).toBe('no_excerpt');
    expect(locateFactRegion('ac', [region()], PAGE).failure).toBe('no_excerpt');
  });

  it('says so when the quote is nowhere on the page', () => {
    const r = locateFactRegion('47.9 varas', [region()], PAGE);
    expect(r.failure).toBe('not_found');
    expect(r.reason).toContain('may have been paraphrased');
  });
});

describe('normalising a pixel box', () => {
  it('divides by the page it was measured on', () => {
    expect(normaliseBox({ x: 1000, y: 2000, w: 500, h: 1000 }, PAGE)).toEqual({
      x: 0.5, y: 0.5, width: 0.25, height: 0.25,
    });
  });

  it('refuses rather than clamping an oversized box', () => {
    expect(normaliseBox({ x: 0, y: 0, w: 5000, h: 100 }, PAGE)).toBeNull();
  });

  it('refuses a zero or negative box', () => {
    expect(normaliseBox({ x: 0, y: 0, w: 0, h: 100 }, PAGE)).toBeNull();
    expect(normaliseBox({ x: 0, y: 0, w: -5, h: 100 }, PAGE)).toBeNull();
  });

  it('refuses a page with no dimensions', () => {
    expect(normaliseBox({ x: 0, y: 0, w: 10, h: 10 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('the batch summary leads with what is NOT located', () => {
  it('names the ambiguous ones separately from the missing ones', () => {
    const results = [
      locateFactRegion('12.43 acres', [region()], PAGE),
      locateFactRegion('12.43 acres', [region({ segmentId: 'a' }), region({ segmentId: 'b' })], PAGE),
      locateFactRegion('nothing here', [region()], PAGE),
    ];
    const s = summariseLocations(results);
    expect(s).toContain('1 of 3 fact(s) located');
    expect(s).toContain('deliberately left unlocated');
    expect(s).toContain('1 quote(s) were not found');
  });

  it('says there is nothing to do rather than nothing', () => {
    expect(summariseLocations([])).toBe('No facts to locate.');
  });
});

describe('match normalisation', () => {
  it('collapses punctuation and case', () => {
    expect(normaliseForMatch('12.43  Acres,')).toBe(normaliseForMatch('12 43 ACRES'));
  });
});

describe('ocr_regions is not free space, whatever its name suggests', () => {
  // This nearly went wrong. `research_documents.ocr_regions` has existed since seed 090, is
  // undocumented, and is named exactly like the place vision segments belong. It actually holds
  // {"pageUrls": [...]} — written by artifact-uploader.ts, read by SourceDocumentViewer.tsx and
  // ResearchRunPanel.tsx to render a document's pages.
  //
  // Writing segments there would have blanked the page viewer for every document in the system, and
  // the symptom would have been documents that simply stopped displaying, with nothing pointing back
  // at the seed that did it.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('the uploader still writes pageUrls there', () => {
    expect(read('worker/src/services/artifact-uploader.ts')).toContain('ocr_regions: JSON.stringify({ pageUrls })');
  });

  it('the viewer still reads pageUrls from it', () => {
    expect(read('app/admin/research/components/SourceDocumentViewer.tsx')).toContain('ocr_regions');
  });

  it('the vision segments go in a DIFFERENT column', () => {
    const seed = read('seeds/570_document_ocr_regions.sql');
    expect(seed).toContain('ADD COLUMN IF NOT EXISTS ocr_segments JSONB');
    // And must never add or overwrite the old one.
    expect(seed).not.toMatch(/ADD COLUMN IF NOT EXISTS ocr_regions/);
    expect(seed).not.toMatch(/UPDATE\s+research_documents\s+SET\s+ocr_regions/i);
  });

  it('the misleading column now says what it actually holds', () => {
    // Its undocumentedness is what made it look free.
    const seed = read('seeds/570_document_ocr_regions.sql');
    expect(seed).toContain('COMMENT ON COLUMN research_documents.ocr_regions');
    expect(seed).toContain('DESPITE THE NAME');
  });
});
