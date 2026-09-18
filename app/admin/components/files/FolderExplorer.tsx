'use client';
/**
 * FolderExplorer — a project's or a job's files in the standard structure (owner, 2026-09-10).
 *
 *   Project → Project documents + its jobs → Research / CAD / Photos / Videos (+ Documents, Receipts)
 *
 * This replaced the job page's Research / CAD / Files / Photos / Videos bubbles and the project
 * page's documents panel: one explorer, rooted at the job (`mnt:jobs:<id>`) or the project
 * (`mnt:projects:<id>`), reading the same mounts the backend File Explorer reads, so the folder
 * somebody sees here is the folder they find under Job Projects there.
 *
 * What it does:
 *   - browses the structure with a breadcrumb; folder tiles say what belongs in them
 *   - "All files" — every file in this folder and its subfolders, grouped by folder, in one
 *     scrollable view (the tree endpoint), searchable by name
 *   - opens files in the ONE shared viewer (FileViewer.tsx), whose arrows walk the folder — or,
 *     in "All files", the whole subtree — with rename / notes / tags / move / copy / delete
 *     routed to the row behind each file (lib/files/adapters/mount.ts)
 *   - uploads through ONE pop-up (UploadFilesDialog.tsx, owner 2026-09-15): the big "Upload files"
 *     bar, or files dropped anywhere on the explorer, open it; each file is given its folder there
 *   - makes, renames and removes named folders inside a job (seed 639); attaches a File Explorer
 *     document into the folder being looked at
 *   - saves one file through the OS dialog; "Download all" zips the folder — or, in "All files",
 *     the whole subtree with its folder paths
 *
 * The whole subtree is fetched once (one request; a job costs one listing on the server) and
 * navigation is instant; every edit re-fetches it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Folder, FolderOpen, Layers, Search, Upload, Link2, Eye, Download, ExternalLink, Loader2,
  FileText, Image as ImageIcon, Film, Music, Archive, DraftingCompass, Receipt, BookOpenText, Camera, Video, X, RefreshCw,
  FolderPlus, Pencil, Trash2,
} from 'lucide-react';
import SharedFileViewer from './FileViewer';
import DownloadAllButton from './DownloadAllButton';
import FileComments from './FileComments';
import FileExplorerDialog from './FileExplorerDialog';
import UploadFilesDialog from './UploadFilesDialog';
import InlineRename from './InlineRename';
import { formatBytes, formatWhen } from './format';
import { downloadFile } from '@/lib/files/download';
import { fileKind } from '@/lib/files/viewer-model';
import type { MountNode, MountTree, MountTreeFolder } from '@/lib/files/mount-node';
import {
  jobFolder, isJobFolderKey, parseJobFolderId, parseProjectDocsId, parseNamedFolderId, parseJobNodeId, uploadSpecForRoot,
  detectJobFileType, checkFolderName, type JobFolderKey,
} from '@/lib/files/job-folders';
import { mountNodeToViewerFile, mountCapabilities, mountViewUrl } from '@/lib/files/adapters/mount';
import './FolderExplorer.css';

export type FolderExtraKey = JobFolderKey | 'root' | 'docs' | 'job';

export interface FolderExplorerProps {
  /** `mnt:jobs:<jobId>` or `mnt:projects:<projectId>` — or any mount / explorer folder id. */
  rootId: string;
  /** A standard folder key (`'research'`) or a full folder id to open first. */
  initialFolder?: string | null;
  /** Page-owned panels shown under a folder's files: the research records under Research, the
   *  New Drawing button under CAD, … keyed by the standard folder key, `'docs'`, `'job'` or `'root'`. */
  folderExtras?: Partial<Record<FolderExtraKey, React.ReactNode>>;
  /** Every file under the root, after each load — the tab badge reads it. */
  onTotalChange?: (total: number) => void;
  /** Optional heading; the root folder's own name otherwise. */
  title?: string;
  className?: string;
  /** Bump to re-list — a page that uploaded through its own Upload button asks for the new files. */
  refreshKey?: number;
}

type Mode = 'folder' | 'all';

interface UploadTarget {
  kind: 'job' | 'project';
  jobId?: string;
  projectId?: string;
  section: string;
  fileType: string | null;
  accept: string | null;
  label: string;
  /** A named folder's uuid (`job_files.folder_id`), when the folder is one. */
  folderId: string | null;
}

/** Where an upload into `folderId` goes, or null when the folder does not take uploads. */
function uploadTargetFor(folderId: string, folderName: string): UploadTarget | null {
  const jf = parseJobFolderId(folderId);
  if (jf) {
    const spec = jobFolder(jf.folder);
    if (!spec?.uploadSection) return null;
    return { kind: 'job', jobId: jf.jobId, section: spec.uploadSection, fileType: spec.uploadFileType, accept: spec.accept, label: spec.label, folderId: null };
  }
  const nf = parseNamedFolderId(folderId);
  if (nf) {
    const spec = uploadSpecForRoot(nf.root);
    return { kind: 'job', jobId: nf.jobId, section: spec.section, fileType: spec.fileType, accept: spec.accept, label: folderName, folderId: nf.folderId };
  }
  const pd = parseProjectDocsId(folderId);
  if (pd) return { kind: 'project', projectId: pd.projectId, section: 'project', fileType: null, accept: null, label: folderName, folderId: null };
  return null;
}

/** Where a NEW named folder made while looking at `folderId` goes, or null when one cannot go there. */
function newFolderPlaceFor(folderId: string): { job_id: string; parent_key: JobFolderKey | null; parent_id: string | null } | null {
  const job = parseJobNodeId(folderId);
  if (job) return { job_id: job.jobId, parent_key: null, parent_id: null };
  const jf = parseJobFolderId(folderId);
  if (jf) return jobFolder(jf.folder)?.uploadSection ? { job_id: jf.jobId, parent_key: jf.folder, parent_id: null } : null;
  const nf = parseNamedFolderId(folderId);
  if (nf) return { job_id: nf.jobId, parent_key: null, parent_id: nf.folderId };
  return null;
}

function folderIcon(key: string | undefined, size = 22) {
  switch (key) {
    case 'research': return <BookOpenText size={size} aria-hidden="true" />;
    case 'cad': return <DraftingCompass size={size} aria-hidden="true" />;
    case 'photos': return <Camera size={size} aria-hidden="true" />;
    case 'videos': return <Video size={size} aria-hidden="true" />;
    case 'receipts': return <Receipt size={size} aria-hidden="true" />;
    case 'documents': case 'docs': return <FileText size={size} aria-hidden="true" />;
    case 'named': return <FolderOpen size={size} aria-hidden="true" />;
    default: return <Folder size={size} aria-hidden="true" />;
  }
}

function FileIcon({ node }: { node: MountNode }) {
  if (node.source?.table === 'cad_drawings') return <DraftingCompass size={16} aria-hidden="true" />;
  switch (fileKind(node.name, node.mime_type)) {
    case 'image': return <ImageIcon size={16} aria-hidden="true" />;
    case 'video': return <Film size={16} aria-hidden="true" />;
    case 'audio': return <Music size={16} aria-hidden="true" />;
    case 'pdf': case 'text': return <FileText size={16} aria-hidden="true" />;
    default: return <Archive size={16} aria-hidden="true" />;
  }
}

async function downloadEntry(id: string): Promise<{ url: string; name: string; mime: string | null } | null> {
  const res = await fetch(`/api/admin/files/${id}/download`);
  if (!res.ok) return null;
  const { url, name, mime_type } = await res.json();
  return typeof url === 'string' ? { url, name: (name as string) ?? id, mime: (mime_type as string) ?? null } : null;
}

export default function FolderExplorer({ rootId, initialFolder, folderExtras, onTotalChange, title, className, refreshKey }: FolderExplorerProps) {
  const [tree, setTree] = useState<MountTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string>(rootId);
  const [mode, setMode] = useState<Mode>('folder');
  const [query, setQuery] = useState('');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);
  const [folderForm, setFolderForm] = useState<{ mode: 'new' | 'rename'; name: string; busy: boolean; error: string | null } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dragDepth = useRef(0);
  const initialApplied = useRef<string | null | undefined>(undefined);

  // ── load ──
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/files/tree?node=${encodeURIComponent(rootId)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const t = json as MountTree;
      setTree(t);
      onTotalChange?.(t.total_files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootId, onTotalChange]);

  useEffect(() => { setLoading(true); void load(); }, [load, refreshKey]);

  // ── the structure, indexed ──
  const byId = useMemo(() => new Map((tree?.folders ?? []).map((f) => [f.id, f])), [tree]);
  const fileById = useMemo(() => {
    const m = new Map<string, MountNode>();
    for (const f of tree?.folders ?? []) for (const n of f.files) m.set(n.id, n);
    return m;
  }, [tree]);

  // The requested folder: a standard folder key resolves against the root when the root is a job.
  // Applied whenever the request changes (the stage timeline asks for Research, then CAD), not
  // only on the first load.
  useEffect(() => {
    if (!tree || initialApplied.current === (initialFolder ?? null)) return;
    initialApplied.current = initialFolder ?? null;
    if (!initialFolder) return;
    if (byId.has(initialFolder)) { setCurrentId(initialFolder); return; }
    if (isJobFolderKey(initialFolder)) {
      const direct = `${rootId}:${initialFolder}`;
      if (byId.has(direct)) { setCurrentId(direct); return; }
      const anywhere = tree.folders.find((f) => f.folder_key === initialFolder);
      if (anywhere) setCurrentId(anywhere.id);
    }
  }, [tree, byId, initialFolder, rootId]);

  // Leaving a folder closes whatever was being asked about it.
  useEffect(() => { setConfirmRemove(false); setFolderForm(null); }, [currentId]);

  // A folder that vanished after a reload (a job deleted) falls back to the root.
  useEffect(() => {
    if (tree && !byId.has(currentId)) setCurrentId(rootId);
  }, [tree, byId, currentId, rootId]);

  const current: MountTreeFolder | null = byId.get(currentId) ?? byId.get(rootId) ?? null;
  const crumbs = useMemo(() => {
    const out: MountTreeFolder[] = [];
    let f = current;
    while (f) { out.unshift(f); f = f.parent_id ? byId.get(f.parent_id) ?? null : null; }
    return out;
  }, [current, byId]);
  const childFolders = useMemo(() => (tree?.folders ?? []).filter((f) => f.parent_id === currentId), [tree, currentId]);

  /** Every folder under `id`, including itself, in tree (depth-first) order. */
  const subtreeOf = useCallback((id: string): MountTreeFolder[] => {
    const under = new Set<string>([id]);
    const out: MountTreeFolder[] = [];
    for (const f of tree?.folders ?? []) {
      if (f.id === id || (f.parent_id && under.has(f.parent_id))) { under.add(f.id); out.push(f); }
    }
    return out;
  }, [tree]);
  const countUnder = useCallback((id: string) => subtreeOf(id).reduce((n, f) => n + f.files.length, 0), [subtreeOf]);

  const q = query.trim().toLowerCase();
  const matches = (n: MountNode) => !q || n.name.toLowerCase().includes(q) || (n.tags ?? []).some((t) => t.includes(q));

  // The groups of the "All files" view: this folder and everything under it, each with its files.
  const groups = useMemo(() => {
    if (!current) return [];
    return subtreeOf(current.id).map((f) => ({ folder: f, files: f.files.filter(matches) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, subtreeOf, q]);

  const folderFiles = useMemo(() => (current?.files ?? []).filter(matches), [current, q]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What the viewer walks: the folder's files, or every file in the subtree in "All files". */
  const viewerNodes = useMemo(() => (mode === 'all' ? groups.flatMap((g) => g.files) : folderFiles), [mode, groups, folderFiles]);
  const folderNameOf = useCallback((n: MountNode) => {
    const f = n.parent_id ? byId.get(n.parent_id) : null;
    return f ? f.path.slice(Math.max(0, (current?.depth ?? 0))).join(' › ') || f.name : null;
  }, [byId, current]);

  const viewerCollection = useMemo(() => ({
    id: currentId,
    title: current?.name ?? 'Files',
    files: viewerNodes.filter((n) => !n.open_href).map((n) => mountNodeToViewerFile(n, urls[n.id] ?? null, folderNameOf(n))),
  }), [currentId, current, viewerNodes, urls, folderNameOf]);

  const viewerCapabilities = useMemo(() => mountCapabilities({
    nodeFor: (id) => fileById.get(id),
    onChanged: load,
    url: (id) => urls[id] ?? null,
  }), [fileById, load, urls]);

  // ── RENAME WITHOUT OPENING THE FILE (owner, 2026-09-18) ─────────────────────────────────────
  // "Please make sure that we can fully rename pictures/videos/files inside of projects/jobs."
  //
  // The capability already existed — it was just only reachable by opening the file full-screen and
  // clicking its title, which is a poor fit for the actual job of naming a run of photos off a
  // phone. This is the SAME capability, called from the row, so there is one rename and not two:
  // whatever `mountCapabilities` decides (job file → `label`, research doc → `document_label`,
  // anything else → a refusal that says where it IS renamed) holds here as well.
  const renameRow = useCallback(async (n: MountNode, next: string) => {
    const rename = viewerCapabilities.rename;
    if (!rename) return;
    try {
      await rename(mountNodeToViewerFile(n, urls[n.id] ?? null, folderNameOf(n)), next);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : `Could not rename ${n.name}.`);
      throw err;
    }
  }, [viewerCapabilities, urls, folderNameOf]);

  // ── open a file: fetch its viewing URL first, the rest of the collection in the background ──
  const openFile = useCallback(async (n: MountNode) => {
    if (n.open_href) { window.location.href = n.open_href; return; }
    setBusy(`Opening ${n.name}…`);
    const url = urls[n.id] ?? await mountViewUrl(n.id);
    setBusy(null);
    if (!url) { setNotice(`Could not open ${n.name}.`); return; }
    setUrls((m) => ({ ...m, [n.id]: url }));
    setViewerId(n.id);
    const others = viewerNodes.filter((x) => x.id !== n.id && !x.open_href && !urls[x.id]);
    void (async () => {
      for (let i = 0; i < others.length; i += 6) {
        const batch = others.slice(i, i + 6);
        const pairs = await Promise.all(batch.map(async (x) => [x.id, await mountViewUrl(x.id)] as const));
        setUrls((m) => { const next = { ...m }; for (const [id, u] of pairs) if (u) next[id] = u; return next; });
      }
    })();
  }, [urls, viewerNodes]);

  const save = useCallback(async (n: MountNode) => {
    setBusy(`Preparing ${n.name}…`);
    try {
      const entry = await downloadEntry(n.id);
      if (!entry) throw new Error('no download location');
      const outcome = await downloadFile(entry.url, n.original_name ?? entry.name ?? n.name, entry.mime ?? n.mime_type);
      if (outcome === 'saved') setNotice(`Saved ${n.name}.`);
    } catch (err) {
      setNotice(`Could not download ${n.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }, []);

  /** The zip: the folder's files, or the whole subtree with its folder paths kept. */
  const zipEntries = useCallback(async () => {
    const items = mode === 'all'
      ? groups.flatMap((g) => g.files.filter((n) => !n.open_href).map((n) => ({ n, folder: g.folder.path.slice(current?.depth ?? 0).join('/') })))
      : folderFiles.filter((n) => !n.open_href).map((n) => ({ n, folder: '' }));
    const resolved = await Promise.all(items.map(async ({ n, folder }) => {
      const e = await downloadEntry(n.id);
      return e ? { name: n.original_name ?? e.name ?? n.name, url: e.url, folder } : null;
    }));
    return resolved.filter((e): e is { name: string; url: string; folder: string } => e !== null);
  }, [mode, groups, folderFiles, current]);

  // ── uploads: all through the pop-up ──
  const target = current ? uploadTargetFor(current.id, current.name) : null;
  const jobUnderCurrent = current ? (parseJobFolderId(current.id)?.jobId ?? parseNamedFolderId(current.id)?.jobId ?? null) : null;
  /** Uploads are offered on a job's or a project's files — the roots the pop-up knows the folders of. */
  const uploadRoot = /^mnt:(jobs|projects):[^:]+$/.test(rootId) || Boolean(parseJobNodeId(rootId));
  const newFolderPlace = current ? newFolderPlaceFor(current.id) : null;
  const namedHere = current ? parseNamedFolderId(current.id) : null;

  function openUpload(files?: File[] | null) {
    setDroppedFiles(files && files.length ? files : null);
    setUploadOpen(true);
  }

  const onUploaded = useCallback(({ count, destinationIds }: { count: number; destinationIds: string[] }) => {
    setNotice(`Uploaded ${count} file${count === 1 ? '' : 's'}.`);
    void load().then(() => {
      // One destination: open it, so the person sees the files they just put there.
      if (destinationIds.length === 1) { setCurrentId(destinationIds[0]); setMode('folder'); }
    });
  }, [load]);

  // ── named folders: new / rename / remove ──
  async function saveFolderForm() {
    if (!folderForm || !current) return;
    const check = checkFolderName(folderForm.name);
    if (!check.ok) { setFolderForm({ ...folderForm, error: check.error }); return; }
    setFolderForm({ ...folderForm, busy: true, error: null });
    try {
      if (folderForm.mode === 'new') {
        if (!newFolderPlace) throw new Error('A folder cannot be made here.');
        const res = await fetch('/api/admin/jobs/folders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newFolderPlace, name: check.value }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Could not create the folder (HTTP ${res.status}).`);
        setNotice(json.existed ? `"${check.value}" was already here.` : `Created the folder "${check.value}".`);
      } else {
        if (!namedHere) throw new Error('Only folders you made can be renamed.');
        const res = await fetch(`/api/admin/jobs/folders/${namedHere.folderId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: check.value }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Could not rename the folder (HTTP ${res.status}).`);
        setNotice(`Renamed to "${check.value}".`);
      }
      setFolderForm(null);
      await load();
    } catch (err) {
      setFolderForm((f) => (f ? { ...f, busy: false, error: err instanceof Error ? err.message : String(err) } : f));
    }
  }

  async function removeFolder() {
    if (!namedHere || !current) return;
    setConfirmRemove(false);
    const parentId = current.parent_id;
    setBusy(`Removing ${current.name}…`);
    try {
      const res = await fetch(`/api/admin/jobs/folders/${namedHere.folderId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Could not remove the folder (HTTP ${res.status}).`);
      const moved = Number(json.files_moved_up ?? 0);
      setNotice(`Removed "${current.name}".${moved ? ` Its ${moved} file${moved === 1 ? '' : 's'} moved up a level.` : ''}`);
      if (parentId) setCurrentId(parentId);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function attachFromExplorer(node: { id: string; name: string }) {
    setPickerOpen(false);
    if (!target || target.kind !== 'job') return;
    setBusy(`Attaching ${node.name}…`);
    try {
      const res = await fetch('/api/admin/jobs/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: target.jobId, file_node_id: node.id, file_name: node.name, file_type: target.fileType ?? detectJobFileType(node.name), section: target.section, description: '', ...(target.folderId ? { folder_id: target.folderId } : {}) }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `Attach failed (${res.status})`); }
      setNotice(`Attached ${node.name}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not attach that document.');
    } finally {
      setBusy(null);
    }
  }

  // ── which page-owned panel belongs under this folder ──
  const extraKey: FolderExtraKey | null = (() => {
    if (!current) return null;
    if (current.id === rootId) return 'root';
    const jf = parseJobFolderId(current.id);
    if (jf) return jf.folder;
    if (parseNamedFolderId(current.id)) return null;
    if (parseProjectDocsId(current.id)) return 'docs';
    if (current.folder_key === 'job' || /^mnt:(jobs|projects):[^:]+(:[^:]+)?$/.test(current.id)) return 'job';
    return null;
  })();
  const extra = extraKey ? folderExtras?.[extraKey] : null;

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(t);
  }, [notice]);


  // ── render ──
  const openInFiles = `/admin/files?node=${encodeURIComponent(currentId)}`;

  const renderRow = (n: MountNode, i: number) => (
    <li key={n.id} className="fe__row m-stagger" style={{ '--i': i } as React.CSSProperties}>
      <span className="fe__row-icon"><FileIcon node={n} /></span>
      {/* The pencil is a SIBLING of the name button, never inside it — a button within a button is
          invalid markup, and the browsers that tolerate it fire both handlers on one click. */}
      <InlineRename
        name={n.name}
        onRename={(next) => renameRow(n, next)}
        canRename={Boolean(viewerCapabilities.rename) && !n.open_href}
        className="fe__row-namewrap"
        inputClassName="fe__row-rename"
        buttonClassName="fe__icon-btn fe__icon-btn--pencil"
        testId={`fe-file-${n.id}`}
      >
        <button type="button" className="fe__row-name" onClick={() => void openFile(n)} title={n.open_href ? 'Open in Starr CAD' : 'Open in the viewer'}>
          <span className="fe__row-text">{n.name}</span>
          {(n.tags?.length ?? 0) > 0 && <span className="fe__row-tags">{n.tags!.slice(0, 4).map((t) => <span key={t} className="fe__tag">{t}</span>)}</span>}
          {n.notes && <span className="fe__row-note">{n.notes}</span>}
        </button>
      </InlineRename>
      <span className="fe__row-meta">{formatBytes(n.size_bytes)}</span>
      <span className="fe__row-meta">{formatWhen(n.updated_at)}</span>
      <span className="fe__row-actions">
        {n.open_href ? (
          <a className="fe__icon-btn" href={n.open_href} title="Open in Starr CAD" aria-label={`Open ${n.name} in Starr CAD`}><ExternalLink size={15} aria-hidden="true" /></a>
        ) : (
          <button type="button" className="fe__icon-btn" onClick={() => void openFile(n)} title="Open in the viewer" aria-label={`Open ${n.name}`}><Eye size={15} aria-hidden="true" /></button>
        )}
        <button type="button" className="fe__icon-btn" onClick={() => void save(n)} title="Save to your computer" aria-label={`Download ${n.name}`}><Download size={15} aria-hidden="true" /></button>
      </span>
    </li>
  );

  return (
    <section className={`fe${className ? ` ${className}` : ''}`} aria-label={title ?? current?.name ?? 'Files'} data-testid="folder-explorer">
      {/* ── header: crumbs + the view switch ── */}
      <header className="fe__head">
        <nav className="fe__crumbs" aria-label="Folder path">
          {crumbs.map((c, i) => (
            <span key={c.id} className="fe__crumb-wrap">
              {i > 0 && <ChevronRight size={14} className="fe__crumb-sep" aria-hidden="true" />}
              <button type="button" className={`fe__crumb${c.id === currentId ? ' fe__crumb--here' : ''}`} onClick={() => setCurrentId(c.id)} aria-current={c.id === currentId ? 'location' : undefined}>
                {i === 0 ? <FolderOpen size={15} aria-hidden="true" /> : null}
                {i === 0 && title ? title : c.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="fe__tools">
          <label className="fe__search">
            <Search size={14} aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === 'all' ? 'Search every file below…' : 'Search this folder…'} aria-label="Search files" />
            {query && <button type="button" className="fe__search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} aria-hidden="true" /></button>}
          </label>
          <div className="fe__mode" role="group" aria-label="View">
            <button type="button" className={`fe__mode-btn${mode === 'folder' ? ' fe__mode-btn--on' : ''}`} onClick={() => setMode('folder')} aria-pressed={mode === 'folder'} title="Browse folder by folder">
              <Folder size={14} aria-hidden="true" /> This folder
            </button>
            <button type="button" className={`fe__mode-btn${mode === 'all' ? ' fe__mode-btn--on' : ''}`} onClick={() => setMode('all')} aria-pressed={mode === 'all'} title="View all files in this folder and its subfolders" data-testid="fe-all-files">
              <Layers size={14} aria-hidden="true" /> All files{current ? ` (${countUnder(current.id)})` : ''}
            </button>
          </div>
          <DownloadAllButton
            className="fe__btn"
            title={current?.name ?? 'files'}
            label={mode === 'all' ? 'Download all as .zip' : 'Download folder as .zip'}
            getEntries={zipEntries}
            disabled={loading || viewerNodes.filter((n) => !n.open_href).length === 0}
          />
          <button type="button" className="fe__icon-btn fe__icon-btn--ghost" onClick={() => { setLoading(true); void load(); }} title="Refresh" aria-label="Refresh"><RefreshCw size={15} aria-hidden="true" className={loading ? 'fe__spin motion-essential' : undefined} /></button>
          <Link href={openInFiles} className="fe__link" title="Open this folder in the File Explorer" data-testid="fe-open-in-files"><FolderOpen size={14} aria-hidden="true" /> Open in Files</Link>
        </div>
      </header>

      {error && <div className="fe__error" role="alert">{error} <button type="button" className="fe__btn" onClick={() => { setLoading(true); void load(); }}>Retry</button></div>}
      {(busy || notice) && (
        <div className={`fe__status${busy ? ' fe__status--busy' : ''}`} role="status" aria-live="polite">
          {busy ? <Loader2 size={14} className="fe__spin motion-essential" aria-hidden="true" /> : null}
          {busy ?? notice}
        </div>
      )}

      {/* ── the body: a drop target when the folder takes uploads ── */}
      <div
        className={`fe__body${dragOver ? ' fe__body--drop' : ''}`}
        onDragEnter={uploadRoot ? (e) => { if (!Array.from(e.dataTransfer.types).includes('Files')) return; e.preventDefault(); dragDepth.current += 1; setDragOver(true); } : undefined}
        onDragOver={uploadRoot ? (e) => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); } : undefined}
        onDragLeave={uploadRoot ? () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false); } : undefined}
        onDrop={uploadRoot ? (e) => { e.preventDefault(); dragDepth.current = 0; setDragOver(false); openUpload(Array.from(e.dataTransfer.files)); } : undefined}
      >
        {/* ── THE UPLOAD BUTTON, WHERE NOBODY CAN MISS IT (owner, 2026-09-15) ──
            "Make sure we can clearly see the buttons for uploading files." It used to exist only
            inside a standard folder, so a job opened at its top level had no way to upload at all. */}
        {uploadRoot && tree && mode === 'folder' && (
          <div className="fe__cta" data-testid="fe-upload-bar">
            <span className="fe__cta-icon" aria-hidden="true"><Upload size={22} /></span>
            <div className="fe__cta-text">
              <strong>{target ? `Add files to ${target.label}` : 'Add files'}</strong>
              <span>Drag files anywhere here, or press Upload files and pick them from your computer. You choose the folder for each one.</span>
            </div>
            <div className="fe__cta-actions">
              <button type="button" className="fe__btn fe__btn--primary fe__btn--big" onClick={() => openUpload()} disabled={busy !== null} data-testid="fe-upload">
                <Upload size={16} aria-hidden="true" /> Upload files
              </button>
              {newFolderPlace && (
                <button type="button" className="fe__btn fe__btn--big" onClick={() => setFolderForm({ mode: 'new', name: '', busy: false, error: null })} disabled={busy !== null} data-testid="fe-new-folder">
                  <FolderPlus size={16} aria-hidden="true" /> New folder
                </button>
              )}
            </div>
          </div>
        )}

        {confirmRemove && namedHere && current && (
          <div className="fe__folderform fe__folderform--danger" role="alertdialog" aria-label="Remove folder" data-testid="fe-confirm-remove">
            <p className="fe__folderform-text">Remove the folder <strong>{current.name}</strong>? No files are deleted — anything inside moves up a level.</p>
            <button type="button" className="fe__btn fe__btn--danger" onClick={() => void removeFolder()} disabled={busy !== null}>Remove folder</button>
            <button type="button" className="fe__btn" onClick={() => setConfirmRemove(false)}>Keep it</button>
          </div>
        )}

        {folderForm && (
          <form className="fe__folderform" onSubmit={(e) => { e.preventDefault(); void saveFolderForm(); }} data-testid="fe-folder-form">
            <label className="fe__folderform-field">
              <span>{folderForm.mode === 'new' ? `New folder in ${current ? (current.id === rootId && title ? title : current.name.replace(/\s\(\d+\)$/, '')) : 'this folder'}` : 'Rename folder'}</span>
              <input type="text" value={folderForm.name} maxLength={80} autoFocus placeholder="Folder name" onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === 'Escape') setFolderForm(null); }} />
            </label>
            <button type="submit" className="fe__btn fe__btn--primary" disabled={folderForm.busy}>
              {folderForm.busy ? <Loader2 size={14} className="fe__spin motion-essential" aria-hidden="true" /> : null}
              {folderForm.mode === 'new' ? 'Create folder' : 'Save name'}
            </button>
            <button type="button" className="fe__btn" onClick={() => setFolderForm(null)} disabled={folderForm.busy}>Cancel</button>
            {folderForm.error && <p className="fe__folderform-error" role="alert">{folderForm.error}</p>}
          </form>
        )}

        {loading && !tree ? (
          <ul className="fe__rows" aria-busy="true">
            {[0, 1, 2].map((i) => <li key={i} className="fe__row fe__row--skeleton"><span className="m-skeleton fe__sk fe__sk--icon" /><span className="m-skeleton fe__sk fe__sk--name" /><span className="m-skeleton fe__sk fe__sk--meta" /></li>)}
          </ul>
        ) : null}

        {tree && current && mode === 'folder' && (
          <>
            {childFolders.length > 0 && (
              <ul className="fe__tiles m-enter" aria-label="Folders">
                {childFolders.map((f, i) => (
                  <li key={f.id} className="m-stagger" style={{ '--i': i } as React.CSSProperties}>
                    <button type="button" className={`fe__tile m-pressable${f.folder_key ? ` fe__tile--${f.folder_key}` : ''}`} onClick={() => setCurrentId(f.id)} data-testid={`fe-folder-${f.folder_key ?? 'folder'}`}>
                      <span className="fe__tile-icon">{folderIcon(f.folder_key)}</span>
                      <span className="fe__tile-body">
                        <span className="fe__tile-name">{f.folder_key === 'named' ? f.name : f.name.replace(/\s\(\d+\)$/, '')}</span>
                        {f.blurb && <span className="fe__tile-blurb">{f.blurb}</span>}
                      </span>
                      <span className="fe__tile-count" aria-label={`${countUnder(f.id)} files`}>{countUnder(f.id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(target || folderFiles.length > 0 || childFolders.length === 0) && (
              <div className="fe__files">
                <div className="fe__files-head">
                  <h3 className="fe__files-title">{current.id === rootId && childFolders.length > 0 ? 'Files here' : 'Files'}<span className="fe__count">{folderFiles.length}</span></h3>
                  {(target || namedHere) && (
                    <div className="fe__upload">
                      {target?.kind === 'job' && (
                        <button type="button" className="fe__btn" onClick={() => setPickerOpen(true)} disabled={busy !== null} title="Attach a document that already lives in the File Explorer" data-testid="fe-attach">
                          <Link2 size={14} aria-hidden="true" /> Attach from Files
                        </button>
                      )}
                      {namedHere && (
                        <>
                          <button type="button" className="fe__btn" onClick={() => setFolderForm({ mode: 'rename', name: current.name, busy: false, error: null })} disabled={busy !== null} data-testid="fe-rename-folder">
                            <Pencil size={14} aria-hidden="true" /> Rename folder
                          </button>
                          <button
                            type="button"
                            className="fe__btn fe__btn--danger"
                            onClick={() => setConfirmRemove(true)}
                            disabled={busy !== null}
                            data-testid="fe-delete-folder"
                          >
                            <Trash2 size={14} aria-hidden="true" /> Remove folder
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {folderFiles.length === 0 ? (
                  <p className="fe__empty">
                    {q ? 'Nothing here matches.' : target ? `Nothing in ${target.label} yet — drag files here, or press Upload files above.` : 'Nothing here yet.'}
                  </p>
                ) : (
                  <ul className="fe__rows">{folderFiles.map(renderRow)}</ul>
                )}
              </div>
            )}
          </>
        )}

        {tree && current && mode === 'all' && (
          <div className="fe__all" data-testid="fe-all-view">
            {tree.truncated && <p className="fe__note">This view is capped; open a folder to see the rest.</p>}
            {groups.every((g) => g.files.length === 0) ? (
              <p className="fe__empty">{q ? 'Nothing below matches.' : 'No files in this folder or its subfolders yet.'}</p>
            ) : groups.map((g) => ((q && g.files.length === 0) || (g.folder.id === current.id && g.files.length === 0) ? null : (
              <section key={g.folder.id} className="fe__group m-enter" aria-label={g.folder.name}>
                <header className="fe__group-head">
                  <span className="fe__group-icon">{folderIcon(g.folder.folder_key, 16)}</span>
                  <span className="fe__group-path">
                    {(g.folder.id === current.id ? [current.name] : g.folder.path.slice(current.depth)).map((seg, i, arr) => (
                      <span key={i} className={i === arr.length - 1 ? 'fe__group-seg fe__group-seg--last' : 'fe__group-seg'}>{seg.replace(/\s\(\d+\)$/, '')}{i < arr.length - 1 && <ChevronRight size={12} aria-hidden="true" />}</span>
                    ))}
                  </span>
                  <span className="fe__count">{g.files.length}</span>
                  {g.folder.id !== current.id && <button type="button" className="fe__group-open" onClick={() => { setCurrentId(g.folder.id); setMode('folder'); }}>Open folder</button>}
                </header>
                {g.folder.error ? <p className="fe__error">{g.folder.error}</p>
                  : g.files.length === 0 ? <p className="fe__empty fe__empty--tight">Empty</p>
                  : <ul className="fe__rows">{g.files.map(renderRow)}</ul>}
              </section>
            )))}
          </div>
        )}

        {dragOver && uploadRoot && <div className="fe__drop-hint" aria-hidden="true"><Upload size={22} /> Drop to upload{target ? ` into ${target.label}` : ''} — you will choose the folder next</div>}
      </div>

      {extra ? <div className="fe__extra">{extra}</div> : null}

      {uploadRoot && (
        <UploadFilesDialog
          open={uploadOpen}
          onClose={() => { setUploadOpen(false); setDroppedFiles(null); }}
          rootId={rootId}
          title={title ?? tree?.root.name}
          initialDestinationId={target ? current?.id ?? null : null}
          initialFiles={droppedFiles}
          onUploaded={onUploaded}
        />
      )}

      <FileExplorerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="file"
        title="Attach a document from Files"
        subtitle="The job keeps a link to the document — no copy is made."
        actions={[{ key: 'attach', label: 'Attach', primary: true }]}
        canChoose={(n) => n.node_type === 'file' && !n.id.startsWith('mnt:')}
        hint="a document from My files or Shared files"
        onPick={(p) => void attachFromExplorer({ id: p.id, name: p.name })}
      />

      {viewerId && viewerCollection.files.some((f) => f.id === viewerId) && (
        <SharedFileViewer
          collection={viewerCollection}
          fileId={viewerId}
          capabilities={viewerCapabilities}
          onClose={() => setViewerId(null)}
          onCurrentChange={(id) => { if (id !== viewerId) setViewerId(id); }}
          onFileRemoved={() => { setViewerId(null); void load(); }}
          extra={(file) => {
            const n = fileById.get(file.id);
            const t = n?.source?.table;
            if (t !== 'job_files' && t !== 'field_media') return null;
            return <FileComments subjectType={t === 'field_media' ? 'field_media' : 'job_file'} subjectId={n!.source!.id} />;
          }}
        />
      )}
      {/* The job under this folder, for the panels a page hangs here. */}
      {jobUnderCurrent ? <span hidden data-job-id={jobUnderCurrent} /> : null}
    </section>
  );
}
