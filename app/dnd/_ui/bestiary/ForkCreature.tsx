'use client';
// app/dnd/_ui/bestiary/ForkCreature.tsx — "make this creature mine" (B3-1b).
//
// The catalogue is immutable, so editing a creature means FORKING it into your own Studio piece. That is
// seed 462's design and the reason the owner's *"saved and made public or private or shared just like
// classes and feats"* needs no new machinery: a forked creature is a `dnd_homebrew` row, and homebrew
// already has visibility, sharing, adoption and edit history.
//
// NAVIGATES ON SUCCESS rather than showing a toast. The whole point of the click is to start editing, so
// leaving the reader on the catalogue page with "created!" would make them go and find it — and the copy
// is private, so it is not where they were just looking.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';

export default function ForkCreature({
  creatureId,
  variants,
}: {
  creatureId: string;
  /** Derived weak/elite pair, so a DM can start from the tier they were reading rather than the base. */
  variants: { id: string; name: string; tier: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fork(variantId?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/dnd/bestiary/${encodeURIComponent(creatureId)}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variantId ? { variantId } : {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'Could not create your version.'); return; }
      router.push(`/dnd/content/${j.piece.id}`);
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => fork()} style={{ minHeight: 40 }}>
        {busy ? 'Copying…' : '✎ Make my own version'}
      </button>
      {/* One button per derived tier, because "I want the elite one, but tougher" is the common ask and
          starting from the base would throw away the adjustment the reader was looking at. */}
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          className={styles.hexBtn}
          disabled={busy}
          onClick={() => fork(v.id)}
          title={`Start from ${v.name}`}
          style={{ minHeight: 40, fontSize: 12.5 }}
        >
          from {v.tier}
        </button>
      ))}
      {msg && <span role="alert" style={{ fontSize: 12, color: '#e08b86' }}>{msg}</span>}
    </span>
  );
}
