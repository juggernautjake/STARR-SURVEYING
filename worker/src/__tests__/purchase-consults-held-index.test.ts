// The purchase step must actually CONSULT the index (plan S-13/S-14).
//
// `document-identity.ts` and `research-modes.ts` were both written, exported and unit-tested, and
// then had zero callers anywhere in the worker for a day — the authored-but-not-wired shape this
// repo keeps producing. A correct dedup rule that nothing invokes prevents no spending at all, and
// unit tests of the rule pass either way, which is what makes the gap so easy to miss.
//
// So these assertions are about the ORCHESTRATOR, not the rule: given a document already held, does
// executePurchases decline to buy it, and does it say so in the report?

import { describe, it, expect, vi, beforeEach } from 'vitest';

// No browser, no vendor session, no network. The point is the decision made before any of that.
vi.mock('playwright', () => ({
  chromium: { launch: vi.fn(async () => { throw new Error('no browser in tests'); }) },
}));

// The ledger is the OTHER duplicate check. Stubbed to "not owned" so anything skipped below was
// skipped by the index rather than by the ledger — otherwise this test would pass without the
// wiring it exists to prove.
vi.mock('../services/purchase-ledger.js', () => ({
  findOwned: vi.fn(async () => ({ owned: null, lookupFailed: false })),
  recordPurchase: vi.fn(async () => ({ ok: true })),
  summariseSavings: vi.fn(() => ({ reused: 0, savedUsd: 0 })),
}));

import { DocumentPurchaseOrchestrator } from '../services/document-purchase-orchestrator.js';
import { DocumentIndex } from '../research/document-identity.js';
import type { PurchaseRecommendation } from '../types/confidence.js';

const REC: PurchaseRecommendation = {
  documentType: 'plat',
  instrument: '2019-3389',
  source: 'kofile',
  county: 'Bell',
  recordingDate: '03/14/2019',
  estimatedCost: '$6-12',
  confidenceImpact: '+12 overall',
  callsImproved: 4,
  reason: 'Unwatermarked plat resolves watermark-ambiguous readings.',
  priority: 1,
  roi: 2,
};

const CONFIG = { budget: 25, autoReanalyze: false };

function heldIndexWith(instrument: string, date: string): DocumentIndex {
  const index = new DocumentIndex();
  index.register(
    { county: 'Bell', instrumentNumber: instrument, recordingDate: date, vendor: 'kofile' },
    'free',
  );
  return index;
}

describe('executePurchases consults the held index before spending', () => {
  let orchestrator: DocumentPurchaseOrchestrator;

  beforeEach(() => {
    orchestrator = new DocumentPurchaseOrchestrator('test-project');
  });

  it('does not buy a document the free pass already returned', async () => {
    const report = await orchestrator.executePurchases(
      'test-project',
      [REC],
      CONFIG,
      '48027',
      'Bell',
      heldIndexWith('2019-3389', '03/14/2019'),
    );

    expect(report.purchases).toHaveLength(1);
    expect(report.purchases[0].status).toBe('already_owned');
    expect(report.purchases[0].totalCost).toBe(0);
    expect(report.billing.totalCharged).toBe(0);
  });

  it('recognises the same document under another vendor s numbering', async () => {
    // Held as Tyler Eagle's 20193389; recommended as Kofile's 2019-3389. One document.
    const report = await orchestrator.executePurchases(
      'test-project',
      [REC],
      CONFIG,
      '48027',
      'Bell',
      heldIndexWith('20193389', '2019-03-14'),
    );
    expect(report.purchases[0].status).toBe('already_owned');
  });

  it('reports what the index did, both sides of it', async () => {
    const report = await orchestrator.executePurchases(
      'test-project',
      [REC],
      CONFIG,
      '48027',
      'Bell',
      heldIndexWith('2019-3389', '03/14/2019'),
    );

    expect(report.identity).toBeDefined();
    expect(report.identity!.skippedAlreadyHeld).toBe(1);
    expect(report.identity!.boughtUnderUncertainty).toBe(0);
    expect(report.identity!.summary).toContain('skipped as already held');
  });

  it('does NOT skip a document held only in a different county', async () => {
    const index = new DocumentIndex();
    index.register(
      { county: 'Travis', instrumentNumber: '2019-3389', recordingDate: '03/14/2019' },
      'free',
    );

    const report = await orchestrator.executePurchases(
      'test-project',
      [REC],
      CONFIG,
      '48027',
      'Bell',
      index,
    );
    // It will fail to buy (no credentials, no browser) — but it must not be SKIPPED as already held.
    expect(report.purchases[0].status).not.toBe('already_owned');
    expect(report.identity!.skippedAlreadyHeld).toBe(0);
  });

  it('counts a purchase made under uncertainty instead of hiding it', async () => {
    // Same county and instrument, different recording date. Instrument numbers restart in some
    // counties, so this may be a different document: buy it, and say that the reason was doubt.
    const report = await orchestrator.executePurchases(
      'test-project',
      [REC],
      CONFIG,
      '48027',
      'Bell',
      heldIndexWith('2019-3389', '06/02/1994'),
    );

    expect(report.purchases[0].status).not.toBe('already_owned');
    expect(report.identity!.boughtUnderUncertainty).toBe(1);
    expect(report.identity!.summary).toContain('bought under uncertainty');
  });

  it('omits the identity block entirely when no index was passed', async () => {
    // "Not checked" and "checked, found nothing" are different facts. A zeroed block would claim
    // the second while meaning the first.
    const report = await orchestrator.executePurchases(
      'test-project',
      [REC],
      CONFIG,
      '48027',
      'Bell',
    );
    expect(report.identity).toBeUndefined();
  });
});
