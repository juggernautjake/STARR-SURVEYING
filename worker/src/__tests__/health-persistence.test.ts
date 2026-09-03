// Sensing a changed website, written down where the repair machinery reads (research plan R9).
//
// Owner: *"the system needs to be able to check and sense when a website has changed or been
// updated. Then it needs to adjust and self heal."*
//
// Both halves existed and could not reach each other. `SiteHealthMonitor` has always opened every
// county portal in Chromium on a timer and checked that the selectors an adapter depends on are
// still there — and thrown the answer into memory and a WebSocket, where it vanished on restart.
// The app's self-heal pipeline diagnoses breaks by reading `research_adapter_health_checks`, which
// had 0 rows, because nothing wrote to it.
//
// These tests pin the translation between the two vocabularies, which is where the judgement is.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FAILURES_BEFORE_STATUS_CHANGE,
  parseSiteId,
  toHealthCheck,
} from '../infra/health-persistence.js';
import type { SiteHealthResult } from '../infra/site-health-monitor.js';

const result = (over: Partial<SiteHealthResult> = {}): SiteHealthResult => ({
  siteId: 'kofile-bell',
  name: 'Kofile — Bell County',
  vendor: 'kofile',
  url: 'https://bell.tx.publicsearch.us',
  status: 'healthy',
  checkedAt: '2026-08-02T12:00:00.000Z',
  latencyMs: 820,
  selectors: [
    { selector: '#search-input', label: 'search box', required: true, found: true, count: 1 },
    { selector: '.results-table', label: 'results table', required: true, found: true, count: 1 },
  ],
  alerts: [],
  ...over,
} as SiteHealthResult);

describe('what the monitor saw, in the registry’s words', () => {
  it('a page whose required element is gone is BROKEN — the signal a repair can act on', () => {
    const row = toHealthCheck('adapter-1', result({
      selectors: [
        { selector: '#search-input', label: 'search box', required: true, found: false, count: 0 },
        { selector: '.results-table', label: 'results table', required: true, found: true, count: 1 },
      ],
    }));
    expect(row.status).toBe('broken');
    // The summary names the element, because "structure changed" sends somebody to read a diff and
    // "the search box is gone" sends them to the page.
    expect(row.diff_summary).toContain('search box');
    expect(row.diff_summary).toContain("site's structure changed");
  });

  it('an unreachable site is ERROR, not broken', () => {
    // There is nothing to diagnose from a timeout, and a repair proposal built on one is a guess.
    // County portals also go down for maintenance, which is not a code change.
    const row = toHealthCheck('adapter-1', result({
      status: 'down',
      alerts: [{ type: 'site_unreachable', severity: 'error', message: 'net::ERR_CONNECTION_TIMED_OUT' } as never],
    }));
    expect(row.status).toBe('error');
    expect(row.error_message).toContain('TIMED_OUT');
  });

  it('a missing OPTIONAL element is degraded, not broken', () => {
    const row = toHealthCheck('adapter-1', result({
      selectors: [
        { selector: '#search-input', label: 'search box', required: true, found: true, count: 1 },
        { selector: '.pager', label: 'pagination', required: false, found: false, count: 0 },
      ],
    }));
    expect(row.status).toBe('degraded');
    expect(row.diff_summary).toContain('Still usable');
  });

  it('a healthy check says how much it actually checked', () => {
    const row = toHealthCheck('adapter-1', result());
    expect(row.status).toBe('healthy');
    expect(row.diff_summary).toContain('all 2 selector(s) present');
  });

  it('writes the §9.1 structural layer in the shape the repair agent already expects', () => {
    // This is an INPUT to the existing pipeline, not a new format it would have to learn.
    const row = toHealthCheck('adapter-1', result({
      selectors: [{ selector: '.results-table', label: 'results table', required: true, found: false, count: 0 }],
    }));
    const structural = (row.layer_results as { structural: Record<string, unknown> }).structural;
    expect(structural.severity).toBe('major');
    expect(structural.missing_required).toEqual(['.results-table']);
  });

  it('keeps the probe’s own context, so a check can be reproduced', () => {
    const row = toHealthCheck('adapter-1', result());
    const probe = (row.layer_results as { probe: Record<string, unknown> }).probe;
    expect(probe).toMatchObject({ vendor: 'kofile', url: 'https://bell.tx.publicsearch.us' });
  });
});

describe('when the adapter itself changes status', () => {
  it('needs a RUN of failures, not one', () => {
    // County portals go down for maintenance on weeknights. Flipping a customer-facing coverage
    // claim on a single timeout makes the dashboard cry wolf, and a dashboard that cries wolf is
    // one nobody reads.
    expect(FAILURES_BEFORE_STATUS_CHANGE).toBeGreaterThanOrEqual(2);
  });

  it('recovers on the FIRST good check', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/infra/health-persistence.ts'), 'utf8');
    // Asymmetric on purpose: being wrong in this direction only costs a needless "we can't search
    // that county", so recovery should be fast and breakage slow.
    expect(src).toMatch(/nowHealthy && \(adapter\.status === 'broken' \|\| adapter\.status === 'degraded'\)/);
  });

  it('drops the resolve cache when a status changes, so a repair is not stale for a minute', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/infra/health-persistence.ts'), 'utf8');
    expect(src).toContain('invalidateAdapterCache()');
  });
});

describe('matching a probe to a registered adapter', () => {
  // ── THIS BLOCK USED TO TEST AN ID FORMAT NOTHING PRODUCES ───────────────────────────────────
  //
  // It asserted `kofile-bell` and `bell-bis`, the two examples in the function's own doc comment.
  // Both parse correctly and neither is ever emitted. `buildCheckList` — the only thing in the
  // worker that makes a site id — produces exactly three shapes, and every one of them resolved
  // wrongly while this file was green:
  //
  //   cad-48027-bis      → county "48027", looked up with .ilike('name', '48027')
  //   clerk-kofile-bell  → county "Clerk"
  //   clerk-texasfile    → county "Clerk"
  //
  // So no probe ever matched an adapter, nothing was written to
  // `research_adapter_health_checks`, and the self-heal pipeline that reads that table has never
  // seen a row. The tests below are written from `buildCheckList` outward.

  it('THE REAL FORMAT: a CAD id carries a FIPS, and a FIPS is returned as a FIPS', () => {
    // Not turned into a name. research_counties.fips is UNIQUE — an exact match beats an ilike
    // against free text, and "48027" was never going to match a name column anyway.
    expect(parseSiteId('cad-48027-bis', 'bis')).toEqual({
      fips: '48027', county: null, siteType: 'appraisal_cad', statewide: false,
    });
    expect(parseSiteId('cad-48027-esearch', 'esearch')?.fips).toBe('48027');
  });

  it('THE REAL FORMAT: a clerk id no longer resolves to a county named "Clerk"', () => {
    // "clerk" is a structural word in these ids. Its absence from the vendor-word list is the whole
    // bug: the finder took the first token that was not the vendor, and that token was "clerk".
    expect(parseSiteId('clerk-kofile-bell', 'kofile')).toEqual({
      fips: null, county: 'Bell', siteType: 'clerk_deeds', statewide: false,
    });
  });

  it('THE REAL FORMAT: a statewide source says so instead of inventing a county', () => {
    // TexasFile covers all 254 counties and has no row in research_counties. Returning null here
    // would be indistinguishable from a parse failure; `statewide` lets the caller tell them apart.
    expect(parseSiteId('clerk-texasfile', 'texasfile')).toEqual({
      fips: null, county: null, siteType: 'clerk_deeds', statewide: true,
    });
  });

  it('CONTROL: the formats the old comment described still parse', () => {
    // These were the only cases ever tested, and they were never wrong. Kept because the WebSocket
    // dashboard's ids are not this function's to change — and because if THIS breaks, a failure
    // above means the parser broke rather than the id format moving.
    expect(parseSiteId('kofile-bell', 'kofile')).toEqual({
      fips: null, county: 'Bell', siteType: 'clerk_deeds', statewide: false,
    });
    expect(parseSiteId('bell-bis', 'bis')).toEqual({
      fips: null, county: 'Bell', siteType: 'appraisal_cad', statewide: false,
    });
  });

  it('routes clerk vendors to deeds and everything else to the appraisal district', () => {
    expect(parseSiteId('fidlar-galveston', 'fidlar')?.siteType).toBe('clerk_deeds');
    expect(parseSiteId('tad-tarrant', 'tad')?.siteType).toBe('appraisal_cad');
  });

  it('returns null rather than guessing when it cannot tell', () => {
    expect(parseSiteId('kofile', 'kofile')).toBeNull();
    // A county-less id for a vendor that is NOT statewide is still a genuine failure.
    expect(parseSiteId('clerk-fidlar', 'fidlar')).toBeNull();
  });

  it('EVERY id buildCheckList can emit resolves — read out of the monitor, not hand-typed', () => {
    // The whole defect was that these tests invented their own inputs. This one takes them from the
    // only function that produces them, so the day someone adds a fourth id shape the parser cannot
    // read, this fails instead of the health table quietly staying empty for another six months.
    const monitor = fs.readFileSync(path.join(process.cwd(), 'src/infra/site-health-monitor.ts'), 'utf8');
    const literals = [...monitor.matchAll(/siteId:\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1]);

    // CONTROL: if this extraction finds nothing, every assertion below is vacuous.
    expect(literals.length).toBeGreaterThanOrEqual(3);

    for (const raw of literals) {
      // Substitute the template holes with the values buildCheckList puts in them.
      const id = raw
        .replace('${fips}', '48027')
        .replace('${config.vendor}', 'bis');
      const vendor = id.includes('kofile') ? 'kofile'
        : id.includes('texasfile') ? 'texasfile'
        : 'bis';
      const parsed = parseSiteId(id, vendor);
      expect(parsed, `site id "${id}" does not parse`).not.toBeNull();
      // Resolvable means it names a place OR admits it names none. "Clerk" is neither.
      const namesSomething = Boolean(parsed!.fips) || Boolean(parsed!.county) || parsed!.statewide;
      expect(namesSomething, `site id "${id}" parsed to nothing usable`).toBe(true);
      expect(parsed!.county, `site id "${id}" resolved to a structural word`).not.toBe('Clerk');
      expect(parsed!.county, `site id "${id}" resolved to a structural word`).not.toBe('Cad');
    }
  });

  it('the resolver asks for the FIPS column when the id carried a FIPS', () => {
    // Asserting the CALLER. parseSiteId returning a good FIPS is worth nothing if index.ts still
    // passes it to .ilike('name', ...), which is precisely the state this slice found.
    const src = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
    expect(src).toContain(".eq('fips', parsed.fips)");
    expect(src).toContain('if (parsed.statewide) return null;');
  });

  it('reports probes with no registered adapter instead of dropping them', () => {
    // The monitor probes more than has been registered; that gap is what R8b closes, and hiding it
    // would make it invisible.
    const src = fs.readFileSync(path.join(process.cwd(), 'src/infra/health-persistence.ts'), 'utf8');
    expect(src).toContain('out.unmatched.push');
  });
});

describe('the wiring', () => {
  const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('records after every scheduled sweep, not just a manual one', () => {
    expect(index).toContain("recordSiteHealth('scheduled')");
    expect(index).toContain("recordSiteHealth('manual')");
  });

  it('exposes a check-now endpoint that also records', () => {
    expect(index).toContain("app.post('/admin/health/sites/check'");
  });
});
