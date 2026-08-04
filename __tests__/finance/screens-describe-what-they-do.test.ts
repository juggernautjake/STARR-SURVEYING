// __tests__/finance/screens-describe-what-they-do.test.ts
//
// F7b — a finance screen's own description matches what the screen actually does.
//
// ── THE DRIFT THIS PINS ─────────────────────────────────────────────────────────────────────────
//
// F5 added "Create without sending" so an invoice could be raised for a customer with no email —
// the owner's ask was "invoice anyone for anything". The buttons offered both outcomes. The page
// went on calling itself **"Create + send invoice"** with the lede *"The customer gets an email with
// a one-click payment link."*
//
// F4 added the batch picker. The lede went on describing **one** receipt at a time.
//
// In both cases the capability shipped and the screen's account of itself did not move. That is the
// same defect as a comment that has drifted from its code, and it is worse here: a comment misleads
// the next developer, who can read the code; this misleads the person using the tool, who cannot. A
// reader who concludes "this screen can't invoice someone without an email" goes looking for another
// screen, and there isn't one.
//
// ── WHY IT IS ASSERTED ON THE COPY AND NOT THE BEHAVIOUR ────────────────────────────────────────
//
// The behaviour has its own tests, and it was browser-verified against a production build. What has
// no other instrument is the *agreement between them*. Nothing fails when a page describes a
// capability it no longer has, or omits one it gained — which is precisely why it happened twice.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const invoice = read('app/admin/invoices/new/page.tsx');
const receipt = read('app/admin/receipts/new/page.tsx');

describe('F7b — finance screens describe what they actually do', () => {
  it('reads both pages', () => {
    // Vacuous-pass guard: every assertion below is a substring check, and they all pass on nothing.
    expect(invoice.length).toBeGreaterThan(5000);
    expect(receipt.length).toBeGreaterThan(5000);
  });

  describe('the invoice composer', () => {
    it('still offers both outcomes', () => {
      // The premise of the copy assertions. If a button is removed the copy SHOULD change, and this
      // test should be updated deliberately rather than the copy check failing mysteriously.
      expect(invoice).toContain('Create without sending');
      expect(invoice).toContain('Create + send invoice');
    });

    // Matched as JSX, not located by string offset. Two earlier versions of these assertions used
    // `indexOf`/`lastIndexOf` on the class name: the first landed on the post-submit success heading
    // ("Invoice #### ready"), the second on the `.invoice-page__title { … }` rule in the styles block
    // at the foot of the file. Neither was ever looking at a heading, and both still reported green.
    // Found by running the negative control and reading WHICH assertion failed rather than that one
    // did — a control that fires for the wrong reason is not a passing control.
    const headings = [...invoice.matchAll(/<h1 className="invoice-page__title">([\s\S]*?)<\/h1>/g)]
      .map((m) => m[1].trim());
    const ledes = [...invoice.matchAll(/<p className="invoice-page__lede">([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].trim());

    it('finds the headings and ledes it asserts about', () => {
      expect(headings.length).toBeGreaterThan(0);
      expect(ledes.length).toBeGreaterThan(0);
    });

    it('names the no-email path in its own description, not only on a button', () => {
      // The composer's lede is the STATIC one. The other lede on this page belongs to the
      // post-submit success screen and is a JSX expression over `success.sent` — which contains the
      // word "sent", so selecting by /send/i picked the wrong one and failed against copy that was
      // already correct. Third anchoring mistake in this one test; the file is two screens wearing
      // one set of class names.
      const composerLede = ledes.find((l) => !l.includes('success.'));
      expect(composerLede, 'no static lede found — the composer heading block moved').toBeTruthy();
      expect(composerLede!, 'the lede describes only the emailed path — the F5 ask was the other one')
        .toMatch(/without sending/i);
      expect(composerLede!, 'the lede should say why the no-email path exists')
        .toMatch(/no email|without an email|hand (it )?over/i);
    });

    it('does not title itself as though sending were the only outcome', () => {
      // "Create + send invoice" as the H1 is a promise the screen no longer keeps exclusively.
      expect(headings, 'the composer heading still claims sending is the only outcome')
        .not.toContain('Create + send invoice');
    });
  });

  describe('capture receipt', () => {
    it('still offers the batch picker', () => {
      expect(receipt).toMatch(/multiple|batch/i);
    });

    it('says a batch is possible in its own description, not only in a tooltip', () => {
      // A tooltip is found by someone already reaching for the control. Somebody holding a fortnight
      // of fuel receipts reads the lede and starts uploading them one at a time.
      const lede = receipt.slice(receipt.indexOf('styles.subtitle'), receipt.indexOf('Back to queue'));
      expect(lede.length).toBeGreaterThan(80);
      expect(lede, 'the lede describes one receipt at a time; F4 added the batch').toMatch(/batch|at once/i);
    });

    it('states the accepted file types where the person choosing files will read it', () => {
      // The rejection path is honest and per-file — but being told after the fact is worse than
      // knowing first, and this is the screen where someone picks twenty files in one go.
      const lede = receipt.slice(receipt.indexOf('styles.subtitle'), receipt.indexOf('Back to queue'));
      expect(lede).toMatch(/PDF/i);
    });
  });
});
