// The other-sources budget was "only summed into the cap, not metered separately" (2026-09-06 audit,
// plan 6.7 note). These guards check the CALLERS: the orchestrator gates every non-TexasFile vendor
// on the second meter and reports both, the three in-run purchase sites hand the budget over, and
// the run finish settles the two meters from the ledger onto the run record.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('the orchestrator meters non-TexasFile vendors on the other-sources budget', () => {
  const src = read('services/document-purchase-orchestrator.ts');

  it('builds the budget plan with the other-sources ceiling it was given', () => {
    expect(src).toContain('otherBudgetUsd: config.otherBudgetUsd');
  });
  it('gates EVERY Kofile buy through the other-vendor meter (no bare purchaseDocument call)', () => {
    expect(src).toContain("buyFromOtherVendor('kofile', () => kofile.purchaseDocument(");
    expect(src).not.toMatch(/result = await kofileAdapter\.purchaseDocument\(/);
    expect(src).toContain('mayBuyFromOtherSource(gatherBudgetPlan, otherSpend, estDocCost)');
  });
  it('books a successful buy against the other meter, not the TexasFile one', () => {
    expect(src).toContain('otherSpend += r.totalCost ?? 0;');
  });
  it('reports both meters and returns them on the billing summary', () => {
    expect(src).toContain('describeGatherSpend(gatherBudgetPlan, texasFileSpend, otherSpend');
    expect(src).toContain('otherSourcesSpend: Math.round(otherSpend * 100) / 100');
  });
});

describe('the run hands the other-sources budget to every in-run purchase site', () => {
  const src = read('index.ts');
  it('passes otherBudgetUsd at the three in-run executePurchases sites', () => {
    const count = src.split('otherBudgetUsd: runSettings.otherBudgetUsd').length - 1;
    expect(count).toBe(3);
  });
  it('settles both meters from the ledger at run finish, onto the run record', () => {
    expect(src).toContain('const buckets = await ledgerSpendByBucket(projectId);');
    expect(src).toContain('metersLine = describeSpendByBucket(buckets, runSettings);');
    expect(src).toContain("budgetSummary: [windDown, metersLine].filter((s): s is string => !!s).join(' ') || null");
  });
});

describe('the app reads the same split', () => {
  it('the run console splits TexasFile from other sources and the route selects the vendor', () => {
    const console_ = fs.readFileSync(path.join(here, '..', '..', '..', 'lib', 'research', 'run-console.ts'), 'utf8');
    expect(console_).toContain('export function isTexasFileSpend(');
    expect(console_).toContain('texasfileUsd: texasfile, otherUsd: other');
    const route = fs.readFileSync(path.join(here, '..', '..', '..', 'app', 'api', 'admin', 'research', '[projectId]', 'run-console', 'route.ts'), 'utf8');
    expect(route).toContain("select('event_type, cost_usd, model, created_at, metadata')");
  });
  it('the per-project cost route returns texasfileUsd + otherUsd and the badge shows TexasFile', () => {
    const route = fs.readFileSync(path.join(here, '..', '..', '..', 'app', 'api', 'admin', 'research', '[projectId]', 'cost', 'route.ts'), 'utf8');
    expect(route).toContain('texasfileUsd: round4(texasfileUsd)');
    expect(route).toContain('otherUsd: round4(totalUsd - texasfileUsd)');
    const badge = fs.readFileSync(path.join(here, '..', '..', '..', 'app', 'admin', 'research', 'components', 'ProjectCostBadge.tsx'), 'utf8');
    expect(badge).toContain('cost.texasfileUsd');
  });
});
