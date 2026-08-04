// Hays County: located, and deliberately not routed.
//
// ── WHAT CHANGED ────────────────────────────────────────────────────────────────────────────────
//
// Hays sat at `not_found`, which in this survey means "we stopped looking" — deliberately distinct
// from `no_online_portal`, which means "the county does not publish online". Collapsing those two
// is the defect this whole plan document exists to prevent, so the honest move was to finish the
// search rather than re-label it.
//
// Found 2026-08-04 by walking hayscountytx.gov's own County Clerk page: "Property Records Search"
// points at `erss.co.hays.tx.us`, which redirects to a Tyler Eagle Self-Service disclaimer — the
// same software already driven for nine counties.
//
// Two things make it worth a test rather than a comment:
//
//   1. **The URL pattern cannot produce it.** `tylerEagleUrl()` builds
//      `<county>countytx-web.tylerhost.net`. Hays runs the same software on its own hostname. Adding
//      Hays to `TYLER_EAGLE_PORTALS` would generate a URL that does not exist, and the routing table
//      would claim a county it cannot reach — the exact failure the proven-vendor gate exists to
//      stop.
//   2. **It is captcha-gated, and that is a decision, not an obstacle.** A reCAPTCHA v2 widget gates
//      the disclaimer and `#submitDisclaimerAccept` stays disabled until it is solved. R12's posture
//      is that a captcha is refused until the county's terms are read. A future edit that "fixes"
//      Hays by routing it would be undoing a policy, not a bug.

import { describe, it, expect } from 'vitest';
import {
  TYLER_EAGLE_PORTALS,
  TYLER_IDENTIFIED_NOT_DRIVEN,
  TYLER_CAPTCHA_GATED,
  tylerEagleUrl,
} from '../adapters/tyler-eagle-discovery.js';
import { REMAINING_COUNTY_SURVEY } from '../adapters/remaining-counties-survey.js';
import { getClerkSystem } from '../services/clerk-registry.js';

const HAYS = '48209';

describe('Hays was found', () => {
  it('is recorded with the portal that was actually reached', () => {
    const entry = TYLER_IDENTIFIED_NOT_DRIVEN[HAYS];
    expect(entry, 'Hays is missing from the Tyler discovery list').toBeTruthy();
    expect(entry.county).toBe('Hays');
    expect(entry.url).toContain('erss.co.hays.tx.us');
  });

  it('no longer claims the search is unfinished', () => {
    // `not_found` is an admission that we stopped looking. It is now false for Hays, and leaving it
    // would keep a county on a work list that has been done.
    expect(REMAINING_COUNTY_SURVEY.Hays.status).not.toBe('not_found');
    expect(REMAINING_COUNTY_SURVEY.Hays.url).toContain('erss.co.hays.tx.us');
  });

  it('says what blocks it, rather than leaving the blocker to be rediscovered', () => {
    expect(REMAINING_COUNTY_SURVEY.Hays.blocker ?? '').toMatch(/captcha/i);
  });
});

describe('Hays is not routed, and that is on purpose', () => {
  it('is not in the Tyler Eagle portal table', () => {
    // That table is keyed to the derived hostname pattern. Hays is not on it, so an entry there
    // would produce a URL that does not resolve.
    expect(Object.values(TYLER_EAGLE_PORTALS).some((p) => p.fips === HAYS)).toBe(false);
  });

  it('the URL pattern genuinely cannot produce the real host', () => {
    // Stated as a check rather than a comment: if the pattern ever DID cover Hays, the reason for
    // keeping it out of the portal table would have evaporated and this test should say so.
    const derived = tylerEagleUrl('Hays');
    expect(derived === null || !derived.includes('erss.co.hays.tx.us')).toBe(true);
  });

  it('still falls through to a vendor that answers', () => {
    // Not routed must not mean unrouted. TexasFile serves all 254 counties.
    const system = getClerkSystem(HAYS);
    expect(system).toBeTruthy();
    expect(system).not.toBe('henschen');
  });

  it('is marked captcha-gated so nobody re-routes it as a bug fix', () => {
    expect(TYLER_CAPTCHA_GATED.has(HAYS)).toBe(true);
  });
});

describe('the captcha set means what it says', () => {
  it('every captcha-gated county is one we located', () => {
    // A county cannot be "blocked by a captcha" unless we got far enough to see one.
    for (const fips of TYLER_CAPTCHA_GATED) {
      expect(TYLER_IDENTIFIED_NOT_DRIVEN[fips], `${fips} is gated but not recorded as found`).toBeTruthy();
    }
  });

  it('no captcha-gated county is routed to Tyler Eagle', () => {
    for (const fips of TYLER_CAPTCHA_GATED) {
      expect(
        Object.values(TYLER_EAGLE_PORTALS).some((p) => p.fips === fips),
        `${fips} is captcha-gated and must not be in the routed portal table`,
      ).toBe(false);
    }
  });
});
