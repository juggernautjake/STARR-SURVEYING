import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan RESEARCH_SYSTEM_COMPLETION W2 (live) — when the operator picked what to find, the run buys
// THOSE from TexasFile (plats first), not only what a discrepancy flagged. Assert the pipeline wires
// the checklist into the purchase phase, gated on an explicit gatherSelections.
const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

describe('the checklist drives the purchase phase', () => {
  it('builds selection purchase recs from the run settings and prepends them', () => {
    expect(index).toMatch(/if \(runSettings\.gatherSelections\)/);
    expect(index).toMatch(/wantsToPurchaseRecommendations\(\s*selectionsToWants\(resolveGatherSelections\(runSettings\)\)/);
    expect(index).toMatch(/recs = \[\.\.\.selRecs, \.\.\.recs\]/);
  });
  it('leaves the recs list mutable and only injects when a selection exists', () => {
    expect(index).toMatch(/let recs = report\.documentPurchaseRecommendations/);
  });
});
