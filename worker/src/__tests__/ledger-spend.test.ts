import { describe, it, expect } from 'vitest';
import { ledgerSpendForRun, ledgerSpendByBucket, describeSpendByBucket } from '../infra/usage.js';

// Plan RESEARCH_SYSTEM_COMPLETION F2 — the reported spend must be the LEDGER truth (all phases), not
// the worker's in-memory accumulator which misses app-side analysis. The 2026-09-05 session found the
// UI showing $1.82 (worker) while research_usage_events held $3.13 (worker + app). ledgerSpendForRun
// sums the ledger so nothing is invisible.

describe('ledgerSpendForRun', () => {
  it('sums cost_usd across all ledger rows for the project', async () => {
    const rows = [{ cost_usd: 1.82 }, { cost_usd: 1.31 }]; // worker phase + app analysis
    const total = await ledgerSpendForRun('p1', async () => rows);
    expect(total).toBe(3.13);
  });

  it('coerces string/null costs and handles an empty ledger', async () => {
    expect(await ledgerSpendForRun('p1', async () => [{ cost_usd: '0.5' }, { cost_usd: null }, { cost_usd: 0.25 }])).toBe(0.75);
    expect(await ledgerSpendForRun('p1', async () => [])).toBe(0);
  });

  it('rounds to the cost precision (6dp) rather than leaking float error', async () => {
    const total = await ledgerSpendForRun('p1', async () => [{ cost_usd: 0.1 }, { cost_usd: 0.2 }]);
    expect(total).toBe(0.3);
  });
});

describe('ledgerSpendByBucket — the two metered budgets (2026-09-06)', () => {
  const rows = [
    { cost_usd: 3, event_type: 'document_purchase', metadata: { platform: 'texasfile' } },
    { cost_usd: 10, event_type: 'document_purchase', metadata: { platform: 'texasfile:Bell' } },
    { cost_usd: 1, event_type: 'document_purchase', metadata: { platform: 'kofile_pay' } },
    { cost_usd: 0.42, event_type: 'ai_call', metadata: { site: 'deed-analyzer' } },
    { cost_usd: '0.08', event_type: 'captcha_solve', metadata: null },
  ];

  it('puts TexasFile purchases on the TexasFile meter and everything else on the other one', async () => {
    const b = await ledgerSpendByBucket('p1', async () => rows);
    expect(b.texasfileUsd).toBe(13);
    expect(b.otherUsd).toBe(1.5);
    expect(b.totalUsd).toBe(14.5);
  });

  it('does not mistake an AI call that MENTIONS TexasFile for a purchase', async () => {
    const b = await ledgerSpendByBucket('p1', async () => [{ cost_usd: 1, event_type: 'ai_call', metadata: { platform: 'texasfile' } }]);
    expect(b.texasfileUsd).toBe(0);
    expect(b.otherUsd).toBe(1);
  });

  it('describes both meters against the ceilings the operator set', async () => {
    const b = await ledgerSpendByBucket('p1', async () => rows);
    expect(describeSpendByBucket(b, { texasfileBudgetUsd: 15, otherBudgetUsd: 5 }))
      .toBe('Spend by budget — TexasFile $13.00 of the $15.00 budget; other sources $1.50 of the $5.00 budget (total $14.50).');
    expect(describeSpendByBucket(b)).toBe('Spend by budget — TexasFile $13.00; other sources $1.50 (total $14.50).');
  });
});
