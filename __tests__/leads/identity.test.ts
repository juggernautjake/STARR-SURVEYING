// __tests__/leads/identity.test.ts — A7. Who was behind the click, and refusing to guess.
//
// The rule this whole module exists to keep: **never invent an identity.** A dashboard that quietly
// attributes the wrong customer to a sale is worse than one that admits it does not know — the wrong
// answer gets acted on, and the missing one gets investigated.

import { describe, it, expect } from 'vitest';
import { campaignIdFromLanding, describeLeadIdentity, summariseIdentities } from '@/lib/leads/identity';

// A real shape from production (click id truncated), 2026-08-12.
const adLead = {
  id: '8b201754-df91-4c7d-844a-3320f092fea8',
  name: 'Dana Ruiz',
  email: 'dana@example.com',
  phone: '575-555-0142',
  how_heard: 'Google Search',
  gclid: 'CjwKCAjw4dDTBhAqEiwAkHYmSjDw5pv6iecs',
  landing_page: '/contact?gad_source=1&gad_campaignid=23598795033&gclid=CjwKCAjw4dDTBhAqEiwAkHYmSjDw5pv6iecs',
  referrer: 'https://www.google.com/',
};

describe('campaignIdFromLanding — the campaign was there all along', () => {
  it('reads gad_campaignid out of an auto-tagged landing URL', () => {
    // The inventory finding that made this function necessary: ELEVEN leads, ZERO utm_campaign
    // values, because the account auto-tags rather than manually tagging. The dashboard's campaign
    // breakdown showed "(no campaign)" for every lead while the id sat in the landing page string.
    expect(campaignIdFromLanding(adLead.landing_page)).toBe('23598795033');
  });

  it('reads the older ValueTrack {campaignid} spelling too', () => {
    expect(campaignIdFromLanding('/?campaignid=1234567890&x=1')).toBe('1234567890');
  });

  it('refuses a campaign NAME where an id belongs', () => {
    // Manual tagging often puts a name in utm_campaign. Returning it as an id would produce a value
    // that silently fails to join against ad_spend_daily.campaign_id, for a reason invisible in
    // the UI.
    expect(campaignIdFromLanding('/?gad_campaignid=summer-boundary-surveys')).toBeNull();
  });

  it('is not fooled by a campaign id inside another parameter', () => {
    // Parsed as a query string, not regexed out of the whole URL: a nested redirect carrying its
    // own query must not donate its campaign id to this lead.
    expect(campaignIdFromLanding('/go?redirect=%2Fx%3Fgad_campaignid%3D999999999')).toBeNull();
  });

  it('survives a URL with no query, and a malformed one', () => {
    expect(campaignIdFromLanding('/contact')).toBeNull();
    expect(campaignIdFromLanding(null)).toBeNull();
    expect(campaignIdFromLanding('%%%not a url%%%')).toBeNull();
  });
});

describe('describeLeadIdentity — confidence is graded, never a boolean', () => {
  it('names the click and the campaign when a gclid is stored', () => {
    const id = describeLeadIdentity(adLead);
    expect(id.confidence).toBe('click');
    expect(id.clickId).toEqual({ field: 'gclid', value: adLead.gclid });
    expect(id.campaignId).toBe('23598795033');
    // Where it came from is reported, so a mismatch against spend rows is diagnosable rather than
    // mysterious.
    expect(id.campaignIdSource).toBe('landing-page');
    expect(id.explanation).toContain('campaign 23598795033');
  });

  it('prefers a deliberate utm_campaign over the auto-tagged one', () => {
    const id = describeLeadIdentity({ ...adLead, utm_campaign: 'manual-1111111111' });
    expect(id.campaignId).toBe('manual-1111111111');
    expect(id.campaignIdSource).toBe('utm');
  });

  it('falls back to gbraid, which is what iOS clicks carry', () => {
    // Two of the eleven production leads have gbraid and no gclid. Checking only gclid would call
    // them anonymous while a perfectly good click id sat in the next column.
    const id = describeLeadIdentity({ ...adLead, gclid: null, gbraid: 'Cj0gbraid123' });
    expect(id.confidence).toBe('click');
    expect(id.clickId?.field).toBe('gbraid');
  });

  it('says "inferred" — not "click" — when Google sent them but no id was captured', () => {
    const id = describeLeadIdentity({
      ...adLead, gclid: null, gbraid: null,
      landing_page: '/contact', referrer: 'https://www.google.com/',
    });
    expect(id.confidence).toBe('inferred');
    expect(id.clickId).toBeNull();
    expect(id.explanation).toContain('cannot be named');
  });

  it('marks a self-reported source as the customer\'s word, not a measurement', () => {
    const id = describeLeadIdentity({
      name: 'Walk-in', how_heard: 'A friend recommended you', landing_page: null, referrer: null,
    });
    expect(id.confidence).toBe('declared');
    expect(id.explanation).toContain('not a measurement');
  });

  it('says "anonymous" plainly when there is nothing at all', () => {
    // The rule. Not "Direct", not "Organic" — both of those are claims about how they arrived, and
    // the truth is that we do not know.
    const id = describeLeadIdentity({ name: 'Someone', landing_page: null, referrer: null });
    expect(id.confidence).toBe('anonymous');
    expect(id.explanation).toContain('No click id');
  });
});

describe('describeLeadIdentity — it never fabricates a name', () => {
  it('falls back to email, then phone, then an honest placeholder', () => {
    expect(describeLeadIdentity({ email: 'a@b.com' }).displayName).toBe('a@b.com');
    expect(describeLeadIdentity({ phone: '555-0100' }).displayName).toBe('555-0100');
    // Not "Unknown Customer", which reads like a record we hold rather than one we do not.
    expect(describeLeadIdentity({}).displayName).toBe('Anonymous enquiry');
  });

  it('treats whitespace-only fields as absent', () => {
    // A form that submits "   " must not produce a lead displayed as a blank name.
    expect(describeLeadIdentity({ name: '   ', email: 'a@b.com' }).displayName).toBe('a@b.com');
    expect(describeLeadIdentity({ gclid: '  ' }).clickId).toBeNull();
  });
});

describe('summariseIdentities — the coverage line', () => {
  it('counts each grade and reports the traceable share', () => {
    const rows = [
      describeLeadIdentity(adLead),
      describeLeadIdentity({ ...adLead, gclid: null, gbraid: 'x1' }),
      describeLeadIdentity({ how_heard: 'Word of mouth' }),
      describeLeadIdentity({}),
    ];
    const s = summariseIdentities(rows);
    expect(s.total).toBe(4);
    expect(s.click).toBe(2);
    expect(s.declared).toBe(1);
    expect(s.anonymous).toBe(1);
    expect(s.clickShare).toBe(0.5);
  });

  it('reports a null share rather than 0% for an empty range', () => {
    // "0% traceable" says we tried and failed. The truth for an empty month is that nothing
    // arrived — the same em-dash rule the rest of this dashboard follows.
    expect(summariseIdentities([]).clickShare).toBeNull();
  });
});
