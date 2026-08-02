// app/AndrewAsh/invoice/[token]/page.tsx — where a client pays.
//
// The invoice reads as a document and the amount owed is the largest thing on the page. A client
// arriving here has one question — how much, and how do I pay it — and every element that is not one
// of those two answers is in the way.
//
// ── PAYMENT WORKS WITHOUT STRIPE ────────────────────────────────────────────────────────────────
//
// Card payment is gated on keys being configured. Until they are, the page shows the ways Andrew can
// already be paid — bank transfer, Zelle, Venmo, a cheque — rather than a dead "Pay now" button. That
// ordering matters: a first-year freelancer gets paid by transfer long before he finishes Stripe
// onboarding, and an invoice that cannot be settled is worse than one with no card option.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

import PayPanel from './PayPanel';
import { supabaseAdmin } from '@/lib/supabase';
import { looksLikeToken } from '@/lib/voice/tokens';
import {
  balanceCents,
  daysUntilDue,
  deriveInvoiceStatus,
  formatCents,
  formatQuantity,
  lineAmountCents,
  type InvoiceStatus,
} from '@/lib/voice/money';
import { clientStripeConfig, normalizePaymentMethods, payableMethods } from '@/lib/voice/payments';

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

export default async function InvoicePayPage({ params }: { params: { token: string } }): Promise<React.ReactElement> {
  if (!looksLikeToken(params.token)) notFound();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let invoice: any = null;
  let settings: any = null;
  try {
    const [inv, st] = await Promise.all([
      supabaseAdmin
        .from('va_invoices')
        .select('*, client:va_clients(name, company, email, address)')
        .eq('access_token', params.token)
        .maybeSingle(),
      supabaseAdmin
        .from('va_settings')
        .select('business_name, business_address, email, invoice_footer, payment_methods, payment_note')
        .eq('id', 1)
        .maybeSingle(),
    ]);
    invoice = inv.data;
    settings = st.data;
  } catch {
    invoice = null;
  }
  if (!invoice) notFound();

  // A draft has not been sent to anyone; the token existing does not make it payable.
  if (invoice.status === 'draft') notFound();

  const today = new Date();
  const derived = deriveInvoiceStatus(
    { status: invoice.status as InvoiceStatus, totalCents: invoice.total_cents, paidCents: invoice.paid_cents, dueDate: invoice.due_date },
    today,
  );
  const balance = balanceCents(invoice.total_cents, invoice.paid_cents);
  const days = daysUntilDue(invoice.due_date, today);
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  // An enabled method with nowhere to send the money is worse than no method at all, so the filter
  // happens here rather than in the panel.
  const payMethods = payableMethods(normalizePaymentMethods(settings?.payment_methods));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <main id="va-main" className="vaSection">
      <div className="vaContainer vaContainerNarrow">
        {derived === 'void' ? (
          <div className="vaNotice" role="status">
            This invoice has been cancelled — nothing is owed. If that is unexpected, please get in touch.
          </div>
        ) : balance === 0 ? (
          <div className="vaNotice vaNoticeGood" role="status">
            <strong style={{ color: 'var(--va-accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} aria-hidden /> Paid in full — thank you
            </strong>
            {invoice.paid_at && (
              <span style={{ display: 'block', marginTop: 6 }}>
                Settled {new Date(invoice.paid_at).toLocaleDateString('en-US', { dateStyle: 'long' } as Intl.DateTimeFormatOptions)}.
                This page is your receipt.
              </span>
            )}
          </div>
        ) : null}

        <div className="vaOrnament vaOrnamentLeft" style={{ margin: '10px 0 26px' }}>
          <span className="vaOrnamentMark" />
        </div>

        <span className="vaEyebrow">Invoice {invoice.invoice_number}</span>
        <h1 className="vaDisplay vaH2" style={{ marginBottom: 10 }}>
          {invoice.title || 'For services rendered'}
        </h1>
        <p className="vaMuted" style={{ marginBottom: 34 }}>
          From {settings?.business_name ?? 'Andrew Ash Voice'} · Issued {invoice.issue_date}
          {invoice.due_date ? ` · Due ${invoice.due_date}` : ''}
          {/* Lateness is the one fact here a client acts on, so it is the one that carries colour.
              Stated flatly, without a nudge or an apology — the date is the argument. */}
          {days !== null && days < 0 && balance > 0 && (
            <>
              {' · '}
              <strong style={{ color: '#E2725B', fontWeight: 600 }}>
                {Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'} overdue
              </strong>
            </>
          )}
        </p>

        <div className="vaCard" style={{ marginBottom: 30 }}>
          <div className="vaTableWrap">
            <table className="vaTable vaTableStack">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="vaNum">Qty</th>
                  <th className="vaNum">Each</th>
                  <th className="vaNum">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: Record<string, number | string>, i: number) => (
                  <tr key={i}>
                    <td data-label="Description" style={{ color: 'var(--va-text)' }}>{String(line.description ?? '')}</td>
                    <td data-label="Qty" className="vaNum vaMuted">{formatQuantity(Number(line.quantity ?? 1000))}</td>
                    <td data-label="Each" className="vaNum vaMuted">{formatCents(Number(line.unitCents ?? 0))}</td>
                    <td data-label="Amount" className="vaNum" style={{ color: 'var(--va-text)' }}>
                      {formatCents(
                        lineAmountCents({ quantity: Number(line.quantity ?? 1000), unitCents: Number(line.unitCents ?? 0) }),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="vaSpecList vaInvoiceTotals">
            <li>
              <span className="vaSpecKey">Subtotal</span>
              <span className="vaSpecValue vaNum">{formatCents(invoice.subtotal_cents)}</span>
            </li>
            {invoice.discount_cents > 0 && (
              <li>
                <span className="vaSpecKey">Discount</span>
                <span className="vaSpecValue vaNum">−{formatCents(invoice.discount_cents)}</span>
              </li>
            )}
            {invoice.tax_cents > 0 && (
              <li>
                <span className="vaSpecKey">Tax</span>
                <span className="vaSpecValue vaNum">{formatCents(invoice.tax_cents)}</span>
              </li>
            )}
            <li>
              <span className="vaSpecKey">Total</span>
              <span className="vaSpecValue vaNum">{formatCents(invoice.total_cents)}</span>
            </li>
            {invoice.paid_cents > 0 && (
              <li>
                <span className="vaSpecKey">Already paid</span>
                <span className="vaSpecValue vaNum">−{formatCents(invoice.paid_cents)}</span>
              </li>
            )}
          </ul>

          {invoice.notes && (
            <p style={{ marginTop: 22, color: 'var(--va-text-muted)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
              {invoice.notes}
            </p>
          )}
        </div>

        {balance > 0 && derived !== 'void' && (
          <PayPanel
            token={params.token}
            balanceCents={balance}
            invoiceNumber={invoice.invoice_number}
            payeeEmail={settings?.email ?? null}
            methods={payMethods}
            stripe={clientStripeConfig()}
            note={settings?.payment_note ?? null}
          />
        )}

        {settings?.invoice_footer && (
          <p className="vaHint" style={{ marginTop: 34, whiteSpace: 'pre-wrap' }}>{settings.invoice_footer}</p>
        )}
      </div>
    </main>
  );
}
