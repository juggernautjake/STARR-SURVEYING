'use client';

// app/admin/payments/inbox/page.tsx
//
// P10 of payment-infrastructure-2026-06-18.md — office close-out
// queue. Lists every pending payment_attempt with the invoice
// context the office needs to reconcile against Venmo / CashApp /
// Zelle transaction logs (or to mark a cash / check arrival).
//
// One-click "Mark cleared" — POST to /api/admin/payment-attempts/
// <id>/clear which flips the attempt + the invoice + fires the
// receipt email. The office can optionally fill in a platform
// transaction id / check number before clearing.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDollars } from '@/lib/payments/live';

interface PendingAttempt {
  id: string;
  method: string;
  status: 'pledged' | 'pending_confirmation';
  intended_amount_cents: number;
  payer_email: string | null;
  payer_message: string | null;
  external_ref: string | null;
  created_at: string;
  invoice_id: string;
  invoice: {
    id: string;
    invoice_number: string;
    customer_name: string | null;
    customer_email: string | null;
    total_cents: number;
    status: string;
  } | null;
}

const METHOD_LABELS: Record<string, string> = {
  venmo: 'Venmo',
  cashapp: 'Cash App',
  zelle: 'Zelle',
  cash: 'Cash',
  check: 'Check',
};

export default function PaymentsInboxPage(): React.ReactElement {
  const [attempts, setAttempts] = useState<PendingAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [clearing, setClearing] = useState<Record<string, boolean>>({});
  const [cleared, setCleared] = useState<Record<string, { invoice_status: string; recipient: string | null; receipt_sent: boolean }>>({});

  async function load() {
    setError(null);
    const res = await fetch('/api/admin/payment-attempts');
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load inbox.');
      return;
    }
    const json = await res.json();
    setAttempts(json.attempts as PendingAttempt[]);
  }
  useEffect(() => { load(); }, []);

  async function clearAttempt(attempt: PendingAttempt) {
    setClearing((c) => ({ ...c, [attempt.id]: true }));
    const res = await fetch(`/api/admin/payment-attempts/${attempt.id}/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_ref: refs[attempt.id]?.trim() || undefined,
      }),
    });
    setClearing((c) => ({ ...c, [attempt.id]: false }));
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'Could not clear the attempt.');
      return;
    }
    const json = await res.json();
    setCleared((c) => ({
      ...c,
      [attempt.id]: {
        invoice_status: json.invoice_status,
        recipient: json.receipt_recipient ?? null,
        receipt_sent: !!json.receipt_sent,
      },
    }));
    // Refresh the inbox so the row drops off.
    load();
  }

  return (
    <main className="inbox-page" data-testid="payments-inbox">
      <header className="inbox-page__header">
        <div>
          <h1 className="inbox-page__title">Payments inbox</h1>
          <p className="inbox-page__lede">
            Customer-initiated pledges + "I sent it" claims waiting on the office to close out.
          </p>
        </div>
        <Link href="/admin/invoices/new" className="inbox-page__new">+ New Invoice</Link>
      </header>

      {error && <p className="inbox-page__error" data-testid="payments-inbox-error">{error}</p>}

      {attempts === null && <p className="inbox-page__loading" data-testid="payments-inbox-loading">Loading…</p>}

      {attempts && attempts.length === 0 && (
        <p className="inbox-page__empty" data-testid="payments-inbox-empty">
          All caught up — no pending pledges or confirmations.
        </p>
      )}

      {attempts && attempts.length > 0 && (
        <ul className="inbox-list" data-testid="payments-inbox-list">
          {attempts.map((a) => {
            const isPledge = a.status === 'pledged';
            const refPlaceholder = a.method === 'venmo' ? 'Venmo tx id'
              : a.method === 'cashapp' ? 'Cash App tag'
              : a.method === 'zelle' ? 'Zelle confirmation #'
              : a.method === 'check' ? 'Check #'
              : 'Reference (optional)';
            const c = cleared[a.id];
            return (
              <li className="inbox-card" key={a.id} data-testid={`payments-attempt-${a.id}`}>
                <div className="inbox-card__head">
                  <div className="inbox-card__title">
                    {a.invoice ? (
                      <Link href={`/admin/invoices/new`} className="inbox-card__invoice">
                        Invoice {a.invoice.invoice_number}
                      </Link>
                    ) : (
                      <span>Unlinked attempt</span>
                    )}
                    <span className={`inbox-card__chip inbox-card__chip--${isPledge ? 'pledged' : 'pending'}`}>
                      {isPledge ? 'Pledged' : 'I sent it'}
                    </span>
                  </div>
                  <div className="inbox-card__amount">{formatDollars(a.intended_amount_cents)}</div>
                </div>

                <dl className="inbox-card__meta">
                  <div><dt>Method</dt><dd>{METHOD_LABELS[a.method] ?? a.method}</dd></div>
                  <div><dt>Customer</dt><dd>{a.invoice?.customer_name ?? '—'}</dd></div>
                  <div><dt>Customer email</dt><dd>{a.payer_email ?? a.invoice?.customer_email ?? '—'}</dd></div>
                  <div><dt>Submitted</dt><dd>{new Date(a.created_at).toLocaleString()}</dd></div>
                  {a.payer_message && <div><dt>Note</dt><dd>{a.payer_message}</dd></div>}
                </dl>

                {!c && (
                  <div className="inbox-card__actions">
                    <input
                      className="inbox-card__ref"
                      placeholder={refPlaceholder}
                      value={refs[a.id] ?? ''}
                      onChange={(e) => setRefs((r) => ({ ...r, [a.id]: e.target.value }))}
                      data-testid={`payments-attempt-ref-${a.id}`}
                    />
                    <button
                      type="button"
                      className="inbox-card__clear"
                      onClick={() => clearAttempt(a)}
                      disabled={!!clearing[a.id]}
                      data-testid={`payments-attempt-clear-${a.id}`}
                    >
                      {clearing[a.id] ? 'Clearing…' : 'Mark cleared'}
                    </button>
                  </div>
                )}
                {c && (
                  <p className="inbox-card__cleared" data-testid={`payments-attempt-cleared-${a.id}`}>
                    Cleared. Invoice is now <strong>{c.invoice_status}</strong>.
                    {c.recipient && c.receipt_sent && (
                      <> Receipt sent to <strong>{c.recipient}</strong>.</>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .inbox-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9;
    min-height: 100vh;
    padding: 2rem 1.25rem 4rem;
    color: #152050;
  }
  .inbox-page__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    max-width: 900px;
    margin: 0 auto 1.25rem;
  }
  .inbox-page__title {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 1.5rem;
    margin: 0;
    font-weight: 700;
  }
  .inbox-page__lede { margin: 0.25rem 0 0; color: #4a5470; }
  .inbox-page__new {
    background: #BD1218; color: #fff;
    padding: 0.55rem 1rem; border-radius: 10px;
    text-decoration: none; font-weight: 700; font-size: 0.9rem;
  }
  .inbox-page__error {
    max-width: 900px; margin: 0 auto 1rem;
    background: #fdecec; color: #8a0e13;
    padding: 0.6rem 0.85rem; border-radius: 8px;
  }
  .inbox-page__loading, .inbox-page__empty {
    max-width: 900px; margin: 2rem auto; text-align: center; color: #4a5470;
    background: #ffffff; border: 1px dashed #d6d9e3; border-radius: 12px; padding: 2rem;
  }
  .inbox-list {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 1rem;
    max-width: 900px; margin: 0 auto;
  }
  .inbox-card {
    background: #ffffff; border: 1px solid #e4e7ee; border-radius: 14px;
    padding: 1.25rem 1.4rem; box-shadow: 0 4px 16px rgba(21, 32, 80, 0.05);
  }
  .inbox-card__head {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 1rem; flex-wrap: wrap;
  }
  .inbox-card__title { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .inbox-card__invoice {
    font-family: 'Sora', sans-serif; font-weight: 700; color: #1D3095; text-decoration: none;
  }
  .inbox-card__chip {
    font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase;
    padding: 0.15rem 0.55rem; border-radius: 999px; font-weight: 700;
  }
  .inbox-card__chip--pledged { background: #fff4d6; color: #8a6300; }
  .inbox-card__chip--pending { background: #e6e9f6; color: #1D3095; }
  .inbox-card__amount {
    font-family: 'Sora', sans-serif; font-size: 1.4rem; font-weight: 700; color: #BD1218;
  }
  .inbox-card__meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem;
    margin: 0.85rem 0 1rem; font-size: 0.9rem;
  }
  .inbox-card__meta > div { display: flex; gap: 0.5rem; align-items: baseline; min-width: 0; }
  .inbox-card__meta dt { color: #6b7280; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; min-width: 95px; }
  .inbox-card__meta dd { margin: 0; color: #152050; min-width: 0; overflow-wrap: anywhere; }
  .inbox-card__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: stretch; }
  .inbox-card__ref {
    flex: 1 1 220px;
    font: inherit; padding: 0.6rem 0.8rem;
    border: 1px solid #d6d9e3; border-radius: 10px; background: #fff;
  }
  .inbox-card__ref:focus {
    outline: 2px solid rgba(29, 48, 149, 0.25); border-color: #1D3095;
  }
  .inbox-card__clear {
    font: inherit; font-weight: 700; padding: 0.65rem 1.2rem;
    background: #1f6d3c; color: #fff; border: none; border-radius: 10px; cursor: pointer;
  }
  .inbox-card__clear:hover:not(:disabled) { background: #185a30; }
  .inbox-card__clear:disabled { opacity: 0.6; cursor: not-allowed; }
  .inbox-card__cleared {
    margin: 0; padding: 0.65rem 0.85rem; background: rgba(31, 109, 60, 0.1);
    color: #1f6d3c; border-radius: 8px;
  }
  @media (max-width: 700px) {
    .inbox-card__meta { grid-template-columns: 1fr; }
    .inbox-card__head { align-items: flex-start; }
  }
`;
