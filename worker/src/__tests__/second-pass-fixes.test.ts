import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileResearchDocument, type FileDocumentDb } from '../research/file-document.js';
import type { ProjectLibrary } from '../research/project-library.js';

// ── FOUR CONFIRMED FINDINGS FROM THE SECOND REVIEW PASS (2026-09-03, night) ───────────────────
//
//   MD-2c  A document filed during the run and re-filed at persist time lost its extracted text on
//          the merge path — the update touched lineage columns only. Every county, every run, and
//          the reason the post-run re-read had anything to re-read.
//   MD-3   A thrown appraisal scrape was recorded as `empty` (→ no_record, which the ratchet
//          ignores by design) instead of `error`.
//   MD-5   The property summary was budget-gated but not time-bounded, on both paths.
//   MD-6   The tail imagery pass was skipped wholesale once the early pass had run, so the one
//          capture the early pass cannot take — the historical aerial — was never taken.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

describe('MD-2c: a re-filed document keeps what was read from it', () => {
  function fakes() {
    const updates: Array<Record<string, unknown>> = [];
    const db: FileDocumentDb = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }) }),
        update: (r: unknown) => ({ eq: async () => { updates.push(r as Record<string, unknown>); return { error: null }; } }),
      }),
    };
    const library = {
      classify: () => ({ kind: 'already-held', existingId: 'held-1', identityKey: 'bell|2004032468|2004-05-01', reason: 'same instrument' }),
      entryById: () => ({ runSeenCount: 1 }),
    } as unknown as ProjectLibrary;
    return { db, library, updates };
  }

  it('carries text, method, confidence, segments and summary onto the held row', async () => {
    const { db, library, updates } = fakes();
    const out = await fileResearchDocument(db, library, {
      row: {
        extracted_text: 'BEGINNING at an iron rod', extracted_text_method: 'ai-vision', ocr_confidence: 0.8,
        ocr_segments: [{ segmentId: 'r0c0' }], analysis_metadata: { aiSummary: 'Conveys 22.495 acres.' }, processing_status: 'analyzed',
      },
      candidate: { county: 'Bell', instrumentNumber: '2004032468', recordingDate: '2004-05-01' },
      runId: 'run-2',
    });
    expect(out.outcome).toBe('merged');
    expect(updates[0]).toMatchObject({
      extracted_text: 'BEGINNING at an iron rod', extracted_text_method: 'ai-vision', ocr_confidence: 0.8,
      analysis_metadata: { aiSummary: 'Conveys 22.495 acres.' }, processing_status: 'analyzed', last_seen_run_id: 'run-2',
    });
  });

  it('CONTROL: a re-filing with no text touches lineage only (and text without a method is refused)', async () => {
    const { db, library, updates } = fakes();
    await fileResearchDocument(db, library, { row: { document_label: 'Deed' }, candidate: { county: 'Bell', instrumentNumber: '1' }, runId: 'r' });
    expect(updates[0]).not.toHaveProperty('extracted_text');
    await fileResearchDocument(db, library, { row: { extracted_text: 'text with no origin' }, candidate: { county: 'Bell', instrumentNumber: '1' }, runId: 'r' });
    expect(updates[1]).not.toHaveProperty('extracted_text');
  });
});

describe('MD-3: a thrown appraisal scrape is an error, not an empty index', () => {
  const orch = read('counties/bell/orchestrator.ts');
  it('CONTROL: the probe reads the source-outcome block', () => {
    expect(orch).toContain("siteId: `cad-${fips}-bis`");
  });
  it('maps a rejected CAD promise to error before considering the host circuit', () => {
    expect(orch).toContain("const cadThrew = cadResult.status === 'rejected'");
    expect(orch).toMatch(/outcome: cad \? 'found' : cadThrew \? 'error' : cadGate\.blocked \? 'unreachable' : 'empty'/);
  });
});

describe('MD-5: the property summary is time-bounded on both paths', () => {
  it('Bell', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toMatch(/withStepDeadline\(input\.projectId, 'property summary',\s*\(\) => writePropertySummary\(summaryInputFromBell\(result\)/);
  });
  it('generic', () => {
    const pipe = read('services/pipeline.ts');
    expect(pipe).toMatch(/withStepDeadline\(input\.projectId, 'property summary', \(\) => writePropertySummary\(/);
  });
});

describe('MD-6: the tail imagery pass takes what the early pass could not', () => {
  const index = read('index.ts');
  it('CONTROL: the probe reads both passes', () => {
    expect(index).toContain('async function captureVisualsAtIdentification(');
    expect(index).toContain('async function captureImageryForRun(');
  });
  it('the early pass records the KINDS it captured, and the tail filters by them', () => {
    expect(index).toContain('const visualsCaptured = new Map<string, Set<string>>()');
    expect(index).toContain('visualsCaptured.set(projectId, new Set(plan.captures.map((c) => c.kind)))');
    expect(index).toContain('const remaining = planned.captures.filter((c) => !already.has(c.kind))');
    expect(index).not.toContain('visuals were already captured at identification — nothing to redo');
  });
});

// Keep vitest from treating an unused import as an error under isolated module settings.
void vi;
