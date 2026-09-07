// Two loading bars, two cost counters (owner, 2026-09-07): "one loading bar for the research stage that
// just deals with file/doc/image retrieval, and then a seperate loading bar for the analysis stage.
// There also needs to be two seperate cost counters for each stage as well." Plus the run-5 log review.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN_PHASES, percentAt } from '../research/run-phases.js';
import { driveAppAnalysis, type AnalysisCallOptions } from '../research/drive-app-analysis.js';
import { reanalyseFiledDocuments, type FiledDocument } from '../research/reanalyze-documents.js';
import { choosePlatform, mayPurchaseFrom, carriesDocumentType } from '../services/platform-choice.js';
import { DocumentIndex } from '../research/document-identity.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const BELL = '48027';

describe('X1 — the research bar is retrieval progress, not cost proximity', () => {
  const src = read('index.ts');
  it('the status endpoint and the heartbeat report the phase ladder, and the cost bar is gone', () => {
    expect(src).toContain('percent: snapshot?.percent ?? 0,');
    expect(src).toContain('snapshot?.percent, // retrieval progress from the ladder (owner, 2026-09-07), not cost');
    expect(src).not.toContain('costProgressPercent(');
  });
  it('the ladder is a gather run\'s: the AI rungs are seconds, retrieval the long pole, imagery ends near the top', () => {
    const sec = (id: string) => RUN_PHASES.find((p) => p.id === id)!.expectedSec;
    for (const id of ['ocr', 'extraction', 'reconciliation', 'validation']) expect(sec(id), id).toBeLessThanOrEqual(15);
    expect(sec('reporting')).toBeGreaterThanOrEqual(45);
    expect(sec('retrieval')).toBeGreaterThan(sec('clerk_search'));
    const imagery = RUN_PHASES.findIndex((p) => p.id === 'imagery');
    expect(percentAt(imagery, 1)).toBeGreaterThanOrEqual(88);
  });
});

describe('X2 — the worker stamps the review\'s own progress', () => {
  it('driveAppAnalysis reports before each document and each finalize stage', async () => {
    const seen: Array<{ stage: string; done: number; total: number; label: string }> = [];
    const calls: AnalysisCallOptions[] = [];
    const r = await driveAppAnalysis({
      projectId: 'p1',
      listDocuments: async () => [{ id: 'd1', label: 'Deed one' }, { id: 'd2', label: 'Plat two' }],
      call: async (o) => { calls.push(o); return { ok: true, statement: 'done' }; },
      spentSoFar: async () => 0,
      onProgress: (p) => { seen.push(p); },
    });
    expect(r.finalized).toBe(true);
    expect(seen).toEqual([
      { stage: 'analyzing', done: 0, total: 2, label: 'Deed one' },
      { stage: 'analyzing', done: 1, total: 2, label: 'Plat two' },
      { stage: 'finalizing', done: 0, total: 3, label: 'Chain of title' },
      { stage: 'finalizing', done: 1, total: 3, label: 'Cross-reference and discrepancies' },
      { stage: 'finalizing', done: 2, total: 3, label: 'Coherence review' },
    ]);
    expect(calls).toHaveLength(5);
  });
  it('a progress callback that throws never stops the drive', async () => {
    const r = await driveAppAnalysis({
      projectId: 'p1',
      listDocuments: async () => [{ id: 'd1' }],
      call: async () => ({ ok: true, statement: 'done' }),
      spentSoFar: async () => 0,
      onProgress: () => { throw new Error('screen went away'); },
    });
    expect(r.finalized).toBe(true);
  });
  it('the read loop reports (done, total, label) per document and once at the end', async () => {
    const seen: Array<[number, number, string]> = [];
    const docs: FiledDocument[] = [
      { id: 'a', document_type: 'deed', document_label: 'Deed A', extracted_text: null, extracted_text_method: null, page_count: 1, processing_status: 'pending', ocr_regions: null },
      { id: 'b', document_type: 'plat', document_label: 'Plat B', extracted_text: null, extracted_text_method: null, page_count: 1, processing_status: 'pending', ocr_regions: null },
    ];
    const db = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) };
    await reanalyseFiledDocuments(db as never, docs, async () => null, () => {}, () => true, async () => {}, (d, t, l) => { seen.push([d, t, l]); });
    expect(seen).toHaveLength(3);
    expect(seen[0]).toEqual([0, 2, expect.stringContaining('Deed A')]);
    expect(seen[1]).toEqual([1, 2, expect.stringContaining('Plat B')]);
    expect(seen[2]).toEqual([2, 2, 'All documents read']);
  });
  it('the handler stamps reading / analyzing / finalizing, and an unparked review stamps finishedAt + stopped', () => {
    const src = read('index.ts');
    expect(src).toContain('async function stampReviewProgress(projectId: string, patch: Record<string, unknown>): Promise<void> {');
    expect(src).toContain("await stampReviewProgress(projectId, { stage: 'reading', documentsDone: 0, documentsTotal: null, label: 'Listing the documents to read' });");
    expect(src).toContain("(done, total, label) => stampReviewProgress(projectId, { stage: 'reading', documentsDone: done, documentsTotal: total, label })));");
    expect(src).toContain('onProgress: (p) => stampReviewProgress(projectId, { stage: p.stage, documentsDone: p.done, documentsTotal: p.total, label: p.label }),');
    expect(src).toContain("review: { ...review, finishedAt: now, progress: { ...prior, stage: 'stopped', from: prior.stage ?? null,");
    // Merged, never replaced: the app's startedAt/costCapUsd stamp survives every progress write.
    expect(src).toContain('analysis_metadata: { ...meta, review: { ...review, progress: { ...prior, ...patch, at: now } } }, updated_at: now');
  });
});

describe('X4 — run-5 log review', () => {
  it('L1: a plat FILED by the paid pass is a plat found', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('async function filedPlatLabel(projectId: string | undefined, subdivision: string | null): Promise<string | null> {');
    expect(orch).toContain('? await filedPlatLabel(input.projectId, property.subdivisionName ?? null)');
    expect(orch).toContain('deedRecords, property, filedPlat,');
    expect(orch).toContain("} else if (filedPlat) {\n    found.push({ category: 'plat', label: 'Plat / subdivision plat', detail: `Filed from a paid source earlier in this run — ${filedPlat}` });");
  });
  it('L2: the TxDOT library carries right-of-way only, so it is no "cheaper" choice for a plat or a deed', () => {
    const txdot = choosePlatform(BELL, { configured: ['texasfile'], documentType: 'right_of_way' }).platform;
    expect(txdot?.id).toBe('txdot_docs');
    for (const t of ['plat', 'deed', 'Deed', 'warranty-deed', 'easement']) {
      const c = choosePlatform(BELL, { configured: ['texasfile'], documentType: t });
      expect(c.platform?.id, t).not.toBe('txdot_docs');
      expect(mayPurchaseFrom(BELL, 'texasfile', { configured: ['texasfile'], documentType: t }).reason).not.toMatch(/TxDOT/);
    }
    expect(carriesDocumentType({ carries: ['right_of_way'] } as never, 'Right-of-Way')).toBe(true);
    expect(carriesDocumentType({ carries: ['right_of_way'] } as never, 'plat')).toBe(false);
    expect(carriesDocumentType({} as never, 'plat')).toBe(true);
    const orch = read('services/document-purchase-orchestrator.ts');
    expect(orch).toContain('documentType: rec.documentType,\n          });');
  });
  it('L3: a search want has no identity yet — that is not "bought under uncertainty"', () => {
    const idx = new DocumentIndex();
    const d = idx.decide({ county: 'Bell', instrumentNumber: 'search_required' });
    expect(d.buy).toBe(true);
    expect(d.underUncertainty).toBe(false);
    const unknown = idx.decide({ county: 'Bell' });
    expect(unknown.underUncertainty).toBe(true);
  });
  it('L4: a gather run says its summary is deferred, not that the key is missing', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain("  if (isGatherRun) {\n    // The key is blanked on purpose");
    expect(orch).toContain('Property summary deferred — a gather run writes no summary; the AI review writes it from what it reads.');
  });
  it('L5: the county lifecycle line carries the county\'s counts and clock', () => {
    const src = read('index.ts');
    expect(src).not.toContain("describeRunOutcome('complete', { documents: 0, durationMs: 0 })");
    expect(src).toContain('durationMs: unifiedResult.data.durationMs ?? 0,');
  });
});

describe('GET /research/active answers with summaries, not the live pipeline objects', () => {
  it('never serialises the AbortController/timers (a 500 "circular structure" while any run was in flight)', () => {
    const src = read('index.ts');
    expect(src).not.toContain('res.json({ count: active.length, pipelines: active });');
    expect(src).toContain("const pipelines = Array.from(activePipelines.entries()).map(([projectId, p]) => ({");
    expect(src).toContain('res.json({ count: pipelines.length + reviews.length, pipelines, reviews });');
    // A review in flight counts too — the updater must not rebuild over it (run 5's review died that way).
    expect(src).toContain("activeReviews.set(projectId, { startedAt: new Date().toISOString() });");
    expect(src).toContain('      activeReviews.delete(projectId);\n    }\n  })();');
  });
});
