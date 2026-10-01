// lib/files/recent.ts — "was this file uploaded recently?" (owner, 2026-09-29).
//
// "files that have been recently uploaded to a job or project or something get a tag that says as
// much. It should show if the file was uploaded in the last 24 hours."
//
// Pure, so every file list asks the same question the same way and the tests can pin the edges.

/** How long a file counts as new after it is uploaded. */
export const RECENT_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** True when `uploadedAt` falls within the last 24 hours. A missing or unreadable date is never
 *  recent. A date slightly in the future (a clock a few minutes ahead of the server's) still is. */
export function isRecentUpload(uploadedAt: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (!uploadedAt) return false;
  const t = uploadedAt instanceof Date ? uploadedAt.getTime() : Date.parse(uploadedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < RECENT_UPLOAD_MS && t - now < 60 * 60 * 1000;
}

/** "Uploaded 5 minutes ago" / "Uploaded 3 hours ago", for the tag's tooltip. */
export function uploadedAgo(uploadedAt: string | Date, now: number = Date.now()): string {
  const t = uploadedAt instanceof Date ? uploadedAt.getTime() : Date.parse(uploadedAt);
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'Uploaded just now';
  if (mins < 60) return `Uploaded ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  return `Uploaded ${hours} hour${hours === 1 ? '' : 's'} ago`;
}
