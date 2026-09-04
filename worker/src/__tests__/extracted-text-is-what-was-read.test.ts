import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FINE_TEXT_HEIGHT_IN, MIN_FINE_TEXT_PX, API_MAX_PIXELS } from '../services/ocr-legibility.js';
import { analyzeImageDimensions, selectOptimalGrid } from '../services/adaptive-vision.js';

// ── "THE AI ANALYSIS SYSTEM SEEMS TO THINK THE DOCUMENTS ARE UNREADABLE" ────────────────────────
//
// `extracted_text` on a filed Bell deed was `deed.aiSummary ?? deed.legalDescription ?? null`.
//
// A summary is a CONCLUSION, not an extraction. When the AI stage was skipped or failed — and the
// 2026-09-03 log says plainly "No master report text — Stage 5/6 may have been skipped or failed" —
// the column went in NULL, `assessArtifact` read that as "No text was extracted from this document
// at all", and the document was stamped unreadable.
//
// Measured against the live database: all 16 deeds from that run had `extracted_text` NULL and
// `extracted_text_method` NULL, with their page images stored correctly at 2550×3300.
//
// So a fact about our pipeline was rendered on screen as a fact about the paper.

const ROOT = path.join(__dirname, '..');
const code = (p: string): string => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!/\b(import|export|const|function|interface)\b/.test(s)) throw new Error(`stripping destroyed ${p}`);
  return s;
};

describe('what was read and what was concluded are different fields', () => {
  it('CONTROL: the probe is reading index.ts', () => {
    expect(code('index.ts')).toContain('const deedText =');
  });

  it('THE DEFECT: extracted_text is no longer the AI summary', () => {
    expect(code('index.ts')).not.toContain('deed.aiSummary ?? deed.legalDescription');
  });

  it('it is the text actually read off the pages', () => {
    const s = code('index.ts');
    expect(s).toContain('const deedText = deed.ocrText ?? deed.legalDescription ?? null;');
    // `legalDescription` survives as a last resort — it is at least text off the record — but it
    // is no longer allowed to masquerade as an OCR read.
    expect(s).toContain("'cad-legal-description'");
  });

  it('the analyzer produces that text whether or not the summary pass runs', () => {
    // The whole point: a skipped conclusion must not read as an unreadable document.
    const s = code('counties/bell/analyzers/deed-analyzer.ts');
    expect(s).toContain('const ocrText = allRegionResults.map(');
    expect(s).toContain('ocrText: ocrText || null');
    expect(s).toContain("ocrTextMethod: ocrText ? 'bell-deed-regions' : null");
  });

  it('the summary is stored where it cannot be mistaken for a read', () => {
    expect(code('index.ts')).toContain('aiSummary: deed.aiSummary ?? null');
    expect(code('services/artifact-uploader.ts'))
      .toContain('analysis_metadata: firstPage.aiSummary ? { aiSummary: firstPage.aiSummary } : null');
  });

  it('the method travels with the text, at BOTH insert sites', () => {
    // A populated extracted_text beside a NULL extracted_text_method is a row nobody can audit —
    // is that OCR, a PDF text layer, or a summary wearing the wrong hat? Every Bell deed was that
    // row. `patchDocument` already refuses the combination; the inserts now supply it.
    const s = code('services/artifact-uploader.ts');
    expect(s.split('extracted_text_method: firstPage.extractedTextMethod').length - 1).toBe(2);
  });

  it('the per-segment findings are stored, so a fact can be traced to a quadrant', () => {
    // plan D2. `ocr_segments` has existed as a column since seed 570 and nothing wrote it here.
    const s = code('services/artifact-uploader.ts');
    // Since E4 (ace0f38a9) both inserts write EVERY page's segments (mergePageSegments), not just
    // the first page's.
    expect(s.split('ocr_segments: mergePageSegments(').length - 1).toBe(2);
    expect(code('counties/bell/analyzers/deed-analyzer.ts')).toContain('ocrSegments: segments.length > 0');
  });
});

describe('one set of numbers for how tall readable text is', () => {
  it('adaptive-vision takes them from ocr-legibility rather than declaring its own', () => {
    const s = code('services/adaptive-vision.ts');
    expect(s).toContain("from './ocr-legibility.js'");
    // Two copies that happened to agree is not the same as one copy.
    expect(s).not.toMatch(/const\s+MIN_FINE_TEXT_PX\s*=/);
    expect(s).not.toMatch(/const\s+FINE_TEXT_HEIGHT_IN\s*=/);
  });

  it('and the values are the ones the legibility rater uses', () => {
    expect(MIN_FINE_TEXT_PX).toBe(13);
    expect(FINE_TEXT_HEIGHT_IN).toBeCloseTo(0.07);
    expect(API_MAX_PIXELS).toBe(8_000);
    // The grid selector's own arithmetic still lands where it should with the shared numbers.
    const g = selectOptimalGrid(analyzeImageDimensions(2550, 3300));
    expect(g.fineTextPx).toBeCloseTo(300 * FINE_TEXT_HEIGHT_IN, 5);
    expect(g.fineTextPx).toBeGreaterThanOrEqual(MIN_FINE_TEXT_PX);
  });
});
