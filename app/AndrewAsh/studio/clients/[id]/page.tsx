// app/AndrewAsh/studio/clients/[id]/page.tsx — one client, and everything attached to them.
//
// The whole relationship on one screen: what they have paid, what they owe, every invoice, every
// contract, and the private notes. This is the page Andrew opens before a phone call.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileSignature, Mail, Phone, Receipt } from 'lucide-react';

import ClientActions from './ClientActions';
import { supabaseAdmin } from '@/lib/supabase';
import { balanceCents, deriveInvoiceStatus, formatCents, type InvoiceStatus } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Client' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ClientDetail({ params }: { params: { id: string } }): Promise<React.ReactElement> {
  let client: any = null;
  try {
    const { data } = await supabaseAdmin
      .from('va_clients')
      .select('*, invoices:va_invoices(*), contracts:va_contracts(*)')
      .eq('id', params.id)
      .maybeSingle();
    client = data;
  } catch {
    client = null;
  }
  if (!client) notFound();

  const today = new Date();
  const invoices = (Array.isArray(client.invoices) ? client.invoices : []).sort((a: any, b: any) =>
    String(b.issue_date).localeCompare(String(a.issue_date)),
  );
  const contracts = Array.isArray(client.contracts) ? client.contracts : [];

  const paid = invoices.reduce((s: number, i: any) => s + (i.paid_cents ?? 0), 0);
  const owing = invoices
    .filter((i: any) => i.status !== 'void' && i.status !== 'draft')
    .reduce((s: number, i: any) => s + balanceCents(i.total_cents ?? 0, i.paid_cents ?? 0), 0);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <Link
            href={`${BASE_PATH}/studio/clients`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--va-text-muted)', fontSize: '0.8125rem', textDecoration: 'none', marginBottom: 10 }}
          >
            <ArrowLeft size={13} aria-hidden /> All clients
          </Link>
          <h1 className="vaStudioTitle">{client.name}</h1>
          <p className="vaStudioSub">
            {client.company ? `${client.company} · ` : ''}
            {client.relationship === 'both' ? 'Voice-over and coaching' : client.relationship === 'coaching' ? 'Coaching' : 'Voice-over'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={`mailto:${client.email}`} className="vaBtn vaBtnSolid vaBtnSm">
            <Mail size={14} aria-hidden /> Email
          </a>
          {client.phone && (
            <a href={`tel:${String(client.phone).replace(/[^0-9+]/g, '')}`} className="vaBtn vaBtnOutline vaBtnSm">
              <Phone size={14} aria-hidden /> Call
            </a>
          )}
        </div>
      </div>

      <div className="vaTiles">
        <div className="vaTile">
          <span className="vaTileLabel">Paid you</span>
          <span className="vaTileValue vaTileValueAccent">{formatCents(paid)}</span>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Owes right now</span>
          <span className="vaTileValue" style={owing > 0 ? { color: 'var(--va-danger)' } : undefined}>{formatCents(owing)}</span>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Invoices</span>
          <span className="vaTileValue">{invoices.length}</span>
        </div>
      </div>

      <div className="vaSplitPanels">
        <div>
          <div className="vaPanel">
            <div className="vaPanelHead">
              <h2 className="vaPanelTitle">
                <Receipt size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
                Invoices
              </h2>
              <Link href={`${BASE_PATH}/studio/invoices`} className="vaBtn vaBtnOutline vaBtnSm">New invoice</Link>
            </div>
            {invoices.length === 0 ? (
              <p className="vaMuted" style={{ margin: 0, fontSize: '0.9375rem' }}>Nothing invoiced yet.</p>
            ) : (
              <table className="vaDataTable">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Issued</th>
                    <th className="vaNum">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {invoices.map((inv: any) => {
                    const derived = deriveInvoiceStatus(
                      { status: inv.status as InvoiceStatus, totalCents: inv.total_cents, paidCents: inv.paid_cents, dueDate: inv.due_date },
                      today,
                    );
                    return (
                      <tr key={inv.id}>
                        <td data-label="Number">
                          <Link href={`${BASE_PATH}/studio/invoices/${inv.id}`} style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}>
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td data-label="Issued">{inv.issue_date}</td>
                        <td data-label="Total" className="vaNum">{formatCents(inv.total_cents)}</td>
                        <td data-label="Status">
                          <span className={`vaStatusPill ${derived === 'paid' ? 'vaStatusGood' : derived === 'overdue' ? 'vaStatusOverdue' : 'vaStatusDraft'}`}>
                            {derived}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="vaPanel">
            <div className="vaPanelHead">
              <h2 className="vaPanelTitle">
                <FileSignature size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
                Contracts
              </h2>
            </div>
            {contracts.length === 0 ? (
              <p className="vaMuted" style={{ margin: 0, fontSize: '0.9375rem' }}>
                No agreements yet. Send one before recording — the deposit clause and the usage scope
                are the two that protect you.
              </p>
            ) : (
              <table className="vaDataTable">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th className="vaNum">Fee</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {contracts.map((c: any) => (
                    <tr key={c.id}>
                      <td data-label="Contract">
                        <Link href={`${BASE_PATH}/studio/contracts/${c.id}`} style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}>
                          {c.title}
                        </Link>
                        <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>{c.contract_number}</span>
                      </td>
                      <td data-label="Fee" className="vaNum">{formatCents(c.fee_cents)}</td>
                      <td data-label="Status">
                        <span className={`vaStatusPill ${c.status === 'signed' || c.status === 'countersigned' ? 'vaStatusSigned' : 'vaStatusDraft'}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <ClientActions
            id={client.id}
            name={client.name}
            email={client.email}
            phone={client.phone ?? ''}
            company={client.company ?? ''}
            address={client.address ?? ''}
            relationship={client.relationship}
            notes={client.notes ?? ''}
            portalToken={client.portal_token}
            portalRevoked={Boolean(client.portal_revoked_at)}
            canDelete={invoices.length === 0 && contracts.length === 0}
          />
        </div>
      </div>
    </>
  );
}
