// Run 4's review (2026-09-07): fourteen awaited per-document chunks completed on the app, then the ONE
// finalize call — chain of title, cross-reference + discrepancies, the 3-pass coherence review — ran
// past Vercel's function limit and answered HTTP 504; the worker's un-park put the project back at
// `review` with no chain of title. The finalize now runs a STAGE at a time, each an awaited call the
// worker makes in order; only the last stage ends the project at `review`. Check the CALLER on both
// sides, and that a person's button still runs the whole finalize.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('the finalize runs in stages under one Vercel invocation each', () => {
  const svc = read('lib/research/analysis.service.ts');
  it('the service gates each stage on finalizeStage and ends early on a non-final stage', () => {
    expect(svc).toContain("finalizeStage?: 'chain' | 'crossref' | 'coherence';");
    expect(svc).toContain("const runs = (s: 'chain' | 'crossref' | 'coherence') => !stage || stage === s;");
    expect(svc).toContain("if (countyKey && runs('chain')) {");
    expect(svc).toContain("if (runs('crossref') && uniqueDocIds.size > 1 && allDataPoints.length > 0) {");
    expect(svc).toContain("const mathDiscrepancies = runs('crossref') ? detectMathDiscrepancies(projectId, allDataPoints) : [];");
    expect(svc).toContain("if (runs('crossref') && allDiscrepancies.length > 0) {");
    expect(svc).toContain("if (stage && stage !== 'coherence') {");
  });
  it('a person\'s button (no stage) still runs every stage — the gates are open when stage is unset', () => {
    // `runs()` answers true for every stage when `stage` is undefined; nothing else gates the path.
    expect(svc).toContain('!stage || stage === s');
  });
  it('the route accepts a stage only from the worker', () => {
    const route = read('app/api/admin/research/[projectId]/analyze/route.ts');
    expect(route).toContain("if (isWorker && (body.finalizeStage === 'chain' || body.finalizeStage === 'crossref' || body.finalizeStage === 'coherence')) config.finalizeStage = body.finalizeStage;");
  });
  it('the worker asks for the three stages in order and stops on a failure', () => {
    const drive = read('worker/src/research/drive-app-analysis.ts');
    expect(drive).toContain("const stages: Array<'chain' | 'crossref' | 'coherence'> = ['chain', 'crossref', 'coherence'];");
    expect(drive).toContain('fin = await input.call({ resume: true, finalizeStage: stage, maxCostUsd: await remaining() });');
    expect(drive).toContain('if (!fin.ok) break;');
    const trigger = read('worker/src/research/trigger-app-analysis.ts');
    expect(trigger).toContain('if (opts.finalizeStage) body.finalizeStage = opts.finalizeStage;');
  });
});
