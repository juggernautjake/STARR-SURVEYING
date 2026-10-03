// lib/files/my-files-upload.ts — the rules for a My Files upload, shared by the sign route, the row
// route and the page (2026-10-01). Pure.

export const MY_FILES_BUCKET = 'user-files';
/** The `user-files` bucket's own limit (seeds/295). */
export const MY_FILES_MAX_BYTES = 50 * 1024 * 1024;

/** The folder in the bucket every one of a person's objects lives under. */
export function myFilesOwnerPrefix(email: string): string {
  return `${email.replace(/[^\w.@-]+/g, '_')}/`;
}

export function myFilesStoragePath(email: string, objectId: string, name: string): string {
  const safe = (name || 'file').replace(/[^\w.-]+/g, '_').slice(0, 120) || 'file';
  return `${myFilesOwnerPrefix(email)}${objectId}-${safe}`;
}

export function checkMyFilesUpload(input: { name?: string | null; sizeBytes?: number | null }):
  { ok: true } | { ok: false; status: number; error: string } {
  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, status: 400, error: 'A file name is required.' };
  const size = input.sizeBytes;
  if (size == null || !Number.isFinite(size) || size < 0) return { ok: false, status: 400, error: 'Invalid file size.' };
  if (size === 0) return { ok: false, status: 400, error: `“${name}” is empty (0 bytes).` };
  if (size > MY_FILES_MAX_BYTES) {
    return { ok: false, status: 413, error: `“${name}” is ${Math.round(size / 1024 / 1024)} MB — My Files takes up to ${MY_FILES_MAX_BYTES / 1024 / 1024} MB per file.` };
  }
  return { ok: true };
}

/** A row may only point at an object under the caller's own prefix — never someone else's file. */
export function ownsStoragePath(email: string, path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(myFilesOwnerPrefix(email)) && !path.includes('..');
}
