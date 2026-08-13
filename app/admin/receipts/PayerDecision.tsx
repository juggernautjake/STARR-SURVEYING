'use client';

// app/admin/receipts/PayerDecision.tsx — "whose money was this, and was it business at all?"
//
// Owner, 2026-08-13: *"if we do not have a card on file, then the receipt should be flagged and it
// should tell us that the card is not recognized… maybe one of the employees paid for something
// without using the business card… we might reimburse them, or maybe not depending. We might want to
// disregard the receipt entirely from our taxes because it might have just been a personal
// purchase."*
//
// ── WHY THIS IS A PANEL AND NOT ANOTHER WARNING BAND ─────────────────────────────────────────────
//
// The band that used to sit here said "Paid on a card that is not on file. Add it under company
// cards, or confirm it was personal and is being reimbursed." Every word of that was true and none
// of it was actionable: there was nowhere to record either answer, so the same sentence appeared on
// the same receipt forever and the bookkeeper's only way to make it stop was to approve the receipt
// and hope.
//
// A flag with no way to answer it is not a control, it is a complaint. The verdict below comes from
// `payerVerdict`, the buttons write the answer, and answering removes the receipt from the review
// queue — which is what makes the queue mean something.
//
// ── WHY "PERSONAL" IS AS PROMINENT AS "BUSINESS" ─────────────────────────────────────────────────
//
// The tempting design gives "business" a primary button and hides "personal" behind a menu, because
// business is the common case. But the expensive mistake runs the other way: a personal purchase
// filed as a business one is a deduction the company is not entitled to, and it is invisible
// afterwards — nothing downstream can tell it from a real expense. The two answers get equal weight.

import { useState } from 'react';
import { payerVerdict } from '@/lib/receipts/payer-verdict';
import type { AdminReceiptRow, ReceiptPaymentCard } from './receipt-types';

interface Props {
  row: AdminReceiptRow;
  /** Every card on file, for "it was actually this one". Empty until the list loads. */
  cards: readonly ReceiptPaymentCard[];
  busy: boolean;
  onAnswer: (label: string, body: Record<string, unknown>) => void | Promise<void>;
}

const band: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderLeft: '4px solid var(--color-warning)',
  borderRadius: 6,
  padding: '0.6rem 0.75rem',
  marginTop: '0.5rem',
  fontSize: '0.85rem',
  lineHeight: 1.45,
};

const settled: React.CSSProperties = { ...band, borderLeftColor: 'var(--color-text-muted)' };

// `--color-border` / `--color-surface`, not `--border` / `--surface`. The first draft used the short
// names with hex fallbacks, and neither token exists (see app/styles/tokens.css) — so every control
// in this panel took the fallback and rendered as a light-grey-bordered white box in EVERY theme,
// including the dark skins, where it appeared as a white slab. A `var()` fallback makes that failure
// silent and permanent: nothing errors, the colour is simply never the theme's.
const btn: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  borderRadius: 5,
  padding: '0.3rem 0.7rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
};

export default function PayerDecision({ row, cards, busy, onAnswer }: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(row.expense_nature_note ?? '');

  const verdict = payerVerdict({
    card_match_status: row.card_match_status,
    card: row.payment_card,
    card_confirmed_at: row.card_confirmed_at,
    expense_nature: row.expense_nature,
    payment_method: row.payment_method,
  });

  // Nothing outstanding and nothing interesting to report — a receipt on a confirmed company card
  // is the ordinary case, and a band saying "this was fine" on every row is a band nobody reads.
  if (!verdict.needsDecision && verdict.basis === 'company-card') return null;
  if (!verdict.needsDecision && verdict.basis === 'not-a-card') return null;

  const answered = row.expense_nature !== null && row.expense_nature !== undefined;

  return (
    <div style={verdict.needsDecision ? band : settled} role="note">
      <div>{verdict.summary}</div>

      {verdict.reimbursementOwedTo ? (
        <div style={{ marginTop: '0.35rem', fontWeight: 600 }}>
          Owed back to {verdict.reimbursementOwedTo}.
        </div>
      ) : null}

      {verdict.question ? (
        <div style={{ marginTop: '0.45rem', fontWeight: 600 }}>{verdict.question}</div>
      ) : null}

      {verdict.needsDecision ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
          <button
            type="button" style={btn} disabled={busy}
            onClick={() => void onAnswer('recording that this was a business purchase', {
              expense_nature: 'business',
            })}
          >
            Business purchase
          </button>
          <button
            type="button" style={btn} disabled={busy}
            onClick={() => void onAnswer('marking this a personal purchase', {
              expense_nature: 'personal',
            })}
          >
            Personal — leave it out entirely
          </button>

          {/* Naming the card IS the confirmation, so this select is the answer to "is that right?"
              as well as to "which card was it?". Cards are listed with their role, because
              "Company Amex" and "Dave personal" lead to different money. */}
          {cards.length > 0 ? (
            <select
              // `cursor: default` said "not clickable" on the one control here that opens a menu.
              // `maxWidth` because a select sizes to its widest option, and a card labelled
              // "Mastercard seen on a receipt — role not set" stretched this row past the buttons.
              style={{ ...btn, maxWidth: '15rem' }}
              disabled={busy}
              value={row.card_confirmed_at ? row.payment_card_id ?? '' : ''}
              onChange={(e) => void onAnswer('confirming which card paid', {
                payment_card_id: e.target.value || null,
              })}
            >
              <option value="">Which card was it?</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label ?? `Card ···· ${c.last4 ?? '????'}`}
                  {c.role && c.role !== 'COMPANY' ? ` — ${ROLE_WORD[c.role] ?? c.role}` : ''}
                </option>
              ))}
            </select>
          ) : null}

          <a href="/admin/cards" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
            Add a card to file
          </a>
        </div>
      ) : null}

      {answered ? (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Every decision is reversible and says so. Somebody who clicks the wrong one on a $2,000
              receipt must not have to go looking for a way back. */}
          <button
            type="button" style={btn} disabled={busy}
            onClick={() => void onAnswer('reopening the question of who paid', { expense_nature: null })}
          >
            Undo this answer
          </button>
          <button type="button" style={{ ...btn, border: 'none' }} onClick={() => setNoteOpen((v) => !v)}>
            {row.expense_nature_note ? 'Edit the note' : 'Add a note'}
          </button>
          {row.expense_nature_note && !noteOpen ? (
            <span style={{ opacity: 0.8 }}>“{row.expense_nature_note}”</span>
          ) : null}
        </div>
      ) : null}

      {noteOpen ? (
        <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.4rem' }}>
          <input
            style={{ ...btn, cursor: 'text', flex: 1 }}
            value={note}
            placeholder="Why — e.g. “Dave’s card, crew lunch on the Hargrove job”"
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button" style={btn} disabled={busy}
            onClick={() => {
              setNoteOpen(false);
              void onAnswer('saving the note', { expense_nature_note: note.trim() || null });
            }}
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Short words for the roles, for a dropdown where the full sentence will not fit. */
const ROLE_WORD: Record<string, string> = {
  OWNER_PERSONAL: 'an owner’s own card',
  EMPLOYEE_PERSONAL: 'an employee’s own card',
  CLIENT: 'a client’s card',
  UNKNOWN: 'role not set',
};
