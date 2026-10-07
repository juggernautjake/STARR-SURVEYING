// __tests__/twilio/call-source.test.ts — tying a call to the website visit (and ad) behind it.
//
// Owner, 2026-10-06: "I do not want separate numbers for each ad... we need one number for the
// business." So a call is matched to a tap on the website's phone number by time, and the page says
// how sure that match is. These pin the rules that keep it honest.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pickTap, sourceOfTap, matchable, tapAttribution, type TapRow } from '@/lib/receptionist/call-source';
import { parseTapReport } from '@/lib/receptionist/tap-report';

const CALL = '2026-10-06T15:00:00.000Z';
const at = (minBefore: number) => new Date(Date.parse(CALL) - minBefore * 60_000).toISOString();
function tap(p: Partial<TapRow>): TapRow {
  return {
    id: 't1', tapped_at: at(1), path: '/services', device: 'mobile', visitor: 'v1',
    gclid: null, gbraid: null, wbraid: null, utm_source: null, utm_medium: null, utm_campaign: null,
    utm_term: null, utm_content: null, landing_page: null, referrer: null, first_seen_at: null, ...p,
  };
}

describe('matching a call to the tap before it', () => {
  it('a phone tap a minute before the call, from an ad, is a likely Google-ad call', () => {
    const m = pickTap(CALL, [tap({ gclid: 'abc', utm_campaign: 'Boundary' })]);
    expect(m?.confidence).toBe('likely');
    expect(m?.source).toBe('google_ads');
    expect(m?.detail).toMatch(/Tapped the number on \/services 1 minute before calling, from a Google ad click \(campaign Boundary\)/);
  });

  it('a desktop visitor dialling by hand is only possible, and allowed a longer gap', () => {
    expect(pickTap(CALL, [tap({ device: 'desktop', tapped_at: at(12) })])?.confidence).toBe('possible');
    expect(pickTap(CALL, [tap({ device: 'desktop', tapped_at: at(20) })])).toBeNull();
  });

  it('a phone tap long before the call is not its cause', () => {
    expect(pickTap(CALL, [tap({ tapped_at: at(8) })])).toBeNull();
  });

  it('two different visitors tapping in the window makes it a guess', () => {
    const m = pickTap(CALL, [tap({ id: 'a', visitor: 'v1', tapped_at: at(1) }), tap({ id: 'b', visitor: 'v2', tapped_at: at(2) })]);
    expect(m?.tap.id).toBe('a');
    expect(m?.confidence).toBe('possible');
  });

  it('the same visitor tapping twice is still one person, still likely', () => {
    const m = pickTap(CALL, [tap({ id: 'a', tapped_at: at(1) }), tap({ id: 'b', tapped_at: at(2) })]);
    expect(m?.confidence).toBe('likely');
  });

  it('a tap reported a few seconds after the call start still counts (the beacon and the webhook race)', () => {
    expect(pickTap(CALL, [tap({ tapped_at: new Date(Date.parse(CALL) + 20_000).toISOString() })])).not.toBeNull();
  });

  it('organic visits are "website", described by where they came from', () => {
    expect(sourceOfTap(tap({}))).toBe('website');
    expect(sourceOfTap(tap({ utm_source: 'google', utm_medium: 'cpc' }))).toBe('google_ads');
    expect(pickTap(CALL, [tap({ referrer: 'https://www.google.com/' })])?.detail).toMatch(/Google search \(not an ad\)/);
  });
});

describe('what is never credited to a visit', () => {
  it('robocalls, blocked calls, test calls and already-matched calls', () => {
    const base = { id: 'c', started_at: CALL };
    expect(matchable({ ...base, caller_verdict: 'robocall' })).toBe(false);
    expect(matchable({ ...base, answered_by: 'blocked' })).toBe(false);
    expect(matchable({ ...base, is_test: true })).toBe(false);
    expect(matchable({ ...base, tap_id: 't' })).toBe(false);
    expect(matchable({ ...base, caller_verdict: 'person' })).toBe(true);
  });

  it('a matched tap hands the click to the lead in the shape the intake reads', () => {
    expect(tapAttribution(tap({ gclid: 'abc', utm_source: 'google' }))).toEqual({ gclid: 'abc', utm_source: 'google' });
    expect(tapAttribution(tap({}))).toBeNull();
  });
});

describe('the public tap report', () => {
  it('accepts a tap and caps every field', () => {
    const r = parseTapReport(JSON.stringify({ kind: 'tel', path: '/contact', device: 'mobile', visitor: 'abc-123', gclid: 'x'.repeat(900) }), 'Mozilla/5.0 (iPhone)');
    expect(r?.path).toBe('/contact');
    expect(r?.gclid?.length).toBe(300);
  });

  it('refuses anything that is not a tap, a bad path, and crawlers', () => {
    expect(parseTapReport('not json', null)).toBeNull();
    expect(parseTapReport(JSON.stringify({ kind: 'other' }), null)).toBeNull();
    expect(parseTapReport(JSON.stringify({ kind: 'tel', path: 'https://evil' }), null)?.path).toBeNull();
    expect(parseTapReport(JSON.stringify({ kind: 'tel' }), 'Googlebot/2.1')).toBeNull();
  });

  it('stores no IP address and no phone number', () => {
    const keys = Object.keys(parseTapReport(JSON.stringify({ kind: 'tel' }), null) ?? {});
    expect(keys).not.toContain('ip');
    expect(keys).not.toContain('phone');
  });

  it('the site sends it from the one delegated tel: listener', () => {
    expect(readFileSync('app/components/GoogleAdsScript.tsx', 'utf8')).toContain('reportPhoneTap()');
  });
});
