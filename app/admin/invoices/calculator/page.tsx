'use client';
// app/admin/invoices/calculator/page.tsx — the quote calculator: a quote and a tax rate → what the
// customer pays by card and by every other way, with the sales tax in each. Owner, 2026-11-10.

import Link from 'next/link';
import QuoteCalculator from '@/app/admin/components/payments/QuoteCalculator';

export default function QuoteCalculatorPage() {
  return (
    <main className="qc-page" data-testid="quote-calculator-page">
      <h1 className="qc-page__title">Quote calculator</h1>
      <p className="qc-page__lede">
        Type the quote and the job site&rsquo;s sales tax rate. You get the price paid by card, which covers the card
        processing fee, and the lower price paid any other way, each with its sales tax. Put both on the quote.{' '}
        <Link href="/admin/invoices/new">Create an invoice →</Link>
      </p>
      <QuoteCalculator />
    </main>
  );
}
