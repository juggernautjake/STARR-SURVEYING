import Script from 'next/script';
import { GA_ADS_ID, CONVERSION_LABEL } from '../utils/gtag';

/**
 * Loads the Google Ads global site tag and contact-form conversion tracking.
 *
 * Scripts injected (visible in browser DevTools → Sources / Network):
 *   1. id="google-ads-gtag-loader"    – loads gtag.js for AW-17921491739
 *   2. id="google-ads-gtag-config"    – initialises window.dataLayer / gtag
 *   3. id="google-ads-contact-form-conversion" – polls the /contact page for
 *      the success message and fires the conversion event to
 *      AW-17921491739/-sTrCMb9xP8bEJuG0eFC  (Google support ticket 5-2885000040495)
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
