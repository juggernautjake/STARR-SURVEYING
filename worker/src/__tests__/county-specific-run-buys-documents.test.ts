import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Plan W2/W4 — a dedicated-county run (Bell, …) produces a `county-specific` result and used to skip
// the ENTIRE purchase block, which lived only in the generic-pipeline branch. So a dedicated-county
// gather captured its free documents and bought NOTHING from TexasFile — the operator's TexasFile
// budget went unspent and no `document_purchase` ever reached the ledger.
//
// 2026-09-07: both purchase passes moved INTO the run — one `finalPurchasePass` awaited before the
// filing window closes and the meters are read — because they used to run after "Research complete"
// (the screen said $0.00 while $3 of deeds were being bought). This checks the CALLER (the completion
// handler in index.ts): the county-specific branch of that function must run the checklist purchase.

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

/** The county-specific branch of `finalPurchasePass` (the `else` after the generic-pipeline branch). */
function countyBranch(): string {
  const start = src.indexOf('const finalPurchasePass = async');
  const end = src.indexOf('await finalPurchasePass();');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const fn = src.slice(start, end);
  const elseIdx = fn.indexOf('} else {\n          const r = ur.data;');
  expect(elseIdx).toBeGreaterThan(-1);
  return fn.slice(elseIdx);
}

describe('the county-specific branch of the final purchase pass buys the checklist documents', () => {
  it('runs a checklist purchase for a county-specific result, inside the run', () => {
    const block = countyBranch();
    // A SECOND, distinct purchase (the generic one sits in the other branch, inside confidence scoring).
    expect(block).toContain('wantsToPurchaseRecommendations(');
    expect(block).toContain('.executePurchases(');
    expect(block).toContain('county-specific checklist purchase failed');
    // And it is awaited BEFORE the filing window closes — the very next statement.
    expect(src).toMatch(/await finalPurchasePass\(\);\n\n      resetFlushClock\(projectId\);/);
  });

  it('keys the search on the owner the run discovered, not only the entered value', () => {
    // Without a real name a `search_required` want submits an empty TexasFile form and buys nothing.
    expect(countyBranch()).toContain('r.property?.ownerName');
  });

  it('carries the subject\'s subdivision AND lot/block so a name search cannot buy another lot\'s deed', () => {
    const block = countyBranch();
    expect(block).toContain('subdivision: r.property?.subdivisionName ?? undefined,');
    expect(block).toContain('lot: lotBlockOf(r.property).lot,');
    expect(block).toContain('block: lotBlockOf(r.property).block,');
  });

  it('gates on gatherSelections and honours the TexasFile budget ceiling', () => {
    const block = countyBranch();
    // No longer gated on the checklist being PRESENT — an absent one resolves to the default (2026-09-06).
    expect(block).toContain('resolveGatherSelections(runSettings)');
    expect(block).not.toContain('if (runSettings.gatherSelections) {');
    expect(block).toContain('runSettings.texasfileBudgetUsd');
  });
});
