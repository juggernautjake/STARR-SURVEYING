'use client';

// app/admin/employees/[email]/EmployeePayoutHistory.tsx
//
// P14 of payment-infrastructure-2026-06-18.md — full audit trail
// of an employee's payouts. Visible on their profile.
//
// Shows each payout line with: batch label, attempted_at (dispatch
// timestamp), cleared_at, method, external_ref, status pill, notes.
// Caps at 100 rows server-side; that's ~2 years for a weekly batch.

import { useEffect, useState } from 'react';
import { formatDollars } from '@/lib/payments/live';

interface PayoutRow {
  id: string;
  batch_id: string;
  total_cents: number;
  method: string | null;
  status: 'pending' | 'sent' | 'paid' | 'failed';
  external_ref: string | null;
  attempted_at: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  notes: string | null;
  created_at: string;
  batch: { label: string; status: string } | null;
}

const STATUS_LABEL: Record<PayoutRow['status'], string> = {
  pending: 'Pending',
  sent: 'Sent',
  paid: 'Paid',
  failed: 'Failed',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function EmployeePayoutHistory({ email }: { email: string }): React.ReactElement {
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/admin/employees/${encodeURIComponent(email)}/payouts`);
      if (cancelled) return;
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Failed to load payouts.');
        return;
      }
      const json = await res.json();
      setRows(json.payouts as PayoutRow[]);
    }
    load();
    return () => { cancelled = true; };
  }, [email]);

  return (
    <section className="emp-payouts" data-testid="employee-payouts">
      <h2 className="emp-payouts__title">Payout history</h2>
      {error && <p className="emp-payouts__error" data-testid="employee-payouts-error">{error}</p>}
      {rows === null && !error && <p>Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="emp-payouts__empty" data-testid="employee-payouts-empty">
          No payouts on file yet.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="emp-payouts__list" data-testid="employee-payouts-list">
          {rows.map((r) => (
            <li className="emp-payouts__row" key={r.id} data-testid={`employee-payout-${r.id}`}>
              <div className="emp-payouts__row-head">
                <div className="emp-payouts__row-batch">{r.batch?.label ?? 'Ad-hoc'}</div>
                <span className={`emp-payouts__chip emp-payouts__chip--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                <div className="emp-payouts__row-amount">{formatDollars(r.total_cents)}</div>
              </div>
              <dl className="emp-payouts__row-meta">
                <div><dt>Method</dt><dd>{r.method ?? '—'}</dd></div>
                <div><dt>Attempted</dt><dd>{fmt(r.attempted_at)}</dd></div>
                <div><dt>Cleared</dt><dd>{fmt(r.paid_at)}</dd></div>
                <div><dt>Reference</dt><dd className="emp-payouts__ref">{r.external_ref ?? '—'}</dd></div>
                {r.failure_reason && <div><dt>Failure</dt><dd>{r.failure_reason}</dd></div>}
                {r.notes && <div><dt>Notes</dt><dd>{r.notes}</dd></div>}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <style jsx>{styles}</style>
    </section>
  );
}

const styles = `
  .emp-payouts {
    margin-top: 1.5rem;
    background: #ffffff;
    border: 1px solid #e4e7ee;
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
  }
  .emp-payouts__title {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 1.1rem; font-weight: 700; margin: 0 0 0.85rem;
    color: #152050;
  }
  .emp-payouts__error {
    background: #fdecec; color: #8a0e13;
    padding: 0.55rem 0.8rem; border-radius: 8px; margin: 0 0 0.85rem;
  }
  .emp-payouts__empty { color: #4a5470; }
  .emp-payouts__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.85rem; }
  .emp-payouts__row {
    background: #f8f9fb;
    border: 1px solid #e4e7ee;
    border-radius: 10px;
    padding: 0.85rem 1rem;
  }
  .emp-payouts__row-head {
    display: flex; gap: 0.85rem; align-items: center; justify-content: space-between;
    flex-wrap: wrap;
  }
  .emp-payouts__row-batch { font-family: 'Sora', sans-serif; font-weight: 700; color: #152050; flex: 1; min-width: 0; }
  .emp-payouts__row-amount { font-family: 'Sora', sans-serif; font-weight: 700; color: #BD1218; }
  .emp-payouts__chip {
    font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700;
    padding: 0.2rem 0.55rem; border-radius: 999px;
  }
  .emp-payouts__chip--pending { background: #e6e9f6; color: #1D3095; }
  .emp-payouts__chip--sent { background: #fff4d6; color: #8a6300; }
  .emp-payouts__chip--paid { background: #e2f5e8; color: #1f6d3c; }
  .emp-payouts__chip--failed { background: #fdecec; color: #8a0e13; }
  .emp-payouts__row-meta {
    margin: 0.85rem 0 0;
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem;
    font-size: 0.88rem;
  }
  .emp-payouts__row-meta > div { display: flex; gap: 0.5rem; align-items: baseline; min-width: 0; }
  .emp-payouts__row-meta dt {
    color: #6b7280; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
    min-width: 80px;
  }
  .emp-payouts__row-meta dd { margin: 0; color: #152050; min-width: 0; overflow-wrap: anywhere; }
  .emp-payouts__ref { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
  @media (max-width: 700px) {
    .emp-payouts__row-meta { grid-template-columns: 1fr; }
  }
`;
