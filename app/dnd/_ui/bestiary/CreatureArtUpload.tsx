'use client';
// app/dnd/_ui/bestiary/CreatureArtUpload.tsx — give a catalogue creature a picture (B6-6).
//
// ── WHY THE LICENCE FIELDS ARE NOT AN "ADVANCED" DISCLOSURE ──────────────────────────────────────────
//
// They are the form. A file input with the credit tucked behind a chevron would be a form that collects a
// licence when someone remembers to, and seed 467's CHECK constraint would then reject the upload after
// the bytes had already been chosen — which reads as a broken button rather than a missing answer.
//
// `/dnd` is publicly reachable by direct link, so an uploaded image is PUBLISHED. The credit is the point,
// not paperwork around it.
//
// ── "I DREW IT" IS AN ANSWER, NOT AN EXCEPTION ───────────────────────────────────────────────────────
//
// The two presets exist because the honest common cases are "I made this" and "I found it on Commons", and
// making someone type `CC-BY-SA-4.0` from memory is how a field ends up containing "yes". They fill the
// inputs rather than replacing them, so what gets stored is always what the uploader can see and edit.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';

export default function CreatureArtUpload({
  creatureId,
  creatureName,
  hasImage,
}: {
  creatureId: string;
  creatureName: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [licence, setLicence] = useState('');
  const [attribution, setAttribution] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg('Choose an image first.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('licence', licence);
      form.set('attribution', attribution);
      if (sourceUrl) form.set('sourceUrl', sourceUrl);
      const r = await fetch(`/api/dnd/bestiary/${encodeURIComponent(creatureId)}/art`, { method: 'POST', body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'Upload failed.'); return; }
      setOpen(false);
      // The picture lives on a server-rendered page, so a refresh is what shows it. Without this the
      // upload succeeds and the page keeps showing the sigil, which reads as a failure.
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/dnd/bestiary/${encodeURIComponent(creatureId)}/art`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'Could not remove it.'); return; }
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={styles.hexBtn} onClick={() => setOpen(true)} disabled={busy}>
          🖼 {hasImage ? 'Replace the picture' : 'Add a picture'}
        </button>
        {hasImage && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Remove it
          </button>
        )}
        {msg && <span style={{ fontSize: 11.5, color: 'var(--hx-gold-2)' }}>{msg}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={upload} style={{ display: 'grid', gap: 8, border: '1px solid var(--hx-line)', padding: 12, maxWidth: 520 }}>
      <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
        A picture for <strong style={{ color: 'var(--hx-gold-2)' }}>{creatureName}</strong>. Everyone who opens this
        creature sees it, so it needs a licence and a credit — that is a rule in the database, not a preference.
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ fontSize: 12 }} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { setLicence('Own work — all rights reserved by the uploader'); setAttribution(`Original artwork for ${creatureName}`); }}
          style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--hx-line)', background: 'transparent', color: 'var(--hx-text)', cursor: 'pointer' }}
        >
          I made this
        </button>
        <button
          type="button"
          onClick={() => { setLicence('CC-BY-SA-4.0'); setAttribution('Author — CC-BY-SA-4.0, via Wikimedia Commons'); }}
          style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--hx-line)', background: 'transparent', color: 'var(--hx-text)', cursor: 'pointer' }}
        >
          From Wikimedia Commons
        </button>
      </div>

      <label style={{ display: 'grid', gap: 3, fontSize: 11.5 }}>
        <span style={{ color: 'var(--hx-teal-1)' }}>Licence</span>
        <input
          value={licence}
          onChange={(e) => setLicence(e.target.value)}
          placeholder="CC-BY-SA-4.0, Public domain, Own work…"
          required
          style={{ padding: 6, background: 'rgba(1,10,19,0.6)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
        />
      </label>

      <label style={{ display: 'grid', gap: 3, fontSize: 11.5 }}>
        <span style={{ color: 'var(--hx-teal-1)' }}>Credit</span>
        <input
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          placeholder="Who made it, and where it came from"
          required
          style={{ padding: 6, background: 'rgba(1,10,19,0.6)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
        />
      </label>

      <label style={{ display: 'grid', gap: 3, fontSize: 11.5 }}>
        <span style={{ color: 'var(--hx-teal-1)' }}>Source link (optional)</span>
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://commons.wikimedia.org/wiki/File:…"
          style={{ padding: 6, background: 'rgba(1,10,19,0.6)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
        />
      </label>

      {msg && <div style={{ fontSize: 11.5, color: 'var(--hx-gold-2)' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className={styles.hexBtn} disabled={busy}>{busy ? 'Uploading…' : 'Save the picture'}</button>
        <button
          type="button"
          onClick={() => { setOpen(false); setMsg(null); }}
          disabled={busy}
          style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', fontSize: 11.5, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
