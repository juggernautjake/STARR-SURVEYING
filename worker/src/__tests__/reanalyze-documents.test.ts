import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  decideReanalysis, pageUrlsOf, reanalyseFiledDocuments, describeReanalysis,
  type FiledDocument,
} from '../research/reanalyze-documents.js';

// ── D6 — EVERY DOCUMENT ON FILE, NOT EVERY DOCUMENT A STAGE TOUCHED ─────────────────────────────
//
// Measured against the live database on 2026-09-03, over 697 filed documents:
//
//    87 with NO extracted text at all — 50 deeds, 26 plats, 9 untyped, 2 easements
//   295 with text and a NULL `extracted_text_method`
//   663 with a NULL `readability`
//
// Every one of the 87 has its page images in storage. They were found, fetched, paid for where the
// county charged, uploaded — and never read, because analysis happened where a STAGE touched a
// document rather than to every document that got filed.

const doc = (over: Partial<FiledDocument> = {}): FiledDocument => ({
  id: 'd1',
  document_type: 'deed',
  document_label: 'WARRANTY DEED — Smith to Jones',
  extracted_text: null,
  extracted_text_method: null,
  page_count: 3,
  processing_status: 'analyzed',
  ocr_regions: JSON.stringify({ pageUrls: ['https://x/1.png', 'https://x/2.png', 'https://x/3.png'] }),
  ...over,
});

/** Text dense enough to pass the extraction floor on a three-page land record. */
const GOOD_TEXT = Array.from({ length: 40 }, (_, i) =>
  `N ${10 + (i % 70)}°15'30" E 152.${i}0 feet to a 1/2" iron rod set for corner, LOT ${i + 1}`,
).join('\n');

describe('finding the page images', () => {
  it('reads them out of ocr_regions, which despite its name is where they live', () => {
    expect(pageUrlsOf(doc())).toHaveLength(3);
  });

  it('accepts the column as an object as well as a string', () => {
    expect(pageUrlsOf(doc({ ocr_regions: { pageUrls: ['a'] } }))).toEqual(['a']);
  });

  it('a malformed column is no pages, not a crash', () => {
    expect(pageUrlsOf(doc({ ocr_regions: 'not json' }))).toEqual([]);
    expect(pageUrlsOf(doc({ ocr_regions: null }))).toEqual([]);
    expect(pageUrlsOf(doc({ ocr_regions: { pageUrls: [1, null] } }))).toEqual([]);
  });
});

describe('which documents are worth reading again', () => {
  it('THE 87: pages on file and no text — read it', () => {
    const d = decideReanalysis(doc());
    expect(d.reanalyse).toBe(true);
    expect(d.reason).toContain('already bought and stored');
  });

  it('THE 295: text with no stated origin — read it, to give it one', () => {
    const d = decideReanalysis(doc({ extracted_text: GOOD_TEXT, extracted_text_method: null }));
    expect(d.reanalyse).toBe(true);
    expect(d.reason).toContain('no stated origin');
  });

  it('CONTROL: text WITH a method is left alone', () => {
    // Without this, "read the ones with no method" could pass because everything is re-read, and
    // the pass would spend money on all 697 documents every run.
    const d = decideReanalysis(doc({ extracted_text: GOOD_TEXT, extracted_text_method: 'adaptive-vision' }));
    expect(d.reanalyse).toBe(false);
    expect(d.reason).toContain('Re-reading would spend money to learn what we know');
  });

  it('no pages is a retrieval gap, and says so rather than being re-read forever', () => {
    const d = decideReanalysis(doc({ ocr_regions: null }));
    expect(d.reanalyse).toBe(false);
    expect(d.reason).toContain('gap in retrieval');
    expect(d.reason).toContain('cannot fix it');
  });

  it('a thin extraction is worth a quadrant pass', () => {
    const d = decideReanalysis(doc({ extracted_text: 'Deed. 2 acres.', extracted_text_method: 'pdf-parse' }));
    expect(d.reanalyse).toBe(true);
  });
});

describe('writing the answer back', () => {
  const dbThatAccepts = () => {
    const update = vi.fn((row: Record<string, unknown>) => ({ eq: async () => ({ error: null }) }));
    return { db: { from: () => ({ update }) } as never, update };
  };

  it('records the text AND the method — the pair patchDocument refuses to split', () => {
    const { db, update } = dbThatAccepts();
    return reanalyseFiledDocuments(db, [doc()], async () => ({
      text: GOOD_TEXT, method: 'adaptive-vision-reread', confidence: 82,
    })).then((r) => {
      expect(r.reanalysed).toBe(1);
      const row = update.mock.calls[0]![0] as Record<string, unknown>;
      expect(row.extracted_text_method).toBe('adaptive-vision-reread');
      expect(row.extracted_text).toContain('iron rod');
      // 82 arrives on the 0–100 scale and is stored on the 0–1 one — see confidence-scale.ts.
      expect(row.ocr_confidence).toBeCloseTo(0.82);
      expect(row.readability).toBe('good');
    });
  });

  it('a read that produces nothing is OUR failure, and says so', async () => {
    const { db } = dbThatAccepts();
    const r = await reanalyseFiledDocuments(db, [doc()], async () => null);
    expect(r.failed).toBe(1);
    expect(r.reanalysed).toBe(0);
    expect(r.lines.join(' ')).toContain('not a finding about the document');
  });

  it('a read that throws is caught — a re-read must not lose a finished run', async () => {
    const { db } = dbThatAccepts();
    const r = await reanalyseFiledDocuments(db, [doc()], async () => { throw new Error('timeout'); });
    expect(r.failed).toBe(1);
    expect(r.lines.join(' ')).toContain('timeout');
  });

  it('a write that fails is counted, not silently dropped', async () => {
    const update = vi.fn(() => ({ eq: async () => ({ error: { message: '42703 no such column' } }) }));
    const db = { from: () => ({ update }) } as never;
    const r = await reanalyseFiledDocuments(db, [doc()], async () => ({ text: GOOD_TEXT, method: 'm' }));
    expect(r.failed).toBe(1);
    expect(r.lines.join(' ')).toContain('could not record them');
  });

  it('the summary states what was SKIPPED as well as what was done', () => {
    // A pass that reports only its successes reads like a pass that had nothing to skip.
    const line = describeReanalysis({ considered: 10, reanalysed: 3, skipped: 6, failed: 1, leftUnread: 0, leftUnreadIds: [], lines: [] });
    expect(line).toContain('3 document(s) read');
    expect(line).toContain('6 already had text we can weigh');
    // And a ceiling reached mid-pass is its own sentence, not folded into failures.
    expect(describeReanalysis({ considered: 4, reanalysed: 2, skipped: 0, failed: 0, leftUnread: 2, leftUnreadIds: [], lines: [] }))
      .toContain('2 left unread because the run reached its ceiling');
    expect(line).toContain('the pages are still on file');
  });
});

describe('the run calls it — assert the CALLER', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  const code = src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: the probe is reading index.ts', () => {
    expect(code).toContain('endFiling(projectId)');
  });

  it('the pass runs before the run reports', () => {
    // Since 2026-09-03 the call sits inside `withRunContext(... withStepDeadline(...))`, so the
    // `await` is on the wrapper; the probe looks for the call itself.
    const at = code.indexOf('reanalyseProjectDocuments(projectId, (line)');
    const filing = code.indexOf('const filing = endFiling(projectId)');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(filing);
  });

  it('it reads with the same quadrant pass the run itself uses', () => {
    // A document re-read here must be read exactly as well as one read the first time.
    expect(code).toContain('adaptiveVisionOcr');
    expect(code).toContain("method: 'adaptive-vision-reread'");
  });

  it('a failed listing is not reported as a clean pass', () => {
    expect(src).toContain("Could not list this project's documents, so none were re-read");
  });

  it('reads EVERY page — the cost budget bounds a long document, not a fixed cap (2026-09-04)', () => {
    // The owner asked that the tiled reader see each page of each document. The five-page cap is
    // gone; the between-pages budget check is what stops a forty-page instrument.
    expect(code).toContain('for (const url of pageUrls) {');
    expect(code).not.toContain('pageUrls.slice(0, 5)');
    expect(code).toContain('if (!mayContinue()) break;');
  });
});
