// lib/files/upload.ts
//
// F3 of FILE_EXPLORER_2026-06-25 — pure helpers for explorer uploads/downloads.
// The private bucket + signed-URL plumbing lives in the routes; this is the
// testable validation + path/mime logic.

export const FILE_EXPLORER_BUCKET = 'file-explorer';
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export interface UploadValidation {
  ok: boolean;
  error?: string;
}

/** Pure — validate an upload request's name + size. */
export function validateUpload(input: { name?: string | null; sizeBytes?: number | null }): UploadValidation {
  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, error: 'A file name is required.' };
  const size = input.sizeBytes ?? 0;
  if (!Number.isFinite(size) || size < 0) return { ok: false, error: 'Invalid file size.' };
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Files must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.` };
  }
  return { ok: true };
}

/** Pure — build a collision-proof storage key under a unique id, keeping a
 *  filesystem-safe version of the name (extension preserved). */
export function buildStoragePath(uniqueId: string, name: string): string {
  const safe = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 120) || 'file';
  return `explorer/${uniqueId}/${safe}`;
}

export function isImageMime(m: string | null | undefined): boolean {
  return typeof m === 'string' && m.startsWith('image/');
}
export function isPdfMime(m: string | null | undefined): boolean {
  return m === 'application/pdf';
}
/** Types the in-app viewer (F6) can render inline; everything else downloads. */
export function isPreviewable(m: string | null | undefined): boolean {
  return isImageMime(m) || isPdfMime(m);
}
