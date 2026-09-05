import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeRequestBody } from '@/app/admin/research/components/RunAiReviewControl';

// Plan GATHER_AND_REVIEW_SPLIT U4 — the Review-stage "Run AI Review" control. In the two-run model
// the analysis is a SEPARATE run the operator starts here with its OWN cost cap. This pins the cap
// payload (which the analyze route enforces, R1) and that the control is actually mounted.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('analyzeRequestBody — the cost cap the control sends', () => {
  it('sends the chosen cap', () => {
    expect(analyzeRequestBody(5)).toEqual({ maxCostUsd: 5 });
  });

  it('clamps to the route range (0–100) and keeps a $0 estimate-only cap', () => {
    expect(analyzeRequestBody(250)).toEqual({ maxCostUsd: 100 });
    expect(analyzeRequestBody(-3)).toEqual({ maxCostUsd: 0 });
    expect(analyzeRequestBody(0)).toEqual({ maxCostUsd: 0 });
  });

  it('treats a non-finite input as $0 rather than sending NaN', () => {
    expect(analyzeRequestBody(NaN)).toEqual({ maxCostUsd: 0 });
  });
});

describe('the control posts the cap to the analyze route', () => {
  const src = read('app/admin/research/components/RunAiReviewControl.tsx');
  it('POSTs analyzeRequestBody to /analyze', () => {
    expect(src).toMatch(/\/api\/admin\/research\/\$\{projectId\}\/analyze/);
    expect(src).toMatch(/method: 'POST'/);
    expect(src).toMatch(/JSON\.stringify\(analyzeRequestBody\(maxCost\)\)/);
  });
});

describe('the Review stage mounts the control (wired, not just authored)', () => {
  const page = read('app/admin/research/[projectId]/page.tsx');
  it('imports and renders RunAiReviewControl in the review stage', () => {
    expect(page).toMatch(/import RunAiReviewControl from '\.\.\/components\/RunAiReviewControl'/);
    expect(page).toMatch(/<RunAiReviewControl projectId=\{projectId\}/);
  });
});
