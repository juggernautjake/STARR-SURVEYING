'use client';
// app/admin/receipts/DuplicateReview.tsx — two receipts that may be one, side by side.
//
// Owner, 2026-10-06: "flag the receipts and let the user review them together and decide what to do.
// It should look at receipt date, place, total, items purchased, etc."
//
// One pair at a time: both photos, every field in two columns with matches marked, the line items,
// who submitted each, and the plain-language reason it was flagged. Three decisions — keep both,
// remove the left one, remove the right one. Removing is soft (the receipt and photo stay, out of the
// queue and the totals) and recorded with who did it.

import { useCallback, useEffect, useState } from 'react';
import './DuplicateReview.css';

interface Item { description: string | null; amount_cents: number | null; quantity: number | null }
interface Rcpt {
  id: string;
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  total_cents: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  receipt_number: string | null;
  category: string | null;
  status: string | null;
  created_at: string;
  photo_signed_url: string | null;
  submitted_by: string | null;
  items: Item[];
}
interface Pair {
  id: string;
  confidence: 'certain' | 'likely' | 'possible';
  score: number;
  reasons: string[];
  matches: Record<string, string | boolean>;
  a: Rcpt;
  b: Rcpt;
}

const money = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`);
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '—';
const CONF_LABEL: Record<Pair['confidence'], string> = {
  certain: 'Almost certainly the same receipt',
  likely: 'Probably the same receipt',
  possible: 'Might be the same receipt',
};

export default function DuplicateReview({ onChanged, onClose }: { onChanged?: () => void; onClose?: () => void }) {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/receipts/duplicates?status=open');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setPairs(body.pairs ?? []);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load possible duplicates.');
      setPairs([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (pair: Pair, action: 'keep_both' | 'remove', remove?: 'a' | 'b') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/receipts/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pair.id, action, remove }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const side = remove === 'a' ? pair.a : remove === 'b' ? pair.b : null;
      setNote(action === 'keep_both'
        ? 'Kept both — they won’t be flagged together again.'
        : `Removed ${side?.vendor_name ?? 'that receipt'} ${money(side?.total_cents)}. It’s kept out of the queue and totals.`);
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That decision could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const rescan = async () => {
    setBusy(true);
    try {
      await fetch('/api/admin/receipts/duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rescan' }) });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (pairs === null) return <section className="dupr"><p className="dupr__empty">Loading possible duplicates…</p></section>;

  const pair = pairs[index];
  return (
    <section className="dupr" aria-label="Possible duplicate receipts">
      <header className="dupr__head">
        <div>
          <h2 className="dupr__title">Possible duplicates</h2>
          <p className="dupr__sub">
            {pairs.length === 0
              ? 'Nothing to compare — no receipts look like the same receipt twice.'
              : `${index + 1} of ${pairs.length} — compare them and decide.`}
          </p>
        </div>
        <div className="dupr__head-actions">
          <button type="button" className="dupr__btn" onClick={rescan} disabled={busy}>Check again</button>
          {onClose && <button type="button" className="dupr__btn" onClick={onClose}>Close</button>}
        </div>
      </header>

      {note && <p className="dupr__note" role="status">{note}</p>}
      {error && <p className="dupr__error" role="alert">{error}</p>}

      {pair && (
        <article className={`dupr__pair dupr__pair--${pair.confidence}`}>
          <div className="dupr__verdict">
            <strong>{CONF_LABEL[pair.confidence]}</strong>
            {pair.reasons.map((r, i) => <span key={i}>{r}</span>)}
          </div>

          <div className="dupr__grid">
            {(['a', 'b'] as const).map((side) => {
              const r = pair[side];
              return (
                <div key={side} className="dupr__col">
                  <div className="dupr__col-head">{side === 'a' ? 'Receipt 1' : 'Receipt 2'}</div>
                  {r.photo_signed_url ? (
                    <a href={r.photo_signed_url} target="_blank" rel="noopener noreferrer" className="dupr__photo-link">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.photo_signed_url} alt={`Receipt from ${r.vendor_name ?? 'unknown'}`} className="dupr__photo" />
                    </a>
                  ) : <div className="dupr__photo dupr__photo--none">No photo</div>}
                </div>
              );
            })}
          </div>

          {/* Field by field, so the eye goes straight to what differs. */}
          <table className="dupr__table">
            <thead>
              <tr><th scope="col"></th><th scope="col">Receipt 1</th><th scope="col">Receipt 2</th></tr>
            </thead>
            <tbody>
              {[
                ['Date', day(pair.a.transaction_at), day(pair.b.transaction_at), pair.matches.date],
                ['Place', pair.a.vendor_name ?? '—', pair.b.vendor_name ?? '—', pair.matches.place],
                ['Total', money(pair.a.total_cents), money(pair.b.total_cents), pair.matches.total],
                ['Receipt #', pair.a.receipt_number ?? '—', pair.b.receipt_number ?? '—', pair.matches.receiptNumber],
                ['Card', pair.a.payment_last4 ? `…${pair.a.payment_last4}` : (pair.a.payment_method ?? '—'), pair.b.payment_last4 ? `…${pair.b.payment_last4}` : (pair.b.payment_method ?? '—'), pair.matches.card],
                ['Submitted by', pair.a.submitted_by ?? '—', pair.b.submitted_by ?? '—', pair.matches.sameSubmitter ? 'same' : 'different'],
                ['Uploaded', day(pair.a.created_at), day(pair.b.created_at), ''],
                ['Status', pair.a.status ?? '—', pair.b.status ?? '—', ''],
              ].map(([label, va, vb, m]) => (
                <tr key={label as string} className={m === 'same' ? 'dupr__row--same' : m === 'different' ? 'dupr__row--diff' : m && m !== 'unknown' ? 'dupr__row--near' : ''}>
                  <th scope="row">{label}</th>
                  <td>{va}</td>
                  <td>{vb}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(pair.a.items.length > 0 || pair.b.items.length > 0) && (
            <div className="dupr__items">
              <h3>Items bought <span className={`dupr__tag dupr__tag--${pair.matches.items}`}>{pair.matches.items === 'same' ? 'same items' : pair.matches.items === 'overlap' ? 'mostly the same' : pair.matches.items === 'different' ? 'different items' : ''}</span></h3>
              <div className="dupr__grid">
                {(['a', 'b'] as const).map((side) => (
                  <ul key={side} className="dupr__item-list">
                    {pair[side].items.length === 0 && <li className="dupr__muted">No items read</li>}
                    {pair[side].items.map((it, i) => (
                      <li key={i}><span>{it.description ?? 'Item'}{it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : ''}</span><span>{money(it.amount_cents)}</span></li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          )}

          <div className="dupr__actions">
            <button type="button" className="dupr__btn dupr__btn--keep" disabled={busy} onClick={() => void decide(pair, 'keep_both')}>
              Not a duplicate — keep both
            </button>
            <button type="button" className="dupr__btn dupr__btn--remove" disabled={busy}
              onClick={() => { if (window.confirm(`Remove receipt 1 (${pair.a.vendor_name ?? 'unknown'} ${money(pair.a.total_cents)})? It is kept out of the queue and totals, not erased.`)) void decide(pair, 'remove', 'a'); }}>
              Remove receipt 1
            </button>
            <button type="button" className="dupr__btn dupr__btn--remove" disabled={busy}
              onClick={() => { if (window.confirm(`Remove receipt 2 (${pair.b.vendor_name ?? 'unknown'} ${money(pair.b.total_cents)})? It is kept out of the queue and totals, not erased.`)) void decide(pair, 'remove', 'b'); }}>
              Remove receipt 2
            </button>
          </div>

          {pairs.length > 1 && (
            <div className="dupr__nav">
              <button type="button" className="dupr__btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹ Previous</button>
              <button type="button" className="dupr__btn" disabled={index >= pairs.length - 1} onClick={() => setIndex(index + 1)}>Next ›</button>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
