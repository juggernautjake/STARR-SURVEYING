// __tests__/research/gather-then-analyze-wiring.test.ts — research GATHERS, the user ANALYZES.
//
// Owner, 2026-09-06: "we have the basic research, and then we can run the analysis after … we will
// not automatically do the AI/OCR identifier fallback or iterative discovery loop." The 2026-09-06
// Bell run showed the app had never sent the run its phase, so every research run was the legacy
// gather-then-analyse pass and spent 65 of 76 minutes reading deeds with AI. These guard the CALLERS:
// the dialog and the route send `phase: 'gather'`; the Analyze button reaches the worker's reading
// pass; the live document list has a real View button; the re-run's parcel ID is saved.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('a research run is sent as a GATHER run', () => {
  it('the run-settings dialog sends phase: gather', () => {
    const dialog = read('app/admin/research/components/RerunDialog.tsx');
    const submit = dialog.slice(dialog.indexOf('function submit('), dialog.indexOf('onConfirm({'));
    expect(submit).toContain("phase: 'gather',");
  });
  it('the pipeline route defaults phase to gather for any caller that omits it', () => {
    const route = read('app/api/admin/research/[projectId]/pipeline/route.ts');
    const merge = route.slice(route.indexOf('const settings: Record<string, unknown> = {'), route.indexOf('...(body.settings ?? {})'));
    expect(merge).toContain("phase: 'gather',");
    // the caller's explicit choice still wins: the spread comes AFTER the default
    expect(route.indexOf("phase: 'gather',")).toBeLessThan(route.indexOf('...(body.settings ?? {})'));
  });
  it('the client settings type still carries phase (mirror of the worker)', () => {
    expect(read('app/admin/research/components/useRunState.ts')).toMatch(/phase\?: 'gather' \| 'analyze';/);
  });
});

describe('the Analyze button starts the reading pass on the worker first', () => {
  const route = read('app/api/admin/research/[projectId]/analyze/route.ts');
  it('a whole-project analyze POSTs the worker read-documents endpoint with thenAnalyze', () => {
    expect(route).toContain('/research/read-documents/${projectId}');
    expect(route).toContain('thenAnalyze: true');
    expect(route).toContain("via: 'worker'");
  });
  it('per-file, resume, benchmark and the worker callback stay in-process', () => {
    expect(route).toContain('const wholeProject = !isWorker && !isResume && !config?.documentId && !config?.benchmark;');
  });
  it('falls back to the in-process analysis when the worker is not configured or unreachable', () => {
    expect(route).toContain('if (wholeProject && workerUrl && workerApiKey)');
    // the in-process call remains after the delegation block
    expect(route.lastIndexOf('analyzeProject(projectId, config)')).toBeGreaterThan(route.indexOf('read-documents'));
  });
  it('the abort keeps the follow-up leads and research round', () => {
    expect(route).toContain('kept.discoveredLeads = priorMeta.discoveredLeads');
    expect(route).toContain('kept.researchRound = priorMeta.researchRound');
    expect(route).toContain('analysis_metadata: { ...kept, abort_requested: true');
  });
});

describe('the live document list has a View button that opens the dedicated viewer', () => {
  it('renders a View button beside Source, wired to setViewerDoc', () => {
    const view = read('app/admin/research/components/ResearchRunView.tsx');
    const row = view.slice(view.indexOf('className="rrv__doc-view"') - 200, view.indexOf('rrv__doc-source'));
    expect(row).toContain('onClick={() => setViewerDoc(d)}');
    expect(row).toContain('data-testid="rrv-doc-view"');
    expect(row).toContain('>View');
    // only when the file has actually landed — no dead button on a row still uploading
    expect(view).toMatch(/\{url && \(\s*<button\s+type="button"\s+className="rrv__doc-view"/);
  });
});

describe('buttons the audit found unwired', () => {
  it('a corrected parcel ID survives the re-run PATCH', () => {
    const route = read('app/api/admin/research/route.ts');
    expect(route).toContain('if (updates.parcel_id !== undefined) allowed.parcel_id');
    expect(read('app/admin/research/[projectId]/page.tsx')).toContain('parcel_id: input.parcelId');
  });
  it('the stat tiles land on Review before scrolling, so they work from every stage', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    const fn = page.slice(page.indexOf('const scrollToReview = useCallback('), page.indexOf('const scrollToReview = useCallback(') + 900);
    expect(fn).toContain("setViewStage('review');");
  });
  it('the dialog input is consumed when the run starts, so a later plain Start uses what was typed', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    const start = page.slice(page.indexOf('onPipelineStart={() => {'), page.indexOf('onPipelineStart={() => {') + 400);
    expect(start).toContain('setPendingRunInput(null);');
  });
  it('the leads panel reports a failed load instead of rendering it as "no leads"', () => {
    const panel = read('app/admin/research/[projectId]/_sections/DiscoveredLeadsPanel.tsx');
    expect(panel).toContain('Could not load the saved leads');
    expect(panel).not.toContain('} catch { /* ignore */ }');
  });
});
