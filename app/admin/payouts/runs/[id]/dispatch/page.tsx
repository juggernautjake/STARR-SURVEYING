'use client';

// app/admin/payouts/runs/[id]/dispatch/page.tsx
//
// P13 of payment-infrastructure-2026-06-18.md — per-method dispatch
// workspace. The payout admin works through the approved batch one
// employee at a time: tap the platform deep link to send, then mark
// the row as sent / paid. Cash items show as a printable handout
// list with single-tap "Mark paid". ACH items get a CSV download
// the office uploads to PNC.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  buildPayoutDeepLink,
  groupItemsByMethod,
  type DispatchItem,
  type PayoutItemStatus,
  type PayoutMethod,
} from '@/lib/payouts/dispatch';
import { formatDollars } from '@/lib/payments/live';
import '../../../../payments-admin.css';

interface BatchHeader {
  id: string;
  label: string;
  status: 'draft' | 'approved' | 'dispatched' | 'completed' | 'voided';
  total_cents: number;
}

const METHOD_TITLES: Record<PayoutMethod | 'unassigned', string> = {
  venmo: 'Venmo',
  cashapp: 'Cash App',
  zelle: 'Zelle',
  ach: 'Bank ACH',
  cash: 'Cash (hand out)',
  unassigned: 'Method not assigned',
};

const STATUS_LABEL: Record<PayoutItemStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  paid: 'Paid',
  failed: 'Failed',
};

export default function PayoutDispatchPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [batch, setBatch] = useState<BatchHeader | null>(null);
  const [items, setItems] = useState<DispatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/payouts/runs/${id}`);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load.');
      setLoading(false);
      return;
    }
    const json = await res.json();
    setBatch(json.batch);
    setItems(json.items as DispatchItem[]);
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => groupItemsByMethod(items), [items]);
  const buckets: Array<{ key: PayoutMethod | 'unassigned'; label: string; rows: DispatchItem[] }> = [
    { key: 'venmo', label: METHOD_TITLES.venmo, rows: grouped.venmo },
    { key: 'cashapp', label: METHOD_TITLES.cashapp, rows: grouped.cashapp },
    { key: 'zelle', label: METHOD_TITLES.zelle, rows: grouped.zelle },
    { key: 'ach', label: METHOD_TITLES.ach, rows: grouped.ach },
    { key: 'cash', label: METHOD_TITLES.cash, rows: grouped.cash },
    { key: 'unassigned', label: METHOD_TITLES.unassigned, rows: grouped.unassigned },
  ];

  async function markItem(item: DispatchItem, status: PayoutItemStatus) {
    if (!batch) return;
    setBusy((b) => ({ ...b, [item.id]: true }));
    setError(null);
    const res = await fetch(`/api/admin/payouts/runs/${batch.id}/items/${item.id}/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        external_ref: refs[item.id]?.trim() || undefined,
      }),
    });
    setBusy((b) => ({ ...b, [item.id]: false }));
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Mark failed.');
      return;
    }
    load();
  }

  if (loading) {
    return (
      <main className="dispatch-page" data-payments-admin>
        <p role="status" aria-busy="true" aria-live="polite">Loading…</p>
      </main>
    );
  }
  if (!batch) {
    return (
      <main className="dispatch-page" data-payments-admin>
        <p data-testid="dispatch-error" role="alert">{error ?? 'Batch not found.'}</p>
        <Link href="/admin/payouts/runs">← Back to payouts</Link>
      </main>
    );
  }
  if (batch.status === 'draft' || batch.status === 'voided') {
    return (
      <main className="dispatch-page" data-payments-admin>
        <p data-testid="dispatch-blocked">
          This batch is <strong>{batch.status}</strong>. Dispatch is only available for approved or dispatched batches.
        </p>
        <Link href={`/admin/payouts/runs/${batch.id}`}>← Back to batch</Link>
      </main>
    );
  }

  return (
    <main className="dispatch-page" data-payments-admin data-testid="payouts-dispatch">
      <header className="dispatch-page__header">
        <div>
          <Link href={`/admin/payouts/runs/${batch.id}`} className="dispatch-page__back">← {batch.label}</Link>
          <h1 className="dispatch-page__title">Dispatch</h1>
          <p className="dispatch-page__lede">Work through each method below. Items auto-roll the batch status forward as you go.</p>
        </div>
        <div className="dispatch-page__total">
          <span>Batch total</span>
          <strong>{formatDollars(batch.total_cents)}</strong>
        </div>
      </header>

      {error && <p className="dispatch-page__error" data-testid="dispatch-page-error" role="alert">{error}</p>}

      {buckets.filter((b) => b.rows.length > 0).map((bucket) => (
        <section className="dispatch-bucket" key={bucket.key} data-testid={`dispatch-bucket-${bucket.key}`}>
          <div className="dispatch-bucket__head">
            <h2 className="dispatch-bucket__title">{bucket.label}</h2>
            <div className="dispatch-bucket__count">{bucket.rows.length}</div>
            {bucket.key === 'ach' && (
              <a
                className="dispatch-bucket__csv"
                href={`/api/admin/payouts/runs/${batch.id}/ach-csv`}
                target="_blank"
                rel="noreferrer"
                data-testid="dispatch-ach-csv"
              >
                Download CSV for PNC upload
              </a>
            )}
          </div>
          <ul className="dispatch-bucket__list">
            {bucket.rows.map((item) => {
              const link = buildPayoutDeepLink(item, batch.label);
              const refPlaceholder = item.method === 'venmo' ? 'Venmo tx id'
                : item.method === 'cashapp' ? 'Cash App tag'
                : item.method === 'zelle' ? 'Zelle confirmation'
                : item.method === 'ach' ? 'PNC reference'
                : 'Reference';
              return (
                <li className="dispatch-row" key={item.id} data-testid={`dispatch-row-${item.id}`}>
                  <div className="dispatch-row__who">
                    <div className="dispatch-row__name">{item.user_name ?? item.user_email}</div>
                    <div className="dispatch-row__sub">
                      {item.user_email} {item.method_handle && <>· {item.method_handle}</>}
                    </div>
                  </div>
                  <div className="dispatch-row__amount">{formatDollars(item.total_cents)}</div>
                  <div className="dispatch-row__status">
                    <span className={`dispatch-chip dispatch-chip--${item.status}`}>{STATUS_LABEL[item.status]}</span>
                  </div>
                  {item.status === 'pending' || item.status === 'failed' || item.status === 'sent' ? (
                    <div className="dispatch-row__actions">
                      {link && (item.status === 'pending' || item.status === 'failed') && (
                        <a
                          className="dispatch-btn dispatch-btn--link"
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          data-testid={`dispatch-link-${item.id}`}
                        >
                          Open
                        </a>
                      )}
                      <input
                        className="dispatch-row__ref"
                        value={refs[item.id] ?? ''}
                        onChange={(e) => setRefs((r) => ({ ...r, [item.id]: e.target.value }))}
                        placeholder={refPlaceholder}
                        data-testid={`dispatch-ref-${item.id}`}
                      />
                      {item.status !== 'sent' && bucket.key !== 'cash' && (
                        <button
                          type="button"
                          className="dispatch-btn"
                          disabled={!!busy[item.id]}
                          onClick={() => markItem(item, 'sent')}
                          data-testid={`dispatch-mark-sent-${item.id}`}
                        >
                          Mark sent
                        </button>
                      )}
                      <button
                        type="button"
                        className="dispatch-btn dispatch-btn--paid"
                        disabled={!!busy[item.id]}
                        onClick={() => markItem(item, 'paid')}
                        data-testid={`dispatch-mark-paid-${item.id}`}
                      >
                        Mark paid
                      </button>
                      {item.status !== 'failed' && (
                        <button
                          type="button"
                          className="dispatch-btn dispatch-btn--ghost"
                          disabled={!!busy[item.id]}
                          onClick={() => markItem(item, 'failed')}
                          data-testid={`dispatch-mark-failed-${item.id}`}
                        >
                          Failed
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="dispatch-row__actions">
                      <button
                        type="button"
                        className="dispatch-btn dispatch-btn--ghost"
                        disabled={!!busy[item.id]}
                        onClick={() => markItem(item, 'pending')}
                        data-testid={`dispatch-reopen-${item.id}`}
                      >
                        Reopen
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .dispatch-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9;
    min-height: 100vh;
    padding: 2rem 1.25rem 4rem;
    color: #152050;
  }
  .dispatch-page__header {
    max-width: 1100px; margin: 0 auto 1.25rem;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;
  }
  .dispatch-page__back { color: #1D3095; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
  .dispatch-page__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; margin: 0.25rem 0 0.35rem; font-weight: 700; }
  .dispatch-page__lede { margin: 0; color: #4a5470; }
  .dispatch-page__total { font-family: 'Sora', sans-serif; display: flex; flex-direction: column; align-items: flex-end; }
  .dispatch-page__total span { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; }
  .dispatch-page__total strong { font-size: 1.75rem; color: #BD1218; }
  .dispatch-page__error {
    max-width: 1100px; margin: 0 auto 1rem;
    background: #fdecec; color: #8a0e13; padding: 0.6rem 0.85rem; border-radius: 8px;
  }

  .dispatch-bucket {
    max-width: 1100px; margin: 0 auto 1.25rem;
    background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1rem 1.25rem;
  }
  .dispatch-bucket__head {
    display: flex; gap: 0.85rem; align-items: center;
    padding-bottom: 0.6rem; margin-bottom: 0.85rem; border-bottom: 1px solid #e4e7ee;
  }
  .dispatch-bucket__title { font-family: 'Sora', sans-serif; font-size: 1.05rem; margin: 0; flex: 1; }
  .dispatch-bucket__count {
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    color: #6b7280; background: #f1f2f7; padding: 0.2rem 0.55rem; border-radius: 999px;
  }
  .dispatch-bucket__csv {
    margin-left: 0.5rem;
    font-size: 0.85rem; font-weight: 700; text-decoration: none;
    background: #1D3095; color: #fff; padding: 0.4rem 0.85rem; border-radius: 8px;
  }
  .dispatch-bucket__list { list-style: none; padding: 0; margin: 0; }

  .dispatch-row {
    display: grid;
    grid-template-columns: 2fr 0.9fr 0.8fr 2.4fr;
    gap: 0.6rem;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f1f2f7;
  }
  .dispatch-row:last-child { border-bottom: 0; }
  .dispatch-row__name { font-weight: 600; }
  .dispatch-row__sub { color: #6b7280; font-size: 0.82rem; overflow-wrap: anywhere; }
  .dispatch-row__amount { font-family: 'Sora', sans-serif; font-weight: 700; }
  .dispatch-row__actions {
    display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; justify-content: flex-end;
  }
  .dispatch-row__ref {
    font: inherit; padding: 0.45rem 0.7rem; min-width: 130px;
    border: 1px solid #d6d9e3; border-radius: 8px; background: #fff;
  }

  .dispatch-chip {
    display: inline-block;
    font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700;
    padding: 0.2rem 0.55rem; border-radius: 999px;
  }
  .dispatch-chip--pending { background: #e6e9f6; color: #1D3095; }
  .dispatch-chip--sent { background: #fff4d6; color: #8a6300; }
  .dispatch-chip--paid { background: #e2f5e8; color: #1f6d3c; }
  .dispatch-chip--failed { background: #fdecec; color: #8a0e13; }

  .dispatch-btn {
    font: inherit; font-weight: 700; padding: 0.45rem 0.85rem; border-radius: 8px;
    background: #1D3095; color: #fff; border: none; cursor: pointer;
    text-decoration: none; font-size: 0.85rem;
  }
  .dispatch-btn:hover:not(:disabled) { background: #16266f; }
  .dispatch-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .dispatch-btn--link { background: #BD1218; }
  .dispatch-btn--link:hover { background: #9c0e13; }
  .dispatch-btn--paid { background: #1f6d3c; }
  .dispatch-btn--paid:hover { background: #185a30; }
  .dispatch-btn--ghost { background: transparent; color: #4a5470; border: 1px solid #d6d9e3; }
  .dispatch-btn--ghost:hover:not(:disabled) { background: rgba(0,0,0,0.03); }

  @media (max-width: 900px) {
    .dispatch-row { grid-template-columns: 1fr; gap: 0.4rem; padding: 1rem 0; }
    .dispatch-row__actions { justify-content: flex-start; }
  }
`;
