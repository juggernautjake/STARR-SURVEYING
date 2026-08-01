'use client';
// QuotesCard — record, revise and decide the official quote. A5.
//
// The owner's step: *"he can give the official quote, which he will record."* Before this there was
// nowhere to record it except a single number on the lead, which a revision overwrote.
//
// ── WHAT THIS SCREEN IS FOR, AND WHAT IT IS NOT ────────────────────────────────────────────────────
//
// It is a LEDGER, not an editor. Every version stays on screen with its outcome, because the history is
// the point — "we quoted £1,500, they pushed back, we did £1,200 and won it" is the sentence the business
// wants back, and an editor that overwrote v1 would delete the first half of it.
//
// So there is no edit button. A wrong figure is corrected by recording a revision, which is also what
// happened in the real world.
//
// ── THE DECLINE REASON IS REQUIRED, AND THE FORM SAYS WHY ──────────────────────────────────────────
//
// The server refuses a decline without one. The form asks for it in the same breath rather than letting
// someone press Decline and be rejected — a required field discovered by being refused is a field people
// learn to resent.
import { useCallback, useEffect, useState } from 'react';

interface Quote {
  id: string;
  version: number;
  amount_cents: number;
  scope_notes: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'superseded';
  decline_reason: string | null;
  quoted_by: string | null;
  quoted_at: string;
  decided_at: string | null;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Colour by outcome, not by recency — the eye should find "accepted" and "declined" first. */
const STATUS_STYLE: Record<Quote['status'], { bg: string; fg: string; label: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151', label: 'Draft' },
  sent: { bg: '#eff6ff', fg: '#1d4ed8', label: 'Sent' },
  accepted: { bg: '#ecfdf5', fg: '#065f46', label: 'Accepted' },
  declined: { bg: '#fef2f2', fg: '#991b1b', label: 'Declined' },
  expired: { bg: '#fffbeb', fg: '#92400e', label: 'Expired' },
  superseded: { bg: '#f9fafb', fg: '#6b7280', label: 'Superseded' },
};

export default function QuotesCard({ leadId }: { leadId: string }): React.ReactElement {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/quotes`);
      const json = await res.json().catch(() => ({}));
      setQuotes(Array.isArray(json.quotes) ? json.quotes : []);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  async function record() {
    setError(null);
    // Dollars in, cents out — converted ONCE, here at the edge, because the API and the table both speak
    // cents and a second conversion downstream is where a factor of 100 gets in.
    const dollars = Number(amount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(dollars)) { setError('Enter the quoted amount.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: Math.round(dollars * 100), scopeNotes: scope.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not record the quote.'); return; }
      setAmount(''); setScope('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(quoteId: string, decision: 'accepted' | 'declined') {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/quotes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, decision, declineReason: decision === 'declined' ? declineReason : null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not save that decision.'); return; }
      setDeclineFor(null); setDeclineReason('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const live = quotes.find((q) => q.status === 'draft' || q.status === 'sent');

  return (
    <section className="lead-quotes" data-testid="lead-quotes-card">
      <h3 className="lead-quotes__title">
        <span aria-hidden>💷</span> Official quote
        {quotes.length > 0 && <span className="lead-quotes__count">{quotes.length} version{quotes.length === 1 ? '' : 's'}</span>}
      </h3>

      {loading ? (
        <p className="lead-quotes__muted">Loading quotes…</p>
      ) : quotes.length === 0 ? (
        <p className="lead-quotes__muted">No quote recorded yet.</p>
      ) : (
        <ol className="lead-quotes__list" data-testid="lead-quotes-list">
          {quotes.map((q) => {
            const style = STATUS_STYLE[q.status];
            return (
              <li key={q.id} className="lead-quotes__item">
                <div className="lead-quotes__row">
                  <strong className="lead-quotes__amount">{money(q.amount_cents)}</strong>
                  <span className="lead-quotes__version">v{q.version}</span>
                  <span className="lead-quotes__pill" style={{ background: style.bg, color: style.fg }}>
                    {style.label}
                  </span>
                </div>
                {q.scope_notes && <p className="lead-quotes__scope">{q.scope_notes}</p>}
                {/* The decline reason is shown, not hidden behind a hover — it is the whole reason it was
                    made mandatory, and a reason nobody reads is a field nobody fills in honestly. */}
                {q.decline_reason && (
                  <p className="lead-quotes__reason"><strong>Why we lost it:</strong> {q.decline_reason}</p>
                )}
                <p className="lead-quotes__meta">
                  {new Date(q.quoted_at).toLocaleDateString()}{q.quoted_by ? ` · ${q.quoted_by}` : ''}
                </p>

                {(q.status === 'draft' || q.status === 'sent') && (
                  <div className="lead-quotes__actions">
                    <button type="button" onClick={() => void decide(q.id, 'accepted')} disabled={busy}
                      className="lead-quotes__btn lead-quotes__btn--accept" data-testid="quote-accept">
                      Accepted
                    </button>
                    <button type="button" onClick={() => setDeclineFor(q.id)} disabled={busy}
                      className="lead-quotes__btn" data-testid="quote-decline">
                      Declined…
                    </button>
                  </div>
                )}

                {declineFor === q.id && (
                  <div className="lead-quotes__decline">
                    <label htmlFor={`decline-${q.id}`}>Why did we lose it?</label>
                    <input id={`decline-${q.id}`} value={declineReason} data-testid="quote-decline-reason"
                      onChange={(e) => setDeclineReason(e.target.value)}
                      placeholder="e.g. went with a cheaper firm, project postponed" />
                    <div className="lead-quotes__actions">
                      <button type="button" disabled={busy || !declineReason.trim()}
                        onClick={() => void decide(q.id, 'declined')}
                        className="lead-quotes__btn lead-quotes__btn--decline">
                        Save decline
                      </button>
                      <button type="button" onClick={() => { setDeclineFor(null); setDeclineReason(''); }}
                        className="lead-quotes__btn">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="lead-quotes__new">
        <label htmlFor="quote-amount">{live ? 'Revise the quote' : 'Record the quote'}</label>
        <div className="lead-quotes__new-row">
          <input id="quote-amount" value={amount} onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" placeholder="1,500.00" data-testid="quote-amount" />
          <button type="button" onClick={() => void record()} disabled={busy || !amount.trim()}
            className="lead-quotes__btn lead-quotes__btn--primary" data-testid="quote-save">
            {live ? `Save as v${Math.max(...quotes.map((q) => q.version)) + 1}` : 'Save quote'}
          </button>
        </div>
        <input value={scope} onChange={(e) => setScope(e.target.value)} data-testid="quote-scope"
          placeholder="What it covers (optional but worth it — explains the next revision)" />
        {/* Named plainly, because the alternative is someone believing an edit is possible and looking
            for it. */}
        {live && <p className="lead-quotes__muted">Saving a revision supersedes v{live.version}; it stays on record.</p>}
      </div>

      {error && <p className="lead-quotes__error" role="alert" data-testid="quote-error">{error}</p>}

      <style jsx>{`
        .lead-quotes { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; background: #fff; }
        .lead-quotes__title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 1rem; }
        .lead-quotes__count { font-size: 0.75rem; color: #6b7280; font-weight: 500; }
        .lead-quotes__muted { color: #6b7280; font-size: 0.85rem; margin: 6px 0; }
        .lead-quotes__list { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 10px; }
        .lead-quotes__item { border: 1px solid #f1f3f7; border-radius: 8px; padding: 10px 12px; }
        .lead-quotes__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .lead-quotes__amount { font-size: 1.05rem; }
        .lead-quotes__version { font-size: 0.75rem; color: #6b7280; }
        .lead-quotes__pill { padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }
        .lead-quotes__scope { font-size: 0.85rem; color: #374151; margin: 6px 0 0; }
        .lead-quotes__reason { font-size: 0.85rem; color: #991b1b; margin: 6px 0 0; }
        .lead-quotes__meta { font-size: 0.75rem; color: #9ca3af; margin: 6px 0 0; }
        .lead-quotes__actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
        .lead-quotes__decline { margin-top: 8px; display: grid; gap: 6px; }
        .lead-quotes__decline label { font-size: 0.8rem; font-weight: 600; }
        .lead-quotes__new { display: grid; gap: 8px; border-top: 1px solid #f1f3f7; padding-top: 12px; }
        .lead-quotes__new label { font-size: 0.8rem; font-weight: 600; }
        .lead-quotes__new-row { display: flex; gap: 8px; }
        .lead-quotes__new-row input { flex: 1; }
        input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; min-height: 40px; }
        .lead-quotes__btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #d1d5db;
          background: #fff; cursor: pointer; font: inherit; min-height: 40px; }
        .lead-quotes__btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .lead-quotes__btn--primary { background: #1d3095; color: #fff; border-color: #1d3095; }
        .lead-quotes__btn--accept { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
        .lead-quotes__btn--decline { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
        .lead-quotes__error { color: #991b1b; font-size: 0.85rem; margin: 10px 0 0; }
      `}</style>
    </section>
  );
}
