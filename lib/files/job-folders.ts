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
