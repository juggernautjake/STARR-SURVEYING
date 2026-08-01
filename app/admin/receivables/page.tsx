'use client';
// app/admin/receivables/page.tsx — the collections view §3 says is missing (Phase 2 item 11).
//
// One question, answered on one screen: who owes money, how much, and how late.
//
// Named "Receivables" rather than "AR" because §2.2 measured what happens when this app invents
// vocabulary — *"'Billing' means the subscription you pay for the software, 'Invoicing' means what
// your customers pay you, and 'Finances' means job profitability. Nobody will guess that."* "AR" is
// jargon that only an accountant reads; "Receivables" is the same word in English.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, TriangleAlert } from 'lucide-react';
import type { AgingBucket, AgingRow } from '@/app/api/admin/ar-aging/route';

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

interface Payload {
  rows: AgingRow[];
  totals: Record<AgingBucket, { count: number; cents: number }>;
  outstandingCents: number;
  overdueCents: number;
  buckets: AgingBucket[];
  labels: Record<AgingBucket, string>;
}

const BUCKET_COLOR: Record<AgingBucket, string> = {
  current: '#027a48',
  '1_30': '#175cd3',
  '31_60': '#b54708',
  '61_90': '#b54708',
  '90_plus': '#b42318',
  no_terms: '#475467',
};

export default function ReceivablesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AgingBucket | 'all'>('all');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/ar-aging', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || `Could not load receivables (${r.status}).`); return; }
      setData(j);
    } catch {
      // Named. An empty receivables page reads as "nobody owes us anything", which is a very
      // comfortable thing to believe and the wrong conclusion from a failed fetch.
      setError('Could not reach the server. This page is empty because it failed to load — not because nothing is outstanding.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 0 60px' }}>
        <h1 style={{ fontSize: 24 }}>Receivables</h1>
        <div role="alert" style={{ border: '1px solid #b42318', background: '#fef3f2', color: '#b42318', padding: '10px 14px', borderRadius: 8 }}>{error}</div>
      </div>
    );
  }
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const rows = filter === 'all' ? data.rows : data.rows.filter((r) => r.bucket === filter);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 0 60px' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, margin: 0 }}>
          <Banknote size={22} aria-hidden /> Receivables
        </h1>
        <p style={{ margin: '6px 0 0', color: '#475467', fontSize: 14 }}>
          Unpaid invoices, aged from their due date. An invoice with 30-day terms issued 40 days ago is
          10 days late, not 40.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#475467' }}>Outstanding</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{money(data.outstandingCents)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#b42318' }}>Past due</div>
          {/* The number somebody acts on. "Outstanding" includes invoices that simply are not due
              yet, and reads as a crisis when it is not one. */}
          <div style={{ fontSize: 28, fontWeight: 700, color: '#b42318' }}>{money(data.overdueCents)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 20 }}>
        {data.buckets.map((b) => {
          const t = data.totals[b];
          const active = filter === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setFilter(active ? 'all' : b)}
              style={{
                textAlign: 'left', cursor: 'pointer', border: `1px solid ${active ? BUCKET_COLOR[b] : '#e4e7ec'}`,
                background: active ? '#f9fafb' : 'transparent', borderRadius: 10, padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: BUCKET_COLOR[b] }}>{data.labels[b]}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{money(t?.cents ?? 0)}</div>
              <div style={{ fontSize: 12, color: '#475467' }}>{t?.count ?? 0} invoice{(t?.count ?? 0) === 1 ? '' : 's'}</div>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: '#475467', fontSize: 14 }}>
          {filter === 'all' ? 'Nothing outstanding. Every issued invoice is paid.' : 'No invoices in that bucket.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#475467', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '8px 6px' }}>Invoice</th>
                <th style={{ padding: '8px 6px' }}>Customer</th>
                <th style={{ padding: '8px 6px' }}>Due</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '10px 6px', borderTop: '1px solid #e4e7ec' }}>
                    <Link href={`/admin/invoicing?invoice=${encodeURIComponent(r.invoice_number)}`}>{r.invoice_number}</Link>
                  </td>
                  <td style={{ padding: '10px 6px', borderTop: '1px solid #e4e7ec' }}>
                    {r.customer_name || r.customer_email || '—'}
                  </td>
                  <td style={{ padding: '10px 6px', borderTop: '1px solid #e4e7ec' }}>
                    {r.due_at ? new Date(r.due_at).toLocaleDateString() : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b54708' }}>
                        <TriangleAlert size={13} aria-hidden /> none set
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 6px', borderTop: '1px solid #e4e7ec', textAlign: 'right', fontWeight: 600 }}>{money(r.balance_cents)}</td>
                  <td style={{ padding: '10px 6px', borderTop: '1px solid #e4e7ec', textAlign: 'right', color: BUCKET_COLOR[r.bucket] }}>
                    {r.days_overdue === null ? '—' : r.days_overdue === 0 ? 'Due today' : `${r.days_overdue}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
