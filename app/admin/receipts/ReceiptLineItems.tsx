'use client';
// app/admin/receipts/ReceiptLineItems.tsx — the things on the receipt, and what we decided about each.
//
// Owner, 2026-08-17: *"We should also be able to edit the list of items on the receipt, both the
// name, quantity and cost, and we should be able to mark each individual item as a business expense
// or not … We need to be able to remove items, and we need to be able to add items too, just in case
// they do not show up properly on the receipt, or the AI hallucinates. All removed/added items
// should be flagged as such … The user should have to give a reason associated with adding or
// removing an item. All of this needs to be reviewable when the user looks at the receipt."*
//
// ── A REMOVED LINE STAYS ON SCREEN ──────────────────────────────────────────────────────────────
//
// Struck through, greyed, with its reason next to it. That is the "reviewable" half of the ask and
// the reason the delete is soft: a line that vanishes tells the next person nothing, while a line
// that says "removed by jacob — personal snack" answers the question before it is asked.
//
// ── THE BUSINESS TOGGLE HAS THREE POSITIONS, NOT TWO ────────────────────────────────────────────
//
// Business · Personal · Follow receipt. The third is the default and is not a cop-out: most receipts
// are wholly one thing, and a two-way toggle would force twenty deliberate answers on a receipt
// where the honest answer is "all of it, same as the receipt". It also keeps "nobody has looked at
// this line" distinguishable from "somebody decided it counts".

import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  summariseLineItems, describeLineItemReview, type LineItem, type LineItemTotals,
} from '@/lib/receipts/line-items';

const money = (c: number | null | undefined) => (c === null || c === undefined ? '—' : `$${(c / 100).toFixed(2)}`);

/** Dollars typed by a person → whole cents, or null when the box is empty. `'invalid'` is its own
 *  answer so a half-typed "12." is not silently stored as 12 dollars. */
function toCents(s: string): number | null | 'invalid' {
  const t = s.trim();
  if (!t) return null;
  if (!/^-?\d*\.?\d{0,2}$/.test(t)) return 'invalid';
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 'invalid';
}

export function ReceiptLineItems({
  receiptId, receiptIsBusiness, onChanged,
}: {
  receiptId: string;
  receiptIsBusiness: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [totals, setTotals] = useState<LineItemTotals | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ description: '', amount: '', quantity: '', reason: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/receipts/${receiptId}/line-items`);
      if (!res.ok) return;
      const j = await res.json();
      setItems(j.items ?? []);
      setTotals(j.totals ?? null);
      setReview(j.review ?? null);
    } catch { /* the rest of the viewer still works */ }
  }, [receiptId]);

  useEffect(() => { void load(); }, [load]);

  const send = useCallback(async (method: 'POST' | 'PATCH' | 'DELETE', body: unknown) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/receipts/${receiptId}/line-items`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j?.error ?? `Could not save (HTTP ${res.status}).`); return false; }
      setItems(j.items ?? []);
      setTotals(j.totals ?? null);
      setReview(j.review ?? null);
      onChanged?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally { setBusy(false); }
  }, [receiptId, onChanged]);

  const remove = async (li: LineItem) => {
    // The reason is required by the API and by a CHECK constraint. Asking here means the person is
    // asked while they still remember why — not rejected after the fact.
    const reason = window.prompt(`Why are you removing "${li.description ?? 'this item'}"?\n\nThis is kept on the record, not deleted.`);
    if (reason === null) return;
    await send('DELETE', { id: li.id, reason });
  };

  const restore = async (li: LineItem) => { await send('DELETE', { id: li.id, restore: true }); };

  const setBusiness = async (li: LineItem, value: boolean | null) => {
    await send('PATCH', { id: li.id, is_business_expense: value });
  };

  const saveField = async (li: LineItem, patch: Record<string, unknown>) => {
    await send('PATCH', { id: li.id, ...patch });
  };

  const add = async () => {
    const cents = toCents(draft.amount);
    if (cents === 'invalid') { setError('That amount is not a number.'); return; }
    const qty = draft.quantity.trim() ? Number(draft.quantity) : null;
    if (qty !== null && !Number.isFinite(qty)) { setError('That quantity is not a number.'); return; }
    const ok = await send('POST', {
      description: draft.description, amount_cents: cents, quantity: qty, reason: draft.reason,
    });
    if (ok) { setDraft({ description: '', amount: '', quantity: '', reason: '' }); setAdding(false); }
  };

  return (
    <div className="rcv__section">
      <h4 className="rcv__sectionTitle">
        Line items{items.length > 0 ? ` (${items.length})` : ''}
      </h4>

      {/* What a person has done to this list, if anything. Absent when nobody has touched it. */}
      {review && <p className="rli__review">{review}</p>}

      {items.length === 0 ? (
        <p className="rli__empty">
          No items were read off this receipt. A fuel slip or a toll often has none — add one below if
          the receipt lists things the AI missed.
        </p>
      ) : (
        <ul className="rli__list">
          {items.map((li) => {
            const removed = Boolean(li.removed_at);
            const decided = li.is_business_expense;
            return (
              <li key={li.id} className={`rli__item ${removed ? 'rli__item--removed' : ''}`}>
                <div className="rli__row">
                  <input
                    className="rli__desc"
                    defaultValue={li.description ?? ''}
                    disabled={removed || busy}
                    aria-label="Item description"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== (li.description ?? '')) void saveField(li, { description: v });
                    }}
                  />
                  <input
                    className="rli__qty"
                    defaultValue={li.quantity ?? ''}
                    disabled={removed || busy}
                    inputMode="decimal"
                    aria-label="Quantity"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const q = raw ? Number(raw) : null;
                      if (q !== li.quantity && (q === null || Number.isFinite(q))) void saveField(li, { quantity: q });
                    }}
                  />
                  <input
                    className="rli__amount"
                    defaultValue={li.amount_cents !== null && li.amount_cents !== undefined ? (li.amount_cents / 100).toFixed(2) : ''}
                    disabled={removed || busy}
                    inputMode="decimal"
                    aria-label="Amount"
                    onBlur={(e) => {
                      const c = toCents(e.target.value);
                      if (c === 'invalid') { setError('That amount is not a number.'); return; }
                      if (c !== li.amount_cents) void saveField(li, { amount_cents: c });
                    }}
                  />
                  {removed ? (
                    <button type="button" className="rli__icon" title="Put this item back" disabled={busy} onClick={() => void restore(li)}>
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button type="button" className="rli__icon rli__icon--danger" title="Remove this item (kept on the record)" disabled={busy} onClick={() => void remove(li)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="rli__meta">
                  {/* Three positions. "Follow receipt" is the default and stays visible so nobody has
                      to guess what an unmarked line counts as. */}
                  {!removed && (
                    <div className="rli__toggle" role="group" aria-label="Is this a business expense?">
                      {([[true, 'Business'], [false, 'Personal'], [null, 'Follow receipt']] as const).map(([val, label]) => (
                        <button
                          key={String(val)}
                          type="button"
                          className={`rli__toggleBtn ${decided === val ? 'rli__toggleBtn--on' : ''}`}
                          aria-pressed={decided === val}
                          disabled={busy}
                          onClick={() => void setBusiness(li, val)}
                        >
                          {label}
                          {val === null && decided === null
                            ? ` (${receiptIsBusiness ? 'business' : 'personal'})`
                            : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* The flags the owner asked for — each says who and why, not just that it happened. */}
                  {li.source === 'user' && (
                    <span className="rli__flag rli__flag--added">
                      added by hand{li.added_reason ? ` — ${li.added_reason}` : ''}
                    </span>
                  )}
                  {removed && (
                    <span className="rli__flag rli__flag--removed">
                      removed{li.removed_by ? ` by ${li.removed_by}` : ''}{li.removed_reason ? ` — ${li.removed_reason}` : ''}
                    </span>
                  )}
                  {!removed && li.edited_at && (
                    <span className="rli__flag rli__flag--edited">corrected by hand</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totals && (totals.businessCents > 0 || totals.excludedCents > 0) && (
        <p className="rli__totals">
          <strong>{money(totals.businessCents)}</strong> counted as business
          {totals.excludedCents > 0 && <> · <strong>{money(totals.excludedCents)}</strong> not claimed</>}
        </p>
      )}

      {adding ? (
        <div className="rli__add">
          <input placeholder="What was it?" value={draft.description} aria-label="New item description"
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <input placeholder="Qty" value={draft.quantity} inputMode="decimal" aria-label="New item quantity"
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
          <input placeholder="0.00" value={draft.amount} inputMode="decimal" aria-label="New item amount"
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <input placeholder="Why are you adding it?" value={draft.reason} aria-label="Reason for adding"
            className="rli__addReason"
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          <div className="rli__addActions">
            <button type="button" onClick={() => { setAdding(false); setError(''); }} disabled={busy}>Cancel</button>
            <button type="button" className="rli__primary" onClick={() => void add()} disabled={busy}>Add item</button>
          </div>
        </div>
      ) : (
        <button type="button" className="rli__addBtn" onClick={() => setAdding(true)} disabled={busy}>
          <Plus size={13} /> Add an item the receipt shows but the AI missed
        </button>
      )}

      {error && <p role="alert" className="rli__error">{error}</p>}
    </div>
  );
}
