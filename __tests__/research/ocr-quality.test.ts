// An unreadable page must say so (research plan R18).
//
// `processDocument()` set `processing_status: 'extracted'` unconditionally. The PDF path's own final
// return carries the comment "could be empty for truly blank PDFs" — and that empty string was
// stored as the document's text, marked extracted, and passed to analysis, which then extracted
// facts from nothing. There was no `unreadable` state anywhere in the pipeline, and `ocr_confidence`
// was written to the row and read by nothing.
//
// The failure is the quiet kind: a scanned 1940s deed that OCR'd to noise does not error. It becomes
// a document with a little garbage text, no facts, and no explanation — and the packet reports the
// property as having no easements rather than as having a deed nobody could read.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MIN_CHARS_PER_PAGE,
  assessOcr,
  isLandRecordType,
  legibleRatio,
  normaliseConfidence,
  statusFor,
} from '@/lib/research/ocr-quality';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** A page's worth of plausible deed text. */
const deedPage = (
  'THENCE North 45 degrees 12 minutes 30 seconds East, a distance of 210.5 feet to a 1/2 inch iron ' +
  'rod set for corner; THENCE South 44 degrees 47 minutes West, 318.20 feet to the POINT OF ' +
  'BEGINNING, containing 2.45 acres of land, more or less, being the same land conveyed by deed ' +
  'recorded in Volume 412, Page 88 of the Deed Records of Bell County, Texas, Instrument No. ' +
  '2019-12345, recorded March 11, 1968, and being subject to a 20 foot utility easement.'
).repeat(2);

describe('the blank page that reported success', () => {
  it('calls an empty extraction unreadable', () => {
    const a = assessOcr({ text: '' });
    expect(a.readability).toBe('unreadable');
    expect(a.reason).toContain('No text was extracted');
    // Actionable: the reviewer needs to know which of the two cases it is.
    expect(a.nextStep).toContain('If it is legible to a person');
  });

  it('measures per PAGE, not in total', () => {
    // A 40-page deed book with 200 total characters is unreadable even though 200 sounds like text.
    const a = assessOcr({ text: 'x'.repeat(200), pageCount: 40 });
    expect(a.readability).toBe('unreadable');
    expect(a.charsPerPage).toBe(5);
  });

  it('assumes one page when the count is missing', () => {
    // Assuming more would inflate the per-page floor and let a bad extraction pass.
    expect(assessOcr({ text: 'x'.repeat(150) }).charsPerPage).toBe(150);
  });

  it('tells the reviewer not to read absence as absence', () => {
    const a = assessOcr({ text: 'x'.repeat(MIN_CHARS_PER_PAGE - 1) });
    expect(a.nextStep).toContain('Do NOT treat the absent content as absent facts');
  });
});

describe('confidence, finally read by something', () => {
  it('accepts both scales providers use', () => {
    // Guessing wrong by a factor of 100 would either fail every page or pass every page.
    expect(normaliseConfidence(0.85)).toBeCloseTo(0.85);
    expect(normaliseConfidence(85)).toBeCloseTo(0.85);
    expect(normaliseConfidence(null)).toBeNull();
  });

  it('fails a page the engine itself did not believe', () => {
    const a = assessOcr({ text: deedPage, confidence: 0.3 });
    expect(a.readability).toBe('unreadable');
    expect(a.reason).toContain('30% confidence');
  });

  it('marks a middling-confidence page partial rather than good', () => {
    const a = assessOcr({ text: deedPage, confidence: 0.7 });
    expect(a.readability).toBe('partial');
    expect(a.nextStep).toContain('Spot-check');
  });

  it('does not penalise a page that reported no confidence at all', () => {
    expect(assessOcr({ text: deedPage }).readability).toBe('good');
  });
});

describe('OCR noise is not text', () => {
  it('rejects symbol soup', () => {
    const a = assessOcr({ text: '▓▒░│┤╡╢╖╕╣║╗╝┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀'.repeat(20) });
    expect(a.readability).toBe('unreadable');
    expect(a.reason).toContain('OCR noise, not text');
  });

  it('does not mistake surveying notation for noise', () => {
    // Bearings are full of degree, prime and double-prime marks.
    expect(legibleRatio('N 45°12\'30" E, 210.5\' to a 1/2" iron rod')).toBeGreaterThan(0.9);
  });
});

describe('the digit test — the case the generic signals miss', () => {
  // OCR that returns plausible-looking prose from an illegible scan passes every length and
  // confidence check. Deeds and plats are dense with numbers; their total absence is the tell.
  const wordyNoNumbers =
    ('THENCE along the fence line to a corner, thence with the meanders of the creek to a stake ' +
     'for corner, being part of the survey abstract, subject to easements of record and to all ' +
     'restrictions affecting the property described in the deed of conveyance aforementioned. ').repeat(3);

  it('flags a land record with no digits at all', () => {
    const a = assessOcr({ text: wordyNoNumbers, method: 'pdf-ocr-vision', isLandRecord: true });
    expect(a.readability).toBe('unreadable');
    expect(a.reason).toContain('no digits at all');
    expect(a.nextStep).toContain('every measurement on the page is missing');
  });

  it('does not apply the test to a text-layer PDF', () => {
    // A born-digital cover letter legitimately has no numbers.
    const a = assessOcr({ text: wordyNoNumbers, method: 'pdf-parse', isLandRecord: true });
    expect(a.readability).not.toBe('unreadable');
  });

  it('does not apply the test to a search-page screenshot', () => {
    const a = assessOcr({ text: wordyNoNumbers, method: 'pdf-ocr-vision', isLandRecord: false });
    expect(a.readability).not.toBe('unreadable');
  });

  it('passes a real deed page', () => {
    expect(assessOcr({ text: deedPage, method: 'pdf-ocr-vision', isLandRecord: true }).readability).toBe('good');
  });

  it('knows which document types are land records', () => {
    expect(isLandRecordType('deed')).toBe(true);
    expect(isLandRecordType('subdivision_plat')).toBe(true);
    expect(isLandRecordType('aerial_photo')).toBe(false);
    expect(isLandRecordType(null)).toBe(false);
  });
});

describe('partial is a real state, not a rounding of good', () => {
  it('says facts from a thin page are incomplete rather than absent', () => {
    const a = assessOcr({ text: 'Instrument No. 2019-12345 recorded March 11, 1968. '.repeat(4) });
    expect(a.readability).toBe('partial');
    expect(a.nextStep).toContain('incomplete rather than complete');
  });
});

describe('unreadable is not an error', () => {
  it('maps to its own status', () => {
    // `error` is the retry bucket. An unreadable scan fails identically on every retry, forever.
    expect(statusFor(assessOcr({ text: '' }))).toBe('unreadable');
    expect(statusFor(assessOcr({ text: deedPage }))).toBe('extracted');
  });

  it('is a status the database accepts and can be found by', () => {
    const seed = read('seeds/532_document_unreadable_status.sql');
    expect(seed).toContain("'unreadable'");
    expect(seed).toMatch(/CREATE INDEX[\s\S]*WHERE processing_status = 'unreadable'/);
    // The reason is stored so a wrong verdict can be diagnosed without re-running the OCR.
    expect(seed).toContain('readability_signals');
  });

  it('stops the pipeline instead of analysing noise', () => {
    const svc = read('lib/research/document.service.ts');
    expect(svc).toContain('assessOcr({');
    expect(svc).toContain("statusFor(assessment)");
    // Classifying and analysing noise produces confident nonsense.
    expect(svc).toMatch(/readability === 'unreadable'[\s\S]{0,400}return;/);
  });

  it('no longer writes "extracted" unconditionally', () => {
    const svc = read('lib/research/document.service.ts');
    expect(svc).not.toContain("processing_status: 'extracted',");
  });

  it('is visible on the document card', () => {
    // Without a badge an unreadable document renders identically to one still waiting to be
    // processed — which is how "we could not read this deed" stayed invisible.
    const card = read('app/admin/research/[projectId]/ReviewDocCard.tsx');
    expect(card).toContain("processing_status === 'unreadable'");
    expect(card).toContain('readability_reason');
  });

  it('does not colour "thin text" like an error', () => {
    // The document is usable; facts from it are incomplete rather than absent.
    const card = read('app/admin/research/[projectId]/ReviewDocCard.tsx');
    expect(card).toContain('review-doc-card__badge--warn');
    expect(read('app/admin/styles/AdminResearch.css')).toContain('.review-doc-card__badge--warn');
  });
});
