'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { GA_ADS_ID, CONVERSION_LABEL, trackPhoneClick } from '../utils/gtag';

/**
 * The only hosts allowed to talk to the live Google Ads account.
 *
 * Both are listed although the apex 307-redirects to `www`, so nothing is actually served from it —
 * a redirect is one DNS change away from not existing, and losing conversion tracking because
 * somebody pointed the apex at the app directly is a silent, expensive failure.
 */
const PRODUCTION_HOSTS = new Set(['www.starr-surveying.com', 'starr-surveying.com']);

/**
 * Loads the Google Ads global site tag and contact-form conversion tracking.
 *
 * Scripts injected (visible in browser DevTools → Sources / Network):
 *   1. id="google-ads-gtag-loader"    – loads gtag.js for AW-17921491739
 *   2. id="google-ads-gtag-config"    – initialises window.dataLayer / gtag
 *
 * There is no third script. One used to poll /contact for the success text and fire the conversion; it
 * double-counted every lead and was removed on 2026-07-31 — see the long note below, which is kept
 * because the removal is the fix and someone will otherwise "restore" it from the Google support ticket.
 *
 * **This tag is Ads only (`AW-…`).** No GA4 property (`G-…`) is configured on this site — see A10 in
 * docs/planning/.../LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md for why the GA4 mirror is
 * deferred rather than built.
 */
export default function GoogleAdsScript(): React.ReactElement | null {
  // ── WHY THIS IS GATED BY HOSTNAME (added 2026-08-07) ──────────────────────────────────────────
  //
  // This component used to render unconditionally, which meant the LIVE Google Ads tag loaded on
  // every `npm run dev` and on every Vercel preview deployment. Each of those sent page views and
  // remarketing hits into the real advertising account from a domain that is not the website.
  //
  // Google noticed before we did: Tag quality → "Additional domains detected for configuration".
  // The temptation there is to add the detected domains to the tag's configuration, which would
  // make the warning disappear and the pollution permanent. The domains are the problem.
  //
  // Worse than the noise: `trackConversion()` fires on successful form submission, so testing the
  // contact form against a preview build reported a real conversion for a lead that does not exist —
  // and Smart Bidding trains on that.
  //
  // Checked at runtime rather than through NEXT_PUBLIC_VERCEL_ENV because that variable only reaches
  // the browser when the project opts into exposing system environment variables. If it were unset,
  // an env-based check would silently disable tracking in PRODUCTION, which is far worse than the
  // problem being solved. `window.location.hostname` cannot be wrong about where it is running.
  const [onProductionHost, setOnProductionHost] = useState(false);

  useEffect(() => {
    // Escape hatch for deliberately testing the tag on a preview URL. Off unless explicitly set.
    if (process.env.NEXT_PUBLIC_ADS_TAG_FORCE === '1') {
      setOnProductionHost(true);
      return;
    }
    setOnProductionHost(PRODUCTION_HOSTS.has(window.location.hostname));
  }, []);

  // ── PHONE CLICKS, VIA ONE DELEGATED LISTENER ──────────────────────────────────────────────────
  //
  // There are `tel:` links on the home page, /about, /contact, /services, /service-area, /pricing,
  // /resources, the calculator and the footer. Wiring an onClick to each is eleven edits that must be
  // repeated by whoever adds the twelfth — and the one they forget is invisible, because a missing
  // conversion looks exactly like nobody calling.
  //
  // One listener on `document` covers every `tel:` link that exists now or later, including links
  // inside components this file has never heard of.
  useEffect(() => {
    if (!onProductionHost) return;

    // Existing CUSTOMERS use these paths, and they are not leads. Somebody ringing about an invoice
    // they are trying to pay must not be reported as a new enquiry produced by an advertisement.
    const CUSTOMER_PATHS = ['/pay', '/portal', '/proposal', '/change-order'];

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.('a[href^="tel:"]');
      if (!link) return;
      if (CUSTOMER_PATHS.some((p) => window.location.pathname.startsWith(p))) return;

      // Dedupe key. Tapping a number, getting voicemail and tapping again is one lead, not two.
      // Scoped to the session so a genuine call back next week still counts.
      let session = sessionStorage.getItem('ss_visit');
      if (!session) {
        session = Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('ss_visit', session);
      }
      const digits = (link.getAttribute('href') ?? '').replace(/\D/g, '');
      trackPhoneClick(`tel-${digits}-${session}`);
    }

    // Capture phase: a `tel:` tap can begin navigating away, and a bubbling listener sometimes never
    // runs. gtag's transport uses sendBeacon, which survives the page going away.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [onProductionHost]);

  // Nothing rendered anywhere else, so `window.gtag` never exists off production. `trackConversion`
  // already guards on that and logs a console warning instead of throwing.
  if (!onProductionHost) return null;

  return (
    <>
      {/* ================================================================
          GOOGLE ADS CONVERSION TRACKING  –  Account: AW-17921491739
          Provided by Google / Cognizant support (ticket 5-2885000040495)
          ================================================================ */}

      {/* Step 1: Load the Google tag library */}
      <Script
        id="google-ads-gtag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ADS_ID}`}
        strategy="afterInteractive"
      />

      {/* Step 2: Initialise gtag and configure the Ads account */}
      <Script id="google-ads-gtag-config" strategy="afterInteractive">
        {`
          /* GOOGLE ADS – global site tag init (AW-17921491739) */
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ADS_ID}');
        `}
      </Script>

      {/* ================================================================
          STEP 3 — REMOVED 2026-07-31, AND THE REMOVAL IS THE FIX.

          There used to be a third script here that polled `/contact` once a second for up to 30 seconds,
          looking for the literal text "Your request has been received. We will contact you within 24
          business hours." inside `.contact-form-section__success-text`, and fired the conversion when it
          found it. It was supplied with the account setup (Google support ticket 5-2885000040495) and it
          was doing real damage on two counts:

          1. **IT DOUBLE-COUNTED.** `app/contact/page.tsx` ALSO calls `trackConversion()` the moment the
             POST succeeds. Both sent to the same conversion action with no `transaction_id`, so one
             submitted form produced two conversions. Every lead on /contact was counted twice — and
             Smart Bidding was being trained toward a lead count that was not true, which is worse than
             the reporting being wrong.

          2. **IT WAS ONE COPY EDIT FROM SILENCE.** Matching a sentence of user-facing prose means the day
             someone rewords the thank-you message, conversion tracking stops, nothing errors, and the
             account simply goes quiet.

          The explicit `trackConversion(referenceNumber)` call is strictly better: it fires when the
          submission actually succeeded rather than when a DOM node looks a certain way, it works on EVERY
          intake surface rather than only `/contact`, and it now carries the submission's reference number
          as a dedupe key so a retry or a back/forward-cache restore cannot count twice either.
          ================================================================ */}
    </>
  );
}
