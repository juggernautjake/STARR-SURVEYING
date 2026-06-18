'use client';

// app/admin/payouts/runs/page.tsx
//
// P11 of payment-infrastructure-2026-06-18.md — weekly payout batch
// wizard + history list.
//
// Default view: list every batch (newest first) with status pills
// + grand totals. "New batch" button opens the wizard inline. The
// wizard:
//   - Defaults the week to the most-recent Monday → Sunday
//   - Lets the office add per-employee lines (hours / bonuses /
//     reimbursements / adjustments) and pick the dispatch method
//   - Previews the grand total as the office types
//   - Submits as `draft` — approval + dispatch land in later slices

import { useEffect, useMemo, useState } from 'react';
import {
  batchItemTotalCents,
  batchTotalCents,
  buildBatchLabel,
  snapToWeekEnd,
  snapToWeekStart,
} from '@/lib/payouts/batch';
import { formatDollars } from '@/lib/payments/live';

interface BatchListRow {
  id: string;
  label: string;
  kind: 'weekly' | 'ad_hoc';
  status: 'draft' | 'approved' | 'dispatched' | 'completed' | 'voided';
  total_cents: number;
  week_start: string | null;
  week_end: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface DraftRow {
  user_email: string;
  user_name: string;
  hours_dollars: string;
  bonuses_dollars: string;
  reimbursements_dollars: string;
  adjustments_dollars: string;
  method: '' | 'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash';
  method_handle: string;
  notes: string;
}

const EMPTY_DRAFT_ROW: DraftRow = {
  user_email: '',
  user_name: '',
  hours_dollars: '',
  bonuses_dollars: '',
  reimbursements_dollars: '',
  adjustments_dollars: '',
  method: '',
  method_handle: '',
  notes: '',
};

const STATUS_LABEL: Record<BatchListRow['status'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  dispatched: 'Dispatched',
  completed: 'Completed',
  voided: 'Voided',
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dollarsToCents(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function PayoutRunsPage(): React.ReactElement {
  const [batches, setBatches] = useState<BatchListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Wizard state
  const today = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => snapToWeekStart(today), [today]);
  const defaultEnd = useMemo(() => snapToWeekEnd(defaultStart), [defaultStart]);
  const [weekStart, setWeekStart] = useState(isoDate(defaultStart));
  const [weekEnd, setWeekEnd] = useState(isoDate(defaultEnd));
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([{ ...EMPTY_DRAFT_ROW }]);

  async function loadBatches() {
    setError(null);
    const res = await fetch('/api/admin/payouts/runs');
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load.');
      return;
    }
    const json = await res.json();
    setBatches(json.batches as BatchListRow[]);
  }
  useEffect(() => { loadBatches(); }, []);

  const itemsForTotal = rows.map((r) => ({
    hours_cents: dollarsToCents(r.hours_dollars),
    bonuses_cents: dollarsToCents(r.bonuses_dollars),
    reimbursements_cents: dollarsToCents(r.reimbursements_dollars),
    adjustments_cents: dollarsToCents(r.adjustments_dollars),
  }));
  const grandTotal = batchTotalCents(itemsForTotal);

  const previewLabel = useMemo(() => (
    weekStart && weekEnd
      ? buildBatchLabel(new Date(`${weekStart}T00:00:00Z`), new Date(`${weekEnd}T00:00:00Z`))
      : ''
  ), [weekStart, weekEnd]);

  function setRow(i: number, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addRow() { setRows((rs) => [...rs, { ...EMPTY_DRAFT_ROW }]); }
  function removeRow(i: number) {
    setRows((rs) => rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i));
  }

  async function submitBatch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = rows
      .filter((r) => r.user_email.trim().length > 0)
      .map((r) => ({
        user_email: r.user_email.trim().toLowerCase(),
        user_name: r.user_name.trim() || null,
        hours_cents: dollarsToCents(r.hours_dollars),
        bonuses_cents: dollarsToCents(r.bonuses_dollars),
        reimbursements_cents: dollarsToCents(r.reimbursements_dollars),
        adjustments_cents: dollarsToCents(r.adjustments_dollars),
        method: r.method || undefined,
        method_handle: r.method_handle.trim() || undefined,
        notes: r.notes.trim() || undefined,
      }))
      .filter((r) => batchItemTotalCents(r) > 0);
    if (items.length === 0) {
      setError('Add at least one employee with a positive total.');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/admin/payouts/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'weekly',
        week_start: weekStart,
        week_end: weekEnd,
        items,
        notes: notes.trim() || null,
        label: previewLabel,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'Could not create the batch.');
      return;
    }
    setWizardOpen(false);
    setRows([{ ...EMPTY_DRAFT_ROW }]);
    setNotes('');
    loadBatches();
  }

  return (
    <main className="payouts-page" data-testid="payouts-runs">
      <header className="payouts-page__header">
        <div>
          <h1 className="payouts-page__title">Weekly payouts</h1>
          <p className="payouts-page__lede">
            Build the weekly batch, review the totals, send it to the payout admin for approval.
          </p>
        </div>
        {!wizardOpen && (
          <button
            type="button"
            className="payouts-page__new"
            onClick={() => setWizardOpen(true)}
            data-testid="payouts-new-batch"
          >
            + New batch
          </button>
        )}
      </header>

      {error && <p className="payouts-page__error" data-testid="payouts-error">{error}</p>}

      {wizardOpen && (
        <form className="payouts-wizard" onSubmit={submitBatch} data-testid="payouts-wizard">
          <h2 className="payouts-wizard__title">New weekly batch</h2>
          <div className="payouts-wizard__week">
            <label>
              <span>Week start</span>
              <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} data-testid="payouts-week-start" />
            </label>
            <label>
              <span>Week end</span>
              <input type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} data-testid="payouts-week-end" />
            </label>
            <div className="payouts-wizard__label-preview">{previewLabel}</div>
          </div>

          <div className="payouts-wizard__items">
            <div className="payouts-wizard__items-head">
              <span>Employee</span>
              <span>Hours $</span>
              <span>Bonus $</span>
              <span>Reimb $</span>
              <span>Adj $</span>
              <span>Method</span>
              <span>Total</span>
              <span />
            </div>
            {rows.map((row, i) => {
              const rowTotal = batchItemTotalCents({
                hours_cents: dollarsToCents(row.hours_dollars),
                bonuses_cents: dollarsToCents(row.bonuses_dollars),
                reimbursements_cents: dollarsToCents(row.reimbursements_dollars),
                adjustments_cents: dollarsToCents(row.adjustments_dollars),
              });
              return (
                <div className="payouts-wizard__row" key={i} data-testid={`payouts-row-${i}`}>
                  <div className="payouts-wizard__employee">
                    <input
                      type="email"
                      placeholder="employee@starr-surveying.com"
                      value={row.user_email}
                      onChange={(e) => setRow(i, { user_email: e.target.value })}
                      data-testid={`payouts-row-email-${i}`}
                    />
                    <input
                      type="text"
                      placeholder="Display name"
                      value={row.user_name}
                      onChange={(e) => setRow(i, { user_name: e.target.value })}
                    />
                  </div>
                  <input type="number" min={0} step="0.01" value={row.hours_dollars} onChange={(e) => setRow(i, { hours_dollars: e.target.value })} />
                  <input type="number" min={0} step="0.01" value={row.bonuses_dollars} onChange={(e) => setRow(i, { bonuses_dollars: e.target.value })} />
                  <input type="number" min={0} step="0.01" value={row.reimbursements_dollars} onChange={(e) => setRow(i, { reimbursements_dollars: e.target.value })} />
                  <input type="number" step="0.01" value={row.adjustments_dollars} onChange={(e) => setRow(i, { adjustments_dollars: e.target.value })} />
                  <select
                    value={row.method}
                    onChange={(e) => setRow(i, { method: e.target.value as DraftRow['method'] })}
                    data-testid={`payouts-row-method-${i}`}
                  >
                    <option value="">—</option>
                    <option value="venmo">Venmo</option>
                    <option value="cashapp">Cash App</option>
                    <option value="zelle">Zelle</option>
                    <option value="ach">ACH</option>
                    <option value="cash">Cash</option>
                  </select>
                  <span className="payouts-wizard__total">{formatDollars(rowTotal)}</span>
                  <button
                    type="button"
                    className="payouts-wizard__remove"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    aria-label="Remove row"
                  >×</button>
                </div>
              );
            })}
            <button type="button" className="payouts-wizard__add" onClick={addRow} data-testid="payouts-add-row">
              + Add employee
            </button>
          </div>

          <label className="payouts-wizard__notes">
            <span>Batch notes (optional)</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="payouts-wizard__footer">
            <div className="payouts-wizard__grand" data-testid="payouts-grand-total">
              <span>Grand total</span>
              <strong>{formatDollars(grandTotal)}</strong>
            </div>
            <div className="payouts-wizard__actions">
              <button type="button" className="payouts-btn payouts-btn--ghost" onClick={() => setWizardOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="payouts-btn" disabled={submitting} data-testid="payouts-submit">
                {submitting ? 'Saving…' : 'Save as draft'}
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="payouts-history" data-testid="payouts-history">
        <h2 className="payouts-history__title">History</h2>
        {batches === null && <p>Loading…</p>}
        {batches && batches.length === 0 && (
          <p className="payouts-history__empty" data-testid="payouts-history-empty">
            No batches yet. Click "New batch" to start the first one.
          </p>
        )}
        {batches && batches.length > 0 && (
          <ul className="payouts-history__list">
            {batches.map((b) => (
              <li className="payouts-history__row" key={b.id} data-testid={`payouts-history-${b.id}`}>
                <div>
                  <div className="payouts-history__label">{b.label}</div>
                  <div className="payouts-history__meta">
                    {b.kind} · created by {b.created_by} · {new Date(b.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="payouts-history__right">
                  <span className={`payouts-chip payouts-chip--${b.status}`}>{STATUS_LABEL[b.status]}</span>
                  <strong>{formatDollars(b.total_cents)}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .payouts-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9;
    min-height: 100vh;
    padding: 2rem 1.25rem 4rem;
    color: #152050;
  }
  .payouts-page__header {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 1rem; max-width: 1100px; margin: 0 auto 1.25rem;
  }
  .payouts-page__title {
    font-family: 'Sora', sans-serif; font-size: 1.5rem; font-weight: 700; margin: 0;
  }
  .payouts-page__lede { margin: 0.25rem 0 0; color: #4a5470; }
  .payouts-page__new {
    background: #BD1218; color: #fff; padding: 0.6rem 1.1rem;
    border: none; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer;
  }
  .payouts-page__new:hover { background: #9c0e13; }
  .payouts-page__error {
    max-width: 1100px; margin: 0 auto 1rem;
    background: #fdecec; color: #8a0e13;
    padding: 0.6rem 0.85rem; border-radius: 8px;
  }

  .payouts-wizard {
    background: #fff; border: 1px solid #e4e7ee; border-radius: 14px;
    padding: 1.5rem; max-width: 1100px; margin: 0 auto 1.5rem;
    box-shadow: 0 4px 16px rgba(21, 32, 80, 0.06);
  }
  .payouts-wizard__title { font-family: 'Sora', sans-serif; font-size: 1.15rem; margin: 0 0 1rem; }
  .payouts-wizard__week {
    display: grid; grid-template-columns: repeat(2, auto) 1fr; gap: 0.85rem; align-items: end; margin-bottom: 1rem;
  }
  .payouts-wizard__week label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #4a5470; }
  .payouts-wizard__week input { font: inherit; padding: 0.5rem 0.7rem; border: 1px solid #d6d9e3; border-radius: 8px; }
  .payouts-wizard__label-preview { font-weight: 700; color: #1D3095; padding: 0.6rem 0.8rem; background: #f4f5f9; border-radius: 8px; }

  .payouts-wizard__items { margin-top: 1rem; }
  .payouts-wizard__items-head, .payouts-wizard__row {
    display: grid;
    grid-template-columns: 2.2fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr 0.9fr 0.4fr;
    gap: 0.45rem;
    padding: 0.4rem 0;
    align-items: center;
  }
  .payouts-wizard__items-head { font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e4e7ee; }
  .payouts-wizard__employee { display: flex; flex-direction: column; gap: 0.25rem; }
  .payouts-wizard__row input, .payouts-wizard__row select {
    font: inherit; padding: 0.45rem 0.55rem; border: 1px solid #d6d9e3; border-radius: 7px; min-width: 0;
  }
  .payouts-wizard__total { text-align: right; font-weight: 600; font-family: 'Sora', sans-serif; }
  .payouts-wizard__remove {
    width: 30px; height: 30px; border-radius: 8px;
    border: 1px solid #d6d9e3; background: #fafbfd; cursor: pointer;
  }
  .payouts-wizard__remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .payouts-wizard__add {
    margin-top: 0.5rem;
    font: inherit; font-weight: 700; color: #1D3095;
    background: transparent; border: 1px solid #1D3095; padding: 0.5rem 1rem;
    border-radius: 10px; cursor: pointer;
  }
  .payouts-wizard__notes {
    display: flex; flex-direction: column; gap: 0.3rem;
    margin-top: 1rem; font-size: 0.85rem; color: #4a5470;
  }
  .payouts-wizard__notes textarea { font: inherit; padding: 0.55rem 0.7rem; border: 1px solid #d6d9e3; border-radius: 8px; }
  .payouts-wizard__footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 1.25rem; gap: 1rem; flex-wrap: wrap;
  }
  .payouts-wizard__grand {
    display: flex; gap: 1rem; align-items: baseline;
    font-family: 'Sora', sans-serif; font-size: 1.1rem;
  }
  .payouts-wizard__grand strong { font-size: 1.4rem; color: #BD1218; }
  .payouts-wizard__actions { display: flex; gap: 0.5rem; }
  .payouts-btn {
    font: inherit; font-weight: 700;
    padding: 0.7rem 1.3rem; border: none;
    background: #BD1218; color: #fff; border-radius: 10px; cursor: pointer;
  }
  .payouts-btn:hover:not(:disabled) { background: #9c0e13; }
  .payouts-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .payouts-btn--ghost { background: transparent; color: #1D3095; border: 1px solid #1D3095; }
  .payouts-btn--ghost:hover:not(:disabled) { background: rgba(29, 48, 149, 0.06); }

  .payouts-history { max-width: 1100px; margin: 0 auto; }
  .payouts-history__title { font-family: 'Sora', sans-serif; font-size: 1.1rem; margin: 0 0 0.75rem; }
  .payouts-history__empty {
    background: #fff; border: 1px dashed #d6d9e3; border-radius: 12px;
    padding: 2rem; text-align: center; color: #4a5470;
  }
  .payouts-history__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .payouts-history__row {
    background: #fff; border: 1px solid #e4e7ee; border-radius: 12px;
    padding: 0.85rem 1rem;
    display: flex; justify-content: space-between; align-items: center; gap: 1rem;
  }
  .payouts-history__label { font-family: 'Sora', sans-serif; font-weight: 700; }
  .payouts-history__meta { font-size: 0.8rem; color: #6b7280; }
  .payouts-history__right { display: flex; gap: 0.85rem; align-items: center; }
  .payouts-chip {
    font-size: 0.72rem; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700;
    padding: 0.2rem 0.55rem; border-radius: 999px;
  }
  .payouts-chip--draft { background: #e6e9f6; color: #1D3095; }
  .payouts-chip--approved { background: #fff4d6; color: #8a6300; }
  .payouts-chip--dispatched { background: #ddeaff; color: #1D3095; }
  .payouts-chip--completed { background: #e2f5e8; color: #1f6d3c; }
  .payouts-chip--voided { background: #fdecec; color: #8a0e13; }

  @media (max-width: 900px) {
    .payouts-wizard__items-head { display: none; }
    .payouts-wizard__row { grid-template-columns: 1fr; gap: 0.6rem; padding: 0.85rem 0; border-bottom: 1px solid #e4e7ee; }
    .payouts-wizard__total { text-align: left; }
    .payouts-wizard__week { grid-template-columns: 1fr; }
  }
`;
