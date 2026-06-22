'use client';

// app/components/PayInvoiceCTA.tsx
//
// payment-portal-discoverability-2026-06-22 — S2 of
// payment-portal-discoverability-and-deferred-buildout-2026-06-22.md.
//
// Shared "Need to make a payment?" call-to-action that drops into any
// public marketing page. Centralizes the copy + styling so the
// pattern reads consistently across /contact, /services, the home
// page, and /pricing. One variable here changes wording everywhere.

import React from 'react';
import Link from 'next/link';
import './PayInvoiceCTA.css';

type Variant = 'ribbon' | 'inline' | 'chip';

interface Props {
  /** Visual treatment:
   *  - "ribbon" (default): full-width hero-style bar suited for the
   *    bottom of a long page (contact form, services list).
   *  - "inline":   compact pill that lives inside flowing copy.
   *  - "chip":     low-key footer-style chip suited for under a hero. */
  variant?: Variant;
  /** Override the headline. Defaults to "Need to make a payment?". */
  headline?: string;
  /** Override the supporting copy below the headline. */
  body?: string;
  /** Override the button label. Defaults to "Pay your invoice →". */
  ctaLabel?: string;
  /** Optional className passthrough so callers can nudge spacing. */
  className?: string;
}

export default function PayInvoiceCTA({
  variant = 'ribbon',
  headline = 'Need to make a payment?',
  body = 'Pay your Starr Surveying invoice online — any time, from any device.',
  ctaLabel = 'Pay your invoice →',
  className = '',
}: Props): React.ReactElement {
  const classes = ['pay-cta', `pay-cta--${variant}`, className].filter(Boolean).join(' ');
  return (
    <aside className={classes} data-testid="pay-invoice-cta" data-variant={variant}>
      <div className="pay-cta__text">
        <p className="pay-cta__headline">{headline}</p>
        {variant !== 'inline' && body && <p className="pay-cta__body">{body}</p>}
      </div>
      <Link href="/pay" className="pay-cta__link" data-testid="pay-invoice-cta-link">
        {ctaLabel}
      </Link>
    </aside>
  );
}
