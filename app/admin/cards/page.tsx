// app/admin/cards/page.tsx — the card registry on screen (plan F1b).
//
// *"We need to be able to recognize if the cards used to pay for things are on file or not and what
// the card role is."*
//
// This is the "on file" half. Every card the firm has seen, what it is, and — the point of the whole
// table — what a charge on it MEANS for the books, computed server-side by `taxTreatmentForCard` so
// the browser never holds a second opinion about tax treatment.
//
// Two things this screen is careful about, both because the subject is money:
//
//   **"No cards" and "no registry" are different sentences.** Until seeds 572/573 are applied the
//   table does not exist, and an empty list would invite a bookkeeper to register a card that cannot
//   be saved. The route distinguishes them (Postgres 42P01) and so does this.
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
import type { CardTaxTreatment } from '@/lib/finance/payment-cards';

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

const ROLE_LABEL: Record<string, string> = {
  COMPANY: 'Company card',
  OWNER_PERSONAL: 'Owner’s personal card',
  EMPLOYEE_PERSONAL: 'Employee’s personal card',
  CLIENT: 'Client / customer card',
  UNKNOWN: 'Holder not established',
};

export default function CardRegistryPage() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return <main className="admin-page"><p className="admin-error">{error}</p></main>;
  }
  if (!data) {
    return <main className="admin-page"><p>Loading the card registry…</p></main>;
  }

  return (
    <main className="admin-page" style={{ padding: '1.25rem', maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>Payment cards</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Every card the firm has seen on a receipt, and what a charge on it means for the books.
        Recognising a card is what lets a receipt be filed correctly — a company card is an expense,
        a personal card is money owed back to a person, and a client’s card is not our transaction
        at all.
      </p>

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

      {data.registryExists && data.cards.length === 0 && (
        <p style={{ fontSize: '0.9rem' }}>
          No cards are registered yet. A card is added the first time a receipt is matched to one, or
          by hand once you know whose it is.
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
        </div>
      ))}
    </main>
  );
}
