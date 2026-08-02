'use client';
// app/AndrewAsh/invoice/[token]/VoiceCardForm.tsx — Stripe Elements, themed to the site.
//
// Card details are entered in an iframe served by Stripe and never touch this application, which is
// what keeps Andrew out of PCI scope entirely. The only thing crossing this boundary is a client
// secret that authorises one payment of one amount.
//
// ── `redirect: 'if_required'` ───────────────────────────────────────────────────────────────────
//
// A card confirm needs no redirect, so the client stays on the invoice and sees it settle. The
// `return_url` is still supplied because 3-D Secure and bank-redirect methods DO leave the page, and
// omitting it makes those fail at confirm time rather than at setup — the least useful moment.
//
// ── SUCCESS HERE IS NOT THE RECORD ──────────────────────────────────────────────────────────────
//
// This component knowing the payment succeeded does not make the invoice paid; the webhook does. So
// the confirmation says the payment went through, and the page may briefly still show a balance while
// Stripe's webhook lands. That is worth a sentence to the client rather than a spinner that waits for
// a state change which might take a few seconds and cannot be waited on reliably.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { interpretIntentResponse } from '@/lib/voice/payments';
import { formatCents } from '@/lib/voice/money';

// One loadStripe per key across re-mounts — it injects a script tag, and calling it per render
// reloads Stripe.js every time the panel is opened and closed.
const cache = new Map<string, Promise<Stripe | null>>();
function getStripe(key: string): Promise<Stripe | null> {
  let p = cache.get(key);
  if (!p) {
    p = loadStripe(key);
    cache.set(key, p);
  }
  return p;
}

// Stripe's fields sit inside an iframe and inherit nothing, so the theme has to be handed over
// explicitly or the form arrives as a bright white rectangle in the middle of a dark page.
const APPEARANCE: Appearance = {
  theme: 'night',
  variables: {
    // Literal hex, NOT var(--va-*), and this is the one place in the tenant where that is correct:
    // these values are serialised and sent to Stripe, which applies them inside its own cross-origin
    // iframe. A CSS custom property has nothing to resolve against there — it would silently fall
    // back to Stripe's defaults and the form would arrive as a white rectangle in a dark page.
    colorPrimary: '#C9A227',
    colorBackground: '#12161F',
    colorText: '#E8E4DB',
    colorTextSecondary: '#9B968C',
    colorDanger: '#E2725B',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSizeBase: '16px',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid rgba(232,228,219,0.16)', boxShadow: 'none', padding: '11px 13px' },
    '.Input:focus': { border: '1px solid #C9A227', boxShadow: '0 0 0 3px rgba(201,162,39,0.18)' },
    '.Label': { fontWeight: '600', letterSpacing: '0.02em' },
    '.Tab, .Block': { borderRadius: '8px' },
    '.Tab--selected': { borderColor: '#C9A227', boxShadow: '0 0 0 1px #C9A227' },
  },
};

interface Props {
  token: string;
  publishableKey: string;
  amountCents: number;
  onPaid: () => void;
}

export default function VoiceCardForm({ token, publishableKey, amountCents, onPaid }: Props): React.ReactElement {
  const stripePromise = useMemo(() => getStripe(publishableKey), [publishableKey]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/voice/pay/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'intent' }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const outcome = interpretIntentResponse(res.status, body);
        setClientSecret(outcome.clientSecret);
        setMessage(outcome.message);
      } catch {
        if (!cancelled) setMessage('Could not reach the payment server. Please try one of the other options.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <p className="vaPayInstruction" role="status">
        <Loader2 size={13} aria-hidden className="vaSpin" style={{ verticalAlign: -2, marginRight: 7 }} />
        Setting up secure checkout…
      </p>
    );
  }

  if (!clientSecret) {
    return (
      <p className="vaPayInstruction" role="status">
        {message ?? 'Card payment is unavailable right now — please use one of the other options.'}
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: APPEARANCE }}>
      <CardFields amountCents={amountCents} onPaid={onPaid} />
    </Elements>
  );
}

function CardFields({ amountCents, onPaid }: { amountCents: number; onPaid: () => void }): React.ReactElement {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (err) {
      setError(err.message ?? 'The payment could not be completed. Please check the details and try again.');
      setSubmitting(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      setSucceeded(true);
      // Give the webhook a moment to land before re-reading the invoice, then refresh. If it has not
      // arrived the page simply still shows a balance, which the message below already explains.
      window.setTimeout(onPaid, 2500);
      return;
    }
    setSubmitting(false);
    setError('The payment is still processing. You will get an email from Stripe when it completes.');
  }

  if (succeeded) {
    return (
      <div style={{ textAlign: 'center', padding: '18px 6px' }}>
        <CheckCircle2 size={28} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 10 }} />
        <p className="vaCardBody" style={{ margin: 0 }}>
          <strong style={{ color: 'var(--va-text)' }}>Payment went through — thank you.</strong>
          <br />
          Stripe has emailed your receipt. This page may take a few seconds to catch up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p className="vaError" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      <button type="submit" className="vaBtn vaBtnSolid" style={{ width: '100%', marginTop: 16 }} disabled={!stripe || submitting}>
        {submitting ? <Loader2 size={14} aria-hidden className="vaSpin" /> : null}
        {submitting ? 'Processing…' : `Pay ${formatCents(amountCents)}`}
      </button>
      <p className="vaHint" style={{ marginTop: 10, textAlign: 'center' }}>
        Handled by Stripe. Card details are entered on Stripe&rsquo;s own form and never reach this site.
      </p>
    </form>
  );
}
