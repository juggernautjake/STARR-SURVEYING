// app/admin/jobs/[id]/JobMoney.tsx — slice J3 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// > `job_payments` and `job_payment_allocations` exist with no UI; the Financial tab shows the quote
// > and time entries. Surface what is recorded, and make "what is still owed on this job"
// > answerable.
//
// ── TWO THINGS WERE MISSING, AND ONE OF THEM WAS A PROP ─────────────────────────────────────────
//
// `JobQuoteBuilder` has accepted an `onAddPayment` callback since it was written. **Nothing has ever
// passed it.** So the component rendered a payment history for payments the job page had no way to
// create — the signature repeat of this codebase's defect, in the place where it means the firm
// tracks money it received in one system and nowhere near the job it was for.
//
// The other missing thing is invoices. `customer_invoices.job_id` exists and the /pay portal bills
// against it, so a job could be invoiced $8,000, quoted $6,000, and the Financial tab would answer
// "what is owed" from the quote. Quoting and billing are different acts; the gap between them is
// what this panel names.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Plus, Loader2, FileText, ExternalLink } from 'lucide-react';
import {
  formatMoney, FINANCIAL_STATUS_LABEL, type JobFinancials,
} from '@/lib/jobs/financials';

interface PaymentRow {
  id: string;
  amount: number;
  payment_type: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  paid_at: string;
  recorded_by: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  public_slug: string;
  status: string;
  total_cents: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
}

interface Loaded {
  summary: JobFinancials;
  payments: PaymentRow[];
  invoices: InvoiceRow[];
}

interface Props {
  jobId: string;
  /** Recording a payment is admin-only at the API. The form is not rendered for anybody else —
   *  a button that always 403s teaches people the page is broken. */
  canRecordPayment: boolean;
  /** Told when a payment lands, so the page can refresh the job header's cached totals. */
  onChanged?: () => void;
}

export default function JobMoney({ jobId, canRecordPayment, onChanged }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('payment');
  const [method, setMethod] = useState('check');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/financials`);
      const json = (await res.json()) as Loaded & { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not load the financials (HTTP ${res.status}).`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const record = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/jobs/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          amount: value,
          payment_type: kind,
          payment_method: method,
          reference_number: reference.trim() || null,
          notes: note.trim() || null,
          // Sent as a date, stored as a timestamp. Midday rather than midnight so a payment dated
          // today does not land on yesterday for anybody west of UTC.
          paid_at: new Date(`${paidAt}T12:00:00`).toISOString(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `The payment could not be recorded (HTTP ${res.status}).`);
      setAmount(''); setReference(''); setNote(''); setAdding(false);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data && error) return <p className="admin-error" role="alert">{error}</p>;
  if (!data) return <p style={muted}>Loading the money…</p>;

  const s = data.summary;

  return (
    <div className="job-detail__section" style={{ marginTop: '1rem' }}>
      <h3><DollarSign size={15} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />Where the money stands</h3>

      {error && <p className="admin-error" role="alert">{error}</p>}

      <div style={gridStyle}>
        <Figure
          label={s.quotedIsFinal ? 'Agreed' : 'Quoted'}
          value={formatMoney(s.quoted)}
          hint={s.quotedIsFinal ? 'A final amount was agreed, so this is what replaces the quote.' : undefined}
        />
        <Figure
          label="Invoiced"
          value={formatMoney(s.invoiced)}
          hint={
            s.invoiced === 0 ? 'Nothing has been billed to the client yet.'
            : s.unbilled > 0 ? `${formatMoney(s.unbilled)} of the quote is still to be billed.`
            : undefined
          }
        />
        <Figure
          label="Received"
          value={formatMoney(s.netReceived)}
          hint={s.refunded > 0 ? `${formatMoney(s.received)} in, ${formatMoney(s.refunded)} refunded.` : undefined}
        />
        <Figure
          label={s.overpaid > 0 ? 'Overpaid' : 'Outstanding'}
          value={formatMoney(s.overpaid > 0 ? s.overpaid : s.outstanding)}
          tone={s.overpaid > 0 ? 'warn' : s.outstanding > 0 ? 'owed' : 'good'}
          hint={
            // The number is meaningless without saying what it was measured against — and the two
            // bases genuinely differ, which is the whole reason invoices are on this panel.
            s.basis === 'invoiced' ? 'Against what has been invoiced.'
            : s.basis === 'quoted' ? 'Against the quote — nothing has been invoiced yet.'
            : 'This job has no quote and no invoice, so there is nothing to owe.'
          }
        />
      </div>

      <p style={{ ...muted, marginTop: '0.5rem' }}>
        {FINANCIAL_STATUS_LABEL[s.status]}
        {s.overpaid > 0 && ' — more has come in than was asked for. That is either a deposit against the next job or a mistake; both need somebody to look.'}
      </p>

      {/* ── invoices ── */}
      {data.invoices.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={subheadStyle}><FileText size={13} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />Invoices</h4>
          {data.invoices.map((inv) => (
            <div key={inv.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <Link href={`/admin/invoices?invoice=${inv.id}`} style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {inv.invoice_number}
                </Link>
                <div style={muted}>
                  {inv.status}
                  {inv.issued_at && ` · issued ${fmtDate(inv.issued_at)}`}
                  {inv.due_at && !inv.paid_at && ` · due ${fmtDate(inv.due_at)}`}
                  {inv.paid_at && ` · paid ${fmtDate(inv.paid_at)}`}
                </div>
              </div>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '0.86rem' }}>
                {formatMoney(inv.total_cents / 100)}
              </span>
              <a href={`/pay/${inv.public_slug}`} target="_blank" rel="noopener noreferrer" title="The client's view" style={{ fontSize: '0.75rem' }}>
                <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* ── payments ── */}
      <div style={{ marginTop: '1rem' }}>
        <h4 style={subheadStyle}>Payments</h4>
        {data.payments.length === 0 && (
          <p style={muted}>Nothing recorded against this job yet.</p>
        )}
        {data.payments.map((p) => {
          const refund = p.payment_type === 'refund';
          return (
            <div key={p.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                  {p.payment_type.charAt(0).toUpperCase() + p.payment_type.slice(1)}
                  {p.payment_method ? ` · ${p.payment_method}` : ''}
                  {p.reference_number ? ` · ${p.reference_number}` : ''}
                </div>
                <div style={muted}>
                  {fmtDate(p.paid_at)}
                  {p.recorded_by ? ` · recorded by ${p.recorded_by}` : ''}
                  {p.notes ? ` · ${p.notes}` : ''}
                </div>
              </div>
              <span style={{
                fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '0.86rem',
                color: refund ? 'var(--color-danger-text)' : 'var(--color-success-text)',
              }}>
                {refund ? '−' : '+'}{formatMoney(p.amount)}
              </span>
            </div>
          );
        })}
      </div>

      {canRecordPayment && !adding && (
        <button type="button" style={primaryBtn} onClick={() => { setAdding(true); setError(null); }}>
          <Plus size={13} />Record a payment
        </button>
      )}

      {canRecordPayment && adding && (
        <div style={formStyle}>
          <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Amount</span>
              <input
                style={inputStyle} type="number" step="0.01" min="0" autoFocus inputMode="decimal"
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2500.00"
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>What kind</span>
              <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="payment">Payment</option>
                <option value="deposit">Deposit</option>
                {/* A refund is entered as a positive amount with this type — the API and the summary
                    both subtract it. Asking for a negative number is how somebody records -$500 as a
                    refund and takes $500 off twice. */}
                <option value="refund">Refund (money back to the client)</option>
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>How</span>
              <select style={inputStyle} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="check">Check</option>
                <option value="ach">ACH / transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>When</span>
              <input style={inputStyle} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: '0.6rem' }}>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Check / reference no.</span>
              <input style={inputStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Note (optional)</span>
              <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={primaryBtn} disabled={busy || !amount} onClick={() => void record()}>
              {busy ? <Loader2 size={13} className="spin" /> : null}
              Record it
            </button>
            <button type="button" style={ghostBtn} disabled={busy} onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
            <span style={muted}>Everyone on this job is told, with what is still outstanding.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'good' | 'owed' | 'warn';
}) {
  const color =
    tone === 'owed' ? 'var(--color-danger-text)'
    : tone === 'warn' ? 'var(--color-warning-text)'
    : tone === 'good' ? 'var(--color-success-text)'
    : 'var(--color-text-primary)';
  return (
    <div style={figureStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
      {hint && <div style={{ ...muted, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

const gridStyle: React.CSSProperties = {
  display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginTop: '0.6rem',
};
const figureStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.6rem 0.75rem',
  background: 'var(--color-surface)',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', gap: '0.7rem', alignItems: 'center', justifyContent: 'space-between',
  padding: '0.45rem 0', borderBottom: '1px solid var(--color-border)',
};
const formStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.8rem 0.9rem',
  marginTop: '0.6rem', background: 'var(--color-surface)',
};
const subheadStyle: React.CSSProperties = {
  fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)', margin: '0 0 0.3rem',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)', marginBottom: '0.2rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.5rem', borderRadius: 6,
  border: '1px solid var(--color-border)', background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.8rem',
  border: '1px solid var(--color-brand-navy)', background: 'var(--color-brand-navy)',
  color: 'var(--color-text-on-brand)', borderRadius: 6, padding: '0.4rem 0.9rem',
  fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.8rem',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', borderRadius: 6, padding: '0.35rem 0.75rem',
  fontSize: '0.82rem', cursor: 'pointer',
};
const muted: React.CSSProperties = { fontSize: '0.76rem', color: 'var(--color-text-tertiary)', lineHeight: 1.45 };
