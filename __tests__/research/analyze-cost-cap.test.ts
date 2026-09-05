import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { estimateAnalysisCostUsd } from '@/lib/research/analysis.service';

// Plan GATHER_AND_REVIEW_SPLIT R1 — the analyze run is a SEPARATE run from the gather run and gets
// its own cost ceiling the operator sets in "Run AI Review". This pins the cost estimate the cap is
// enforced against, and that the loop + route are actually wired to it.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('estimateAnalysisCostUsd — an upper-bound estimate of analyze spend', () => {
  it('is zero for no tokens', () => {
    expect(estimateAnalysisCostUsd({ input: 0, output: 0 })).toBe(0);
  });

  it('grows with tokens and prices output dearer than input', () => {
    const smallInput = estimateAnalysisCostUsd({ input: 1_000_000, output: 0 });
    const smallOutput = estimateAnalysisCostUsd({ input: 0, output: 1_000_000 });
    expect(smallInput).toBeGreaterThan(0);
    // Opus pricing: output ($25/Mtok) is dearer than input ($5/Mtok).
    expect(smallOutput).toBeGreaterThan(smallInput);
  });

  it('prices a real-ish run in a sane dollar range', () => {
    // ~2M input + 200k output tokens across a handful of documents.
    const cost = estimateAnalysisCostUsd({ input: 2_000_000, output: 200_000 });
    expect(cost).toBeGreaterThan(1);
    expect(cost).toBeLessThan(100);
  });
});

describe('the analyze run enforces its own cost cap', () => {
  const svc = read('lib/research/analysis.service.ts');

  it('reads maxCostUsd off the config as the analyze cap', () => {
    expect(svc).toMatch(/config\?\.maxCostUsd/);
    expect(svc).toContain('analyzeCostCapUsd');
  });

  it('stops the document loop when the estimated spend reaches the cap', () => {
    expect(svc).toContain('estimateAnalysisCostUsd(tokenUsage)');
    expect(svc).toMatch(/spent >= analyzeCostCapUsd/);
  });

  it('the analyze route accepts and clamps a maxCostUsd from the operator', () => {
    const route = read('app/api/admin/research/[projectId]/analyze/route.ts');
    expect(route).toMatch(/body\.maxCostUsd/);
    expect(route).toMatch(/config\.maxCostUsd = Math\.min\(Math\.max\(body\.maxCostUsd, 0\), 100\)/);
  });
});
