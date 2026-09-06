import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Plan 1.4/1.7 — the free-first cross-source engine must actually be INVOKED by the live run, not just
// imported. This checks the CALLER (index.ts's early buy), the recurring "authored but not wired"
// defect this repo keeps hitting.

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'),
  'utf8',
);
const stripped = src
  .split(/\r?\n/)
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n');

describe('the early buy runs the free-first engine (plan 1.4)', () => {
  const fnStart = stripped.indexOf('async function runEarlyChecklistPurchase');
  const fn = stripped.slice(fnStart, fnStart + 8000);

  it('the early-buy function exists and is called from onPropertyIdentified', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(stripped).toContain('await runEarlyChecklistPurchase(identified)');
  });

  it('it discovers across sources with the live per-source search', () => {
    expect(fn).toContain('makeSourceSearch(');
    expect(fn).toContain('discoverAcrossSources(');
    expect(fn).toContain('clusterEntries(');
    expect(fn).toContain('planAcquisition(');
  });

  it('it feeds the CAD deed history as the free manifest, so it buys paid-EXCLUSIVE', () => {
    expect(fn).toContain('knownFreeDocuments');
    expect(fn).toContain('clerkDocToManifest(');
    // Only the plan's `purchase` actions become recommendations to buy.
    expect(fn).toContain("a.kind === 'purchase'");
  });

  it('it still buys through the orchestrator (ledger + library + gate)', () => {
    expect(fn).toContain('resolvePurchasePermission(projectId)');
    expect(fn).toContain('new DocumentPurchaseOrchestrator(projectId)');
    expect(fn).toContain('.executePurchases(');
  });

  it('it builds the discovery target from owner + supplemental + CAD instruments', () => {
    expect(fn).toContain('buildDiscoveryTarget(');
    expect(fn).toContain('knownInstruments');
  });

  it('it RANKS the paid candidates by relevance (id/address main), never rejecting (plan 1.5)', () => {
    // The searches are already property-scoped, so relevance only ORDERS the buy — most-relevant
    // first — it never drops a candidate for a missing supplemental key (the grain-of-salt rule).
    expect(fn).toContain('documentRelevance(');
    expect(fn).toContain('.sort(');
    expect(fn).toContain('relevanceOf(');
  });
});
