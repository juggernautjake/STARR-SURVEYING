// =============================================================================
// Google Ads Conversion Tracking Utility
// =============================================================================
// Google Ads ID: AW-17921491739
//
// HOW TO GET YOUR CONVERSION LABEL:
// 1. Go to Google Ads → Goals → Conversions → Summary
// 2. Click "+ New conversion action"
// 3. Choose "Website" → set up manually
// 4. Name it something like "Website Form Submission"
// 5. Category: "Submit lead form"
// 6. After creating, click "Tag setup" → "Install tag yourself"
// 7. Copy the conversion label from the event snippet
//    (it looks like: 'AW-17921491739/AbCdEfGhIjKlMn')
// 8. Paste JUST the label part below (the part after the slash)
// =============================================================================

export const GA_ADS_ID = 'AW-17921491739';

// Conversion label from Google Ads (the part after the slash in the event snippet)
// Updated to the label provided by Google support (ticket 5-2885000040495, Mar 2026)
const CONVERSION_LABEL_SUFFIX = '-sTrCMb9xP8bEJuG0eFC';

export const CONVERSION_LABEL = `${GA_ADS_ID}/${CONVERSION_LABEL_SUFFIX}`;

// ── PHONE CLICK (added 2026-08-07) ──────────────────────────────────────────────────────────────
//
// A SECOND conversion action, "Phone Click" (category Contact, Secondary), for visitors who tap a
// `tel:` link on the website.
//
// This does NOT overlap the account's existing "Calls from ads" action. That one is Google-native:
// it fires inside the ad unit when someone taps the call button on the ad itself, using a Google
// forwarding number, and the visitor never reaches this site. The path covered here is the other
// one — click the ad, land on the site, read the credentials and the service area, then call — which
// for a surveying firm is very likely the larger of the two and was previously invisible.
//
// Secondary in the Ads UI, deliberately: an intent-to-call is not worth what a paid job is, and a
// Primary action with no dollar value distorts value-based bidding.
const PHONE_CLICK_LABEL_SUFFIX = 'fZ-rCIeQ6N0cEJuG0eFC';

export const PHONE_CLICK_LABEL = `${GA_ADS_ID}/${PHONE_CLICK_LABEL_SUFFIX}`;

// Extend Window interface for TypeScript
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

/**
 * Fires a Google Ads conversion event.
 * Call this after a successful form submission (contact form, calculator estimate, etc.)
 */
export function trackConversion(transactionId?: string): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: CONVERSION_LABEL,
      // DEDUPE KEY. Pass the submission's reference number (`SS-…`) and Google will count a repeated
      // send of the same id ONCE, however it arrives — a double-submit, a retry, a page restored from
      // the back/forward cache. Without it, every duplicate is a real extra conversion in the account,
      // and Smart Bidding is then optimising toward a lead count that is not true.
      ...(transactionId ? { transaction_id: transactionId } : {}),
    });
  } else {
    console.warn('[gtag] gtag not available — conversion not tracked');
  }
}

/**
 * Fires the "Phone Click" conversion when a visitor taps a `tel:` link.
 *
 * `transactionId` is the deduplication key, same idea as `trackConversion`: a visitor who taps the
 * number, gets no answer and taps it again has not produced two leads. Callers pass a value stable
 * for that visitor and number so the repeat is collapsed rather than counted.
 */
export function trackPhoneClick(transactionId?: string): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: PHONE_CLICK_LABEL,
      ...(transactionId ? { transaction_id: transactionId } : {}),
    });
  } else {
    console.warn('[gtag] gtag not available — phone click not tracked');
  }
}

/**
 * Fires a custom Google Analytics event (for additional tracking if needed).
 */
export function trackEvent(
  action: string,
  category: string,
  label?: string,
  value?: number
): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
}