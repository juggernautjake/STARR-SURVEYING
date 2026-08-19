// app/admin/components/jobs/JobMoneyPanel.tsx — bid, received, owed, and how it got that way.
//
// Owner, 2026-08-19: *"sometimes we get down payments. We need to be able to record if we have
// already received money for a job. Also, sometimes we change the price of the job as well, and we
// need to be able to record the history of when payments are made and when price changes are made.
// Sometimes we reject a job altogether after having started it. We need to be able to record the
// cancellation of a job and the reason why."*
//
// Every figure here comes from `/api/admin/jobs/money`, which calls `lib/jobs/money.ts`. Nothing on
// this screen does its own arithmetic — that is the whole point of having the rules in one place.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Plus, History, Ban, AlertTriangle, Check } from 'lucide-react';
import {
  PAYMENT_TYPES, PAYMENT_TYPE_LABELS, describePriceChange, money, type PaymentType,
} from '@/lib/jobs/money';

interface Summary {
  quoted: number; billed: number; received: number; deposits: number; outstanding: number; cancelled: boolean;
}
interface Reconcile { agrees: boolean; stored: number; fromRows: number; drift: number }
interface Payment {
  id: string; amount: number; payment_type: string; payment_method?: string | null;
  reference_number?: string | null; notes?: string | null; paid_at: string; recorded_by: string;
}
interface PriceRow {
  id: string; field: string; old_amount: number | null; new_amount: number | null;
  reason: string | null; changed_by: string; created_at: string;
}

export default function JobMoneyPanel({ jobId, onChanged }: { jobId: string; onChanged?: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rec, setRec] = useState<Reconcile | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [history, setHistory] = useState<PriceRow[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [resultReason, setResultReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({ amount: '', payment_type: 'deposit' as PaymentType, payment_method: '', reference_number: '', notes: '' });

  const [showCancel, setShowCancel] = useState(false);
  const [cancel, setCancel] = useState({ result: 'abandoned', reason: '', amount_retained: '' });

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/jobs/money?job_id=${jobId}`);
    if (!res.ok) { setError('Could not load this job’s money.'); return; }
    const d = await res.json();
    setSummary(d.summary); setRec(d.reconcile);
    setPayments(d.payments ?? []); setHistory(d.priceHistory ?? []);
    setResult(d.job?.result ?? null);
    setResultReason(d.job?.result_reason ?? '');
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number.parseFloat(pay.amount);
    if (!Number.isFinite(amount) || amount === 0) { setError('Enter an amount.'); return; }
    setBusy(true);
    const res = await fetch('/api/admin/jobs/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `amount` last: `pay.amount` is the raw string from the input, and spreading it after the
      // parsed number would post "1500.00" where a number is expected.
      body: JSON.stringify({ ...pay, job_id: jobId, amount }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? 'Could not record that payment.');
      return;
    }
    setShowPay(false);
    setPay({ amount: '', payment_type: 'deposit', payment_method: '', reference_number: '', notes: '' });
    setError(null);
    await load();
    onChanged?.();
  }

  async function cancelJob(e: React.FormEvent) {
    e.preventDefault();
    if (!cancel.reason.trim()) { setError('Say why the job was cancelled — that is the part somebody needs later.'); return; }
    setBusy(true);
    const res = await fetch('/api/admin/jobs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: jobId,
        result: cancel.result,
        result_reason: cancel.reason,
        // Blank means "not decided yet", which is different from zero (refunding everything).
        amount_retained: cancel.amount_retained.trim() ? Number.parseFloat(cancel.amount_retained) : null,
      }),
    });
    setBusy(false);
    if (!res.ok) { setError('Could not record the cancellation.'); return; }
    setShowCancel(false);
    setError(null);
    await load();
    onChanged?.();
  }

  if (!summary) return <div className="jmoney"><p className="jmoney__note">Loading money…</p></div>;

  return (
    <div className="jmoney" data-testid="job-money-panel">
      <div className="jmoney__head">
        <h3><DollarSign size={16} aria-hidden /> Money</h3>
        <div className="jmoney__head-actions">
          <button type="button" className="jmoney__btn jmoney__btn--primary" onClick={() => setShowPay((v) => !v)} data-testid="job-record-payment">
            <Plus size={14} aria-hidden /> Record payment
          </button>
          {!summary.cancelled && (
            <button type="button" className="jmoney__btn jmoney__btn--danger" onClick={() => setShowCancel((v) => !v)} data-testid="job-cancel">
              <Ban size={14} aria-hidden /> Cancel job
            </button>
          )}
        </div>
      </div>

      {error && <p className="jmoney__error" role="alert">{error}</p>}

      {/* The four numbers the owner named: what we bid, what came in, what is still owed. */}
      <dl className="jmoney__figures" data-testid="job-money-figures">
        <div><dt>Quoted</dt><dd>{money(summary.quoted)}</dd></div>
        <div><dt>Billing</dt><dd>{money(summary.billed)}</dd></div>
        <div><dt>Received</dt><dd className="jmoney__in">{money(summary.received)}</dd></div>
        <div><dt>Outstanding</dt><dd className={summary.outstanding > 0 ? 'jmoney__owed' : undefined}>{money(summary.outstanding)}</dd></div>
      </dl>
      {summary.deposits > 0 && (
        <p className="jmoney__note" data-testid="job-money-deposits">
          Includes {money(summary.deposits)} received as a down payment.
        </p>
      )}

      {/* Said out loud rather than silently resolved — see `reconcile` in lib/jobs/money.ts. */}
      {rec && !rec.agrees && (
        <p className="jmoney__warn" data-testid="job-money-drift">
          <AlertTriangle size={13} aria-hidden />
          The job&rsquo;s stored total says {money(rec.stored)} but the payment records add up to{' '}
          {money(rec.fromRows)}. The records are the ones to trust.
        </p>
      )}

      {summary.cancelled && (
        <p className="jmoney__cancelled" data-testid="job-money-cancelled">
          <Ban size={13} aria-hidden /> This job was {result === 'lost' ? 'lost' : 'cancelled'}
          {resultReason ? ` — ${resultReason}` : '.'}
        </p>
      )}

      {showPay && (
        <form className="jmoney__form" onSubmit={recordPayment} data-testid="job-payment-form">
          <label><span>Amount</span>
            <input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required autoFocus data-testid="job-payment-amount" />
          </label>
          <label><span>Type</span>
            <select value={pay.payment_type} onChange={(e) => setPay({ ...pay, payment_type: e.target.value as PaymentType })} data-testid="job-payment-type">
              {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label><span>Method</span>
            <input value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })} placeholder="Check, card, transfer" />
          </label>
          <label><span>Reference</span>
            <input value={pay.reference_number} onChange={(e) => setPay({ ...pay, reference_number: e.target.value })} placeholder="Check no." />
          </label>
          <label className="jmoney__wide"><span>Notes</span>
            <input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
          </label>
          <div className="jmoney__formfoot">
            <button type="button" className="jmoney__btn" onClick={() => setShowPay(false)}>Cancel</button>
            <button type="submit" className="jmoney__btn jmoney__btn--primary" disabled={busy}>
              <Check size={14} aria-hidden /> {busy ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      )}

      {showCancel && (
        <form className="jmoney__form" onSubmit={cancelJob} data-testid="job-cancel-form">
          <label><span>Outcome</span>
            <select value={cancel.result} onChange={(e) => setCancel({ ...cancel, result: e.target.value })}>
              <option value="abandoned">Cancelled by us</option>
              <option value="lost">Lost — client went elsewhere</option>
            </select>
          </label>
          <label><span>Keeping (of money received)</span>
            <input type="number" step="0.01" value={cancel.amount_retained} onChange={(e) => setCancel({ ...cancel, amount_retained: e.target.value })} placeholder="Not decided" />
          </label>
          <label className="jmoney__wide"><span>Why *</span>
            <input value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} placeholder="Client sold the property before fieldwork" required data-testid="job-cancel-reason" />
          </label>
          <div className="jmoney__formfoot">
            <button type="button" className="jmoney__btn" onClick={() => setShowCancel(false)}>Back</button>
            <button type="submit" className="jmoney__btn jmoney__btn--danger" disabled={busy} data-testid="job-cancel-save">
              <Ban size={14} aria-hidden /> {busy ? 'Saving…' : 'Record cancellation'}
            </button>
          </div>
        </form>
      )}

      <h4 className="jmoney__sub">Payments received<span className="jmoney__count">{payments.length}</span></h4>
      {payments.length === 0 ? (
        <p className="jmoney__note">Nothing received yet.</p>
      ) : (
        <ul className="jmoney__list" data-testid="job-payments">
          {payments.map((p) => (
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
      )}

      <h4 className="jmoney__sub"><History size={13} aria-hidden /> Price history<span className="jmoney__count">{history.length}</span></h4>
      {history.length === 0 ? (
        <p className="jmoney__note">No price changes recorded.</p>
      ) : (
        <ul className="jmoney__list" data-testid="job-price-history">
          {history.map((h) => (
            <li key={h.id} className="jmoney__hist">
              <span className="jmoney__histline">{describePriceChange(h)}</span>
              <span className="jmoney__when">
                {h.changed_by} · {h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
                {h.reason ? ` — ${h.reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
