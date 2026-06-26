'use client';

// app/pay/[invoice]/StripeCardForm.tsx
//
// G1 / Phase 1.1 of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — the
// customer-facing Stripe Elements card form. The PaymentIntent is created by
// the existing backend route (app/api/public/invoice/[number]/intent, which
// returns { client_secret }); this component mounts <PaymentElement>,
// confirms the payment, and redirects to ?paid=1 on success.
//
// Styling matches the rest of the /pay portal (Pay.css): the wrapper mirrors
// the P6 "I sent it" confirm strip, and the Stripe Elements appearance is
// themed to the Starr brand (navy #1D3095 / red #BD1218, Inter font) so the
// card fields don't look like stock Stripe.
//
// The page only mounts this when a publishable key is configured. When
// PAYMENTS_LIVE is off the intent route returns 503 and we show the
// call-the-office fallback — so this is safe to ship before go-live.

import { useEffect, useMemo, useState, type ReactElement, type FormEvent } from 'react';
import { loadStripe, type Stripe, type Appearance } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatDollars } from '@/lib/payments/live';
import {
  stripePublishableKey,
  buildPayReturnUrl,
  interpretIntentResponse,
} from '@/lib/payments/stripe-elements';

// Module-level singleton so loadStripe runs once across re-mounts.
let _stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> | null {
  const key = stripePublishableKey();
  if (!key) return null;
  if (!_stripePromise) _stripePromise = loadStripe(key);
  return _stripePromise;
}

// Brand-matched Stripe Elements theme (Pay.css palette + Inter).
const STRIPE_APPEARANCE: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#1D3095',
    colorText: '#152050',
    colorTextSecondary: '#4a5470',
    colorDanger: '#BD1218',
    colorBackground: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSizeBase: '16px',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #d6d9e3', boxShadow: 'none', padding: '10px 12px' },
    '.Input:focus': { border: '1px solid #1D3095', boxShadow: '0 0 0 3px rgba(29, 48, 149, 0.15)' },
    '.Label': { fontWeight: '600', color: '#4a5470' },
    '.Tab, .Block': { borderRadius: '10px' },
    '.Tab:focus, .Tab--selected': { borderColor: '#1D3095', boxShadow: '0 0 0 1px #1D3095' },
  },
};

interface Props {
  invoiceNumber: string;
  amountCents: number;
  onCancel: () => void;
}

export default function StripeCardForm({ invoiceNumber, amountCents, onCancel }: Props): ReactElement {
  const stripePromise = useMemo(() => getStripe(), []);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function start(): Promise<void> {
      setLoading(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/public/invoice/${encodeURIComponent(invoiceNumber)}/intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount_cents: amountCents }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const outcome = interpretIntentResponse(res.status, body);
        setClientSecret(outcome.clientSecret);
        setMessage(outcome.message);
      } catch {
        if (!cancelled) setMessage("We couldn't reach the payment server. Please call (936) 662-0077.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [invoiceNumber, amountCents]);

  if (loading) {
    return (
      <div className="pay-card-form" data-testid="pay-card-form-loading" role="status">
        <p className="pay-card-form__msg">Starting secure checkout…</p>
      </div>
    );
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div className="pay-card-form" data-testid="pay-card-form-unavailable" role="status">
        <p className="pay-card-form__msg">{message ?? 'Card payment is unavailable right now.'}</p>
        <div className="pay-methods__confirm-actions">
          <button type="button" className="pay-methods__confirm-cancel" onClick={onCancel}>
            Back to payment options
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pay-card-form" data-testid="pay-card-form">
      <div className="pay-card-form__head">
        <span className="pay-card-form__title">Pay securely by card</span>
        <span className="pay-card-form__secure" aria-hidden="true">🔒 Encrypted by Stripe</span>
      </div>
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
        <CardFields invoiceNumber={invoiceNumber} amountCents={amountCents} onCancel={onCancel} />
      </Elements>
    </div>
  );
}

function CardFields({
  invoiceNumber,
  amountCents,
  onCancel,
}: {
  invoiceNumber: string;
  amountCents: number;
  onCancel: () => void;
}): ReactElement {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: buildPayReturnUrl(window.location.origin, invoiceNumber) },
    });
    // Reaching this line means confirmation failed — success redirects away.
    setSubmitting(false);
    setError(err?.message ?? 'Payment could not be completed. Please try again.');
  }

  return (
    <form onSubmit={onSubmit} data-testid="pay-card-fields">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p className="pay-methods__confirm-error" role="alert" data-testid="pay-card-error">
          {error}
        </p>
      )}
      <div className="pay-methods__confirm-actions">
        <button type="button" className="pay-methods__confirm-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          type="submit"
          className="pay-methods__confirm-yes"
          disabled={!stripe || submitting}
          data-testid="pay-card-submit"
        >
          {submitting ? 'Processing…' : `Pay ${formatDollars(amountCents)}`}
        </button>
      </div>
      <p className="pay-card-form__foot">
        Powered by Stripe — your card details are encrypted and never touch our servers.
      </p>
    </form>
  );
}
