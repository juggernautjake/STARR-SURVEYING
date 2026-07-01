'use client';
// app/admin/cad/components/PointFileLibraryDialog.tsx
//
// cad-branching — the shared point-file library. Every uploaded coordinate
// file is visible to everyone, so any surveyor can grab one and start a new
// drawing from scratch. Upload a file to share it; "Start new drawing" seeds
// the import wizard with it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { FileText, Upload, Trash2, Loader2, RefreshCw, MapPin, PencilRuler } from 'lucide-react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { useDrawingStore, useImportStore } from '@/lib/cad/store';
import { requestDiscard } from '../hooks/useUnsavedChangesGuard';
import { confirmAction, alertAction } from './ConfirmDialog';

interface Props { onClose: () => void }

interface PointFileMeta {
  id: string;
  name: string;
  description: string | null;
  uploaded_by: string;
  format: string;
  point_count: number;
  byte_size: number;
  created_at: string;
}

/** Rough point count: non-empty, non-comment lines minus a likely header. */
function estimatePointCount(text: string): number {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
  if (lines.length === 0) return 0;
  // If the first data line has no digits it's probably a header row.
  const headerish = !/\d/.test(lines[0]);
  return Math.max(0, lines.length - (headerish ? 1 : 0));
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PointFileLibraryDialog({ onClose }: Props) {
  const { data: session } = useSession();
  const me = (session?.user?.email ?? '').toLowerCase();

  const [files, setFiles] = useState<PointFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cad/point-files');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setFiles(((await res.json()) as { files: PointFileMeta[] }).files ?? []);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q) || f.uploaded_by.toLowerCase().includes(q));
  })();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      const text = await f.text();
      const ext = (f.name.split('.').pop() ?? 'csv').toUpperCase();
      const res = await fetch('/api/admin/cad/point-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, content: text, format: ext, point_count: estimatePointCount(text) }),
      });
      const b = (await res.json()) as { file?: PointFileMeta; error?: string };
      if (!res.ok || !b.file) throw new Error(b.error ?? 'Upload failed');
      setFiles((prev) => [b.file!, ...prev]);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  function startDrawingFrom(meta: PointFileMeta) {
    requestDiscard(() => {
      setBusyId(meta.id);
      void (async () => {
        try {
          const res = await fetch(`/api/admin/cad/point-files?id=${encodeURIComponent(meta.id)}`);
          const b = (await res.json()) as { file?: { content: string; name: string }; error?: string };
          if (!res.ok || !b.file) throw new Error(b.error ?? 'Could not load point file');
          useDrawingStore.getState().newDocument();
          useImportStore.getState().setFile(new File([b.file.content], b.file.name, { type: 'text/plain' }), b.file.content);
          onClose();
          setTimeout(() => window.dispatchEvent(new CustomEvent('cad:openImport')), 60);
        } catch (e) {
          alertAction({ title: 'Could not start drawing', message: String((e as Error)?.message ?? e) });
        } finally {
          setBusyId(null);
        }
      })();
    });
  }

  async function remove(meta: PointFileMeta) {
    const ok = await confirmAction({ title: 'Remove from library?', message: `Remove “${meta.name}” from the shared point-file library? This can't be undone.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setBusyId(meta.id);
    try {
      const res = await fetch(`/api/admin/cad/point-files?id=${encodeURIComponent(meta.id)}`, { method: 'DELETE' });
      if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { error?: string }; throw new Error(b.error ?? 'Delete failed'); }
      setFiles((prev) => prev.filter((f) => f.id !== meta.id));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModalFrame open onClose={onClose} title="STARR CAD — Shared Point-File Library" initialWidth={640} initialHeight={600} minWidth={500} minHeight={400} storageKey="cad-point-library">
      <div className="flex flex-col h-full text-gray-200">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-700 shrink-0">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search point files…"
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500"
            />
          </div>
          <button onClick={refresh} className="p-2 text-gray-400 hover:text-gray-200" title="Refresh"><RefreshCw size={14} /></button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.txt,.rw5,.jxl,.xml,.pnezd,.pts" className="hidden" onChange={handleUpload} />
        </div>

        <p className="px-3 pt-2 text-[11px] text-gray-500 shrink-0">
          <MapPin size={11} className="inline -mt-0.5 mr-1" />
          Files here are shared with everyone. Upload a coordinate file to make it reusable, or start a new drawing from one.
        </p>

        {error && <div className="mx-3 mt-2 px-3 py-2 rounded bg-red-900/40 border border-red-700 text-red-200 text-xs" role="alert">{error}</div>}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={14} className="animate-spin" /> Loading…</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center text-center text-gray-500 py-12 px-6">
              <FileText size={28} className="mb-3 opacity-60" />
              <p className="text-xs max-w-xs">{files.length === 0 ? 'No point files yet. Upload a CSV / coordinate file to share it with the team.' : 'No files match your search.'}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((f) => (
                <li key={f.id} className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 flex items-center gap-3">
                  <FileText size={20} className="text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-xs text-gray-400">
                      {f.point_count.toLocaleString()} pts · {f.format} · {prettyBytes(f.byte_size)} · by <span className="text-gray-300">{f.uploaded_by}</span>
                    </p>
                    {f.description && <p className="text-xs text-gray-500 truncate mt-0.5">{f.description}</p>}
                  </div>
                  <button
                    onClick={() => startDrawingFrom(f)}
                    disabled={busyId === f.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white font-semibold shrink-0"
                    title="Start a new drawing by importing this file"
                  >
                    {busyId === f.id ? <Loader2 size={13} className="animate-spin" /> : <PencilRuler size={13} />} Start drawing
                  </button>
                  {f.uploaded_by.toLowerCase() === me && (
                    <button onClick={() => remove(f)} disabled={busyId === f.id} className="p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-50 shrink-0" title="Remove from library">
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
