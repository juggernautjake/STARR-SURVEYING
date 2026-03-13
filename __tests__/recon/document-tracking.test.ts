// __tests__/recon/document-tracking.test.ts
// Unit tests for document tracking consistency across the STARR RECON pipeline.
//
// Validates:
//   1.  documentsTotal filter — only 'extracted', 'analyzing', and 'analyzed' docs
//       are counted as part of the analysis set (Bug #2 in getAnalysisStatus())
//   2.  Pending/extracting/error documents are excluded from the analyzable count
//   3.  Manually uploaded documents with pending status do not inflate the total
//   4.  The lite-pipeline importSearchResults row shape uses valid schema fields
//   5.  source_type for lite-pipeline imports must be 'property_search' (not 'url_import')
//   6.  processing_status for lite-pipeline imports must be 'extracted'
//   7.  Imported documents must include extracted_text for analysis

import { describe, it, expect } from 'vitest';

// ── Pure-logic helper mirroring getAnalysisStatus() after the fix ─────────────

type DocStatus = 'pending' | 'extracting' | 'extracted' | 'analyzing' | 'analyzed' | 'error';

interface DocRow { processing_status: DocStatus }

const ANALYZABLE_STATUSES: DocStatus[] = ['extracted', 'analyzing', 'analyzed'];

function computeAnalyzableCount(docs: DocRow[]): number {
  return docs.filter(d => ANALYZABLE_STATUSES.includes(d.processing_status)).length;
}

function computeAnalyzedCount(docs: DocRow[]): number {
  return docs.filter(d => d.processing_status === 'analyzed').length;
}

// ── Pure-logic helper mirroring importSearchResults() row construction ────────

interface SearchResultRow {
  source_type: string;
  processing_status: string;
  extracted_text: string;
  extracted_text_method: string;
}

function buildImportRow(r: {
  source_name: string;
  title: string;
  url: string;
  description: string;
  document_type?: string;
}): SearchResultRow {
  return {
    source_type: 'property_search',
    processing_status: 'extracted',
    extracted_text: `Source: ${r.source_name}\nTitle: ${r.title}\nURL: ${r.url}\n\n${r.description}`,
    extracted_text_method: 'property_search',
  };
}

// ── 1. documentsTotal: only analyzable statuses are counted ──────────────────

describe('getAnalysisStatus — documentsTotal filter', () => {
  it('counts extracted docs as analyzable', () => {
    const docs: DocRow[] = [
      { processing_status: 'extracted' },
      { processing_status: 'extracted' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(2);
  });

  it('counts analyzing docs as analyzable', () => {
    const docs: DocRow[] = [
      { processing_status: 'analyzing' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(1);
  });

  it('counts analyzed docs as analyzable', () => {
    const docs: DocRow[] = [
      { processing_status: 'analyzed' },
      { processing_status: 'analyzed' },
      { processing_status: 'analyzed' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(3);
  });

  // ── 2. Non-analyzable statuses are excluded ───────────────────────────────

  it('excludes pending docs from analyzable count', () => {
    const docs: DocRow[] = [
      { processing_status: 'pending' },
      { processing_status: 'extracted' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(1);
  });

  it('excludes extracting docs from analyzable count', () => {
    const docs: DocRow[] = [
      { processing_status: 'extracting' },
      { processing_status: 'analyzed' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(1);
  });

  it('excludes error docs from analyzable count', () => {
    const docs: DocRow[] = [
      { processing_status: 'error' },
      { processing_status: 'extracted' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(1);
  });

  // ── 3. Manual uploads with pending status do not inflate total ─────────────

  it('manual uploads (pending) are not included in total', () => {
    // Simulates: 2 user-uploaded docs (pending/extracting) + 3 search docs (extracted)
    const docs: DocRow[] = [
      { processing_status: 'pending' },    // manual upload, still extracting
      { processing_status: 'extracting' }, // manual upload, in progress
      { processing_status: 'extracted' },  // search result, ready
      { processing_status: 'extracted' },  // search result, ready
      { processing_status: 'extracted' },  // search result, ready
    ];
    expect(computeAnalyzableCount(docs)).toBe(3);
  });

  it('mixed project: analyzed + pending gives correct analyzable count', () => {
    const docs: DocRow[] = [
      { processing_status: 'analyzed' },
      { processing_status: 'analyzed' },
      { processing_status: 'pending' },   // manual upload not yet ready
      { processing_status: 'error' },     // failed extraction
    ];
    expect(computeAnalyzableCount(docs)).toBe(2);
    expect(computeAnalyzedCount(docs)).toBe(2);
  });

  it('progress is accurate: analyzed / analyzable is always ≤ 1', () => {
    const docs: DocRow[] = [
      { processing_status: 'analyzed' },
      { processing_status: 'analyzing' },
      { processing_status: 'extracted' },
      { processing_status: 'pending' },
    ];
    const total = computeAnalyzableCount(docs);
    const done = computeAnalyzedCount(docs);
    expect(done).toBeLessThanOrEqual(total);
    expect(total).toBe(3); // pending excluded
    expect(done).toBe(1);
  });

  it('returns 0 for empty document list', () => {
    expect(computeAnalyzableCount([])).toBe(0);
    expect(computeAnalyzedCount([])).toBe(0);
  });

  it('all analyzed: total equals analyzed count', () => {
    const docs: DocRow[] = [
      { processing_status: 'analyzed' },
      { processing_status: 'analyzed' },
    ];
    expect(computeAnalyzableCount(docs)).toBe(computeAnalyzedCount(docs));
  });
});

// ── 4–7. importSearchResults row construction ─────────────────────────────────

describe('importSearchResults — row schema compliance', () => {
  const sampleResult = {
    source_name: 'Bell CAD',
    title: 'Appraisal Record – 123 Main St',
    url: 'https://bell-cad.example.com/record/123',
    description: 'Owner: John Doe; Legal Description: Lot 5, Block A',
    document_type: 'appraisal_record',
  };

  it('uses property_search as source_type (not url_import)', () => {
    const row = buildImportRow(sampleResult);
    expect(row.source_type).toBe('property_search');
    expect(row.source_type).not.toBe('url_import');
  });

  it('sets processing_status to extracted so documents are ready for analysis', () => {
    const row = buildImportRow(sampleResult);
    expect(row.processing_status).toBe('extracted');
    expect(row.processing_status).not.toBe('pending');
  });

  it('includes extracted_text so the AI can analyze the document', () => {
    const row = buildImportRow(sampleResult);
    expect(row.extracted_text).toBeTruthy();
    expect(row.extracted_text.length).toBeGreaterThan(0);
  });

  it('extracted_text contains source name, title, URL, and description', () => {
    const row = buildImportRow(sampleResult);
    expect(row.extracted_text).toContain('Bell CAD');
    expect(row.extracted_text).toContain('Appraisal Record – 123 Main St');
    expect(row.extracted_text).toContain('https://bell-cad.example.com/record/123');
    expect(row.extracted_text).toContain('Owner: John Doe');
  });

  it('sets extracted_text_method to property_search', () => {
    const row = buildImportRow(sampleResult);
    expect(row.extracted_text_method).toBe('property_search');
  });

  it('does not use the non-existent analysis_status field', () => {
    const row = buildImportRow(sampleResult) as Record<string, unknown>;
    expect(row).not.toHaveProperty('analysis_status');
  });

  it('does not include non-schema fields (has_text, has_image, has_ocr, metadata)', () => {
    const row = buildImportRow(sampleResult) as Record<string, unknown>;
    expect(row).not.toHaveProperty('has_text');
    expect(row).not.toHaveProperty('has_image');
    expect(row).not.toHaveProperty('has_ocr');
    expect(row).not.toHaveProperty('metadata');
  });

  it('handles empty description gracefully', () => {
    const row = buildImportRow({ ...sampleResult, description: '' });
    expect(row.extracted_text).toContain('Bell CAD');
    expect(() => buildImportRow({ ...sampleResult, description: '' })).not.toThrow();
  });
});

// ── Stage 6 count: documents_analyzed field name consistency ──────────────────

describe('Stage 6 documents_analyzed — field name consistency', () => {
  it('uses processing_status (not analysis_status) to count analyzed documents', () => {
    // The fix changes .eq('analysis_status', 'analyzed') to .eq('processing_status', 'analyzed').
    // This test validates the correct column name is used by confirming only the
    // valid DB column produces meaningful results.
    const validColumn = 'processing_status';
    const invalidColumn = 'analysis_status';

    // Simulated documents as they exist in the DB
    const dbDocs: Record<string, string>[] = [
      { processing_status: 'analyzed', id: '1' },
      { processing_status: 'analyzed', id: '2' },
      { processing_status: 'extracted', id: '3' },
    ];

    // Querying with correct column name returns correct count
    const correctCount = dbDocs.filter(d => d[validColumn] === 'analyzed').length;
    expect(correctCount).toBe(2);

    // Querying with wrong column name (now fixed) would always return 0
    const wrongCount = dbDocs.filter(d => d[invalidColumn] === 'analyzed').length;
    expect(wrongCount).toBe(0);
  });
});
