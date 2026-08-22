// lib/files/upload.ts
//
// F3 of FILE_EXPLORER_2026-06-25 — pure helpers for explorer uploads/downloads.
// The private bucket + signed-URL plumbing lives in the routes; this is the
// testable validation + path/mime logic.

import { uploadCapBytes, isVideoUpload } from '@/lib/storage/uploads';

export const FILE_EXPLORER_BUCKET = 'file-explorer';

/**
 * ── THE CAP, WHICH USED TO BE THIS FILE'S OWN NUMBER (2026-08-22) ───────────────────────────────
 *
 * This said 100 MB, and the bucket it guarded did not exist: `ensureStorageBucket` would have
 * created it on the first upload at its 50 MB default. A 60 MB video would then have transferred in
 * full and been refused at 100% — the same defect that cost a 375 MB job video, waiting quietly in
 * a second place.
 *
 * Seed 608 creates the bucket at 500 MB, and the number now comes from the one module that knows
 * what storage accepts. Video is a first-class thing to keep in the Files area, and a survey
 * walkthrough is measured in hundreds of megabytes.
 */
export const MAX_UPLOAD_BYTES = uploadCapBytes();

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
export function isVideoMime(m: string | null | undefined): boolean {
  return typeof m === 'string' && m.startsWith('video/');
}
/**
 * Types the in-app viewer (F6) can render inline; everything else downloads.
 *
 * Video joined the list on 2026-08-22, when the Files area started accepting 500 MB uploads: a
 * walkthrough that can only be downloaded is a walkthrough nobody watches. `<video>` streams from
 * the signed URL with range requests, so opening one does not pull half a gigabyte first.
 */
export function isPreviewable(m: string | null | undefined): boolean {
  return isImageMime(m) || isPdfMime(m) || isVideoMime(m);
}

/** A content type worth storing, even when the browser hands over an empty one — which some Android
 *  camera apps do for their own recordings. Without it the row says `application/octet-stream` and
 *  the viewer has no idea it is holding a video. */
export function contentTypeForUpload(name: string, mime?: string | null): string {
  const given = (mime ?? '').trim();
  if (given) return given;
  return isVideoUpload(name, null) ? videoTypeByExtension(name) : 'application/octet-stream';
}

function videoTypeByExtension(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    mpg: 'video/mpeg', mpeg: 'video/mpeg', hevc: 'video/hevc',
  };
  return byExt[ext] ?? 'application/octet-stream';
}
