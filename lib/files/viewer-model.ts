// lib/files/viewer-model.ts — the one shape every file surface hands the shared viewer.
//
// Owner, 2026-09-09: "We need to make all of these uniform … use a uniform file viewer everywhere on
// the site." The explorer, a job's files, the research documents and anything that comes later each
// keep their own tables and routes; what they share is THIS: a folder-like collection of files, and
// a set of things the surface is able to do to them (rename, notes, tags, move/copy, delete). The
// viewer renders the collection and calls the capabilities; it never knows which table it came from.
//
// Pure — no React, no DOM. `fileKind`, the neighbour helpers and the name rules are unit-tested.

export type FileKind = 'pdf' | 'image' | 'text' | 'video' | 'audio' | 'other';

export interface ViewerFile {
  id: string;
  /** The display name, with extension. */
  name: string;
  mime: string | null;
  size: number | null;
  /** Where the bytes can be fetched for VIEWING (a signed URL, an API route). Null → no preview. */
  url: string | null;
  /** Where the bytes can be fetched for DOWNLOADING, if different (e.g. a signed URL that carries a
   *  Content-Disposition: attachment). Falls back to `url`. */
  downloadUrl?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  pageCount?: number | null;
  notes?: string | null;
  tags?: string[];
  /** Surface-specific facts shown read-only in the info panel (document type, stage, county…). */
  meta?: Array<{ label: string; value: string }>;
  /** A sub-folder within the collection, when the surface has folders (the explorer, job sections). */
  folder?: string | null;
}

export interface ViewerFolder {
  id: string;
  name: string;
  notes?: string | null;
  tags?: string[];
}

export interface ViewerCollection {
  /** The folder / job / project the files belong to. */
  id: string;
  title: string;
  files: ViewerFile[];
  folder?: ViewerFolder | null;
}

export interface Destination {
  id: string;
  label: string;
  /** e.g. "Job 26143" / "Project P-2026-0013" / "/Surveys/2026" */
  hint?: string;
}

/** What a surface can do. Every member optional: the viewer shows a control only when the
 *  capability exists, so a read-only mount simply has no rename field. */
export interface ViewerCapabilities {
  rename?: (file: ViewerFile, newName: string) => Promise<ViewerFile>;
  updateNotes?: (file: ViewerFile, notes: string) => Promise<ViewerFile>;
  updateTags?: (file: ViewerFile, tags: string[]) => Promise<ViewerFile>;
  renameFolder?: (folder: ViewerFolder, newName: string) => Promise<ViewerFolder>;
  updateFolderNotes?: (folder: ViewerFolder, notes: string) => Promise<ViewerFolder>;
  updateFolderTags?: (folder: ViewerFolder, tags: string[]) => Promise<ViewerFolder>;
  /** Whether a folder in the explorer pop-up may be chosen as this surface's destination. Absent →
   *  any folder the person can edit (the explorer's own rule). The pop-up shows `sendHint`. */
  canSendTo?: (folder: { id: string; name: string; access: string }) => boolean;
  sendHint?: string;
  move?: (file: ViewerFile, destination: Destination) => Promise<void>;
  copy?: (file: ViewerFile, destination: Destination) => Promise<void>;
  delete?: (file: ViewerFile) => Promise<void>;
}

// ── Kind ──────────────────────────────────────────────────────────────────

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;
const TEXT_EXT = /\.(txt|md|csv|json|log|xml|yaml|yml|rtf)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)$/i;

export function fileKind(name: string | null | undefined, mime?: string | null): FileKind {
  const m = (mime ?? '').toLowerCase();
  const n = name ?? '';
  if (m === 'application/pdf' || /\.pdf$/i.test(n)) return 'pdf';
  if (m.startsWith('image/') || IMAGE_EXT.test(n)) return 'image';
  if (m.startsWith('video/') || VIDEO_EXT.test(n)) return 'video';
  if (m.startsWith('audio/') || AUDIO_EXT.test(n)) return 'audio';
  if (m.startsWith('text/') || m === 'application/json' || TEXT_EXT.test(n)) return 'text';
  return 'other';
}

/** "deed-scan.pdf" → { base: "deed-scan", ext: ".pdf" }. A dotfile or an extensionless name has no ext. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/** A name safe for a filesystem and a Content-Disposition header: no path separators, no control
 *  characters, no leading dots, trimmed, at most 200 characters. The extension is preserved. */
export function sanitizeFilename(name: string, fallback = 'file'): string {
  const cleaned = name
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (!cleaned) return fallback;
  if (cleaned.length <= 200) return cleaned;
  const { base, ext } = splitName(cleaned);
  return base.slice(0, 200 - ext.length) + ext;
}

/** Rename keeps the extension unless the new name supplies one — a person renaming "scan.pdf" to
 *  "deed" gets "deed.pdf", not a file nothing will open. */
export function applyRename(currentName: string, typed: string): string {
  const next = sanitizeFilename(typed, splitName(currentName).base || 'file');
  const { ext: currentExt } = splitName(currentName);
  const { ext: typedExt } = splitName(next);
  return typedExt || !currentExt ? next : next + currentExt;
}

// ── Neighbours ────────────────────────────────────────────────────────────

export function neighbourIndex(files: ViewerFile[], currentId: string, step: 1 | -1): number | null {
  const i = files.findIndex((f) => f.id === currentId);
  if (i < 0) return null;
  const j = i + step;
  return j >= 0 && j < files.length ? j : null;
}

// ── Tags ──────────────────────────────────────────────────────────────────

/** "deed, Plat ,deed" → ['deed', 'plat']: lower-cased, trimmed, de-duplicated, at most 20, ≤ 40 chars. */
export function normalizeTags(raw: string[] | string): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[,\n]/);
  const out: string[] = [];
  for (const t of list) {
    const v = t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}

/** The zip's member name for a file: unique within the archive, safe for a filesystem. */
export function zipMemberName(name: string, taken: Set<string>): string {
  const safe = sanitizeFilename(name);
  if (!taken.has(safe)) { taken.add(safe); return safe; }
  const { base, ext } = splitName(safe);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
  }
  const last = `${base}-${Date.now()}${ext}`;
  taken.add(last);
  return last;
}

/** "Job 26143 files" → "Job 26143 files.zip", sanitized. */
export function zipName(title: string): string {
  return sanitizeFilename(`${title.trim() || 'files'}.zip`);
}
