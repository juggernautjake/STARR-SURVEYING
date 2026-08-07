// __tests__/marketing/ads-tag-is-production-only.test.ts
//
// Google's own diagnostic found this one: Tag quality → "Additional domains detected for
// configuration". `GoogleAdsScript` rendered unconditionally, so the LIVE Ads tag loaded on every
// `npm run dev` and every Vercel preview deployment, sending page views and remarketing hits into the
// real advertising account from domains that are not the website.
//
// The costly half is not the noise. `trackConversion()` fires on successful form submission, so
// testing the contact form on a preview build reported a REAL conversion for a lead that does not
// exist — and Smart Bidding trains on that number.
//
// The tempting non-fix is to add the detected domains to the tag configuration in Google's UI, which
// silences the warning and makes the pollution permanent. These assertions exist so the gate is not
// quietly removed later by someone who finds it inconvenient that the tag "doesn't work locally".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'app', 'components', 'GoogleAdsScript.tsx'),
  'utf8',
);

/** Comments explain the gate at length and would satisfy a naive match on their own. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

describe('the live Ads tag only loads on the real website', () => {
  it('gates rendering on the hostname', () => {
    expect(CODE).toMatch(/PRODUCTION_HOSTS/);
    expect(CODE).toMatch(/window\.location\.hostname/);
  });

  it('returns nothing when the host does not match', () => {
    // Without this early return the scripts render regardless of what the check decided.
    expect(CODE).toMatch(/if\s*\(!onProductionHost\)\s*return null/);
  });

  it('allows both the apex and the www host', () => {
    // The apex 307-redirects to www today. That is a DNS setting, not a guarantee — if it ever
    // serves the app directly, tracking must not silently stop.
    expect(SRC).toContain("'www.starr-surveying.com'");
    expect(SRC).toContain("'starr-surveying.com'");
  });

  it('does not gate on a Vercel env var instead', () => {
    // NEXT_PUBLIC_VERCEL_ENV only reaches the browser if the project opts into exposing system
    // variables. If it were unset, an env-based gate would disable tracking in PRODUCTION — the
    // failure this fix must never introduce, and one nobody would notice for weeks.
    expect(CODE).not.toMatch(/NEXT_PUBLIC_VERCEL_ENV/);
  });

  it('is a client component, since the check needs the browser', () => {
    expect(SRC.trimStart().startsWith("'use client'")).toBe(true);
  });
});

describe('the misconfiguration this replaced', () => {
  it('no longer renders the tag unconditionally', () => {
    // The old signature was `(): React.ReactElement` with an immediate `return (`. A future edit that
    // restores an unconditional return also restores the defect.
    expect(CODE).toMatch(/React\.ReactElement \| null/);
  });
});
