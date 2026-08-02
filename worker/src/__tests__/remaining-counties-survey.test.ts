// The last six counties, and the typo that cost a whole vendor (plan R39).

import { describe, it, expect } from 'vitest';
import {
  COUNTYFUSION_HOST,
  COUNTYFUSION_LIVE_HOSTS,
  COUNTYFUSION_RIGHT_TLD,
  COUNTYFUSION_WRONG_TLD,
  REMAINING_COUNTY_SURVEY,
  describeCounty,
  freePathWarning,
} from '../adapters/remaining-counties-survey.js';
import { isVendorProven } from '../services/clerk-registry.js';

describe('CountyFusion was never dead — our TLD was wrong', () => {
  it('records both TLDs, because the wrong one is the finding', () => {
    // countyfusion7.kofiletech.com does not resolve at all. The .us host answers 200.
    expect(COUNTYFUSION_WRONG_TLD).toBe('kofiletech.com');
    expect(COUNTYFUSION_RIGHT_TLD).toBe('kofiletech.us');
  });

  it('builds the host that actually answers', () => {
    expect(COUNTYFUSION_HOST(10)).toBe('https://countyfusion10.kofiletech.us/countyweb/');
  });

  it('found all twelve numbered hosts alive', () => {
    expect(COUNTYFUSION_LIVE_HOSTS).toHaveLength(12);
  });

  it('still does NOT route to CountyFusion', () => {
    // "The host is alive" and "we can read records" are different claims. Every per-county entry
    // point is a username/password login and no credentials exist.
    expect(isVendorProven('countyfusion')).toBe(false);
  });
});

describe('what each remaining county actually offers', () => {
  it('has Bosque as a partially open free portal', () => {
    const b = REMAINING_COUNTY_SURVEY.Bosque;
    expect(b.status).toBe('open_partial');
    expect(b.url).toBe('https://kofilequicklinks.com/Bosque/');
    expect(b.freeCoverage).toContain('1847');
  });

  it('has Limestone as reachable but not readable', () => {
    const l = REMAINING_COUNTY_SURVEY.Limestone;
    expect(l.status).toBe('login_required');
    expect(describeCounty('Limestone')).toContain('Reachable, not readable');
  });

  it('never calls an unfinished search a county without records', () => {
    // The distinction this whole document exists to preserve.
    expect(describeCounty('Lee')).toContain('unfinished search, NOT a county without records');
  });

  it('says nothing at all about a county never surveyed', () => {
    expect(describeCounty('Atascosa')).toBe('Atascosa: not surveyed.');
  });
});

describe('a free window is not the whole record', () => {
  it('warns when a search falls outside Bosque\'s free years', () => {
    // Bosque's free index stops in 1905. A 1995 deed exists — it is on iDocMarket behind a fee.
    // Reporting the empty result as "no deed" would be wrong twice over.
    const w = freePathWarning('Bosque', 1995);
    expect(w).toContain('FREE index covers 1847–1905');
    expect(w).toContain('NOT that it does not exist');
    expect(w).toContain('iDocMarket');
  });

  it('stays quiet inside the free window', () => {
    expect(freePathWarning('Bosque', 1880)).toBeNull();
  });

  it('includes the boundary years', () => {
    expect(freePathWarning('Bosque', 1847)).toBeNull();
    expect(freePathWarning('Bosque', 1905)).toBeNull();
    expect(freePathWarning('Bosque', 1846)).not.toBeNull();
  });

  it('says nothing for a county with no free path to describe', () => {
    // Silence beats inventing a coverage claim.
    expect(freePathWarning('Limestone', 1900)).toBeNull();
    expect(freePathWarning('Lee', 1900)).toBeNull();
  });
});
