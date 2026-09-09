// Captures that mean something (plan 2026-09-09) — the app's half: chain-of-title shells are not
// documents, held references are not followed, and a text record opens on its text.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { looksLikeRecordContent, heldDocumentFor } from '@/lib/research/analysis.service';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('I — the chain-of-title stage files records, not React shells', () => {
  const shell = 'Loading Search Results... Your web browser is out of date. Update your browser for more security, speed and the best experience on this site. Update your browser The County of Bell County Clerk Shelley Coston Cart 0 Register Help Sign In New Search results Loading Results for Department: Property Records © 2026 Bell County, Texas. All Rights Reserved Powered By';
  it('the publicsearch shell is not record content', () => {
    expect(looksLikeRecordContent(shell)).toBe(false);
  });
  it('an instrument listing is', () => {
    expect(looksLikeRecordContent('Instrument ID: 2004034968\n  Type: DEED\n  Recorded: 8/13/2004\n  Volume: 5456, Page: 704\n  Grantors: FERRELL GEORGE W\n  Grantees: CAFFREY BARBARA SPEER')).toBe(true);
  });
  it('a reference the project holds is named, a shell row never counts as holding it', () => {
    const docs = [
      { document_label: 'DEED — FERRELL GEORGE W to CAFFREY BARBARA SPEER (Instr. 2004034968)', recording_info: 'Volume 5456, Page 704', file_type: 'pdf', storage_url: 'https://x/deed.png', pages_pdf_url: null },
      { document_label: 'Subdivision Plat: WINNIE MAE ADN', recording_info: 'Plat records · Cabinet A, Slide 166', file_type: 'pdf', storage_url: 'https://x/plat.png', pages_pdf_url: null },
      { document_label: 'Chain of Title — Vol. 9251, Pg. 668', recording_info: 'Chain-of-title reference: Vol. 9251, Pg. 668', file_type: 'html', storage_url: null, pages_pdf_url: null },
    ];
    expect(heldDocumentFor(docs, { volume: '5456', page: '704' }, 'Vol. 5456, Pg. 704')).toMatch(/FERRELL/);
    expect(heldDocumentFor(docs, { instrument: '2004034968' }, '')).toMatch(/FERRELL/);
    expect(heldDocumentFor(docs, null, 'Cabinet A, Slide 166')).toMatch(/WINNIE MAE/);
    expect(heldDocumentFor(docs, { volume: '9251', page: '668' }, 'Vol. 9251, Pg. 668')).toBeNull();
    expect(heldDocumentFor(docs, { volume: '763', page: '408' }, 'Vol. 763, Pg. 408')).toBeNull();
  });
  it('the stage asks both questions before inserting', () => {
    const src = read('lib/research/analysis.service.ts');
    expect(src).toContain("const heldBy = heldDocumentFor(existingDocuments, norm, dp.raw_value ?? '');");
    expect(src).toContain('if (!looksLikeRecordContent(text)) {');
    const ask = src.indexOf('if (!looksLikeRecordContent(text)) {');
    const insert = src.indexOf("document_label: `Chain of Title — ${refLabel}`,");
    expect(ask >= 0 && insert >= 0 && ask < insert).toBe(true);
  });
});

describe('H — a text record opens on its text', () => {
  it('the viewer follows the document, and says what a text record is', () => {
    const src = read('app/admin/research/components/SourceDocumentViewer.tsx');
    expect(src).toContain("useEffect(() => { setActiveTab(hasImages ? 'images' : 'text'); }, [doc.id, hasImages]);");
    expect(src).toContain('This is a text record');
    expect(src).toContain('Show the text →');
  });
});
