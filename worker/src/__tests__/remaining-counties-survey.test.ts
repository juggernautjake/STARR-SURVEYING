// The last six counties, and the typo that cost a whole vendor (plan R39).

import { describe, it, expect } from 'vitest';
import {
  BASTROP_TRAPS,
  BOSQUE_GAP,
  BROWSER_CONFIRMED_DEAD,
  COUNTYFUSION_HOST,
  COUNTYFUSION_LIVE_HOSTS,
  COUNTYFUSION_RIGHT_TLD,
  COUNTYFUSION_WRONG_TLD,
  REMAINING_COUNTY_SURVEY,
  bosqueGapWarning,
  isRealSearchTerm,
  describeCounty,
  freePathWarning,
  idocMarketSearchUrl,
  IDOCMARKET_TX_COUNTIES,
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
    // The distinction this whole document exists to preserve. Hays is the remaining example — Lee
    // and San Saba have since been resolved to "publishes nothing online", which is a conclusion
    // rather than a gap in our effort.
    expect(describeCounty('Hays')).toContain('unfinished search, NOT a county without records');
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
    // 1995 sits in the hole between the two free indexes, so the blocker points at that rather
    // than at a single paid alternative.
    expect(w).toContain('1906–2011 is not in either free index');
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

describe('the other three vendors were re-probed in a browser, and are genuinely dead', () => {
  it('records that the browser confirmed what fetch said', () => {
    // After the CountyFusion typo, every "dead" URL was re-probed with a real browser rather than
    // fetch. R37 was right about these three and wrong only about CountyFusion.
    expect(BROWSER_CONFIRMED_DEAD.henschen).toEqual({ urls: 16, failure: 'ERR_NAME_NOT_RESOLVED' });
    expect(BROWSER_CONFIRMED_DEAD.idocket).toEqual({ urls: 18, failure: 'HTTP 404' });
    expect(BROWSER_CONFIRMED_DEAD.fidlar).toEqual({ urls: 6, failure: 'ERR_NAME_NOT_RESOLVED' });
  });

  it('keeps all three out of the proven vendors', () => {
    for (const v of ['henschen', 'idocket', 'fidlar'] as const) expect(isVendorProven(v), v).toBe(false);
  });
});

describe('iDocMarket, found while re-probing iDocket', () => {
  it('builds a search URL for its Texas counties', () => {
    expect(idocMarketSearchUrl('Bosque')).toBe('https://www.idocmarket.com/BOSTX1/Document/Search');
  });

  it('lists the seven Texas counties it serves', () => {
    expect(Object.keys(IDOCMARKET_TX_COUNTIES)).toHaveLength(7);
    expect(IDOCMARKET_TX_COUNTIES.Bosque).toBe('BOSTX1');
  });

  it('returns null for a county it does not serve', () => {
    expect(idocMarketSearchUrl('Bell')).toBeNull();
  });
});

describe('Bosque\'s two free indexes do not meet', () => {
  it('warns for a year in the gap', () => {
    // QuickLink stops 1905, iDocMarket starts 2012. A 1950 deed is in NEITHER, so both searches
    // return nothing — and two empty results look like a thorough search that found nothing, which
    // is the most convincing possible way to be wrong about whether a deed exists.
    const w = bosqueGapWarning(1950);
    expect(w).toContain('gap between the two free indexes');
    expect(w).toContain('two empty results are not evidence the deed does not exist');
    expect(w).toContain('Meridian');
  });

  it('covers the whole gap inclusively', () => {
    expect(bosqueGapWarning(BOSQUE_GAP.from)).not.toBeNull();
    expect(bosqueGapWarning(BOSQUE_GAP.to)).not.toBeNull();
  });

  it('stays quiet on either side of it', () => {
    expect(bosqueGapWarning(1880)).toBeNull();   // QuickLink covers it
    expect(bosqueGapWarning(2020)).toBeNull();   // iDocMarket covers it
  });
});

describe('the last three counties, hunted', () => {
  it('found Bastrop on a fourth vendor, open to visitors', () => {
    // Harris Recording Solutions / Aumentum. No login once the disclaimer is acknowledged.
    const b = REMAINING_COUNTY_SURVEY.Bastrop;
    expect(b.status).toBe('open_partial');
    expect(b.url).toContain('cc.co.bastrop.tx.us');
    expect(b.freeCoverage).toContain('1973');
  });

  it('claims Bastrop is driven, but only as far as it actually is', () => {
    // The search now runs and returns records. What does NOT exist yet is an adapter class, and the
    // blocker says so rather than letting "driven" imply "wired into the platform".
    expect(REMAINING_COUNTY_SURVEY.Bastrop.note).toContain('Driven on 2026-08-02');
    expect(REMAINING_COUNTY_SURVEY.Bastrop.blocker).toContain('Adapter class not yet written');
  });

  it('distinguishes "no online portal" from "we have not found it"', () => {
    // The whole point. Lee and San Saba publish nothing online; Hays is an unfinished search.
    expect(REMAINING_COUNTY_SURVEY.Lee.status).toBe('no_online_portal');
    expect(REMAINING_COUNTY_SURVEY['San Saba'].status).toBe('no_online_portal');
    expect(REMAINING_COUNTY_SURVEY.Hays.status).toBe('not_found');
  });

  it('still refuses to call either one an absence of records', () => {
    for (const c of ['Lee', 'San Saba']) {
      const s = describeCounty(c);
      expect(s, c).toContain('publish NO land records online');
      expect(s, c).toContain('Never report a search here as "no records"');
      expect(s, c).toContain('courthouse');
    }
  });

  it('warns outside Bastrop\'s online window', () => {
    // Pre-1973 Bastrop deeds are not online at all.
    expect(freePathWarning('Bastrop', 1960)).toContain('FREE index covers 1973');
    expect(freePathWarning('Bastrop', 1990)).toBeNull();
  });
});

describe('the two traps that hid Bastrop', () => {
  it('records that the button has no box, and what to click instead', () => {
    // The <input> is 0x0 with z-index -1. Playwright refuses it, correctly. Aumentum renders
    // buttons as table composites; the clickable surface is a <td> named <inputId>__5.
    expect(BASTROP_TRAPS.searchButtonSelector).toBe('#cphNoMargin_SearchButtons1_btnSearch__5');
    expect(BASTROP_TRAPS.searchButtonSelector).toContain('__5');
  });

  it('records the watermark that page.fill() cannot clear', () => {
    // The field's value IS "Lastname Firstname" until a focus handler clears it. Setting .value
    // programmatically leaves the watermark in place and the form posts it as the search term.
    expect(BASTROP_TRAPS.partyWatermark).toBe('Lastname Firstname');
    expect(BASTROP_TRAPS.watermarkValidation).toBe('Please enter search criteria.');
  });

  it('treats the watermark as an empty search, not a term', () => {
    // Submitting it looks exactly like a county with no records: a form that posts and returns
    // nothing.
    expect(isRealSearchTerm('Lastname Firstname')).toBe(false);
    expect(isRealSearchTerm('  lastname firstname  ')).toBe(false);
    expect(isRealSearchTerm('')).toBe(false);
    expect(isRealSearchTerm('SMITH')).toBe(true);
  });

  it('records which marker means which side of a conveyance', () => {
    expect(BASTROP_TRAPS.roleMarkers).toEqual({ grantor: 'R', grantee: 'E' });
  });

  it('now describes Bastrop as driven rather than merely located', () => {
    expect(REMAINING_COUNTY_SURVEY.Bastrop.note).toContain('Driven on 2026-08-02');
    expect(REMAINING_COUNTY_SURVEY.Bastrop.note).toContain('100 records');
  });

  it('is honest that no adapter class exists yet', () => {
    expect(REMAINING_COUNTY_SURVEY.Bastrop.blocker).toContain('Adapter class not yet written');
  });
});
