'use client';
// app/dnd/_ui/ImportCharacterJsonButton.tsx — restore a character from its own JSON export (P9-1, H-1).
//
// The counterpart to ExportSheetButton's "JSON" option. Sits next to "New character" because that is what
// this is: another way to end up with a character, and the one a returning user looks for first.
//
// It posts to /api/dnd/characters/import-json — NOT /api/dnd/characters/import, which uploads files for a
// model to interpret. Restoring a file we ourselves wrote should not involve a model guessing at it.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function ImportCharacterJsonButton({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      // The file is read here and sent as TEXT rather than as a multipart upload: the server parses the
      // same string either way, and this keeps the route a plain JSON endpoint that is trivial to call
      // from a script — which is half the point of having a machine format at all.
      const text = await file.text();
      const res = await fetch('/api/dnd/characters/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: text, ...(campaignId ? { campaignId } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's message is shown verbatim — it distinguishes "not a character export" from
        // "damaged", and flattening that into "Import failed" sends people hunting the wrong problem.
        setMsg(j.error ?? 'Could not import that file.');
        return;
      }
      setMsg(`Imported ${j.character?.name ?? 'character'}.`);
      router.refresh();
    } catch {
      setMsg('Could not read that file.');
    } finally {
      setBusy(false);
      // Clear the input, or picking the SAME file again fires no change event and the button looks dead.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <button
        className={styles.hexBtn}
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        title="Restore a character from a JSON export"
      >
        {busy ? 'Importing…' : '⇪ Import JSON'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{msg}</span>}
    </span>
  );
}
