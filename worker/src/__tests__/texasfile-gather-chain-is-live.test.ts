import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan GATHER_AND_REVIEW_SPLIT — the finding that TexasFile-in-gather is LIVE via the existing
// pipeline, not only the separate purchase endpoint. This locks the full chain so a refactor can't
// quietly unwire it:
//   main pipeline -> DocumentPurchaseOrchestrator -> texasfile adapter -> buyDocument -> file to Review
// The two halves are also covered by the-run-can-buy-documents (pipeline->orchestrator) and
// texasfile-buy-is-wired (orchestrator->buyDocument); this asserts they meet in one place.

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');
const index = read('index.ts');
const adapter = read('services/purchase-adapters/texasfile-purchase-adapter.ts');

describe('the gather run buys from TexasFile through the main pipeline', () => {
  it('the pipeline constructs the purchase orchestrator (not only the /purchase endpoint)', () => {
    // Both the auto-pipeline call and the endpoint call construct it; require at least the pipeline one.
    const count = (index.match(/new DocumentPurchaseOrchestrator\(/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2); // pipeline tail + POST /research/purchase
  });

  it('the TexasFile adapter buys via buyDocument and files for Review', () => {
    expect(adapter).toMatch(/\bbuyDocument\s*\(/);
    expect(adapter).toMatch(/uploadDocumentIncremental\s*\(/);
  });

  it('the buy is gated by the $10 earmark and the run runs no AI in gather', () => {
    expect(read('services/document-purchase-orchestrator.ts')).toMatch(/mayBuyFromTexasFile\(/);
    expect(index).toMatch(/if \(!shouldRunAnalysis\(runSettings\)\) return false;/);
  });
});
