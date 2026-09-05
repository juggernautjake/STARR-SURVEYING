import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan GATHER_AND_REVIEW_SPLIT E2 — the analysis price-quote endpoint. It must read the gathered
// documents' page counts and return the total + per-file quote from the shared estimator (E1), so
// the number the UI shows and the number a per-file button charges are the same rate. Assert the
// wiring (this is the real, non-test caller of analysis-estimate).

const route = fs.readFileSync(
  path.join(process.cwd(), 'app/api/admin/research/[projectId]/analysis-estimate/route.ts'),
  'utf8',
);

describe('the analysis-estimate route', () => {
  it('reads the shared E1 estimator, not a local rate', () => {
    expect(route).toMatch(/from '@\/lib\/research\/analysis-estimate'/);
    expect(route).toMatch(/estimateForDocuments\(/);
    expect(route).toMatch(/estimateAnalysis\(/);
    expect(route).toMatch(/ANALYSIS_RATE_USD_PER_PAGE/);
  });

  it('reads page_count off research_documents', () => {
    expect(route).toMatch(/from\('research_documents'\)/);
    expect(route).toMatch(/page_count/);
    expect(route).toMatch(/research_project_id/);
  });

  it('returns a total and a per-file breakdown', () => {
    expect(route).toMatch(/total:/);
    expect(route).toMatch(/perFile/);
    expect(route).toMatch(/documentId/);
  });

  it('requires auth', () => {
    expect(route).toMatch(/await auth\(\)/);
    expect(route).toMatch(/401/);
  });
});
