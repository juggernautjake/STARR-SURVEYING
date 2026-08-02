'use client';
// app/AndrewAsh/studio/documents/DocumentVault.tsx
//
// ── THE FOLDER AND CATEGORY ARE CHOSEN BEFORE THE UPLOAD, NOT AFTER ─────────────────────────────
//
// Filing is the step people skip. If a file lands in "Unfiled" and has to be moved afterwards, it
// stays in Unfiled — which is how a vault becomes a folder called Unfiled with ninety things in it.
// Picking the destination first costs two clicks at the moment the person already knows the answer,
// because they are holding the document.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, Loader2, Trash2 } from 'lucide-react';
import StudioUploader from '../_ui/StudioUploader';
import { formatBytes } from '@/lib/voice/attachments';

interface Doc {
  id: string;
  title: string;
  folder: string;
  category: string;
  sizeBytes: number;
  createdAt: string;
  url: string | null;
}

const CATEGORIES = [
  { id: 'tax', label: 'Tax' },
  { id: 'license', label: 'Licences & registrations' },
  { id: 'contract', label: 'Signed contracts' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'session_master', label: 'Session masters' },
  { id: 'raw_recording', label: 'Raw recordings' },
  { id: 'script', label: 'Scripts' },
  { id: 'reference', label: 'Reference' },
  { id: 'other', label: 'Other' },
];

const SUGGESTED_FOLDERS = ['Taxes', 'Licences', 'Contracts', 'Insurance', 'Sessions', 'Unfiled'];

export default function DocumentVault({ documents }: { documents: Doc[] }): React.ReactElement {
  const router = useRouter();
  const [folder, setFolder] = useState('Taxes');
  const [category, setCategory] = useState('tax');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);

  const folders = useMemo(
    () => Array.from(new Set(['all', ...documents.map((d) => d.folder)])),
    [documents],
  );

  const shown = filter === 'all' ? documents : documents.filter((d) => d.folder === filter);

  return (
    <>
      <div className="vaFieldRow vaFieldRow2">
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-dv-folder">File it under</label>
          <input
            id="va-dv-folder"
            className="vaInput"
            list="va-dv-folders"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          />
          <datalist id="va-dv-folders">
            {[...new Set([...SUGGESTED_FOLDERS, ...documents.map((d) => d.folder)])].map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-dv-cat">What kind</label>
          <select id="va-dv-cat" className="vaSelect" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <StudioUploader
        destination="documents"
        extra={{ folder, category }}
        label={`Add to ${folder}`}
        hint="Anything. These are private and never appear on the website."
      />

      {folders.length > 2 && (
        <div className="vaTabRow">
          {folders.map((f) => (
            <button key={f} type="button" className={`vaTab${filter === f ? ' vaTabActive' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All folders' : f}
              <span className="vaTabCount">
                {f === 'all' ? documents.length : documents.filter((d) => d.folder === f).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="vaMuted" style={{ margin: '18px 0 0', fontSize: '0.9375rem' }}>Nothing filed here yet.</p>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>File</th>
              <th>Folder</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td data-label="File">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} aria-hidden style={{ color: 'var(--va-accent)', flex: 'none' }} />
                    <span style={{ color: 'var(--va-text)', fontWeight: 600 }}>{d.title}</span>
                  </span>
                  <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem', marginTop: 3 }}>
                    {CATEGORIES.find((c) => c.id === d.category)?.label ?? d.category}
                    {d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ''}
                  </span>
                </td>
                <td data-label="Folder">{d.folder}</td>
                <td data-label="Added" className="vaMuted">
                  {new Date(d.createdAt).toLocaleDateString('en-US')}
                </td>
                <td data-label="">
                  <span style={{ display: 'flex', gap: 6 }}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="vaBtn vaBtnOutline vaBtnSm">
                        <Download size={12} aria-hidden /> Open
                      </a>
                    ) : (
                      <span className="vaMuted" style={{ fontSize: '0.75rem' }}>unavailable</span>
                    )}
                    <button
                      type="button"
                      className="vaBtn vaBtnGhost vaBtnSm"
                      style={{ color: 'var(--va-danger)' }}
                      disabled={busy === d.id}
                      onClick={async () => {
                        if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
                        setBusy(d.id);
                        await fetch(`/api/voice/media?table=documents&id=${encodeURIComponent(d.id)}`, { method: 'DELETE' });
                        setBusy(null);
                        router.refresh();
                      }}
                    >
                      {busy === d.id ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <Trash2 size={12} aria-hidden />}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
