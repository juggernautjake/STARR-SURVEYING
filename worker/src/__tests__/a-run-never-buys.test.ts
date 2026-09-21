/**
 * A run never buys. A person buys.
 *
 * Owner, 2026-09-21: "we only download and post the free files, but we make the purchasable files
 * available to be purchased individually if the researcher wants to do that... This way we will not
 * run into unnecessary purchases or over spending against the budget or purchasing a document that
 * is a duplicate of a free document we already have."
 *
 * Job 26144 is the case. The early pass called `executePurchases` before a single clerk search had
 * run — the one moment it knew least, unable to tell whether the plat it was buying duplicated one
 * the free pass was about to fetch for nothing. It bought a $10 plat against a $2 run ceiling, the
 * cost watchdog fired, and the run died having read nothing. The purchase was correct. Nobody had
 * asked for it.
 *
 * The rule lives in the orchestrator because that is the only function in the worker that spends
 * money. At the call sites it would be three places to get right and a fourth added later that is
 * not.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DocumentPurchaseOrchestrator } from '../services/document-purchase-orchestrator.js';
import type { PurchaseRecommendation } from '../types/confidence.js';

const rec = (instrument: string): PurchaseRecommendation => ({
  documentType: 'plat', instrument, source: 'texasfile',
  estimatedCost: '$10', confidenceImpact: '', callsImproved: 0,
  reason: 'Only TexasFile has it.', priority: 1, roi: 1,
} as PurchaseRecommendation);

describe('the choke point', () => {
  it('buys nothing when no operator approved it', async () => {
    const o = new DocumentPurchaseOrchestrator('p1');
    const report = await o.executePurchases(
      'p1', [rec('1979010700'), rec('2015084337')],
      { budget: 25, autoReanalyze: false } as never, '48491', 'Williamson');

    expect(report.billing.totalCharged, 'not one cent').toBe(0);
    expect(report.purchases).toHaveLength(2);
    expect(report.purchases.every((p) => p.status === 'offered')).toBe(true);
  });

  it('reports what it WOULD have bought rather than nothing', async () => {
    // A run that found two buyable documents and reports zero of anything has told the operator
    // that none exist — the opposite of what it learned.
    const o = new DocumentPurchaseOrchestrator('p2');
    const report = await o.executePurchases(
      'p2', [rec('A'), rec('B'), rec('C')],
      { budget: 25, autoReanalyze: false } as never, '48491', 'Williamson');
    expect(report.purchases.map((p) => p.instrument)).toEqual(['A', 'B', 'C']);
  });

  it('does not mark an offer as an error', async () => {
    // `offered` is not a failure and must not render beside genuine retrieval problems.
    const o = new DocumentPurchaseOrchestrator('p3');
    const report = await o.executePurchases(
      'p3', [rec('A')], { budget: 25, autoReanalyze: false } as never, '48491', 'Williamson');
    expect(report.errors).toEqual([]);
    expect(report.purchases[0]!.error).toBeUndefined();
  });

  it('charges nothing even when the budget is generous', async () => {
    const o = new DocumentPurchaseOrchestrator('p4');
    const report = await o.executePurchases(
      'p4', [rec('A')], { budget: 10_000, autoReanalyze: false } as never, '48491', 'Williamson');
    expect(report.billing.totalCharged).toBe(0);
    expect(report.billing.remainingBalance).toBe(10_000);
  });
});

describe('no in-run site asks for approval', () => {
  const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('the research run never sets operatorApproved', () => {
    // Only the endpoint behind the purchase button may, and it is not in this file's run path.
    const runPath = index.slice(0, index.indexOf('const researchInput: CountyResearchInput'));
    expect(runPath).not.toContain('operatorApproved');
  });

  it('the early pass records offers instead of buying', () => {
    const at = index.indexOf('async function runEarlyChecklistPurchase');
    const fn = index.slice(at, index.indexOf('\n  }\n', at));
    expect(fn).toContain('await recordOffers(');
    expect(fn).not.toContain('.executePurchases(');
  });
});
