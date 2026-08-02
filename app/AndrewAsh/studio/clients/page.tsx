// app/AndrewAsh/studio/clients/page.tsx — everyone Andrew works with.
//
// Sorted by MOST RECENTLY ACTIVE rather than alphabetically. An address book is alphabetical because
// you arrive knowing the name; this list is opened to find "the one I was just dealing with", and
// that one is almost never at the top of the alphabet.
//
// The lifetime figure beside each client is what turns a list of names into a list of relationships —
// it is the number that tells Andrew which three people to email in January.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';

import NewClientButton from './NewClientButton';
import { supabaseAdmin } from '@/lib/supabase';
import { balanceCents, formatCents } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Clients' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ClientsPage(): Promise<React.ReactElement> {
  let clients: any[] = [];
  let invoices: any[] = [];
  try {
    const [cl, inv] = await Promise.all([
      supabaseAdmin.from('va_clients').select('*').limit(500),
      supabaseAdmin.from('va_invoices').select('client_id, total_cents, paid_cents, status, issue_date'),
    ]);
    clients = cl.data ?? [];
    invoices = inv.data ?? [];
  } catch {
    clients = [];
    invoices = [];
  }

  // One pass over the invoices instead of a query per client — a hundred clients would otherwise be a
  // hundred round trips to render one page.
  const byClient = new Map<string, { paid: number; owing: number; last: string | null; count: number }>();
  for (const inv of invoices) {
    const entry = byClient.get(inv.client_id) ?? { paid: 0, owing: 0, last: null, count: 0 };
    entry.paid += inv.paid_cents ?? 0;
    if (inv.status !== 'void' && inv.status !== 'draft') {
      entry.owing += balanceCents(inv.total_cents ?? 0, inv.paid_cents ?? 0);
    }
    entry.count += 1;
    if (!entry.last || String(inv.issue_date) > entry.last) entry.last = String(inv.issue_date);
    byClient.set(inv.client_id, entry);
  }

  const rows = clients
    .map((c) => ({ ...c, stats: byClient.get(c.id) ?? { paid: 0, owing: 0, last: null, count: 0 } }))
    .sort((a, b) => {
      // Most recent invoice first; clients with none fall to the bottom, newest-created first.
      const al = a.stats.last ?? '';
      const bl = b.stats.last ?? '';
      if (al !== bl) return bl.localeCompare(al);
      return String(b.created_at).localeCompare(String(a.created_at));
    });

  const lifetime = rows.reduce((sum, r) => sum + r.stats.paid, 0);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Clients</h1>
          <p className="vaStudioSub">
            A client who has paid once is five to ten times more likely to pay again than a stranger is
            to pay at all. Email everyone here twice a year.
          </p>
        </div>
        <NewClientButton />
      </div>

      {rows.length > 0 && (
        <div className="vaTiles">
          <div className="vaTile">
            <span className="vaTileLabel">Clients</span>
            <span className="vaTileValue">{rows.length}</span>
          </div>
          <div className="vaTile">
            <span className="vaTileLabel">Lifetime received</span>
            <span className="vaTileValue vaTileValueAccent">{formatCents(lifetime)}</span>
          </div>
          <div className="vaTile">
            <span className="vaTileLabel">Owed right now</span>
            <span className="vaTileValue">{formatCents(rows.reduce((s, r) => s + r.stats.owing, 0))}</span>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="vaEmptyPanel">
          <Users size={28} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>No clients yet.</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            The fastest way to add one is from an inquiry — open it and press “Make them a client”, and
            the name, email and phone come across without retyping.
          </p>
        </div>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>Client</th>
              <th>Works with you on</th>
              <th className="vaNum">Paid you</th>
              <th className="vaNum">Owes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td data-label="Client">
                  <Link
                    href={`${BASE_PATH}/studio/clients/${c.id}`}
                    style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {c.name}
                  </Link>
                  <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>
                    {c.company ? `${c.company} · ` : ''}
                    {c.email}
                  </span>
                  {c.portal_revoked_at && (
                    <span className="vaStatusPill vaStatusDraft" style={{ marginTop: 5 }}>Portal revoked</span>
                  )}
                </td>
                <td data-label="Works with you on" style={{ textTransform: 'capitalize' }}>
                  {c.relationship === 'both' ? 'Voice + coaching' : c.relationship}
                  {c.stats.count > 0 && (
                    <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.75rem' }}>
                      {c.stats.count} invoice{c.stats.count === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                <td data-label="Paid you" className="vaNum">
                  {c.stats.paid > 0 ? formatCents(c.stats.paid) : '—'}
                </td>
                <td data-label="Owes" className="vaNum" style={c.stats.owing > 0 ? { color: 'var(--va-danger)' } : undefined}>
                  {c.stats.owing > 0 ? formatCents(c.stats.owing) : '—'}
                </td>
                <td data-label="">
                  <Link href={`${BASE_PATH}/studio/clients/${c.id}`} className="vaBtn vaBtnOutline vaBtnSm">
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
