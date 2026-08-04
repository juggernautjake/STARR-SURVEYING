// worker/src/__tests__/registry-summary-counts-routing.test.ts
//
// RESEARCH_PLATFORM_DEEP_BUILD R39b — "which counties can we do automatically?" must be answered by
// the thing that actually routes them.
//
// `registrySummary()` used to add up the configured FIPS sets. `getClerkSystem()` routes to a vendor
// only when `isVendorProven`, so for every unproven vendor the two disagreed — the vendor was
// credited with counties that fall through to TexasFile, and TexasFile's own figure was reduced by
// exactly those counties. Both errors point the same way: they make the fallback look smaller and
// the unproven vendors look real.
//
// That is not a cosmetic count. It is the number someone reads before telling a customer which
// counties the firm can research without a trip to a courthouse.

import { describe, it, expect } from 'vitest';
import {
  registrySummary,
  configuredCountyCounts,
  getClerkSystem,
  isVendorProven,
  type ClerkSystem,
} from '../services/clerk-registry.js';
import { TEXAS_COUNTIES } from '../lib/county-fips.js';

describe('the summary counts what routes', () => {
  it('accounts for every Texas county exactly once', () => {
    // A summary that does not sum to 254 has lost or double-counted somebody.
    const total = Object.values(registrySummary()).reduce((a, b) => a + b, 0);
    expect(total).toBe(254);
    expect(TEXAS_COUNTIES.length).toBe(254);
  });

  it('agrees with the router for every single county', () => {
    // The property that makes the two impossible to drift apart. Derived independently here rather
    // than by calling the same helper, so this is a check and not a restatement.
    const recount: Record<string, number> = {};
    for (const c of TEXAS_COUNTIES) {
      const sys = getClerkSystem(c.fips);
      recount[sys] = (recount[sys] ?? 0) + 1;
    }
    for (const [sys, n] of Object.entries(registrySummary())) {
      expect(`${sys}=${n}`).toBe(`${sys}=${recount[sys] ?? 0}`);
    }
  });

  it('credits an unproven vendor with ZERO counties, however many are configured', () => {
    // The bug, stated directly. Henschen has 16 counties written down and routes none of them —
    // every one of those 16 hostnames is ENOTFOUND (measured 2026-08-04 by
    // `worker/scripts/check-adapter-hosts.mjs`), so crediting them was doubly wrong.
    const summary = registrySummary();
    const configured = configuredCountyCounts();
    for (const sys of ['henschen', 'idocket', 'fidlar', 'countyfusion'] as const) {
      if (isVendorProven(sys)) continue; // if one is later proven, this stops applying to it
      expect(
        summary[sys],
        `${sys} is unproven, so getClerkSystem never returns it — but the summary claims ` +
          `${summary[sys]} counties. ${configured[sys]} are configured; that is a work list, not coverage.`,
      ).toBe(0);
    }
  });

  it('keeps the configured counts available, under a name that says what they are', () => {
    // Deleting them would lose the R38/R39 work list. The fix is honest naming, not amnesia:
    // Henschen's 16 configured counties are exactly what a proving pass has to work through.
    expect(configuredCountyCounts().henschen).toBeGreaterThan(0);
    expect(registrySummary().henschen).toBe(0);
  });

  it('does not shrink TexasFile by counties it actually serves', () => {
    // The second half of the same error. TexasFile is the universal fallback, so every county an
    // unproven vendor cannot serve is one TexasFile does — and the old arithmetic subtracted them.
    const summary = registrySummary();
    const unproven = (['henschen', 'idocket', 'fidlar', 'countyfusion'] as ClerkSystem[])
      .filter((s) => !isVendorProven(s));
    const configuredUnproven = unproven.reduce(
      (n, s) => n + configuredCountyCounts()[s as Exclude<ClerkSystem, 'texasfile'>], 0,
    );
    expect(configuredUnproven).toBeGreaterThan(0);       // there is something to get wrong
    expect(summary.texasfile).toBeGreaterThan(configuredUnproven);
  });
});
