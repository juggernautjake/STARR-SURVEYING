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
// From `kinds`, NOT `server` — server.ts imports supabaseAdmin, which holds the service-role key
// and must never be reachable from a client component's import graph.
import { FILE_KINDS, kindOf } from '@/lib/files/kinds';
// The cap, the video test and the refusal text — one set of them for every upload surface in the
// app, so the Files area can never drift from what the job page believes. `upload.ts` is pure; it
// does not reach the service-role client the way `files/server.ts` does.
import { MAX_UPLOAD_BYTES, contentTypeForUpload } from '@/lib/files/upload';
import { explainPutFailure, isVideoUpload, megabytes } from '@/lib/storage/uploads';
import { planSplit, describePlan, type SplitPlan } from '@/lib/jobs/video-split';
import { readVideoDuration } from '@/lib/jobs/video-split-run';
import FilePicker, { type PickedNode } from '@/app/admin/components/files/FilePicker';
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
  Users,
  Plus,
  Check,
  Search,
  ExternalLink,
  History,
  RotateCcw,
} from 'lucide-react';

type AccessLevel = 'none' | 'view' | 'download' | 'edit' | 'manage';

/** One line of a node's history, already described by the server. */
interface HistoryEvent {
  id: string;
  action: string;
  label: string;
  detail?: string;
  actor: string;
  at: string;
  /** Present only when the event happened to something INSIDE the folder being viewed. */
  node_name?: string;
}

/** One thing in the bin — a deletion root, never the files that went down with it. */
interface BinEntry {
  id: string;
  name: string;
  node_type: 'folder' | 'file';
  deleted_at: string;
  owner_email: string | null;
  in_folder: string;
  items: number;
}

interface FileNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  access: AccessLevel;
  /** F1 — set on mounted nodes whose natural action is a PAGE rather than a download. Today that is
   *  CAD drawings: `cad_drawings.document` is JSONB in the database, and a `.starr` blob is not what
   *  anyone wants when they click a drawing — opening it in the editor is. */
  open_href?: string;
  /** F4 — who can see this, resolved through the inheritance chain on the server. */
  audience?: {
    kind: 'private' | 'role' | 'people' | 'everyone' | 'unknown';
    label: string;
    detail: string;
  };
}
interface Crumb {
  id: string;
  name: string;
}
/** F2 — a search result is a node plus where it lives. Finding a file and being able to act on it
 *  are different things, and the path is what closes that gap. */
interface SearchHit extends FileNode {
  path: string;
}

interface Grant {
  grantee_type: 'everyone' | 'role' | 'user';
  grantee_value: string | null;
  access_level: 'view' | 'download' | 'edit' | 'manage';
}
interface Person {
  email: string;
  name: string | null;
}
interface RoleOpt {
  value: string;
  label: string;
}

const NODES_DT = 'application/x-fx-nodes';
const rank = (a: AccessLevel) => ['none', 'view', 'download', 'edit', 'manage'].indexOf(a);
const canDownload = (a: AccessLevel) => rank(a) >= rank('download');
const canEdit = (a: AccessLevel) => rank(a) >= rank('edit');
const canManage = (a: AccessLevel) => a === 'manage';

const ACCESS_OPTS: Array<{ value: Grant['access_level']; label: string }> = [
  { value: 'view', label: 'Can view' },
  { value: 'download', label: 'Can download' },
  { value: 'edit', label: 'Can edit' },
  { value: 'manage', label: 'Can manage' },
];
const ACCESS_LABEL: Record<AccessLevel, string> = {
  none: 'No access',
  view: 'View',
  download: 'Download',
  edit: 'Edit',
  manage: 'Manage',
};

const isImage = (m: string | null) => !!m && m.startsWith('image/');
const isPdf = (m: string | null) => m === 'application/pdf';
// A row's stored type is not always a video type even when the file is one — some Android camera
// apps hand over an empty `File.type`, so uploads written before `contentTypeForUpload` existed say
// `application/octet-stream`. The name is checked too, or those files are unplayable forever.
const isVideo = (m: string | null, name?: string) => (!!m && m.startsWith('video/')) || isVideoUpload(name, null);
const isPreviewable = (n: FileNode) =>
  n.node_type === 'file' && (isImage(n.mime_type) || isPdf(n.mime_type) || isVideo(n.mime_type, n.name));

function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) || d.getTime() === 0 ? '—' : d.toLocaleDateString();
}

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
    // An explicit type, because `xhr.send(file)` derives it from `File.type` — which some Android
    // camera apps leave EMPTY for their own recordings. The row would then say
    // `application/octet-stream` and the viewer would have no idea it was holding a video.
    xhr.setRequestHeader('Content-Type', contentTypeForUpload(file.name, file.type));
    xhr.upload.onprogress = (ev) => {
      // `lengthComputable` is false behind some proxies. Falling back to the File's own size keeps
      // the number moving instead of freezing at 0% for a five-minute transfer.
      const total = ev.lengthComputable ? ev.total : file.size;
      if (total > 0) onPct(Math.round((Math.min(ev.loaded, total) / total) * 100));
    };
    xhr.onload = () =>
      (xhr.status >= 200 && xhr.status < 300
        ? resolve()
        // `Upload failed (400)` is what sent the last investigation to the route, which was fine,
        // instead of to the limits, which were not. `explainPutFailure` names the one failure that
        // can still spend a whole transfer — see `lib/storage/uploads.ts`.
        : reject(new Error(explainPutFailure(xhr.status, xhr.responseText, file))));
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
  /** Set when the folder being viewed corresponds to a page — a job folder to its job. */
  const [folderHref, setFolderHref] = useState<string | null>(null);
  // History + bin (2026-08-19).
  const [histFor, setHistFor] = useState<{ id: string; name: string } | null>(null);
  const [histEvents, setHistEvents] = useState<HistoryEvent[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histNote, setHistNote] = useState<string | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [binEntries, setBinEntries] = useState<BinEntry[]>([]);
  const [binBusy, setBinBusy] = useState(false);
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

  /** The oversized-video conversation: measure → confirm → cut → upload. State rather than a
   *  `window.confirm`, because the cut takes a while and has to report progress. `dest` is carried
   *  along so the parts land in the folder the drop happened on, even if the person has since
   *  navigated somewhere else. */
  const [splitState, setSplitState] = useState<{
    file: File;
    dest: string | null;
    plan?: SplitPlan;
    phase: 'measuring' | 'confirm' | 'splitting';
    message: string;
  } | null>(null);

  // Permissions dialog (F7)
  const [permNode, setPermNode] = useState<FileNode | null>(null);
  const [permMode, setPermMode] = useState<'inherit' | 'custom'>('inherit');
  const [permGrants, setPermGrants] = useState<Grant[]>([]);
  const [permInheritedFrom, setPermInheritedFrom] = useState<string | null>(null);
  const [permPreview, setPermPreview] = useState<{ rows: Array<{ email: string; name: string | null; access: AccessLevel }>; everyone: AccessLevel } | null>(null);
  const [permBusy, setPermBusy] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [roleOpts, setRoleOpts] = useState<RoleOpt[]>([]);
  // New-grant draft
  const [draftType, setDraftType] = useState<'everyone' | 'role' | 'user'>('user');
  const [draftValue, setDraftValue] = useState('');
  const [draftLevel, setDraftLevel] = useState<Grant['access_level']>('view');

  // ── THE FOLDER THAT WINS IS THE ONE ASKED FOR LAST, NOT THE ONE THAT ANSWERS LAST ────────────
  //
  // `?node=` is read in an effect, so the first render always loads the ROOT and the deep-linked
  // folder is only requested on the next pass. Two requests are therefore in flight at once, and
  // `fetch` promises nothing about the order they resolve in — whichever landed last used to write
  // its listing into state and keep it.
  //
  // That is not a theoretical race. It was measured: `/admin/files?node=mnt:jobs:<id>` rendered the
  // ROOT listing, because root is one cheap query and a job folder is five, so the root response
  // overtook the folder it was supposed to be replaced by. The symptom is the worst kind — the deep
  // link looks like it simply does nothing, and the folder it opened is nowhere on screen.
  //
  // So every load takes a ticket, and only the newest ticket may touch state. A superseded response
  // is discarded entirely, including its `setLoading(false)` — otherwise a stale answer clears the
  // spinner while the folder the user actually asked for is still loading.
  const loadSeq = useRef(0);

  const load = useCallback(async (pid: string | null) => {
    const seq = ++loadSeq.current;
    const current = () => loadSeq.current === seq;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/files?parent=${encodeURIComponent(pid ?? 'root')}`);
    if (!current()) return;
    if (!res.ok) {
      setLoading(false);
      setError(await errOf(res, 'Failed to load files.'));
      setNodes([]);
      return;
    }
    const data = await res.json();
    if (!current()) return;
    setLoading(false);
    setNodes(data.nodes ?? []);
    setBreadcrumb(data.breadcrumb ?? []);
    setParentAccess(data.parent_access ?? 'view');
    // A job folder is a view of a job; this is the page it belongs to.
    setFolderHref(data.open_href ?? null);
  }, []);

  useEffect(() => {
    load(parentId);
    setSelected(new Set()); // selection is per-folder
  }, [parentId, load]);

  // ── ?node= — so anything can link INTO a folder ───────────────────────────────────────────────
  //
  // Without this the explorer was only reachable at its root, so "this job's files" could be
  // described but never linked to, and every cross-reference in the product had to end with an
  // instruction to click through the tree. Read once on mount from `window.location` rather than
  // `useSearchParams`, which would require wrapping this page in a Suspense boundary for a value
  // that is only consulted at startup.
  useEffect(() => {
    const node = new URLSearchParams(window.location.search).get('node');
    if (node) setParentId(node);
  }, []);

  // ── F2/F3 — search + format filters ──────────────────────────────────────────────────────────
  //
  // Search is a MODE, not a filter on the current folder: it spans the whole tree plus the mounts,
  // so "where is that file" is answerable without knowing where to look. `searchHits === null`
  // means browse; an array means search, including an empty array, which is a real answer and must
  // not fall back to showing the folder.
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    // Under two characters is browse mode, not an empty search — clearing the box must put the
    // folder back rather than leaving a blank results list.
    if (term.length < 2) {
      setSearchHits(null);
      setSearchNote(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const p = new URLSearchParams({ q: term });
          for (const k of kinds) p.append('kind', k);
          const res = await fetch(`/api/admin/files/search?${p.toString()}`);
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) { setError(data?.error ?? 'Search failed.'); setSearchHits([]); return; }
          setSearchHits(data.hits ?? []);
          // Said plainly when the result is incomplete. A truncated list that looks complete is how
          // somebody concludes a file does not exist.
          setSearchNote(
            data.truncated || data.mount_capped
              ? 'Showing the closest matches — narrow the search if what you want is not here.'
              : null,
          );
        } catch {
          if (!cancelled) { setSearchHits([]); setSearchNote(null); }
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, kinds]);

  /** What the table shows: search results when searching, otherwise the current folder. Kind
   *  filters apply to browsing too, so the control means the same thing in both modes. */
  const visibleNodes: FileNode[] = searchHits
    ?? (kinds.length === 0
      ? nodes
      : nodes.filter((n) => n.node_type === 'file' && kinds.includes(kindOf(n.mime_type, n.name))));

  const canWriteHere = canEdit(parentAccess);

  // ---- uploads -----------------------------------------------------------
  /**
   * Put one batch of bytes in storage. Every file here has already been checked against the cap by
   * `startUpload`, so nothing in this loop needs to think about size.
   */
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
            // The DERIVED type, matching the header the bytes were sent with. Storing `file.type`
            // here would record an empty string for an Android recording and leave the viewer
            // unable to tell a video from a blob.
            body: JSON.stringify({
              parent_id: destId,
              name: file.name,
              path,
              mime_type: contentTypeForUpload(file.name, file.type),
              size_bytes: file.size,
            }),
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

  /**
   * ── THE OVERSIZE CONVERSATION, THE SAME ONE THE JOB PAGE HAS (2026-08-22) ─────────────────────
   *
   * Owner: *"I need to know that video uploading for files and for projects/jobs allows us to
   * upload longer videos successfully."*
   *
   * Files that fit go straight up. A file that does not is answered BEFORE a byte moves, and how
   * depends on what it is:
   *
   *   a video      → measure it, plan the cut, ask, then remux into parts that fit
   *   anything else → say the number, because there is nothing sensible to cut
   *
   * The planner and the remuxer are `lib/jobs/video-split*`, already used by the job page and
   * already tested. They are named for jobs and are not about jobs — nothing in either module knows
   * what a job is, and a walkthrough filed in the Files area needs the same cut as one filed on the
   * job it came from. Duplicating them for a second caller is how the caps came to disagree.
   */
  const startUpload = useCallback(
    async (list: File[], destId: string | null) => {
      if (list.length === 0) return;
      const fits = list.filter((f) => f.size <= MAX_UPLOAD_BYTES);
      const tooBig = list.filter((f) => f.size > MAX_UPLOAD_BYTES);

      // The ones that fit go first: a 700 MB video in the selection must not hold up four drawings.
      if (fits.length) await uploadFiles(fits, destId);
      if (tooBig.length === 0) return;

      const notVideo = tooBig.filter((f) => !isVideoUpload(f.name, f.type));
      if (notVideo.length) {
        setError(
          `${notVideo.map((f) => `"${f.name}"`).join(', ')} `
          + `${notVideo.length === 1 ? 'is' : 'are'} larger than ${megabytes(MAX_UPLOAD_BYTES)} MB, `
          + 'which is the limit for one file.',
        );
      }

      // One at a time — cutting is a conversation, and two dialogs at once is nobody's idea of one.
      const video = tooBig.find((f) => isVideoUpload(f.name, f.type));
      if (!video) return;
      setSplitState({ file: video, dest: destId, phase: 'measuring', message: 'Checking how long this video is…' });
      const durationSec = await readVideoDuration(video);
      const plan = planSplit({ sizeBytes: video.size, durationSec, capBytes: MAX_UPLOAD_BYTES, name: video.name });
      if (!plan.needed || plan.parts.length === 0) {
        setSplitState(null);
        setError(describePlan(plan, video.size, MAX_UPLOAD_BYTES) || 'That video cannot be stored.');
        return;
      }
      setSplitState({
        file: video,
        dest: destId,
        plan,
        phase: 'confirm',
        message: describePlan(plan, video.size, MAX_UPLOAD_BYTES),
      });
    },
    [uploadFiles],
  );

  /** The person said yes: cut the file, then hand the parts to the ordinary upload path. */
  const runSplit = useCallback(async () => {
    if (!splitState?.plan) return;
    const { file, plan, dest } = splitState;
    setSplitState({ ...splitState, phase: 'splitting', message: 'Preparing to cut the video…' });
    const { splitVideo } = await import('@/lib/jobs/video-split-run');
    const outcome = await splitVideo(file, plan.parts, (p) =>
      setSplitState((s) => (s ? { ...s, message: `Cutting part ${p.part} of ${p.total}… ${p.pct}%` } : s)));
    setSplitState(null);
    if (!outcome.ok || !outcome.files) {
      setError(outcome.error ?? 'The video could not be split.');
      return;
    }
    // A cut lands on a keyframe, not on the requested second, so a recording with sparse keyframes
    // can still produce a piece over the cap. Checked here, before the transfer rather than after.
    const over = outcome.files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (over) {
      setError(
        `The video was cut, but "${over.name}" is still ${megabytes(over.size)} MB — over the `
        + `${megabytes(MAX_UPLOAD_BYTES)} MB limit, because this recording's keyframes are far apart. `
        + 'Please record at a lower resolution, or in shorter clips.',
      );
      return;
    }
    await uploadFiles(outcome.files, dest);
  }, [splitState, uploadFiles]);

  async function onUploadInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length) await startUpload(Array.from(files), parentId);
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
    if (n.node_type === 'folder') { setParentId(n.id); return; }
    // F1 — checked BEFORE preview and download. A drawing is `application/json`, so without this it
    // would fall through to `download()` and hand somebody a .starr blob when what they wanted was
    // to open the drawing. Ordinary files have no `open_href` and are unaffected.
    if (n.open_href) { window.location.href = n.open_href; return; }
    if (isPreviewable(n)) openViewer(n);
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
    // The old copy promised "this can be undone by an admin", which was not true of any screen that
    // existed — deletes were soft in the database and unreachable everywhere else. Now that the bin
    // is real, the prompt names where the thing actually goes.
    if (!window.confirm(`Delete "${n.name}"${n.node_type === 'folder' ? ' and everything inside it' : ''}? You can restore it from the bin.`)) return;
    const res = await fetch(`/api/admin/files/${n.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(await errOf(res, 'Could not delete.'));
      return;
    }
    load(parentId);
  }

  // ---- history (2026-08-19) ---------------------------------------------
  //
  // Opened per node, and for the folder being viewed. A folder's own record is nearly empty by
  // nature, so the endpoint folds in what happened to its contents — which is the question somebody
  // standing in a folder actually has.
  async function openHistory(n: { id: string; name: string }) {
    setHistFor(n);
    setHistBusy(true);
    setHistEvents([]);
    setHistNote(null);
    const res = await fetch(`/api/admin/files/${encodeURIComponent(n.id)}/history`);
    setHistBusy(false);
    if (!res.ok) {
      setHistFor(null);
      setError(await errOf(res, 'Could not load the history.'));
      return;
    }
    const data = await res.json();
    setHistEvents(data.events ?? []);
    setHistNote(data.note ?? null);
  }

  // ---- the bin (2026-08-19) ---------------------------------------------
  const loadBin = useCallback(async () => {
    setBinBusy(true);
    const res = await fetch('/api/admin/files/bin');
    setBinBusy(false);
    if (!res.ok) {
      setError(await errOf(res, 'Could not open the bin.'));
      return;
    }
    setBinEntries((await res.json()).entries ?? []);
  }, []);

  async function openBin() {
    setBinOpen(true);
    await loadBin();
  }

  async function restoreFromBin(e: BinEntry) {
    setBinBusy(true);
    const res = await fetch(`/api/admin/files/bin/${encodeURIComponent(e.id)}`, { method: 'POST' });
    setBinBusy(false);
    if (!res.ok) {
      setError(await errOf(res, 'Could not restore that item.'));
      return;
    }
    const data = await res.json();
    // Saying so is the point: a file that reappears under a name nobody chose reads as the wrong
    // file having been restored.
    if (data.renamed) {
      setError(`"${e.name}" came back as "${data.name}" — something with its old name is already there.`);
    }
    await loadBin();
    load(parentId);
  }

  async function purgeFromBin(e: BinEntry) {
    if (!window.confirm(`Permanently delete "${e.name}"${e.items ? ` and ${e.items} item(s) inside it` : ''}? This cannot be undone.`)) return;
    setBinBusy(true);
    const res = await fetch(`/api/admin/files/bin/${encodeURIComponent(e.id)}`, { method: 'DELETE' });
    setBinBusy(false);
    if (!res.ok) {
      setError(await errOf(res, 'Could not permanently delete that item.'));
      return;
    }
    await loadBin();
  }

  // ---- permissions dialog (F7) ------------------------------------------
  async function openPerms(n: FileNode) {
    setPermError(null);
    setPermPreview(null);
    const res = await fetch(`/api/admin/files/${n.id}/permissions`);
    if (!res.ok) {
      setError(await errOf(res, 'You cannot manage this item’s permissions.'));
      return;
    }
    const data = await res.json();
    setPermNode(n);
    setPermMode(data.node.permission_mode ?? 'inherit');
    setPermGrants((data.grants ?? []) as Grant[]);
    setPermInheritedFrom(data.inheritedFrom ?? null);
    setDraftType('user');
    setDraftValue('');
    setDraftLevel('view');
    if (people.length === 0 || roleOpts.length === 0) {
      const pr = await fetch('/api/admin/files/people');
      if (pr.ok) {
        const pd = await pr.json();
        setPeople(pd.people ?? []);
        setRoleOpts(pd.roles ?? []);
      }
    }
  }

  const closePerms = useCallback(() => {
    setPermNode(null);
    setPermPreview(null);
    setPermError(null);
  }, []);

  // Esc closes the permissions dialog.
  useEffect(() => {
    if (!permNode) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePerms();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [permNode, closePerms]);

  // Live "who can access" preview whenever the staged grants/mode change.
  useEffect(() => {
    if (!permNode) return undefined;
    let cancelled = false;
    const run = async () => {
      const res = await fetch(`/api/admin/files/${permNode.id}/permissions/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission_mode: permMode, grants: permMode === 'custom' ? permGrants : [] }),
      });
      if (!res.ok || cancelled) return;
      setPermPreview(await res.json());
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [permNode, permMode, permGrants]);

  function addDraftGrant() {
    if (draftType !== 'everyone' && !draftValue) {
      setPermError(draftType === 'role' ? 'Pick a role.' : 'Pick a person.');
      return;
    }
    setPermError(null);
    const value = draftType === 'everyone' ? null : draftValue;
    setPermGrants((gs) => {
      const without = gs.filter((g) => !(g.grantee_type === draftType && (g.grantee_value ?? '') === (value ?? '')));
      return [...without, { grantee_type: draftType, grantee_value: value, access_level: draftLevel }];
    });
    setDraftValue('');
  }
  function removeGrant(i: number) {
    setPermGrants((gs) => gs.filter((_, idx) => idx !== i));
  }
  function setGrantLevel(i: number, level: Grant['access_level']) {
    setPermGrants((gs) => gs.map((g, idx) => (idx === i ? { ...g, access_level: level } : g)));
  }

  function grantLabel(g: Grant): string {
    if (g.grantee_type === 'everyone') return 'Everyone (signed in)';
    if (g.grantee_type === 'role') return roleOpts.find((r) => r.value === g.grantee_value)?.label ?? `Role: ${g.grantee_value}`;
    const p = people.find((x) => x.email === g.grantee_value);
    return p ? `${p.name ?? p.email}` : (g.grantee_value ?? 'User');
  }

  async function savePerms() {
    if (!permNode) return;
    setPermBusy(true);
    setPermError(null);
    const res = await fetch(`/api/admin/files/${permNode.id}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission_mode: permMode, grants: permMode === 'custom' ? permGrants : [] }),
    });
    setPermBusy(false);
    if (!res.ok) {
      setPermError(await errOf(res, 'Could not save permissions.'));
      return;
    }
    closePerms();
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

  // ── F5 — "Move to…" via the shared picker ────────────────────────────────────────────────────
  //
  // The first adopter of `FilePicker`, and chosen because it needs no schema change and closes a
  // real gap: moving something used to mean either dragging it onto a visible folder, or cut →
  // navigate → paste. Dragging does not exist on a touch screen, and cut-navigate-paste asks you to
  // hold a destination in your head while walking there. Picking the destination is one step.
  const [movePickerOpen, setMovePickerOpen] = useState(false);

  const moveSelectedTo = useCallback(async (dest: PickedNode) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/admin/files/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: dest.id }),
        });
        if (!res.ok) {
          // Stop at the first failure rather than pressing on. A half-moved selection is worse than
          // an unmoved one: the person has to work out which items went and which did not.
          setError(await errOf(res, 'Could not move an item.'));
          break;
        }
      }
      setSelected(new Set());
      await load(parentId);
    } finally {
      setBusy(false);
    }
  }, [selected, parentId, load]);

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
      startUpload(Array.from(files), parentId);
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
          <button type="button" className="fx-btn fx-btn--ghost" onClick={openBin} disabled={busy} data-testid="fx-bin-open">
            <Trash2 size={16} /> Bin
          </button>
          <button type="button" className="fx-btn fx-btn--ghost" onClick={createFolder} disabled={!canWriteHere || busy} data-testid="fx-new-folder">
            <FolderPlus size={16} /> New folder
          </button>
          <label className={`fx-btn ${canWriteHere && !busy ? '' : 'fx-btn--disabled'}`} data-testid="fx-upload-label">
            <Upload size={16} /> Upload
            <input type="file" multiple onChange={onUploadInput} disabled={!canWriteHere || busy} style={{ display: 'none' }} data-testid="fx-upload-input" />
          </label>
        </div>
      </header>

      {/* F2/F3 — search + format filters. Above the breadcrumb because search REPLACES the folder
          view: it spans the whole tree and the mounts, so it is not a filter on where you are. */}
      <div className="fx__search">
        <div className="fx__search-box">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all files and folders…"
            aria-label="Search files"
            data-testid="fx-search"
          />
          {query ? (
            <button
              type="button"
              className="fx__icon-btn"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="fx__kinds" role="group" aria-label="Filter by file type">
          {FILE_KINDS.map((k) => {
            const on = kinds.includes(k.id);
            return (
              <button
                key={k.id}
                type="button"
                className={`fx__kind${on ? ' fx__kind--on' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  setKinds((cur) => (on ? cur.filter((c) => c !== k.id) : [...cur, k.id]))
                }
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {searchHits !== null ? (
        <p className="fx__search-status" role="status">
          {searching
            ? 'Searching…'
            : searchHits.length === 0
              ? `Nothing matches “${query.trim()}”.`
              : `${searchHits.length} ${searchHits.length === 1 ? 'match' : 'matches'}`}
          {searchNote ? ` — ${searchNote}` : ''}
        </p>
      ) : null}

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
        {/* A job folder's own page. Deliberately NOT wired to the folder's name click — clicking a
            folder must open the folder, and a name that sometimes navigates away instead would make
            the folder unopenable. */}
        {folderHref && (
          <a className="fx__crumb fx__crumb--open" href={folderHref} data-testid="fx-open-source">
            <ExternalLink size={13} aria-hidden /> Open the job
          </a>
        )}
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
                {/* F5 — the shared picker's first adopter. Cut/paste still works; this is the
                    one-step version, and the only one that works without a mouse. */}
                <button type="button" className="fx-chip" onClick={() => setMovePickerOpen(true)} disabled={busy} data-testid="fx-move-to">
                  <FolderPlus size={15} /> Move to…
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
      ) : visibleNodes.length === 0 ? (
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
                onChange={() => setSelected(allSelected ? new Set() : new Set(visibleNodes.map((n) => n.id)))}
                aria-label="Select all"
                data-testid="fx-select-all"
              />
            </span>
            <span className="fx__col">Name</span>
            <span className="fx__col fx__col--meta">Size</span>
            <span className="fx__col fx__col--meta">Modified</span>
            <span />
          </li>
          {visibleNodes.map((n) => {
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
                  <span className="fx__name-text">
                    {n.name}
                    {/* F2 — where the hit lives. Only in search results: in browse mode you are
                        already standing in the folder, and repeating it would be noise. A result
                        you cannot locate is only half an answer. */}
                    {searchHits !== null && 'path' in n && (n as SearchHit).path ? (
                      <span className="fx__hit-path">{(n as SearchHit).path}</span>
                    ) : null}
                    {/* F4 — who can see this. Inside the name cell rather than as a sixth grid
                        column, so the row's 5-column template (and its mobile collapse) stays
                        exactly as it was.

                        FOLDERS only. A folder is what people put things into, so it is the decision
                        point; badging every file as well would make a wall of chips and train the
                        eye to skip them — including on the folder where it mattered. */}
                    {isFolder && n.audience ? (
                      <span
                        className={`fx__aud fx__aud--${n.audience.kind}`}
                        title={n.audience.detail}
                      >
                        {n.audience.label}
                      </span>
                    ) : null}
                  </span>
                </button>
                <span className="fx__meta">{isFolder ? 'Folder' : formatSize(n.size_bytes)}</span>
                <span className="fx__meta fx__meta--date">{formatDate(n.updated_at)}</span>
                <span className="fx__row-actions">
                  {!isFolder && canDownload(n.access) && (
                    <button type="button" className="fx__icon-btn" onClick={() => download(n)} title="Download" aria-label={`Download ${n.name}`}>
                      <Download size={16} />
                    </button>
                  )}
                  {canManage(n.access) && (
                    <button type="button" className="fx__icon-btn" onClick={() => openPerms(n)} title="Permissions" aria-label={`Permissions for ${n.name}`} data-testid={`fx-perms-${n.id}`}>
                      <Users size={16} />
                    </button>
                  )}
                  {canEdit(n.access) && (
                    <button type="button" className="fx__icon-btn" onClick={() => duplicate(n)} title="Duplicate" aria-label={`Duplicate ${n.name}`}>
                      <CopyPlus size={16} />
                    </button>
                  )}
                  {/* Not gated on edit: if you can see the item you can see what happened to it.
                      The endpoint applies the same rule, so this is a matching affordance rather
                      than a second, weaker gate. Mounts are read-only views of other systems and
                      have no history of their own. */}
                  {!n.id.startsWith('mnt:') && (
                    <button type="button" className="fx__icon-btn" onClick={() => openHistory(n)} title="History" aria-label={`History for ${n.name}`} data-testid={`fx-history-${n.id}`}>
                      <History size={16} />
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

      {/* F5 — destination picker for "Move to…". `excludeIds` carries the selection itself: a
          folder cannot be moved into itself, and offering that as a choice invites an error the
          API would have to reject anyway. (Moving a folder into its own DESCENDANT is refused
          server-side, which is where a cycle check belongs — the client cannot know the subtree
          without fetching it.) */}
      <FilePicker
        open={movePickerOpen}
        onClose={() => setMovePickerOpen(false)}
        onPick={(dest) => void moveSelectedTo(dest)}
        mode="folder"
        title={`Move ${selected.size} item${selected.size === 1 ? '' : 's'}`}
        actionLabel="Move here"
        excludeIds={[...selected]}
      />

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
            ) : isVideo(viewer.node.mime_type, viewer.node.name) ? (
              // The browser's own transport: scrubbing, volume, fullscreen, picture-in-picture and
              // captions all work correctly there, on a phone as well as a desktop. `preload
              // ="metadata"` so opening a 500 MB walkthrough fetches its header, not the film.
              <video
                src={viewer.url}
                className="fx__viewer-video"
                controls
                autoPlay
                playsInline
                preload="metadata"
                data-testid="fx-viewer-video"
              />
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

      {splitState && (
        <div className="fx__modal" role="alertdialog" aria-modal="true" aria-label="This video must be split" data-testid="fx-split-dialog">
          <div className="fx__sheet fx__split">
            <div className="fx__sheet-head">
              <div>
                <h2 className="fx__sheet-title">This video is too big to store as one file</h2>
                <p className="fx__sheet-sub">{splitState.file.name}</p>
              </div>
            </div>
            <div className="fx__sheet-body">
              <p className="fx__split-msg">{splitState.message}</p>
            </div>
            {splitState.phase === 'confirm' && (
              <div className="fx__sheet-foot">
                <button type="button" className="fx-btn fx-btn--ghost" onClick={() => setSplitState(null)} data-testid="fx-split-cancel">
                  Cancel
                </button>
                <button type="button" className="fx-btn" onClick={() => void runSplit()} data-testid="fx-split-confirm">
                  Split and upload
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {permNode && (
        <div
          className="fx__modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Permissions for ${permNode.name}`}
          data-testid="fx-perms-dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePerms();
          }}
        >
          <div className="fx__sheet">
            <div className="fx__sheet-head">
              <div>
                <h2 className="fx__sheet-title">Permissions</h2>
                <p className="fx__sheet-sub">{permNode.name}</p>
              </div>
              <button type="button" className="fx__icon-btn" onClick={closePerms} aria-label="Close" data-testid="fx-perms-close">
                <X size={18} />
              </button>
            </div>

            <div className="fx__sheet-body">
              {/* Inherit vs custom */}
              <div className="fx__seg" role="radiogroup" aria-label="Permission mode">
                <button type="button" role="radio" aria-checked={permMode === 'inherit'} className={`fx__seg-opt${permMode === 'inherit' ? ' is-on' : ''}`} onClick={() => setPermMode('inherit')}>
                  Inherit
                </button>
                <button type="button" role="radio" aria-checked={permMode === 'custom'} className={`fx__seg-opt${permMode === 'custom' ? ' is-on' : ''}`} onClick={() => setPermMode('custom')} data-testid="fx-perms-custom">
                  Custom
                </button>
              </div>
              {permMode === 'inherit' ? (
                <p className="fx__hint">
                  Inherits access from {permInheritedFrom ? <strong>{permInheritedFrom}</strong> : 'the top level'}. The owner and admins
                  always have full access.
                </p>
              ) : (
                <p className="fx__hint">Only the people and roles below (plus the owner and admins) can reach this item.</p>
              )}

              {permMode === 'custom' && (
                <>
                  <ul className="fx__grants" data-testid="fx-grant-list">
                    {permGrants.length === 0 && <li className="fx__grant fx__grant--empty">No one added yet — it’s private to the owner and admins.</li>}
                    {permGrants.map((g, i) => (
                      <li key={`${g.grantee_type}:${g.grantee_value ?? ''}`} className="fx__grant">
                        <span className="fx__grant-who" title={g.grantee_type === 'user' ? g.grantee_value ?? '' : undefined}>
                          {grantLabel(g)}
                          <span className="fx__grant-kind">{g.grantee_type === 'everyone' ? 'everyone' : g.grantee_type}</span>
                        </span>
                        <select className="fx__select" value={g.access_level} onChange={(e) => setGrantLevel(i, e.target.value as Grant['access_level'])} aria-label={`Access for ${grantLabel(g)}`}>
                          {ACCESS_OPTS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <button type="button" className="fx__icon-btn fx__icon-btn--danger" onClick={() => removeGrant(i)} aria-label={`Remove ${grantLabel(g)}`}>
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* Add grant */}
                  <div className="fx__add">
                    <select className="fx__select" value={draftType} onChange={(e) => { setDraftType(e.target.value as 'everyone' | 'role' | 'user'); setDraftValue(''); }} aria-label="Who to add">
                      <option value="user">Specific person</option>
                      <option value="role">Role</option>
                      <option value="everyone">Everyone</option>
                    </select>
                    {draftType === 'user' && (
                      <select className="fx__select fx__select--grow" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} aria-label="Person">
                        <option value="">Choose person…</option>
                        {people.map((p) => (
                          <option key={p.email} value={p.email}>{p.name ?? p.email}</option>
                        ))}
                      </select>
                    )}
                    {draftType === 'role' && (
                      <select className="fx__select fx__select--grow" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} aria-label="Role">
                        <option value="">Choose role…</option>
                        {roleOpts.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    )}
                    {draftType === 'everyone' && <span className="fx__select--grow fx__hint" style={{ margin: 0 }}>Everyone signed in</span>}
                    <select className="fx__select" value={draftLevel} onChange={(e) => setDraftLevel(e.target.value as Grant['access_level'])} aria-label="Access level">
                      {ACCESS_OPTS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button type="button" className="fx-btn fx-btn--ghost" onClick={addDraftGrant} data-testid="fx-grant-add">
                      <Plus size={15} /> Add
                    </button>
                  </div>
                </>
              )}

              {/* Who can access */}
              <div className="fx__preview">
                <h3 className="fx__preview-title">Who can access</h3>
                {!permPreview ? (
                  <p className="fx__hint">Calculating…</p>
                ) : (
                  <ul className="fx__preview-list">
                    <li className="fx__preview-row">
                      <span>Everyone else (signed in)</span>
                      <span className={`fx__badge fx__badge--${permPreview.everyone}`}>{ACCESS_LABEL[permPreview.everyone]}</span>
                    </li>
                    {permPreview.rows
                      .filter((r) => r.access !== 'none')
                      .map((r) => (
                        <li key={r.email} className="fx__preview-row">
                          <span title={r.email}>{r.name ?? r.email}</span>
                          <span className={`fx__badge fx__badge--${r.access}`}>{ACCESS_LABEL[r.access]}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {permError && <p className="fx__error" role="alert">{permError}</p>}
            </div>

            <div className="fx__sheet-foot">
              <button type="button" className="fx-btn fx-btn--ghost" onClick={closePerms} disabled={permBusy}>Cancel</button>
              <button type="button" className="fx-btn" onClick={savePerms} disabled={permBusy} data-testid="fx-perms-save">
                <Check size={16} /> {permBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History ──────────────────────────────────────────────────────────────────────────── */}
      {histFor && (
        <div
          className="fx__modal"
          role="dialog"
          aria-modal="true"
          aria-label={`History for ${histFor.name}`}
          data-testid="fx-history-dialog"
          onClick={(e) => { if (e.target === e.currentTarget) setHistFor(null); }}
        >
          <div className="fx__sheet">
            <div className="fx__sheet-head">
              <div>
                <h2 className="fx__sheet-title">History</h2>
                <p className="fx__sheet-sub">{histFor.name}</p>
              </div>
              <button type="button" className="fx__icon-btn" onClick={() => setHistFor(null)} aria-label="Close" data-testid="fx-history-close">
                <X size={18} />
              </button>
            </div>
            <div className="fx__sheet-body">
              {histBusy && <p className="fx__hist-empty">Loading…</p>}
              {!histBusy && histNote && <p className="fx__hist-empty">{histNote}</p>}
              {!histBusy && !histNote && histEvents.length === 0 && (
                // Said plainly, because "nothing here" and "tracking is broken" look identical
                // otherwise — and in this codebase that has been the true answer before.
                <p className="fx__hist-empty">
                  Nothing has been recorded for this item yet. Changes made from now on will appear here.
                </p>
              )}
              {!histBusy && histEvents.length > 0 && (
                <ol className="fx__hist" data-testid="fx-history-list">
                  {histEvents.map((ev) => (
                    <li key={ev.id} className="fx__hist-item">
                      <div className="fx__hist-line">
                        <span className="fx__hist-label">{ev.label}</span>
                        {ev.node_name && <span className="fx__hist-node">{ev.node_name}</span>}
                        {ev.detail && <span className="fx__hist-detail">{ev.detail}</span>}
                      </div>
                      <div className="fx__hist-meta">
                        {ev.actor} · {new Date(ev.at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── The bin ──────────────────────────────────────────────────────────────────────────── */}
      {binOpen && (
        <div
          className="fx__modal"
          role="dialog"
          aria-modal="true"
          aria-label="Deleted items"
          data-testid="fx-bin-dialog"
          onClick={(e) => { if (e.target === e.currentTarget) setBinOpen(false); }}
        >
          <div className="fx__sheet">
            <div className="fx__sheet-head">
              <div>
                <h2 className="fx__sheet-title">Bin</h2>
                <p className="fx__sheet-sub">Deleted files and folders you can restore</p>
              </div>
              <button type="button" className="fx__icon-btn" onClick={() => setBinOpen(false)} aria-label="Close" data-testid="fx-bin-close">
                <X size={18} />
              </button>
            </div>
            <div className="fx__sheet-body">
              {binBusy && <p className="fx__hist-empty">Working…</p>}
              {!binBusy && binEntries.length === 0 && (
                <p className="fx__hist-empty">The bin is empty.</p>
              )}
              {!binBusy && binEntries.length > 0 && (
                <ul className="fx__bin" data-testid="fx-bin-list">
                  {binEntries.map((e) => (
                    <li key={e.id} className="fx__bin-item">
                      <div className="fx__bin-main">
                        <span className="fx__bin-name">
                          {e.node_type === 'folder' ? <Folder size={15} aria-hidden /> : <FileText size={15} aria-hidden />}
                          {e.name}
                        </span>
                        <span className="fx__bin-meta">
                          {/* Where it goes back to, and how much comes with it: "restore" is a
                              promise about a destination. */}
                          from {e.in_folder}
                          {e.items > 0 && ` · ${e.items} item${e.items === 1 ? '' : 's'} inside`}
                          {' · '}deleted {new Date(e.deleted_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="fx__bin-actions">
                        <button type="button" className="fx-chip" onClick={() => restoreFromBin(e)} disabled={binBusy} data-testid={`fx-bin-restore-${e.id}`}>
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button type="button" className="fx-chip fx-chip--danger" onClick={() => purgeFromBin(e)} disabled={binBusy} data-testid={`fx-bin-purge-${e.id}`}>
                          <Trash2 size={14} /> Delete forever
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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

  /* Height from the token: padding arithmetic put this at 43px beside the 40px toolbar it sits on. */
  .fx-btn { display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-weight: 700; font-size: 0.9rem; min-height: var(--button-height); box-sizing: border-box; padding: 0 0.9rem; background: #1D3095; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
  .fx-btn:hover:not(:disabled):not(.fx-btn--disabled) { background: #16266f; }
  .fx-btn--ghost { background: #fff; color: #1D3095; border: 1px solid #d6d9e3; }
  .fx-btn--ghost:hover:not(:disabled) { background: rgba(29,48,149,0.05); }
  .fx-btn--paste { background: #BD1218; }
  .fx-btn--paste:hover:not(:disabled) { background: #9d0f14; }
  .fx-btn:disabled, .fx-btn--disabled { opacity: 0.5; cursor: not-allowed; }

  .fx__crumb--open { margin-left: auto; display: inline-flex; align-items: center; gap: 0.3rem; text-decoration: none; color: var(--color-brand-navy, #1E3A5F); font-weight: 600; }
  .fx__crumb--open:hover { text-decoration: underline; }
  .fx__crumbs { max-width: 1100px; margin: 0 auto 0.85rem; display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; font-size: 0.9rem; }
  .fx__crumb-wrap { display: inline-flex; align-items: center; gap: 0.15rem; }
  /* A breadcrumb is how you go back up, and at 29px tall it was the hardest thing on the page to
     hit on a phone. 36px keeps the trail compact while being aimable. */
  .fx__crumb { display: inline-flex; align-items: center; min-height: 36px; gap: 0.3rem; background: none; border: none; cursor: pointer; color: #1D3095; font: inherit; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 6px; }
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
  /* 257×32 measured on a phone (2026-08-22). This is the control that OPENS a file — the most
     tapped thing on the page — and it sat under the 40px a thumb needs. The row grows with it. */
  .fx__name { display: flex; align-items: center; gap: 0.6rem; min-width: 0; min-height: 40px; background: none; border: none; cursor: pointer; font: inherit; color: #152050; text-align: left; padding: 0.2rem 0; }
  /* F2 — was nowrap+ellipsis on one line. It now wraps a second line (the search hit path),
     so the truncation moved to the first line only via the child rule below. */
  .fx__name-text { min-width: 0; overflow: hidden; font-weight: 500; }
  .fx__name:hover .fx__name-text { color: #1D3095; text-decoration: underline; }
  .fx__icon { color: #6b7280; flex-shrink: 0; }
  .fx__icon--folder { color: #1D3095; }
  .fx__meta { font-size: 0.82rem; color: #6b7280; font-variant-numeric: tabular-nums; }
  .fx__row-actions { display: inline-flex; gap: 0.15rem; justify-content: flex-end; }
  /* admin-ui-alignment-2026-08-15 — 27px was under the 28px floor in the styling contract: a row
   * action nobody can reliably hit, six of them per file. The small control token is the
   * contract's answer for an in-row action, and it is a square, so width follows height. */
  .fx__icon-btn { background: none; border: none; cursor: pointer; color: #6b7280; width: var(--button-height-sm); height: var(--button-height-sm); box-sizing: border-box; padding: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; }
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
  .fx__viewer-video { max-width: 100%; max-height: 100%; border-radius: 8px; background: #000; }
  .fx__split { max-width: 32rem; }
  .fx__split-msg { margin: 0; line-height: 1.55; white-space: pre-line; color: #1b2559; }
  .fx__viewer-frame { width: 100%; height: 100%; border: none; border-radius: 8px; background: #fff; }
  .fx__viewer-fallback { background: #fff; color: #152050; border-radius: 14px; padding: 2rem 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }

  .fx__modal { position: fixed; inset: 0; background: rgba(21,32,80,0.5); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 1rem; }
  .fx__sheet { background: #fff; border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 18px 50px rgba(21,32,80,0.3); }
  .fx__sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem 0.75rem; border-bottom: 1px solid #eef0f5; }
  .fx__sheet-title { font-family: 'Sora', sans-serif; font-size: 1.15rem; font-weight: 700; margin: 0; }
  .fx__sheet-sub { margin: 0.15rem 0 0; color: #6b7280; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 24rem; }
  .fx__sheet-body { padding: 1rem 1.25rem; overflow-y: auto; }
  .fx__sheet-foot { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.85rem 1.25rem; border-top: 1px solid #eef0f5; }

  /* History + bin (2026-08-19) */
  .fx__hist-empty { margin: 0; color: #6b7280; font-size: 0.9rem; line-height: 1.5; }
  .fx__hist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.7rem; }
  .fx__hist-item { border-left: 2px solid #e5e7eb; padding: 0 0 0 0.7rem; }
  .fx__hist-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
  .fx__hist-label { font-weight: 700; font-size: 0.9rem; color: #1D3095; }
  .fx__hist-node { font-size: 0.85rem; color: #111827; font-weight: 600; word-break: break-word; }
  .fx__hist-detail { font-size: 0.85rem; color: #4b5563; word-break: break-word; }
  .fx__hist-meta { font-size: 0.78rem; color: #6b7280; margin-top: 0.15rem; }

  .fx__bin { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .fx__bin-item { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.6rem 0.7rem; border: 1px solid #eef0f5; border-radius: 10px; }
  .fx__bin-main { min-width: 0; flex: 1 1 14rem; }
  .fx__bin-name { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 600; font-size: 0.92rem; word-break: break-word; }
  .fx__bin-meta { display: block; font-size: 0.78rem; color: #6b7280; margin-top: 0.15rem; }
  .fx__bin-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

  .fx__seg { display: inline-flex; background: #eef1fb; border-radius: 10px; padding: 0.2rem; gap: 0.2rem; }
  .fx__seg-opt { font: inherit; font-weight: 700; font-size: 0.85rem; padding: 0.4rem 0.95rem; border: none; background: none; color: #1D3095; border-radius: 8px; cursor: pointer; }
  .fx__seg-opt.is-on { background: #1D3095; color: #fff; }
  .fx__hint { color: #6b7280; font-size: 0.85rem; margin: 0.6rem 0 0.9rem; }

  .fx__grants { list-style: none; padding: 0; margin: 0 0 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .fx__grant { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 0.5rem; background: #f7f8fc; border: 1px solid #e9ecf4; border-radius: 10px; padding: 0.4rem 0.55rem; }
  .fx__grant--empty { display: block; color: #6b7280; font-size: 0.85rem; background: none; border: 1px dashed #d6d9e3; }
  .fx__grant-who { display: flex; align-items: center; gap: 0.45rem; min-width: 0; font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx__grant-kind { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.03em; color: #8a90a2; background: #eef1fb; padding: 0.1rem 0.35rem; border-radius: 5px; flex-shrink: 0; }

  .fx__add { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; background: #fbfcff; border: 1px solid #e9ecf4; border-radius: 10px; padding: 0.55rem; }
  .fx__select { font: inherit; font-size: 0.85rem; padding: 0.4rem 0.5rem; border: 1px solid #d6d9e3; border-radius: 8px; background: #fff; color: #152050; cursor: pointer; }
  .fx__select--grow { flex: 1; min-width: 8rem; }

  .fx__preview { margin-top: 1.1rem; border-top: 1px solid #eef0f5; padding-top: 0.85rem; }
  .fx__preview-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: #8a90a2; font-weight: 700; margin: 0 0 0.5rem; }
  .fx__preview-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .fx__preview-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-size: 0.88rem; padding: 0.25rem 0; }
  .fx__preview-row > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx__badge { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; flex-shrink: 0; }
  .fx__badge--manage { background: #1D3095; color: #fff; }
  .fx__badge--edit { background: #dbe2fb; color: #1D3095; }
  .fx__badge--download { background: #e3f0e6; color: #1c6b34; }
  .fx__badge--view { background: #f0f1f6; color: #555c70; }
  .fx__badge--none { background: #f4f5f9; color: #9aa1b4; }

  .fx__dropzone { position: fixed; inset: 0; background: rgba(21,32,80,0.35); display: flex; align-items: center; justify-content: center; z-index: 50; pointer-events: none; }
  .fx__dropzone-card { background: #fff; border: 2px dashed #1D3095; border-radius: 16px; padding: 2rem 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: #1D3095; font-weight: 700; }

  @media (max-width: 640px) {
    /* ── F6 (2026-08-11) — measured at 360px, and both numbers were bad ──────────────────────────
     *
     * The row was '2.2rem 1fr auto' with the actions squeezed into 'auto'. Measured on a folder the
     * viewer can manage:
     *
     *   · four action buttons at **27 x 27 px** — well under the 40px floor this product holds
     *     controls to, adjacent to each other, and **one of them is Delete**. A mis-tap there does
     *     not do nothing, it does something else, and the something else is destructive.
     *   · the name column collapsed to **108px** — under half the row, showing about twelve
     *     characters of a filename, which is the one thing you are scanning a file list for.
     *
     * Squeezing harder cannot fix either. So the actions REFORMAT onto their own line: the name
     * gets the full width back, and the buttons get real tap targets. Rows with no actions are
     * unaffected — ':empty' keeps them a single line — so the list only grows where it must. */
    .fx__row { grid-template-columns: 2.2rem 1fr; }
    .fx__meta, .fx__col--meta { display: none; }

    .fx__row-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
      gap: 0.35rem;
      padding-top: 0.15rem;
    }
    /* A row whose viewer can do nothing to it renders an empty actions span. Without this it would
     * still claim a grid track and make every mount row two lines tall for nothing. */
    .fx__row-actions:empty { display: none; }

    .fx__icon-btn { width: 40px; height: 40px; }

  }

  /* ── F2/F3 — search + format filters ─────────────────────────────────────────────────────── */

  .fx__search {
    display: flex;
    flex-wrap: wrap;          /* the chips drop under the box on a phone rather than squeezing it */
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
    min-width: 0;
  }

  .fx__search-box {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex: 1 1 240px;
    min-width: 0;             /* without this the input's intrinsic width pushes the row wide */
    min-height: 44px;
    padding: 0 0.7rem;
    border: 1px solid var(--theme-border, #E5E7EB);
    border-radius: 8px;
    background: var(--theme-bg-surface, #FFF);
    color: var(--theme-fg-muted, #6B7280);
  }

  .fx__search-box input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-fg-primary, #1F2937);
    font-size: 16px;          /* iOS focus-zoom floor — below this Safari zooms the page on tap */
  }

  /* One scrolling row, not a wrapping block: eight chips wrapping to three lines pushes the file
   * list off the screen on a phone, and the list is what people came for. Same reformat-vs-scroll
   * call as the marketing tabs. */
  .fx__kinds {
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    /* admin-ui-alignment-2026-08-15 — this room for the scrollbar was bottom padding alone, and as
     * a centred flex item that pushed the chips' centre line 1.6px above the search box beside
     * them. Symmetric padding keeps the gutter and the centre.
     * (No backticks in this comment: it lives inside a styled-jsx template literal.) */
    padding: 0.2rem 0;
    max-width: 100%;
    min-width: 0;
  }

  /* admin-ui-alignment-2026-08-14 — 34px chips beside the 40px search box on
     the same toolbar row. */
  .fx__kind {
    flex-shrink: 0;
    height: var(--button-height);
    box-sizing: border-box;
    padding: 0 0.65rem;
    border: 1px solid var(--theme-border, #E5E7EB);
    border-radius: 999px;
    background: transparent;
    color: var(--theme-fg-secondary, #4B5563);
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .fx__kind--on {
    background: var(--color-brand-navy, #1E3A5F);
    border-color: var(--color-brand-navy, #1E3A5F);
    color: var(--color-text-on-brand, #FFF);
  }

  .fx__search-status {
    margin: 0 0 0.6rem;
    font-size: 0.8rem;
    color: var(--theme-fg-muted, #6B7280);
    overflow-wrap: anywhere;
  }

  /* ── F4 — the sharing badge ──────────────────────────────────────────────────────────────────
   *
   * Colour carries the meaning, and the assignment is deliberate: "Everyone" is the state somebody
   * needs to NOTICE, so it is the warm one. Private is calm green — the reassuring colour belongs
   * on the reassuring state, and only where the claim is actually true. */
  .fx__aud {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    margin-top: 0.15rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    white-space: nowrap;
    width: fit-content;
  }
  .fx__aud--private  { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
  .fx__aud--role     { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
  .fx__aud--people   { background: #f5f3ff; border-color: #ddd6fe; color: #5b21b6; }
  .fx__aud--everyone { background: #fffbeb; border-color: #fde68a; color: #92400e; }
  .fx__aud--unknown  { background: #f3f4f6; border-color: #e5e7eb; color: #4b5563; }

  /* Where a hit lives. Shown only in search results — in browse mode you already know. */
  .fx__hit-path {
    display: block;
    font-size: 0.72rem;
    color: var(--theme-fg-muted, #6B7280);
    overflow-wrap: anywhere;
  }
  /* ── F6 — phone overrides, LAST ON PURPOSE ──────────────────────────────────────────────────
   *
   * These were first written inside the earlier @media block near the row rules, and did nothing:
   * the F2/F3 base styles are appended AFTER that block, and on equal specificity the later rule
   * wins. The chip stayed 34px and the measurement said so. Overrides for classes defined at the
   * end of this sheet have to come after them. */
  @media (max-width: 640px) {
    /* 34px was under the 40px floor this product holds controls to, in a scrolling row where a
     * mis-tap silently changes what the list is showing. */
    .fx__kind { min-height: 40px; }
    /* The search box already clears the floor; stated so a future edit does not quietly shrink it. */
    .fx__search-box { min-height: 44px; }
  }
`;
