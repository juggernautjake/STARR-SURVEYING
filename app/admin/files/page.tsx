'use client';

// app/admin/files/page.tsx
//
// F4 of FILE_EXPLORER_2026-06-25 — the file explorer. Browse folders/files with
// a breadcrumb, create folders, upload (signed-URL with progress), download,
// rename, and delete — all permission-aware (each node carries the viewer's
// effective access). Brand-styled, mobile-first. Clipboard/duplicate (F5),
// in-app viewer (F6), and the permissions dialog (F7) layer on next.

import { useCallback, useEffect, useState } from 'react';
import {
  Folder,
  FileText,
  FileImage,
  Upload,
  FolderPlus,
  Download,
  Pencil,
  Trash2,
  ChevronRight,
  Home,
} from 'lucide-react';

type AccessLevel = 'none' | 'view' | 'download' | 'edit' | 'manage';

interface FileNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  access: AccessLevel;
}
interface Crumb {
  id: string;
  name: string;
}

const rank = (a: AccessLevel) => ['none', 'view', 'download', 'edit', 'manage'].indexOf(a);
const canDownload = (a: AccessLevel) => rank(a) >= rank('download');
const canEdit = (a: AccessLevel) => rank(a) >= rank('edit');

function formatSize(bytes: number | null): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function putWithProgress(url: string, file: File, onPct: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onPct(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

export default function FilesPage(): React.ReactElement {
  const [parentId, setParentId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [parentAccess, setParentAccess] = useState<AccessLevel>('manage');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);

  const load = useCallback(async (pid: string | null) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/files?parent=${pid ?? 'root'}`);
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load files.');
      setNodes([]);
      return;
    }
    const data = await res.json();
    setNodes(data.nodes ?? []);
    setBreadcrumb(data.breadcrumb ?? []);
    setParentAccess(data.parent_access ?? 'view');
  }, []);

  useEffect(() => {
    load(parentId);
  }, [parentId, load]);

  const canWriteHere = canEdit(parentAccess);

  async function createFolder() {
    const name = window.prompt('New folder name:');
    if (!name?.trim()) return;
    setBusy(true);
    const res = await fetch('/api/admin/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, name }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not create the folder.');
      return;
    }
    load(parentId);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setError(null);
    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      try {
        setUploadLabel(`Uploading ${file.name} (${i + 1}/${list.length})… 0%`);
        const init = await fetch('/api/admin/files/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId, name: file.name, size_bytes: file.size }),
        });
        if (!init.ok) {
          setError((await init.json().catch(() => ({}))).error ?? `Couldn't start uploading ${file.name}.`);
          continue;
        }
        const { signed_url, path } = await init.json();
        await putWithProgress(signed_url, file, (pct) => setUploadLabel(`Uploading ${file.name} (${i + 1}/${list.length})… ${pct}%`));
        await fetch('/api/admin/files/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId, name: file.name, path, mime_type: file.type, size_bytes: file.size }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to upload ${file.name}.`);
      }
    }
    setBusy(false);
    setUploadLabel(null);
    e.target.value = '';
    load(parentId);
  }

  async function download(n: FileNode) {
    const res = await fetch(`/api/admin/files/${n.id}/download`);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not download.');
      return;
    }
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function rename(n: FileNode) {
    const name = window.prompt('Rename to:', n.name);
    if (!name?.trim() || name === n.name) return;
    const res = await fetch(`/api/admin/files/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not rename.');
      return;
    }
    load(parentId);
  }

  async function remove(n: FileNode) {
    if (!window.confirm(`Delete "${n.name}"${n.node_type === 'folder' ? ' and everything inside it' : ''}? This can be undone by an admin.`)) return;
    const res = await fetch(`/api/admin/files/${n.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not delete.');
      return;
    }
    load(parentId);
  }

  return (
    <main className="fx" data-payments-admin data-testid="file-explorer">
      <header className="fx__head">
        <h1 className="fx__title">Files</h1>
        <div className="fx__actions">
          <button type="button" className="fx-btn fx-btn--ghost" onClick={createFolder} disabled={!canWriteHere || busy} data-testid="fx-new-folder">
            <FolderPlus size={16} /> New folder
          </button>
          <label className={`fx-btn ${canWriteHere && !busy ? '' : 'fx-btn--disabled'}`} data-testid="fx-upload-label">
            <Upload size={16} /> Upload
            <input type="file" multiple onChange={onUpload} disabled={!canWriteHere || busy} style={{ display: 'none' }} data-testid="fx-upload-input" />
          </label>
        </div>
      </header>

      {/* Breadcrumb */}
      <nav className="fx__crumbs" aria-label="Breadcrumb">
        <button type="button" className="fx__crumb" onClick={() => setParentId(null)} data-testid="fx-crumb-root">
          <Home size={14} /> Home
        </button>
        {breadcrumb.map((c) => (
          <span key={c.id} className="fx__crumb-wrap">
            <ChevronRight size={14} className="fx__crumb-sep" aria-hidden />
            <button type="button" className="fx__crumb" onClick={() => setParentId(c.id)}>
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {uploadLabel && <p className="fx__upload" role="status" data-testid="fx-upload-status">{uploadLabel}</p>}
      {error && <p className="fx__error" role="alert" data-testid="fx-error">{error}</p>}

      {loading ? (
        <p className="fx__empty">Loading…</p>
      ) : nodes.length === 0 ? (
        <div className="fx__empty" data-testid="fx-empty">
          <Folder size={40} aria-hidden />
          <p>This folder is empty.</p>
          {canWriteHere && <p className="fx__empty-hint">Use “New folder” or “Upload” to add something.</p>}
        </div>
      ) : (
        <ul className="fx__list" data-testid="fx-list">
          {nodes.map((n) => {
            const isFolder = n.node_type === 'folder';
            const Icon = isFolder ? Folder : n.mime_type?.startsWith('image/') ? FileImage : FileText;
            return (
              <li key={n.id} className="fx__row" data-testid={`fx-row-${n.id}`}>
                <button
                  type="button"
                  className="fx__name"
                  onClick={() => (isFolder ? setParentId(n.id) : download(n))}
                  title={isFolder ? 'Open folder' : 'Download'}
                >
                  <Icon size={18} className={isFolder ? 'fx__icon fx__icon--folder' : 'fx__icon'} aria-hidden />
                  <span className="fx__name-text">{n.name}</span>
                </button>
                <span className="fx__meta">{isFolder ? 'Folder' : formatSize(n.size_bytes)}</span>
                <span className="fx__meta fx__meta--date">{new Date(n.updated_at).toLocaleDateString()}</span>
                <span className="fx__row-actions">
                  {!isFolder && canDownload(n.access) && (
                    <button type="button" className="fx__icon-btn" onClick={() => download(n)} title="Download" aria-label={`Download ${n.name}`}>
                      <Download size={16} />
                    </button>
                  )}
                  {canEdit(n.access) && (
                    <button type="button" className="fx__icon-btn" onClick={() => rename(n)} title="Rename" aria-label={`Rename ${n.name}`}>
                      <Pencil size={16} />
                    </button>
                  )}
                  {canEdit(n.access) && (
                    <button type="button" className="fx__icon-btn fx__icon-btn--danger" onClick={() => remove(n)} title="Delete" aria-label={`Delete ${n.name}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .fx { font-family: 'Inter', sans-serif; background: #f4f5f9; min-height: 100vh; color: #152050; padding: 1.5rem 1.25rem 4rem; }
  .fx__head { max-width: 1100px; margin: 0 auto 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .fx__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; font-weight: 700; margin: 0; }
  .fx__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .fx-btn { display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-weight: 700; font-size: 0.9rem; padding: 0.55rem 0.9rem; background: #1D3095; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
  .fx-btn:hover:not(:disabled):not(.fx-btn--disabled) { background: #16266f; }
  .fx-btn--ghost { background: #fff; color: #1D3095; border: 1px solid #d6d9e3; }
  .fx-btn--ghost:hover:not(:disabled) { background: rgba(29,48,149,0.05); }
  .fx-btn:disabled, .fx-btn--disabled { opacity: 0.5; cursor: not-allowed; }

  .fx__crumbs { max-width: 1100px; margin: 0 auto 0.85rem; display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; font-size: 0.9rem; }
  .fx__crumb-wrap { display: inline-flex; align-items: center; gap: 0.15rem; }
  .fx__crumb { display: inline-flex; align-items: center; gap: 0.3rem; background: none; border: none; cursor: pointer; color: #1D3095; font: inherit; font-weight: 600; padding: 0.2rem 0.35rem; border-radius: 6px; }
  .fx__crumb:hover { background: rgba(29,48,149,0.07); }
  .fx__crumb-sep { color: #9aa1b4; }

  .fx__upload { max-width: 1100px; margin: 0 auto 0.75rem; background: #eef1fb; border: 1px solid #c9d2f0; color: #1D3095; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.88rem; }
  .fx__error { max-width: 1100px; margin: 0 auto 0.75rem; background: #fdecec; color: #8a0e13; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.9rem; }

  .fx__empty { max-width: 1100px; margin: 2.5rem auto; text-align: center; color: #6b7280; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .fx__empty-hint { font-size: 0.85rem; }

  .fx__list { max-width: 1100px; margin: 0 auto; list-style: none; padding: 0; background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; overflow: hidden; }
  .fx__row { display: grid; grid-template-columns: 1fr 7rem 7rem auto; align-items: center; gap: 0.5rem; padding: 0.55rem 1rem; border-bottom: 1px solid #f1f2f7; }
  .fx__row:last-child { border-bottom: none; }
  .fx__row:hover { background: #fafbff; }
  .fx__name { display: flex; align-items: center; gap: 0.6rem; min-width: 0; background: none; border: none; cursor: pointer; font: inherit; color: #152050; text-align: left; padding: 0.2rem 0; }
  .fx__name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .fx__name:hover .fx__name-text { color: #1D3095; text-decoration: underline; }
  .fx__icon { color: #6b7280; flex-shrink: 0; }
  .fx__icon--folder { color: #1D3095; }
  .fx__meta { font-size: 0.82rem; color: #6b7280; font-variant-numeric: tabular-nums; }
  .fx__row-actions { display: inline-flex; gap: 0.15rem; justify-content: flex-end; }
  .fx__icon-btn { background: none; border: none; cursor: pointer; color: #6b7280; padding: 0.35rem; border-radius: 8px; display: inline-flex; }
  .fx__icon-btn:hover { background: #eef1fb; color: #1D3095; }
  .fx__icon-btn--danger:hover { background: #fdecec; color: #BD1218; }

  @media (max-width: 640px) {
    .fx__row { grid-template-columns: 1fr auto; }
    .fx__meta { display: none; }
  }
`;
