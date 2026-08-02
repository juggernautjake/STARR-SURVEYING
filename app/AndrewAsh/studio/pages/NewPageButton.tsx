'use client';
// app/AndrewAsh/studio/pages/NewPageButton.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlusCircle } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

export default function NewPageButton({ label = 'New project' }: { label?: string }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'project' | 'page'>('project');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, kind }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not create that page.');
      // Straight into the builder. A "page created" confirmation followed by a list the user then has
      // to find the new page in is two extra steps for no information.
      router.push(`${BASE_PATH}/studio/pages/${body.page.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that page.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="vaBtn vaBtnSolid vaBtnSm" onClick={() => setOpen(true)}>
        <PlusCircle size={14} aria-hidden /> {label}
      </button>
    );
  }

  return (
    <form onSubmit={create} className="vaPanel" style={{ marginBottom: 0, minWidth: 'min(100%, 340px)' }}>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}
      <div className="vaField">
        <label className="vaLabel" htmlFor="va-new-title">
          What is it called?
        </label>
        <input
          id="va-new-title"
          className="vaInput"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Acme Dental — phone system"
          autoFocus
          required
        />
        <p className="vaHint">The web address is generated from this, and you can change it later.</p>
      </div>
      <div className="vaField">
        <label className="vaLabel" htmlFor="va-new-kind">
          Kind
        </label>
        <select
          id="va-new-kind"
          className="vaSelect"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'project' | 'page')}
        >
          <option value="project">Project — appears in Work</option>
          <option value="page">Standalone page — reachable by link only</option>
        </select>
      </div>
      <div className="vaStudioActions">
        <button type="submit" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy || !title.trim()}>
          {busy ? (
            <>
              <Loader2 size={14} aria-hidden className="vaSpin" /> Creating…
            </>
          ) : (
            'Create and open'
          )}
        </button>
        <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
