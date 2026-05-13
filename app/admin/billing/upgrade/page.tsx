'use client';
// app/admin/billing/upgrade/page.tsx
//
// Bundle-gate redirect target. Middleware (Phase D-5, gated on M-9
// auth refactor) redirects unentitled customers here with
// ?requiredBundle=<id>&returnTo=<original-url>. Shows a graceful
// upgrade prompt with the bundle's tagline + price + CTAs.
//
// Per CUSTOMER_PORTAL.md §3.6.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { BUNDLES, formatBundlePrice, annualPriceCents, type BundleId } from '@/lib/saas/bundles';

const BUNDLE_IDS = new Set<string>([
  'recon', 'draft', 'office', 'field', 'academy', 'firm_suite',
]);

function isBundleId(s: string | null): s is BundleId {
  return s !== null && BUNDLE_IDS.has(s);
}

export default function BillingUpgradePage() {
  const params = useSearchParams();
  const requested = params.get('requiredBundle');
  const returnTo = params.get('returnTo') ?? '/admin/me';

  const bundle = useMemo(() => {
    if (!isBundleId(requested)) return null;
    return BUNDLES[requested];
  }, [requested]);

  if (!bundle) {
    return (
      <div className="upgrade-page">
        <div className="upgrade-card">
          <h1>Unknown bundle</h1>
          <p>
            We couldn&apos;t determine which bundle you were trying to access.
            Head back to <Link href="/admin/me">your hub</Link> and try again.
          </p>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const monthly = formatBundlePrice(bundle.monthlyBaseCents);
  const annual = formatBundlePrice(Math.round(annualPriceCents(bundle.monthlyBaseCents) / 12));

  return (
    <div className="upgrade-page">
      <div className="upgrade-card">
        <header>
          <span className="upgrade-pill">🔒 Bundle required</span>
          <h1>{bundle.label} unlocks this page</h1>
          <p className="upgrade-tagline">{bundle.tagline}</p>
        </header>

        <div className="upgrade-pricing">
          <div className="upgrade-price">
            <span className="upgrade-price__amount">{monthly}</span>
            <span className="upgrade-price__period">/ month</span>
          </div>
          <div className="upgrade-price-secondary">
            or {annual}/mo billed annually (save 20%)
          </div>
        </div>

        <div className="upgrade-actions">
          <button className="upgrade-btn upgrade-btn--primary" disabled>
            Add {bundle.label} to my plan
          </button>
          <Link className="upgrade-btn upgrade-btn--secondary" href="/admin/billing">
            Open billing →
          </Link>
        </div>

        <p className="upgrade-note">
          The one-click upgrade flow lands with Phase D-2 (customer
          billing portal). For now, contact{' '}
          <a href="mailto:support@starrsoftware.com">support@starrsoftware.com</a>{' '}
          and we&apos;ll add this bundle to your plan within the hour.
        </p>

        <Link className="upgrade-back" href={returnTo}>
          ← Back to {returnTo === '/admin/me' ? 'hub' : 'where you were'}
        </Link>
      </div>
      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .upgrade-page {
    padding: 3rem 1.5rem;
    background: #F3F4F6;
    min-height: calc(100vh - 64px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .upgrade-card {
    max-width: 520px;
    width: 100%;
    background: #FFF;
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 4px 24px rgba(15, 20, 25, 0.06);
  }
  .upgrade-card header {
    margin-bottom: 1.5rem;
  }
  .upgrade-pill {
    display: inline-block;
    background: #FEF3C7;
    color: #92400E;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    margin-bottom: 0.85rem;
  }
  .upgrade-card h1 {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 1.6rem;
    font-weight: 600;
    color: #0F1419;
    margin: 0 0 0.5rem;
  }
  .upgrade-tagline {
    color: #4B5563;
    font-size: 0.95rem;
    line-height: 1.5;
    margin: 0;
  }
  .upgrade-pricing {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  .upgrade-price {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .upgrade-price__amount {
    font-family: 'Sora', sans-serif;
    font-size: 2.2rem;
    font-weight: 700;
    color: #1D3095;
    line-height: 1;
  }
  .upgrade-price__period {
    color: #6B7280;
    font-size: 0.9rem;
  }
  .upgrade-price-secondary {
    color: #6B7280;
    font-size: 0.82rem;
    margin-top: 0.25rem;
  }
  .upgrade-actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }
  .upgrade-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    text-decoration: none;
    border: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .upgrade-btn--primary {
    background: #1D3095;
    color: #FFF;
  }
  .upgrade-btn--primary:disabled {
    background: #9CA3AF;
    cursor: not-allowed;
  }
  .upgrade-btn--secondary {
    background: #FFF;
    color: #1D3095;
    border: 1px solid #1D3095;
  }
  .upgrade-btn--secondary:hover {
    background: #F0F4FF;
  }
  .upgrade-note {
    font-size: 0.82rem;
    color: #6B7280;
    line-height: 1.5;
    margin-bottom: 1rem;
  }
  .upgrade-note a {
    color: #1D3095;
  }
  .upgrade-back {
    display: inline-block;
    font-size: 0.85rem;
    color: #1D3095;
    text-decoration: none;
  }
  .upgrade-back:hover {
    text-decoration: underline;
  }
`;
