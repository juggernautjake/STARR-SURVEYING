import { describe, it, expect } from 'vitest';
import { ledgerSpendForRun } from '../infra/usage.js';

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
