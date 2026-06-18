'use client';

// app/admin/payouts/runs/[id]/page.tsx
//
// P12 of payment-infrastructure-2026-06-18.md — payout-admin detail
// view + approval action.
//
// Shows the batch header (status pill, totals, who built it + when),
// every line item (employee + cents columns + dispatch method), and
// — for draft batches viewed by a designated payout admin — the
// Approve button. Any admin can Void a draft / approved batch.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDollars } from '@/lib/payments/live';

interface BatchDetail {
  id: string;
  label: string;
  kind: 'weekly' | 'ad_hoc';
  week_start: string | null;
  week_end: string | null;
  status: 'draft' | 'approved' | 'dispatched' | 'completed' | 'voided';
  total_cents: number;
  notes: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_ip: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
}

interface BatchItem {
  id: string;
  user_email: string;
  user_name: string | null;
  hours_cents: number;
  bonuses_cents: number;
  reimbursements_cents: number;
  adjustments_cents: number;
  total_cents: number;
  method: string | null;
  method_handle: string | null;
  status: 'pending' | 'sent' | 'paid' | 'failed';
  external_ref: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  notes: string | null;
}

const STATUS_LABEL: Record<BatchDetail['status'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  dispatched: 'Dispatched',
  completed: 'Completed',
  voided: 'Voided',
};

export default function PayoutBatchDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidPrompt, setShowVoidPrompt] = useState(false);

  async function load() {
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
    setItems(json.items);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function approve() {
    if (!batch) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/payouts/runs/${batch.id}/approve`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not approve.');
      return;
    }
    load();
  }

  async function voidBatch() {
    if (!batch) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/payouts/runs/${batch.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: voidReason.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not void.');
      return;
    }
    setShowVoidPrompt(false);
    setVoidReason('');
    load();
  }

  if (loading) {
    return <main className="batch-page"><p>Loading…</p></main>;
  }
  if (!batch) {
    return (
      <main className="batch-page">
        <p data-testid="batch-detail-error">{error ?? 'Batch not found.'}</p>
        <Link href="/admin/payouts/runs">← Back to payouts</Link>
      </main>
    );
  }

  return (
    <main className="batch-page" data-testid="batch-detail">
      <header className="batch-page__header">
        <div>
          <Link href="/admin/payouts/runs" className="batch-page__back">← Payouts</Link>
          <h1 className="batch-page__title">{batch.label}</h1>
          <div className="batch-page__meta">
            <span className={`batch-chip batch-chip--${batch.status}`} data-testid="batch-status-chip">{STATUS_LABEL[batch.status]}</span>
            <span>Created by {batch.created_by}</span>
            <span>· {new Date(batch.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div className="batch-page__total">
          <span>Grand total</span>
          <strong>{formatDollars(batch.total_cents)}</strong>
        </div>
      </header>

      {error && <p className="batch-page__error" data-testid="batch-detail-error">{error}</p>}

      {batch.status === 'approved' && (
        <div className="batch-page__sig" data-testid="batch-approval-sig">
          Approved by <strong>{batch.approved_by}</strong>
          {batch.approved_at && <> on {new Date(batch.approved_at).toLocaleString()}</>}
          {batch.approval_ip && <> · IP {batch.approval_ip}</>}
        </div>
      )}
      {batch.status === 'voided' && (
        <div className="batch-page__sig batch-page__sig--voided">
          Voided by <strong>{batch.voided_by}</strong>
          {batch.voided_at && <> on {new Date(batch.voided_at).toLocaleString()}</>}
        </div>
      )}

      <section className="batch-items">
        <h2 className="batch-items__title">Line items ({items.length})</h2>
        <div className="batch-items__head">
          <span>Employee</span>
          <span>Hours</span>
          <span>Bonus</span>
          <span>Reimb</span>
          <span>Adj</span>
          <span>Method</span>
          <span>Total</span>
        </div>
        {items.map((it) => (
          <div className="batch-items__row" key={it.id} data-testid={`batch-item-${it.id}`}>
            <div>
              <div className="batch-items__email">{it.user_email}</div>
              {it.user_name && <div className="batch-items__name">{it.user_name}</div>}
            </div>
            <div>{formatDollars(it.hours_cents)}</div>
            <div>{formatDollars(it.bonuses_cents)}</div>
            <div>{formatDollars(it.reimbursements_cents)}</div>
            <div>{formatDollars(it.adjustments_cents)}</div>
            <div>{it.method ?? '—'}</div>
            <div className="batch-items__total">{formatDollars(it.total_cents)}</div>
          </div>
        ))}
      </section>

      {(batch.status === 'draft' || batch.status === 'approved') && (
        <footer className="batch-page__actions">
          {batch.status === 'draft' && (
            <button
              type="button"
              className="batch-btn batch-btn--approve"
              onClick={approve}
              disabled={busy}
              data-testid="batch-approve"
            >
              {busy ? 'Approving…' : 'Approve batch'}
            </button>
          )}
          {!showVoidPrompt && (
            <button
              type="button"
              className="batch-btn batch-btn--void"
              onClick={() => setShowVoidPrompt(true)}
              disabled={busy}
              data-testid="batch-void"
            >
              Void
            </button>
          )}
          {showVoidPrompt && (
            <div className="batch-page__void-prompt" data-testid="batch-void-prompt">
              <input
                type="text"
                value={voidReason}
                placeholder="Reason (optional)"
                onChange={(e) => setVoidReason(e.target.value)}
              />
              <button type="button" className="batch-btn batch-btn--void" onClick={voidBatch} disabled={busy}>
                Confirm void
              </button>
              <button type="button" className="batch-btn batch-btn--ghost" onClick={() => setShowVoidPrompt(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          )}
        </footer>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .batch-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9; min-height: 100vh; color: #152050;
    padding: 2rem 1.25rem 4rem;
  }
  .batch-page__header {
    max-width: 1100px; margin: 0 auto 1rem;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;
  }
  .batch-page__back { color: #1D3095; font-size: 0.9rem; text-decoration: none; font-weight: 600; }
  .batch-page__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; margin: 0.25rem 0 0.35rem; font-weight: 700; }
  .batch-page__meta { font-size: 0.9rem; color: #6b7280; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .batch-page__total { font-family: 'Sora', sans-serif; display: flex; flex-direction: column; align-items: flex-end; }
  .batch-page__total span { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; }
  .batch-page__total strong { font-size: 1.75rem; color: #BD1218; }
  .batch-page__error {
    max-width: 1100px; margin: 0 auto 1rem;
    background: #fdecec; color: #8a0e13; padding: 0.6rem 0.85rem; border-radius: 8px;
  }
  .batch-page__sig {
    max-width: 1100px; margin: 0 auto 1rem;
    background: #e2f5e8; border-left: 4px solid #1f6d3c;
    padding: 0.85rem 1.1rem; border-radius: 8px; color: #1f6d3c;
  }
  .batch-page__sig--voided { background: #fdecec; border-left-color: #BD1218; color: #8a0e13; }
  .batch-chip {
    font-size: 0.72rem; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700;
    padding: 0.2rem 0.55rem; border-radius: 999px;
  }
  .batch-chip--draft { background: #e6e9f6; color: #1D3095; }
  .batch-chip--approved { background: #fff4d6; color: #8a6300; }
  .batch-chip--dispatched { background: #ddeaff; color: #1D3095; }
  .batch-chip--completed { background: #e2f5e8; color: #1f6d3c; }
  .batch-chip--voided { background: #fdecec; color: #8a0e13; }

  .batch-items {
    max-width: 1100px; margin: 0 auto;
    background: #fff; border: 1px solid #e4e7ee; border-radius: 14px;
    padding: 1rem 1.25rem;
  }
  .batch-items__title { font-family: 'Sora', sans-serif; font-size: 1rem; margin: 0 0 0.85rem; }
  .batch-items__head, .batch-items__row {
    display: grid; grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.9fr 0.9fr; gap: 0.5rem;
    padding: 0.55rem 0;
    align-items: baseline;
  }
  .batch-items__head { border-bottom: 1px solid #e4e7ee; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  .batch-items__row { border-bottom: 1px solid #f1f2f7; font-size: 0.92rem; }
  .batch-items__email { font-weight: 600; }
  .batch-items__name { color: #6b7280; font-size: 0.82rem; }
  .batch-items__total { font-family: 'Sora', sans-serif; font-weight: 700; }

  .batch-page__actions {
    max-width: 1100px; margin: 1.25rem auto 0;
    display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap;
  }
  .batch-btn {
    font: inherit; font-weight: 700; padding: 0.7rem 1.3rem; border: none; cursor: pointer; border-radius: 10px;
  }
  .batch-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .batch-btn--approve { background: #1f6d3c; color: #fff; }
  .batch-btn--approve:hover:not(:disabled) { background: #185a30; }
  .batch-btn--void { background: transparent; color: #8a0e13; border: 1px solid #d8a4a4; }
  .batch-btn--void:hover:not(:disabled) { background: rgba(189, 18, 24, 0.06); }
  .batch-btn--ghost { background: transparent; color: #4a5470; border: 1px solid #d6d9e3; }
  .batch-page__void-prompt {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
  }
  .batch-page__void-prompt input {
    flex: 1 1 220px; font: inherit; padding: 0.6rem 0.8rem; border: 1px solid #d6d9e3; border-radius: 10px;
  }

  @media (max-width: 800px) {
    .batch-items__head { display: none; }
    .batch-items__row { grid-template-columns: 1fr; padding: 1rem 0; }
    .batch-page__header { flex-direction: column; align-items: stretch; }
    .batch-page__total { align-items: flex-start; }
  }
`;
