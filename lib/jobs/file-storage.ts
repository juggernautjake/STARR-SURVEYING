// lib/jobs/file-storage.ts — where a job's files actually live, and how to reach them.
//
// ── THE DEFECT THIS EXISTS TO FIX ────────────────────────────────────────────────────────────────
//
// `job_files` has been written by two different halves of this platform, in two different shapes,
// and neither could read the other's rows:
//
//   the mobile app  → `storage_path` + `content_type` + `file_size_bytes` + `upload_state`, bytes in
//                     the `starr-field-files` bucket. This is also the shape `lib/files/mounts.ts`
//                     reads.
//   the job page    → `file_name` + `file_url`, where `file_url` is the whole file **base64-encoded
//                     as a `data:` URI**, stored in a Postgres text column. `FileReader
//                     .readAsDataURL` in `JobFileManager`, posted as JSON.
//
// Two consequences, both measured against the live database rather than reasoned about:
//
//   1. **The File Explorer's "Job Files" folder is structurally empty.** It filters
//      `upload_state = 'done'` and `storage_path is not null`, which no file uploaded from the job
//      page has ever had. The one live `job_files` row is a `data:` URI with `upload_state
//      = 'pending'` — visible on the job page, invisible in the file system. That is the whole of
//      *"properly hooked up to our file management system"*: not a missing link, a missing shape.
//
//   2. **A 10 MB PDF is ~13 MB of base64 in a row that `select('*')` pulls to render a file list.**
//      And the auto-backup inserts a SECOND row holding the same base64 again. Nothing fails; the
//      job page just gets slower every time somebody attaches a drawing, and the bill arrives as
//      egress on a query nobody thinks of as large.
//
// So the web now writes the mobile shape — one shape, three consumers — and everything that already
// reads it starts working with no further change. Legacy `data:` rows are NOT migrated in place;
// they are still read, still downloadable, still previewable, and simply labelled for what they are.
// Rewriting somebody's existing attachment is a worse failure than carrying it.
//
// Pure. No I/O. Tested in `__tests__/jobs/file-storage.test.ts`.

import { uploadCapBytes, isVideoUpload, contentTypeFor } from '@/lib/storage/uploads';

/** Re-exported so every existing caller keeps a single import site for "how a job file is
 *  uploaded", while the definitions live beside the cap they belong to. */
export { isVideoUpload, contentTypeFor };

/** The bucket the mobile app already uploads job files to, and the one `resolveMountFile` signs. */
export const JOB_FILES_BUCKET = 'starr-field-files';

/** ── WHERE VIDEO GOES, AND WHY IT IS NOT HERE (2026-08-19) ─────────────────────────────────────
 *
 *  Owner: *"I need to be able to upload videos from phones, including android and iphones."*
 *
 *  `starr-field-files` caps at 100 MB — seed 226 says so and explains itself: *"videos go in
 *  starr-field-videos"*. A phone shoots ~350 MB per minute at 4K and ~65 MB at 1080p, so at
 *  default iPhone settings anything past about seventeen seconds of 4K was refused outright.
 *
 *  The video bucket already existed, allows video MIME types, and caps at 500 MB. Video now goes
 *  there; everything else stays put.
 *
 *  2026-08-22: `starr-field-files` is 500 MB too now (seed 607), so the two no longer differ on
 *  SIZE — they differ on what may be stored. The video bucket keeps a MIME allowlist, which is the
 *  guard that actually stops a drone flight being filed as "the survey". */
export const JOB_VIDEOS_BUCKET = 'starr-field-videos';

/**
 * ── THE ONLY LIMIT THAT IS REAL ────────────────────────────────────────────────────────────────
 *
 * Owner, 2026-08-19: *"Right now I am trying to upload a 375MB video and it is failing… once the
 * upload gets to 100%, it throws a 400 error."*
 *
 * Because the limit this code believed in did not exist. `job_files` said 100 MB and the video
 * bucket said 500 MB, and Supabase caps every upload at the PROJECT level, which overrode both — at
 * 50 MB, probed by uploading real bytes. All 375 MB were spent before anybody found out, which is
 * what a client cap larger than the server's always produces.
 *
 * The number now lives in `lib/storage/uploads.ts`, once, for every upload surface in the app — the
 * job page, the File Explorer, and anything added later. That module carries the measurements and
 * the ordering rule for raising it. Nothing about a job makes its cap special, and a second copy of
 * the number here is precisely how there came to be three.
 */

/** What storage will actually accept. One number, because there is only one real limit. */
export const MAX_JOB_FILE_BYTES = uploadCapBytes();
/** Video is capped by the same number: both buckets are 500 MB since seed 607. */
export const MAX_JOB_VIDEO_BYTES = uploadCapBytes();

/** Which bucket an upload belongs in. One function, so the upload, the row and the download can
 *  never disagree about where the bytes are. */
export function bucketFor(name?: string | null, mime?: string | null): string {
  return isVideoUpload(name, mime) ? JOB_VIDEOS_BUCKET : JOB_FILES_BUCKET;
}

/**
 * Which bucket an EXISTING row's bytes are in.
 *
 * `storage_bucket` is authoritative when set. When it is null the row predates seed 605, and every
 * one of those was written to the files bucket — inferring from the filename instead would send a
 * legacy `.mp4` to the video bucket, where it has never been, and 404.
 */
export function bucketOf(row: JobFileRow): string {
  const named = (row.storage_bucket ?? '').trim();
  return named || JOB_FILES_BUCKET;
}

/** The cap that actually applies to this file, which depends on where it is going. */
export function maxBytesFor(name?: string | null, mime?: string | null): number {
  return isVideoUpload(name, mime) ? MAX_JOB_VIDEO_BYTES : MAX_JOB_FILE_BYTES;
}

export interface JobFileRow {
  id?: string | null;
  file_name?: string | null;
  /** The mobile/File-Explorer name column. Written by the web path too, from now on. */
  name?: string | null;
  /** What a person renamed this to (seeds/607). Preferred over both name columns for display. */
  label?: string | null;
  /** Free-text tags for filtering (seeds/607). Normalised by `lib/files/labels.ts` before storage. */
  tags?: string[] | null;
  file_url?: string | null;
  storage_path?: string | null;
  upload_state?: string | null;
  mime_type?: string | null;
  content_type?: string | null;
  file_size?: number | null;
  file_size_bytes?: number | null;
  file_node_id?: string | null;
  /** Which bucket holds the object (seeds/605). Null on rows written before video got its own. */
  storage_bucket?: string | null;
}

/**
 * How a row holds its bytes. Five answers, because a job file has been created five ways and a
 * reader that assumes one of them shows an empty panel for the other four.
 *
 *   linked         a File Explorer document — no bytes of its own, by design (F5)
 *   storage        an object in `starr-field-files` — the shape everything now writes
 *   legacy-inline  a `data:` URI in the database — the old web path
 *   legacy-remote  an ordinary URL somebody pasted or an old import produced
 *   missing        a row with nowhere to get the bytes; say so rather than render a dead link
 */
export type JobFileShape = 'linked' | 'storage' | 'legacy-inline' | 'legacy-remote' | 'missing';

export function shapeOf(row: JobFileRow): JobFileShape {
  if (row.file_node_id) return 'linked';
  // Checked before `file_url` on purpose: a row that has BOTH (a legacy row later re-uploaded)
  // should serve the durable object, not the base64 fossil.
  if ((row.storage_path ?? '').trim()) return 'storage';
  const url = (row.file_url ?? '').trim();
  if (url.startsWith('data:')) return 'legacy-inline';
  if (/^https?:\/\//i.test(url)) return 'legacy-remote';
  return 'missing';
}

/**
 * Where the browser should point to get this file.
 *
 * Every shape resolves to something an `<a href>` or an `<img src>` can use directly — which is why
 * the download route answers with a REDIRECT to a signed URL rather than JSON carrying one. A photo
 * gallery that has to fetch-then-parse before it can show a thumbnail is a gallery that flickers.
 */
export function downloadHref(row: JobFileRow): string | null {
  switch (shapeOf(row)) {
    case 'linked':
      // The File Explorer's own route, so its permissions are re-checked at download time by the
      // module that owns them. A job must never become a side door around them.
      return `/api/admin/files/${row.file_node_id}/download`;
    case 'storage':
      return row.id ? `/api/admin/jobs/files/${row.id}/download` : null;
    case 'legacy-inline':
    case 'legacy-remote':
      return (row.file_url ?? '').trim() || null;
    default:
      return null;
  }
}

/**
 * The name to show, whichever writer made the row.
 *
 * `label` wins (2026-08-22). It is the one name a person actually chose — everything after it is a
 * name some machine produced: the phone's `IMG_4417.MOV`, the mobile app's `name`, or nothing.
 *
 * `file_name` is deliberately NOT overwritten when somebody renames a file. The storage key is
 * derived from it, the download's filename comes from it, and it is what the crew member who shot
 * the video will search for. See `lib/files/labels.ts`.
 */
export function displayName(row: JobFileRow): string {
  return (
    (row.label ?? '').trim()
    || (row.file_name ?? '').trim()
    || (row.name ?? '').trim()
    || 'File'
  );
}

/** The uploaded name, ignoring any label — for the download filename and the "originally" hint. */
export function originalName(row: JobFileRow): string {
  return (row.file_name ?? '').trim() || (row.name ?? '').trim() || 'File';
}

/** The media type, from whichever column the writer used. */
export function mimeOf(row: JobFileRow): string | null {
  return (row.mime_type ?? '').trim() || (row.content_type ?? '').trim() || null;
}

/** The size, from whichever column the writer used. */
export function sizeOf(row: JobFileRow): number | null {
  const a = row.file_size;
  const b = row.file_size_bytes;
  if (typeof a === 'number' && Number.isFinite(a) && a >= 0) return a;
  if (typeof b === 'number' && Number.isFinite(b) && b >= 0) return b;
  return null;
}

/**
 * A collision-proof key inside the bucket.
 *
 * Deliberately the same three-part shape the mobile app writes (`<owner>/<tag>-<id>-<name>`), so one
 * bucket listing reads coherently no matter which half of the platform put the file there. `web-`
 * rather than mobile's `job-`/`point-` tag, because knowing where an attachment came from has
 * settled more than one "why is this file different" question.
 */
export function jobFileStoragePath(ownerKey: string, fileId: string, name: string): string {
  // Runs of dots collapse to one. Sanitising only the SEPARATORS out of `../../etc/passwd` leaves
  // `.._.._etc_passwd`, which still carries `..` — harmless against object storage, where a key is
  // an opaque string, but it is the kind of thing that trips a tool three layers away and reads
  // like an attempt in a log. Caught by a test written to assert it could not happen.
  const owner = ((ownerKey || '')
    .replace(/[^a-zA-Z0-9._@-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/_+/g, '_')
    .slice(0, 80)) || 'unknown';
  const safe = ((name || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/_+/g, '_')
    .slice(0, 120)) || 'file';
  return `${owner}/web-${fileId}-${safe}`;
}

export interface UploadCheck {
  ok: boolean;
  error?: string;
}

/** Validate before handing out a signed URL — a name that is only whitespace produces a storage key
 *  nobody can find again, and the bucket rejects the oversized upload only after it has been sent. */
export function checkJobUpload(input: { name?: string | null; sizeBytes?: number | null; mime?: string | null }): UploadCheck {
  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, error: 'A file name is required.' };
  const size = input.sizeBytes;
  if (size == null || !Number.isFinite(size) || size < 0) return { ok: false, error: 'Invalid file size.' };
  if (size === 0) return { ok: false, error: 'That file is empty.' };

  // The cap depends on where the file is going — 500 MB for video, 100 MB for everything else.
  // Applying the documents cap to video is what refused seventeen seconds of iPhone 4K.
  const cap = maxBytesFor(name, input.mime);
  if (size > cap) {
    const isVideo = isVideoUpload(name, input.mime);
    return {
      ok: false,
      // Say what it is and what the limit is, not just that it failed — the person's next move is
      // to re-record shorter or drop the resolution, and neither is guessable from "too large".
      // The number is the REAL one now, so this message is actionable instead of misleading. A
      // video over it is offered a split by the caller rather than simply refused.
      error: isVideo
        ? `Videos must be ${Math.round(cap / 1024 / 1024)} MB or smaller. This one is `
          + `${Math.round(size / 1024 / 1024)} MB — it can be split into parts that fit.`
        : `Files must be ${Math.round(cap / 1024 / 1024)} MB or smaller. This one is `
          + `${Math.round(size / 1024 / 1024)} MB.`,
    };
  }
  return { ok: true };
}

/**
 * Should this upload get an automatic `[BACKUP]` twin?
 *
 * Only the legacy inline path. The backup row exists because `file_url` held the ONLY copy of the
 * bytes, so a second row genuinely was a second copy. A storage-backed row points at a durable
 * object, and a twin row pointing at the SAME key backs up nothing while doubling what the job
 * shows the user — the identical reasoning already written here for linked documents (F5).
 */
export function wantsBackupRow(row: JobFileRow, requested: boolean): boolean {
  if (!requested) return false;
  return shapeOf(row) === 'legacy-inline';
}
