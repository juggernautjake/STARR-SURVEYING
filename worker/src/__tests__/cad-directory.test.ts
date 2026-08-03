// The Comptroller's appraisal-district directory, and the guess it replaces.
//
// `generic-cad-adapter` used to find a county's appraisal district by running a Google search and
// asking a vision model to pick the right link off the results page — once per county, every run.
// Three problems in one: it cost a search plus an AI call each time; it depended on Google's result
// ordering, which is not ours to rely on; and it produced a URL nobody verified. A model picking
// from a search page can return a data broker, a paid aggregator or a lookalike domain just as
// easily as the official district, and the pipeline would then present whatever it scraped as
// county appraisal data.
//
// That is this platform's signature defect stated exactly — an unknown rendered as an answer — and
// the Comptroller publishes the fact, so the fact wins.
//
// What these tests defend is mostly the HONESTY of the data rather than its completeness: 13
// counties have no published website and must stay `null`, because a populated-looking wrong value
// is worse than an empty one — nothing downstream can tell it is wrong.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CAD_DIRECTORY, cadForCounty, cadUrlForCounty } from '../research/cad-directory.js';

describe('the directory covers Texas', () => {
  it('has all 254 counties', () => {
    expect(CAD_DIRECTORY).toHaveLength(254);
  });

  it('has no duplicate counties', () => {
    expect(new Set(CAD_DIRECTORY.map((e) => e.county)).size).toBe(254);
  });

  it('gives every county a Comptroller number', () => {
    expect(CAD_DIRECTORY.every((e) => /^\d{3}$/.test(e.number))).toBe(true);
  });

  it('publishes a website for the large majority', () => {
    // Not all — see below. This is a floor, so a botched re-scrape that null'd everything fails.
    expect(CAD_DIRECTORY.filter((e) => e.website).length).toBeGreaterThanOrEqual(235);
  });
});

describe('every stored website is actually a hostname', () => {
  it('has no value carrying spaces, a scheme, or a path', () => {
    // An earlier scrape wrote Motley's MAILING ADDRESS into the website field. It looked populated,
    // which is exactly what makes it dangerous — a caller cannot tell it is wrong, and would
    // navigate to something that is not a URL instead of falling back to discovery.
    const bad = CAD_DIRECTORY
      .filter((e) => e.website && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(e.website))
      .map((e) => `${e.county}: ${e.website}`);
    expect(bad, `malformed hosts:\n  ${bad.join('\n  ')}`).toEqual([]);
  });

  it('keeps Motley null rather than storing its address', () => {
    expect(cadForCounty('Motley')?.website).toBeNull();
  });
});

describe('lookup', () => {
  it('finds a county by plain name', () => {
    expect(cadForCounty('Bell')?.website).toBe('www.bellcad.org');
  });

  it('tolerates the spellings that actually reach us', () => {
    // Deeds, GIS layers and user input all differ.
    for (const spelling of ['bell', 'BELL', ' Bell ', 'Bell County', 'Bell CAD']) {
      expect(cadForCounty(spelling)?.county, spelling).toBe('Bell');
    }
  });

  it('returns null for an unknown county rather than a plausible neighbour', () => {
    // A fuzzy match here would silently point a run at the wrong county's appraisal roll. Unmatched
    // must mean unmatched.
    expect(cadForCounty('Belle')).toBeNull();
    expect(cadForCounty('Nowhere')).toBeNull();
    expect(cadForCounty(null)).toBeNull();
    expect(cadForCounty('')).toBeNull();
  });

  it('hands callers a navigable URL, since the stored value is a bare host', () => {
    expect(cadUrlForCounty('McLennan')).toBe('https://www.mclennancad.org');
  });

  it('returns null for a county with no published site, not a fabricated URL', () => {
    expect(cadUrlForCounty('Motley')).toBeNull();
  });
});

describe('spot checks against districts that can be verified independently', () => {
  // Picked because they are checkable by anyone: hcad.org is the largest appraisal district in
  // Texas, and Bell/McLennan are this firm's home counties.
  it.each([
    ['Harris', 'www.hcad.org'],
    ['Bell', 'www.bellcad.org'],
    ['McLennan', 'www.mclennancad.org'],
    ['Coryell', 'www.coryellcad.org'],
  ])('%s -> %s', (county, host) => {
    expect(cadForCounty(county)?.website).toBe(host);
  });
});

describe('the adapter actually consults it', () => {
  // A directory nothing reads leaves the Google-and-guess path exactly as it was — the defect this
  // codebase produces most often, and the whole point of the slice.
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/adapters/generic-cad-adapter.ts'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('imports the directory', () => {
    expect(code).toContain("from '../research/cad-directory.js'");
  });

  it('checks the directory BEFORE opening a browser', () => {
    // Order is the saving. Consulting it after the search would keep the cost and the risk.
    const fn = code.slice(code.indexOf('discoverPortalUrl'));
    expect(fn.indexOf('cadUrlForCounty')).toBeLessThan(fn.indexOf('initBrowser'));
  });

  it('still falls back to discovery for the counties with no listed site', () => {
    // 13 counties genuinely have none. Removing the fallback would break them.
    expect(code).toContain('google.com/search');
  });
});
