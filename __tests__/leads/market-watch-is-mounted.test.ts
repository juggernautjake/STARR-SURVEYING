// The market watch is actually REACHED — not merely written.
//
// Asserts the CALLER, both directions of the chain:
//
//     LeadsTab  →  MarketWatchPanel  →  /api/admin/marketing/market-watch
//
// A test that only checked the panel's own imports would pass identically if nothing mounted the
// panel, which is the failure that cost an afternoon on 2026-08-27. See
// [[feedback_wiring_tests_must_check_the_caller]].

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('market watch is reachable from a page a person opens', () => {
  it('LeadsTab imports AND renders the panel', () => {
    const tab = read('app/admin/marketing/_tabs/LeadsTab.tsx');
    // Both halves: an unused import satisfies a grep for the name while rendering nothing.
    expect(tab).toMatch(/import\s+MarketWatchPanel\s+from\s+'\.\/MarketWatchPanel'/);
    expect(tab).toMatch(/<MarketWatchPanel\s*\/>/);
  });

  it('the panel calls a route that exists', () => {
    const panel = read('app/admin/marketing/_tabs/MarketWatchPanel.tsx');
    expect(panel).toContain('/api/admin/marketing/market-watch');
    // A fetch to a 404 is silent inside the panel's catch, so the file must really be there.
    expect(fs.existsSync(path.join(ROOT, 'app/api/admin/marketing/market-watch/route.ts'))).toBe(true);
  });

  it('the route is admin-gated, like its three siblings', () => {
    const route = read('app/api/admin/marketing/market-watch/route.ts');
    expect(route).toContain('isAdmin');
    expect(route).toMatch(/status:\s*401/);
    expect(route).toMatch(/status:\s*403/);
  });

  it('the panel renders the coverage note, not just the hits', () => {
    // The watch covers 11 of 46 service-area counties. A bounded sweep that does not say so reads as
    // "nothing is being platted" when it means "we looked at a quarter of it". The note must reach
    // the screen, which means the panel has to hold it in state and render it.
    const panel = read('app/admin/marketing/_tabs/MarketWatchPanel.tsx');
    expect(panel).toMatch(/setCoverage/);
    expect(panel).toMatch(/\{coverage\}/);
  });

  it('the route returns the coverage note on BOTH shapes of response', () => {
    // The list response and the search response. Returning it only on the list means it is missing
    // from exactly the response somebody reads results in.
    const route = read('app/api/admin/marketing/market-watch/route.ts');
    expect(route.match(/coverage:\s*coverageNote\(\)/g) ?? []).toHaveLength(2);
  });
});
