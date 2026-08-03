// app/AndrewAsh/studio/invoices/[id]/page.tsx — one invoice.
//
// The document on the left, the actions on the right. The document half is deliberately styled like
// an invoice rather than like a form: it is what the client will see, and Andrew should be able to
// check it by reading it, not by mentally reconstructing it from input fields.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import InvoiceActions from './InvoiceActions';
import SettleButtons from './SettleButtons';
import { supabaseAdmin } from '@/lib/supabase';
import {
  balanceCents,
  daysUntilDue,
  deriveInvoiceStatus,
  formatCents,
  formatQuantity,
  lineAmountCents,
  type InvoiceStatus,
} from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Invoice' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function InvoiceDetail({ params }: { params: { id: string } }): Promise<React.ReactElement> {
  let invoice: any = null;
  try {
    const { data } = await supabaseAdmin
      .from('va_invoices')
      .select('*, client:va_clients(id, name, email, company, address), payments:va_payments(*)')
      .eq('id', params.id)
      .maybeSingle();
    invoice = data;
  } catch {
    invoice = null;
  }
  if (!invoice) notFound();

  const today = new Date();
  const derived = deriveInvoiceStatus(
    { status: invoice.status as InvoiceStatus, totalCents: invoice.total_cents, paidCents: invoice.paid_cents, dueDate: invoice.due_date },
    today,
  );
  const balance = balanceCents(invoice.total_cents, invoice.paid_cents);
  const days = daysUntilDue(invoice.due_date, today);
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <Link
            href={`${BASE_PATH}/studio/invoices`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--va-text-muted)', fontSize: '0.8125rem', textDecoration: 'none', marginBottom: 10 }}
          >
            <ArrowLeft size={13} aria-hidden /> All invoices
          </Link>
          <h1 className="vaStudioTitle">{invoice.invoice_number}</h1>
          <p className="vaStudioSub">
            {invoice.client?.name}
            {invoice.title ? ` · ${invoice.title}` : ''}
            {days !== null && balance > 0 && derived !== 'draft'
              ? days < 0
                ? ` · ${Math.abs(days)} days late`
                : ` · due in ${days} days`
              : ''}
          </p>
        </div>
        <span className={`vaStatusPill ${derived === 'paid' ? 'vaStatusGood' : derived === 'overdue' ? 'vaStatusOverdue' : derived === 'draft' ? 'vaStatusDraft' : 'vaStatusSent'}`}>
          {derived}
        </span>
      </div>

      <div className="vaSplitPanels">
        <div>
          <div className="vaPanel vaInvoiceDoc">
            <div className="vaInvoiceHead">
              <div>
                <p className="vaSpecKey">Billed to</p>
                <p className="vaInvoiceParty">{invoice.client?.name}</p>
                {invoice.client?.company && <p className="vaMuted">{invoice.client.company}</p>}
                {invoice.client?.email && <p className="vaMuted">{invoice.client.email}</p>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="vaSpecKey">Issued</p>
                <p className="vaInvoiceParty">{invoice.issue_date}</p>
                <p className="vaSpecKey" style={{ marginTop: 10 }}>Due</p>
                <p className="vaInvoiceParty">{invoice.due_date ?? '—'}</p>
              </div>
            </div>

            <div className="vaTableWrap">
              <table className="vaTable">
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
                      <td style={{ color: 'var(--va-text)' }}>{String(line.description ?? '')}</td>
                      <td className="vaNum vaMuted">{formatQuantity(Number(line.quantity ?? 1000))}</td>
                      <td className="vaNum vaMuted">{formatCents(Number(line.unitCents ?? 0))}</td>
                      <td className="vaNum" style={{ color: 'var(--va-text)' }}>
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
                <span className="vaSpecKey" style={{ color: 'var(--va-accent)' }}>Total</span>
                <span className="vaSpecValue vaNum" style={{ color: 'var(--va-accent)', fontSize: '1.15rem' }}>
                  {formatCents(invoice.total_cents)}
                </span>
              </li>
              {invoice.paid_cents > 0 && (
                <>
                  <li>
                    <span className="vaSpecKey">Paid</span>
                    <span className="vaSpecValue vaNum">−{formatCents(invoice.paid_cents)}</span>
                  </li>
                  <li>
                    <span className="vaSpecKey">Still owing</span>
                    <span className="vaSpecValue vaNum" style={{ color: balance > 0 ? 'var(--va-danger)' : 'var(--va-positive)' }}>
                      {formatCents(balance)}
                    </span>
                  </li>
                </>
              )}
            </ul>

            {invoice.notes && (
              <p style={{ marginTop: 22, color: 'var(--va-text-muted)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                {invoice.notes}
              </p>
            )}
          </div>

          {payments.length > 0 && (
            <div className="vaPanel">
              <div className="vaPanelHead">
                <h2 className="vaPanelTitle">Payments</h2>
              </div>
              <table className="vaDataTable">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>How</th>
                    <th>Reference</th>
                    <th className="vaNum">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: Record<string, string | number>) => (
                    <tr key={String(p.id)}>
                      <td data-label="When">{new Date(String(p.received_at)).toLocaleDateString('en-US')}</td>
                      <td data-label="How" style={{ textTransform: 'capitalize' }}>
                        {String(p.method)}
                        {p.status === 'pending' && (
                          <span className="vaStatusPill vaStatusDraft" style={{ marginLeft: 8 }}>
                            {p.declared_by_client ? 'client says sent' : 'unconfirmed'}
                          </span>
                        )}
                      </td>
                      <td data-label="Reference" className="vaMuted">{String(p.reference ?? '—')}</td>
                      <td data-label="Amount" className="vaNum">{formatCents(Number(p.amount_cents))}</td>
                      <td data-label="">
                        {p.status === 'pending' ? (
                          <SettleButtons invoiceId={invoice.id} paymentId={String(p.id)} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <InvoiceActions
            id={invoice.id}
            status={invoice.status}
            derived={derived}
            balanceCents={balance}
            totalCents={invoice.total_cents}
            accessToken={invoice.access_token}
            clientEmail={invoice.client?.email ?? null}
            invoiceNumber={invoice.invoice_number}
          />
        </div>
      </div>
    </>
  );
}
