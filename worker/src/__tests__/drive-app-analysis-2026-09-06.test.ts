// The worker drives the app's data-point analysis in awaited chunks (plan 6.7's last note: "the
// app-side data-point analysis still runs on Vercel after the worker's read pass" — a background
// job Vercel froze). Pure sequence + cap + failure handling, then the CALLER chain on both sides.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveAppAnalysis, type AnalysisCallOptions } from '../research/drive-app-analysis.js';
import { triggerAppAnalysis } from '../research/trigger-app-analysis.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const readRepo = (rel: string) => fs.readFileSync(path.join(here, '..', '..', '..', rel), 'utf8');

function harness(opts: { docs?: string[]; spendPerCall?: number; fail?: Set<string> } = {}) {
  const calls: AnalysisCallOptions[] = [];
  let spent = 5; // the project already cost $5 before the analyze run — the cap counts only growth
  return {
    calls,
    input: {
      projectId: 'p1',
      listDocuments: async () => (opts.docs ?? ['d1', 'd2', 'd3']).map((id) => ({ id, label: `Deed ${id}` })),
      call: async (o: AnalysisCallOptions) => {
        calls.push(o);
        spent += opts.spendPerCall ?? 0;
        const ok = !(o.documentId && opts.fail?.has(o.documentId));
        return { ok, statement: ok ? 'done' : 'HTTP 500' };
      },
      spentSoFar: async () => spent,
    },
  };
}

describe('driveAppAnalysis — one awaited call per document, then one finalize', () => {
  it('chunks in document order, each a resume + skipFinalization call, then finalises', async () => {
    const h = harness();
    const r = await driveAppAnalysis(h.input);
    // Three finalize STAGES follow the chunks (2026-09-07): chain → crossref → coherence.
    expect(h.calls.map((c) => c.documentId)).toEqual(['d1', 'd2', 'd3', undefined, undefined, undefined]);
    expect(h.calls.slice(0, 3).every((c) => c.resume === true && c.skipFinalization === true)).toBe(true);
    expect(h.calls.slice(3).map((c) => c.finalizeStage)).toEqual(['chain', 'crossref', 'coherence']);
    expect(h.calls[3]).toEqual({ resume: true, finalizeStage: 'chain', maxCostUsd: undefined });
    expect(r).toMatchObject({ documents: 3, chunks: 3, chunkFailures: 0, skippedAtCap: 0, finalized: true });
  });

  it('passes the REMAINING cap into each call and skips documents once it is spent — but still finalises', async () => {
    const h = harness({ spendPerCall: 1.5 });
    const r = await driveAppAnalysis({ ...h.input, maxCostUsd: 2 });
    // d1 gets the full $2; d2 gets $0.50; d3 is skipped (cap spent); finalize gets $0.
    expect(h.calls.map((c) => c.maxCostUsd)).toEqual([2, 0.5, 0, 0, 0]);
    expect(h.calls.map((c) => c.documentId)).toEqual(['d1', 'd2', undefined, undefined, undefined]);
    expect(r).toMatchObject({ chunks: 2, skippedAtCap: 1, finalized: true });
    expect(r.statement).toContain('1 skipped at the cost cap');
  });

  it('a failed chunk is counted and the run goes on to the next document', async () => {
    const h = harness({ fail: new Set(['d2']) });
    const r = await driveAppAnalysis(h.input);
    expect(r).toMatchObject({ chunks: 3, chunkFailures: 1, finalized: true });
    expect(r.statement).toContain('(1 failed)');
  });

  it('with no readable documents it makes the one legacy whole-project call (the app says why)', async () => {
    const h = harness({ docs: [] });
    const r = await driveAppAnalysis({ ...h.input, maxCostUsd: 3 });
    expect(h.calls).toEqual([{ maxCostUsd: 3 }]);
    expect(r.finalized).toBe(false);
  });
});

describe('triggerAppAnalysis carries the chunk options and awaits when asked', () => {
  it('sends documentId / resume / skipFinalization / awaitCompletion and honours the timeout', async () => {
    let seen: { url: string; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await triggerAppAnalysis('p1', { allow: true, documentId: 'd1', resume: true, skipFinalization: true, awaitCompletion: true, maxCostUsd: 1.25, timeoutMs: 1000 },
      { APP_BASE_URL: 'https://app.example.com', WORKER_API_KEY: 'k' } as NodeJS.ProcessEnv, fetchImpl);
    expect(r.ok).toBe(true);
    expect(seen!.body).toEqual({ maxCostUsd: 1.25, documentId: 'd1', resume: true, skipFinalization: true, awaitCompletion: true });
    expect(r.statement).toContain('document d1 completed');
  });
  it('a plain call still sends only the cap (the run-finish auto-analysis is unchanged)', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    await triggerAppAnalysis('p1', { allow: true, maxCostUsd: 2 }, { APP_BASE_URL: 'https://a', WORKER_API_KEY: 'k' } as NodeJS.ProcessEnv, fetchImpl);
    expect(body).toEqual({ maxCostUsd: 2 });
  });
});

describe('WIRED on both sides (check the CALLER)', () => {
  it('the read-documents endpoint drives the analysis instead of firing one call', () => {
    const src = read('index.ts');
    const at = src.indexOf('if (thenAnalyze) {');
    const block = src.slice(at, at + 3400); // widened 2026-09-07: the read-order sort sits inside this block
    expect(block).toContain("await import('./research/drive-app-analysis.js')");
    expect(block).toContain('awaitCompletion: true, timeoutMs: 330_000');
    expect(block).toContain("in('processing_status', ['extracted', 'analyzed'])");
    expect(block).toContain('spentSoFar: () => ledgerSpendForRun(projectId)');
  });
  it('the app route runs an awaited worker call to completion, and only the worker may chunk', () => {
    const route = readRepo('app/api/admin/research/[projectId]/analyze/route.ts');
    expect(route).toContain('if (isWorker && awaitCompletion) {');
    expect(route).toContain('const result = await analyzeProject(projectId, config);');
    expect(route).toContain("if (body.skipFinalization === true && isWorker) config.skipFinalization = true;");
  });
  it('the app service stops a chunk before the cross-document work, leaving the project at analyzing', () => {
    const svc = readRepo('lib/research/analysis.service.ts');
    const at = svc.indexOf('if (config?.skipFinalization) {');
    expect(at).toBeGreaterThan(-1);
    const chunk = svc.slice(at, at + 900);
    expect(chunk).toContain('return { dataPointCount: allDataPoints.length, discrepancyCount: 0 };');
    // The chunk return comes BEFORE chain-of-title / cross-reference / coherence.
    expect(at).toBeLessThan(svc.indexOf('// 4b. Chain-of-title'));
    expect(chunk).not.toContain("{ status: 'review' }");
  });
  it('the analyze function is given the time an awaited chunk needs', () => {
    const vercel = JSON.parse(readRepo('vercel.json')) as { functions: Record<string, { maxDuration: number }> };
    expect(vercel.functions['app/api/admin/research/[projectId]/analyze/route.ts'].maxDuration).toBe(300);
  });
});
