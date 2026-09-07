// The AI review gets its OWN clock and its OWN cost counter (owner, 2026-09-07): the research run's
// ELAPSED and SPENT were showing "1:36:09 / 25:00 · $3.30" over a nine-minute, two-cent run because
// the review that followed booked to the same project and nothing stopped the clock.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatReviewElapsed, reviewStatusLine } from '../../app/admin/research/components/RunAiReviewControl';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('the review control shows the review\'s own time and money', () => {
  it('formats elapsed from the review\'s start, live while it runs and frozen at its finish', () => {
    const start = '2026-09-07T12:11:51.000Z';
    expect(formatReviewElapsed(start, null, Date.parse('2026-09-07T12:24:25.000Z'))).toBe('12:34');
    expect(formatReviewElapsed(start, '2026-09-07T13:29:56.000Z', Date.parse('2026-09-07T20:00:00.000Z'))).toBe('1:18:05');
  });
  it('the status line names the review\'s spend against its cap, not the project\'s', () => {
    const rv = { startedAt: '2026-09-07T12:11:51.000Z', finishedAt: null, elapsedMs: 0, spendUsd: 3.42, costCapUsd: 7, progress: null, percent: 3 };
    expect(reviewStatusLine({ status: 'analyzing', review: rv }, Date.parse('2026-09-07T12:21:51.000Z'))).toBe('AI review running — 10:00 elapsed · $3.42 of $7.00 spent');
    expect(reviewStatusLine({ status: 'review', review: { ...rv, finishedAt: '2026-09-07T13:29:56.000Z' } })).toBe('AI review complete — 1:18:05 · $3.42 of $7.00.');
    expect(reviewStatusLine(null)).toContain('AI review started');
  });
  it('polls when the page opens on a review already in progress (check the CALLER)', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain("<RunAiReviewControl projectId={projectId} onStarted={() => loadProject()} analyzing={project.status === 'analyzing'} />");
    const ctl = read('app/admin/research/components/RunAiReviewControl.tsx');
    expect(ctl).toContain('const [started, setStarted] = useState(analyzing);');
    expect(ctl).toContain('review: j.review ?? null');
  });
});

describe('the status route and the service supply the review window', () => {
  it('the worker-accepted start stamps analysis_metadata.review.startedAt', () => {
    const route = read('app/api/admin/research/[projectId]/analyze/route.ts');
    expect(route).toContain("analysis_metadata: { ...meta, review: { startedAt: new Date().toISOString(), costCapUsd: config?.maxCostUsd ?? null, finishedAt: null } },");
  });
  it('getAnalysisStatus sums the ledger\'s AI calls since that start and returns the window', () => {
    const svc = read('lib/research/analysis.service.ts');
    expect(svc).toContain('review?: ReviewStatus;');
    expect(svc).toContain(".eq('event_type', 'ai_call')");
    expect(svc).toContain(".gte('created_at', rv.startedAt);");
    expect(svc).toContain('...(review ? { review } : {}),');
  });
  it('the run console scopes SPENT to the research run\'s own window', () => {
    const route = read('app/api/admin/research/[projectId]/run-console/route.ts');
    expect(route).toContain('return (!runStart || at >= runStart) && (!runEnd || at <= runEnd);');
  });
});
