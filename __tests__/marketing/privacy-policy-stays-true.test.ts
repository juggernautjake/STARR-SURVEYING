// __tests__/marketing/privacy-policy-stays-true.test.ts
//
// The privacy policy at /privacy is not marketing copy — it is a representation about what the code
// actually does, made to customers and to Google's OAuth reviewers. Three of its claims are specific
// enough to be falsified by an ordinary future change that nobody would think of as a privacy change:
//
//   • "There is no Google Analytics property installed."
//   • "We do not store your actual IP address" — only a one-way hash.
//   • "We do not send your name, email address, phone number, property address, or any other
//      personal detail to Google."
//
// Adding a GA4 tag, or storing a raw IP, or adding an identifier to the conversion payload, would each
// silently turn a published legal statement into a false one. This file makes the policy fail loudly
// instead — the fix is to update the policy in the same commit, not to delete the assertion.
//
// It also guards reachability. An unlinked policy page fails Google's verification exactly as hard as
// a missing one, and "authored but not wired" is this repository's most common defect.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const POLICY = read('app', 'privacy', 'page.tsx');
const FOOTER = read('app', 'components', 'Footer.tsx');
const SITEMAP = read('app', 'sitemap.ts');
const ADS_SCRIPT = read('app', 'components', 'GoogleAdsScript.tsx');
const INTAKE = read('lib', 'leads', 'intake.ts');
const ADS_CLIENT = read('lib', 'integrations', 'google-ads', 'client.ts');

describe('the policy page is reachable', () => {
  it('exists as a public route', () => {
    expect(fs.existsSync(path.join(root, 'app', 'privacy', 'page.tsx'))).toBe(true);
  });

  it('is linked from the site footer, so it appears on every page', () => {
    // Google's OAuth review looks for a policy discoverable from the site, not just a URL that
    // resolves when you already know it.
    expect(FOOTER).toMatch(/href:\s*'\/privacy'/);
  });

  it('is listed in the sitemap', () => {
    expect(SITEMAP).toMatch(/\/privacy`/);
  });

  it('has an effective date', () => {
    // A policy with no date cannot be shown to have been in force at any particular time.
    expect(POLICY).toMatch(/EFFECTIVE_DATE\s*=\s*'[A-Z][a-z]+ \d{1,2}, \d{4}'/);
  });
});

describe('claims the policy makes about advertising', () => {
  it('is still true that no GA4 property is installed', () => {
    // The policy states plainly: "There is no Google Analytics property installed." A GA4 measurement
    // ID is `G-XXXXXXXXXX`; the Ads tag is `AW-…`. If someone adds GA4, the policy must gain a
    // paragraph describing analytics collection before this test is changed.
    expect(ADS_SCRIPT).not.toMatch(/['"`]G-[A-Z0-9]{6,}['"`]/);
    expect(read('app', 'utils', 'gtag.ts')).toMatch(/GA_ADS_ID\s*=\s*'AW-/);
  });

  it('is still true that only a click id, a time and an amount go to Google', () => {
    // The `ClickConversion` payload is the complete set of fields we upload. The policy promises no
    // name, email, phone, or address is among them.
    const raw = ADS_CLIENT.match(/export interface ClickConversion \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(raw, 'ClickConversion interface not found — did it move?').not.toBe('');
    // Comments describe the fields ("the Ads resource NAME of the conversion action") and would score
    // as personal data. Only the declarations are the payload.
    const fields = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').toLowerCase();
    for (const forbidden of ['email', 'phone', 'name', 'address', 'firstname', 'lastname', 'hashed']) {
      expect(
        fields,
        `ClickConversion gained a "${forbidden}" field; /privacy says we never send personal details to Google`,
      ).not.toContain(forbidden);
    }
  });
});

describe('claims the policy makes about what we store', () => {
  it('is still true that the visitor IP is hashed rather than stored raw', () => {
    // The policy says, in bold: "We do not store your actual IP address."
    expect(INTAKE).toMatch(/client_ip_hash/);
    // A plain `client_ip` / `ip_address` column would make that sentence false.
    expect(INTAKE).not.toMatch(/\bclient_ip\b(?!_hash)/);
    expect(INTAKE).not.toMatch(/\bip_address\b/);
  });
});

describe('the policy covers what the forms actually collect', () => {
  // If intake starts collecting a new category of personal information, the policy's list is no
  // longer complete. These are the fields it enumerates today.
  const DISCLOSED = ['name', 'email', 'phone', 'property_address', 'survey_type', 'estimated_acreage'];

  it.each(DISCLOSED)('discloses that we collect %s', (field) => {
    expect(INTAKE, `${field} is not written by intake — is the policy describing a stale form?`)
      .toMatch(new RegExp(`\\b${field}\\b`));
  });

  it('names every third-party processor it shares with', () => {
    for (const provider of ['Vercel', 'Supabase', 'Stripe', 'Resend', 'Twilio', 'Google']) {
      expect(POLICY, `${provider} is missing from the sharing table`).toContain(provider);
    }
  });
});
