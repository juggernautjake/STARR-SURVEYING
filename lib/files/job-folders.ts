// lib/files/job-folders.ts — THE standard structure of a job's files (owner, 2026-09-10).
//
//   Job Projects/
//     <project>/
//       Project documents/          the contract, the title commitment — files with no job
//       <job>/
//         Research/                 deeds, plats, prior surveys; every document a research run retrieved
//         CAD/                      drawings drafted in Starr CAD, CAD + Trimble files, point files
//         Photos/                   field photos (uploaded, or captured in Work Mode)
//         Videos/                   field video
//         Documents/                anything else — legal, delivery, general   (shown when it holds something)
//         Receipts/                 expenses filed against the job            (shown when it holds something)
//
// The four standard folders are ALWAYS present, empty or not — a structure people can rely on is
// the point; a folder that only appears once something is in it is a folder nobody can find to put
// the first thing in. Documents and Receipts are catch-alls and appear when non-empty.
//
// This module is pure and shared by the server (lib/files/mounts.ts, which lists the folders) and
// the client (the FolderExplorer, which uploads INTO them). One vocabulary, so a photo uploaded into
// Photos is what the Photos folder lists — there is no second rule to drift.

export type JobFolderKey = 'research' | 'cad' | 'photos' | 'videos' | 'documents' | 'receipts';

export interface JobFolderSpec {
  key: JobFolderKey;
  label: string;
  /** One line under the folder name, so the structure explains itself. */
  blurb: string;
  /** Always listed, even when empty. */
  standard: boolean;
  /** `job_files.section` a file uploaded into this folder is filed under. Null → no upload here. */
  uploadSection: string | null;
  /** `job_files.file_type` for an upload, when the folder decides it (else detected from the name). */
  uploadFileType: string | null;
  /** The browser file picker's `accept`, when the folder is for one medium. */
  accept: string | null;
  /** The rows that can appear here, by source — each re-checks its own role gate on the server. */
  sources: ReadonlyArray<'job-files' | 'research' | 'drawings' | 'field-media' | 'receipts'>;
}

export const JOB_FOLDERS: readonly JobFolderSpec[] = [
  {
    key: 'research', label: 'Research', standard: true,
    blurb: 'Deeds, plats, prior surveys — and every document a research run retrieved.',
    uploadSection: 'research', uploadFileType: null, accept: null,
    sources: ['research', 'job-files'],
  },
  {
    key: 'cad', label: 'CAD', standard: true,
    blurb: 'Drawings drafted in Starr CAD, CAD and Trimble files, point files.',
    uploadSection: 'drawing', uploadFileType: null, accept: null,
    sources: ['drawings', 'job-files'],
  },
  {
    key: 'photos', label: 'Photos', standard: true,
    blurb: 'Field photos — corners, monuments, site conditions.',
    uploadSection: 'photos', uploadFileType: 'photo',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif',
    sources: ['job-files', 'field-media'],
  },
  {
    key: 'videos', label: 'Videos', standard: true,
    blurb: 'Field video — access routes, anything a still photo cannot explain.',
    uploadSection: 'videos', uploadFileType: 'video',
    // Named types plus the bare extensions: a phone hands over video/quicktime, and some Android
    // builds send an EMPTY type for .mkv, which a types-only list would silently refuse.
    accept: 'video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mp4,.mov,.webm,.mkv,.avi,.m4v',
    sources: ['job-files', 'field-media'],
  },
  {
    key: 'documents', label: 'Documents', standard: false,
    blurb: 'Contracts, legal, delivery and general job files.',
    uploadSection: 'general', uploadFileType: null, accept: null,
    sources: ['job-files'],
  },
  {
    key: 'receipts', label: 'Receipts', standard: false,
    blurb: 'Expenses filed against this job.',
    uploadSection: null, uploadFileType: null, accept: null,
    sources: ['receipts'],
  },
];

export const JOB_FOLDER_KEYS: readonly JobFolderKey[] = JOB_FOLDERS.map((f) => f.key);

export function jobFolder(key: string | null | undefined): JobFolderSpec | null {
  return JOB_FOLDERS.find((f) => f.key === key) ?? null;
}

export function isJobFolderKey(key: string | null | undefined): key is JobFolderKey {
  return JOB_FOLDERS.some((f) => f.key === key);
}

// ── Where a job_files row belongs ────────────────────────────────────────────────────────────────
//
// The job page's old tabs split by `section` ('photos' / 'videos' / the rest) and let people file
// the rest under six section names. Those names still exist on the rows; this maps each to one of
// the standard folders, with `file_type` as the tie-break for sections that never said which.

const CAD_FILE_TYPES = new Set(['cad', 'trimble', 'field_data', 'drawing']);
const RESEARCH_FILE_TYPES = new Set(['deed', 'plat']);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi)$/i;

export function folderForJobFile(row: {
  section?: string | null;
  file_type?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
}): JobFolderKey {
  const section = (row.section ?? '').toLowerCase();
  const type = (row.file_type ?? '').toLowerCase();
  const mime = (row.mime_type ?? '').toLowerCase();
  const name = row.file_name ?? '';

  if (section === 'photos') return 'photos';
  if (section === 'videos') return 'videos';
  if (section === 'research' || RESEARCH_FILE_TYPES.has(type)) return 'research';
  if (section === 'drawing' || CAD_FILE_TYPES.has(type)) return 'cad';
  // A file typed by its bytes rather than filed anywhere: a photo is a photo wherever it was put.
  if (type === 'photo' || type === 'image' || mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'photos';
  if (type === 'video' || mime.startsWith('video/') || VIDEO_EXT.test(name)) return 'videos';
  return 'documents';
}

/** Where a Work Mode capture (`field_media`) belongs. `media_type` is photo | video | voice. */
export function folderForFieldMedia(mediaType: string | null | undefined): JobFolderKey {
  const t = (mediaType ?? '').toLowerCase();
  if (t === 'video') return 'videos';
  if (t === 'photo' || t === 'image') return 'photos';
  return 'documents';
}

// ── Labels for the flattened view ────────────────────────────────────────────────────────────────

/** "Research (3)" — a folder name with its count, the form every listing uses. */
export function folderLabel(spec: JobFolderSpec, count: number): string {
  return `${spec.label} (${count})`;
}

/** The parts of a folder id under the Jobs / Job Projects mounts, or null if it is not one. */
export function parseJobFolderId(id: string): { jobId: string; folder: JobFolderKey } | null {
  const parts = id.split(':');
  // mnt:jobs:<job>:<folder>   |   mnt:projects:<project>:<job>:<folder>
  if (parts[0] !== 'mnt') return null;
  if (parts[1] === 'jobs' && parts.length === 4 && isJobFolderKey(parts[3])) return { jobId: parts[2], folder: parts[3] };
  if (parts[1] === 'projects' && parts.length === 5 && isJobFolderKey(parts[4])) return { jobId: parts[3], folder: parts[4] };
  return null;
}

/** The project-documents folder id under Job Projects, or null. */
export function parseProjectDocsId(id: string): { projectId: string } | null {
  const parts = id.split(':');
  if (parts[0] === 'mnt' && parts[1] === 'projects' && parts.length === 4 && parts[3] === 'docs') return { projectId: parts[2] };
  return null;
}

// ── Named folders (owner, 2026-09-15) ────────────────────────────────────────────────────────────
//
// Folders people create and name themselves, inside a standard folder or at the job's top level
// (table `job_file_folders`, seed 639). Their mount id keeps the SAME number of segments as a
// standard folder, so every route that walks `mnt:jobs:<job>:<segment>` walks them too:
//
//   mnt:jobs:<job>:<root>.<folderUuid>            <root> = the standard folder it sits in, or `top`
//   mnt:projects:<project>:<job>:<root>.<folderUuid>
//
// The root is in the id because it decides the `section` an upload is filed under, and a client
// choosing a destination from a dropdown should not need a round trip to learn it.

/** The standard folders a named folder may sit in: every one that takes uploads. */
export const NAMED_FOLDER_ROOTS: readonly JobFolderKey[] = JOB_FOLDERS.filter((f) => f.uploadSection).map((f) => f.key);

export type NamedFolderRoot = JobFolderKey | 'top';

export interface NamedFolderRow {
  id: string;
  name: string;
  parent_key: string | null;
  parent_id: string | null;
  created_at?: string | null;
}

/** The segment a named folder's mount id ends in. */
export function namedFolderSegment(root: NamedFolderRoot, folderId: string): string {
  return `${root}.${folderId}`;
}

/** `photos.<uuid>` → its parts, or null when the segment is not a named folder. */
export function parseNamedFolderSegment(seg: string | null | undefined): { root: NamedFolderRoot; folderId: string } | null {
  if (!seg) return null;
  const dot = seg.indexOf('.');
  if (dot <= 0) return null;
  const root = seg.slice(0, dot);
  const folderId = seg.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(folderId)) return null;
  if (root !== 'top' && !(NAMED_FOLDER_ROOTS as readonly string[]).includes(root)) return null;
  return { root: root as NamedFolderRoot, folderId };
}

/** A named folder's mount id → the job, the standard root and the folder, or null. */
export function parseNamedFolderId(id: string): { jobId: string; root: NamedFolderRoot; folderId: string } | null {
  const parts = id.split(':');
  if (parts[0] !== 'mnt') return null;
  if (parts[1] === 'jobs' && parts.length === 4) {
    const nf = parseNamedFolderSegment(parts[3]);
    return nf ? { jobId: parts[2], ...nf } : null;
  }
  if (parts[1] === 'projects' && parts.length === 5) {
    const nf = parseNamedFolderSegment(parts[4]);
    return nf ? { jobId: parts[3], ...nf } : null;
  }
  return null;
}

/** A job's own node under either mount — `mnt:jobs:<job>` or `mnt:projects:<project>:<job>` — or null. */
export function parseJobNodeId(id: string): { jobId: string; projectId: string | null } | null {
  const parts = id.split(':');
  if (parts[0] !== 'mnt') return null;
  if (parts[1] === 'jobs' && parts.length === 3 && parts[2]) return { jobId: parts[2], projectId: null };
  if (parts[1] === 'projects' && parts.length === 4 && parts[3] && parts[3] !== 'docs') return { jobId: parts[3], projectId: parts[2] };
  return null;
}

/** What an upload INTO a named folder is filed as: its standard root's section and type, or the
 *  catch-all section for a folder at the job's top level. */
export function uploadSpecForRoot(root: NamedFolderRoot): { section: string; fileType: string | null; accept: string | null } {
  if (root === 'top') return { section: 'general', fileType: null, accept: null };
  const spec = jobFolder(root);
  return { section: spec?.uploadSection ?? 'general', fileType: spec?.uploadFileType ?? null, accept: spec?.accept ?? null };
}

/** The standard folder every named folder ultimately sits in, following `parent_id` up.
 *  Cycle-safe: a loop (which the schema cannot make, but a bad row could) resolves to `top`. */
export function namedFolderRoots(rows: readonly NamedFolderRow[]): Map<string, NamedFolderRoot> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<string, NamedFolderRoot>();
  for (const r of rows) {
    const seen = new Set<string>();
    let cur: NamedFolderRow | undefined = r;
    let root: NamedFolderRoot = 'top';
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.parent_id) { cur = byId.get(cur.parent_id); if (!cur) { root = 'top'; break; } continue; }
      root = isJobFolderKey(cur.parent_key) && (NAMED_FOLDER_ROOTS as readonly string[]).includes(cur.parent_key) ? cur.parent_key : 'top';
      break;
    }
    out.set(r.id, root);
  }
  return out;
}

/** The rule for a folder name, shared by the pop-up and the API. */
export function checkFolderName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!value) return { ok: false, error: 'Give the folder a name.' };
  if (value.length > 80) return { ok: false, error: 'Keep folder names to 80 characters or fewer.' };
  if (/[\\/:*?"<>|]/.test(value)) return { ok: false, error: 'Folder names cannot contain \\ / : * ? " < > |' };
  if (value === '.' || value === '..') return { ok: false, error: 'That is not a usable folder name.' };
  return { ok: true, value };
}

// ── What kind of file an upload is, from its name ────────────────────────────────────────────────
//
// The vocabulary `job_files.file_type` has always used (moved here from the job page's file manager
// when the standard folders replaced it, 2026-09-10). A folder that decides the type (Photos →
// photo) wins; otherwise the extension says.

export function detectJobFileType(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.toLowerCase().slice(dot) : '';
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.heic', '.heif'].includes(ext)) return 'image';
  if (['.dwg', '.dxf', '.dgn'].includes(ext)) return 'cad';
  if (['.jxl', '.dc', '.job', '.vce'].includes(ext)) return 'trimble';
  if (['.pdf', '.doc', '.docx', '.rtf', '.odt'].includes(ext)) return 'document';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'field_data';
  if (['.mp3', '.wav', '.m4a', '.ogg'].includes(ext)) return 'voice_memo';
  if (['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi'].includes(ext)) return 'video';
  if (['.tif', '.tiff', '.sid', '.ecw', '.jp2'].includes(ext)) return 'satellite_image';
  return 'other';
}
