import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeFileBody } from '@/app/admin/research/components/AnalysisEstimatePanel';

// Plan GATHER_AND_REVIEW_SPLIT E3b — the per-file price + "Analyze this" button. The button must
// send the file's own quoted price as the cap so a single-file analysis costs what was shown.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('analyzeFileBody — the per-file analyze payload', () => {
  it('sends the document + its price as the cap', () => {
    expect(analyzeFileBody('doc-1', 2.5)).toEqual({ documentId: 'doc-1', maxCostUsd: 2.5 });
  });
  it('clamps to the route range and treats a bad price as $0', () => {
    expect(analyzeFileBody('d', 500)).toEqual({ documentId: 'd', maxCostUsd: 100 });
    expect(analyzeFileBody('d', -1)).toEqual({ documentId: 'd', maxCostUsd: 0 });
    expect(analyzeFileBody('d', NaN)).toEqual({ documentId: 'd', maxCostUsd: 0 });
  });
});

describe('the panel is wired to the estimate + analyze routes', () => {
  const src = read('app/admin/research/components/AnalysisEstimatePanel.tsx');
  it('fetches the E2 estimate and POSTs per-file analyze with the price cap', () => {
    expect(src).toMatch(/\/api\/admin\/research\/\$\{projectId\}\/analysis-estimate/);
    expect(src).toMatch(/\/api\/admin\/research\/\$\{projectId\}\/analyze/);
    expect(src).toMatch(/analyzeFileBody\(q\.documentId, q\.costUsd\)/);
  });
});

describe('the Review stage mounts the panel', () => {
  const page = read('app/admin/research/[projectId]/page.tsx');
  it('imports and renders AnalysisEstimatePanel', () => {
    expect(page).toMatch(/import AnalysisEstimatePanel from '\.\.\/components\/AnalysisEstimatePanel'/);
    expect(page).toMatch(/<AnalysisEstimatePanel projectId=\{projectId\}/);
  });
});
