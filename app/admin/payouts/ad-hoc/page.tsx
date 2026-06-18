'use client';

// app/admin/payouts/ad-hoc/page.tsx
//
// P15 of payment-infrastructure-2026-06-18.md — one-off bonus or
// reimbursement payout, outside the weekly batch.
//
// Same approval (P12) + dispatch (P13) + audit (P14) flow as the
// weekly path; the backend doesn't need anything new because seed
// 325's payout_batches accepts `kind = 'ad_hoc'` without
// week_start/week_end.
//
// Single-employee form: kind (bonus / reimbursement / other) → which
// cents column the amount lands in, method, notes. Submit creates a
// 1-item ad_hoc batch and lands the office on the detail page for
// the payout admin's approval.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDollars } from '@/lib/payments/live';
import '../../payments-admin.css';

type Kind = 'bonus' | 'reimbursement' | 'other';

interface AdHocForm {
  user_email: string;
  user_name: string;
  kind: Kind;
  amount_dollars: string;
  method: '' | 'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash';
  method_handle: string;
  reason: string;
}

const EMPTY: AdHocForm = {
  user_email: '', user_name: '', kind: 'bonus',
  amount_dollars: '', method: '', method_handle: '', reason: '',
};

export default function AdHocPayoutPage(): React.ReactElement {
  const router = useRouter();
  const [form, setForm] = useState<AdHocForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round((parseFloat(form.amount_dollars) || 0) * 100);

  function set<K extends keyof AdHocForm>(key: K, value: AdHocForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.user_email.trim()) {
      setError('Employee email is required.');
      return;
    }
    if (amountCents <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!form.reason.trim()) {
      setError('Please include a reason / memo so the audit trail explains the payout.');
      return;
    }

    // Bonus + other → bonuses_cents column; reimbursement →
    // reimbursements_cents. Keeps the per-employee totals clean.
    const item: Record<string, unknown> = {
      user_email: form.user_email.trim().toLowerCase(),
      user_name: form.user_name.trim() || undefined,
      method: form.method || undefined,
      method_handle: form.method_handle.trim() || undefined,
      notes: form.reason.trim(),
    };
    if (form.kind === 'reimbursement') item.reimbursements_cents = amountCents;
    else item.bonuses_cents = amountCents;

    setSubmitting(true);
    const res = await fetch('/api/admin/payouts/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'ad_hoc',
        items: [item],
        notes: `${form.kind === 'bonus' ? 'Bonus' : form.kind === 'reimbursement' ? 'Reimbursement' : 'One-off payout'} — ${form.reason.trim()}`,
        label: `${form.kind === 'bonus' ? 'Bonus' : form.kind === 'reimbursement' ? 'Reimbursement' : 'Ad-hoc'} · ${form.user_email.trim().toLowerCase()} · ${formatDollars(amountCents)}`,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'Could not create the ad-hoc payout.');
      return;
    }
    const json = await res.json();
    router.push(`/admin/payouts/runs/${json.batch.id}`);
  }

  return (
    <main className="adhoc-page" data-payments-admin data-testid="payouts-ad-hoc">
      <header className="adhoc-page__header">
        <div>
          <Link href="/admin/payouts/runs" className="adhoc-page__back">← Payouts</Link>
          <h1 className="adhoc-page__title">One-off payout</h1>
          <p className="adhoc-page__lede">
            Outside the weekly batch — bonus checks, reimbursements, anything ad-hoc. Same approval flow as the weekly batches.
          </p>
        </div>
      </header>

      <form className="adhoc-form" onSubmit={submit}>
        <fieldset className="adhoc-form__group">
          <legend>Type</legend>
          <label>
            <input type="radio" name="kind" checked={form.kind === 'bonus'} onChange={() => set('kind', 'bonus')} />
            <span><strong>Bonus</strong> — performance, holiday, spot bonus</span>
          </label>
          <label>
            <input type="radio" name="kind" checked={form.kind === 'reimbursement'} onChange={() => set('kind', 'reimbursement')} />
            <span><strong>Reimbursement</strong> — expense, mileage, fuel</span>
          </label>
          <label>
            <input type="radio" name="kind" checked={form.kind === 'other'} onChange={() => set('kind', 'other')} />
            <span><strong>Other</strong> — anything that doesn&rsquo;t fit above</span>
          </label>
        </fieldset>

        <div className="adhoc-form__row">
          <label>
            <span>Employee email *</span>
            <input
              type="email"
              required
              value={form.user_email}
              onChange={(e) => set('user_email', e.target.value)}
              placeholder="employee@starr-surveying.com"
              data-testid="adhoc-email"
            />
          </label>
          <label>
            <span>Employee name</span>
            <input
              type="text"
              value={form.user_name}
              onChange={(e) => set('user_name', e.target.value)}
              placeholder="Display name"
            />
          </label>
        </div>

        <div className="adhoc-form__row">
          <label>
            <span>Amount ($) *</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount_dollars}
              onChange={(e) => set('amount_dollars', e.target.value)}
              data-testid="adhoc-amount"
            />
          </label>
          <label>
            <span>Method</span>
            <select value={form.method} onChange={(e) => set('method', e.target.value as AdHocForm['method'])} data-testid="adhoc-method">
              <option value="">—</option>
              <option value="venmo">Venmo</option>
              <option value="cashapp">Cash App</option>
              <option value="zelle">Zelle</option>
              <option value="ach">Bank ACH</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label>
            <span>Method handle / account</span>
            <input
              type="text"
              value={form.method_handle}
              onChange={(e) => set('method_handle', e.target.value)}
              placeholder="@handle / email / acct #"
            />
          </label>
        </div>

        <label className="adhoc-form__reason">
          <span>Reason / memo *</span>
          <textarea
            rows={3}
            required
            value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="What's this payment for? (audit trail keeps this)"
            data-testid="adhoc-reason"
          />
        </label>

        {error && <p className="adhoc-form__error" data-testid="adhoc-error" role="alert">{error}</p>}

        <div className="adhoc-form__footer">
          <div className="adhoc-form__preview">
            <span>Sending</span>
            <strong data-testid="adhoc-preview-total">{formatDollars(amountCents)}</strong>
            {form.user_email.trim() && <> to <strong>{form.user_email.trim().toLowerCase()}</strong></>}
          </div>
          <div className="adhoc-form__actions">
            <Link href="/admin/payouts/runs" className="adhoc-btn adhoc-btn--ghost">Cancel</Link>
            <button type="submit" disabled={submitting} className="adhoc-btn" data-testid="adhoc-submit">
              {submitting ? 'Saving…' : 'Create draft for approval'}
            </button>
          </div>
        </div>
      </form>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .adhoc-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9; min-height: 100vh; color: #152050;
    padding: 2rem 1.25rem 4rem;
  }
  .adhoc-page__header { max-width: 720px; margin: 0 auto 1.25rem; }
  .adhoc-page__back { color: #1D3095; font-weight: 600; text-decoration: none; font-size: 0.9rem; }
  .adhoc-page__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; margin: 0.25rem 0 0.35rem; font-weight: 700; }
  .adhoc-page__lede { margin: 0; color: #4a5470; }

  .adhoc-form {
    max-width: 720px; margin: 0 auto;
    background: #fff; border: 1px solid #e4e7ee; border-radius: 14px;
    padding: 1.5rem; box-shadow: 0 4px 16px rgba(21, 32, 80, 0.05);
  }
  .adhoc-form__group {
    border: 0; padding: 0; margin: 0 0 1.25rem;
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .adhoc-form__group legend { font-size: 0.85rem; color: #4a5470; padding: 0; margin-bottom: 0.35rem; }
  .adhoc-form__group label {
    display: flex; gap: 0.6rem; align-items: center;
    padding: 0.65rem 0.85rem; border: 1px solid #d6d9e3; border-radius: 10px;
    background: #fafbfd; cursor: pointer;
  }
  .adhoc-form__group label:hover { border-color: #1D3095; }
  .adhoc-form__group input[type="radio"] { accent-color: #1D3095; }

  .adhoc-form__row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;
    margin-bottom: 1rem;
  }
  .adhoc-form__row label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #4a5470; }
  .adhoc-form__row input, .adhoc-form__row select {
    font: inherit; padding: 0.55rem 0.75rem; border: 1px solid #d6d9e3; border-radius: 8px;
  }
  .adhoc-form__row input:focus, .adhoc-form__row select:focus {
    outline: 2px solid rgba(29,48,149,0.25); border-color: #1D3095;
  }
  .adhoc-form__reason { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #4a5470; }
  .adhoc-form__reason textarea {
    font: inherit; padding: 0.65rem 0.85rem; border: 1px solid #d6d9e3; border-radius: 8px; resize: vertical;
  }
  .adhoc-form__error {
    margin: 1rem 0 0;
    background: #fdecec; color: #8a0e13;
    padding: 0.6rem 0.85rem; border-radius: 8px;
  }
  .adhoc-form__footer {
    margin-top: 1.25rem;
    display: flex; justify-content: space-between; align-items: center;
    gap: 1rem; flex-wrap: wrap;
  }
  .adhoc-form__preview {
    font-size: 0.9rem; color: #4a5470;
    display: flex; gap: 0.5rem; align-items: baseline;
  }
  .adhoc-form__preview strong:nth-of-type(1) {
    font-size: 1.4rem; color: #BD1218; font-family: 'Sora', sans-serif;
  }
  .adhoc-form__actions { display: flex; gap: 0.5rem; }
  .adhoc-btn {
    font: inherit; font-weight: 700;
    padding: 0.7rem 1.3rem; background: #BD1218; color: #fff;
    border: none; border-radius: 10px; cursor: pointer; text-decoration: none;
    display: inline-block; text-align: center;
  }
  .adhoc-btn:hover:not(:disabled) { background: #9c0e13; }
  .adhoc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .adhoc-btn--ghost { background: transparent; color: #1D3095; border: 1px solid #1D3095; }
  .adhoc-btn--ghost:hover { background: rgba(29, 48, 149, 0.06); }

  @media (max-width: 700px) {
    .adhoc-form__row { grid-template-columns: 1fr; }
  }
`;
