'use client';

// app/admin/files/page.tsx
//
// File explorer. Browse folders/files with a breadcrumb, create folders, upload
// (signed-URL with progress + drag-and-drop), download, rename, delete — all
// permission-aware (each node carries the viewer's effective access).
//
// F5 adds the clipboard/move UX: multi-select, cut / copy / paste, duplicate,
// multi-download, and drag-to-move (drag rows onto a folder row or a breadcrumb;
// drag files in from the OS to upload). Brand-styled, mobile-first. The in-app
// viewer (F6) and permissions dialog (F7) layer on next.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Folder,
  FileText,
  FileImage,
  Upload,
  FolderPlus,
  Download,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  ChevronRight,
  ChevronLeft,
  Home,
  X,
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

const NODES_DT = 'application/x-fx-nodes';
const rank = (a: AccessLevel) => ['none', 'view', 'download', 'edit', 'manage'].indexOf(a);
const canDownload = (a: AccessLevel) => rank(a) >= rank('download');
const canEdit = (a: AccessLevel) => rank(a) >= rank('edit');

const isImage = (m: string | null) => !!m && m.startsWith('image/');
const isPdf = (m: string | null) => m === 'application/pdf';
const isPreviewable = (n: FileNode) => n.node_type === 'file' && (isImage(n.mime_type) || isPdf(n.mime_type));

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

async function errOf(res: Response, fallback: string): Promise<string> {
  return (await res.json().catch(() => ({}))).error ?? fallback;
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clip, setClip] = useState<{ mode: 'cut' | 'copy'; ids: string[] } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null); // folder/crumb the move would drop into
  const [fileDrag, setFileDrag] = useState(false); // OS files hovering over the page
  const dragDepth = useRef(0);

  const [viewer, setViewer] = useState<{ node: FileNode; url: string } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const load = useCallback(async (pid: string | null) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/files?parent=${pid ?? 'root'}`);
    setLoading(false);
    if (!res.ok) {
      setError(await errOf(res, 'Failed to load files.'));
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
    setSelected(new Set()); // selection is per-folder
  }, [parentId, load]);

  const canWriteHere = canEdit(parentAccess);

  // ---- uploads -----------------------------------------------------------
  const uploadFiles = useCallback(
    async (list: File[], destId: string | null) => {
      if (list.length === 0) return;
      setBusy(true);
      setError(null);
      for (let i = 0; i < list.length; i += 1) {
        const file = list[i];
        try {
          setUploadLabel(`Uploading ${file.name} (${i + 1}/${list.length})… 0%`);
          const init = await fetch('/api/admin/files/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id: destId, name: file.name, size_bytes: file.size }),
          });
          if (!init.ok) {
            setError(await errOf(init, `Couldn't start uploading ${file.name}.`));
            continue;
          }
          const { signed_url, path } = await init.json();
          await putWithProgress(signed_url, file, (pct) =>
            setUploadLabel(`Uploading ${file.name} (${i + 1}/${list.length})… ${pct}%`),
          );
          await fetch('/api/admin/files/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id: destId, name: file.name, path, mime_type: file.type, size_bytes: file.size }),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : `Failed to upload ${file.name}.`);
        }
      }
      setBusy(false);
      setUploadLabel(null);
      load(parentId);
    },
    [load, parentId],
  );

  async function onUploadInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length) await uploadFiles(Array.from(files), parentId);
    e.target.value = '';
  }

  // ---- folder / node ops -------------------------------------------------
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
      setError(await errOf(res, 'Could not create the folder.'));
      return;
    }
    load(parentId);
  }

  async function download(n: FileNode) {
    const res = await fetch(`/api/admin/files/${n.id}/download`);
    if (!res.ok) {
      setError(await errOf(res, 'Could not download.'));
      return;
    }
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ---- in-app viewer (F6) -----------------------------------------------
  const openViewer = useCallback(async (n: FileNode) => {
    setViewerLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/files/${n.id}/download?inline=1`);
    setViewerLoading(false);
    if (!res.ok) {
      setError(await errOf(res, 'Could not open this file.'));
      return;
    }
    const { url } = await res.json();
    setViewer({ node: n, url });
  }, []);

  function onNameClick(n: FileNode) {
    if (n.node_type === 'folder') setParentId(n.id);
    else if (isPreviewable(n)) openViewer(n);
    else download(n);
  }

  const previewList = nodes.filter(isPreviewable);
  function stepViewer(dir: 1 | -1) {
    if (!viewer || previewList.length < 2) return;
    const idx = previewList.findIndex((p) => p.id === viewer.node.id);
    if (idx === -1) return;
    const next = previewList[(idx + dir + previewList.length) % previewList.length];
    openViewer(next);
  }

  useEffect(() => {
    if (!viewer) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewer(null);
      else if (e.key === 'ArrowRight') stepViewer(1);
      else if (e.key === 'ArrowLeft') stepViewer(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, nodes]);

  async function rename(n: FileNode) {
    const name = window.prompt('Rename to:', n.name);
    if (!name?.trim() || name === n.name) return;
    const res = await fetch(`/api/admin/files/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError(await errOf(res, 'Could not rename.'));
      return;
    }
    load(parentId);
  }

  async function duplicate(n: FileNode) {
    setBusy(true);
    const res = await fetch(`/api/admin/files/${n.id}/copy`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setError(await errOf(res, 'Could not duplicate.'));
      return;
    }
    load(parentId);
  }

  async function remove(n: FileNode) {
    if (!window.confirm(`Delete "${n.name}"${n.node_type === 'folder' ? ' and everything inside it' : ''}? This can be undone by an admin.`)) return;
    const res = await fetch(`/api/admin/files/${n.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(await errOf(res, 'Could not delete.'));
      return;
    }
    load(parentId);
  }

  // ---- selection + clipboard --------------------------------------------
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const selectedNodes = () => nodes.filter((n) => selected.has(n.id));
  const allSelected = nodes.length > 0 && selected.size === nodes.length;

  function clearSelection() {
    setSelected(new Set());
  }

  async function deleteSelected() {
    const items = selectedNodes().filter((n) => canEdit(n.access));
    if (items.length === 0) return;
    if (!window.confirm(`Delete ${items.length} item(s)? Folders include everything inside them. This can be undone by an admin.`)) return;
    setBusy(true);
    for (const n of items) {
      const res = await fetch(`/api/admin/files/${n.id}`, { method: 'DELETE' });
      if (!res.ok) setError(await errOf(res, `Could not delete ${n.name}.`));
    }
    setBusy(false);
    clearSelection();
    load(parentId);
  }

  async function downloadSelected() {
    for (const n of selectedNodes()) {
      if (n.node_type === 'file' && canDownload(n.access)) await download(n);
    }
  }

  async function duplicateSelected() {
    const items = selectedNodes().filter((n) => canEdit(n.access));
    if (items.length === 0) return;
    setBusy(true);
    for (const n of items) {
      const res = await fetch(`/api/admin/files/${n.id}/copy`, { method: 'POST' });
      if (!res.ok) setError(await errOf(res, `Could not duplicate ${n.name}.`));
    }
    setBusy(false);
    clearSelection();
    load(parentId);
  }

  async function paste() {
    if (!clip) return;
    setBusy(true);
    setError(null);
    let skipped = 0;
    for (const id of clip.ids) {
      if (clip.mode === 'copy') {
        const res = await fetch(`/api/admin/files/${id}/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId }),
        });
        if (res.ok) skipped += (await res.json()).skipped ?? 0;
        else setError(await errOf(res, 'Could not paste an item.'));
      } else {
        const res = await fetch(`/api/admin/files/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId }),
        });
        if (!res.ok) setError(await errOf(res, 'Could not move an item.'));
      }
    }
    if (clip.mode === 'cut') setClip(null);
    setBusy(false);
    clearSelection();
    await load(parentId);
    if (skipped > 0) setError(`Pasted, but ${skipped} item(s) were skipped because you don't have access to them.`);
  }

  // ---- drag to move ------------------------------------------------------
  async function moveInto(destId: string | null, ids: string[]) {
    const list = ids.filter((id) => id !== destId);
    if (list.length === 0) return;
    setBusy(true);
    for (const id of list) {
      const res = await fetch(`/api/admin/files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: destId }),
      });
      if (!res.ok) setError(await errOf(res, 'Could not move an item.'));
    }
    setBusy(false);
    clearSelection();
    load(parentId);
  }

  function onRowDragStart(e: React.DragEvent, n: FileNode) {
    const ids = selected.has(n.id) ? [...selected] : [n.id];
    e.dataTransfer.setData(NODES_DT, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDropTargetOver(e: React.DragEvent, id: string | null) {
    if (e.dataTransfer.types.includes(NODES_DT)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverId(id ?? '__home__');
    }
  }
  function onDropTargetLeave() {
    setDragOverId(null);
  }
  function onDropTargetDrop(e: React.DragEvent, destId: string | null) {
    const raw = e.dataTransfer.getData(NODES_DT);
    setDragOverId(null);
    if (!raw) return;
    e.preventDefault();
    try {
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids) && ids.length) moveInto(destId, ids);
    } catch {
      /* ignore malformed payload */
    }
  }

  // ---- OS file drop ------------------------------------------------------
  function onPageDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files') || !canWriteHere) return;
    dragDepth.current += 1;
    setFileDrag(true);
  }
  function onPageDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('Files') && canWriteHere) e.preventDefault();
  }
  function onPageDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setFileDrag(false);
  }
  function onPageDrop(e: React.DragEvent) {
    dragDepth.current = 0;
    setFileDrag(false);
    if (e.dataTransfer.types.includes(NODES_DT)) return; // internal move handled elsewhere
    const files = e.dataTransfer.files;
    if (files && files.length && canWriteHere) {
      e.preventDefault();
      uploadFiles(Array.from(files), parentId);
    }
  }

  const selCount = selected.size;
  const selEditable = selectedNodes().filter((n) => canEdit(n.access)).length;
  const selDownloadable = selectedNodes().filter((n) => n.node_type === 'file' && canDownload(n.access)).length;

  return (
    <main
      className={`fx${fileDrag ? ' fx--file-drag' : ''}`}
      data-payments-admin
      data-testid="file-explorer"
      onDragEnter={onPageDragEnter}
      onDragOver={onPageDragOver}
      onDragLeave={onPageDragLeave}
      onDrop={onPageDrop}
    >
      <header className="fx__head">
        <h1 className="fx__title">Files</h1>
        <div className="fx__actions">
          {clip && (
            <button type="button" className="fx-btn fx-btn--paste" onClick={paste} disabled={!canWriteHere || busy} data-testid="fx-paste">
              <ClipboardPaste size={16} /> Paste {clip.ids.length} {clip.mode === 'cut' ? '(move)' : '(copy)'}
            </button>
          )}
          {clip && (
            <button type="button" className="fx__icon-btn" onClick={() => setClip(null)} title="Cancel clipboard" aria-label="Cancel clipboard">
              <X size={16} />
            </button>
          )}
          <button type="button" className="fx-btn fx-btn--ghost" onClick={createFolder} disabled={!canWriteHere || busy} data-testid="fx-new-folder">
            <FolderPlus size={16} /> New folder
          </button>
          <label className={`fx-btn ${canWriteHere && !busy ? '' : 'fx-btn--disabled'}`} data-testid="fx-upload-label">
            <Upload size={16} /> Upload
            <input type="file" multiple onChange={onUploadInput} disabled={!canWriteHere || busy} style={{ display: 'none' }} data-testid="fx-upload-input" />
          </label>
        </div>
      </header>

      {/* Breadcrumb (also a drop target to move items up a level) */}
      <nav className="fx__crumbs" aria-label="Breadcrumb">
        <button
          type="button"
          className={`fx__crumb${dragOverId === '__home__' ? ' fx__crumb--drop' : ''}`}
          onClick={() => setParentId(null)}
          onDragOver={(e) => onDropTargetOver(e, null)}
          onDragLeave={onDropTargetLeave}
          onDrop={(e) => onDropTargetDrop(e, null)}
          data-testid="fx-crumb-root"
        >
          <Home size={14} /> Home
        </button>
        {breadcrumb.map((c, i) => {
          const isCurrent = i === breadcrumb.length - 1;
          return (
            <span key={c.id} className="fx__crumb-wrap">
              <ChevronRight size={14} className="fx__crumb-sep" aria-hidden />
              <button
                type="button"
                className={`fx__crumb${dragOverId === c.id ? ' fx__crumb--drop' : ''}`}
                onClick={() => setParentId(c.id)}
                onDragOver={(e) => (isCurrent ? undefined : onDropTargetOver(e, c.id))}
                onDragLeave={onDropTargetLeave}
                onDrop={(e) => (isCurrent ? undefined : onDropTargetDrop(e, c.id))}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {c.name}
              </button>
            </span>
          );
        })}
      </nav>

      {/* Selection toolbar */}
      {selCount > 0 && (
        <div className="fx__toolbar" role="toolbar" aria-label="Selection actions" data-testid="fx-toolbar">
          <span className="fx__toolbar-count">{selCount} selected</span>
          <div className="fx__toolbar-actions">
            {selDownloadable > 0 && (
              <button type="button" className="fx-chip" onClick={downloadSelected} disabled={busy}>
                <Download size={15} /> Download
              </button>
            )}
            {selEditable > 0 && (
              <>
                <button type="button" className="fx-chip" onClick={() => setClip({ mode: 'copy', ids: [...selected] })} disabled={busy} data-testid="fx-copy">
                  <Copy size={15} /> Copy
                </button>
                <button type="button" className="fx-chip" onClick={() => setClip({ mode: 'cut', ids: [...selected] })} disabled={busy} data-testid="fx-cut">
                  <Scissors size={15} /> Cut
                </button>
                <button type="button" className="fx-chip" onClick={duplicateSelected} disabled={busy}>
                  <CopyPlus size={15} /> Duplicate
                </button>
                <button type="button" className="fx-chip fx-chip--danger" onClick={deleteSelected} disabled={busy}>
                  <Trash2 size={15} /> Delete
                </button>
              </>
            )}
            <button type="button" className="fx-chip fx-chip--ghost" onClick={clearSelection}>
              <X size={15} /> Clear
            </button>
          </div>
        </div>
      )}

      {uploadLabel && <p className="fx__upload" role="status" data-testid="fx-upload-status">{uploadLabel}</p>}
      {error && <p className="fx__error" role="alert" data-testid="fx-error">{error}</p>}

      {loading ? (
        <p className="fx__empty">Loading…</p>
      ) : nodes.length === 0 ? (
        <div className="fx__empty" data-testid="fx-empty">
          <Folder size={40} aria-hidden />
          <p>This folder is empty.</p>
          {canWriteHere && <p className="fx__empty-hint">Use “New folder”, “Upload”, or drag files here to add something.</p>}
        </div>
      ) : (
        <ul className="fx__list" data-testid="fx-list">
          <li className="fx__row fx__row--header" aria-hidden>
            <span className="fx__check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(nodes.map((n) => n.id)))}
                aria-label="Select all"
                data-testid="fx-select-all"
              />
            </span>
            <span className="fx__col">Name</span>
            <span className="fx__col fx__col--meta">Size</span>
            <span className="fx__col fx__col--meta">Modified</span>
            <span />
          </li>
          {nodes.map((n) => {
            const isFolder = n.node_type === 'folder';
            const Icon = isFolder ? Folder : n.mime_type?.startsWith('image/') ? FileImage : FileText;
            const isDropTarget = isFolder && canEdit(n.access);
            const isSel = selected.has(n.id);
            return (
              <li
                key={n.id}
                className={`fx__row${isSel ? ' fx__row--selected' : ''}${dragOverId === n.id ? ' fx__row--drop' : ''}`}
                data-testid={`fx-row-${n.id}`}
                draggable={canEdit(n.access)}
                onDragStart={(e) => onRowDragStart(e, n)}
                onDragOver={isDropTarget ? (e) => onDropTargetOver(e, n.id) : undefined}
                onDragLeave={isDropTarget ? onDropTargetLeave : undefined}
                onDrop={isDropTarget ? (e) => onDropTargetDrop(e, n.id) : undefined}
              >
                <span className="fx__check">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleSelect(n.id)}
                    aria-label={`Select ${n.name}`}
                    data-testid={`fx-check-${n.id}`}
                  />
                </span>
                <button
                  type="button"
                  className="fx__name"
                  onClick={() => onNameClick(n)}
                  title={isFolder ? 'Open folder' : isPreviewable(n) ? 'Preview' : 'Download'}
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
                    <button type="button" className="fx__icon-btn" onClick={() => duplicate(n)} title="Duplicate" aria-label={`Duplicate ${n.name}`}>
                      <CopyPlus size={16} />
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

      {viewerLoading && !viewer && (
        <p className="fx__upload" role="status" data-testid="fx-viewer-loading">Opening…</p>
      )}

      {viewer && (
        <div
          className="fx__viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${viewer.node.name}`}
          data-testid="fx-viewer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewer(null);
          }}
        >
          <div className="fx__viewer-bar">
            <span className="fx__viewer-name" title={viewer.node.name}>{viewer.node.name}</span>
            <div className="fx__viewer-tools">
              {canDownload(viewer.node.access) && (
                <button type="button" className="fx__viewer-btn" onClick={() => download(viewer.node)} title="Download" aria-label="Download">
                  <Download size={18} />
                </button>
              )}
              <button type="button" className="fx__viewer-btn" onClick={() => setViewer(null)} title="Close" aria-label="Close preview" data-testid="fx-viewer-close">
                <X size={18} />
              </button>
            </div>
          </div>

          {previewList.length > 1 && (
            <button type="button" className="fx__viewer-nav fx__viewer-nav--prev" onClick={() => stepViewer(-1)} aria-label="Previous">
              <ChevronLeft size={28} />
            </button>
          )}
          {previewList.length > 1 && (
            <button type="button" className="fx__viewer-nav fx__viewer-nav--next" onClick={() => stepViewer(1)} aria-label="Next">
              <ChevronRight size={28} />
            </button>
          )}

          <div className="fx__viewer-stage">
            {isImage(viewer.node.mime_type) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewer.url} alt={viewer.node.name} className="fx__viewer-img" />
            ) : isPdf(viewer.node.mime_type) ? (
              <iframe src={viewer.url} title={viewer.node.name} className="fx__viewer-frame" />
            ) : (
              <div className="fx__viewer-fallback">
                <FileText size={40} />
                <p>This file can’t be previewed.</p>
                <button type="button" className="fx-btn" onClick={() => download(viewer.node)}>
                  <Download size={16} /> Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {fileDrag && (
        <div className="fx__dropzone" aria-hidden>
          <div className="fx__dropzone-card">
            <Upload size={28} />
            <p>Drop files to upload here</p>
          </div>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .fx { font-family: 'Inter', sans-serif; background: #f4f5f9; min-height: 100vh; color: #152050; padding: 1.5rem 1.25rem 4rem; position: relative; }
  .fx--file-drag { outline: 2px dashed #1D3095; outline-offset: -10px; }
  .fx__head { max-width: 1100px; margin: 0 auto 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .fx__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; font-weight: 700; margin: 0; }
  .fx__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

  .fx-btn { display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-weight: 700; font-size: 0.9rem; padding: 0.55rem 0.9rem; background: #1D3095; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
  .fx-btn:hover:not(:disabled):not(.fx-btn--disabled) { background: #16266f; }
  .fx-btn--ghost { background: #fff; color: #1D3095; border: 1px solid #d6d9e3; }
  .fx-btn--ghost:hover:not(:disabled) { background: rgba(29,48,149,0.05); }
  .fx-btn--paste { background: #BD1218; }
  .fx-btn--paste:hover:not(:disabled) { background: #9d0f14; }
  .fx-btn:disabled, .fx-btn--disabled { opacity: 0.5; cursor: not-allowed; }

  .fx__crumbs { max-width: 1100px; margin: 0 auto 0.85rem; display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; font-size: 0.9rem; }
  .fx__crumb-wrap { display: inline-flex; align-items: center; gap: 0.15rem; }
  .fx__crumb { display: inline-flex; align-items: center; gap: 0.3rem; background: none; border: none; cursor: pointer; color: #1D3095; font: inherit; font-weight: 600; padding: 0.2rem 0.35rem; border-radius: 6px; }
  .fx__crumb:hover { background: rgba(29,48,149,0.07); }
  .fx__crumb--drop { background: rgba(29,48,149,0.16); outline: 1px dashed #1D3095; }
  .fx__crumb-sep { color: #9aa1b4; }

  .fx__toolbar { max-width: 1100px; margin: 0 auto 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; background: #1D3095; color: #fff; padding: 0.5rem 0.85rem; border-radius: 10px; }
  .fx__toolbar-count { font-weight: 700; font-size: 0.9rem; }
  .fx__toolbar-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .fx-chip { display: inline-flex; align-items: center; gap: 0.3rem; font: inherit; font-weight: 600; font-size: 0.85rem; padding: 0.35rem 0.65rem; background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; cursor: pointer; }
  .fx-chip:hover:not(:disabled) { background: rgba(255,255,255,0.28); }
  .fx-chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .fx-chip--danger:hover:not(:disabled) { background: #BD1218; border-color: #BD1218; }
  .fx-chip--ghost { background: transparent; }

  .fx__upload { max-width: 1100px; margin: 0 auto 0.75rem; background: #eef1fb; border: 1px solid #c9d2f0; color: #1D3095; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.88rem; }
  .fx__error { max-width: 1100px; margin: 0 auto 0.75rem; background: #fdecec; color: #8a0e13; padding: 0.55rem 0.85rem; border-radius: 8px; font-size: 0.9rem; }

  .fx__empty { max-width: 1100px; margin: 2.5rem auto; text-align: center; color: #6b7280; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .fx__empty-hint { font-size: 0.85rem; }

  .fx__list { max-width: 1100px; margin: 0 auto; list-style: none; padding: 0; background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; overflow: hidden; }
  .fx__row { display: grid; grid-template-columns: 2.2rem 1fr 7rem 7rem auto; align-items: center; gap: 0.5rem; padding: 0.55rem 1rem; border-bottom: 1px solid #f1f2f7; }
  .fx__row:last-child { border-bottom: none; }
  .fx__row:not(.fx__row--header):hover { background: #fafbff; }
  .fx__row--header { background: #f7f8fc; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: #8a90a2; font-weight: 700; }
  .fx__row--selected { background: #eef1fb !important; }
  .fx__row--drop { background: rgba(29,48,149,0.12) !important; outline: 1px dashed #1D3095; outline-offset: -3px; }
  .fx__col { min-width: 0; }
  .fx__check { display: inline-flex; align-items: center; }
  .fx__check input { width: 16px; height: 16px; cursor: pointer; accent-color: #1D3095; }
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

  .fx__viewer { position: fixed; inset: 0; background: rgba(21,32,80,0.82); display: flex; flex-direction: column; z-index: 60; padding: 0.75rem; }
  .fx__viewer-bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; color: #fff; padding: 0.35rem 0.5rem 0.6rem; }
  .fx__viewer-name { font-weight: 700; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx__viewer-tools { display: inline-flex; gap: 0.25rem; flex-shrink: 0; }
  .fx__viewer-btn { background: rgba(255,255,255,0.14); border: none; color: #fff; padding: 0.4rem; border-radius: 8px; cursor: pointer; display: inline-flex; }
  .fx__viewer-btn:hover { background: rgba(255,255,255,0.28); }
  .fx__viewer-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.14); border: none; color: #fff; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; z-index: 2; }
  .fx__viewer-nav:hover { background: rgba(255,255,255,0.3); }
  .fx__viewer-nav--prev { left: 0.75rem; }
  .fx__viewer-nav--next { right: 0.75rem; }
  .fx__viewer-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .fx__viewer-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; background: #fff; }
  .fx__viewer-frame { width: 100%; height: 100%; border: none; border-radius: 8px; background: #fff; }
  .fx__viewer-fallback { background: #fff; color: #152050; border-radius: 14px; padding: 2rem 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }

  .fx__dropzone { position: fixed; inset: 0; background: rgba(21,32,80,0.35); display: flex; align-items: center; justify-content: center; z-index: 50; pointer-events: none; }
  .fx__dropzone-card { background: #fff; border: 2px dashed #1D3095; border-radius: 16px; padding: 2rem 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: #1D3095; font-weight: 700; }

  @media (max-width: 640px) {
    .fx__row { grid-template-columns: 2.2rem 1fr auto; }
    .fx__meta, .fx__col--meta { display: none; }
  }
`;
