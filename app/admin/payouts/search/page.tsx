// app/admin/payouts/search/page.tsx — find any payout, to anyone
'use client';
import '../../styles/AdminTimeLogs.css';

// TRACK ALL PAYOUTS, FIND A SPECIFIC ONE
// ══════════════════════════════════════
//
// *"We need to be able to track all payouts for everyone and find specific payouts."*
//
// This reads `payout_batch_items` — the one payout ledger. It is deliberately separate from
// /admin/payout-log, which is labelled "Payout History" and shows `payout_log`: a table of
// `old_rate` / `new_rate` / `old_role` / `new_role`. That is a record of pay CHANGES. Somebody
// hunting for the record of a cheque would find rate changes there and conclude the payment was
// never made.
//
// Opens showing EVERYTHING. A search page that starts blank teaches people it has no data.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { PAYOUT_METHODS, PAYOUT_METHOD_INFO } from '@/lib/payouts/methods';

interface PayoutRow {
  id: string;
  user_email: string;
  user_name: string | null;
  amount_cents: number;
  method: string | null;
  method_label: string;
  reference: string | null;
  status: string | null;
  paid_at: string | null;
  batch_id: string | null;
  batch_label: string | null;
  batch_status: string | null;
  notes: string | null;
}

interface SearchResult {
  payouts: PayoutRow[];
  count: number;
  totalCents: number;
  settledCents: number;
  settledCount: number;
  ledgerSize: number;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const STATUS_CLASS: Record<string, string> = {
  paid: 'tl-badge--approved',
  sent: 'tl-badge--pending',
  pending: 'tl-badge--pending',
  failed: 'tl-badge--rejected',
};

export default function PayoutSearchPage() {
  const { data: session, status } = useSession();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [payStatus, setPayStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (method) params.set('method', method);
      if (payStatus) params.set('status', payStatus);
      if (from) params.set('from', `${from}T00:00:00Z`);
      if (to) params.set('to', `${to}T23:59:59Z`);

      const res = await fetch(`/api/admin/payouts/search?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'Could not search the payouts.'); return; }
      setResult(body);
    } catch {
      setError('Could not search the payouts.');
    } finally {
      setLoading(false);
    }
  }, [q, method, payStatus, from, to]);

  // Loads everything on arrival, then re-runs when a filter changes.
  useEffect(() => { if (status !== 'loading') search(); }, [status, search]);

  if (status === 'loading') return <div className="tl-page"><div className="tl-loading">Loading…</div></div>;
  if (!session?.user?.email) return <div className="tl-page"><div className="tl-loading">Please sign in</div></div>;

  return (
    <div className="tl-page">
      <div className="tl-log-header">
        <h3>Payouts</h3>
        <span className="tl-log-header__note">
          Every payment recorded, however it was made. Pay rate and role changes are on{' '}
          <Link href="/admin/payout-log">Pay change history</Link>.
        </span>
      </div>

      <div className="tl-filters">
        <input
          className="tl-search"
          placeholder="Name, email, check number, Venmo reference, batch…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="tl-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Any method</option>
          {PAYOUT_METHODS.map((m) => (
            <option key={m} value={m}>{PAYOUT_METHOD_INFO[m].label}</option>
          ))}
        </select>
        <select className="tl-select" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="paid">Paid</option>
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <input className="tl-select" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Paid from" />
        <input className="tl-select" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Paid to" />
      </div>

      {error && <div className="tl-pay-error">{error}</div>}

      {result && (
        <div className="tl-summary-cards">
          <div className="tl-summary-card">
            <div className="tl-summary-card__value">{result.count}</div>
            <div className="tl-summary-card__label">Payouts shown</div>
          </div>
          {/* Two totals, because they answer different questions. One number pretending to be both
              is how a reconciliation against a bank statement goes wrong. */}
          <div className="tl-summary-card">
            <div className="tl-summary-card__value">{money(result.totalCents)}</div>
            <div className="tl-summary-card__label">Total shown</div>
          </div>
          <div className="tl-summary-card">
            <div className="tl-summary-card__value">{money(result.settledCents)}</div>
            <div className="tl-summary-card__label">Of that, actually paid out</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="tl-loading">Searching…</div>
      ) : !result || result.count === 0 ? (
        <div className="tl-empty-day">
          {/* Nothing matched and nothing exists are different facts, and the reader needs to know
              which one they are looking at. */}
          <p>
            {result && result.ledgerSize === 0
              ? 'No payouts have been recorded yet.'
              : 'No payouts match those filters.'}
          </p>
        </div>
      ) : (
        <div className="tl-history-list">
          {result.payouts.map((p) => (
            <div key={p.id} className="tl-history-entry">
              <div className="tl-history-entry__left">
                <div>
                  <div className="tl-history-entry__type">{p.user_name || p.user_email}</div>
                  <div className="tl-history-entry__desc">
                    {p.method_label}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </div>
                  {p.batch_label && (
                    <div className="tl-history-entry__job">
                      {p.batch_label}
                      {/* A voided batch is money that never left. Without this the row reads as a
                          payment somebody received. */}
                      {p.batch_status === 'voided' && ' — batch voided, this money never left'}
                    </div>
                  )}
                  {p.notes && <div className="tl-history-entry__job">{p.notes}</div>}
                </div>
              </div>
              <div className="tl-history-entry__right">
                <span className="tl-history-entry__pay">{money(p.amount_cents)}</span>
                <span className={`tl-badge ${STATUS_CLASS[p.status ?? ''] ?? 'tl-badge--pending'}`}>
                  {p.status ?? 'unknown'}
                </span>
                <span className="tl-history-entry__rate">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : 'not sent yet'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
