// __tests__/leads/attribution.test.ts — where a lead came from (G1-1/G1-2).
//
// The rules under test are the ones that decide whether a booked job is credited to the ad that bought it.
// Each of them can be got wrong in a way that still "works": the form submits, a row is written, and the
// campaign quietly looks worthless. So they are pinned individually, with the failure each one prevents
// named beside it.
import { describe, it, expect } from 'vitest';
import {
  ATTRIBUTION_TTL_DAYS,
  attributionFormFields,
  clickIdOf,
  hasAttribution,
  isExpired,
  mergeAttribution,
  parseAttribution,
} from '@/lib/leads/attribution';

describe('parseAttribution', () => {
  it('reads all three Google click identifiers, not just gclid', () => {
    // Storing only `gclid` — the one every tutorial names — silently drops iOS app→web and web→app
    // journeys, which is exactly the traffic privacy changes made hardest to attribute.
    expect(parseAttribution('?gclid=abc123').gclid).toBe('abc123');
    expect(parseAttribution('?gbraid=g-1').gbraid).toBe('g-1');
    expect(parseAttribution('?wbraid=w-1').wbraid).toBe('w-1');
  });

  it('reads the five UTMs', () => {
    const a = parseAttribution('?utm_source=google&utm_medium=cpc&utm_campaign=boundary&utm_term=survey&utm_content=v2');
    expect(a).toMatchObject({
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'boundary',
      utm_term: 'survey', utm_content: 'v2',
    });
  });

  it('returns EMPTY for a page with no identifiers, rather than a record of an unattributable visit', () => {
    // This is what lets a later organic visit leave an earlier ad click alone. If a bare visit produced a
    // record, `mergeAttribution` would have nothing to distinguish it from a real click.
    expect(parseAttribution('')).toEqual({});
    expect(parseAttribution('?utm_nonsense=1&page=2')).toEqual({});
    expect(hasAttribution(parseAttribution(''))).toBe(false);
  });

  it('records the landing page and referrer only when something identifying was found', () => {
    const withCtx = parseAttribution('?gclid=x', { landingPage: '/services?gclid=x', referrer: 'https://google.com/' });
    expect(withCtx.landing_page).toBe('/services?gclid=x');
    expect(withCtx.referrer).toBe('https://google.com/');
    expect(withCtx.first_seen_at).toBeTruthy();

    const bare = parseAttribution('', { landingPage: '/services', referrer: 'https://google.com/' });
    expect(bare.landing_page, 'no click, no record').toBeUndefined();
  });

  it('trims, drops blanks, and caps length — this is attacker-controlled input on a public page', () => {
    expect(parseAttribution('?gclid=%20%20').gclid).toBeUndefined();
    expect(parseAttribution('?gclid=  spaced  ').gclid).toBe('spaced');
    const long = 'a'.repeat(900);
    expect(parseAttribution(`?gclid=${long}`).gclid!.length).toBe(256);
  });

  it('tolerates a search string with or without the leading ?', () => {
    expect(parseAttribution('gclid=abc').gclid).toBe('abc');
    expect(parseAttribution('?gclid=abc').gclid).toBe('abc');
  });
});

describe('mergeAttribution — first write wins', () => {
  const ad = { gclid: 'ad-click', first_seen_at: '2026-07-01T00:00:00.000Z' };
  const organic = { utm_source: 'newsletter', first_seen_at: '2026-07-03T00:00:00.000Z' };

  it('keeps the AD click when the visitor returns organically before converting', () => {
    // THE RULE THE MODULE EXISTS FOR. Someone clicks an ad, leaves, comes back two days later from a
    // Google search and books. Last-touch credits the free visit and makes the campaign look worse than
    // it is. They were bought by the ad.
    expect(mergeAttribution(ad, organic)).toBe(ad);
  });

  it('keeps the FIRST ad click when a second ad click follows', () => {
    const second = { gclid: 'later-click', first_seen_at: '2026-07-05T00:00:00.000Z' };
    expect(mergeAttribution(ad, second)).toBe(ad);
  });

  it('upgrades to a real click when the stored record has only UTMs', () => {
    // A click identifier is strictly better information than the organic visit it replaces: it is what
    // an offline conversion can actually be uploaded against.
    expect(mergeAttribution(organic, ad)).toBe(ad);
  });

  it('leaves the stored record alone when the new visit carries nothing', () => {
    expect(mergeAttribution(ad, {})).toBe(ad);
    expect(mergeAttribution(null, {})).toEqual({});
  });

  it('takes the incoming record when there is nothing stored', () => {
    expect(mergeAttribution(null, ad)).toBe(ad);
  });
});

describe('clickIdOf', () => {
  it('prefers gclid, then gbraid, then wbraid', () => {
    expect(clickIdOf({ gclid: 'a', gbraid: 'b', wbraid: 'c' })).toEqual({ field: 'gclid', value: 'a' });
    expect(clickIdOf({ gbraid: 'b', wbraid: 'c' })).toEqual({ field: 'gbraid', value: 'b' });
    expect(clickIdOf({ wbraid: 'c' })).toEqual({ field: 'wbraid', value: 'c' });
  });

  it('returns null for a UTM-only lead — real and reportable, just not uploadable', () => {
    expect(clickIdOf({ utm_source: 'newsletter' })).toBeNull();
    expect(clickIdOf(null)).toBeNull();
  });
});

describe('isExpired', () => {
  const base = Date.parse('2026-07-01T00:00:00.000Z');

  it('matches Google\'s 90-day click lookback', () => {
    expect(ATTRIBUTION_TTL_DAYS).toBe(90);
    const a = { gclid: 'x', first_seen_at: '2026-07-01T00:00:00.000Z' };
    expect(isExpired(a, base + 89 * 86400000)).toBe(false);
    expect(isExpired(a, base + 91 * 86400000)).toBe(true);
  });

  it('treats an unparseable timestamp as expired, never as fresh', () => {
    // Failing closed matters here: uploading a conversion whose click is outside the window is rejected
    // by Google and shows up as an error nobody can explain from our side.
    expect(isExpired({ gclid: 'x', first_seen_at: 'not-a-date' })).toBe(true);
  });

  it('is not expired when there is no timestamp to judge by', () => {
    expect(isExpired({ gclid: 'x' })).toBe(false);
    expect(isExpired(null)).toBe(false);
  });
});

describe('attributionFormFields', () => {
  it('flattens to plain strings and omits empties', () => {
    const fields = attributionFormFields({ gclid: 'abc', utm_source: 'google', utm_term: undefined });
    expect(fields).toEqual({ gclid: 'abc', utm_source: 'google' });
  });

  it('returns {} for null, so a form with no attribution posts NO fields at all', () => {
    // Posting empty strings would land as '' in the row rather than NULL, and '' is a value a status
    // filter or a "came from an ad" query will happily treat as real.
    expect(attributionFormFields(null)).toEqual({});
  });
});
