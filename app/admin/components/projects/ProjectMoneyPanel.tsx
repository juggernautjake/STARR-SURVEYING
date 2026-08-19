// app/admin/components/projects/ProjectMoneyPanel.tsx — the engagement's money, and a way to
// record a payment against it.
//
// Owner, 2026-08-19: *"Please make sure we have a straight forward way to record payments, even
// partial payments on jobs and projects."*
//
// ── WHAT A PROJECT-LEVEL PAYMENT IS ─────────────────────────────────────────────────────────────
//
// A client writing one cheque for the whole Smith Tract engagement is not paying "the boundary
// survey" — they are paying the project. Forcing that cheque onto whichever job was created first
// makes that job look overpaid and its siblings unpaid, and every report built on those rows is
// then wrong in two directions at once. So it is filed against the project, and the totals below
// add it to what the individual jobs have received.
//
// Every figure comes from `/api/admin/jobs/money?project_id=…`, which calls `lib/jobs/money.ts` —
// the same arithmetic the job page and the financial pages use.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Plus, Check } from 'lucide-react';
import { PAYMENT_TYPES, PAYMENT_TYPE_LABELS, money, type PaymentType } from '@/lib/jobs/money';

interface Totals {
  jobs: number; quoted: number; billed: number; received: number;
  deposits: number; outstanding: number; cancelled: number; direct_payments?: number;
}
interface Payment {
  id: string; amount: number; payment_type: string; payment_method?: string | null;
  reference_number?: string | null; paid_at: string; recorded_by: string;
}

export default function ProjectMoneyPanel({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [direct, setDirect] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', payment_type: 'deposit' as PaymentType, payment_method: '', reference_number: '', notes: '' });

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([
      fetch(`/api/admin/jobs/money?project_id=${projectId}`),
      fetch(`/api/admin/jobs/payments?project_id=${projectId}`),
    ]);
    if (!m.ok) { setError('Could not load the project’s money.'); return; }
    setTotals((await m.json()).totals ?? null);
    if (p.ok) setDirect((await p.json()).payments ?? []);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number.parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount === 0) { setError('Enter an amount.'); return; }
    setBusy(true);
    const res = await fetch('/api/admin/jobs/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, project_id: projectId, amount }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? 'Could not record that payment.');
      return;
    }
    setShowForm(false);
    setForm({ amount: '', payment_type: 'deposit', payment_method: '', reference_number: '', notes: '' });
    setError(null);
    await load();
    onChanged?.();
  }

  if (!totals) return <div className="pd__card"><p className="pd__note">Loading money…</p></div>;

  return (
    <div className="pd__card" data-testid="project-money-panel">
      <h3><DollarSign size={15} aria-hidden /> Money</h3>

      {/* Summed from this project's jobs, plus anything paid against the project itself. Never
          stored — see lib/jobs/money.ts. */}
      <dl className="pd__money">
        <div><dt>Quoted</dt><dd>{money(totals.quoted)}</dd></div>
        <div><dt>Billing</dt><dd>{money(totals.billed)}</dd></div>
        <div><dt>Received</dt><dd>{money(totals.received)}</dd></div>
        <div className="pd__money-owed"><dt>Outstanding</dt><dd>{money(totals.outstanding)}</dd></div>
      </dl>
      <p className="pd__note">
        Across {totals.jobs} job{totals.jobs === 1 ? '' : 's'}
        {totals.cancelled > 0 && `, ${totals.cancelled} cancelled`}
        {totals.deposits > 0 && ` · ${money(totals.deposits)} in down payments`}
        {(totals.direct_payments ?? 0) !== 0 && ` · ${money(totals.direct_payments ?? 0)} paid to the project directly`}.
      </p>

      {error && <p className="proj-page__error" role="alert">{error}</p>}

      <button
        type="button"
        className="proj-page__btn proj-page__btn--secondary pfiles__upload"
        onClick={() => setShowForm((v) => !v)}
        data-testid="project-record-payment"
      >
        <Plus size={14} aria-hidden /> Record a payment
      </button>

      {showForm && (
        <form className="jmoney__form" onSubmit={record} data-testid="project-payment-form">
          <label><span>Amount</span>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required autoFocus data-testid="project-payment-amount" />
          </label>
          <label><span>Type</span>
            <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value as PaymentType })}>
              {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label><span>Method</span>
            <input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="Check, card, transfer" />
          </label>
          <label><span>Reference</span>
            <input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Check no." />
          </label>
          <div className="jmoney__formfoot">
            <button type="button" className="jmoney__btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="jmoney__btn jmoney__btn--primary" disabled={busy}>
              <Check size={14} aria-hidden /> {busy ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      )}

      {direct.length > 0 && (
        <>
          <h4 className="jmoney__sub">Paid to the project<span className="jmoney__count">{direct.length}</span></h4>
          <ul className="jmoney__list" data-testid="project-payments">
            {direct.map((p) => (
              <li key={p.id}>
                <span className="jmoney__amt">{money(Number(p.amount))}</span>
                <span className="jmoney__kind">{PAYMENT_TYPE_LABELS[p.payment_type as PaymentType] ?? p.payment_type}</span>
                <span className="jmoney__when">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : ''}
                  {p.payment_method ? ` · ${p.payment_method}` : ''}
                  {p.reference_number ? ` · ${p.reference_number}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="pd__note">Payments against individual jobs are shown on those jobs.</p>
        </>
      )}
    </div>
  );
}
