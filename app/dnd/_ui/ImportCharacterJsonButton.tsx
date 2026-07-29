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
  /** What the importer could not map — Pathbuilder only. Kept separate from `msg` so the headline stays
   *  one line and the caveats can be a list. */
  const [detail, setDetail] = useState<string[]>([]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setDetail([]);
    try {
      // The file is read here and sent as TEXT rather than as a multipart upload: the server parses the
      // same string either way, and this keeps the route a plain JSON endpoint that is trivial to call
      // from a script — which is half the point of having a machine format at all.
      const text = await file.text();
      // WHICH IMPORTER, decided from the file rather than from a second button (P9-3). A Pathbuilder export
      // is recognisable on sight — it wraps everything in a `build` object — and asking the player to
      // classify their own file before uploading it is asking them to know something we can just look at.
      // A wrong guess is not costly either: each route validates its own shape and refuses politely.
      const route = /"build"\s*:\s*\{/.test(text)
        ? '/api/dnd/characters/import-pathbuilder'
        : '/api/dnd/characters/import-json';
      const res = await fetch(route, {
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
      // The Pathbuilder importer returns what it could NOT map. Showing it is the whole advantage a
      // deterministic importer has over the AI one; hiding it throws that advantage away, and a player who
      // is told "subclass was not imported" fixes it in ten seconds instead of finding out at a table.
      const caveats = [
        ...(Array.isArray(j.notes) ? (j.notes as string[]) : []),
        Array.isArray(j.unmapped) && j.unmapped.length ? `Not imported: ${(j.unmapped as string[]).join(', ')}.` : '',
      ].filter(Boolean);
      setMsg(`Imported ${j.character?.name ?? 'character'}.${j.summary ? ` ${j.summary}.` : ''}`);
      setDetail(caveats);
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
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
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
      {(msg || detail.length > 0) && (
        <span style={{ fontSize: 12, color: 'var(--hx-muted)', maxWidth: 460 }}>
          {msg}
          {detail.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {detail.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </span>
      )}
    </span>
  );
}
