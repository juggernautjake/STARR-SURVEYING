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

      {/* Step 3: Contact-form conversion snippet
          Fires gtag conversion event to ${CONVERSION_LABEL}
          when the contact form success message appears on /contact.
          NOTE: The success message text below must match the text rendered by
          ContactForm inside .contact-form-section__success-text exactly. */}
      <Script id="google-ads-contact-form-conversion" strategy="afterInteractive">
        {`
          /* ============================================================
             GOOGLE ADS – Contact Form Conversion Tracking
             Conversion action : ${CONVERSION_LABEL}
             Fires when        : .contact-form-section__success-text
                                 contains the success message on /contact
             Source            : Google support ticket 5-2885000040495
             ============================================================ */
          window.addEventListener('load', function() {
            if (window.location.href.indexOf('/contact') !== -1) {
              var _convFired = 0;
              var _convAttempts = 0;
              var _convMaxAttempts = 30; /* stop polling after 30 seconds */
              var _convTimer = setInterval(function() {
                _convAttempts++;
                if (_convAttempts >= _convMaxAttempts) {
                  clearInterval(_convTimer);
                  return;
                }
                if (_convFired === 0) {
                  var el = document.querySelector('.contact-form-section__success-text');
                  if (el && el.innerText.includes('Your request has been received. We will contact you within 24 business hours.')) {
                    gtag('event', 'conversion', {'send_to': '${CONVERSION_LABEL}'});
                    clearInterval(_convTimer);
                    _convFired = 1;
                  }
                }
              }, 1000);
            }
          });
        `}
      </Script>
    </>
  );
}
