// app/admin/cards/page.tsx — the card registry on screen (plan F1b).
//
// *"We need to be able to recognize if the cards used to pay for things are on file or not and what
// the card role is."*
//
// This is the "on file" half. Every card the firm has seen, what it is, and — the point of the whole
// table — what a charge on it MEANS for the books, computed server-side by `taxTreatmentForCard` so
// the browser never holds a second opinion about tax treatment.
//
// ── WHY THIS PAGE GREW A FORM ─────────────────────────────────────────────────────────────────────
//
// It used to say: *"A card is added the first time a receipt is matched to one, or by hand once you
// know whose it is."* Neither existed. There was no writer of any kind — the API was GET-only — so
// `payment_cards` held zero rows, and when receipt extraction started checking cards on 2026-08-12
// every card receipt came back "not on file". The flag was right and there was nothing to do about
// it. A registry you cannot write to is a list of nothing.
//
// Two things this screen is careful about, both because the subject is money:
//
//   **"No cards" and "no registry" are different sentences.** Until seeds 572/573 are applied the
//   table does not exist, and an empty list would invite a bookkeeper to register a card that cannot
//   be saved. The route distinguishes them and so does this.
//
//   **UNKNOWN is shown as a question, not a default.** A card on file whose holder was never
//   established has no tax treatment — and the whole reason it is in the table is so somebody
//   answers that. Rendering it in the same grey as everything else is how it stays unanswered.
'use client';

import { useCallback, useEffect, useState } from 'react';

// Imported rather than re-declared. The first version of this file declared its own shape with
// `statement` and `needsAnswer` — neither exists; the real fields are `summary` and
// `needsResolution`. `tsc` was silent because a local interface is a valid type, so the page would
// have rendered `undefined` for every card. Importing the real one is what makes the compiler able
// to answer the question, and is the same lesson as the casts removed elsewhere today.
import { CARD_ROLE_OPTIONS, type CardTaxTreatment } from '@/lib/finance/payment-cards';
import { PaymentsReadinessPanel } from './PaymentsReadinessPanel';

interface RegistryCard {
  id: string;
  last4: string;
  brand: string | null;
  label: string | null;
  role: string;
  holderName: string | null;
  retiredAt: string | null;
  taxTreatment: CardTaxTreatment;
}

interface RegistryResponse {
  cards: RegistryCard[];
  registryExists: boolean;
  message?: string;
}

/** What a save did to the receipts that were waiting on it. */
interface RematchSummary {
  considered: number;
  updated: number;
  resolved: number;
}

const ROLE_LABEL: Record<string, string> = {
  COMPANY: 'Company card',
  OWNER_PERSONAL: 'Owner’s personal card',
  EMPLOYEE_PERSONAL: 'Employee’s personal card',
  CLIENT: 'Client / customer card',
  UNKNOWN: 'Holder not established',
};

/** Roles where the form must ask whose card it is — matching the CHECK constraint in seed 572, so
 *  the field appears at the moment it becomes required rather than after a rejected save. */
const NEEDS_HOLDER = new Set(['OWNER_PERSONAL', 'EMPLOYEE_PERSONAL']);

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontSize: '0.85rem', width: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)', marginBottom: '0.2rem',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.45rem 0.8rem', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontSize: '0.85rem', cursor: 'pointer',
};

interface DraftCard {
  last4: string;
  brand: string;
  label: string;
  role: string;
  holder_name: string;
  notes: string;
}

const EMPTY_DRAFT: DraftCard = { last4: '', brand: '', label: '', role: 'COMPANY', holder_name: '', notes: '' };

export default function CardRegistryPage() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftCard>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Which card is open for editing. One at a time: a registry where several rows are half-edited is
   *  a registry where somebody saves the wrong one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<DraftCard>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payment-cards');
      const json = (await res.json()) as RegistryResponse & { error?: string };
      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'You are not signed in as an admin, so the card registry could not be loaded.'
            : json.error || `The card registry could not be loaded (HTTP ${res.status}).`,
        );
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Say what the save did to the receipts that were waiting on it. The whole reason to register a
   *  card is usually a flagged receipt, so silence here would leave the user to go and check. */
  const describeRematch = (r: RematchSummary | undefined): string => {
    if (!r || r.updated === 0) return '';
    const receipts = `${r.updated} receipt${r.updated === 1 ? '' : 's'}`;
    return r.resolved > 0
      ? ` ${receipts} updated — ${r.resolved} now matched to a card on file.`
      : ` ${receipts} re-checked.`;
  };

  const submit = async (
    method: 'POST' | 'PATCH',
    body: Record<string, unknown>,
    successPrefix: string,
  ): Promise<boolean> => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/payment-cards', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string; rematch?: RematchSummary };
      if (!res.ok) throw new Error(json.error || `The card could not be saved (HTTP ${res.status}).`);
      setNotice(successPrefix + describeRematch(json.rematch));
      await load();
      return true;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addCard = async () => {
    const ok = await submit('POST', { ...draft }, 'Card added.');
    if (ok) { setDraft(EMPTY_DRAFT); setAdding(false); }
  };

  const saveEdit = async (id: string) => {
    const ok = await submit('PATCH', { id, ...edit }, 'Card updated.');
    if (ok) setEditingId(null);
  };

  const setRetired = async (card: RegistryCard, retired: boolean) => {
    await submit(
      'PATCH',
      { id: card.id, retired },
      retired ? 'Card retired — past receipts still point at it.' : 'Card is active again.',
    );
  };

  const beginEdit = (c: RegistryCard) => {
    setEditingId(c.id);
    setFormError(null);
    setEdit({
      last4: c.last4,
      brand: c.brand ?? '',
      label: c.label ?? '',
      role: c.role,
      holder_name: c.holderName ?? '',
      notes: '',
    });
  };

  if (error) {
    return <main className="admin-page"><p className="admin-error">{error}</p></main>;
  }
  if (!data) {
    return <main className="admin-page"><p>Loading the card registry…</p></main>;
  }

  const fields = (d: DraftCard, set: (d: DraftCard) => void) => (
    <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      <div>
        <label style={labelStyle} htmlFor="card-last4">Last four digits</label>
        <input
          id="card-last4" style={inputStyle} value={d.last4} inputMode="numeric" placeholder="4054"
          onChange={(e) => set({ ...d, last4: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="card-label">What you call it</label>
        <input
          id="card-label" style={inputStyle} value={d.label} placeholder="Company Amex"
          onChange={(e) => set({ ...d, label: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="card-brand">Brand as printed</label>
        <input
          id="card-brand" style={inputStyle} value={d.brand} placeholder="Visa"
          onChange={(e) => set({ ...d, brand: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="card-role">Whose card is it</label>
        <select id="card-role" style={inputStyle} value={d.role} onChange={(e) => set({ ...d, role: e.target.value })}>
          {CARD_ROLE_OPTIONS.map((o) => (
            <option key={o.role} value={o.role}>{o.label}</option>
          ))}
        </select>
      </div>
      {/* Appears exactly when the database starts requiring it, rather than after a rejected save. */}
      {NEEDS_HOLDER.has(d.role) && (
        <div>
          <label style={labelStyle} htmlFor="card-holder">Whose name</label>
          <input
            id="card-holder" style={inputStyle} value={d.holder_name} placeholder="Jacob Maddux"
            onChange={(e) => set({ ...d, holder_name: e.target.value })}
          />
        </div>
      )}
    </div>
  );

  return (
    <main className="admin-page" style={{ padding: '1.25rem', maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>Payment cards</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Every card the firm has seen on a receipt, and what a charge on it means for the books.
        Recognising a card is what lets a receipt be filed correctly — a company card is an expense,
        a personal card is money owed back to a person, and a client’s card is not our transaction
        at all. Receipts paid on a card that is not listed here are flagged for review.
      </p>

      {/* What is still stopping customers being charged. Sits here because this is where the owner
          already is — one of its checks IS the company-card count, and the register's whole purpose
          is deciding what a charge means. Renders nothing when everything is clear. */}
      <PaymentsReadinessPanel />

      {/* The distinction the route exists to preserve. An empty list here would be a lie. */}
      {!data.registryExists && (
        <div
          style={{
            border: '1px solid var(--theme-warning)', background: 'color-mix(in srgb, var(--theme-warning) 13%, transparent)', borderRadius: 8,
            padding: '0.85rem', fontSize: '0.85rem', marginBottom: '1rem',
          }}
        >
          <strong>The card registry has not been created yet.</strong>
          <p style={{ marginTop: '0.4rem' }}>{data.message}</p>
        </div>
      )}

      {notice && (
        <p
          style={{
            border: '1px solid var(--theme-success, var(--color-border))',
            background: 'color-mix(in srgb, var(--theme-success, var(--color-border)) 12%, transparent)',
            borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.85rem', marginBottom: '0.9rem',
          }}
        >
          {notice}
        </p>
      )}

      {data.registryExists && (
        <div style={{ marginBottom: '1.1rem' }}>
          {!adding ? (
            <button type="button" style={{ ...buttonStyle, fontWeight: 600 }} onClick={() => { setAdding(true); setNotice(null); setFormError(null); }}>
              + Add a card
            </button>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.9rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Add a card</h2>
              {fields(draft, setDraft)}
              {formError && (
                <p style={{ color: 'var(--theme-danger, crimson)', fontSize: '0.83rem', marginTop: '0.6rem' }}>{formError}</p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                <button type="button" style={{ ...buttonStyle, fontWeight: 600 }} disabled={saving} onClick={() => void addCard()}>
                  {saving ? 'Saving…' : 'Save card'}
                </button>
                <button type="button" style={buttonStyle} disabled={saving} onClick={() => { setAdding(false); setFormError(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {data.registryExists && data.cards.length === 0 && !adding && (
        <p style={{ fontSize: '0.9rem' }}>
          No cards are registered yet, so every receipt paid by card is being flagged as “not on
          file”. Add the cards the firm actually uses and those flags will clear themselves.
        </p>
      )}

      {data.cards.map((c) => (
        <div
          key={c.id}
          style={{
            border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '0.75rem 0.9rem', marginBottom: '0.6rem',
            opacity: c.retiredAt ? 0.65 : 1,
          }}
        >
          {editingId === c.id ? (
            <>
              {fields(edit, setEdit)}
              {formError && (
                <p style={{ color: 'var(--theme-danger, crimson)', fontSize: '0.83rem', marginTop: '0.6rem' }}>{formError}</p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                <button type="button" style={{ ...buttonStyle, fontWeight: 600 }} disabled={saving} onClick={() => void saveEdit(c.id)}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" style={buttonStyle} disabled={saving} onClick={() => { setEditingId(null); setFormError(null); }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{c.label || c.brand || 'Card'} ···· {c.last4}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  {ROLE_LABEL[c.role] ?? c.role}
                  {c.holderName ? ` · ${c.holderName}` : ''}
                  {/* Retired cards are shown, not hidden: a receipt from March still points at one. */}
                  {c.retiredAt ? ' · retired' : ''}
                </span>
              </div>
              <p
                style={{
                  marginTop: '0.4rem', fontSize: '0.83rem',
                  color: c.taxTreatment.needsResolution ? 'var(--theme-warning)' : 'var(--color-text-secondary)',
                  fontWeight: c.taxTreatment.needsResolution ? 600 : 400,
                }}
              >
                {c.taxTreatment.summary}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button type="button" style={{ ...buttonStyle, padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => beginEdit(c)}>
                  Edit
                </button>
                {/* Retire, never delete — deleting a closed card would turn last year's filed
                    receipts into "not on file", a change to history made by an act about today. */}
                <button
                  type="button"
                  style={{ ...buttonStyle, padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  disabled={saving}
                  onClick={() => void setRetired(c, !c.retiredAt)}
                >
                  {c.retiredAt ? 'Mark active' : 'Retire'}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </main>
  );
}
