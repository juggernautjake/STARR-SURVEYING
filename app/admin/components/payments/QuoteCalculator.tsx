'use client';
// app/admin/components/payments/QuoteCalculator.tsx — what a quote costs the customer, by how they pay.
//
// Owner, 2026-11-10: "We need to know the rate so that we can plug our actual quote into a calculator
// to figure out what the processing fee and sales tax would be for any amount. That way when we quote
// them, we can tell them what the quote is with and without the discount based on payment type, and
// what the sales tax will be."
//
// Type the quote (what we want, before tax) and the job site's sales tax rate → the price paying by
// bank / Zelle / cash / check / Venmo / Cash App, the price by card (which carries the processing
// fee), the tax in each, and what actually reaches the bank. The maths is lib/payments/pay-discount.ts
// — the same the invoice builder and the pay page use, so the quote and the invoice agree.

import { useEffect, useMemo, useState } from 'react';
import { quoteBreakdown, feeLabel, type CardFee, STRIPE_CARD_FEE } from '@/lib/payments/pay-discount';
import { formatDollars } from '@/lib/payments/live';
import './QuoteCalculator.css';

/** Belton (Bell County) and most Texas cities: 6.25% state + 2% local. The rate follows the JOB SITE. */
export const DEFAULT_TAX_RATE = '8.25';

export function useCardFee(): { fee: CardFee | null; loaded: boolean } {
  const [fee, setFee] = useState<CardFee | null>(STRIPE_CARD_FEE);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let off = false;
    fetch('/api/admin/payments/card-fee')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (off || !j) return;
        setFee(j.card_fee ? { bps: j.card_fee.bps, fixedCents: j.card_fee.fixed_cents } : null);
      })
      .catch(() => { /* keep Stripe's list price */ })
      .finally(() => { if (!off) setLoaded(true); });
    return () => { off = true; };
  }, []);
  return { fee, loaded };
}

const toCents = (s: string) => Math.max(0, Math.round((parseFloat(s.replace(/[$,]/g, '')) || 0) * 100));
const toBps = (s: string) => Math.max(0, Math.round((parseFloat(s) || 0) * 100));

export default function QuoteCalculator({ initialQuote = '', initialTaxRate = DEFAULT_TAX_RATE }: { initialQuote?: string; initialTaxRate?: string }) {
  const { fee } = useCardFee();
  const [quote, setQuote] = useState(initialQuote);
  const [taxRate, setTaxRate] = useState(initialTaxRate);
  const [copied, setCopied] = useState(false);
  const b = useMemo(() => quoteBreakdown(toCents(quote), toBps(taxRate), fee), [quote, taxRate, fee]);
  const has = toCents(quote) > 0;

  // The card price leads, as the price; the other is a discount off it (Texas allows a discount, not a
  // card surcharge — so the quote must never read as "plus a card fee").
  const quoteText = [
    `Price: ${formatDollars(b.card.total)}` +
      (b.card.tax ? ` (${formatDollars(b.card.subtotal)} + ${formatDollars(b.card.tax)} sales tax)` : '') + '.',
    `Pay by bank transfer, Zelle, check, cash, Venmo or Cash App: ${formatDollars(b.noncard.total)}` +
      (b.noncard.tax ? ` (${formatDollars(b.noncard.subtotal)} + ${formatDollars(b.noncard.tax)} sales tax)` : '') + '.',
  ].join('\n');

  return (
    <div className="qc" data-testid="quote-calculator">
      <div className="qc__inputs">
        <label>
          <span>Quote (what we charge, before tax)</span>
          <span className="qc__money"><span aria-hidden="true">$</span>
            <input inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="1,000.00" data-testid="qc-quote" autoFocus />
          </span>
        </label>
        <label>
          <span>Sales tax rate at the job site</span>
          <span className="qc__money">
            <input inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} data-testid="qc-tax" style={{ width: '5.5rem' }} />
            <span aria-hidden="true">%</span>
          </span>
          <span className="qc__quick">
            <button type="button" onClick={() => setTaxRate('8.25')}>8.25% (most cities)</button>
            <button type="button" onClick={() => setTaxRate('6.25')}>6.25% (state only)</button>
            <button type="button" onClick={() => setTaxRate('0')}>0% (not taxable)</button>
          </span>
        </label>
      </div>

      <table className="qc__table" data-testid="qc-table">
        <thead>
          <tr><th /><th>Bank · Zelle · cash · check<br /><small>Venmo · Cash App</small></th><th>Credit / debit card</th></tr>
        </thead>
        <tbody>
          <tr><td>Price before tax</td><td>{formatDollars(b.noncard.subtotal)}</td><td>{formatDollars(b.card.subtotal)}</td></tr>
          <tr><td>Sales tax ({(toBps(taxRate) / 100).toString()}%)</td><td>{formatDollars(b.noncard.tax)}</td><td>{formatDollars(b.card.tax)}</td></tr>
          <tr className="qc__total"><td>Customer pays</td><td data-testid="qc-noncard-total">{formatDollars(b.noncard.total)}</td><td data-testid="qc-card-total">{formatDollars(b.card.total)}</td></tr>
          <tr><td>Card processing fee included</td><td>—</td><td data-testid="qc-card-fee">{formatDollars(b.cardFeeCents)}</td></tr>
        </tbody>
      </table>

      {has ? (
        <>
          <p className="qc__net">
            <b>What reaches the bank:</b> Zelle, cash or check {formatDollars(b.net.zelleCashCheck)} ·
            bank transfer through the website {formatDollars(b.net.bankViaStripe)} (Stripe keeps up to $5) ·
            card {formatDollars(b.net.card)}. Sales tax inside these is owed to the state.
          </p>
          <div className="qc__copy">
            <pre data-testid="qc-quote-text">{quoteText}</pre>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(quoteText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
              {copied ? 'Copied' : 'Copy for the quote'}
            </button>
          </div>
        </>
      ) : null}

      <p className="qc__note">
        Card fee: {feeLabel(fee ?? STRIPE_CARD_FEE)} of the card price{fee ? '' : ' (the discount is switched off on this site)'}.
        The invoice shows the <b>card price</b>; paying any other way takes the processing fee off. That is a
        discount, which Texas law allows — never call it a card surcharge or a card fee on a quote or invoice.
        Sales tax follows the job site; topographic and construction surveys are not taxable, boundary,
        title, easement and right-of-way surveys are (34 TAC §3.276). Ask the CPA if unsure.
      </p>
    </div>
  );
}
