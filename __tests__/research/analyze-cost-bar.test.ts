import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// R3/U1 — the analyze run's live spend vs cap is exposed by getAnalysisStatus and shown by
// RunAiReviewControl.
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('analyze cost is exposed + surfaced', () => {
  it('getAnalysisStatus returns estimatedCostUsd + costCapUsd from analysis_metadata', () => {
    const svc = read('lib/research/analysis.service.ts');
    expect(svc).toMatch(/estimatedCostUsd\?: number/);
    expect(svc).toMatch(/estimated_cost_usd === 'number' \? \{ estimatedCostUsd/);
    expect(svc).toMatch(/costCapUsd: \(metadata\.cost_cap_usd/);
  });
  it('RunAiReviewControl polls status and shows spend vs cap', () => {
    const ctrl = read('app/admin/research/components/RunAiReviewControl.tsx');
    expect(ctrl).toMatch(/data-testid="ai-review-progress"/);
    expect(ctrl).toMatch(/j\.estimatedCostUsd/);
    expect(ctrl).toMatch(/spent.*of \$/);
  });
});
