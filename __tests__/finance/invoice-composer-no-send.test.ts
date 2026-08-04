// FINANCE_TAX_AND_INTAKE Slice F5 — "invoice anyone for anything".
//
// Checked before building, per the standing rule, and most of it was already true: the API requires
// only a line item, `job_id` is a nullable FK, and the customer is typed free-form. So the composer
// could already invoice a person with no job attached.
//
// The one thing it could NOT do was invoice someone whose email you do not have — a neighbour paying
// cash, a contractor you will text the link to, anyone handed a printed invoice — because the
// composer created and sent in one action and required an email to do either. That restriction lived
// entirely in the page; the API never asked for an email.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/invoices/new/page.tsx'), 'utf8');
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('the invoice can be created without being emailed', () => {
  it('offers a create-without-sending action', () => {
    expect(code).toContain('invoice-create-only');
    expect(code).toContain('createInvoice(false)');
  });

  it('requires an email only on the send path', () => {
    // The check that blocked the whole use case. It must be conditional on `send`, not on nothing.
    expect(code).toMatch(/if \(send && !customer\.customer_email\.trim\(\)\)/);
  });

  it('still refuses an invoice addressed to nobody', () => {
    // Not a formality: an invoice with no name and no email cannot be chased, reconciled against a
    // payment, or found again in the dashboard.
    expect(code).toMatch(/!send && !customer\.customer_name\.trim\(\) && !customer\.customer_email\.trim\(\)/);
  });

  it('does not call the send endpoint when not sending', () => {
    const fn = code.slice(code.indexOf('async function createInvoice'));
    const body = fn.slice(0, fn.indexOf('if (success)'));
    // The early return must come before the send fetch, or "without sending" would still send.
    expect(body.indexOf('if (!send)')).toBeLessThan(body.indexOf('/send'));
  });

  it('produces a pay link for an unsent invoice', () => {
    // A not-sent invoice is the same record, not a lesser one — it has a slug and is just as
    // payable. Without this the action would create something nobody could pay.
    expect(code).toContain('/pay/${invoice.public_slug}');
  });
});

describe('a chosen outcome is not reported as a fault', () => {
  it('distinguishes "not sent on purpose" from "sending failed"', () => {
    // The previous copy said "email send did not complete" for every unsent invoice, which on this
    // path would call the intended result a failure.
    expect(code).toContain('notSentByChoice');
    expect(code).toMatch(/not emailed/i);
  });
});
