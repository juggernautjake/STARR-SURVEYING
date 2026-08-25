// Pillar A registration + §9.8 health dashboard — the two research helpers that had no caller.
//
// Research roadmap §8.1/§8.2/§8.5 and §9.8. `detectVendor()` (slice 6), `prefillAdapterFromTemplate()`
// (slice 10) and `rollupAdapterDashboard()` (slice 17) all shipped as tested pure modules and then sat
// there with nothing importing them outside their own tests. That is this repo's most common defect —
// authored but not wired — and a green unit test for the helper is exactly what hides it.
//
// So these assertions are deliberately about the WIRING, not about the algorithms. The algorithms have
// their own tests in adapter-draft.test.ts, vendor-detection.test.ts and dashboard-rollup.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';
import { iconForName } from '@/lib/admin/route-icons';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Comments stripped: several assertions below are about the absence of a call, and these files
 *  explain at length why it is absent. Matching prose would fail the test for saying the right thing. */
const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const SITES_ROUTE = 'app/api/admin/research/sites/route.ts';
const HEALTH_ROUTE = 'app/api/admin/research/adapter-health/route.ts';

describe('the registration route makes the slice-6 and slice-10 helpers a feature', () => {
  const src = code(read(SITES_ROUTE));

  it('calls the vendor detector rather than re-deriving detection', () => {
    expect(src).toContain('detectVendor(');
    expect(src).toContain("from '@/lib/research/vendor-detection'");
  });

  it('pre-fills a new adapter from the vendor template', () => {
    expect(src).toContain('prefillAdapterFromTemplate(');
    expect(src).toContain('unresolvedPlaceholders(');
  });

  it('never touches the county’s website — detection is a regex, not a fetch', () => {
    // §8.3's probe drives a browser against a government portal. §9.9 requires that to be a
    // deliberate, flagged decision, not a side effect of somebody submitting a form.
    expect(src).not.toMatch(/\bplaywright\b/i);
    expect(src).not.toMatch(/\bfetch\(/);
  });

  it('gates registration to admins — it decides what coverage we promise customers', () => {
    expect(src).toContain('isAdmin(');
    expect(src).toMatch(/status: 403/);
  });

  it('claims no coverage it has not demonstrated', () => {
    // The adapter is saved as a draft (prefillAdapterFromTemplate's own default) and the coverage
    // rollup row is 'requested'. 'partial' would put an untested county on a customer-facing map.
    expect(src).toContain("coverage: 'requested'");
    expect(src).not.toContain("coverage: 'full'");
    expect(src).not.toContain("coverage: 'partial'");
  });

  it('says so when an adapter is saved without a canary, instead of staying quiet', () => {
    // Without a canary a broken portal and a quiet one are indistinguishable — §9.2.
    expect(src).toContain('research_adapter_canaries');
    expect(src).toMatch(/warnings\.push\(/);
  });

  it('turns the UNIQUE(county_id, site_type) collision into a sentence', () => {
    expect(src).toContain("'23505'");
    expect(src).toMatch(/status: 409/);
  });
});

describe('the health dashboard route reports failure instead of rendering an all-clear', () => {
  const src = code(read(HEALTH_ROUTE));

  it('calls the slice-17 rollup rather than aggregating in the handler', () => {
    expect(src).toContain('rollupAdapterDashboard(');
    expect(src).toContain("from '@/lib/research/dashboard-rollup'");
  });

  it('fails loudly when the registry cannot be read', () => {
    // §1.1b's defect, four times shipped: an errored query and an empty result look identical.
    expect(src).toContain('adapterRes.error');
    expect(src).toMatch(/status: 500/);
  });

  it('queries the same window the rollup reasons over', () => {
    // Feeding the rollup more history than its window means the same adapter scores differently
    // depending on how busy the checker has been.
    expect(src).toContain('RECENT_WINDOW_HOURS');
    expect(src).toContain('recentWindowHours: RECENT_WINDOW_HOURS');
  });

  it('reports how many checks ran, so "unknown" can be told from "healthy"', () => {
    expect(src).toContain('checksInWindow');
  });
});

describe('the panel and the page are reachable', () => {
  it('is reachable from the rail, Cmd+K and the mobile drawer', () => {
    // C11b (2026-08-25): `/admin/research/sites` is the Research portal's `sites` TAB now, so its own
    // registry row is gone and the route forwards. What this guards — the data-source screen is
    // OFFERED somewhere a person can find it — is asserted where it now lives: the portal has a row
    // in the right workspace with a real icon, and the portal declares the tab.
    const entry = ADMIN_ROUTES.find((r) => r.href === '/admin/research');
    expect(entry, '/admin/research is not in ADMIN_ROUTES').toBeTruthy();
    expect(entry!.workspace).toBe('research-cad');
    // The orphan sweep only asserts registration. This asserts the icon actually resolves: an
    // unmapped name silently falls back to a neutral Circle, which reads as "we chose Circle".
    expect(iconForName(entry!.iconName)).not.toBe(iconForName('__definitely_not_an_icon__'));
    // And the words somebody would type still find it — the row harvested the absorbed keywords.
    expect(entry!.keywords ?? []).toContain('data source');

    const portal = read('app/admin/research/page.tsx');
    expect(portal).toMatch(/id: 'sites'/);
    expect(portal).toMatch(/<SitesTab \/>/);
  });

  it('surfaces live health on the coverage page, beside the compile-time map', () => {
    const page = code(read('app/admin/research/_tabs/CoverageTab.tsx'));
    expect(page).toContain('AdapterHealthPanel');
  });

  it('distinguishes “never checked” from “healthy” on the panel', () => {
    const panel = code(read('app/admin/research/coverage/AdapterHealthPanel.tsx'));
    expect(panel).toContain('checksInWindow === 0');
    // And a fetch failure is not an all-clear either.
    expect(panel).toContain("state === 'failed'");
  });
});
