// __tests__/marketing/phone-click-conversion.test.ts
//
// "Phone Click" (AW-17921491739/fZ-rCIeQ6N0cEJuG0eFC) covers the call path that nothing was
// measuring: click an ad, land on the site, read the credentials and service area, then tap the
// number. The account's existing "Calls from ads" action does NOT cover this — it fires inside the
// ad unit, on Google's forwarding number, before the visitor ever reaches the site.
//
// Two things here are easy to undo by accident, so they are asserted rather than trusted:
//
//   1. The listener must not fire on the customer paths. Somebody ringing about an invoice they are
//      trying to pay is not a new lead produced by an advertisement, and reporting them as one
//      teaches Smart Bidding to buy clicks from people who already bought.
//   2. The two conversion labels must stay distinct. They differ only in the suffix, and a
//      copy-paste that points phone clicks at the lead-form action would merge two different events
//      into one number with nothing visibly broken.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CONVERSION_LABEL, PHONE_CLICK_LABEL, GA_ADS_ID } from '@/app/utils/gtag';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'app', 'components', 'GoogleAdsScript.tsx'),
  'utf8',
);
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

describe('the two conversion actions stay separate', () => {
  it('uses the same Ads account for both', () => {
    expect(CONVERSION_LABEL.startsWith(`${GA_ADS_ID}/`)).toBe(true);
    expect(PHONE_CLICK_LABEL.startsWith(`${GA_ADS_ID}/`)).toBe(true);
  });

  it('does not point phone clicks at the lead-form action', () => {
    // They differ only after the slash. Merging them would silently double one number and empty another.
    expect(PHONE_CLICK_LABEL).not.toBe(CONVERSION_LABEL);
  });

  it('keeps the label a real one rather than a placeholder', () => {
    expect(PHONE_CLICK_LABEL).toMatch(/^AW-\d+\/[A-Za-z0-9_-]{10,}$/);
  });
});

describe('which taps are reported', () => {
  it('listens for tel: links only', () => {
    // Not mailto: — the action is named "Phone Click" and an email click filed under it is a number
    // that means two different things. Email clicks need their own action if they are ever wanted.
    expect(CODE).toMatch(/a\[href\^="tel:"\]/);
    expect(CODE).not.toMatch(/mailto/);
  });

  it('excludes the paths existing customers use', () => {
    for (const p of ['/pay', '/portal', '/proposal', '/change-order']) {
      expect(CODE, `${p} must not report a phone tap as a new lead`).toContain(`'${p}'`);
    }
    expect(CODE).toMatch(/CUSTOMER_PATHS\.some/);
  });

  it('deduplicates a repeated tap within the session', () => {
    // Tapping, reaching voicemail, and tapping again is one lead. `transaction_id` is what makes
    // Google collapse the repeat.
    expect(CODE).toMatch(/sessionStorage/);
    expect(CODE).toMatch(/trackPhoneClick\(`tel-/);
  });

  it('listens in the capture phase', () => {
    // A tel: tap can start navigating away and a bubbling listener may never run.
    expect(CODE).toMatch(/addEventListener\('click', onClick, true\)/);
    expect(CODE).toMatch(/removeEventListener\('click', onClick, true\)/);
  });

  it('is inert off production, like the tag itself', () => {
    // The gate exists so previews and localhost cannot report conversions. A listener that ran
    // regardless would reintroduce exactly that, one event at a time.
    expect(CODE).toMatch(/if\s*\(!onProductionHost\)\s*return;/);
  });
});
