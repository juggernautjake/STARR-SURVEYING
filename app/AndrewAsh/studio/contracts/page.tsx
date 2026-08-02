// app/AndrewAsh/studio/contracts/page.tsx — agreements.
//
// The nudge at the top is the point of this page existing at all. A first-year freelancer's most
// expensive habit is recording before anything is written down, and the two clauses that prevent it —
// the deposit and the usage scope — are already in the template. The page exists to make using it
// easier than not using it.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileSignature } from 'lucide-react';

import NewContractButton from './NewContractButton';
import { supabaseAdmin } from '@/lib/supabase';
import { formatCents } from '@/lib/voice/money';
import { relativeTime } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Contracts' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ContractsPage(): Promise<React.ReactElement> {
  let rows: any[] = [];
  let clients: any[] = [];
  try {
    const [co, cl] = await Promise.all([
      supabaseAdmin
        .from('va_contracts')
        .select('*, client:va_clients(id, name, company)')
        .order('created_at', { ascending: false })
        .limit(300),
      supabaseAdmin.from('va_clients').select('id, name, company').order('name'),
    ]);
    rows = co.data ?? [];
    clients = cl.data ?? [];
  } catch {
    rows = [];
    clients = [];
  }

  const awaiting = rows.filter((r) => r.status === 'sent');
  const needCountersign = rows.filter((r) => r.status === 'signed');
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Contracts</h1>
          <p className="vaStudioSub">
            Send one before you record. The deposit clause and the usage scope are the two that protect
            you, and they are already written.
          </p>
        </div>
        <NewContractButton clients={clients.map((c) => ({ id: c.id, name: c.name, company: c.company ?? null }))} />
      </div>

      {(awaiting.length > 0 || needCountersign.length > 0) && (
        <div className="vaTiles">
          {awaiting.length > 0 && (
            <div className="vaTile">
              <span className="vaTileLabel">Waiting on a signature</span>
              <span className="vaTileValue">{awaiting.length}</span>
              <p className="vaTileNote">A polite nudge after three days usually does it.</p>
            </div>
          )}
          {needCountersign.length > 0 && (
            <div className="vaTile">
              <span className="vaTileLabel">Waiting on you</span>
              <span className="vaTileValue vaTileValueAccent">{needCountersign.length}</span>
              <p className="vaTileNote">Signed by the client — countersign to complete it.</p>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="vaEmptyPanel">
          <FileSignature size={28} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>No agreements yet.</p>
          <p style={{ margin: 0, fontSize: '0.875rem', maxWidth: '52ch', marginInline: 'auto' }}>
            {clients.length === 0
              ? 'Add a client first — the fastest route is an inquiry, then “Make them a client”.'
              : 'The template already covers cancellation, revision scope, late payment, and the one that matters most: you own the recording until you are paid in full.'}
          </p>
        </div>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>Agreement</th>
              <th>Client</th>
              <th className="vaNum">Fee</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td data-label="Agreement">
                  <Link
                    href={`${BASE_PATH}/studio/contracts/${c.id}`}
                    style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {c.title}
                  </Link>
                  <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>
                    {c.contract_number} · {relativeTime(c.created_at)}
                  </span>
                </td>
                <td data-label="Client">{c.client?.name ?? '—'}</td>
                <td data-label="Fee" className="vaNum">{formatCents(c.fee_cents)}</td>
                <td data-label="Status">
                  <span className={`vaStatusPill ${statusClass(c.status)}`}>
                    {c.status === 'signed' ? 'signed — countersign' : c.status}
                  </span>
                </td>
                <td data-label="">
                  <Link href={`${BASE_PATH}/studio/contracts/${c.id}`} className="vaBtn vaBtnOutline vaBtnSm">
                    Open <ArrowRight size={12} aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function statusClass(status: string): string {
  if (status === 'countersigned') return 'vaStatusGood';
  if (status === 'signed') return 'vaStatusSigned';
  if (status === 'sent') return 'vaStatusSent';
  return 'vaStatusDraft';
}
