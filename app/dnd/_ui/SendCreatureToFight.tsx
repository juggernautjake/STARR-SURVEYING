'use client';
// app/dnd/_ui/SendCreatureToFight.tsx — put a Studio creature into a live fight (P6-14).
//
// The plan's requirement was that "a creature dropped into a fight and a creature opened from the Studio
// are the same object". The Studio could build a monster, render its statblock and show its art — and there
// was no way to get it into combat. A DM re-typed its name and HP into the initiative tracker by hand,
// which is precisely the work the Studio exists to remove, with a fresh chance to fat-finger the HP.
//
// Only encounters the viewer DMs are offered, and the server re-checks that. The list is loaded on OPEN
// rather than on mount: this control sits on a page that is mostly read, and most visits never touch it.
import { useState } from 'react';
import styles from './hextech.module.css';

interface EncounterOption {
  id: string;
  label: string;
}

export default function SendCreatureToFight({ homebrewId }: { homebrewId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<EncounterOption[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /** How many copies to add. A pack of six wolves is the common case, and adding them one at a time is
   *  five more clicks than the fight is worth. */
  const [count, setCount] = useState(1);

  async function load() {
    setOpen(true);
    if (options) return;
    setBusy(true);
    try {
      const r = await fetch('/api/dnd/encounters?dm=1');
      const j = await r.json().catch(() => ({}));
      const rows = Array.isArray(j.encounters) ? (j.encounters as Record<string, unknown>[]) : [];
      setOptions(rows.map((e) => ({
        id: String(e.id),
        label: [e.campaignName, e.sessionTitle, e.name].filter(Boolean).join(' · ') || 'Encounter',
      })));
    } catch {
      setMsg('Could not load your encounters.');
    } finally {
      setBusy(false);
    }
  }

  async function send(encounterId: string) {
    setBusy(true);
    setMsg(null);
    try {
      // One request per copy, sequentially. The route assigns `sort_order` from the current row count, so
      // firing them in parallel would race and land several combatants on the same position.
      for (let i = 0; i < count; i += 1) {
        const r = await fetch(`/api/dnd/encounters/${encounterId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ homebrewId }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setMsg(j.error ?? 'Could not add it to that fight.');
          return;
        }
      }
      setMsg(`Added ${count > 1 ? `${count} copies` : 'it'} to the fight.`);
      setOpen(false);
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className={styles.hexBtn} onClick={load} style={{ padding: '6px 14px', fontSize: 12.5 }}>
          ⚔ Add to a fight
        </button>
        {msg && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{msg}</span>}
      </span>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 7, maxWidth: 460 }}>
      <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
        Its name, art and HP come across from the statblock — nothing to re-type.
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--hx-text)' }}>
        How many
        <input
          type="number" min={1} max={20} value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          style={{ width: 64, padding: '5px 8px', fontSize: 12.5 }}
        />
      </label>
      {busy && !options && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Loading your fights…</span>}
      {options && options.length === 0 && (
        // An empty list with no explanation reads as broken. It is almost always "you are not the DM of
        // anything with a live encounter", which is a different problem and one the player can act on.
        <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
          No encounters you run. Start one from a session first.
        </span>
      )}
      {options?.map((o) => (
        <button key={o.id} type="button" className={styles.hexBtn} disabled={busy} onClick={() => send(o.id)}
          style={{ padding: '6px 12px', fontSize: 12.5, textAlign: 'left' }}>
          {o.label}
        </button>
      ))}
      <div>
        <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => setOpen(false)}
          style={{ padding: '5px 12px', fontSize: 12 }}>
          Cancel
        </button>
      </div>
      {msg && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{msg}</span>}
    </div>
  );
}
