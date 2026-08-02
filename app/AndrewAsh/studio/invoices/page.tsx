// app/AndrewAsh/studio/invoices/page.tsx — the money.
//
// Three numbers at the top, in the order a freelancer actually needs them: what has ARRIVED, what is
// owed, and what is late. Received comes first deliberately — it is the only one that is spendable,
// and a dashboard that leads with "invoiced" teaches you to count money you do not have.
//
// The overdue tile is the one with a colour. Everything else is neutral, so when something does turn
// orange it means something.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CircleDollarSign, Plus } from 'lucide-react';

import NewInvoiceButton from './NewInvoiceButton';
import { supabaseAdmin } from '@/lib/supabase';
import { balanceCents, daysUntilDue, deriveInvoiceStatus, formatCents, type InvoiceStatus } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Invoices' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function InvoicesPage(): Promise<React.ReactElement> {
  let invoices: any[] = [];
  let clients: any[] = [];
  // Payments a CLIENT declared from the invoice page and nobody has confirmed. These are the only
  // thing on this page that needs Andrew to do something today, so they go above the numbers.
  let pending: any[] = [];
  try {
    const [inv, cli, cliDeclared] = await Promise.all([
      supabaseAdmin
        .from('va_invoices')
        .select('*, client:va_clients(id, name, company)')
        .order('issue_date', { ascending: false })
        .limit(300),
      supabaseAdmin.from('va_clients').select('id, name, company, email').order('name'),
      supabaseAdmin
        .from('va_payments')
        .select('id, invoice_id, amount_cents, method, received_at')
        .eq('status', 'pending')
        .eq('declared_by_client', true)
        .order('received_at', { ascending: false })
        .limit(20),
    ]);
    invoices = inv.data ?? [];
    clients = cli.data ?? [];
    pending = cliDeclared.data ?? [];
  } catch {
    invoices = [];
    clients = [];
    pending = [];
  }

  const today = new Date();

  // Status is DERIVED on read, so "overdue" becomes true the morning it becomes true without a
  // nightly job having to run.
  const rows = invoices.map((r) => ({
    ...r,
    derived: deriveInvoiceStatus(
      { status: r.status as InvoiceStatus, totalCents: r.total_cents, paidCents: r.paid_cents, dueDate: r.due_date },
      today,
    ),
    balance: balanceCents(r.total_cents, r.paid_cents),
  }));

  const received = rows.reduce((sum, r) => sum + (r.paid_cents ?? 0), 0);
  const outstanding = rows.filter((r) => r.derived !== 'void' && r.derived !== 'draft').reduce((sum, r) => sum + r.balance, 0);
  const overdue = rows.filter((r) => r.derived === 'overdue').reduce((sum, r) => sum + r.balance, 0);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Invoices</h1>
          <p className="vaStudioSub">
            Raise it, send the link, get paid. Set aside roughly 30% of everything that arrives — the
            dashboard keeps the running figure.
          </p>
        </div>
        <NewInvoiceButton clients={clients.map((c) => ({ id: c.id, name: c.name, company: c.company ?? null }))} />
      </div>

      {pending.length > 0 && (
        <div className="vaNotice" role="status">
          <strong style={{ color: 'var(--va-accent)' }}>
            {pending.length === 1 ? 'A client says they have paid' : `${pending.length} clients say they have paid`}
          </strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            None of it counts yet. Check the account, then open the invoice and mark it arrived.
          </span>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {pending.map((p) => {
              const inv = rows.find((r) => r.id === p.invoice_id);
              return (
                <li key={p.id} style={{ marginTop: 4 }}>
                  <Link href={`${BASE_PATH}/studio/invoices/${p.invoice_id}`} style={{ color: 'var(--va-accent)' }}>
                    {inv?.invoice_number ?? 'Invoice'}
                  </Link>{' '}
                  — {formatCents(p.amount_cents)} by {p.method}
                  {inv?.client?.name ? `, from ${inv.client.name}` : ''}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="vaTiles">
        <div className="vaTile">
          <span className="vaTileLabel">Received</span>
          <span className="vaTileValue vaTileValueAccent">{formatCents(received)}</span>
          <p className="vaTileNote">Money that has actually arrived.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Outstanding</span>
          <span className="vaTileValue">{formatCents(outstanding)}</span>
          <p className="vaTileNote">Sent and not yet paid. Do not spend it.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Overdue</span>
          <span className="vaTileValue" style={overdue > 0 ? { color: '#ff9c7e' } : undefined}>
            {formatCents(overdue)}
          </span>
          <p className="vaTileNote">
            {overdue > 0 ? 'Chase these today — a polite email works.' : 'Nothing late. Good.'}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="vaEmptyPanel">
          <CircleDollarSign size={28} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>No invoices yet.</p>
          <p style={{ margin: '0 0 18px', fontSize: '0.875rem' }}>
            {clients.length === 0
              ? 'Add a client first — the fastest way is to open an inquiry and press "Make them a client".'
              : 'Raise one from a client and a couple of line items. Ask for 50% up front on a first job.'}
          </p>
        </div>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Due</th>
              <th className="vaNum">Total</th>
              <th className="vaNum">Owing</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const days = daysUntilDue(r.due_date, today);
              return (
                <tr key={r.id}>
                  <td data-label="Invoice">
                    <Link
                      href={`${BASE_PATH}/studio/invoices/${r.id}`}
                      style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {r.invoice_number}
                    </Link>
                    {r.title && (
                      <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>{r.title}</span>
                    )}
                  </td>
                  <td data-label="Client">{r.client?.name ?? '—'}</td>
                  <td data-label="Due">
                    {r.due_date ?? '—'}
                    {days !== null && r.balance > 0 && r.derived !== 'draft' && (
                      <span
                        style={{ display: 'block', fontSize: '0.75rem', color: days < 0 ? '#ff9c7e' : 'var(--va-text-muted)' }}
                      >
                        {days < 0 ? `${Math.abs(days)} days late` : `in ${days} days`}
                      </span>
                    )}
                  </td>
                  <td data-label="Total" className="vaNum">{formatCents(r.total_cents)}</td>
                  <td data-label="Owing" className="vaNum">{r.balance > 0 ? formatCents(r.balance) : '—'}</td>
                  <td data-label="Status">
                    <span className={`vaStatusPill ${statusClass(r.derived)}`}>{r.derived}</span>
                  </td>
                  <td data-label="">
                    <Link href={`${BASE_PATH}/studio/invoices/${r.id}`} className="vaBtn vaBtnOutline vaBtnSm">
                      Open <ArrowRight size={12} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function statusClass(status: string): string {
  if (status === 'paid') return 'vaStatusGood';
  if (status === 'overdue') return 'vaStatusOverdue';
  if (status === 'sent' || status === 'partial') return 'vaStatusSent';
  return 'vaStatusDraft';
}
