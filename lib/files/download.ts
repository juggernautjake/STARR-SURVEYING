// lib/files/download.ts — the one way a file leaves the site for the user's computer.
//
// Owner, 2026-09-09: "whenever we click the download button, it opens the computer file explorer
// and allows the user to choose where they will save the file(s)/folder on the computer. They can
// save it as a zipped folder, or they can save individual files. They should be able to rename the
// file before saving it. What I do not want is for them to click the download button and have it
// reload the page with the document in a viewer."
//
// So: fetch the bytes here, in the page, and hand them to the browser's SAVE dialog.
//
//   1. `showSaveFilePicker` (Chrome, Edge — the office's browsers): the OS "Save as" dialog, with
//      the suggested name editable, and the bytes written straight to the chosen file.
//   2. Otherwise: an object URL on an <a download>, which downloads to the browser's download
//      folder under the suggested name. Still never a navigation.
//
// Neither path ever sets `location` or opens a tab. The old way — a link to a signed URL whose
// Content-Disposition was `inline` — is what navigated the page to the browser's PDF viewer.
//
// Browser-only. Every function is safe to import from a client component and nowhere else.

import JSZip from 'jszip';
import { zipMemberName, sanitizeFilename } from './viewer-model';

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}
interface FileSystemWritableFileStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}
type ShowSaveFilePicker = (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;

function savePicker(): ShowSaveFilePicker | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  // Only from a secure, top-level context — inside an iframe the picker throws.
  return typeof fn === 'function' && window.isSecureContext && window.self === window.top ? fn : null;
}

/** True when the OS save dialog is available, so a caller can say "Save as…" instead of "Download". */
export function canChooseWhereToSave(): boolean {
  return savePicker() !== null;
}

export type SaveOutcome = 'saved' | 'downloaded' | 'cancelled';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.zip': 'application/zip', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.dwg': 'application/acad', '.dxf': 'application/dxf',
};

function acceptFor(name: string, mime: string | null | undefined) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const type = mime && mime !== 'application/octet-stream' ? mime : MIME_BY_EXT[ext];
  return type && ext.length > 1 ? [{ description: `${ext.slice(1).toUpperCase()} file`, accept: { [type]: [ext] } }] : undefined;
}

/**
 * Save bytes to the user's computer under a suggested name they can change.
 * Resolves 'cancelled' when the person closed the dialog — that is not an error.
 */
export async function saveBlob(blob: Blob, suggestedName: string, mime?: string | null): Promise<SaveOutcome> {
  const name = sanitizeFilename(suggestedName);
  const picker = savePicker();
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: acceptFor(name, mime ?? blob.type) });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'cancelled';
      // A picker that failed for another reason (a policy, a sandbox) falls through to the link.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return 'downloaded';
}

export class FetchFailed extends Error {
  constructor(public readonly url: string, public readonly status: number | null, message: string) {
    super(message);
  }
}

/** The bytes at a URL, as a Blob. Throws FetchFailed with the status, so a zip can name the file
 *  that did not come. `credentials: 'same-origin'` so our own routes carry the session while a redirect to storage (which answers with `*`) is not poisoned by credentials. */
export async function fetchBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', signal });
  } catch (err) {
    throw new FetchFailed(url, null, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) throw new FetchFailed(url, res.status, `HTTP ${res.status}`);
  return res.blob();
}

/** Download one file: fetch it, then the save dialog. Never navigates. */
export async function downloadFile(url: string, name: string, mime?: string | null, signal?: AbortSignal): Promise<SaveOutcome> {
  const blob = await fetchBlob(url, signal);
  return saveBlob(blob, name, mime ?? blob.type);
}

export interface ZipEntry {
  name: string;
  url: string;
  /** A folder path inside the archive ("24-103 — Smith/Photos"); the whole-job zip keeps its structure. */
  folder?: string | null;
}

export interface ZipProgress {
  done: number;
  total: number;
  current: string;
}

export interface ZipResult {
  outcome: SaveOutcome;
  /** Files that could not be fetched and are NOT in the archive — named, never a count. */
  failed: Array<{ name: string; reason: string }>;
  included: number;
}

/**
 * Download a folder's files as one .zip: fetch each, pack them, save. Fetches run four at a time.
 * A file that fails to fetch is left out and NAMED in the result; the rest still ship — a person
 * who asked for forty files should not lose thirty-nine because one signed URL expired.
 */
export async function downloadZip(
  entries: ZipEntry[],
  zipFileName: string,
  onProgress?: (p: ZipProgress) => void,
  signal?: AbortSignal,
): Promise<ZipResult> {
  const zip = new JSZip();
  // Member names are unique PER FOLDER of the archive, so two jobs can each hold a scan.pdf.
  const takenIn = new Map<string, Set<string>>();
  const memberName = (entry: ZipEntry) => {
    const folder = (entry.folder ?? '').split('/').map((seg) => sanitizeFilename(seg.trim(), '')).filter(Boolean).join('/');
    let taken = takenIn.get(folder);
    if (!taken) { taken = new Set<string>(); takenIn.set(folder, taken); }
    const base = zipMemberName(entry.name, taken);
    return folder ? folder + '/' + base : base;
  };
  const failed: Array<{ name: string; reason: string }> = [];
  let done = 0;
  const queue = [...entries];
  const worker = async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      onProgress?.({ done, total: entries.length, current: entry.name });
      try {
        const blob = await fetchBlob(entry.url, signal);
        zip.file(memberName(entry), blob);
      } catch (err) {
        failed.push({ name: entry.name, reason: err instanceof Error ? err.message : String(err) });
      }
      done += 1;
      onProgress?.({ done, total: entries.length, current: entry.name });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  const included = entries.length - failed.length;
  if (included === 0) return { outcome: 'cancelled', failed, included: 0 };
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const outcome = await saveBlob(blob, sanitizeFilename(zipFileName.endsWith('.zip') ? zipFileName : `${zipFileName}.zip`), 'application/zip');
  return { outcome, failed, included };
}
