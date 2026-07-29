'use client';
// app/dnd/_ui/CharacterRowActions.tsx — manage a character from the index (P4-1b).
//
// "The index lists and finds; it does not yet manage." Duplicate, export and delete were each reachable
// only from inside the character's own sheet, which means every management task started with opening the
// thing you wanted to copy or throw away.
//
// NEW VARIANT IS DELIBERATELY ABSENT. A variant is another VERSION inside one character, chosen against the
// sheet you are looking at — the fork needs a source version, and picking one from a grid card would be
// guessing which. It lives on the sheet, where the VERSIONS picker shows what you are branching from.
// Duplicate — a genuinely separate character — is the one the index needs.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function CharacterRowActions({ id, name, canDelete }: {
  id: string;
  name: string;
  /** Only the owner may delete; the server enforces it too. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'duplicate' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    if (busy) return;
    setBusy('duplicate'); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${id}/duplicate`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not duplicate.'); return; }
      // Straight into the copy: the reason to duplicate is to change something, so landing on the original
      // would leave the next step ambiguous.
      router.push(`/dnd/characters/${j.character.id}`);
    } catch { setError('Network error.'); } finally { setBusy(null); }
  }

  async function remove() {
    if (busy) return;
    // Typed confirmation would be over-engineering for a character sheet, but an unguarded delete on a grid
    // of similar-looking cards is a mis-click away from losing work.
    if (!window.confirm(`Delete “${name}” permanently? This cannot be undone.`)) return;
    setBusy('delete'); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? 'Could not delete.');
        return;
      }
      // GONE IMMEDIATELY, then reconcile. `router.refresh()` alone re-fetches the whole server page, so
      // the card a user just confirmed the deletion of sat there through a full round trip — long enough
      // to read as "the button did nothing" and be clicked again. The row is removed the moment the API
      // confirms; the refresh still runs behind it so counts and filters catch up.
      //
      // Keyed on `data-character-card` rather than walking up N parents: a DOM shape guess would break
      // silently the next time the card gains a wrapper, and this cannot.
      if (typeof document !== 'undefined') {
        document.querySelector(`[data-character-card="${id}"]`)?.remove();
      }
      router.refresh();
    } catch { setError('Network error.'); } finally { setBusy(null); }
  }

  const btn = { fontSize: 10.5, padding: '2px 7px' } as const;

  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
      <button type="button" className={styles.hexBtn} style={btn} disabled={!!busy} onClick={duplicate}>
        {busy === 'duplicate' ? 'Copying…' : 'Duplicate'}
      </button>
      {/* A plain link, not a fetch: the export route streams a file, and letting the browser handle it is
          what makes "Save as…" work. */}
      <a className={styles.hexBtn} style={{ ...btn, textDecoration: 'none' }} href={`/api/dnd/characters/${id}/export`}>
        Export
      </a>
      {canDelete && (
        <button type="button" className={styles.hexBtn} style={{ ...btn, color: 'var(--hx-danger)', borderColor: 'var(--hx-danger)' }}
          disabled={!!busy} onClick={remove}>
          {busy === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      )}
      {error && <span style={{ fontSize: 10.5, color: 'var(--hx-danger)' }}>{error}</span>}
    </div>
  );
}
