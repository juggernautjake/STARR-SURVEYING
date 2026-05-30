'use client';
// app/admin/cad/components/FileManagerDialog.tsx
//
// Full file manager for the shared CAD workspace: a folder tree (with
// subfolders) on the left and the selected folder's drawings on the right.
// Create / rename / delete folders, move drawings between folders, search
// across every drawing, and open / rename / export / delete files.
//
// Folders + drawings are shared across all CAD users (see the folders +
// drawings API routes). Opened via the File ▸ File Manager menu item
// (cad:openFileManager).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown,
  Pencil, Trash2, Download, FolderInput, Search, X, Copy, Upload, MoreVertical, Check,
} from 'lucide-react';
import {
  useDrawingStore, useSelectionStore, useUndoStore, useSaveTargetStore,
} from '@/lib/cad/store';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { cadLog } from '@/lib/cad/logger';
import { daysUntilPurge } from '@/lib/jobs/soft-delete';
import { confirmAction } from './ConfirmDialog';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
}
interface DrawingMeta {
  id: string;
  name: string;
  description: string | null;
  feature_count: number;
  layer_count: number;
  folder_id: string | null;
  updated_at: string;
  // job-soft-delete Slice 2 — present on rows from the `?deleted=true`
  // trash view; null/undefined for live drawings.
  deleted_at?: string | null;
}

interface Props {
  onClose: () => void;
}

// ── Reusable bits for the kebab menu / destination pickers ──────────────────

// A centered modal overlay that stacks above the File Manager's ModalFrame.
// Escape closes only this overlay (capture-phase listener pre-empts the
// ModalFrame's window-level Escape handler so the whole dialog doesn't close).
function CenterModal({
  title, onClose, children, footer, width = 380,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ zIndex: 2100 }}
      onMouseDown={onClose}
    >
      <div
        className="flex flex-col max-h-[72vh] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 h-9 bg-gray-900/60 border-b border-gray-700">
          <h3 className="text-xs font-semibold text-gray-200 truncate">{title}</h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700" aria-label="Close"><X size={14} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
        {footer && <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-700">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Selectable folder tree (root + every folder). value=null means the root.
function FolderTreeSelect({
  folders, value, onChange,
}: { folders: FolderRow[]; value: string | null; onChange: (id: string | null) => void }) {
  const kidsOf = (parentId: string | null) => folders.filter((f) => f.parent_id === parentId);
  function Node({ folder, depth }: { folder: FolderRow; depth: number }) {
    const kids = kidsOf(folder.id);
    const sel = value === folder.id;
    return (
      <li>
        <button
          type="button"
          onClick={() => onChange(folder.id)}
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left ${sel ? 'bg-blue-600/40 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
          style={{ paddingLeft: depth * 14 + 8 }}
        >
          <Folder size={13} className="shrink-0 text-amber-400" />
          <span className="text-[12px] truncate flex-1">{folder.name}</span>
          {sel && <Check size={13} className="text-blue-300 shrink-0" />}
        </button>
        {kids.length > 0 && <ul>{kids.map((c) => <Node key={c.id} folder={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  }
  return (
    <ul className="space-y-0.5">
      <li>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left ${value === null ? 'bg-blue-600/40 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
        >
          <FolderOpen size={13} className="shrink-0 text-gray-400" />
          <span className="text-[12px] truncate flex-1">All drawings (root)</span>
          {value === null && <Check size={13} className="text-blue-300 shrink-0" />}
        </button>
      </li>
      {kidsOf(null).map((f) => <Node key={f.id} folder={f} depth={0} />)}
    </ul>
  );
}

function MenuItem({
  icon, children, onClick, danger,
}: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs ${danger ? 'text-red-400 hover:bg-red-900/30' : 'text-gray-200 hover:bg-gray-700'}`}
    >
      <span className={`shrink-0 ${danger ? 'text-red-400' : 'text-gray-400'}`}>{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

// Name + destination picker for creating a new folder anywhere in the tree.
function FolderCreateModal({
  folders, defaultParentId, busy, onCancel, onSubmit,
}: {
  folders: FolderRow[];
  defaultParentId: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (name: string, parentId: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(defaultParentId);
  const canSubmit = name.trim().length > 0 && !busy;
  return (
    <CenterModal
      title="Create new folder"
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} className="px-3 h-7 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Cancel</button>
          <button onClick={() => { if (canSubmit) onSubmit(name.trim(), parentId); }} disabled={!canSubmit} className="px-3 h-7 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white">Create folder</button>
        </>
      }
    >
      <label className="block text-[11px] text-gray-400 mb-1">Folder name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onSubmit(name.trim(), parentId); }}
        placeholder="e.g. June Surveys"
        className="w-full h-8 px-2 mb-3 bg-gray-900 border border-gray-600 rounded text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <label className="block text-[11px] text-gray-400 mb-1">Location in file tree</label>
      <div className="border border-gray-700 rounded p-1 bg-gray-900/40 max-h-48 overflow-y-auto">
        <FolderTreeSelect folders={folders} value={parentId} onChange={setParentId} />
      </div>
    </CenterModal>
  );
}

export default function FileManagerDialog({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();

  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [drawings, setDrawings] = useState<DrawingMeta[]>([]);
  // job-soft-delete Slice 2 — the trash view: soft-deleted drawings
  // recoverable for 30 days.
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedDrawings, setDeletedDrawings] = useState<DrawingMeta[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Drag-and-drop: which folder target is highlighted ('root' | folderId).
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // Per-row kebab menu + the move/copy destination picker + folder creation.
  const [menuFor, setMenuFor] = useState<{ drawing: DrawingMeta; right: number; top: number; bottom: number } | null>(null);
  const [picker, setPicker] = useState<{ mode: 'move' | 'copy'; drawing: DrawingMeta } | null>(null);
  const [pickerDest, setPickerDest] = useState<string | null>(null);
  const [folderModal, setFolderModal] = useState<{ defaultParentId: string | null; onCreated?: (id: string) => void } | null>(null);

  // Escape closes the open kebab menu (capture phase so the ModalFrame's own
  // Escape-to-close handler doesn't fire underneath it).
  useEffect(() => {
    if (!menuFor) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setMenuFor(null); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menuFor]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, dRes] = await Promise.all([
        fetch('/api/admin/cad/folders'),
        fetch('/api/admin/cad/drawings'),
      ]);
      if (!fRes.ok) throw new Error(`Folders: ${fRes.status}`);
      if (!dRes.ok) throw new Error(`Drawings: ${dRes.status}`);
      const fBody = await fRes.json() as { folders: FolderRow[] };
      const dBody = await dRes.json() as { drawings: DrawingMeta[] };
      setFolders(fBody.folders ?? []);
      setDrawings(dBody.drawings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file manager');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const childrenOf = useCallback(
    (parentId: string | null) => folders.filter((f) => f.parent_id === parentId),
    [folders],
  );

  const folderName = useCallback(
    (id: string | null) => (id === null ? 'All drawings' : folders.find((f) => f.id === id)?.name ?? '(folder)'),
    [folders],
  );

  // Right-pane list: a global search ignores folder scoping; otherwise show
  // the selected folder's drawings.
  const visibleDrawings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return drawings.filter(
        (d) => d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q),
      );
    }
    return drawings.filter((d) => (d.folder_id ?? null) === selectedFolderId);
  }, [drawings, search, selectedFolderId]);

  const countIn = useCallback(
    (folderId: string | null) => drawings.filter((d) => (d.folder_id ?? null) === folderId).length,
    [drawings],
  );

  // ── Folder operations ────────────────────────────────────────────────────
  async function createFolder(parentId: string | null) {
    const name = window.prompt(parentId ? `New subfolder in "${folderName(parentId)}"` : 'New folder name');
    if (name === null) return;
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cad/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parent_id: parentId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      if (parentId) setExpanded((s) => new Set(s).add(parentId));
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create folder');
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder(f: FolderRow) {
    const next = window.prompt('Rename folder', f.name);
    if (next === null || !next.trim() || next.trim() === f.name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cad/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, name: next.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(f: FolderRow) {
    const subCount = childrenOf(f.id).length;
    const fileCount = countIn(f.id);
    const ok = await confirmAction({
      title: 'Delete folder?',
      message:
        `Delete folder "${f.name}"?` +
        (subCount > 0 ? ` Its ${subCount} subfolder${subCount === 1 ? '' : 's'} will also be deleted.` : '') +
        (fileCount > 0 ? ` Its ${fileCount} drawing${fileCount === 1 ? '' : 's'} will move to All drawings (not deleted).` : '') +
        ' This can\'t be undone.',
      confirmLabel: 'Delete folder',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cad/folders?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      if (selectedFolderId === f.id) setSelectedFolderId(null);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  // ── Drawing operations ─────────────────────────────────────────────────────
  async function openDrawing(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      const body = await res.json() as { drawing: { document: unknown; name?: string; description?: string | null } };
      const payload = body.drawing.document as { document?: unknown };
      const doc = validateAndMigrateDocument(payload?.document ?? payload);
      const recordName = body.drawing.name?.trim();
      if (recordName) doc.name = recordName;
      drawingStore.loadDocument(doc);
      selectionStore.deselectAll();
      undoStore.clear();
      useSaveTargetStore.getState().setCloudTarget(doc.id, id, body.drawing.name ?? doc.name, body.drawing.description ?? null);
      cadLog.info('FileIO', `Opened drawing from file manager: ${doc.name}`);
      onClose();
      setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open drawing');
    } finally {
      setBusy(false);
    }
  }

  async function renameDrawing(d: DrawingMeta) {
    const next = window.prompt('Rename drawing', d.name);
    if (next === null || !next.trim() || next.trim() === d.name) return;
    await patchDrawing(d.id, { name: next.trim() });
  }

  async function moveDrawing(id: string, folderId: string | null) {
    await patchDrawing(id, { folder_id: folderId });
  }

  // Server-side copy into a chosen folder: fetch the full document and POST it
  // back as a new "… copy" drawing in the destination folder.
  async function copyDrawingTo(d: DrawingMeta, folderId: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(d.id)}`);
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const { drawing } = await res.json() as { drawing: { document: unknown } };
      const post = await fetch('/api/admin/cad/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${d.name} copy`,
          document: drawing.document,
          folder_id: folderId,
          feature_count: d.feature_count,
          layer_count: d.layer_count,
        }),
      });
      if (!post.ok) throw new Error((await post.json().catch(() => ({})) as { error?: string }).error ?? `Server ${post.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Copy failed');
    } finally {
      setBusy(false);
    }
  }

  // Create a folder and return its new id (used by the folder-creation modal,
  // including the "New folder" affordance inside the move/copy picker).
  async function handleCreateFolderModal(name: string, parentId: string | null) {
    setBusy(true);
    try {
      const createRes = await fetch('/api/admin/cad/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parent_id: parentId }),
      });
      if (!createRes.ok) throw new Error((await createRes.json().catch(() => ({})) as { error?: string }).error ?? `Server ${createRes.status}`);
      const body = await createRes.json() as { folder?: { id: string } };
      const newId = body.folder?.id ?? null;
      if (parentId) setExpanded((s) => new Set(s).add(parentId));
      const cb = folderModal?.onCreated;
      setFolderModal(null);
      await refresh();
      if (cb && newId) cb(newId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create folder');
    } finally {
      setBusy(false);
    }
  }

  // Reparent a folder (null = root). The API rejects cycles.
  async function moveFolder(folderId: string, parentId: string | null) {
    if (folderId === parentId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cad/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folderId, parent_id: parentId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  }

  // Resolve a drag payload dropped on a folder target (folderId | null=root).
  function handleDropOnFolder(target: string | null, dt: DataTransfer) {
    setDropTarget(null);
    if (dt.files && dt.files.length > 0) { void importFiles(dt.files); return; }
    const data = dt.getData('text/plain');
    if (data.startsWith('drawing:')) void moveDrawing(data.slice(8), target);
    else if (data.startsWith('folder:')) void moveFolder(data.slice(7), target);
  }

  async function patchDrawing(id: string, patch: { name?: string; folder_id?: string | null }) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cad/drawings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDrawing(d: DrawingMeta) {
    const ok = await confirmAction({
      title: 'Delete drawing?',
      // job-soft-delete Slice 2 — soft delete now; recoverable for 30
      // days from the "🗑 Deleted" view (toggle in the toolbar).
      message: `Delete "${d.name}"? It moves to the trash and stays recoverable for 30 days from the "🗑 Deleted" view, then it's permanently removed.`,
      confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  // job-soft-delete Slice 2 — restore a soft-deleted drawing by
  // clearing the tombstone, then refresh whichever view is active.
  async function restoreDrawing(d: DrawingMeta) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cad/drawings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, deleted_at: null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      await loadDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  async function loadDeleted() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cad/drawings?deleted=true');
      const body = await res.json().catch(() => ({})) as { drawings?: DrawingMeta[] };
      setDeletedDrawings(body.drawings ?? []);
    } catch {
      setDeletedDrawings([]);
    } finally {
      setBusy(false);
    }
  }

  async function exportDrawing(d: DrawingMeta) {
    try {
      const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(d.id)}`);
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const { drawing } = await res.json() as { drawing: { document: unknown } };
      const blob = new Blob([JSON.stringify(drawing.document, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url, download: `${d.name.replace(/[^\w.-]+/g, '_') || 'drawing'}.starr`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  }

  // Import one or more .starr/.json files into the current folder.
  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.(starr|json)$/i.test(f.name));
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (const file of list) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text) as { document?: unknown } | unknown;
          // Accept either the saved envelope { version, application, document }
          // or a bare document; validate the inner doc for the counts.
          const inner = (parsed as { document?: unknown })?.document ?? parsed;
          const doc = validateAndMigrateDocument(inner as Parameters<typeof validateAndMigrateDocument>[0]);
          await fetch('/api/admin/cad/drawings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name.replace(/\.(starr|json)$/i, ''),
              document: parsed,
              folder_id: selectedFolderId,
              feature_count: Object.keys(doc.features ?? {}).length,
              layer_count: Object.keys(doc.layers ?? {}).length,
            }),
          });
        } catch (err) {
          cadLog.warn('FileIO', `Import failed for ${file.name}`, err);
          alert(`Could not import "${file.name}": ${err instanceof Error ? err.message : 'invalid file'}`);
        }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // ── Folder tree rendering ──────────────────────────────────────────────────
  function FolderNode({ folder, depth }: { folder: FolderRow; depth: number }) {
    const kids = childrenOf(folder.id);
    const isOpen = expanded.has(folder.id);
    const isSel = selectedFolderId === folder.id;
    return (
      <li>
        <div
          className={`group flex items-center gap-1 pr-1 rounded cursor-pointer ${
            dropTarget === folder.id ? 'bg-blue-500/40 ring-1 ring-blue-400' : isSel ? 'bg-blue-600/30' : 'hover:bg-gray-800'
          }`}
          style={{ paddingLeft: depth * 12 + 4 }}
          onClick={() => setSelectedFolderId(folder.id)}
          draggable
          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', `folder:${folder.id}`); }}
          onDragOver={(e) => { e.preventDefault(); setDropTarget(folder.id); }}
          onDragLeave={(e) => { if (dropTarget === folder.id && !e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnFolder(folder.id, e.dataTransfer); }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); if (kids.length) setExpanded((s) => { const n = new Set(s); if (n.has(folder.id)) n.delete(folder.id); else n.add(folder.id); return n; }); }}
            className="w-4 shrink-0 text-gray-500"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {kids.length > 0 ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
          </button>
          {isOpen && kids.length ? <FolderOpen size={13} className="shrink-0 text-amber-400" /> : <Folder size={13} className="shrink-0 text-amber-400" />}
          <span className="text-[12px] text-gray-200 truncate flex-1 py-0.5">{folder.name}</span>
          <span className="text-[10px] text-gray-600 shrink-0">{countIn(folder.id) || ''}</span>
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); void createFolder(folder.id); }} title="New subfolder" className="p-0.5 text-gray-400 hover:text-blue-400"><FolderPlus size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); void renameFolder(folder); }} title="Rename" className="p-0.5 text-gray-400 hover:text-white"><Pencil size={11} /></button>
            <button onClick={(e) => { e.stopPropagation(); void deleteFolder(folder); }} title="Delete" className="p-0.5 text-gray-400 hover:text-red-400"><Trash2 size={11} /></button>
          </span>
        </div>
        {isOpen && kids.length > 0 && (
          <ul>{kids.map((c) => <FolderNode key={c.id} folder={c} depth={depth + 1} />)}</ul>
        )}
      </li>
    );
  }

  return (
    <ModalFrame open onClose={onClose} title="File Manager" initialWidth={760} initialHeight={560} minWidth={520} minHeight={360} scrollBody={false}>
      <div className="flex flex-col h-full text-sm text-gray-200">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all drawings…"
              className="w-full h-8 pl-7 pr-7 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300" aria-label="Clear search"><X size={12} /></button>
            )}
          </div>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-xs rounded transition-colors"
            title="Import .starr files into the selected folder"
          >
            <Upload size={13} /> Import
          </button>
          <button
            onClick={() => void createFolder(null)}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-xs rounded transition-colors"
          >
            <FolderPlus size={13} /> New folder
          </button>
          {/* job-soft-delete Slice 2 — toggle the trash (soft-deleted
              drawings recoverable for 30 days). */}
          <button
            onClick={() => {
              setShowDeleted((v) => {
                const next = !v;
                if (next) void loadDeleted();
                return next;
              });
            }}
            disabled={busy}
            className={`flex items-center gap-1 px-2.5 h-8 text-xs rounded transition-colors disabled:opacity-40 ${
              showDeleted ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
            title={showDeleted ? 'Back to active drawings' : 'View deleted drawings (recoverable for 30 days)'}
          >
            {showDeleted ? '← Active' : '🗑 Deleted'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".starr,.json,application/json"
            multiple
            className="hidden"
            onChange={(e) => { const fs = e.target.files; e.currentTarget.value = ''; if (fs) void importFiles(fs); }}
          />
        </div>

        {error && <div className="m-3 text-red-400 text-xs bg-red-900/20 border border-red-700 rounded px-3 py-2">{error}</div>}

        {/* job-soft-delete Slice 2 — trash view: flat list of soft-
            deleted drawings, each restorable for 30 days. */}
        {showDeleted ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <div className="text-[11px] text-gray-500 mb-2">
              Deleted drawings · recoverable for 30 days, then permanently removed
            </div>
            {busy ? (
              <div className="flex items-center gap-2 py-8 text-gray-400 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Loading…
              </div>
            ) : deletedDrawings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Trash is empty — no recently deleted drawings.</p>
            ) : (
              <ul className="space-y-2">
                {deletedDrawings.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded">
                    <span className="flex-1 min-w-0 truncate text-gray-200">{d.name}</span>
                    {d.deleted_at && (
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {daysUntilPurge(d.deleted_at, Date.now()) ?? 0}d left
                      </span>
                    )}
                    <button
                      onClick={() => void restoreDrawing(d)}
                      disabled={busy}
                      className="flex items-center gap-1 px-2.5 h-7 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs rounded transition-colors shrink-0"
                    >
                      ↩ Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
        <div className="flex flex-1 min-h-0">
          {/* Folder tree */}
          <div className="w-56 shrink-0 border-r border-gray-700 overflow-y-auto py-1">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer mx-1 ${
                dropTarget === 'root' ? 'bg-blue-500/40 ring-1 ring-blue-400' : selectedFolderId === null && !search ? 'bg-blue-600/30' : 'hover:bg-gray-800'
              }`}
              onClick={() => setSelectedFolderId(null)}
              onDragOver={(e) => { e.preventDefault(); setDropTarget('root'); }}
              onDragLeave={(e) => { if (dropTarget === 'root' && !e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
              onDrop={(e) => { e.preventDefault(); handleDropOnFolder(null, e.dataTransfer); }}
            >
              <FolderOpen size={13} className="text-gray-400" />
              <span className="text-[12px] text-gray-200 flex-1">All drawings</span>
              <span className="text-[10px] text-gray-600">{countIn(null) || ''}</span>
            </div>
            <ul>{childrenOf(null).map((f) => <FolderNode key={f.id} folder={f} depth={0} />)}</ul>
          </div>

          {/* File list — also an OS drop zone: dropping .starr files imports
              them into the current folder. */}
          <div
            className={`flex-1 min-w-0 overflow-y-auto p-3 ${dropTarget === 'pane' ? 'ring-2 ring-inset ring-blue-400/60 bg-blue-500/5' : ''}`}
            onScroll={() => { if (menuFor) setMenuFor(null); }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropTarget('pane'); } }}
            onDragLeave={(e) => { if (dropTarget === 'pane' && !e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
            onDrop={(e) => {
              if (e.dataTransfer.files.length > 0) { e.preventDefault(); setDropTarget(null); void importFiles(e.dataTransfer.files); }
            }}
          >
            <div className="text-[11px] text-gray-500 mb-2">
              {search ? `Search results (${visibleDrawings.length})` : folderName(selectedFolderId)}
              <span className="text-gray-600"> · drag a file onto a folder to move it; drop .starr files here to import</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-gray-400 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Loading…
              </div>
            ) : visibleDrawings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {search ? `No drawings match “${search}”.` : 'This folder is empty.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {visibleDrawings.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 bg-gray-800 rounded-lg px-3 py-2 group"
                    draggable
                    onDragStart={(e) => {
                      // In-app: drag onto a folder to move. OS: drag to the
                      // desktop to download the .starr (Chromium DownloadURL).
                      e.dataTransfer.setData('text/plain', `drawing:${d.id}`);
                      const safe = (d.name.replace(/[^\w.-]+/g, '_') || 'drawing') + '.starr';
                      const url = `${window.location.origin}/api/admin/cad/drawings/export?id=${encodeURIComponent(d.id)}`;
                      e.dataTransfer.setData('DownloadURL', `application/json:${safe}:${url}`);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium text-sm truncate">{d.name}</div>
                      {d.description && <div className="text-gray-400 text-xs truncate mt-0.5">{d.description}</div>}
                      <div className="text-gray-600 text-[11px] mt-1">
                        {d.feature_count} feature{d.feature_count !== 1 ? 's' : ''} · {d.layer_count} layer{d.layer_count !== 1 ? 's' : ''} · Updated {new Date(d.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button disabled={busy} onClick={() => void openDrawing(d.id)} className="px-3 h-7 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded transition-colors" title="Open">Open</button>
                      <button
                        disabled={busy}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenuFor({ drawing: d, right: r.right, top: r.top, bottom: r.bottom });
                        }}
                        className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 hover:text-white rounded transition-colors"
                        title="More actions"
                        aria-label="More actions"
                      >
                        <MoreVertical size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Per-row actions menu (portaled so it isn't clipped by the file pane). */}
      {menuFor && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2000 }} onMouseDown={() => setMenuFor(null)}>
          <div
            className="absolute min-w-[210px] bg-gray-800 border border-gray-600 rounded-md shadow-2xl py-1"
            style={
              // Flip the menu above the button when it would overflow the bottom.
              (menuFor.bottom + 260 > window.innerHeight)
                ? { bottom: Math.max(8, window.innerHeight - menuFor.top + 4), right: Math.max(8, window.innerWidth - menuFor.right) }
                : { top: menuFor.bottom + 4, right: Math.max(8, window.innerWidth - menuFor.right) }
            }
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MenuItem
              icon={<FolderInput size={13} />}
              onClick={() => { const d = menuFor.drawing; setMenuFor(null); setPickerDest(d.folder_id ?? null); setPicker({ mode: 'move', drawing: d }); }}
            >
              Move “{menuFor.drawing.name}” to…
            </MenuItem>
            <MenuItem
              icon={<Copy size={13} />}
              onClick={() => { const d = menuFor.drawing; setMenuFor(null); setPickerDest(d.folder_id ?? null); setPicker({ mode: 'copy', drawing: d }); }}
            >
              Copy “{menuFor.drawing.name}” to…
            </MenuItem>
            <MenuItem
              icon={<FolderPlus size={13} />}
              onClick={() => { setMenuFor(null); setFolderModal({ defaultParentId: selectedFolderId }); }}
            >
              Create new folder…
            </MenuItem>
            <div className="my-1 border-t border-gray-700" />
            <MenuItem icon={<Download size={13} />} onClick={() => { const d = menuFor.drawing; setMenuFor(null); void exportDrawing(d); }}>Export .starr</MenuItem>
            <MenuItem icon={<Pencil size={13} />} onClick={() => { const d = menuFor.drawing; setMenuFor(null); void renameDrawing(d); }}>Rename…</MenuItem>
            <div className="my-1 border-t border-gray-700" />
            <MenuItem icon={<Trash2 size={13} />} danger onClick={() => { const d = menuFor.drawing; setMenuFor(null); void deleteDrawing(d); }}>Delete</MenuItem>
          </div>
        </div>,
        document.body,
      )}

      {/* Move / Copy destination picker. */}
      {picker && (
        <CenterModal
          title={`${picker.mode === 'move' ? 'Move' : 'Copy'} “${picker.drawing.name}” to…`}
          onClose={() => setPicker(null)}
          footer={
            <>
              <button
                onClick={() => setFolderModal({ defaultParentId: pickerDest, onCreated: (id) => setPickerDest(id) })}
                className="mr-auto px-3 h-7 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 flex items-center gap-1"
              >
                <FolderPlus size={12} /> New folder
              </button>
              <button onClick={() => setPicker(null)} className="px-3 h-7 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Cancel</button>
              <button
                disabled={busy}
                onClick={() => {
                  const { mode, drawing } = picker;
                  const dest = pickerDest;
                  setPicker(null);
                  if (mode === 'move') void moveDrawing(drawing.id, dest);
                  else void copyDrawingTo(drawing, dest);
                }}
                className="px-3 h-7 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white"
              >
                {picker.mode === 'move' ? 'Move here' : 'Copy here'}
              </button>
            </>
          }
        >
          <FolderTreeSelect folders={folders} value={pickerDest} onChange={setPickerDest} />
        </CenterModal>
      )}

      {/* New-folder creation (standalone, or as a destination for move/copy). */}
      {folderModal && (
        <FolderCreateModal
          folders={folders}
          defaultParentId={folderModal.defaultParentId}
          busy={busy}
          onCancel={() => setFolderModal(null)}
          onSubmit={(name, parentId) => void handleCreateFolderModal(name, parentId)}
        />
      )}
    </ModalFrame>
  );
}
