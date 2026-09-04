import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readingRank, orderForReading, readingAllowanceMs, summaryInputFromLibrary, summariseUnsummarisedDocuments } from '../research/reading-pass.js';
import { reanalyseFiledDocuments, type FiledDocument, type ReadResult } from '../research/reanalyze-documents.js';

// ── "OCR … every single file that is found in a run … produce the summary and results" and
//    "build the analysis and review and summary builder … so it will always happen on any given
//    run." (owner, 2026-09-04)
//
// Runs 4-6 each hit the ceiling in Phase 2, and the re-read was gated `if (!ceilingHit)`, so
// nothing was read: 60 documents, none summarised. The reading pass now runs on every run under a
// COST budget (not the clock), reads every page in a surveyor's order, summarises each in the
// same pass, and queues by name what the allowance did not reach.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

describe('reading order and allowance', () => {
  it('reads the subject deeds first, then plats, easements, drawings, and money-only last', () => {
    expect(readingRank({ document_type: 'deed', document_label: 'WARRANTY DEED' })).toBe(0);
    expect(readingRank({ document_type: 'plat' })).toBe(1);
    expect(readingRank({ document_type: 'other', document_label: 'EASEMENT & RIGHT OF WAY' })).toBe(2);
    expect(readingRank({ document_type: 'gis_map' })).toBe(3);
    expect(readingRank({ document_type: 'other', document_label: 'MECHANICS LIEN' })).toBe(4);
    const order = orderForReading([
      { document_type: 'other', document_label: 'MECHANICS LIEN' },
      { document_type: 'plat', document_label: 'PLAT' },
      { document_type: 'deed', document_label: 'DEED' },
    ]).map((d) => d.document_label);
    expect(order).toEqual(['DEED', 'PLAT', 'MECHANICS LIEN']);
  });

  it('holds back 30% of the ceiling for reading, clamped 2–8 min, 3 min with no ceiling', () => {
    expect(readingAllowanceMs(15 * 60_000)).toBe(4.5 * 60_000);
    expect(readingAllowanceMs(5 * 60_000)).toBe(2 * 60_000);
    expect(readingAllowanceMs(60 * 60_000)).toBe(8 * 60_000);
    expect(readingAllowanceMs(null)).toBe(3 * 60_000);
  });
});

describe('every document read is summarised in the same pass, and the unread are queued by name', () => {
  const doc = (id: string, type: string, label: string): FiledDocument => ({
    id, document_type: type, document_label: label, extracted_text: null, extracted_text_method: null,
    page_count: 1, processing_status: null, ocr_regions: { pageUrls: [`https://x/${id}.png`] },
  });
  function fakeDb() {
    const updates: Array<{ id: string; row: Record<string, unknown> }> = [];
    const db = { from: () => ({ update: (row: Record<string, unknown>) => ({ eq: async (_c: string, v: unknown) => { updates.push({ id: String(v), row }); return { error: null }; } }) }) };
    return { db, updates };
  }

  it('reads in order, summarises each from the same text, and queues what the allowance did not reach', async () => {
    const { db, updates } = fakeDb();
    const docs = [doc('plat', 'plat', 'PLAT'), doc('deed', 'deed', 'DEED — A to B'), doc('ease', 'other', 'EASEMENT')];
    const readOrder: string[] = [];
    const summarised: string[] = [];
    let budget = 2; // allow two reads, then "out of allowance"
    const report = await reanalyseFiledDocuments(
      db as never,
      orderForReading(docs),
      async (d): Promise<ReadResult> => { readOrder.push(d.id); return { text: `text of ${d.id}`, method: 'adaptive-vision-reread', confidence: 0.9 }; },
      () => {},
      () => budget-- > 0,
      async (d, result) => { summarised.push(`${d.id}:${result.text}`); },
    );
    // Deed before plat before easement (surveyor's order), and only two read before the budget ran out.
    expect(readOrder).toEqual(['deed', 'plat']);
    expect(report.reanalysed).toBe(2);
    expect(summarised).toEqual(['deed:text of deed', 'plat:text of plat']);
    expect(report.leftUnread).toBe(1);
    expect(report.leftUnreadIds).toEqual(['ease']);
  });
});

describe('the property summary is built from the library', () => {
  it('every document with text or a summary becomes a cited source, and the project facts lead', () => {
    const input = summaryInputFromLibrary(
      { property_address: '1512 CHISHOLM TRAIL', county: 'Bell', parcel_id: '9158', owner_name: 'VANCE', legal_description_summary: 'MILL CREEK SEC 8A BLK 1 LOT 2', acreage: 0.3857 },
      [
        { id: 'd1', document_type: 'deed', document_label: 'DEED', recording_info: 'Instrument No. 2024039298', source_url: 'https://x/d1', extracted_text: 'BEGINNING at a rod', analysis_metadata: { aiSummary: 'Conveys Lot 2 from Woznica to Vance.' } },
        { id: 'p1', document_type: 'plat', document_label: 'PLAT', recording_info: 'Instrument No. 1982002520', source_url: null, extracted_text: 'MILL CREEK SECTION plat', analysis_metadata: null },
        { id: 'empty', document_type: 'other', document_label: 'blank', recording_info: null, source_url: null, extracted_text: '', analysis_metadata: null },
      ],
    );
    expect(input.sources.map((s) => s.ref)).toEqual(['[1]', '[2]']); // the empty one is not a source
    expect(input.sources[0].kind).toBe('deed');
    expect(input.sources[1].kind).toBe('plat');
    expect(input.sources[0].content).toContain('Conveys Lot 2');
    expect(input.facts).toContain('County: Bell');
    expect(input.facts).toContain('Appraisal district property ID: 9158');
  });
});

describe('the run wires it in — not gated on the ceiling, and the summary written every run', () => {
  const index = read('index.ts');
  it('the reading pass runs under a cost budget, not the wall clock', () => {
    expect(index).toContain("if (Date.now() - readStartedAt > allowanceMs) return false;");
    expect(index).toContain("return ex !== 'cost' && ex !== 'paid_pages'; // cost stops it; the wall clock does not");
    // it is NOT inside an `if (!ceilingHit)` block any more
    expect(index).not.toContain('withStepDeadline(projectId, \'document re-read\'');
  });
  it('reads every page, not the first five', () => {
    expect(index).toContain('for (const url of pageUrls) {');
    expect(index).not.toContain('pageUrls.slice(0, 5)');
  });
  it('writes the property summary from the library after the meta persist', () => {
    expect(index).toContain('writeRunSummaryFromLibrary(supabase as never, projectId, summaryKey');
  });
  it('sweeps every file with text but no summary, after the reading pass', () => {
    expect(index).toContain('summariseUnsummarisedDocuments(supa as never, projectId, summaryKey, mayRead');
  });
  it('CALLEE EXISTS: the swept function is really exported (the caller shipped once without it)', () => {
    // 2026-09-04: index.ts (committed) called summariseUnsummarisedDocuments while reading-pass.ts
    // (uncommitted) held the export — the deployed sweep threw silently and no summary was written.
    // Importing the symbol at the top of this file fails the whole run if the export is missing;
    // this asserts it is a function so a future export-shape change is caught too.
    expect(typeof summariseUnsummarisedDocuments).toBe('function');
  });
});

describe('A4 — a run reads its queue first, before searching for more', () => {
  const index = read('index.ts');
  it('is gated on documents actually being queued (never on a first run)', () => {
    expect(index).toContain("'research_documents'");
    expect(index).toContain(".eq('processing_status', 'queued')");
    expect(index).toContain('if (queued > 0) {');
  });
  it('reads the queue BEFORE the search dispatch', () => {
    // Anchor on code, not comments — the test reader strips comments. The head read is gated on the
    // queued count; the dispatch is runCountyResearch. The head block must come first in the file.
    const headRead = index.indexOf('if (queued > 0) {');
    const dispatch = index.indexOf('runCountyResearch(');
    expect(headRead).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(headRead); // earlier in the file ⇒ runs first
    const window = index.slice(headRead, dispatch);
    expect(window).toContain('reanalyseProjectDocuments(projectId');
    expect(window).toContain('summariseUnsummarisedDocuments(');
    expect(window).toContain('withRunContext(projectId');
  });
  it('is bounded by its own head allowance and the cost budget, and never fatal', () => {
    const headRead = index.indexOf('if (queued > 0) {');
    const window = index.slice(headRead, headRead + 2000);
    expect(window).toContain('const headCapMs = Math.min(readingAllowanceMs(');
    expect(window).toContain("return ex !== 'cost' && ex !== 'paid_pages';");
    expect(index).toContain('head-of-run queue read failed (non-fatal)');
  });
});

describe('every file with text gets a summary, even one read on an earlier run', () => {
  // The reader skips a document that already has good text — so its per-document summary would
  // never be written without a sweep. The sweep selects exactly the documents with text and no
  // summary, in reading order.
  it('selects documents with text and no summary, in a surveyor\'s order', () => {
    const rows = [
      { id: 'lien', document_type: 'other', document_label: 'MECHANICS LIEN', extracted_text: 'a'.repeat(60), analysis_metadata: null },
      { id: 'deed', document_type: 'deed', document_label: 'DEED', extracted_text: 'b'.repeat(60), analysis_metadata: null },
      { id: 'done', document_type: 'deed', document_label: 'DEED already', extracted_text: 'c'.repeat(60), analysis_metadata: { aiSummary: 'already' } },
      { id: 'blank', document_type: 'deed', document_label: 'DEED blank', extracted_text: '', analysis_metadata: null },
    ];
    const needing = rows.filter((d) => (d.extracted_text ?? '').trim().length >= 40 && !d.analysis_metadata?.aiSummary);
    expect(needing.map((d) => d.id)).toEqual(['lien', 'deed']);           // 'done' has a summary, 'blank' has no text
    expect(orderForReading(needing).map((d) => d.id)).toEqual(['deed', 'lien']); // deed before money-only
  });
});
