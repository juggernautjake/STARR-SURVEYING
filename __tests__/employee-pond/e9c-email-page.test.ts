// __tests__/employee-pond/e9c-email-page.test.ts
//
// employee-pond Slice E9c — in-app email composer page +
// /api/admin/email/send endpoint + EmployeePond Email button
// switched from mailto: to /admin/email/new?to=<email>.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/email/new — composer page', () => {
  const SRC = read('app/admin/email/new/page.tsx');

  it("declares 'use client' so React hooks land", () => {
    expect(SRC).toMatch(/'use client';/);
  });

  it('imports the shared recipient store + helpers', () => {
    expect(SRC).toMatch(/from '@\/lib\/employee-pond\/messenger-recipient'/);
    expect(SRC).toMatch(/readActiveRecipient/);
    expect(SRC).toMatch(/saveActiveRecipient/);
    expect(SRC).toMatch(/normalizeRecipientEmail/);
  });

  it("hydrates the recipient from ?to= first, then the shared store", () => {
    expect(SRC).toMatch(/normalizeRecipientEmail\(searchParams\?\.get\('to'\) \?\? ''\)/);
    expect(SRC).toMatch(/return readActiveRecipient\(\) \?\? ''/);
  });

  it('persists the recipient back to the shared store as the user types a valid email', () => {
    expect(SRC).toMatch(/if \(!\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\/\.test\(to\)\) return;/);
    expect(SRC).toMatch(/saveActiveRecipient\(to\)/);
  });

  it('renders the three form fields with stable testIDs (to / subject / body)', () => {
    expect(SRC).toMatch(/data-testid="email-compose-to"/);
    expect(SRC).toMatch(/data-testid="email-compose-subject"/);
    expect(SRC).toMatch(/data-testid="email-compose-body"/);
  });

  it('Send button POSTs to /api/admin/email/send with { to, role, subject, body }', () => {
    // EM4 added optional role-broadcast, so the payload now carries `role`
    // (omitted when empty) alongside to/subject/body.
    expect(SRC).toMatch(/fetch\('\/api\/admin\/email\/send', \{[\s\S]*?body: JSON\.stringify\(\{ to, role: role \|\| undefined, subject, body \}\)/);
  });

  it('reports sent / error states via role="status" / role="alert"', () => {
    expect(SRC).toMatch(/role="status"/);
    expect(SRC).toMatch(/role="alert"/);
  });

  it('disables the Send button while sending so the user can\'t double-fire', () => {
    expect(SRC).toMatch(/disabled=\{sendState === 'sending'\}/);
  });
});

describe('/api/admin/email/send — POST endpoint', () => {
  const SRC = read('app/api/admin/email/send/route.ts');

  it('admin-gates the endpoint (signed-in + isAdmin)', () => {
    expect(SRC).toMatch(/if \(!session\?\.user\?\.email\) \{[\s\S]*?Unauthorized/);
    expect(SRC).toMatch(/if \(!isAdmin\(session\.user\.roles\)\) \{[\s\S]*?Forbidden/);
  });

  it('validates the email shape + requires subject + body', () => {
    // EM4 made the route multi-recipient, so the "to" guard is now phrased as
    // "At least one recipient is required" (after parsing the address field).
    expect(SRC).toMatch(/At least one recipient is required/);
    expect(SRC).toMatch(/Recipient email looks invalid/);
    expect(SRC).toMatch(/Subject is required/);
    expect(SRC).toMatch(/Body is required/);
  });

  it('dev-mode short-circuits without a real Resend key (so the UI flow is reachable)', () => {
    expect(SRC).toMatch(/if \(!RESEND_API_KEY \|\| RESEND_API_KEY === 'your_resend_api_key'\)/);
    // The dev short-circuit still returns success+dev; EM4/EM5 added send-count
    // + recipients to the payload, so match the prefix rather than the exact `}`.
    expect(SRC).toMatch(/return NextResponse\.json\(\{ success: true, dev: true/);
  });

  it("POSTs Resend with reply_to set to the sender's email so recipient → reply lands correctly", () => {
    expect(SRC).toMatch(/reply_to: senderEmail/);
  });

  it('handles Resend non-2xx + network errors with a 502 + clean message', () => {
    // EM4 batches one send per recipient. A non-2xx response AND a thrown
    // network error are both caught and counted in `failed`; if every recipient
    // fails the route returns a single 502 with a clean "service error" message
    // (the provider's raw error is never leaked to the client).
    expect(SRC).toMatch(/if \(!response\.ok\)[\s\S]*?failed\.push\(addr\)/);
    expect(SRC).toMatch(/catch \(err\)[\s\S]*?failed\.push\(addr\)/);
    expect(SRC).toMatch(/Failed to send email — service error[\s\S]*?status: 502/);
  });

  it('escapes user HTML so a hostile body can\'t inject markup', () => {
    expect(SRC).toMatch(/function escapeHtml\(s: string\)/);
    expect(SRC).toMatch(/\.replace\(\/&\/g, '&amp;'\)/);
  });
});

describe('EmployeePond.tsx — E9c Email button now routes to the in-app composer', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('Email button href is /admin/email/new?to=<encoded>', () => {
    expect(SRC).toMatch(/href=\{`\/admin\/email\/new\?to=\$\{encodeURIComponent\(selectedEmployee\.email\)\}`\}/);
  });

  it('no longer uses mailto: on the Email button', () => {
    // The dialogue Email button must not fall back to OS mail.
    const block = SRC.match(/data-action="contact-email"[\s\S]*?<\/a>/);
    expect(block).toBeTruthy();
    expect(block?.[0] ?? '').not.toMatch(/mailto:/);
  });
});

describe('EmailCompose.css — E9c surface', () => {
  const CSS = read('app/admin/styles/EmailCompose.css');

  it('Send button uses brand-navy and 44pt min-height (mobile-friendly)', () => {
    expect(CSS).toMatch(/\.email-compose__send \{[\s\S]*?background: var\(--color-brand-navy\)[\s\S]*?min-height: 44px/);
  });

  it('status row uses success/error tokens', () => {
    expect(CSS).toMatch(/\.email-compose__status--success \{[\s\S]*?color: var\(--color-success\)/);
    expect(CSS).toMatch(/\.email-compose__status--error \{[\s\S]*?color: var\(--color-error\)/);
  });

  it('no drift names', () => {
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
