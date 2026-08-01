import Script from 'next/script';
import { GA_ADS_ID, CONVERSION_LABEL } from '../utils/gtag';

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
export default function GoogleAdsScript(): React.ReactElement {
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
