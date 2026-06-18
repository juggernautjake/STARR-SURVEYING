// __tests__/admin/payment-pledge-cash-check.test.ts
//
// P7 of payment-infrastructure-2026-06-18.md — locks the cash /
// check pledge flow:
//   - lib/payments/invoice-email.ts gains buildPledgeConfirmation*
//   - app/api/public/invoice/[number]/attempt/route.ts fires the
//     pledge confirmation email when method is cash / check + the
//     customer left an email
//   - app/pay/[invoice]/page.tsx switches cash + check methods into
//     the pledge strip (delivery selector: mail vs in person),
//     records the attempt, and shows the office mailing address in
//     the thank-you panel when the customer is mailing it

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPledgeConfirmationHtml,
  buildPledgeConfirmationSubject,
  buildPledgeConfirmationText,
} from '@/lib/payments/invoice-email';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('buildPledgeConfirmationSubject (pure)', () => {
  it("labels by method + invoice number", () => {
    expect(buildPledgeConfirmationSubject({ method: 'cash', invoice_number: 'SS-260618-A1B2' }))
      .toBe('Cash payment confirmed — Invoice SS-260618-A1B2');
    expect(buildPledgeConfirmationSubject({ method: 'check', invoice_number: 'SS-X' }))
      .toBe('Check payment confirmed — Invoice SS-X');
  });
});

describe('buildPledgeConfirmationHtml + Text (pure)', () => {
  const base = {
    invoice_number: 'SS-260618-A1B2',
    customer_name: 'Mary Smith',
    amount_cents: 125000,
    office_address_line1: '3779 W FM 436',
    office_address_line2: 'Belton, TX 76513',
    pay_link: 'https://starr-surveying.com/pay/ABCD1234XYZ56789',
  };

  it("renders the office mailing address in both formats", () => {
    const html = buildPledgeConfirmationHtml({ ...base, method: 'check', is_mailing: true });
    expect(html).toContain('3779 W FM 436');
    expect(html).toContain('Belton, TX 76513');
    const text = buildPledgeConfirmationText({ ...base, method: 'check', is_mailing: true });
    expect(text).toContain('3779 W FM 436');
    expect(text).toContain('Belton, TX 76513');
  });

  it("only shows 'Make checks payable to' for the check method", () => {
    const checkHtml = buildPledgeConfirmationHtml({ ...base, method: 'check', is_mailing: true });
    expect(checkHtml).toContain('Make checks payable to');
    const cashHtml = buildPledgeConfirmationHtml({ ...base, method: 'cash', is_mailing: false });
    expect(cashHtml).not.toContain('Make checks payable to');
  });

  it("phrasing flips between in-person + by-mail variants", () => {
    const mail = buildPledgeConfirmationHtml({ ...base, method: 'check', is_mailing: true });
    expect(mail).toContain("Mail your check to the address above");
    const inPerson = buildPledgeConfirmationHtml({ ...base, method: 'cash', is_mailing: false });
    expect(inPerson).toContain('ask for Hank');
  });

  it("HTML-escapes hostile customer names", () => {
    const html = buildPledgeConfirmationHtml({ ...base, customer_name: '<img onerror=alert(1)>', method: 'cash', is_mailing: false });
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toMatch(/&lt;img onerror=alert\(1\)&gt;/);
  });

  it("embeds the pay link as a return-to-portal CTA", () => {
    const html = buildPledgeConfirmationHtml({ ...base, method: 'cash', is_mailing: false });
    expect(html).toContain('data-testid="pledge-link"');
    expect(html).toContain(base.pay_link);
  });

  it("text fallback contains the pay link + the customer's amount", () => {
    const text = buildPledgeConfirmationText({ ...base, method: 'check', is_mailing: true });
    expect(text).toContain(base.pay_link);
    expect(text).toContain('$1,250.00');
  });
});

describe('attempt route — P7 pledge email side-effect', () => {
  const SRC = read('app/api/public/invoice/[number]/attempt/route.ts');

  it("only fires the confirmation email for cash / check WITH a payer email", () => {
    expect(SRC).toMatch(/\(method === 'cash' \|\| method === 'check'\) && row\.payer_email/);
  });

  it("uses the brand From + Resend HTTP API (no SDK dependency)", () => {
    expect(SRC).toMatch(/fetch\('https:\/\/api\.resend\.com\/emails'/);
    expect(SRC).toMatch(/Starr Surveying <info@starr-surveying\.com>/);
  });

  it("builds the body via the pure pledge helpers", () => {
    expect(SRC).toMatch(/buildPledgeConfirmationSubject/);
    expect(SRC).toMatch(/buildPledgeConfirmationHtml/);
    expect(SRC).toMatch(/buildPledgeConfirmationText/);
  });

  it("uses the office mailing address constants (one source of truth)", () => {
    expect(SRC).toMatch(/OFFICE_ADDRESS_LINE1/);
    expect(SRC).toMatch(/OFFICE_ADDRESS_LINE2/);
  });

  it("returns pledge_email_sent + pledge_email_error on the response", () => {
    expect(SRC).toMatch(/pledge_email_sent: pledgeEmailSent/);
    expect(SRC).toMatch(/pledge_email_error: pledgeEmailError/);
  });

  it("tolerates missing RESEND_API_KEY (dev mode) — still marks as sent", () => {
    expect(SRC).toMatch(/\[pledge\] DEV — would send to/);
    expect(SRC).toMatch(/pledgeEmailSent = true/);
  });

  it("passes is_mailing through from the request body when provided", () => {
    expect(SRC).toMatch(/\(typeof body\.is_mailing === 'boolean'\) \? body\.is_mailing : method === 'check'/);
  });
});

describe('app/pay/[invoice]/page.tsx — P7 pledge UI', () => {
  const SRC = read('app/pay/[invoice]/page.tsx');

  it("cash + check no longer route to the not-yet toast; they enter the pledge strip", () => {
    expect(SRC).toMatch(/method\.action === 'pledge'/);
    expect(SRC).toMatch(/setPledgeIsMailing\(method\.id === 'check'\)/);
    expect(SRC).toMatch(/setAttemptMethod\(method\.id\)/);
  });

  it("renders a delivery selector (mail vs in person)", () => {
    expect(SRC).toMatch(/data-testid="pay-pledge-delivery"/);
    expect(SRC).toMatch(/I'll mail it/);
    expect(SRC).toMatch(/I'll bring it in person/);
  });

  it("submit POSTs is_mailing alongside method + intended_amount + payer_email", () => {
    expect(SRC).toMatch(/isPledge \? \{ is_mailing: pledgeIsMailing \} : \{\}/);
  });

  it("post-submit thank-you panel renders the office mailing address when mailing", () => {
    expect(SRC).toMatch(/data-testid="pay-pledge-mailing-addr"/);
    expect(SRC).toMatch(/3779 W FM 436/);
    expect(SRC).toMatch(/Belton, TX 76513/);
  });

  it("post-submit pledge testids distinct from the deeplink testids", () => {
    // Pay page uses a ternary so the testids are quoted bare strings.
    expect(SRC).toMatch(/'pay-pledge-confirm'/);
    expect(SRC).toMatch(/'pay-pledge-submit'/);
    expect(SRC).toMatch(/'pay-pledge-received'/);
    // Deep-link testids still present.
    expect(SRC).toMatch(/'pay-attempt-confirm'/);
    expect(SRC).toMatch(/'pay-attempt-received'/);
  });
});

describe('P7 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan still references the cash + check pledge scope", () => {
    expect(PLAN).toMatch(/Cash \/ check pledge/);
  });

  it("plan still pins the confirmation-email-with-mailing-address detail", () => {
    expect(PLAN).toMatch(/company mailing address/);
  });
});
