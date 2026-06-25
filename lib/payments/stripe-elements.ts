// lib/payments/stripe-elements.ts
//
// G1 / Phase 1.1 of docs/planning/completed/BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25.md
// — pure helpers for the customer-facing Stripe Elements card form. The
// React component + Stripe SDK calls live in
// app/pay/[invoice]/StripeCardForm.tsx; the pure, branch-heavy bits stay
// here so vitest can lock them without a browser or the Stripe SDK.

/** The browser-side publishable key (NEXT_PUBLIC_ so it's inlined into the
 *  client bundle). Returns null for empty / placeholder / non-`pk_` values
 *  so the UI can fall back to the "call the office" path before go-live. */
export function stripePublishableKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').trim();
  if (!raw) return null;
  // Reject the .env.example placeholders so a copied-but-unfilled env
  // doesn't try to boot Stripe with junk.
  if (raw === 'pk_live_...' || raw === 'pk_test_...' || raw.startsWith('REPLACE')) return null;
  return raw.startsWith('pk_') ? raw : null;
}

/** True when a usable publishable key is present. */
export function cardPaymentConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return stripePublishableKey(env) !== null;
}

/** Where Stripe redirects the customer after a successful confirm — back to
 *  the same invoice with `?paid=1` so the page reloads into its paid state. */
export function buildPayReturnUrl(origin: string, invoiceNumber: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/pay/${encodeURIComponent(invoiceNumber)}?paid=1`;
}

export interface IntentSetupOutcome {
  /** The PaymentIntent client secret, or null when we couldn't start one. */
  clientSecret: string | null;
  /** Customer-facing message when there's no client secret. */
  message: string | null;
  /** true → render the "call the office" fallback (not live / server error). */
  callOffice: boolean;
}

const OFFICE_PHONE = '(936) 662-0077';

/** Pure — turn the `…/intent` route's HTTP status + JSON body into a
 *  client_secret or a friendly message. 503 = not live yet (call office);
 *  409 = already paid; 422 = amount rule; 5xx = server (call office). */
export function interpretIntentResponse(
  status: number,
  body: { client_secret?: unknown; error?: unknown },
): IntentSetupOutcome {
  if (status === 200 && typeof body.client_secret === 'string' && body.client_secret.length > 0) {
    return { clientSecret: body.client_secret, message: null, callOffice: false };
  }
  const err = typeof body.error === 'string' && body.error.length > 0 ? body.error : null;
  if (status === 503) {
    return {
      clientSecret: null,
      message: err ?? `Online card payments aren't enabled yet. Please call ${OFFICE_PHONE}.`,
      callOffice: true,
    };
  }
  if (status === 409) {
    return { clientSecret: null, message: err ?? 'This invoice is already paid in full.', callOffice: false };
  }
  if (status === 422) {
    return { clientSecret: null, message: err ?? "That payment amount isn't allowed for this invoice.", callOffice: false };
  }
  return {
    clientSecret: null,
    message: err ?? `We couldn't start a card payment. Please try again or call ${OFFICE_PHONE}.`,
    callOffice: status >= 500,
  };
}
