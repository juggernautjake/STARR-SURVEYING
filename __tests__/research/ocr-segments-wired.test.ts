// The producer end of R17: measured tile geometry, and the column it must not be written to.
//
// `fact-regions.ts` can locate a fact only if something records where each OCR tile actually was.
// Two tiling loops in `document.service.ts` compute exactly that with `sharp().extract()` — and
// both threw it away, while collecting `data.regions`: coordinates the OCR model invented, which
// nothing validated and nothing read.
//
// Model-invented pixel coordinates are worse than none. They look authoritative, and they would
// scroll a reviewer confidently to the wrong part of a plat.
//
// These are source-level assertions rather than behavioural ones: driving the real path needs
// Supabase, Claude Vision and sharp on a real image. What they pin is the set of decisions that are
// easy to undo by accident — which column is written, which is not, and that the geometry recorded
// is the measured one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const documentService = read('lib/research/document.service.ts');
const analysisService = read('lib/research/analysis.service.ts');

describe('the tile geometry is measured, not asked of the model', () => {
  it('records the same left/top/width/height it passed to sharp', () => {
    // If these ever diverge, the box points somewhere the OCR never looked.
    expect(documentService).toContain('boundingBox: { x: left, y: top, w: width, h: height }');
  });

  it('pairs each tile box with the text read from that tile', () => {
    // A box without its text cannot be matched to a quote; text without its box cannot be located.
    expect(documentService).toMatch(/boundingBox: \{ x: left[^}]*\},\s*\n\s*text: parsed\.text\.trim\(\)/);
  });

  it('records the page size the boxes were measured against', () => {
    // Pixels divided by the wrong page's dimensions land confidently in the wrong place.
    expect(documentService).toContain('pageSize: { width: imgW, height: imgH }');
    expect(documentService).toContain('pdfPageSize');
  });

  it('refuses to mix pages of different sizes under one pageSize', () => {
    expect(documentService).toContain('pdfPageSize.width === imgW && pdfPageSize.height === imgH');
  });

  it('emits nothing rather than an empty region set', () => {
    // An empty `{pageSize, regions: []}` would read as "this document has no regions" — a finding —
    // where the truth is that none were recorded.
    expect(documentService).toContain('measured.length ? { pageSize:');
    expect(documentService).toContain('pdfPageSize && measuredPdf.length ?');
  });
});

describe('ocr_regions must not be written by the document pipeline', () => {
  it('no longer writes extraction.ocrRegions into ocr_regions', () => {
    // It used to. Every processed document either overwrote the page viewer's URLs with the model's
    // invented coordinates or — far more often, the field being usually absent — wrote NULL and
    // wiped them. The symptom is a document that stops showing its pages, pointing nowhere near the
    // line that caused it.
    expect(documentService).not.toMatch(/ocr_regions:\s*extraction\.ocrRegions/);
    expect(documentService).not.toMatch(/ocr_regions:\s*extraction\.ocrSegments/);
  });

  it('writes the measured segments to ocr_segments instead', () => {
    expect(documentService).toContain('ocr_segments: extraction.ocrSegments ?? null');
  });

  it('leaves a note saying why ocr_regions is skipped', () => {
    // The name invites exactly this mistake, so the reason has to sit at the point of temptation.
    expect(documentService).toContain('DELIBERATELY NOT WRITTEN HERE');
  });

  it('the uploader is still the only writer of ocr_regions', () => {
    const uploader = read('worker/src/services/artifact-uploader.ts');
    expect(uploader).toContain('ocr_regions: JSON.stringify({ pageUrls })');
  });
});

describe('the consumer end is wired', () => {
  it('source_bounding_box is no longer a hardcoded null', () => {
    // It was a literal `null` since seed 090 — the column had never held a value.
    expect(analysisService).not.toMatch(/source_bounding_box:\s*null,/);
    expect(analysisService).toContain('source_bounding_box: location.region?.box ?? null');
  });

  it('locates each fact against the document\'s own segments', () => {
    expect(analysisService).toContain('locateFactRegion(dp.source_text_excerpt, regions, pageSize)');
  });

  it('reports how many facts could NOT be placed', () => {
    expect(analysisService).toContain('summariseLocations(located)');
  });

  it('does not invent a page number when no region was found', () => {
    // `source_page` falls back to the region's page only when there IS a region.
    expect(analysisService).toContain('dp.source_page || location.region?.page || null');
  });
});
