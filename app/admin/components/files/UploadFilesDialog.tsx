'use client';
/**
 * UploadFilesDialog — THE way files get into a job or project (owner, 2026-09-15).
 *
 * "We need a button for uploading/attaching files, that when pressed, opens a pop up kind of modal
 *  that allows the user to drop files into it or open the computer file explorer and search for the
 *  file and add it … the user will be required to choose which folder in a job the file(s) will
 *  upload to. The user will need to select the upload destination for each file. They should be
 *  able to choose from a dropdown list of available folders in the job, and they should even be
 *  able to create and name a new folder to drop the file(s) into."
 *
 * One pop-up, three steps a person can see:
 *   1. ADD FILES      drop them on the big target, or "Choose files" opens the computer's own picker
 *   2. PICK A FOLDER  every file has its own dropdown (required — nothing uploads until each has
 *                     one); "Put every file in" fills them all at once; "New folder…" names one
 *   3. UPLOAD         one file at a time, each with its own progress bar, a tick when it is saved,
 *                     and a Retry when it is not
 *
 * The folders come from the same tree the FolderExplorer browses (lib/files/upload-destinations.ts),
 * so the folder chosen here is the folder the file is then found in. On the site-wide Files page it
 * also offers a SCOPE — "Save into" My files, Shared files or any project — and the dropdowns then
 * hold that scope's folders (owner, 2026-09-15: "available from the default main files page inside
 * of a job, project, or just the website as a whole … choose a folder in the current scope").
 * It uploads in the page, on
 * purpose, with the progress on screen: the old path handed files to the browser's background
 * transfer on desktop Chrome, where they did not appear until a refresh — or, with no service worker
 * registered, never started at all. Background is still offered where it really works, as a choice.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Upload, X, FolderPlus, FileText, Image as ImageIcon, Film, Music, Archive, CheckCircle2, AlertCircle, Loader2,
  RotateCcw, Trash2, Scissors, Sparkles, Camera, Video, Images, FolderOpen, HardDrive, WifiOff, HelpCircle,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import type { MountTree } from '@/lib/files/mount-node';
import {
  destinationsFromTree, destinationAccepts, refusalFor, suggestDestination, groupDestinations, withNewFolder,
  planAutoSort, canAutoSort, resolveDestination,
  type UploadDestination, type NewFolderParent,
} from '@/lib/files/upload-destinations';
import { checkFolderName, detectJobFileType } from '@/lib/files/job-folders';
import { fileKind } from '@/lib/files/viewer-model';
import { uploadJobFileBytes, uploadProjectFileBytes, putWithProgress, startFailure, type JobUploadResult } from '@/lib/jobs/upload-client';
import { contentTypeForUpload } from '@/lib/files/upload';
import {
  snapshotFile, planSnapshots, preflight, classifyError, runWithRetry, asStep, planPickers, isJunkFile,
  duplicateNames, MAX_ATTEMPTS, TRIMBLE_HELP, type PickerPlan,
} from '@/lib/files/upload-resilience';
import { prepareFilesForUpload } from '@/lib/images/heic';
import { HEIC_ACCEPT } from '@/lib/images/heic-detect';
import { maxBytesFor, isVideoUpload } from '@/lib/jobs/file-storage';
import { contentTypeFor, megabytes, uploadCapBytes } from '@/lib/storage/uploads';
import { backgroundUploadSupport, startBackgroundUpload, ensureNotifyPermission } from '@/lib/jobs/upload-background';
import { planSplit, describePlan, isSplittableMedia, PART_MINUTE_CHOICES, DEFAULT_PART_MINUTES, type SplitPlan } from '@/lib/jobs/video-split';
import { fitImageToLimit } from '@/lib/images/shrink-for-upload';
import { readVideoDuration } from '@/lib/jobs/video-split-run';
import { formatBytes } from './format';
import './UploadFilesDialog.css';

export interface UploadFilesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Whose folders the dropdowns offer: `mnt:jobs:<jobId>`, `mnt:projects:<projectId>`, a job under a
   *  project, or a File Explorer folder (My files / Shared files). Null = the person picks a scope. */
  rootId: string | null;
  /** Show the "Save into" chooser (the site-wide Files page): My files, Shared files, or a project. */
  allowScopeChange?: boolean;
  /** The folder ids from the top down to `rootId` (the Files page breadcrumb). When one of them is a
   *  "Save into" place, the pop-up opens on that whole place with `rootId`'s folder pre-chosen. */
  scopeTrail?: string[];
  /** "24-103 — Smith", shown under the title. */
  title?: string;
  /** A folder to pre-choose for every file — the folder the person was looking at. */
  initialDestinationId?: string | null;
  /** Files dropped on the page before the pop-up opened. */
  initialFiles?: File[] | null;
  /** After the last upload finishes (successfully or not), with where the saved files went. */
  onUploaded?: (summary: { count: number; destinationIds: string[] }) => void;
}

type Status = 'waiting' | 'uploading' | 'finishing' | 'done' | 'failed' | 'handed-off';

interface Item {
  key: string;
  file: File;
  destId: string;
  status: Status;
  pct: number;
  loaded: number;
  error?: string;
  split?: { phase: 'measuring' | 'confirm' | 'splitting'; message: string; plan?: SplitPlan; minutes?: number };
  /** Shrinking an over-limit photo to fit (2026-10-06). */
  shrinking?: boolean;
  /** Being copied into memory (see `snapshotFile` — the TDC600 "network error" fix). */
  reading?: boolean;
  /** Copied into memory: the upload no longer depends on the file on the device. */
  buffered?: boolean;
  /** The device would not let the page read it; a retry tries reading again. */
  unreadable?: boolean;
  /** Why the folder was chosen for it ("Photos takes photos only, so this goes in CAD"). */
  note?: string;
  /** What the automatic retry is doing right now. */
  retryNote?: string;
}

/** Wait for the browser to say it is back online (at most ten minutes, then try anyway). */
function waitForOnline(onWait: () => void): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  onWait();
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('online', done); window.clearTimeout(timer); resolve(); };
    const timer = window.setTimeout(done, 10 * 60_000);
    window.addEventListener('online', done);
  });
}

interface NewFolderDraft {
  /** The item that asked, or 'all' for the "Put every file in" row. */
  forKey: string;
  name: string;
  parentId: string;
  busy: boolean;
  error: string | null;
}

const NEW_FOLDER = '__new__';

/** The sentence for a 0-byte file — the same one `preflight` refuses it with. */
function emptyMessage(name: string): string {
  const check = preflight({ name, size: 0 }, Number.MAX_SAFE_INTEGER);
  return check.ok ? '' : check.message;
}
let seq = 0;

function KindIcon({ file }: { file: File }) {
  switch (fileKind(file.name, file.type)) {
    case 'image': return <ImageIcon size={18} aria-hidden="true" />;
    case 'video': return <Film size={18} aria-hidden="true" />;
    case 'audio': return <Music size={18} aria-hidden="true" />;
    case 'pdf': case 'text': return <FileText size={18} aria-hidden="true" />;
    default: return <Archive size={18} aria-hidden="true" />;
  }
}

interface ScopeOption { id: string; label: string; group: 'Your files' | 'Job projects' | 'Here' }

export default function UploadFilesDialog({ open, onClose, rootId, allowScopeChange, scopeTrail, title, initialDestinationId, initialFiles, onUploaded }: UploadFilesDialogProps) {
  const { data: session } = useSession();
  const myEmail = session?.user?.email?.toLowerCase() ?? null;
  const [scopeId, setScopeId] = useState<string | null>(rootId);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [tree, setTree] = useState<MountTree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<'choose' | 'uploading' | 'finished'>('choose');
  const [dragOver, setDragOver] = useState(false);
  const [draft, setDraft] = useState<NewFolderDraft | null>(null);
  const [bgAvailable, setBgAvailable] = useState(false);
  const [keepInBackground, setKeepInBackground] = useState(false);
  const [batch, setBatch] = useState<{ at: number; total: number }>({ at: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recordRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const [picker, setPicker] = useState<PickerPlan | null>(null);
  const [online, setOnline] = useState(true);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dragDepth = useRef(0);

  // ── the folders ──
  const treeSeq = useRef(0);
  const loadTree = useCallback(async (scope: string | null = scopeId): Promise<MountTree | null> => {
    // The newest request wins: switching "Save into" twice must not show the first place's folders.
    const seq = ++treeSeq.current;
    setTreeError(null);
    if (!scope) { setTree(null); return null; }
    try {
      const res = await fetch(`/api/admin/files/tree?node=${encodeURIComponent(scope)}`);
      const json = await res.json().catch(() => ({}));
      if (seq !== treeSeq.current) return null;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTree(json as MountTree);
      return json as MountTree;
    } catch (err) {
      if (seq === treeSeq.current) setTreeError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [scopeId]);

  const { destinations, parents } = useMemo(() => destinationsFromTree(tree), [tree]);
  const destById = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const multiGroup = useMemo(() => new Set(destinations.map((d) => d.groupId)).size > 1, [destinations]);

  const makeItems = useCallback((files: File[], destId: string, existing: Item[]): Item[] => {
    const have = new Set(existing.map((i) => `${i.file.name}|${i.file.size}|${i.file.lastModified}`));
    return files
      .filter((f) => !have.has(`${f.name}|${f.size}|${f.lastModified}`))
      .map((file) => ({ key: `u${++seq}`, file, destId, status: 'waiting' as const, pct: 0, loaded: 0 }));
  }, []);

  // ── open / reset ──
  useEffect(() => {
    if (!open) return;
    setPhase('choose');
    setDraft(null);
    setDragOver(false);
    setKeepInBackground(false);
    itemsRef.current = [];
    setItems([]);
    if (initialFiles?.length) addFiles(initialFiles, []);
    setScopeId(rootId);
    // Which pickers this device gets — decided in the browser, never during a server render.
    setPicker(planPickers({
      userAgent: navigator.userAgent,
      hasOpenFilePicker: typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function',
      coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)').matches),
      supportsDirectory: 'webkitdirectory' in document.createElement('input'),
    }));
    setTree(null);
    void loadTree(rootId);
    if (allowScopeChange) void loadScopes();
    // Background uploads only where they can actually start: the API AND an active worker.
    const support = backgroundUploadSupport();
    if (support.mode === 'background' && typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then((reg) => setBgAvailable(Boolean(reg?.active))).catch(() => setBgAvailable(false));
    } else {
      setBgAvailable(false);
    }
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    // Reset only when the pop-up opens, not whenever a parent re-renders with a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** The places the site-wide Files page can save into: writable File Explorer roots, then projects. */
  async function loadScopes() {
    type Listed = { id: string; name: string; node_type: string; access?: string; is_system?: boolean; is_personal_root?: boolean; owner_email?: string | null };
    const list = async (parent: string): Promise<Listed[]> => {
      try {
        const res = await fetch(`/api/admin/files?parent=${encodeURIComponent(parent)}`);
        if (!res.ok) return [];
        return ((await res.json()).nodes ?? []) as Listed[];
      } catch { return []; }
    };
    const writable = (n: Listed) => n.access === 'edit' || n.access === 'manage';
    const [roots, projects] = await Promise.all([list('root'), list('mnt:projects')]);
    const folders = roots.filter((n) => n.node_type === 'folder' && !n.id.startsWith('mnt:'));
    // "My files" is the person's own folder inside the Personal container (as the explorer pop-up finds it).
    const personal = folders.find((n) => n.is_system && /^personal$/i.test(n.name));
    const mine = personal && myEmail
      ? (await list(personal.id)).find((n) => n.is_personal_root && n.owner_email?.toLowerCase() === myEmail) ?? null
      : null;
    const yours: ScopeOption[] = [
      ...(mine ? [{ id: mine.id, label: 'My files', group: 'Your files' as const }] : []),
      ...folders
        .filter((n) => writable(n) && n.id !== mine?.id)
        .map((n) => ({ id: n.id, label: n.is_system && /^shared$/i.test(n.name) ? 'Shared files' : n.name, group: 'Your files' as const })),
    ];
    const proj: ScopeOption[] = projects
      .filter((n) => n.node_type === 'folder')
      .map((n) => ({ id: n.id, label: n.name, group: 'Job projects' as const }));
    const all = [...yours, ...proj];
    setScopes(all);

    // Opened inside a place (My files › Deeds): widen to the whole place, keep the folder pre-chosen.
    if (rootId && !all.some((sc) => sc.id === rootId) && scopeTrail?.length) {
      const place = scopeTrail.find((id) => all.some((sc) => sc.id === id));
      if (place && place !== rootId) {
        setScopeId(place);
        void loadTree(place);
      }
    }
  }

  function changeScope(next: string) {
    const id = next || null;
    setScopeId(id);
    setDraft(null);
    // Folders from the old scope are not in the new one: every waiting file chooses again.
    setItems((cur) => cur.map((i) => (i.status === 'waiting' || i.status === 'failed' ? { ...i, destId: '' } : i)));
    void loadTree(id);
  }

  const uploading = phase === 'uploading';

  // Esc closes — never mid-upload, which would look like cancelling and would not cancel anything.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (draft) { e.preventDefault(); setDraft(null); return; }
      if (!uploading) { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, uploading, draft, onClose]);

  // ── adding files ──
  /**
   * Every picker, drop and paste lands here. Two things happen that did not before 2026-10-01:
   *
   *   - a file that failed is REPLACED when it is chosen again, rather than refused as a duplicate
   *     (choosing it again is exactly what the "could not read" message tells people to do);
   *   - small files are copied into memory straight away (`snapshotFile`). On Android, Chrome
   *     aborts an upload whose file changed after it was picked, and reports it as a network error
   *     — the TDC600 failure. A copy in memory cannot change.
   */
  const addFiles = useCallback((list: FileList | File[] | null, base?: Item[]) => {
    // Copied BEFORE the inputs are cleared: `input.files` is live, and clearing the input empties it.
    const files = Array.from(list ?? []).filter((f) => !isJunkFile(f.name));
    for (const el of [inputRef.current, photosRef.current, cameraRef.current, recordRef.current, folderRef.current]) {
      if (el) el.value = '';
    }
    if (files.length === 0) return;
    const cur = base ?? itemsRef.current;
    const names = new Set(files.map((f) => f.name));
    const kept = cur.filter((i) => !(i.status === 'failed' && names.has(i.file.name)));
    // A new file inherits the folder every other waiting file shares, when they all share one.
    const waiting = kept.filter((i) => i.status === 'waiting');
    const shared = waiting.length > 0 && waiting.every((i) => i.destId === waiting[0].destId) ? waiting[0].destId : '';
    const fresh = makeItems(files, shared || initialDestinationId || '', kept);
    const inMemory = kept.filter((i) => i.buffered).reduce((n, i) => n + i.file.size, 0);
    const plan = planSnapshots(fresh.map((i) => i.file.size), inMemory);
    const marked = fresh.map((i, n) => (plan[n] ? { ...i, reading: true } : i));
    const next = [...kept, ...marked];
    itemsRef.current = next;
    setItems(next);
    if (phase === 'finished') setPhase('choose');
    void bufferItems(marked.filter((i) => i.reading));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeItems, initialDestinationId, phase]);

  /** Copy picked files into memory, one at a time (a controller has little RAM to spare). */
  async function bufferItems(list: Item[]) {
    for (const it of list) {
      try {
        const copy = await snapshotFile(it.file);
        update(it.key, { file: copy, reading: false, buffered: true, unreadable: false });
      } catch (err) {
        update(it.key, { reading: false, unreadable: true, status: 'failed', error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  /**
   * "Choose files…". On Android Chrome 132+ this opens the SYSTEM Files picker directly (internal
   * storage, Downloads, Drive and every other provider in its side menu) — the browser's own chooser
   * there can offer Drive and Photos without the Files app the owner needs. Anywhere else, and if
   * the system picker fails for any reason but "cancelled", it is the ordinary file input, which
   * has no `accept` on purpose: a type list narrows Android's picker and greys out `.job` files.
   */
  async function chooseFiles() {
    if (picker?.primary === 'system-files') {
      const w = window as unknown as { showOpenFilePicker?: (o: { multiple: boolean }) => Promise<Array<{ getFile(): Promise<File> }>> };
      try {
        const handles = await w.showOpenFilePicker!({ multiple: true });
        const picked = await Promise.all(handles.map((h) => h.getFile()));
        // The HEIC guard watches <input> events; files from this picker go through it by hand.
        const prepared = await prepareFilesForUpload(picked, { destination: 'any-file' });
        addFiles(prepared.files);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    inputRef.current?.click();
  }

  const update = (key: string, patch: Partial<Item> | ((i: Item) => Partial<Item>)) =>
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...(typeof patch === 'function' ? patch(i) : patch) } : i)));

  /** The folder an item will go to, when it has a usable one. */
  const destOf = useCallback((i: Item): UploadDestination | null => {
    const d = destById.get(i.destId);
    return d && destinationAccepts(d, i.file) ? d : null;
  }, [destById]);

  const tooBig = (f: File) => f.size > maxBytesFor(f.name, f.type);

  // ── choosing folders ──
  function chooseFor(key: string, value: string) {
    if (value === NEW_FOLDER) { openDraft(key); return; }
    update(key, { destId: value, error: undefined });
  }

  function chooseForAll(value: string) {
    if (value === NEW_FOLDER) { openDraft('all'); return; }
    if (!value) return;
    const d = destById.get(value);
    setItems((cur) => cur.map((i) => (i.status === 'waiting' || i.status === 'failed')
      ? (d && destinationAccepts(d, i.file) ? { ...i, destId: value } : i)
      : i));
  }

  /**
   * ── SORT THESE FOR ME (owner, 2026-09-19) ───────────────────────────────────────────────────
   *
   * "there should be a button that auto sorts the files being uploaded into the correct folder …
   * all video files … into the videos folder, and all images … into the images folder."
   *
   * The rule lives in `planAutoSort`, which is pure and tested; this is the part that touches the
   * list. It sorts EVERY file still waiting, not only the ones with no folder yet, because that is
   * what the button says it does — and because the row of dropdowns is right there to correct any
   * one of them afterwards. It is the same bargain as "Put every file in" next to it, which also
   * overwrites what you already chose.
   *
   * A file already uploading or uploaded is never touched: its folder is a fact by then, not a
   * choice.
   */
  const [sorted, setSorted] = useState<{ summary: Array<{ label: string; count: number }>; left: number } | null>(null);

  function sortByKind() {
    const open = items.filter((i) => (i.status === 'waiting' || i.status === 'failed') && !tooBig(i.file));
    const plan = planAutoSort(destinations, open.map((i) => ({ name: i.file.name, type: i.file.type, key: i.key })));
    const byKey = new Map(plan.moves.map((m) => [m.item.key, m.destination.id]));
    setItems((cur) => cur.map((i) => (byKey.has(i.key) ? { ...i, destId: byKey.get(i.key)!, error: undefined } : i)));
    setSorted({ summary: plan.summary, left: plan.unplaced.length });
  }

  // A changed list makes the last sort's sentence stale — it described files that may no longer be
  // here, or may now have company.
  useEffect(() => { setSorted(null); }, [items.length]);

  function openDraft(forKey: string) {
    const item = items.find((i) => i.key === forKey);
    const fromItem = item ? parents.find((p) => p.id === item.destId) : undefined;
    const fallback = parents.find((p) => p.parent_key === null && p.parent_id === null) ?? parents[0];
    setDraft({ forKey, name: '', parentId: (fromItem ?? fallback)?.id ?? '', busy: false, error: null });
  }

  async function createFolder() {
    if (!draft) return;
    const check = checkFolderName(draft.name);
    if (!check.ok) { setDraft({ ...draft, error: check.error }); return; }
    const parent: NewFolderParent | undefined = parents.find((p) => p.id === draft.parentId);
    if (!parent) { setDraft({ ...draft, error: 'Choose where the new folder goes.' }); return; }
    setDraft({ ...draft, busy: true, error: null });
    try {
      // A File Explorer folder is a `file_nodes` row; a folder inside a job is a named job folder.
      const explorer = Boolean(parent.explorerParentId);
      const res = explorer
        ? await fetch('/api/admin/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parent.explorerParentId, name: check.value }),
        })
        : await fetch('/api/admin/jobs/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: parent.jobId, name: check.value, parent_key: parent.parent_key, parent_id: parent.parent_id }),
        });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Could not create the folder (HTTP ${res.status}).`);
      const createdRow = (explorer ? json.node : json.folder) as { id: string; name: string };
      // Added in place and selected now; the full listing refreshes behind it (it can take seconds).
      if (!tree) throw new Error('The folders are still loading — try again in a moment.');
      const next = withNewFolder(tree, parent, { id: createdRow.id, name: createdRow.name ?? check.value });
      setTree(next.tree);
      const made = destinationsFromTree(next.tree).destinations.find((d) => d.id === next.folderId);
      if (!made) throw new Error('The folder was made, but did not appear — close this and try again.');
      void loadTree();
      setItems((cur) => cur.map((i) => {
        const wanted = draft.forKey === 'all' ? (i.status === 'waiting' || i.status === 'failed') : i.key === draft.forKey;
        return wanted && destinationAccepts(made, i.file) ? { ...i, destId: made.id, error: undefined } : i;
      }));
      setDraft(null);
    } catch (err) {
      setDraft((d) => (d ? { ...d, busy: false, error: err instanceof Error ? err.message : String(err) } : d));
    }
  }

  // ── an over-cap video: measure → confirm → cut into parts that each fit ──
  // Owner, 2026-10-06: "If we have a 30 minute long video, we need to be able to split it up into
  // 10 3 minute long videos, and we need to be able to do it quickly." Any video or audio file can be
  // cut into parts of a chosen length; an over-limit one is offered the same, with parts short
  // enough to fit. Default three minutes.
  async function measureSplit(item: Item, minutes = DEFAULT_PART_MINUTES) {
    const cap = maxBytesFor(item.file.name, item.file.type);
    update(item.key, { split: { phase: 'measuring', message: 'Checking how long this file is…', minutes } });
    const durationSec = await readVideoDuration(item.file);
    const plan = planSplit({ sizeBytes: item.file.size, durationSec, capBytes: cap, name: item.file.name, maxPartSeconds: minutes * 60, force: true });
    if (!plan.needed || plan.parts.length === 0) {
      update(item.key, {
        split: undefined,
        error: plan.needed ? (describePlan(plan, item.file.size, cap) || 'That file cannot be stored.') : `It is already shorter than ${minutes} minute${minutes === 1 ? '' : 's'} and under the limit — no need to cut it.`,
      });
      return;
    }
    update(item.key, { error: undefined, split: { phase: 'confirm', plan, minutes, message: describePlan(plan, item.file.size, cap) } });
  }

  // An over-limit photo: shrink it (resize + JPEG) until it fits, rather than refusing it.
  async function shrinkToFit(item: Item) {
    const cap = maxBytesFor(item.file.name, item.file.type);
    update(item.key, { shrinking: true, error: undefined });
    try {
      const smaller = await fitImageToLimit(item.file, cap);
      setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, file: smaller, shrinking: false } : i)));
    } catch (e) {
      update(item.key, { shrinking: false, error: e instanceof Error ? e.message : 'The photo could not be shrunk.' });
    }
  }

  async function runSplit(item: Item) {
    const plan = item.split?.plan;
    if (!plan) return;
    update(item.key, { split: { phase: 'splitting', plan, minutes: item.split?.minutes, message: 'Preparing to cut it… (the first time loads the cutter, about 30 MB)' } });
    const { splitVideo } = await import('@/lib/jobs/video-split-run');
    const outcome = await splitVideo(item.file, plan.parts, (pr) =>
      update(item.key, { split: { phase: 'splitting', plan, minutes: item.split?.minutes, message: `Cutting part ${pr.part} of ${pr.total}… ${pr.pct}%` } }));
    if (!outcome.ok || !outcome.files) { update(item.key, { split: undefined, error: outcome.error ?? 'The video could not be cut.' }); return; }
    const cap = maxBytesFor(item.file.name, item.file.type);
    const over = outcome.files.find((f) => f.size > cap);
    if (over) {
      update(item.key, { split: undefined, error: `"${over.name}" is still ${megabytes(over.size)} MB after cutting — over the ${megabytes(cap)} MB limit. Choose shorter parts.` });
      return;
    }
    setItems((cur) => {
      const at = cur.findIndex((i) => i.key === item.key);
      if (at < 0) return cur;
      const parts = outcome.files!.map((file) => ({ key: `u${++seq}`, file, destId: cur[at].destId, status: 'waiting' as const, pct: 0, loaded: 0 }));
      return [...cur.slice(0, at), ...parts, ...cur.slice(at + 1)];
    });
  }

  // ── uploading ──
  /**
   * One file: sign → send the bytes straight to storage → save the row, tried up to MAX_ATTEMPTS
   * times with a growing wait when the failure is one that can pass (a dropped connection, a 5xx,
   * an expired link). Offline, it waits for the connection instead of failing. Once the bytes are
   * in storage, a retry repeats only the save — never the transfer. Whatever finally fails is said
   * in words: what failed, and what to do.
   */
  async function uploadOne(item: Item, dest: UploadDestination): Promise<boolean> {
    let file = item.file;
    const check = preflight(file, maxBytesFor(file.name, file.type));
    if (!check.ok) { update(item.key, { status: 'failed', error: check.message }); return false; }

    // A file the device would not hand over: try reading it once more before anything else.
    let buffered = Boolean(item.buffered);
    if (item.unreadable) {
      update(item.key, { status: 'uploading', pct: 0, loaded: 0, error: undefined, retryNote: 'Reading the file again…' });
      try {
        file = await snapshotFile(file);
        buffered = true;
        update(item.key, { file, buffered: true, unreadable: false });
      } catch (err) {
        update(item.key, { status: 'failed', retryNote: undefined, error: err instanceof Error ? err.message : String(err) });
        return false;
      }
    }

    const onProgress = (p: { pct: number; loaded: number }) =>
      update(item.key, { pct: p.pct, loaded: p.loaded, status: p.pct >= 100 ? 'finishing' : 'uploading', retryNote: undefined });
    const ctx = { fileName: file.name, sizeBytes: file.size, buffered };
    const owner = dest.owner.kind === 'job' ? { job_id: dest.owner.jobId } : dest.owner.kind === 'project' ? { project_id: dest.owner.projectId } : {};
    const mime = contentTypeForUpload(file.name, file.type);
    const rowBody = (bytes: JobUploadResult) => ({
      ...owner,
      file_id: bytes.file_id, storage_path: bytes.storage_path, storage_bucket: bytes.storage_bucket,
      file_name: file.name, file_type: dest.fileType ?? detectJobFileType(file.name),
      file_size: file.size, mime_type: mime, section: dest.section, description: '',
      ...(dest.folderId ? { folder_id: dest.folderId } : {}),
    });

    // What has already happened, kept across attempts so a retry never re-sends the bytes.
    let sent: { explorerPath?: string; bytes?: JobUploadResult } | null = null;

    const attemptOnce = async (): Promise<'done' | 'handed-off'> => {
      // ── A File Explorer folder: the explorer's own three-step (sign → PUT → complete) ──
      if (dest.owner.kind === 'explorer') {
        const parentId = dest.owner.parentId;
        if (!sent) {
          const init = await asStep('start', () => fetch('/api/admin/files/upload', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id: parentId, name: file.name, size_bytes: file.size }),
          }));
          if (!init.ok) throw await startFailure(init, file.name);
          const { signed_url, path } = await init.json();
          await putWithProgress(signed_url, file, onProgress);
          sent = { explorerPath: path };
        }
        update(item.key, { status: 'finishing', pct: 100 });
        const explorerPath = sent.explorerPath;
        const done = await asStep('save', () => fetch('/api/admin/files/upload/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId, name: file.name, path: explorerPath, mime_type: mime, size_bytes: file.size }),
        }));
        if (!done.ok) throw await startFailure(done, file.name, 'save');
        return 'done';
      }

      if (!sent && keepInBackground && bgAvailable) {
        const init = await asStep('start', () => fetch('/api/admin/jobs/files/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...owner, name: file.name, size_bytes: file.size, mime_type: mime }),
        }));
        if (!init.ok) throw await startFailure(init, file.name);
        const started = await init.json();
        const bytes: JobUploadResult = { file_id: started.file_id, storage_path: started.path, storage_bucket: started.bucket };
        const handed = await startBackgroundUpload({
          signedUrl: started.signed_url, file, contentType: contentTypeFor(file.name, mime),
          row: {
            id: started.file_id, rowEndpoint: '/api/admin/jobs/files',
            rowBody: rowBody(bytes),
            fileName: file.name, sizeBytes: file.size,
            openUrl: dest.owner.kind === 'job' ? `/admin/jobs/${dest.owner.jobId}` : dest.owner.kind === 'project' ? `/admin/projects/${dest.owner.projectId}` : '/admin/files',
          },
        });
        if (handed) return 'handed-off';
        // Declined: the signed URL is unused, so the same one goes up in the page instead.
        await putWithProgress(started.signed_url, file, onProgress);
        sent = { bytes };
      }
      if (!sent) {
        const bytes = dest.owner.kind === 'job'
          ? await uploadJobFileBytes(dest.owner.jobId, file, onProgress)
          : await uploadProjectFileBytes(dest.owner.kind === 'project' ? dest.owner.projectId : '', file, onProgress);
        sent = { bytes };
      }
      update(item.key, { status: 'finishing', pct: 100 });
      await saveRow(rowBody(sent.bytes!), file.name);
      return 'done';
    };

    update(item.key, { status: 'uploading', pct: 0, loaded: 0, error: undefined, retryNote: undefined });
    try {
      const outcome = await runWithRetry(async (attempt) => {
        if (attempt > 1 && !sent) update(item.key, { status: 'uploading', pct: 0, loaded: 0 });
        return attemptOnce();
      }, {
        classify: (err) => classifyError(err, { ...ctx, online: typeof navigator === 'undefined' ? true : navigator.onLine !== false }),
        waitForOnline: () => waitForOnline(() => update(item.key, { retryNote: 'This device is offline — waiting for the connection to come back…' })),
        onRetry: ({ nextAttempt, delayMs, failure }) => update(item.key, {
          retryNote: `${failure.message} Trying again${delayMs > 0 ? ` in ${Math.max(1, Math.round(delayMs / 1000))} s` : ''} (try ${nextAttempt} of ${MAX_ATTEMPTS}).`,
        }),
      });
      update(item.key, { status: outcome, pct: 100, loaded: file.size, retryNote: undefined, error: undefined });
      return true;
    } catch (err) {
      update(item.key, { status: 'failed', retryNote: undefined, error: err instanceof Error ? err.message : `Could not upload ${file.name}.` });
      return false;
    }
  }

  async function saveRow(body: Record<string, unknown>, name: string) {
    const res = await asStep('save', () => fetch('/api/admin/jobs/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    if (!res.ok) throw await startFailure(res, name, 'save');
  }

  /** A file with nothing in it — known only once it has been read, since Android can report 0 for a
   *  file it has not opened yet. */
  const isEmpty = (i: Item) => !i.reading && i.file.size === 0;
  const pending = items.filter((i) => i.status === 'waiting' || i.status === 'failed');
  const needFolder = pending.filter((i) => !destOf(i) && !tooBig(i.file) && !isEmpty(i));
  const oversize = pending.filter((i) => tooBig(i.file));
  const reading = items.filter((i) => i.reading);
  const ready = pending.filter((i) => destOf(i) && !tooBig(i.file) && !isEmpty(i) && !i.split && !i.reading);
  const failedReady = ready.filter((i) => i.status === 'failed');
  const canUpload = !uploading && ready.length > 0 && needFolder.length === 0 && reading.length === 0 && !draft;
  const dupes = useMemo(() => duplicateNames(items.map((i) => i.file)), [items]);

  /** Every file still to go, one at a time. A file that fails never stops the ones after it. */
  async function uploadAll(onlyFailed = false) {
    if (!canUpload) return;
    if (keepInBackground && bgAvailable) await ensureNotifyPermission();
    setPhase('uploading');
    const used = new Set<string>();
    let saved = 0;
    const batchItems = onlyFailed ? failedReady : ready;
    for (const [n, item] of batchItems.entries()) {
      const dest = destOf(item);
      if (!dest) continue;
      setBatch({ at: n + 1, total: batchItems.length });
      if (await uploadOne(item, dest)) { saved += 1; used.add(dest.id); }
    }
    setPhase('finished');
    if (saved > 0) onUploaded?.({ count: saved, destinationIds: [...used] });
  }

  async function retry(item: Item) {
    const dest = destOf(item);
    if (!dest || uploading) return;
    setPhase('uploading');
    setBatch({ at: 1, total: 1 });
    const ok = await uploadOne(item, dest);
    setPhase('finished');
    if (ok) onUploaded?.({ count: 1, destinationIds: [dest.id] });
  }

  // ── a file that inherited a folder which refuses it goes where it belongs instead ──
  useEffect(() => {
    if (destinations.length === 0) return;
    setItems((cur) => {
      let changed = false;
      const next = cur.map((i) => {
        if (i.status !== 'waiting' || !i.destId) return i;
        const r = resolveDestination(destinations, i.destId, i.file);
        if (!r.rerouted) return i;
        changed = true;
        return { ...i, destId: r.id, note: r.note };
      });
      return changed ? next : cur;
    });
  }, [destinations, items.length]);

  // ── online / offline, shown in the pop-up and waited for by every upload ──
  useEffect(() => {
    if (!open) return;
    const set = () => setOnline(navigator.onLine !== false);
    set();
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set); };
  }, [open]);

  // ── keep the screen on while uploading, and warn before leaving mid-upload ──
  // A controller that sleeps mid-transfer suspends the page and the upload with it. The Wake Lock
  // is released by the browser whenever the page is hidden, so it is asked for again on return.
  useEffect(() => {
    if (phase !== 'uploading') return;
    type Sentinel = { release(): Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let finished = false;
    const acquire = () => {
      if (!nav.wakeLock) return;
      nav.wakeLock.request('screen')
        .then((l) => { if (finished) void l.release().catch(() => {}); else lock = l; })
        .catch(() => { /* refused (battery saver, no permission): uploads still run */ });
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      finished = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', onLeave);
      void lock?.release().catch(() => {});
    };
  }, [phase]);

  // ── drag and drop anywhere on the pop-up ──
  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (!uploading) addFiles(e.dataTransfer.files);
  };

  if (!open) return null;

  const totalBytes = items.reduce((n, i) => n + i.file.size, 0);
  const doneCount = items.filter((i) => i.status === 'done' || i.status === 'handed-off').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const groups = groupDestinations(destinations);
  const parentGroups = groupDestinations(parents);
  const loadingFolders = Boolean(scopeId) && !tree && !treeError;

  /** The dropdown's options — the same for every file, with folders that refuse this file greyed. */
  const folderOptions = (file: File | null) => {
    const optionFor = (d: UploadDestination) => {
      const ok = !file || destinationAccepts(d, file);
      const indent = '   '.repeat(d.depth);
      const name = d.depth > 0 ? d.label.split(' › ').slice(-1)[0] : d.label;
      return (
        <option key={d.id} value={d.id} disabled={!ok}>
          {indent}{d.depth > 0 ? '└ ' : ''}{name}{ok ? '' : ` (${refusalFor(d)})`}
        </option>
      );
    };
    return (
      <>
        <option value="">{!scopeId ? 'Choose “Save into” first' : loadingFolders ? 'Loading folders…' : 'Choose a folder…'}</option>
        {multiGroup
          ? groups.map((g) => <optgroup key={g.groupId} label={g.group}>{g.items.map(optionFor)}</optgroup>)
          : destinations.map(optionFor)}
        {parents.length > 0 && <option value={NEW_FOLDER}>＋ New folder…</option>}
      </>
    );
  };

  const renderDraft = () => draft && (
    <div className="ufd__newfolder" role="group" aria-label="New folder" data-testid="ufd-new-folder">
      <div className="ufd__newfolder-head">
        <FolderPlus size={16} aria-hidden="true" />
        <strong>New folder</strong>
        <span className="ufd__muted">{draft.forKey === 'all' ? 'for every file' : 'for this file'}</span>
      </div>
      <div className="ufd__newfolder-fields">
        <label className="ufd__field">
          <span>Folder name</span>
          <input
            type="text"
            value={draft.name}
            maxLength={80}
            autoFocus
            placeholder="e.g. Boundary letters"
            onChange={(e) => setDraft({ ...draft, name: e.target.value, error: null })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createFolder(); } }}
            data-testid="ufd-new-folder-name"
          />
        </label>
        <label className="ufd__field">
          <span>Put it inside</span>
          <select value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value, error: null })} data-testid="ufd-new-folder-parent">
            {parentGroups.length > 1
              ? parentGroups.map((g) => (
                <optgroup key={g.groupId} label={g.group}>
                  {g.items.map((p) => <option key={p.id} value={p.id}>{'   '.repeat(p.depth)}{p.label.split(' › ').slice(-1)[0]}</option>)}
                </optgroup>
              ))
              : parents.map((p) => <option key={p.id} value={p.id}>{'   '.repeat(p.depth)}{p.depth > 0 ? '└ ' : ''}{p.label.split(' › ').slice(-1)[0]}</option>)}
          </select>
        </label>
      </div>
      {draft.error && <p className="ufd__error" role="alert"><AlertCircle size={14} aria-hidden="true" /> {draft.error}</p>}
      <div className="ufd__newfolder-actions">
        <button type="button" className="ufd__btn ufd__btn--primary" onClick={() => void createFolder()} disabled={draft.busy} data-testid="ufd-new-folder-create">
          {draft.busy ? <Loader2 size={14} className="ufd__spin motion-essential" aria-hidden="true" /> : <FolderPlus size={14} aria-hidden="true" />}
          Create folder
        </button>
        <button type="button" className="ufd__btn" onClick={() => setDraft(null)} disabled={draft.busy}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="ufd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div
        ref={dialogRef}
        className={`ufd${dragOver ? ' ufd--drag' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onDragEnter={onDragEnter}
        onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="upload-files-dialog"
      >
        <header className="ufd__head">
          <div>
            <h2 id={titleId} className="ufd__title"><Upload size={18} aria-hidden="true" /> Upload files</h2>
            {title && !allowScopeChange && <p className="ufd__subtitle">to <strong>{title}</strong></p>}
            {allowScopeChange && <p className="ufd__subtitle">Choose where they go, then a folder for each file.</p>}
          </div>
          <button type="button" className="ufd__close" onClick={onClose} disabled={uploading} aria-label="Close" title={uploading ? 'Wait for the uploads to finish' : 'Close'}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="ufd__body">
          {/* ── the scope: where on the platform these files go (site-wide Files page) ── */}
          {allowScopeChange && (
            <label className="ufd__scope" data-testid="ufd-scope">
              <span className="ufd__scope-label">Save into</span>
              <select value={scopeId ?? ''} onChange={(e) => changeScope(e.target.value)} disabled={uploading} data-testid="ufd-scope-select">
                <option value="">Choose a place…</option>
                {rootId && !scopes.some((sc) => sc.id === rootId) && (
                  <optgroup label="Where you are"><option value={rootId}>{title ?? 'This folder'}</option></optgroup>
                )}
                {(['Your files', 'Job projects'] as const).map((g) => {
                  const inGroup = scopes.filter((sc) => sc.group === g);
                  return inGroup.length ? (
                    <optgroup key={g} label={g}>{inGroup.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}</optgroup>
                  ) : null;
                })}
              </select>
            </label>
          )}
          {/* ── 1. add files ──
              Several pickers, because one cannot serve every device (2026-10-01):
                · "Choose files…" — no `accept` at all, ever. A type list narrows Android's picker to
                  apps that claim those types (Photos, Drive) and greys out .job/.rw5/.trv files it
                  cannot name. On Android Chrome 132+ it opens the system Files picker directly.
                · "Other apps" — the browser's own chooser, beside the system picker (Drive etc.).
                · "Photos & videos" — the gallery, on touch devices.
                · "Take photo" / "Record video" — `capture`, which must never be on the general
                  picker or it can only open the camera.
                · "Choose a folder…" — desktop only, where `webkitdirectory` really works. */}
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} data-testid="ufd-input" />
          <input ref={photosRef} type="file" multiple hidden accept={`image/*,${HEIC_ACCEPT},video/*`} onChange={(e) => addFiles(e.target.files)} data-testid="ufd-input-photos" />
          <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => addFiles(e.target.files)} data-testid="ufd-input-camera" />
          <input ref={recordRef} type="file" hidden accept="video/*" capture="environment" onChange={(e) => addFiles(e.target.files)} data-testid="ufd-input-record" />
          <input
            ref={(el) => { folderRef.current = el; el?.setAttribute('webkitdirectory', ''); }}
            type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} data-testid="ufd-input-folder"
          />
          <div className={`ufd__drop${items.length > 0 ? ' ufd__drop--compact' : ''}${dragOver ? ' ufd__drop--over' : ''}`}>
            <span className="ufd__drop-icon"><Upload size={items.length > 0 ? 20 : 34} aria-hidden="true" /></span>
            <div className="ufd__drop-text">
              <strong>{dragOver ? 'Let go to add these files' : items.length > 0 ? 'Add more files' : picker?.photos ? 'Add files from this device' : 'Drag and drop files here'}</strong>
              <span>{items.length > 0 ? (picker?.photos ? 'Choose more, or take a photo' : 'Drop them here, or') : picker?.photos ? 'Any file: survey data, photos, videos, PDFs' : 'or choose them from your computer'}</span>
            </div>
            <div className="ufd__pickers">
              <button type="button" className="ufd__btn ufd__btn--primary ufd__btn--big" onClick={() => void chooseFiles()} disabled={uploading} data-testid="ufd-choose">
                {picker?.android ? <HardDrive size={16} aria-hidden="true" /> : null}
                {picker?.android ? 'Choose files (Files app)…' : 'Choose files…'}
              </button>
              {picker?.otherApps && (
                <button type="button" className="ufd__btn" onClick={() => inputRef.current?.click()} disabled={uploading} data-testid="ufd-choose-apps">
                  <FolderOpen size={15} aria-hidden="true" /> Other apps (Drive…)
                </button>
              )}
              {picker?.photos && (
                <button type="button" className="ufd__btn" onClick={() => photosRef.current?.click()} disabled={uploading} data-testid="ufd-choose-photos">
                  <Images size={15} aria-hidden="true" /> Photos &amp; videos
                </button>
              )}
              {picker?.camera && (
                <>
                  <button type="button" className="ufd__btn" onClick={() => cameraRef.current?.click()} disabled={uploading} data-testid="ufd-take-photo">
                    <Camera size={15} aria-hidden="true" /> Take photo
                  </button>
                  <button type="button" className="ufd__btn" onClick={() => recordRef.current?.click()} disabled={uploading} data-testid="ufd-record-video">
                    <Video size={15} aria-hidden="true" /> Record video
                  </button>
                </>
              )}
              {picker?.folder && (
                <button type="button" className="ufd__btn" onClick={() => folderRef.current?.click()} disabled={uploading} data-testid="ufd-choose-folder">
                  <FolderOpen size={15} aria-hidden="true" /> Choose a folder…
                </button>
              )}
            </div>
          </div>
          <p className="ufd__limits" data-testid="ufd-limits">
            Any file type — .job, .jxl, .csv, .rw5, .dc, .trv, .dxf, .dwg, PDFs, photos (HEIC too) and videos. Up to {megabytes(uploadCapBytes())} MB per file.
          </p>
          {picker?.photos && (
            <details className="ufd__help" data-testid="ufd-trimble-help">
              <summary><HelpCircle size={14} aria-hidden="true" /> {TRIMBLE_HELP.summary}</summary>
              <ol>{TRIMBLE_HELP.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            </details>
          )}
          {!online && (
            <p className="ufd__offline" role="status" data-testid="ufd-offline">
              <WifiOff size={14} aria-hidden="true" /> This device is offline. Uploads will wait and carry on when the connection comes back — keep this window open.
            </p>
          )}

          {treeError && (
            <p className="ufd__error" role="alert">
              <AlertCircle size={14} aria-hidden="true" /> Could not load this job&apos;s folders: {treeError}
              <button type="button" className="ufd__link" onClick={() => void loadTree()}>Try again</button>
            </p>
          )}

          {items.length > 0 && (
            <>
              {/* ── 2. pick folders ── */}
              <div className="ufd__step">
                <span className="ufd__step-icon" aria-hidden="true"><FolderPlus size={18} /></span>
                <div className="ufd__step-text">
                  <strong>Choose a folder for each file</strong>
                  <span>Every file needs a folder before it can upload.</span>
                </div>
                {items.length > 1 && phase !== 'uploading' && (
                  <label className="ufd__all">
                    <span>Put every file in</span>
                    <select value="" onChange={(e) => chooseForAll(e.target.value)} disabled={loadingFolders} data-testid="ufd-all-folder">
                      {folderOptions(null)}
                    </select>
                  </label>
                )}
                {/* Only where there are standard folders to sort INTO — see `canAutoSort`. On a
                    personal Files folder, or across several jobs at once, this button could only
                    ever do nothing, and a visible control that does nothing is worse than none. */}
                {phase !== 'uploading' && canAutoSort(destinations) && (
                  <button
                    type="button"
                    className="ufd__sort"
                    onClick={sortByKind}
                    disabled={loadingFolders || uploading}
                    title="Put photos in Photos, videos in Videos, drawings in CAD and the rest in Documents"
                    data-testid="ufd-sort"
                  >
                    <Sparkles size={14} aria-hidden="true" /> Sort by type
                  </button>
                )}
              </div>

              {sorted && (
                <p className="ufd__sorted" role="status" data-testid="ufd-sorted">
                  {sorted.summary.length > 0
                    ? `Sorted: ${sorted.summary.map((s) => `${s.count} to ${s.label}`).join(', ')}.`
                    : 'Nothing could be sorted by type.'}
                  {sorted.left > 0 && ` ${sorted.left} still need${sorted.left === 1 ? 's' : ''} a folder from you.`}
                </p>
              )}

              {draft?.forKey === 'all' && renderDraft()}

              <ul className="ufd__list" aria-label="Files to upload">
                {items.map((item) => {
                  const dest = destOf(item);
                  const chosen = destById.get(item.destId);
                  const refused = chosen && !destinationAccepts(chosen, item.file);
                  const big = tooBig(item.file);
                  const locked = item.status !== 'waiting' && item.status !== 'failed';
                  const suggestion = !dest && !big && !isEmpty(item) ? suggestDestination(destinations, item.file) : null;
                  const missing = !dest && !big && !isEmpty(item) && !locked;
                  return (
                    <li key={item.key} className={`ufd__item ufd__item--${item.status}${missing && phase === 'choose' ? ' ufd__item--missing' : ''}`} data-testid="ufd-item">
                      <div className="ufd__item-main">
                        <span className="ufd__item-icon"><KindIcon file={item.file} /></span>
                        <div className="ufd__item-name">
                          <span className="ufd__item-text" title={item.file.name}>{item.file.name}</span>
                          <span className="ufd__muted">{formatBytes(item.file.size)}</span>
                        </div>

                        {big ? (
                          <span className="ufd__badge ufd__badge--bad">Too large</span>
                        ) : isEmpty(item) ? (
                          <span className="ufd__badge ufd__badge--bad">Empty</span>
                        ) : locked ? (
                          <span className="ufd__dest-locked" title={chosen ? `${chosen.group} › ${chosen.label}` : undefined}>
                            {chosen ? (multiGroup ? `${chosen.group} › ${chosen.label}` : chosen.label) : '—'}
                          </span>
                        ) : (
                          <select
                            className={`ufd__select${missing ? ' ufd__select--missing' : ''}`}
                            value={dest ? item.destId : ''}
                            onChange={(e) => chooseFor(item.key, e.target.value)}
                            disabled={loadingFolders || uploading}
                            aria-label={`Folder for ${item.file.name}`}
                            aria-invalid={missing || undefined}
                            data-testid="ufd-item-folder"
                          >
                            {folderOptions(item.file)}
                          </select>
                        )}

                        <span className="ufd__item-status">
                          {item.status === 'done' && <CheckCircle2 size={20} className="ufd__ok" aria-label="Uploaded" />}
                          {item.status === 'handed-off' && <CheckCircle2 size={20} className="ufd__ok" aria-label="Uploading in the background" />}
                          {(item.status === 'uploading' || item.status === 'finishing') && <Loader2 size={18} className="ufd__spin motion-essential" aria-label="Uploading" />}
                          {item.status === 'failed' && (
                            <button type="button" className="ufd__icon-btn" onClick={() => void retry(item)} disabled={uploading || !dest} title="Try this file again" aria-label={`Retry ${item.file.name}`}>
                              <RotateCcw size={16} aria-hidden="true" />
                            </button>
                          )}
                          {(item.status === 'waiting' || item.status === 'failed') && (
                            <button type="button" className="ufd__icon-btn" onClick={() => setItems((cur) => cur.filter((i) => i.key !== item.key))} disabled={uploading} title="Remove from the list" aria-label={`Remove ${item.file.name}`}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </div>

                      {(item.status === 'uploading' || item.status === 'finishing' || item.status === 'done') && (
                        <div className="ufd__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.pct} aria-label={`${item.file.name} upload progress`}>
                          <span className="ufd__progress-bar" style={{ width: `${item.pct}%` }} />
                        </div>
                      )}
                      {item.reading && <p className="ufd__note" data-testid="ufd-reading"><Loader2 size={12} className="ufd__spin motion-essential" aria-hidden="true" /> Reading the file…</p>}
                      {item.retryNote && <p className="ufd__note ufd__note--warn" role="status" data-testid="ufd-retry-note">{item.retryNote}</p>}
                      {item.status === 'uploading' && !item.retryNote && <p className="ufd__note">{formatBytes(item.loaded)} of {formatBytes(item.file.size)} · {item.pct}%</p>}
                      {item.status === 'finishing' && <p className="ufd__note">Saving it to the folder…</p>}
                      {item.status === 'done' && dest && <p className="ufd__note ufd__note--ok">Saved in {multiGroup ? `${dest.group} › ` : ''}{dest.label}</p>}
                      {item.status === 'handed-off' && <p className="ufd__note ufd__note--ok">Uploading in the background — you will be notified when it is done.</p>}

                      {item.note && !locked && !refused && <p className="ufd__note" data-testid="ufd-reroute-note">{item.note}</p>}
                      {dupes.has(item.file.name.toLowerCase()) && !locked && (
                        <p className="ufd__note">Another file in this list has the same name — both will be kept.</p>
                      )}
                      {isEmpty(item) && item.status !== 'failed' && (
                        <p className="ufd__note ufd__note--warn">{emptyMessage(item.file.name)}</p>
                      )}
                      {refused && !locked && <p className="ufd__note ufd__note--warn">{chosen!.label} takes {refusalFor(chosen!)} — choose another folder.</p>}
                      {suggestion && !locked && !refused && (
                        <p className="ufd__note">
                          <button type="button" className="ufd__suggest" onClick={() => chooseFor(item.key, suggestion.id)} data-testid="ufd-suggest">
                            <Sparkles size={13} aria-hidden="true" /> Put it in {suggestion.label}
                          </button>
                        </p>
                      )}
                      {big && !item.split && (
                        <p className="ufd__note ufd__note--warn">
                          Larger than {megabytes(maxBytesFor(item.file.name, item.file.type))} MB, the limit for one file.
                          {isSplittableMedia(item.file.name, item.file.type) ? (
                            <button type="button" className="ufd__btn ufd__btn--small" onClick={() => void measureSplit(item)} disabled={uploading} data-testid="ufd-split-big">
                              <Scissors size={13} aria-hidden="true" /> Cut it into parts
                            </button>
                          ) : item.file.type.startsWith('image/') ? (
                            <button type="button" className="ufd__btn ufd__btn--small" onClick={() => void shrinkToFit(item)} disabled={uploading || item.shrinking} data-testid="ufd-shrink">
                              {item.shrinking ? 'Shrinking…' : 'Shrink it to fit'}
                            </button>
                          ) : null}
                        </p>
                      )}
                      {/* Any video or audio can be cut into parts of a chosen length, not only an
                          over-limit one (owner, 2026-10-06). */}
                      {!big && !item.split && !locked && isSplittableMedia(item.file.name, item.file.type) && (
                        <p className="ufd__note">
                          <button type="button" className="ufd__btn ufd__btn--small" onClick={() => void measureSplit(item)} disabled={uploading} data-testid="ufd-split">
                            <Scissors size={13} aria-hidden="true" /> Split into {DEFAULT_PART_MINUTES}-minute parts
                          </button>
                        </p>
                      )}
                      {item.split && (
                        <div className="ufd__split">
                          <p>{item.split.message}</p>
                          {item.split.phase === 'confirm' ? (
                            <>
                              <label className="ufd__split-len">
                                Each part at most{' '}
                                <select
                                  value={item.split.minutes ?? DEFAULT_PART_MINUTES}
                                  onChange={(e) => void measureSplit(item, Number(e.target.value))}
                                  data-testid="ufd-split-minutes"
                                >
                                  {PART_MINUTE_CHOICES.map((m) => <option key={m} value={m}>{m} minute{m === 1 ? '' : 's'}</option>)}
                                </select>
                              </label>
                              <div className="ufd__newfolder-actions">
                                <button type="button" className="ufd__btn ufd__btn--primary ufd__btn--small" onClick={() => void runSplit(item)} data-testid="ufd-split-run">Cut it into {item.split.plan?.parts.length ?? ''} parts</button>
                                <button type="button" className="ufd__btn ufd__btn--small" onClick={() => update(item.key, { split: undefined })}>Cancel</button>
                              </div>
                            </>
                          ) : <Loader2 size={16} className="ufd__spin motion-essential" aria-hidden="true" />}
                        </div>
                      )}
                      {item.error && <p className="ufd__error" role="alert"><AlertCircle size={14} aria-hidden="true" /> {item.error}</p>}

                      {draft?.forKey === item.key && renderDraft()}
                    </li>
                  );
                })}
              </ul>

              {bgAvailable && phase !== 'finished' && (
                <label className="ufd__bg">
                  <input type="checkbox" checked={keepInBackground} onChange={(e) => setKeepInBackground(e.target.checked)} disabled={uploading} />
                  Keep uploading if I leave this page (files appear when the browser finishes)
                </label>
              )}
            </>
          )}
        </div>

        {/* ── 3. upload ── */}
        <footer className="ufd__foot">
          <div className="ufd__summary" role="status" aria-live="polite">
            {items.length === 0 ? (
              <span className="ufd__muted">No files added yet.</span>
            ) : phase === 'uploading' ? (
              <span><Loader2 size={14} className="ufd__spin motion-essential" aria-hidden="true" /> Uploading {batch.at} of {batch.total}… please keep this window open.</span>
            ) : phase === 'finished' && failedCount === 0 && pending.length === 0 ? (
              <span className="ufd__done"><CheckCircle2 size={16} aria-hidden="true" /> {doneCount} file{doneCount === 1 ? '' : 's'} uploaded.</span>
            ) : reading.length > 0 ? (
              <span><Loader2 size={14} className="ufd__spin motion-essential" aria-hidden="true" /> Reading {reading.length} file{reading.length === 1 ? '' : 's'}…</span>
            ) : needFolder.length > 0 ? (
              <span className="ufd__warn">Choose a folder for {needFolder.length} file{needFolder.length === 1 ? '' : 's'}.</span>
            ) : failedCount > 0 ? (
              <span className="ufd__warn" data-testid="ufd-failed-summary">{failedCount} file{failedCount === 1 ? '' : 's'} did not upload — the reason is under each one. Press Retry failed to try again.</span>
            ) : (
              <span>{items.length} file{items.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}{oversize.length > 0 ? ` · ${oversize.length} too large` : ''}</span>
            )}
          </div>
          <div className="ufd__foot-actions">
            {phase === 'finished' && pending.length === 0 ? (
              <>
                <button type="button" className="ufd__btn" onClick={() => { setItems([]); setPhase('choose'); }}>Upload more files</button>
                <button type="button" className="ufd__btn ufd__btn--primary ufd__btn--big" onClick={onClose} data-testid="ufd-done">Done</button>
              </>
            ) : (
              <>
                <button type="button" className="ufd__btn" onClick={onClose} disabled={uploading}>Cancel</button>
                {!uploading && failedReady.length > 0 && (
                  <button type="button" className="ufd__btn" onClick={() => void uploadAll(true)} disabled={!canUpload} data-testid="ufd-retry-failed">
                    <RotateCcw size={15} aria-hidden="true" /> Retry failed ({failedReady.length})
                  </button>
                )}
                <button type="button" className="ufd__btn ufd__btn--primary ufd__btn--big" onClick={() => void uploadAll()} disabled={!canUpload} data-testid="ufd-upload">
                  {uploading ? <Loader2 size={16} className="ufd__spin motion-essential" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                  {ready.length > 0 ? `Upload ${ready.length} file${ready.length === 1 ? '' : 's'}` : 'Upload'}
                </button>
              </>
            )}
          </div>
        </footer>

        {dragOver && !uploading && (
          <div className="ufd__dropveil" aria-hidden="true"><Upload size={36} /> Drop to add</div>
        )}
      </div>
    </div>
  );
}
