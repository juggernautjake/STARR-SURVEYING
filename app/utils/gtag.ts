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

// ── GA4 (added 2026-08-25) ──────────────────────────────────────────────────────────────────────
//
// The site had an Ads tag and no analytics property at all, which meant we could see conversions and
// nothing whatsoever about the traffic that did NOT convert. That is precisely the data missing when
// the question is "why did enquiries stop" — an Ads account can say clicks fell, but not whether
// people are landing and leaving, which pages they read, or which form they abandon.
//
// A10 of LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md deferred GA4 in 2026-08-01, and the
// reasoning there is still right about what it deferred: **offline** conversion events sent by
// Measurement Protocol, mirroring our own tables into a second source of truth nobody reads. That is
// not what this is. This is the client-side property — sessions, sources, landing pages, behaviour —
// which our tables cannot produce at all, because they only ever see the people who submit a form.
//
// ── UNSET IS A VALID STATE, AND IT IS THE DEFAULT ───────────────────────────────────────────────
//
// `GA4_MEASUREMENT_ID` is empty until the owner creates the property and sets the env var. Every
// function below no-ops in that state. Nothing here fails, warns, or half-fires; the site behaves
// exactly as it did before GA4 existed. The prefix is asserted because a `G-` id is not
// interchangeable with the `AW-` one, and pasting the wrong one into the wrong variable is the
// obvious mistake — it would send every event to a destination that silently discards it.
const RAW_GA4_ID = (process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? '').trim();

export const GA4_MEASUREMENT_ID = RAW_GA4_ID.startsWith('G-') ? RAW_GA4_ID : '';

/** Whether a GA4 property is configured. Read by the tag component and by the senders below. */
export function ga4Enabled(): boolean {
  return GA4_MEASUREMENT_ID !== '';
}

/**
 * Send one event to GA4, and only to GA4.
 *
 * `send_to` is the whole point: with two destinations configured on one `gtag`, an event with no
 * `send_to` goes to BOTH — so an Ads conversion would also land in GA4 as an event literally named
 * "conversion", and a GA4 event would be offered to the Ads account. Naming the destination on every
 * send is what keeps the two properties reporting their own numbers.
 */
function sendGa4(event: string, params: Record<string, unknown> = {}): void {
  if (!ga4Enabled()) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', event, { send_to: GA4_MEASUREMENT_ID, ...params });
}

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
export function trackConversion(transactionId?: string, formName?: string): void {
  // GA4's own recommended event for a submitted enquiry. Sent alongside the Ads conversion, never
  // instead of it: the two accounts answer different questions and neither reads the other's events.
  //
  // `form_name` is why this is worth sending at all — there are THREE intake surfaces (the home page
  // form, /contact, and the calculator), they convert at different rates, and the Ads account cannot
  // tell them apart because all three fire the same conversion label. Callers that pass nothing are
  // still counted; they just land in an "unspecified" bucket.
  sendGa4('generate_lead', {
    ...(formName ? { form_name: formName } : {}),
    ...(transactionId ? { transaction_id: transactionId } : {}),
  });

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
  // No GA4 recommended event covers "tapped the number", so this is a custom one. Named for the
  // gesture rather than the outcome: the site can observe the tap, and cannot know whether a call
  // connected — an event called `phone_call` would be a claim we have no way to support.
  sendGa4('phone_click', {
    ...(transactionId ? { transaction_id: transactionId } : {}),
  });

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
 * Fires a custom analytics event.
 *
 * ── IT NOW NAMES ITS DESTINATION, AND THAT IS A FIX ─────────────────────────────────────────────
 *
 * This used to call `gtag('event', …)` with no `send_to`. With only the Ads tag configured that was
 * harmless — an unrecognised event name, discarded. With a GA4 property ALSO configured, an event
 * with no destination is delivered to every configured destination, so each of these would have been
 * offered to the advertising account as well. Routed to GA4 explicitly instead.
 *
 * It has no callers today. Kept because it is the correct shape for the next custom event someone
 * wants (a quote-calculator completion, a resource download), and because leaving the un-routed
 * version here would make that next event a bug rather than a feature.
 */
export function trackEvent(
  action: string,
  category: string,
  label?: string,
  value?: number
): void {
  sendGa4(action, {
    event_category: category,
    ...(label ? { event_label: label } : {}),
    ...(typeof value === 'number' ? { value } : {}),
  });
}