'use client';

// app/pay/page.tsx
//
// P4 of payment-infrastructure-2026-06-18.md — customer landing page.
// One field: invoice number. Submit redirects to /pay/[invoice].
//
// Mobile-first per the plan ("most customers will pay on a phone").
// Brand-aligned hero matches the /contact look (red/navy gradient,
// white card, Sora display + Inter body).

import { useState, FormEvent } from 'react';
import { usePublicFirm } from './usePublicFirm';
import { useRouter } from 'next/navigation';
import '../styles/Pay.css';

export default function PayLandingPage(): React.ReactElement {
  const router = useRouter();
  // Whose portal this is. With one org it resolves to that org; with several it comes from the
  // request's own domain. See app/api/public/tenant/route.ts — it never guesses.
  const { firm } = usePublicFirm();
  const [invoiceInput, setInvoiceInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = invoiceInput.trim();
    if (!trimmed) {
      setError('Please enter your invoice number.');
      return;
    }
    setLoading(true);
    // Light-weight verification before we navigate — keeps the
    // customer from landing on a 404 detail page.
    const res = await fetch(`/api/public/invoice/${encodeURIComponent(trimmed)}`);
    setLoading(false);
    if (res.status === 404) {
      setError("We couldn't find that invoice. Double-check the number on your paper invoice.");
      return;
    }
    if (res.status === 410) {
      setError(firm.phone
        ? `That invoice is no longer available. Please call us at ${firm.phone}.`
        : 'That invoice is no longer available. Please contact us for a new one.');
      return;
    }
    if (!res.ok) {
      setError("Something went wrong looking that up. Please try again.");
      return;
    }
    router.push(`/pay/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="pay-shell" data-testid="pay-landing">
      <section className="pay-hero">
        <div className="pay-hero__card">
          <div className="pay-hero__eyebrow">Pay your invoice</div>
          <h1 className="pay-hero__title">
            {/* The firm this portal belongs to (audit item 8h). Held back until it loads rather
                than flashing a blank or, worse, a default that is somebody else's name. */}
            Welcome to <span className="pay-hero__title-accent">{firm.name}</span>
          </h1>
          <p className="pay-hero__subtitle">
            Enter the invoice number printed on your paper invoice to see your balance
            and choose how you&rsquo;d like to pay.
          </p>

          <form className="pay-lookup" onSubmit={onSubmit} noValidate>
            <label htmlFor="invoice-number" className="pay-lookup__label">
              Invoice number
            </label>
            <input
              id="invoice-number"
              data-testid="pay-invoice-input"
              type="text"
              className="pay-lookup__input"
              placeholder="e.g. SS-260618-A1B2"
              value={invoiceInput}
              onChange={(e) => setInvoiceInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              spellCheck={false}
            />
            <button
              type="submit"
              className="pay-lookup__submit"
              data-testid="pay-invoice-submit"
              disabled={loading}
            >
              {loading ? 'Looking up…' : 'Look up invoice'}
            </button>
            {error && (
              <p className="pay-lookup__error" data-testid="pay-invoice-error" role="alert">
                {error}
              </p>
            )}
          </form>

          {firm.phoneE164 && firm.phone && (
            <p className="pay-lookup__help">
              Can&rsquo;t find your invoice number? Call us at{' '}
              <a href={`tel:${firm.phoneE164}`}>{firm.phone}</a>.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
