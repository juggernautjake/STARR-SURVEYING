// __tests__/admin/home-contact-info-email.test.ts
//
// home-contact-info-email-2026-06-18 — the /contact page already
// surfaced info@starr-surveying.com in its contact-info column. The
// home page form was missing it — customers reading the home page
// had no way to know where to email if they preferred email over the
// form. Audit gap surfaced when the user asked us to confirm that
// "the proper info email is listed on the request forms".
//
// Locks the home-page form callout: visible email address + mailto
// link + explicit mention of attachments so the customer knows email
// works the same way as the form.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('home page — info email callout', () => {
  const SRC = read('app/page.tsx');

  it('renders info@starr-surveying.com near the Request a Quote form', () => {
    expect(SRC).toMatch(/Prefer email\? Write us at[\s\S]{0,200}?info@starr-surveying\.com/);
  });

  it('links the address with a mailto so one tap opens the mail client', () => {
    expect(SRC).toMatch(/href="mailto:info@starr-surveying\.com"/);
  });

  it('reminds the customer attachments work over email too', () => {
    expect(SRC).toMatch(/attach any photos, deeds, or plats/);
  });

  it("does NOT promise to reply from the same email address", () => {
    // hank-cc-2026-06-18 — the user explicitly asked us not to make
    // this promise; replies may come from any of the team's emails.
    expect(SRC).not.toMatch(/respond from the same address/i);
    expect(SRC).not.toMatch(/reply from the same/i);
  });
});

describe('contact-route EMAIL_RECIPIENTS — one copy to the info@ group', () => {
  const SRC = read('app/api/contact/route.ts');

  it('sends the business notification to info@ only (the group delivers it to everyone)', () => {
    expect(SRC).toMatch(/const EMAIL_RECIPIENTS = \[\s*'info@starr-surveying\.com',\s*\];/);
  });

  it('does not also send to members directly (no duplicate copies)', () => {
    expect(SRC).not.toMatch(/const EMAIL_RECIPIENTS = \[[\s\S]{0,400}'hankmaddux@starr-surveying\.com'/);
    expect(SRC).not.toMatch(/const EMAIL_RECIPIENTS = \[[\s\S]{0,400}'starrsurveying@yahoo\.com'/);
  });
});

describe('home contact CSS — direct-email callout styling', () => {
  const SRC = read('app/styles/Home.css');

  it('defines the .home-contact__direct-email callout block', () => {
    expect(SRC).toMatch(/\.home-contact__direct-email \{/);
    expect(SRC).toMatch(/border-left:\s*3px solid var\(--brand-blue, #1D3095\)/);
  });

  it('wraps long emails so the link never overflows the callout', () => {
    expect(SRC).toMatch(/\.home-contact__direct-email-link \{[\s\S]{0,400}overflow-wrap:\s*anywhere/);
  });
});
