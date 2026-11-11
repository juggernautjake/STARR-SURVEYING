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
  FolderPlus, Pencil, Trash2, LayoutGrid, Grid2x2, Rows3, List as ListIcon, ScanLine,
} from 'lucide-react';
import SharedFileViewer from './FileViewer';
import DownloadAllButton from './DownloadAllButton';
import FileComments from './FileComments';
import FileExplorerDialog from './FileExplorerDialog';
import UploadFilesDialog from './UploadFilesDialog';
import ScanDialog from '../scan/ScanDialog';
import InlineRename from './InlineRename';
import RecentBadge from './RecentBadge';
import { formatBytes, formatWhen } from './format';
import { downloadFile } from '@/lib/files/download';
import { fileKind } from '@/lib/files/viewer-model';
import { isRecentUpload } from '@/lib/files/recent';
import { sortFileNodes, DEFAULT_FILE_SORT, type FileSort } from '@/lib/files/sort';
import type { MountNode, MountTree, MountTreeFolder } from '@/lib/files/mount-node';
import {
  jobFolder, isJobFolderKey, parseJobFolderId, parseProjectDocsId, parseNamedFolderId, parseJobNodeId, uploadSpecForRoot,
  detectJobFileType, checkFolderName, type JobFolderKey,
} from '@/lib/files/job-folders';
import { mountNodeToViewerFile, mountCapabilities, mountViewUrl, mountViewResult } from '@/lib/files/adapters/mount';
import { useFileThumbnails, kindOfNode, wantsThumb } from './useFileThumbnails';
import { useFileSelection } from './useFileSelection';
import { FileCheckbox, SelectAllCheckbox, SelectionBar } from './SelectionControls';
import { useDeleteFiles } from './useDeleteFiles';
import { deleteTargetForMountNode } from '@/lib/files/bulk-delete';
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
  /** `media` (owner, 2026-11-11, the job hub's Photos & Videos): the pictures and videos under the
   *  root as thumbnails, in two sections — Photos, then Videos. The folders here are the ones people
   *  make (named folders, nested as deep as they like); everything not in one of those shows at the
   *  top. A Photos | Videos switch filters either kind off (never both), and a folder with none of
   *  the kinds being shown is hidden. Sort, preview size, viewer, selection and delete are shared. */
  layout?: 'explorer' | 'media';
  /** false hides Upload files and the drop-to-upload (owner, 2026-11-11: on a job, uploading lives in
   *  Files and Photos & videos only). New folder and Scan stay. */
  uploads?: boolean;
}

type Mode = 'folder' | 'all';

// ── HOW BIG THE PREVIEWS ARE (owner, 2026-09-19) ────────────────────────────────────────────────
//
// "Please make sure that in our filing system for the jobs we have a way to choose different tiles
// sizes for each file preview so that we can see a thumbnail of each document/pdf/photo/video
// easily."
//
// Four steps rather than a slider. A slider implies every width in between is worth having; these
// four are the ones that answer different questions — "which of these forty plats is the one with
// the pond on it" wants Large, and "what is in this folder" wants the list.
//
// `list` is the original row view and stays the default, because it is the only one that shows the
// size and the date, and because changing what everybody's Files tab looks like on upgrade is not
// something to do by fiat.
type View = 'list' | 'small' | 'medium' | 'large';

const VIEWS: Array<{ id: View; label: string; hint: string }> = [
  { id: 'list', label: 'List', hint: 'Names, sizes and dates — no previews' },
  { id: 'small', label: 'Small', hint: 'Small tiles with previews' },
  { id: 'medium', label: 'Medium', hint: 'Medium tiles with previews' },
  { id: 'large', label: 'Large', hint: 'Large tiles — the biggest preview a stored one supports' },
];

/** Remembered per person, for every folder they open.
 *
 *  The owner asked for one setting, not one per folder: "Pick Large once and it stays Large." Read
 *  in an effect rather than in the `useState` initialiser, deliberately — this component renders on
 *  the server too, and reading storage during the first render is a hydration mismatch. The pattern
 *  is FileExplorerDialog's, which has used the same key shape since it was built. */
const VIEW_KEY = 'fe-view';

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

/** A file's download link. Throws with the route's own reason ("You do not have access to this
 *  file.", a timeout) so the notice says why, instead of the old "no download location". */
async function downloadEntry(id: string): Promise<{ url: string; name: string; mime: string | null }> {
  const res = await fetch(`/api/admin/files/${id}/download`);
  const json = (await res.json().catch(() => ({}))) as { url?: unknown; name?: unknown; mime_type?: unknown; error?: unknown };
  if (!res.ok) throw new Error(typeof json.error === 'string' && json.error ? json.error : `HTTP ${res.status}`);
  if (typeof json.url !== 'string') throw new Error('The server did not return a link.');
  return { url: json.url, name: typeof json.name === 'string' ? json.name : id, mime: typeof json.mime_type === 'string' ? json.mime_type : null };
}

export default function FolderExplorer({ rootId, initialFolder, folderExtras, onTotalChange, title, className, refreshKey, layout = 'explorer', uploads = true }: FolderExplorerProps) {
  const media = layout === 'media';
  const [tree, setTree] = useState<MountTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string>(rootId);
  const [mode, setMode] = useState<Mode>(media ? 'all' : 'folder');
  // Photos & Videos is a wall of pictures, so it opens on Medium tiles and remembers its own size.
  const viewKey = media ? `${VIEW_KEY}-media` : VIEW_KEY;
  const [view, setView] = useState<View>(media ? 'medium' : 'list');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(viewKey) as View | null;
      if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
    } catch { /* private window, blocked site data — the default is a working view */ }
  }, [viewKey]);
  const chooseView = useCallback((v: View) => {
    setView(v);
    try { localStorage.setItem(viewKey, v); } catch { /* nothing to do, and nothing worth saying */ }
  }, [viewKey]);
  /** Previews the browser made this session, keyed by node id — shown at once rather than waiting
   *  for a reload to fetch back the copy that was just uploaded. */
  const [madeThumbs, setMadeThumbs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** The same map, readable without being a dependency. The prefetch below needs to know what it
   *  already has, but must not re-run every time it succeeds at getting one. */
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Scan a document straight into the folder being viewed (owner, 2026-10-06).
  const [scanOpen, setScanOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);
  const [folderForm, setFolderForm] = useState<{ mode: 'new' | 'rename'; name: string; busy: boolean; error: string | null } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // A–Z (numbers as numbers) unless the person picks newest-uploaded first — lib/files/sort.ts.
  const [sort, setSort] = useState<FileSort>(DEFAULT_FILE_SORT);
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

  // ── THE OPEN FILE OUTLIVES A REDRAW (owner, 2026-11-09) ────────────────────────────────────────
  // "whenever I click somewhere else or open another program, the video player closes, and in order
  // to go back to the video and where I was in it, I have to reopen it and scroll." Whatever rebuilds
  // the page behind the viewer (a reload, the session being re-checked when the window comes back),
  // the explorer is mounted fresh and its state is gone. So the open file, its folder and the mode are
  // written down for this tab (sessionStorage) and reopened on the next mount; the video player keeps
  // its own place (lib/viewers/video-memory.ts). Closing the viewer with its ✕ forgets it.
  const OPEN_KEY = `fe-open:${media ? 'media:' : ''}${rootId}`;
  const OPEN_TTL_MS = 30 * 60 * 1000;
  const restoredOpen = useRef(false);
  const writeOpen = useCallback((v: { fileId: string; folderId: string; mode: Mode } | null) => {
    try {
      if (v) sessionStorage.setItem(OPEN_KEY, JSON.stringify({ ...v, at: Date.now() }));
      else sessionStorage.removeItem(OPEN_KEY);
    } catch { /* no storage: a redraw closes the viewer, as before */ }
  }, [OPEN_KEY]);

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
  /** A folder's subfolders, A–Z. Folders carry no upload time, so they sort by name either way. */
  const foldersIn = useCallback((id: string) => sortFileNodes(
    (tree?.folders ?? []).filter((f) => f.parent_id === id).map((f) => ({ ...f, node_type: 'folder' as const })),
  ), [tree]);
  const childFolders = useMemo(() => foldersIn(currentId), [foldersIn, currentId]);

  /** Every folder under `id`, including itself, depth-first with each level A–Z. */
  const subtreeOf = useCallback((id: string): MountTreeFolder[] => {
    const out: MountTreeFolder[] = [];
    const walk = (f: MountTreeFolder) => { out.push(f); for (const c of foldersIn(f.id)) walk(c); };
    const start = byId.get(id);
    if (start) walk(start);
    return out;
  }, [byId, foldersIn]);
  const countUnder = useCallback((id: string) => subtreeOf(id).reduce((n, f) => n + f.files.length, 0), [subtreeOf]);

  // ── PHOTOS & VIDEOS: the kind switch and the folders people make (owner, 2026-11-11) ──────────────
  // "two buttons that look kind of like one button split in two, one for photos and one for videos,
  // by default both selected … it will not be possible to turn both off." And: "the user should be
  // able to create sub folders with photos and videos in them. If only photos are selected, then any
  // folders with only photos in them will still be shown, but all folders with no photos will not."
  const [kinds, setKinds] = useState<{ image: boolean; video: boolean }>({ image: true, video: true });
  const toggleKind = useCallback((k: 'image' | 'video') => {
    setKinds((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      return next.image || next.video ? next : prev; // the last one on stays on
    });
  }, []);
  const wantKind = useCallback((n: MountNode) => {
    const k = kindOfNode(n.mime_type, n.name);
    return (k === 'image' && kinds.image) || (k === 'video' && kinds.video);
  }, [kinds]);
  const isNamed = (id: string) => parseNamedFolderId(id) !== null;
  /** Where a folder sits in Photos & videos: its nearest folder-someone-made above it, or the root. */
  const mediaParentOf = useCallback((f: MountTreeFolder): string => {
    let p = f.parent_id ? byId.get(f.parent_id) : undefined;
    while (p && p.id !== rootId) {
      if (isNamed(p.id)) return p.id;
      p = p.parent_id ? byId.get(p.parent_id) : undefined;
    }
    return rootId;
  }, [byId, rootId]);
  /** The Photos & videos place a folder's files show in: the folder itself when someone made it. */
  const mediaHomeOf = useCallback((f: MountTreeFolder) => (f.id !== rootId && isNamed(f.id) ? f.id : mediaParentOf(f)), [rootId, mediaParentOf]);

  const q = query.trim().toLowerCase();
  const matches = (n: MountNode) => !q || n.name.toLowerCase().includes(q) || (n.tags ?? []).some((t) => t.includes(q));

  // The groups of the "All files" view: this folder and everything under it, each with its files.
  const groups = useMemo(() => {
    if (!current) return [];
    if (media) {
      // Two sections instead of one per folder: the images, then the videos, that live HERE — in this
      // folder, or (at the top) anywhere that is not inside a folder someone made.
      const all = subtreeOf(current.id).filter((f) => mediaHomeOf(f) === current.id).flatMap((f) => f.files).filter(matches);
      const section = (key: 'photos' | 'videos', name: string, kind: string): { folder: MountTreeFolder; files: MountNode[] } => ({
        folder: { id: `${current.id}::media-${key}`, name, path: [...current.path, name], depth: current.depth + 1, parent_id: current.id, folder_key: key, files: [] },
        files: sortFileNodes(all.filter((n) => kindOfNode(n.mime_type, n.name) === kind), sort),
      });
      return [
        ...(kinds.image ? [section('photos', 'Photos', 'image')] : []),
        ...(kinds.video ? [section('videos', 'Videos', 'video')] : []),
      ];
    }
    return subtreeOf(current.id).map((f) => ({ folder: f, files: sortFileNodes(f.files.filter(matches), sort) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, subtreeOf, q, sort, media, kinds, mediaHomeOf]);

  const folderFiles = useMemo(() => sortFileNodes((current?.files ?? []).filter(matches), sort), [current, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Photos & videos: the folders inside this one, each with how many of the shown kinds it holds.
   *  A brand-new empty folder stays visible while both kinds are on, so it can be filled. */
  const mediaFolders = useMemo(() => {
    if (!media || !tree || !current) return [];
    const here = sortFileNodes(tree.folders
      .filter((f) => f.id !== current.id && isNamed(f.id) && mediaParentOf(f) === current.id)
      .map((f) => ({ ...f, node_type: 'folder' as const })));
    return here
      .map((f) => {
        const files = subtreeOf(f.id).flatMap((x) => x.files);
        return { folder: f, count: files.filter((n) => wantKind(n) && matches(n)).length, total: files.length };
      })
      .filter(({ count, total }) => count > 0 || (!q && kinds.image && kinds.video && total === 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, tree, current, mediaParentOf, subtreeOf, wantKind, q, kinds]);
  /** Photos & videos: the path from the top to this folder (folders people made only). */
  const mediaCrumbs = useMemo(() => {
    if (!media || !current) return [];
    const out: MountTreeFolder[] = [];
    let f: MountTreeFolder | undefined = current;
    while (f && f.id !== rootId) { out.unshift(f); f = byId.get(mediaParentOf(f)); }
    return out;
  }, [media, current, rootId, byId, mediaParentOf]);
  /** "34 photos · 3 videos" for the top of Photos & videos. */
  const mediaSummary = useMemo(() => {
    if (!media || !current) return '';
    let img = 0; let vid = 0;
    for (const f of subtreeOf(current.id)) for (const n of f.files) {
      const k = kindOfNode(n.mime_type, n.name);
      if (k === 'image') img += 1; else if (k === 'video') vid += 1;
    }
    return `${img} photo${img === 1 ? '' : 's'} · ${vid} video${vid === 1 ? '' : 's'}`;
  }, [media, current, subtreeOf]);

  // Photos & videos only ever stands at the top or in a folder someone made.
  useEffect(() => {
    if (media && tree && currentId !== rootId && !parseNamedFolderId(currentId)) setCurrentId(rootId);
  }, [media, tree, currentId, rootId]);

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

  // ── Select and delete (owner, 2026-09-27) ──
  // The selection follows what is SHOWN — this folder, or every file below it in "All files" — so a
  // Shift-click range is the range on screen. Deletes go through one flow (useDeleteFiles): confirm
  // with names and count, per-item permission on the server, Undo for job files and Explorer
  // documents, and a report naming anything that could not be deleted.
  const shownIds = useMemo(() => viewerNodes.map((n) => n.id), [viewerNodes]);
  const selection = useFileSelection(shownIds);
  const deleter = useDeleteFiles({ onDone: () => { selection.clear(); void load(); } });
  const selectedNodes = useMemo(() => viewerNodes.filter((n) => selection.isSelected(n.id)), [viewerNodes, selection]);
  const deletableSelected = useMemo(() => selectedNodes.map(deleteTargetForMountNode).filter((t): t is NonNullable<typeof t> => t !== null), [selectedNodes]);
  const deleteNodes = useCallback((nodes: MountNode[]) => {
    const items = nodes.map(deleteTargetForMountNode).filter((t): t is NonNullable<typeof t> => t !== null);
    const skipped = nodes.length - items.length;
    if (skipped > 0) setNotice(`${skipped} of the selected ${skipped === 1 ? 'is' : 'are'} deleted where ${skipped === 1 ? 'it lives' : 'they live'} (a drawing in CAD, a receipt in Receipts), so ${skipped === 1 ? 'it was' : 'they were'} left out.`);
    deleter.request(items);
  }, [deleter]);

  // Read through a ref: a capability awaits a reload and then looks the file up, and the map it
  // closed over is the one from BEFORE that reload (the first-rename-reverts bug, 2026-10-11).
  const fileByIdRef = useRef(fileById);
  fileByIdRef.current = fileById;
  const viewerCapabilities = useMemo(() => mountCapabilities({
    nodeFor: (id) => fileByIdRef.current.get(id),
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
  //
  // 2026-10-11 — the new name shows the moment Enter is pressed, rather than after the save AND a
  // re-list of the whole folder (seconds on a big job); a refusal puts the old name back.
  const renameLocally = useCallback((id: string, name: string) => {
    setTree((t) => (t ? {
      ...t,
      folders: t.folders.map((f) => (f.files.some((x) => x.id === id)
        ? { ...f, files: f.files.map((x) => (x.id === id ? { ...x, name } : x)) }
        : f)),
    } : t));
  }, []);
  const renameRow = useCallback(async (n: MountNode, next: string) => {
    const rename = viewerCapabilities.rename;
    if (!rename) return;
    renameLocally(n.id, next);
    try {
      await rename(mountNodeToViewerFile(n, urls[n.id] ?? null, folderNameOf(n)), next);
    } catch (err) {
      renameLocally(n.id, n.name);
      setNotice(err instanceof Error ? err.message : `Could not rename ${n.name}.`);
      throw err;
    }
  }, [viewerCapabilities, urls, folderNameOf, renameLocally]);

  // ── open a file: fetch its viewing URL first, the rest of the collection in the background ──
  const openFile = useCallback(async (n: MountNode) => {
    if (n.open_href) { window.location.href = n.open_href; return; }
    setBusy(`Opening ${n.name}…`);
    const cached = urls[n.id];
    const result = cached ? { url: cached } : await mountViewResult(n.id);
    setBusy(null);
    if (!('url' in result)) { setNotice(`Could not open ${n.name}: ${result.error}`); return; }
    const url = result.url;
    setUrls((m) => ({ ...m, [n.id]: url }));
    setViewerId(n.id);
  }, [urls]);

  // Reopen what was open before a redraw (see OPEN_KEY above) — once, when the tree first arrives.
  useEffect(() => {
    if (!tree || restoredOpen.current) return;
    restoredOpen.current = true;
    let saved: { fileId?: string; folderId?: string; mode?: Mode; at?: number } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? 'null'); } catch { saved = null; }
    if (!saved?.fileId || !saved.at || Date.now() - saved.at > OPEN_TTL_MS) { writeOpen(null); return; }
    const node = fileById.get(saved.fileId);
    if (!node) { writeOpen(null); return; }
    if (saved.mode === 'all' || saved.mode === 'folder') setMode(saved.mode);
    if (saved.folderId && byId.has(saved.folderId)) setCurrentId(saved.folderId);
    void openFile(node);
  }, [tree, fileById, byId, openFile, OPEN_KEY, OPEN_TTL_MS, writeOpen]);

  // …and keep the note current while a file is open; the ✕ (viewerId → null) clears it.
  useEffect(() => {
    if (!restoredOpen.current) return;
    writeOpen(viewerId ? { fileId: viewerId, folderId: currentId, mode } : null);
  }, [viewerId, currentId, mode, writeOpen]);

  // ── ONLY THE FILES YOU COULD REACH NEXT ───────────────────────────────────────────────────────
  //
  // Owner, 2026-09-19: "the whole site is kind of forzen."
  //
  // Opening one file used to prefetch a signed URL for EVERY OTHER FILE in the folder — and with an
  // `await` inside the loop, so three hundred files meant fifty sequential rounds of six requests.
  // Each one is an auth check, an access check and a storage signature, so a single click on a
  // photograph quietly queued three hundred of those against the same connection the viewer was
  // trying to use to load the photograph.
  //
  // The viewer can only go forwards or backwards, so only the files within reach are worth having
  // ready. The window follows `viewerId`, which the viewer updates as you step, so holding the arrow
  // key still never waits — it just stops paying for the nine-tenths of the folder you never reach.
  const WINDOW = 8;
  const askedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!viewerId) return;
    const reachable = viewerNodes.filter((x) => !x.open_href);
    const at = reachable.findIndex((x) => x.id === viewerId);
    if (at < 0) return;
    const near = reachable
      .slice(Math.max(0, at - WINDOW), at + WINDOW + 1)
      .filter((x) => x.id !== viewerId && !urlsRef.current[x.id] && !askedRef.current.has(x.id));
    if (!near.length) return;
    for (const x of near) askedRef.current.add(x.id);

    let live = true;
    void (async () => {
      const pairs = await Promise.all(near.map(async (x) => [x.id, await mountViewUrl(x.id)] as const));
      if (!live) return;
      setUrls((m) => { const next = { ...m }; for (const [id, u] of pairs) if (u) next[id] = u; return next; });
    })();
    return () => { live = false; };
  }, [viewerId, viewerNodes]);

  const save = useCallback(async (n: MountNode) => {
    setBusy(`Preparing ${n.name}…`);
    try {
      const entry = await downloadEntry(n.id);
      const outcome = await downloadFile(entry.url, n.original_name ?? entry.name ?? n.name, entry.mime ?? n.mime_type);
      if (outcome === 'saved') setNotice(`Saved ${n.name}.`);
    } catch (err) {
      setNotice(`Could not download ${n.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }, []);

  /** "3 selected → Download": each through the same save path as its own Download button. */
  const downloadSelected = useCallback(async () => {
    for (const n of selectedNodes.filter((x) => !x.open_href)) await save(n);
  }, [selectedNodes, save]);

  /** The zip: the folder's files, or the whole subtree with its folder paths kept. */
  const zipEntries = useCallback(async () => {
    const items = mode === 'all'
      ? groups.flatMap((g) => g.files.filter((n) => !n.open_href).map((n) => ({ n, folder: g.folder.path.slice(current?.depth ?? 0).join('/') })))
      : folderFiles.filter((n) => !n.open_href).map((n) => ({ n, folder: '' }));
    const resolved = await Promise.all(items.map(async ({ n, folder }) => {
      // One file that cannot be linked is left out of the zip, not allowed to sink the other forty.
      const e = await downloadEntry(n.id).catch(() => null);
      return e ? { name: n.original_name ?? e.name ?? n.name, url: e.url, folder } : null;
    }));
    return resolved.filter((e): e is { name: string; url: string; folder: string } => e !== null);
  }, [mode, groups, folderFiles, current]);

  // ── uploads: all through the pop-up ──
  const target = current ? uploadTargetFor(current.id, current.name) : null;
  const jobUnderCurrent = current ? (parseJobFolderId(current.id)?.jobId ?? parseNamedFolderId(current.id)?.jobId ?? null) : null;
  /** Uploads are offered on a job's or a project's files — the roots the pop-up knows the folders of. */
  const uploadRoot = /^mnt:(jobs|projects):[^:]+$/.test(rootId) || Boolean(parseJobNodeId(rootId));
  /** The Upload button and dropping files — off where the page wants uploads elsewhere. */
  const canUpload = uploadRoot && uploads;
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
      if (destinationIds.length !== 1) return;
      if (!media) { setCurrentId(destinationIds[0]); setMode('folder'); }
      else if (parseNamedFolderId(destinationIds[0])) setCurrentId(destinationIds[0]);
    });
  }, [load, media]);

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

  // ── MAKING THE PREVIEWS THAT ARE MISSING ──────────────────────────────────────────────────────
  //
  // Only in a view that shows pictures, and only for tiles that have actually come on screen — see
  // useFileThumbnails for why that restraint matters (making a preview costs the whole file).
  const { request: requestThumbs } = useFileThumbnails({
    enabled: view !== 'list',
    resolveUrl: async (id) => urlsRef.current[id] ?? await mountViewUrl(id),
    onResult: useCallback((id: string, thumbUrl: string | null) => {
      if (thumbUrl) setMadeThumbs((m) => ({ ...m, [id]: thumbUrl }));
    }, []),
  });

  /** One observer for the whole grid. A tile asks to be watched as it mounts and the callback
   *  queues whatever has come into view — so a folder of a thousand documents generates previews
   *  for the dozen somebody actually scrolled to. */
  const seenRef = useRef<Map<Element, MountNode>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (view === 'list' || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const arrived: MountNode[] = [];
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = seenRef.current.get(e.target);
        if (n) arrived.push(n);
      }
      if (!arrived.length) return;
      requestThumbs(arrived.map((n) => ({
        id: n.id,
        name: n.name,
        mime: n.mime_type,
        sizeBytes: n.size_bytes,
        kind: kindOfNode(n.mime_type, n.name),
        thumbState: n.thumb_state,
      })));
    }, { rootMargin: '200px' });
    observerRef.current = io;
    for (const el of seenRef.current.keys()) io.observe(el);
    return () => { io.disconnect(); observerRef.current = null; };
  }, [view, requestThumbs]);

  const watchTile = useCallback((el: HTMLElement | null, n: MountNode) => {
    if (!el) return;
    seenRef.current.set(el, n);
    observerRef.current?.observe(el);
  }, []);

  /** The picture to show on a tile, or null for the icon.
   *
   *  Three sources, in order: one this browser just made, one the server already had, and — for a
   *  photograph small enough that a separate preview would be pointless — the file itself. The last
   *  case only fires when a signed URL is already to hand; it never fetches one just to fill a tile,
   *  which is the mistake that made the map panel download a gigabyte to draw a contact sheet. */
  const previewFor = (n: MountNode): string | null => {
    if (madeThumbs[n.id]) return madeThumbs[n.id]!;
    if (n.thumb_url) return n.thumb_url;
    const kind = kindOfNode(n.mime_type, n.name);
    if (kind === 'image' && !wantsThumb({ id: n.id, name: n.name, mime: n.mime_type, sizeBytes: n.size_bytes, kind, thumbState: n.thumb_state })) {
      return urls[n.id] ?? null;
    }
    return null;
  };

  const renderTile = (n: MountNode, i: number) => {
    const preview = previewFor(n);
    return (
      <li
        key={n.id}
        className={`fe__card m-stagger${selection.isSelected(n.id) ? ' fe__card--selected' : ''}`}
        style={{ '--i': i } as React.CSSProperties}
        ref={(el) => watchTile(el, n)}
      >
        <FileCheckbox id={n.id} name={n.name} selection={selection} className="fe__card-check" />
        <button type="button" className="fe__card-open" onClick={() => void openFile(n)} title={n.open_href ? 'Open in Starr CAD' : 'Open in the viewer'}>
          <span className="fe__card-thumb">
            {preview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt="" className="fe__card-img" loading="lazy" decoding="async" />
            ) : (
              <span className="fe__card-icon"><FileIcon node={n} /></span>
            )}
            <RecentBadge uploadedAt={n.uploaded_at} className="recent-badge--tile" />
          </span>
          <span className="fe__card-name">{n.name}</span>
        </button>
        <span className="fe__card-meta">{formatBytes(n.size_bytes)}</span>
        <span className="fe__card-actions">
          {n.open_href ? (
            <a className="fe__icon-btn" href={n.open_href} title="Open in Starr CAD" aria-label={`Open ${n.name} in Starr CAD`}><ExternalLink size={14} aria-hidden="true" /></a>
          ) : (
            <button type="button" className="fe__icon-btn" onClick={() => void openFile(n)} title="Open in the viewer" aria-label={`Open ${n.name}`}><Eye size={14} aria-hidden="true" /></button>
          )}
          <button type="button" className="fe__icon-btn" onClick={() => void save(n)} title="Save to your computer" aria-label={`Download ${n.name}`}><Download size={14} aria-hidden="true" /></button>
          {deleteTargetForMountNode(n) && (
            <button type="button" className="fe__icon-btn fe__icon-btn--danger" onClick={() => deleteNodes([n])} title="Delete" aria-label={`Delete ${n.name}`} data-testid={`fe-delete-${n.id}`}><Trash2 size={14} aria-hidden="true" /></button>
          )}
        </span>
      </li>
    );
  };

  /** One list of files, in whichever view is chosen. Both call sites go through this so the folder
   *  view and the all-files groups can never disagree about what "Large" means. */
  const renderFiles = (files: MountNode[]) => (view === 'list'
    ? <ul className="fe__rows fe__rows--select">{files.map(renderRow)}</ul>
    : <ul className={`fe__grid fe__grid--${view}`}>{files.map(renderTile)}</ul>);

  const renderRow = (n: MountNode, i: number) => (
    <li key={n.id} className={`fe__row m-stagger${selection.isSelected(n.id) ? ' fe__row--selected' : ''}`} style={{ '--i': i } as React.CSSProperties}>
      <FileCheckbox id={n.id} name={n.name} selection={selection} />
      <span className="fe__row-icon"><FileIcon node={n} /></span>
      {/* The pencil is a SIBLING of the name button, never inside it — a button within a button is
          invalid markup, and the browsers that tolerate it fire both handlers on one click. */}
      <InlineRename
        name={n.name}
        onRename={(next) => renameRow(n, next)}
        optimistic
        canRename={Boolean(viewerCapabilities.rename) && !n.open_href}
        className="fe__row-namewrap"
        inputClassName="fe__row-rename"
        buttonClassName="fe__icon-btn fe__icon-btn--pencil"
        testId={`fe-file-${n.id}`}
      >
        <button type="button" className="fe__row-name" onClick={() => void openFile(n)} title={n.open_href ? 'Open in Starr CAD' : 'Open in the viewer'}>
          <span className="fe__row-text">{n.name}</span>
          {(isRecentUpload(n.uploaded_at) || (n.tags?.length ?? 0) > 0) && (
            <span className="fe__row-tags">
              <RecentBadge uploadedAt={n.uploaded_at} />
              {(n.tags ?? []).slice(0, 4).map((t) => <span key={t} className="fe__tag">{t}</span>)}
            </span>
          )}
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
        {deleteTargetForMountNode(n) && (
          <button type="button" className="fe__icon-btn fe__icon-btn--danger" onClick={() => deleteNodes([n])} title="Delete" aria-label={`Delete ${n.name}`} data-testid={`fe-delete-${n.id}`}><Trash2 size={15} aria-hidden="true" /></button>
        )}
      </span>
    </li>
  );

  /** The "3 selected · Delete · Download · Clear" bar, above whichever list is shown (Select all is in the toolbar). */
  const selectHead = viewerNodes.length > 0 ? (
    <>
      <SelectionBar
        selection={selection}
        busy={deleter.busy}
        onDelete={() => deleteNodes(selectedNodes)}
        onDownload={() => void downloadSelected()}
        deleteDisabledReason={deletableSelected.length === 0 ? 'None of the selected files are deleted here (drawings in CAD, receipts in Receipts).' : null}
      />
    </>
  ) : null;

  return (
    <section className={`fe${className ? ` ${className}` : ''}${selection.count > 0 ? ' fe--selecting' : ''}`} aria-label={title ?? current?.name ?? 'Files'} data-testid="folder-explorer">
      {/* ── THE TOOLBAR: TWO ROWS (owner, 2026-11-11) ───────────────────────────────────────────────
          "no more than two rows, and everything should look really clean and organized."
          Row 1 — where you are, and adding to it: the path (or the counts), Open in Files, the folder's
          own Rename / Remove, New folder, Scan, Upload files.
          Row 2 — how you look at the list: Select all, search, what to show, sort, tile size; and
          what to do with all of it: Download .zip, Refresh. ── */}
      <div className="fe__bar" data-testid="fe-toolbar">
        <div className="fe__bar-row">
          <div className="fe__bar-where">
            {media ? (
              mediaCrumbs.length === 0 ? <span className="fe__bar-summary" data-testid="fe-media-summary">{mediaSummary}</span> : (
                <nav className="fe__crumbs" aria-label="Folder path" data-testid="fe-media-crumbs">
                  <span className="fe__crumb-wrap">
                    <button type="button" className="fe__crumb" onClick={() => setCurrentId(rootId)}>
                      <FolderOpen size={15} aria-hidden="true" /> All photos &amp; videos
                    </button>
                  </span>
                  {mediaCrumbs.map((c) => (
                    <span key={c.id} className="fe__crumb-wrap">
                      <ChevronRight size={14} className="fe__crumb-sep" aria-hidden="true" />
                      <button type="button" className={`fe__crumb${c.id === currentId ? ' fe__crumb--here' : ''}`} onClick={() => setCurrentId(c.id)} aria-current={c.id === currentId ? 'location' : undefined}>
                        {c.name}
                      </button>
                    </span>
                  ))}
                </nav>
              )
            ) : (
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
            )}
          </div>
          <div className="fe__bar-group fe__bar-add" data-testid="fe-upload-bar">
            <Link href={openInFiles} className="fe__link" title="Open this folder in the File Explorer" aria-label="Open in Files" data-testid="fe-open-in-files"><FolderOpen size={14} aria-hidden="true" /><span className="fe__btn-label">Open in Files</span></Link>
            {media && namedHere && (
              <>
                <button type="button" className="fe__btn" onClick={() => setFolderForm({ mode: 'rename', name: current?.name ?? '', busy: false, error: null })} disabled={busy !== null} data-testid="fe-media-rename-folder">
                  <Pencil size={15} aria-hidden="true" /><span className="fe__btn-label">Rename</span>
                </button>
                <button type="button" className="fe__btn fe__btn--danger" onClick={() => setConfirmRemove(true)} disabled={busy !== null} data-testid="fe-media-remove-folder">
                  <Trash2 size={15} aria-hidden="true" /><span className="fe__btn-label">Remove folder</span>
                </button>
              </>
            )}
            {uploadRoot && tree && (
              <>
                {newFolderPlace && (
                  <button type="button" className="fe__btn" onClick={() => setFolderForm({ mode: 'new', name: '', busy: false, error: null })} disabled={busy !== null} title="New folder" aria-label="New folder" data-testid="fe-new-folder">
                    <FolderPlus size={15} aria-hidden="true" /><span className="fe__btn-label">New folder</span>
                  </button>
                )}
                {/* Scanning makes a document — not something Photos & videos holds. */}
                {!media && (
                  <button type="button" className="fe__btn" onClick={() => setScanOpen(true)} disabled={busy !== null} title="Scan a document" aria-label="Scan a document" data-testid="fe-scan">
                    <ScanLine size={15} aria-hidden="true" /><span className="fe__btn-label">Scan</span>
                  </button>
                )}
                {/* "Make sure we can clearly see the buttons for uploading files" (owner, 2026-09-15) — still
                    the brightest thing on the row. Dropping files anywhere on the list works too. */}
                {canUpload && <button type="button" className="fe__btn fe__btn--primary" onClick={() => openUpload()} disabled={busy !== null} title={`${media ? 'Add photos or videos' : target ? `Add files to ${target.label}` : 'Add files'} — or drag files anywhere onto the list`} data-testid="fe-upload">
                  <Upload size={15} aria-hidden="true" /> Upload files
                </button>}
              </>
            )}
          </div>
        </div>
        <div className="fe__bar-row">
          <div className="fe__bar-group">
            <SelectAllCheckbox selection={selection} total={viewerNodes.length} />
            <label className="fe__search">
              <Search size={14} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={media ? 'Search photos and videos…' : mode === 'all' ? 'Search every file below…' : 'Search this folder…'} aria-label="Search files" />
              {query && <button type="button" className="fe__search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} aria-hidden="true" /></button>}
            </label>
            {media && (
              <div className="fe__mode fe__kinds" role="group" aria-label="Show">
                {([['image', 'Photos', Camera], ['video', 'Videos', Video]] as const).map(([k, label, Icon]) => {
                  const only = kinds[k] && !kinds[k === 'image' ? 'video' : 'image'];
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`fe__mode-btn${kinds[k] ? ' fe__mode-btn--on' : ''}`}
                      onClick={() => toggleKind(k)}
                      aria-pressed={kinds[k]}
                      title={only ? `${label} stay on — at least one kind is always shown` : kinds[k] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                      data-testid={`fe-kind-${k}`}
                    >
                      <Icon size={14} aria-hidden="true" /> {label}
                    </button>
                  );
                })}
              </div>
            )}
            {!media && <div className="fe__mode" role="group" aria-label="View">
              <button type="button" className={`fe__mode-btn${mode === 'folder' ? ' fe__mode-btn--on' : ''}`} onClick={() => setMode('folder')} aria-pressed={mode === 'folder'} title="Browse folder by folder">
                <Folder size={14} aria-hidden="true" /> This folder
              </button>
              <button type="button" className={`fe__mode-btn${mode === 'all' ? ' fe__mode-btn--on' : ''}`} onClick={() => setMode('all')} aria-pressed={mode === 'all'} title="View all files in this folder and its subfolders" data-testid="fe-all-files">
                <Layers size={14} aria-hidden="true" /> All files{current ? ` (${countUnder(current.id)})` : ''}
              </button>
            </div>}
            <div className="fe__mode" role="group" aria-label="Sort by">
              {([['name', 'A–Z', 'Sort A–Z, numbers in number order'], ['uploaded', 'Newest', 'Newest uploaded first']] as const).map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  className={`fe__mode-btn${sort === id ? ' fe__mode-btn--on' : ''}`}
                  onClick={() => setSort(id)}
                  aria-pressed={sort === id}
                  title={hint}
                  data-testid={`fe-sort-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="fe__views" role="group" aria-label="Preview size">
              {VIEWS.map((v) => {
                const Icon = v.id === 'list' ? ListIcon : v.id === 'small' ? Rows3 : v.id === 'medium' ? Grid2x2 : LayoutGrid;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`fe__view-btn${view === v.id ? ' fe__view-btn--on' : ''}`}
                    onClick={() => chooseView(v.id)}
                    aria-pressed={view === v.id}
                    title={`${v.label} — ${v.hint}`}
                    data-testid={`fe-view-${v.id}`}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span className="fe__view-label">{v.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="fe__bar-group fe__bar-end">
            <DownloadAllButton
              className="fe__btn"
              title={current?.name ?? 'files'}
              label="Download .zip"
              getEntries={zipEntries}
              disabled={loading || viewerNodes.filter((n) => !n.open_href).length === 0}
            />
            <button type="button" className="fe__icon-btn fe__icon-btn--ghost" onClick={() => { setLoading(true); void load(); }} title="Refresh" aria-label="Refresh"><RefreshCw size={15} aria-hidden="true" className={loading ? 'fe__spin motion-essential' : undefined} /></button>
          </div>
        </div>
      </div>

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
        onDragEnter={canUpload ? (e) => { if (!Array.from(e.dataTransfer.types).includes('Files')) return; e.preventDefault(); dragDepth.current += 1; setDragOver(true); } : undefined}
        onDragOver={canUpload ? (e) => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); } : undefined}
        onDragLeave={canUpload ? () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false); } : undefined}
        onDrop={canUpload ? (e) => { e.preventDefault(); dragDepth.current = 0; setDragOver(false); openUpload(Array.from(e.dataTransfer.files)); } : undefined}
      >
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
                  <>
                    {selectHead}
                    {renderFiles(folderFiles)}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {tree && current && mode === 'all' && (
          <div className="fe__all" data-testid="fe-all-view">
            {tree.truncated && <p className="fe__note">This view is capped; open a folder to see the rest.</p>}
            {selectHead}
            {media && mediaFolders.length > 0 && (
              <ul className="fe__tiles m-enter" aria-label="Folders" data-testid="fe-media-folders">
                {mediaFolders.map(({ folder: f, count }, i) => (
                  <li key={f.id} className="m-stagger" style={{ '--i': i } as React.CSSProperties}>
                    <button type="button" className="fe__tile fe__tile--named m-pressable" onClick={() => setCurrentId(f.id)} data-testid="fe-media-folder">
                      <span className="fe__tile-icon">{folderIcon('named')}</span>
                      <span className="fe__tile-body"><span className="fe__tile-name">{f.name}</span></span>
                      <span className="fe__tile-count" aria-label={`${count} shown`}>{count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {groups.every((g) => g.files.length === 0) ? (
              media && mediaFolders.length > 0 ? null : (
                <p className="fe__empty">{q ? 'Nothing below matches.' : media ? (mediaCrumbs.length ? 'Nothing in this folder yet — press Upload files to add some.' : 'No photos or videos yet — press Upload files to add some.') : 'No files in this folder or its subfolders yet.'}</p>
              )
            ) : groups.map((g) => ((q && g.files.length === 0) || (g.folder.id === current.id && g.files.length === 0) || (media && g.files.length === 0 && mediaFolders.length > 0) ? null : (
              <section key={g.folder.id} className="fe__group m-enter" aria-label={g.folder.name}>
                <header className="fe__group-head">
                  <span className="fe__group-icon">{folderIcon(g.folder.folder_key, 16)}</span>
                  <span className="fe__group-path">
                    {(g.folder.id === current.id ? [current.name] : g.folder.path.slice(current.depth)).map((seg, i, arr) => (
                      <span key={i} className={i === arr.length - 1 ? 'fe__group-seg fe__group-seg--last' : 'fe__group-seg'}>{seg.replace(/\s\(\d+\)$/, '')}{i < arr.length - 1 && <ChevronRight size={12} aria-hidden="true" />}</span>
                    ))}
                  </span>
                  <span className="fe__count">{g.files.length}</span>
                  {!media && g.folder.id !== current.id && <button type="button" className="fe__group-open" onClick={() => { setCurrentId(g.folder.id); setMode('folder'); }}>Open folder</button>}
                </header>
                {g.folder.error ? <p className="fe__error">{g.folder.error}</p>
                  : g.files.length === 0 ? <p className="fe__empty fe__empty--tight">{media ? `No ${g.folder.name.toLowerCase()} yet.` : 'Empty'}</p>
                  : renderFiles(g.files)}
              </section>
            )))}
          </div>
        )}

        {dragOver && canUpload && <div className="fe__drop-hint" aria-hidden="true"><Upload size={22} /> Drop to upload{target ? ` into ${target.label}` : ''} — you will choose the folder next</div>}
      </div>

      {extra ? <div className="fe__extra">{extra}</div> : null}

      {uploadRoot && (
        <ScanDialog
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          destinationLabel={target?.label ?? null}
          // The finished scan goes through the same pop-up as any upload, opened on this folder, so
          // it lands here unless the person picks somewhere else.
          onConfirm={(files) => { setScanOpen(false); openUpload(files); }}
        />
      )}

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
      {deleter.element}
    </section>
  );
}
