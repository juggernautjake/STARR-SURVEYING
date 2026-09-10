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
 *   - uploads INTO a standard folder (drag-and-drop or the button), attaches a File Explorer
 *     document, and cuts an over-cap video into parts first (the same flow the panels had)
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
} from 'lucide-react';
import SharedFileViewer from './FileViewer';
import DownloadAllButton from './DownloadAllButton';
import FileComments from './FileComments';
import FileExplorerDialog from './FileExplorerDialog';
import { formatBytes, formatWhen } from './format';
import { downloadFile } from '@/lib/files/download';
import { fileKind } from '@/lib/files/viewer-model';
import type { MountNode, MountTree, MountTreeFolder } from '@/lib/files/mount-node';
import { jobFolder, isJobFolderKey, parseJobFolderId, parseProjectDocsId, detectJobFileType, type JobFolderKey } from '@/lib/files/job-folders';
import { mountNodeToViewerFile, mountCapabilities, mountViewUrl } from '@/lib/files/adapters/mount';
import { uploadJobFileBytes, uploadProjectFileBytes } from '@/lib/jobs/upload-client';
import { maxBytesFor, isVideoUpload, contentTypeFor } from '@/lib/jobs/file-storage';
import { backgroundUploadSupport, startBackgroundUpload, ensureNotifyPermission } from '@/lib/jobs/upload-background';
import { megabytes } from '@/lib/storage/uploads';
import { planSplit, describePlan, type SplitPlan } from '@/lib/jobs/video-split';
import { readVideoDuration } from '@/lib/jobs/video-split-run';
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
}

/** Where an upload into `folderId` goes, or null when the folder does not take uploads. */
function uploadTargetFor(folderId: string, folderName: string): UploadTarget | null {
  const jf = parseJobFolderId(folderId);
  if (jf) {
    const spec = jobFolder(jf.folder);
    if (!spec?.uploadSection) return null;
    return { kind: 'job', jobId: jf.jobId, section: spec.uploadSection, fileType: spec.uploadFileType, accept: spec.accept, label: spec.label };
  }
  const pd = parseProjectDocsId(folderId);
  if (pd) return { kind: 'project', projectId: pd.projectId, section: 'project', fileType: null, accept: null, label: folderName };
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

export default function FolderExplorer({ rootId, initialFolder, folderExtras, onTotalChange, title, className }: FolderExplorerProps) {
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
  const [splitState, setSplitState] = useState<{ file: File; plan?: SplitPlan; phase: 'measuring' | 'confirm' | 'splitting'; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => { setLoading(true); void load(); }, [load]);

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

  // ── uploads ──
  const target = current ? uploadTargetFor(current.id, current.name) : null;
  const jobUnderCurrent = current ? (parseJobFolderId(current.id)?.jobId ?? null) : null;

  async function uploadFiles(chosen: File[]) {
    if (!target || chosen.length === 0) return;
    setNotice(null);

    // ── BACKGROUND, WHERE THE BROWSER ALLOWS IT (2026-08-19, carried over from the gallery) ──
    // Owner: "I want it so that I can leave the web app and have it still working in the background
    // … and then once it is done it can notify me." Handed to the browser via Background Fetch,
    // which keeps going after the tab closes and wakes the service worker to create the row and
    // raise the notification. Chrome and Android only — Safari falls through to the foreground path.
    if (target.kind === 'job' && backgroundUploadSupport().mode === 'background') {
      await ensureNotifyPermission();
      let handedOff = 0;
      for (const file of chosen) {
        try {
          const init = await fetch('/api/admin/jobs/files/upload', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: target.jobId, name: file.name, size_bytes: file.size, mime_type: file.type }),
          });
          if (!init.ok) throw new Error((await init.json().catch(() => ({}))).error ?? 'Could not start the upload.');
          const started = await init.json();
          const ok = await startBackgroundUpload({
            signedUrl: started.signed_url, file, contentType: contentTypeFor(file.name, file.type),
            row: {
              id: started.file_id, rowEndpoint: '/api/admin/jobs/files',
              rowBody: {
                job_id: target.jobId, file_id: started.file_id, storage_path: started.path, storage_bucket: started.bucket,
                file_name: file.name, file_type: target.fileType ?? detectJobFileType(file.name),
                file_size: file.size, mime_type: file.type, section: target.section,
              },
              fileName: file.name, sizeBytes: file.size, openUrl: '/admin/jobs/' + target.jobId,
            },
          });
          if (ok) handedOff += 1;
          else throw new Error('handoff-declined');
        } catch (e) {
          // The signed URL is already spent for this file, so there is nothing to fall back TO for
          // it — say so plainly instead of appearing to succeed.
          if (e instanceof Error && e.message !== 'handoff-declined') { setNotice(e.message); return; }
          break; // Background Fetch declined; fall through to the foreground path for everything.
        }
      }
      if (handedOff === chosen.length) {
        if (inputRef.current) inputRef.current.value = '';
        // Not reloaded here: the rows do not exist yet — the worker writes them when the transfer
        // finishes. The Refresh button is there for when the notification arrives.
        setNotice(handedOff + ' file' + (handedOff === 1 ? '' : 's') + ' handed to the browser — it keeps uploading if you leave this page and notifies you when done. Refresh to see them.');
        return;
      }
    }

    let done = 0;
    for (const file of chosen) {
      try {
        const label = `Uploading ${file.name} (${done + 1}/${chosen.length})…`;
        setBusy(label);
        const bytes = target.kind === 'job'
          ? await uploadJobFileBytes(target.jobId as string, file, (p) => setBusy(`${label} ${p.pct}%`))
          : await uploadProjectFileBytes(target.projectId as string, file, (p) => setBusy(`${label} ${p.pct}%`));
        const res = await fetch('/api/admin/jobs/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(target.kind === 'job' ? { job_id: target.jobId } : { project_id: target.projectId }),
            file_id: bytes.file_id, storage_path: bytes.storage_path, storage_bucket: bytes.storage_bucket,
            file_name: file.name, file_type: target.fileType ?? detectJobFileType(file.name),
            file_size: file.size, mime_type: file.type, section: target.section, description: '',
          }),
        });
        if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `Could not save ${file.name}.`); }
        done += 1;
      } catch (err) {
        setNotice(err instanceof Error ? err.message : `Could not upload ${file.name}.`);
        break;
      }
    }
    setBusy(null);
    if (inputRef.current) inputRef.current.value = '';
    if (done > 0) setNotice(`Uploaded ${done} file${done === 1 ? '' : 's'} into ${target.label}.`);
    await load();
  }

  /** The gate: what fits goes up; an over-cap video is offered a cut; anything else is refused with its number. */
  async function startUpload(list: FileList | File[] | null) {
    if (!list || list.length === 0 || !target) return;
    const chosen = Array.from(list);
    const fits = chosen.filter((f) => f.size <= maxBytesFor(f.name, f.type));
    const tooBig = chosen.filter((f) => f.size > maxBytesFor(f.name, f.type));
    if (fits.length) await uploadFiles(fits);
    if (tooBig.length === 0) return;
    const notVideo = tooBig.filter((f) => !isVideoUpload(f.name, f.type));
    if (notVideo.length) {
      setNotice(`${notVideo.map((f) => `"${f.name}"`).join(', ')} ${notVideo.length === 1 ? 'is' : 'are'} larger than ${megabytes(maxBytesFor(notVideo[0].name, notVideo[0].type))} MB, which is the limit for one file.`);
    }
    const video = tooBig.find((f) => isVideoUpload(f.name, f.type));
    if (!video) return;
    const cap = maxBytesFor(video.name, video.type);
    setSplitState({ file: video, phase: 'measuring', message: 'Checking how long this video is…' });
    const durationSec = await readVideoDuration(video);
    const plan = planSplit({ sizeBytes: video.size, durationSec, capBytes: cap, name: video.name });
    if (!plan.needed || plan.parts.length === 0) {
      setSplitState(null);
      setNotice(describePlan(plan, video.size, cap) || 'That video cannot be stored.');
      return;
    }
    setSplitState({ file: video, plan, phase: 'confirm', message: describePlan(plan, video.size, cap) });
  }

  async function runSplit() {
    if (!splitState?.plan) return;
    const { file, plan } = splitState;
    setSplitState({ ...splitState, phase: 'splitting', message: 'Preparing to cut the video…' });
    const { splitVideo } = await import('@/lib/jobs/video-split-run');
    const outcome = await splitVideo(file, plan.parts, (pr) =>
      setSplitState((st) => (st ? { ...st, message: `Cutting part ${pr.part} of ${pr.total}… ${pr.pct}%` } : st)));
    setSplitState(null);
    if (!outcome.ok || !outcome.files) { setNotice(outcome.error ?? 'The video could not be split.'); return; }
    const cap = maxBytesFor(file.name, file.type);
    const over = outcome.files.find((f) => f.size > cap);
    if (over) {
      setNotice(`The video was cut, but "${over.name}" is still ${megabytes(over.size)} MB — over the ${megabytes(cap)} MB limit, because this recording's keyframes are far apart. Please record at a lower resolution, or in shorter clips.`);
      return;
    }
    await uploadFiles(outcome.files);
  }

  async function attachFromExplorer(node: { id: string; name: string }) {
    setPickerOpen(false);
    if (!target || target.kind !== 'job') return;
    setBusy(`Attaching ${node.name}…`);
    try {
      const res = await fetch('/api/admin/jobs/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: target.jobId, file_node_id: node.id, file_name: node.name, file_type: target.fileType ?? detectJobFileType(node.name), section: target.section, description: '' }),
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
      <button type="button" className="fe__row-name" onClick={() => void openFile(n)} title={n.open_href ? 'Open in Starr CAD' : 'Open in the viewer'}>
        <span className="fe__row-text">{n.name}</span>
        {(n.tags?.length ?? 0) > 0 && <span className="fe__row-tags">{n.tags!.slice(0, 4).map((t) => <span key={t} className="fe__tag">{t}</span>)}</span>}
        {n.notes && <span className="fe__row-note">{n.notes}</span>}
      </button>
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
        onDragOver={target ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
        onDragLeave={target ? () => setDragOver(false) : undefined}
        onDrop={target ? (e) => { e.preventDefault(); setDragOver(false); void startUpload(e.dataTransfer.files); } : undefined}
      >
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
                        <span className="fe__tile-name">{f.name.replace(/\s\(\d+\)$/, '')}</span>
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
                  {target && (
                    <div className="fe__upload">
                      <input ref={inputRef} type="file" multiple accept={target.accept ?? undefined} hidden onChange={(e) => void startUpload(e.target.files)} />
                      <button type="button" className="fe__btn fe__btn--primary" onClick={() => inputRef.current?.click()} disabled={busy !== null} data-testid="fe-upload">
                        <Upload size={14} aria-hidden="true" /> Upload to {target.label}
                      </button>
                      {target.kind === 'job' && (
                        <button type="button" className="fe__btn" onClick={() => setPickerOpen(true)} disabled={busy !== null} title="Attach a document that already lives in the File Explorer" data-testid="fe-attach">
                          <Link2 size={14} aria-hidden="true" /> Attach from Files
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {folderFiles.length === 0 ? (
                  <p className="fe__empty">
                    {q ? 'Nothing here matches.' : target ? `Nothing in ${target.label} yet — drop files here or use Upload.` : 'Nothing here yet.'}
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

        {dragOver && target && <div className="fe__drop-hint" aria-hidden="true"><Upload size={22} /> Drop to upload into {target.label}</div>}
      </div>

      {extra ? <div className="fe__extra">{extra}</div> : null}

      {/* ── an over-cap video: measure → confirm → cut → upload ── */}
      {splitState && (
        <div className="fe__split" role="dialog" aria-label="Video too large">
          <p>{splitState.message}</p>
          {splitState.phase === 'confirm' && (
            <div className="fe__split-actions">
              <button type="button" className="fe__btn fe__btn--primary" onClick={() => void runSplit()}>Cut it and upload the parts</button>
              <button type="button" className="fe__btn" onClick={() => setSplitState(null)}>Cancel</button>
            </div>
          )}
          {splitState.phase !== 'confirm' && <Loader2 size={16} className="fe__spin motion-essential" aria-hidden="true" />}
        </div>
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
