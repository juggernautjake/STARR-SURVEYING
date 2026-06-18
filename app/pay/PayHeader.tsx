// app/pay/PayHeader.tsx
//
// P20 of payment-infrastructure-2026-06-18.md — brand-consistent
// sticky header for the customer payment portal. Used by both /pay
// (landing) and /pay/[invoice] (detail).
//
// One-thumb tap target (44×44 minimum) on the phone CTA so a
// customer can call from their mobile without zooming in.

import Link from 'next/link';

export default function PayHeader(): React.ReactElement {
  return (
    <header className="pay-header" role="banner" data-testid="pay-header">
      <div className="pay-header__inner">
        <Link href="/pay" className="pay-header__brand" aria-label="Starr Surveying — payment portal home">
          <span className="pay-header__brand-mark">STARR</span>
          <span className="pay-header__brand-tail">Surveying · Payments</span>
        </Link>
        <a
          href="tel:+19366620077"
          className="pay-header__call"
          aria-label="Call Starr Surveying at (936) 662-0077"
          data-testid="pay-header-call"
        >
          <span aria-hidden>📞</span>
          <span className="pay-header__call-text">(936) 662-0077</span>
        </a>
      </div>
    </header>
  );
}
