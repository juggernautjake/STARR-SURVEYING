import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Plan W2/W4 — a dedicated-county run (Bell, …) produces a `county-specific` result and used to skip
// the ENTIRE purchase block, which lived only in the generic-pipeline branch. So a dedicated-county
// gather captured its free documents and bought NOTHING from TexasFile — the operator's TexasFile
// budget went unspent and no `document_purchase` ever reached the ledger.
//
// This checks the CALLER (the completion handler in index.ts), not that a helper imports its
// helpers: the county-specific branch must itself run the checklist purchase after its summary.

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'),
  'utf8',
);

describe('the county-specific completion branch buys the checklist documents', () => {
  it('runs a checklist purchase after the county-specific summary', () => {
    // `bellOutcome` is emitted only in the county-specific branch, so text after it is that branch.
    const bellIdx = src.indexOf('bellOutcome.sentence');
    expect(bellIdx).toBeGreaterThan(-1);
    const afterBell = src.slice(bellIdx);
    // A SECOND, distinct purchase (the generic one sits far earlier, inside confidence scoring).
    expect(afterBell).toContain('wantsToPurchaseRecommendations(');
    expect(afterBell).toContain('.executePurchases(');
  });

  it('keys the search on the owner the run discovered, not only the entered value', () => {
    const afterBell = src.slice(src.indexOf('bellOutcome.sentence'));
    const block = afterBell.slice(0, afterBell.indexOf('Capture live logs NOW'));
    // Without a real name a `search_required` want submits an empty TexasFile form and buys nothing.
    expect(block).toContain('r.property?.ownerName');
  });

  it('gates on gatherSelections and honours the TexasFile budget ceiling', () => {
    const afterBell = src.slice(src.indexOf('bellOutcome.sentence'));
    const block = afterBell.slice(0, afterBell.indexOf('Capture live logs NOW'));
    // No longer gated on the checklist being PRESENT — an absent one resolves to the default (2026-09-06).
    expect(block).toContain('resolveGatherSelections(runSettings)');
    expect(block).not.toContain('if (runSettings.gatherSelections) {');
    expect(block).toContain('runSettings.texasfileBudgetUsd');
  });
});
