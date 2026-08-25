// __tests__/design/conformance-per-state.test.ts
//
// V5 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── THE FAILURE THIS FILE IS ABOUT ──────────────────────────────────────────────────────────────
//
// V4 gave a tabbed route one default PER TAB. The conformance endpoint still asked for "the route's
// default" with `.maybeSingle()`, which errors the moment there is more than one row — so it
// returned null, produced no reports, and the sweep printed:
//
//     [  1/1] /admin/billing        ✓
//     ── 1 page(s) compared · 0 default(s) no longer 1:1 ──
//
// A tick, an empty score, and a summary line saying nothing was wrong. **A conformance run that
// cannot find the design reads exactly like one that found no problem**, and nobody investigates a
// pass. Every tabbed route in the product was silently unchecked, and the check that exists to catch
// drift was the thing that had drifted.
//
// Found by running it against /admin/billing right after V4 and noticing the score was missing —
// not by any test, which is why these exist.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const API = fs.readFileSync(path.join(ROOT, 'app/api/admin/design/conformance/route.ts'), 'utf8');
const SWEEP = fs.readFileSync(path.join(ROOT, 'scripts/check-design-conformance.mjs'), 'utf8');

describe('the endpoint asks for one design, not "the route\'s"', () => {
  it('scopes the default lookup to a state', () => {
    expect(API).toMatch(/async function defaultFor\(route: string, stateKey = ''\)/);
    expect(API).toMatch(/\.eq\('route', route\)\.eq\('state_key', stateKey\)\.eq\('status', 'default'\)/);
  });

  it('takes the state from the caller', () => {
    expect(API).toMatch(/stateKey\?: string;/);
    expect(API).toMatch(/const stateKey = typeof body\.stateKey === 'string' \? body\.stateKey : '';/);
  });

  it('refuses to answer "active" for a state it cannot resolve one for', () => {
    // `resolveActive` has no notion of a state. Asking it about a tab would answer with the ROUTE's
    // active design and label the report as being about the tab — the same lie `defaultFor` had,
    // and worse, because it produces a plausible SCORE rather than an empty one.
    const block = API.slice(API.indexOf("if (which === 'active'"));
    expect(block).toMatch(/if \(!stateKey\) \{/);
  });

  it('says which tab it has no default for', () => {
    // "This page has no default traced yet" is wrong and confusing when five of its six tabs have
    // one. The note names the tab.
    expect(API).toMatch(/no default traced\$\{stateKey \? ` for the "\$\{stateKey\}" tab` : ''\} yet/);
  });
});

describe('the sweep walks pairs, not routes', () => {
  it('builds (route, state) pairs from the designs', () => {
    expect(SWEEP).toMatch(/const pairs = \[\.\.\.new Map\(designs/);
    expect(SWEEP).toMatch(/\$\{d\.route\}\\u0000\$\{d\.stateKey \?\? ''\}/);
  });

  it('dedupes them, because active + default on one route is one page to walk', () => {
    expect(SWEEP).toMatch(/new Map\(/);
    expect(SWEEP).toMatch(/\.values\(\)\]/);
  });

  it('opens the tab, and refuses to capture when it did not get there', () => {
    // A capture of the WRONG tab compared against the RIGHT tab's default reports a page that has
    // changed beyond recognition. A wrong score is worse than no score: it sends somebody to
    // re-trace a page that was never wrong.
    expect(SWEEP).toMatch(/if \(!await openState\(page, BASE, route, \{ key: stateKey \}\)\)/);
    expect(SWEEP).toMatch(/could not open the "\$\{stateKey\}" tab/);
  });

  it('uses the one shared opener rather than its own copy of it', () => {
    // V6. This file, the tracer and the deriver all have to put a page into a tab and prove they
    // got there. Three copies of that rule is the exact setup that has cost this session four
    // bugs — two ends answering one question differently, and the disagreement surfacing as an
    // EMPTY rather than an error. `openState` lives next to `SELECTED_STATE`, which is the rule it
    // has to agree with.
    expect(SWEEP).toMatch(/import \{ waitForPageReady, openState \}/);
    expect(SWEEP).not.toMatch(/querySelectorAll\('button, a, \[role="tab"\]'\)/);
  });

  it('keys the record by the pair', () => {
    // Keyed by route alone, /admin/settings would write six times and the file would keep whichever
    // tab finished last — a record that looks complete and describes one tab.
    expect(SWEEP).toMatch(/record\.routes\[label\] = body\.reports\.map/);
    expect(SWEEP).not.toMatch(/record\.routes\[route\]/);
  });

  it('filters --since on the pair\'s route', () => {
    // `scoped` holds objects now; `changed.has(pairObject)` would be false for everything and
    // `--since` would silently compare nothing. Same shape as the `--stale` bug two slices ago.
    expect(SWEEP).toMatch(/scoped\.filter\(\(r\) => changed\.has\(r\.route\)\)/);
  });
});
