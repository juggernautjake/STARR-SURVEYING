// __tests__/integrations/google-ads-oauth.test.ts
//
// The consent handshake that lets the nightly job upload on the firm's behalf.
//
// ── WHAT THIS IS GUARDING ───────────────────────────────────────────────────────────────────────
//
// Before 2026-08-06 there was no flow at all: `google_ads_connections` was SELECTed by
// `getAccessToken()` and UPDATEd by the cron, and written by nothing. The row could only be created
// by hand in the database, so `/admin/marketing/uploads` could report "not connected" indefinitely
// with no way to act on it.
//
// The three parameters below are each load-bearing in a way that fails LATE rather than loudly, so
// they are asserted rather than trusted:
//
//   · `access_type=offline` — without it Google issues no refresh token, the connection works for
//     one hour, and every nightly run after the first fails.
//   · `prompt=consent` — on a REPEAT authorisation Google omits the refresh token unless asked. A
//     reconnect after a revoked token would hand back an access token and no way to renew it, so
//     the reconnection would appear to fix things and break again by morning.
//   · the granted-scope check — Google's consent screen lets someone approve a subset. Storing that
//     connection gives a green badge and a nightly 403.

import { describe, it, expect } from 'vitest';
import {
  ADS_OAUTH_SCOPE,
  adsRedirectUri,
  buildAdsAuthUrl,
  grantedAdsScope,
  normaliseCustomerId,
} from '@/lib/integrations/google-ads/oauth';

describe('the authorisation URL', () => {
  const url = () => new URL(buildAdsAuthUrl('https://example.com/cb', 'nonce:a@b.com:1234567890'));

  it('asks for a refresh token, and asks for it every time', () => {
    const q = url().searchParams;
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
  });

  it('asks for the Ads scope', () => {
    expect(url().searchParams.get('scope')).toBe(ADS_OAUTH_SCOPE);
  });

  it('carries the state through unmodified, so the callback can verify it', () => {
    expect(url().searchParams.get('state')).toBe('nonce:a@b.com:1234567890');
  });

  it('points at Google, not at us', () => {
    expect(url().origin).toBe('https://accounts.google.com');
  });

  it('sends the redirect URI it will later exchange against', () => {
    // A mismatch between this and the value sent at exchange time is Google's most common OAuth
    // error (`redirect_uri_mismatch`), and it is invisible until a real user tries to connect.
    expect(url().searchParams.get('redirect_uri')).toBe('https://example.com/cb');
  });
});

describe('adsRedirectUri', () => {
  it('is derived from the base URL, so every environment agrees with itself', () => {
    expect(adsRedirectUri('https://app.example.com'))
      .toBe('https://app.example.com/api/admin/marketing/google-ads/callback');
  });

  it('tolerates a trailing slash rather than producing a double one', () => {
    expect(adsRedirectUri('https://app.example.com/'))
      .toBe('https://app.example.com/api/admin/marketing/google-ads/callback');
  });
});

describe('grantedAdsScope', () => {
  it('accepts the scope on its own', () => {
    expect(grantedAdsScope(ADS_OAUTH_SCOPE)).toBe(true);
  });

  it('accepts it among others, because include_granted_scopes returns a list', () => {
    expect(grantedAdsScope(`openid email ${ADS_OAUTH_SCOPE}`)).toBe(true);
  });

  it('rejects a partial approval that left Ads out', () => {
    expect(grantedAdsScope('openid email profile')).toBe(false);
  });

  it('rejects a near-miss rather than substring-matching it', () => {
    // `…/adwords.readonly` is a different scope and cannot upload. A naive `includes()` on the raw
    // string would accept it.
    expect(grantedAdsScope('https://www.googleapis.com/auth/adwords.readonly')).toBe(false);
  });

  it('treats missing scope as not granted', () => {
    expect(grantedAdsScope(undefined)).toBe(false);
    expect(grantedAdsScope(null)).toBe(false);
    expect(grantedAdsScope('')).toBe(false);
  });
});

describe('normaliseCustomerId', () => {
  it('strips the dashes Google shows but the API rejects', () => {
    // The Ads UI displays 123-456-7890. People copy what they see.
    expect(normaliseCustomerId('123-456-7890')).toBe('1234567890');
  });

  it('handles spaces and stray characters', () => {
    expect(normaliseCustomerId(' 123 456 7890 ')).toBe('1234567890');
  });

  it('is safe on empty input', () => {
    expect(normaliseCustomerId('')).toBe('');
  });
});
