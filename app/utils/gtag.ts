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

// ⚠️ REPLACE 'YOUR_LABEL_HERE' with your actual conversion label from Google Ads
// Example: 'AbCdEfGhIjKlMn' (just the part after the slash)
const CONVERSION_LABEL_SUFFIX = 'TYyMCIa-zvAbEJuG0eFC';

export const CONVERSION_LABEL = `${GA_ADS_ID}/${CONVERSION_LABEL_SUFFIX}`;

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
export function trackConversion(): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: CONVERSION_LABEL,
    });
    console.log('[gtag] Conversion tracked:', CONVERSION_LABEL);
  } else {
    console.warn('[gtag] gtag not available — conversion not tracked');
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