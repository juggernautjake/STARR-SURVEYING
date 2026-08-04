// Harrison and Trinity — the owner's last two counties without a free route.
//
// Eleven of the thirteen counties the owner's place list resolved to already route to a proven free
// vendor. These two fell through to TexasFile, which answers but is a paywall we have no credentials
// for. Both were hunted from the county's own clerk page (R38/R39, 2026-08-04).
//
// The results are opposite, and the difference is the point of this file:
//
//   Harrison — a free portal exists, and the county MISDESCRIBES it. The clerk page advertises
//              "Land Records 1840-1920"; the portal's own year dropdown serves 1880–1907 with
//              1888–1896 missing. Believing the banner tells a surveyor a deed should be there when
//              it cannot be.
//   Trinity  — no online portal at all. That is a conclusion about Trinity County, not an admission
//              that we stopped looking, and the file says what would overturn it.

import { describe, it, expect } from 'vitest';
import {
  REMAINING_COUNTY_SURVEY,
  HARRISON_QUICKLINK_RANGES,
  HARRISON_CLAIMED_COVERAGE,
  harrisonYearIsIndexed,
  harrisonCoverageWarning,
} from '../adapters/remaining-counties-survey.js';

describe('Harrison — the free index is narrower than the county says', () => {
  it('serves the years its own dropdown offers', () => {
    for (const year of [1880, 1885, 1897, 1900, 1903, 1906, 1907]) {
      expect(harrisonYearIsIndexed(year), `${year} should be indexed`).toBe(true);
    }
  });

  it('does NOT serve the years only the banner claims', () => {
    // The clerk page says 1840–1920. Both ends are wrong by decades.
    expect(harrisonYearIsIndexed(1840)).toBe(false);
    expect(harrisonYearIsIndexed(1879)).toBe(false);
    expect(harrisonYearIsIndexed(1908)).toBe(false);
    expect(harrisonYearIsIndexed(1920)).toBe(false);
  });

  it('does not serve the hole in the middle the banner denies', () => {
    // 1888–1896 is absent between the second and third index books. A continuous-looking range that
    // is not continuous is the worst shape of this defect: nothing on screen suggests a gap.
    for (const year of [1889, 1892, 1895]) {
      expect(harrisonYearIsIndexed(year), `${year} is inside the gap`).toBe(false);
    }
  });

  it('the claimed range really is wider than the served one, so the check has something to catch', () => {
    // A control. If somebody "fixed" the ranges to match the banner, every assertion above would
    // still pass in shape while the warnings stopped firing.
    const earliest = Math.min(...HARRISON_QUICKLINK_RANGES.map((r) => r.from));
    const latest = Math.max(...HARRISON_QUICKLINK_RANGES.map((r) => r.to));
    expect(HARRISON_CLAIMED_COVERAGE.from).toBeLessThan(earliest);
    expect(HARRISON_CLAIMED_COVERAGE.to).toBeGreaterThan(latest);
  });
});

describe('Harrison — the warning says which kind of missing', () => {
  it('is silent for a year that is actually covered', () => {
    expect(harrisonCoverageWarning(1900)).toBeNull();
  });

  it('distinguishes before, after, and the gap', () => {
    expect(harrisonCoverageWarning(1850)).toContain('before the free index begins');
    expect(harrisonCoverageWarning(1950)).toContain('after the free index ends');
    expect(harrisonCoverageWarning(1892)).toContain('gap');
  });

  it('refuses to let an empty result read as an absence of deeds', () => {
    const w = harrisonCoverageWarning(1850) ?? '';
    expect(w).toContain('a fact about');
    expect(w).toMatch(/rather than about the land/);
  });

  it('names where to go instead, rather than only saying no', () => {
    const w = harrisonCoverageWarning(1950) ?? '';
    expect(w).toMatch(/TexasFile|Marshall/);
  });

  it('says eRecording vendors are not a search path', () => {
    // The clerk page lists CSC, Simplifile, EPN and Indecomm under a records heading. They FILE
    // documents. Mistaking them for an index is a plausible next wrong turn.
    expect(harrisonCoverageWarning(1950) ?? '').toMatch(/SUBMISSION|do not search/i);
  });
});

describe('the survey records both, and records them differently', () => {
  it('Harrison is a partially open portal, not an absence', () => {
    const h = REMAINING_COUNTY_SURVEY.Harrison;
    expect(h.status).toBe('open_partial');
    expect(h.url).toContain('kofilequicklinks.com/Harrison');
    expect(h.freeCoverage ?? '').toMatch(/1880/);
    expect(h.freeCoverage ?? '').toMatch(/1888/);   // the hole is stated in the coverage line itself
  });

  it('Trinity is a conclusion, not an unfinished search', () => {
    const t = REMAINING_COUNTY_SURVEY.Trinity;
    expect(t.status).toBe('no_online_portal');
    expect(t.status).not.toBe('not_found');
    expect(t.note).toMatch(/claim about|overturn/i);
  });

  it('neither is left claiming to be routed', () => {
    // Both still fall through to TexasFile. Harrison's free window is historical-only and has no
    // adapter; saying otherwise would be the routing table claiming a county it cannot serve.
    for (const county of ['Harrison', 'Trinity'] as const) {
      expect(REMAINING_COUNTY_SURVEY[county].status).not.toBe('login_required');
      expect(REMAINING_COUNTY_SURVEY[county].status).not.toBe('paywalled');
    }
  });
});
