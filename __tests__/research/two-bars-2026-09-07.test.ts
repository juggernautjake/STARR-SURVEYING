// Two loading bars, two cost counters (owner, 2026-09-07): the research stage's bar is retrieval, the
// analysis stage gets its OWN bar and its own Documents / Elapsed / Spent-of-cap counters.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reviewPercent, normaliseReviewProgress, describeReviewProgress } from '../../lib/research/review-progress';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('reviewPercent — the review\'s bar', () => {
  const p = (stage: string, done: number, total: number | null, extra: Record<string, unknown> = {}) =>
    normaliseReviewProgress({ stage, documentsDone: done, documentsTotal: total, label: 'x', ...extra });
  it('reading fills 5→45, analyzing 45→85, finalizing 85→97, done 100', () => {
    expect(reviewPercent('analyzing', p('reading', 0, null))).toBe(5);
    expect(reviewPercent('analyzing', p('reading', 5, 10))).toBe(25);
    expect(reviewPercent('analyzing', p('reading', 10, 10))).toBe(45);
    expect(reviewPercent('analyzing', p('analyzing', 0, 4))).toBe(45);
    expect(reviewPercent('analyzing', p('analyzing', 2, 4))).toBe(65);
    expect(reviewPercent('analyzing', p('finalizing', 0, 3))).toBe(85);
    expect(reviewPercent('analyzing', p('finalizing', 2, 3))).toBe(93);
    expect(reviewPercent('review', p('done', 4, 4), '2026-09-07T13:00:00Z')).toBe(100);
  });
  it('a stopped review keeps the height it reached; nothing stamped is 3 while analyzing', () => {
    expect(reviewPercent('review', p('stopped', 2, 4, { from: 'analyzing' }), '2026-09-07T13:00:00Z')).toBe(65);
    expect(reviewPercent('analyzing', null)).toBe(3);
    expect(reviewPercent('review', null, '2026-09-07T13:00:00Z')).toBe(100);
    expect(reviewPercent('configure', null)).toBe(0);
  });
  it('normalises the stamped JSON field by field', () => {
    expect(normaliseReviewProgress(null)).toBeNull();
    expect(normaliseReviewProgress({ stage: 'nope' })).toBeNull();
    expect(normaliseReviewProgress({ stage: 'reading', documentsDone: '3', documentsTotal: 5, label: '' }))
      .toEqual({ stage: 'reading', documentsDone: 0, documentsTotal: 5, label: null, from: null });
  });
  it('describes where it is in words', () => {
    expect(describeReviewProgress(p('reading', 2, 9, { label: 'Deed — Ferrell to Caffrey' }), 'analyzing')).toBe('Reading document 3 of 9 — Deed — Ferrell to Caffrey');
    expect(describeReviewProgress(p('finalizing', 1, 3, { label: 'Cross-reference and discrepancies' }), 'analyzing')).toBe('Finalizing (2 of 3) — Cross-reference and discrepancies');
    expect(describeReviewProgress(null, 'analyzing')).toContain('listing the documents');
  });
});

describe('the status route carries the bar, and the finalize stops the clock', () => {
  const svc = read('lib/research/analysis.service.ts');
  it('getAnalysisStatus returns progress + percent on the review', () => {
    expect(svc).toContain('review?: ReviewStatus;');
    expect(svc).toContain('const progress = normaliseReviewProgress(rv.progress);');
    expect(svc).toContain('progress, percent: reviewPercent(status, progress, finishedAt),');
  });
  it('persistLogs merges `review` a level down, so the worker\'s stamps and the app\'s survive each other', () => {
    expect(svc).toContain("? { review: { ...((existing.review as Record<string, unknown>) ?? {}), ...(extraMeta.review as Record<string, unknown>) } }");
    expect(svc).toContain('analysis_metadata: { ...existing, ...extraMeta, logs, ...reviewMerge },');
  });
  it('the coherence finalize stamps finishedAt and done', () => {
    expect(svc).toContain("review: { finishedAt: completedAt, progress: { stage: 'done', documentsDone: allDocuments.length, documentsTotal: allDocuments.length, label: 'Analysis complete', at: completedAt } },");
  });
});

describe('the Analysis stage draws its own bar and counters (check the CALLER)', () => {
  const ctl = read('app/admin/research/components/RunAiReviewControl.tsx');
  it('AiReviewProgressBar is mounted under the control once the review has reported', () => {
    expect(ctl).toContain('export function AiReviewProgressBar({ p, now = Date.now() }: { p: ReviewProgress; now?: number }) {');
    expect(ctl).toContain('{started && !error && progress?.review && <AiReviewProgressBar p={progress} />}');
    expect(ctl).toContain('aria-label={`AI review progress: ${pct}%`}');
    expect(ctl).toContain('<Counter label="Documents"');
    expect(ctl).toContain('<Counter label="Elapsed"');
    expect(ctl).toContain('<Counter label="Review spent"');
    // The run view's styles are mounted here because the run view itself is not on this stage.
    expect(ctl).toContain('<RunViewStyles />');
  });
  it('the research bar says what it measures, and Counter is shared', () => {
    const rv = read('app/admin/research/components/ResearchRunView.tsx');
    expect(rv).toContain('aria-label={`Retrieval progress: ${state.percent}%`}');
    expect(rv).toContain('export function Counter({ label, value, live, hint }: {');
  });
});
