'use client';

// app/admin/finances/reconcile/page.tsx
//
// G3 / Phase 2.3b — bank reconciliation queue. Upload a PNC CSV, then work the
// unmatched transactions: each shows up to 3 suggested matches (payout /
// expense / payment) the office confirms with one click, or ignores.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDollars } from '@/lib/payments/live';
import '../../payments-admin.css';

interface Suggestion {
  candidate: { kind: 'payout' | 'expense' | 'payment'; id: string; amount_cents: number; at: string; label?: string };
  score: number;
  day_diff: number;
}
interface Txn {
  id: string;
  posted_at: string;
  amount_cents: number;
  direction: string;
  description: string | null;
  suggestions: Suggestion[];
}

const KIND_LABEL: Record<string, string> = { payout: 'Payout', expense: 'Expense', payment: 'Payment' };

export default function ReconcilePage(): React.ReactElement {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/admin/finances/bank');
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load transactions.');
      return;
    }
    setTxns((await res.json()).transactions ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setCsvText(await f.text());
    setImportMsg(null);
  }

  async function doImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportMsg(null);
    const res = await fetch('/api/admin/finances/bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText }),
    });
    setImporting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImportMsg(`⚠ ${data.error ?? 'Import failed.'}`);
      return;
    }
    setImportMsg(`✓ Parsed ${data.parsed}, imported ${data.imported}, skipped ${data.skipped} (already imported).`);
    setCsvText('');
    setFileName('');
    load();
  }

  async function act(txnId: string, body: Record<string, unknown>) {
    setBusyId(txnId);
    const res = await fetch(`/api/admin/finances/bank/${txnId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Action failed.');
      return;
    }
    setTxns((prev) => prev.filter((t) => t.id !== txnId));
  }

  return (
    <main className="rec-page" data-payments-admin data-testid="finances-reconcile">
      <header className="rec-page__header">
        <Link href="/admin/finances" className="rec-page__back">← Finances</Link>
        <h1 className="rec-page__title">Bank reconciliation</h1>
        <p className="rec-page__lede">
          Import your PNC CSV, then confirm what each transaction was — a payout, a business
          expense, or a customer payment — so every dollar in and out of the account is explained.
        </p>
      </header>

      <section className="rec-import">
        <label className="rec-import__file">
          <input type="file" accept=".csv,text/csv" onChange={onFile} data-testid="rec-file" />
          <span>{fileName || 'Choose a PNC CSV…'}</span>
        </label>
        <button type="button" className="rec-btn" onClick={doImport} disabled={!csvText.trim() || importing} data-testid="rec-import">
          {importing ? 'Importing…' : 'Import'}
        </button>
        {importMsg && <span className="rec-import__msg" data-testid="rec-import-msg">{importMsg}</span>}
      </section>

      {error && <p className="rec-error" role="alert" data-testid="rec-error">{error}</p>}

      {loading ? (
        <p className="rec-empty">Loading…</p>
      ) : txns.length === 0 ? (
        <p className="rec-empty" data-testid="rec-empty">Nothing to reconcile — every imported transaction is matched or ignored.</p>
      ) : (
        <section className="rec-list" data-testid="rec-list">
          {txns.map((t) => {
            const debit = t.amount_cents < 0;
            return (
              <article className="rec-card" key={t.id} data-testid={`rec-txn-${t.id}`}>
                <div className="rec-card__top">
                  <div>
                    <div className="rec-card__desc">{t.description || '(no description)'}</div>
                    <div className="rec-card__date">{t.posted_at}</div>
                  </div>
                  <div className={`rec-card__amt ${debit ? 'rec-neg' : 'rec-pos'}`}>
                    {debit ? '−' : '+'}{formatDollars(Math.abs(t.amount_cents))}
                    <span className="rec-card__dir">{debit ? 'out' : 'in'}</span>
                  </div>
                </div>

                {t.suggestions.length > 0 ? (
                  <div className="rec-suggests">
                    {t.suggestions.map((s) => (
                      <div className="rec-suggest" key={`${s.candidate.kind}-${s.candidate.id}`}>
                        <span className={`rec-chip rec-chip--${s.candidate.kind}`}>{KIND_LABEL[s.candidate.kind]}</span>
                        <span className="rec-suggest__label">{s.candidate.label}</span>
                        <span className="rec-suggest__meta">
                          {formatDollars(s.candidate.amount_cents)} · {String(s.candidate.at).slice(0, 10)}
                          {s.day_diff > 0 ? ` · ${s.day_diff}d off` : ' · same day'}
                        </span>
                        <button
                          type="button"
                          className="rec-btn rec-btn--sm"
                          disabled={busyId === t.id}
                          onClick={() => act(t.id, { action: 'confirm', kind: s.candidate.kind, matched_id: s.candidate.id })}
                          data-testid={`rec-confirm-${t.id}`}
                        >
                          Confirm
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rec-nomatch">No suggested match (amount didn&rsquo;t line up with a payout, expense, or payment near this date).</p>
                )}

                <div className="rec-card__actions">
                  <button
                    type="button"
                    className="rec-btn rec-btn--ghost rec-btn--sm"
                    disabled={busyId === t.id}
                    onClick={() => act(t.id, { action: 'ignore' })}
                    data-testid={`rec-ignore-${t.id}`}
                  >
                    Ignore
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .rec-page { font-family: 'Inter', sans-serif; background: #f4f5f9; min-height: 100vh; color: #152050; padding: 2rem 1.25rem 4rem; }
  .rec-page__header { max-width: 1000px; margin: 0 auto 1rem; }
  .rec-page__back { color: #1D3095; font-weight: 600; text-decoration: none; font-size: 0.9rem; }
  .rec-page__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; margin: 0.25rem 0 0.35rem; font-weight: 700; }
  .rec-page__lede { margin: 0; color: #4a5470; max-width: 760px; }

  .rec-btn { font: inherit; font-weight: 700; padding: 0.6rem 1.1rem; background: #1D3095; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
  .rec-btn:hover:not(:disabled) { background: #16266f; }
  .rec-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .rec-btn--sm { padding: 0.4rem 0.8rem; font-size: 0.85rem; }
  .rec-btn--ghost { background: transparent; color: #1D3095; border: 1px solid #1D3095; }
  .rec-btn--ghost:hover:not(:disabled) { background: rgba(29,48,149,0.05); }

  .rec-import { max-width: 1000px; margin: 0 auto 1rem; background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1rem 1.25rem; display: flex; gap: 0.85rem; align-items: center; flex-wrap: wrap; }
  .rec-import__file { display: inline-flex; align-items: center; gap: 0.5rem; }
  .rec-import__file input { width: 0.1px; height: 0.1px; opacity: 0; position: absolute; }
  .rec-import__file span { padding: 0.55rem 0.9rem; border: 1px dashed #1D3095; border-radius: 10px; color: #1D3095; font-weight: 600; cursor: pointer; }
  .rec-import__msg { font-size: 0.88rem; color: #4a5470; }

  .rec-error { max-width: 1000px; margin: 0 auto 1rem; background: #fdecec; color: #8a0e13; padding: 0.6rem 0.85rem; border-radius: 8px; }
  .rec-empty { max-width: 1000px; margin: 2rem auto; text-align: center; color: #4a5470; }

  .rec-list { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.85rem; }
  .rec-card { background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1rem 1.25rem; }
  .rec-card__top { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
  .rec-card__desc { font-weight: 600; overflow-wrap: anywhere; }
  .rec-card__date { font-size: 0.82rem; color: #6b7280; }
  .rec-card__amt { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 1.2rem; white-space: nowrap; }
  .rec-card__dir { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 0.4rem; color: #6b7280; }
  .rec-pos { color: #1f6d3c; }
  .rec-neg { color: #8a0e13; }

  .rec-suggests { margin-top: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .rec-suggest { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.7rem; background: #fafbfd; border: 1px solid #eef0f4; border-radius: 10px; }
  .rec-suggest__label { font-weight: 600; }
  .rec-suggest__meta { font-size: 0.8rem; color: #6b7280; }
  .rec-suggest button { margin-left: auto; }
  .rec-chip { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.12rem 0.45rem; border-radius: 999px; }
  .rec-chip--payout { background: #e6e9f6; color: #1D3095; }
  .rec-chip--expense { background: #fdecec; color: #BD1218; }
  .rec-chip--payment { background: #e2f5e8; color: #1f6d3c; }
  .rec-nomatch { margin: 0.85rem 0 0; font-size: 0.85rem; color: #6b7280; font-style: italic; }
  .rec-card__actions { margin-top: 0.75rem; display: flex; justify-content: flex-end; }

  @media (max-width: 700px) {
    .rec-suggest button { margin-left: 0; }
  }
`;
