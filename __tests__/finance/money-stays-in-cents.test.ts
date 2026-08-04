// __tests__/finance/money-stays-in-cents.test.ts
//
// F9 — every money amount in `lib/finance` is an integer number of cents.
//
// ── WHY THIS, AND WHY NOW ───────────────────────────────────────────────────────────────────────
//
// `cost-recovery.ts` decides whether a sanitarian's fee was recovered exactly, under-billed, or
// billed at a margin — and the difference between "exact" and "off by a cent" is the difference
// between a pass-through and a taxable margin. Its 14 tests are thorough and cover every state.
//
// **They are also all written with round amounts.** $450 paid, $400 billed, $50 short. That is the
// natural way to write them and it is the reason a float bug would survive them: `450.10 - 400.10`
// is not `50` in IEEE 754, and no test above uses a value where that shows.
//
// Checked 2026-08-04: the code is correct. Every amount is in **integer cents** — `RecoveryLink`,
// `CostRecovery.paid`, `RecoveryResult`, `ar-aging` — and the only division is in a display helper
// (`dollars()`), applied at the edge. So the arithmetic cannot drift, by construction rather than by
// care.
//
// This test locks that, because the invariant is invisible in the tests that depend on it. Someone
// adding `amountUsd: number` to a finance type would break no existing assertion — every current
// test would still pass, and the first wrong number would appear on a real invoice with an odd cent
// in it.
//
// ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────────────────────────
//
// Field names are a proxy, not a proof: a `_cents` field could still be assigned a float. What this
// catches is the realistic mistake — introducing a dollars-denominated money field alongside the
// cents ones — not a deliberate misuse of a correctly named one.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeRecovery } from '@/lib/finance/cost-recovery';

const DIR = join(__dirname, '..', '..', 'lib', 'finance');
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

describe('F9 — money in lib/finance stays in integer cents', () => {
  it('found the finance modules', () => {
    // Vacuous-pass guard.
    expect(files.length).toBeGreaterThan(3);
  });

  it('declares no dollars-denominated money field', () => {
    // The realistic regression: a new field in dollars sitting beside the cents ones. Nothing would
    // fail today — the two would simply be added together somewhere later.
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(DIR, f), 'utf8');
      for (const m of src.matchAll(/^\s*(\w*(?:Usd|Dollars|dollars))\s*[?]?:\s*number/gm)) {
        offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(
      offenders,
      offenders.length
        ? `These declare a money amount in dollars. lib/finance keeps money in integer cents so the ` +
          `arithmetic cannot drift — $450.10 minus $400.10 is not $50 in floating point, and the ` +
          `cost-recovery tests all use round numbers, so nothing would catch it:\n  ` +
          offenders.join('\n  ')
        : undefined,
    ).toEqual([]);
  });

  it('recovers an exact match on amounts with odd cents', () => {
    // The case the existing suite cannot express with round numbers. If any of this were in dollars,
    // 45010 − 40010 would become 450.10 − 400.10 = 50.000000000000006 and "exact" would fail.
    const exact = computeRecovery({
      costCents: 45010,
      links: [{ invoiceId: 'i1', amountCents: 45010, voided: false }],
    });
    expect(exact.isNoNetGain, 'an exact recovery with odd cents was not recognised').toBe(true);
    expect(exact.deltaCents).toBe(0);
  });

  it('reports a one-cent shortfall as a shortfall, not as exact', () => {
    // The boundary the whole module turns on, at the resolution money actually has.
    const short = computeRecovery({
      costCents: 45010,
      links: [{ invoiceId: 'i1', amountCents: 45009, voided: false }],
    });
    expect(short.isNoNetGain).toBe(false);
    expect(short.deltaCents).toBe(-1);
  });

  it('sums several odd-cent links without drift', () => {
    // Three links that would each contribute a rounding error in dollars.
    const split = computeRecovery({
      costCents: 30003,
      links: [
        { invoiceId: 'i1', amountCents: 10001, voided: false },
        { invoiceId: 'i2', amountCents: 10001, voided: false },
        { invoiceId: 'i3', amountCents: 10001, voided: false },
      ],
    });
    expect(split.recoveredCents).toBe(30003);
    expect(split.isNoNetGain).toBe(true);
  });
});
