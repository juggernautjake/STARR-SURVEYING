// lib/storage/uploads.ts — the one upload limit, and the two decisions that hang off it.
//
// ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────────────────────────
//
// On 2026-08-19 a 375 MB video transferred every byte and was refused at 100%, because this
// codebase believed in THREE upload limits — 100 MB in `job_files`, 500 MB in the video bucket,
// 50 MB in `ensureStorageBucket`'s default — and none of them was the number storage enforced.
// Fixing that in `lib/jobs/file-storage.ts` fixed the job page and left the File Explorer holding
// a fourth number (100 MB) over a bucket that did not exist yet and would have been created at 50.
//
// So the number lives HERE, once, and every upload surface imports it. A surface that wants its own
// cap is welcome to a smaller one — a cap below the bucket's only ever refuses early, which is
// safe. What is never safe is a cap ABOVE the server's, because the client spends the whole
// transfer before anybody is told it was refused.
//
// ── THE CHAIN, EVERY LINK MEASURED (2026-08-22) ─────────────────────────────────────────────────
//
//     app cap 500 MB  ≤  buckets 500 MB  ≤  Supabase project ceiling 2 GB
//
// Proven by sending real bytes with `scripts/check-upload-ceiling.mjs`, not by reading a config:
//
//     51 MB   → accepted (22s)     — the old 50 MB project wall, gone
//     500 MB  → accepted (202s)    starr-field-videos
//     500 MB  → accepted (199s)    starr-field-files
//     500 MB  → accepted (191s)    file-explorer
//
// The binding constraint is the BUCKETS, not the project ceiling, which is why this is 500 MB and
// not 2 GB. There is 1.5 GB of headroom above the buckets, so going higher needs no dashboard trip:
// raise every bucket's `file_size_limit` in a seed FIRST, then this constant. Never the reverse.
//
// Pure. No I/O, no `next/*`, safe in both a server route and a client component.

/** What the buckets accept, proven by transfer on 2026-08-22. Seeds 605, 607 and 608 set it. */
export const STORAGE_UPLOAD_CAP_BYTES = 500 * 1024 * 1024;

/**
 * The cap this deployment uses.
 *
 * `NEXT_PUBLIC_MAX_UPLOAD_BYTES` still overrides, for a one-off or for an environment whose buckets
 * differ — but it is deliberately NOT how the 500 MB is configured. A number that has to be right
 * in three environments is wrong in one of them; a constant in the repo is right everywhere.
 */
export function uploadCapBytes(): number {
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : STORAGE_UPLOAD_CAP_BYTES;
}

/** Round to whole MB for a message a person reads. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3g2|mpe?g|hevc)$/i;

/**
 * Is this a video, by the two signals a browser actually gives us?
 *
 * The MIME type is checked first and the extension second, because a phone is unreliable about
 * exactly one of them at a time: iOS reports `video/quicktime` correctly but some Android camera
 * apps hand over an EMPTY type for their own recording. Trusting only the type sends a 300 MB
 * `.mp4` to the documents bucket, where it is refused for a reason nobody can act on.
 */
export function isVideoUpload(name?: string | null, mime?: string | null): boolean {
  if ((mime ?? '').toLowerCase().startsWith('video/')) return true;
  return VIDEO_EXT.test((name ?? '').trim());
}

/**
 * A content type storage will accept for this upload.
 *
 * `xhr.send(file)` lets the browser set the header from `File.type`, which is empty often enough to
 * matter — and the video bucket has a MIME allowlist, so an empty type is rejected with a message
 * about MIME types that means nothing to somebody holding a phone. Falling back to the extension
 * turns that into an upload that simply works, and gives the viewer a type it can play.
 */
export function contentTypeFor(name?: string | null, mime?: string | null): string {
  const given = (mime ?? '').trim();
  if (given) return given;
  const ext = (name ?? '').toLowerCase().match(VIDEO_EXT)?.[1] ?? '';
  const byExt: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    mpg: 'video/mpeg', mpeg: 'video/mpeg', hevc: 'video/hevc',
  };
  return byExt[ext] ?? 'application/octet-stream';
}

/**
 * Turn storage's refusal into something the person holding the phone can act on.
 *
 * ── THE FAILURE THIS NAMES ──────────────────────────────────────────────────────────────────────
 *
 * There is exactly one way a correctly-sized upload still dies at 100%: the app's cap is above what
 * the server accepts, so the route signs the URL, the client sends every byte, and storage refuses
 * the object at the very end. That is the 375 MB video of 2026-08-19.
 *
 * Supabase answers that case with `413` in a JSON `statusCode` — inside an HTTP **400** — and the
 * message "The object exceeded the maximum allowed size". Reporting it as `Upload failed (400)`
 * sent the last investigation looking at the route, which was fine, instead of at the limits, which
 * were not. So it is named here, with the thing that would have to change.
 *
 * Since 2026-08-22 the thing to change is the BUCKET, not the dashboard: the project ceiling is
 * 2 GB and no longer binds.
 */
export function explainPutFailure(
  status: number,
  responseText: string,
  file: { name: string; size: number },
): string {
  const body = (responseText ?? '').toLowerCase();
  const tooBig =
    status === 413
    || body.includes('exceeded the maximum allowed size')
    || body.includes('payload too large')
    || body.includes('"statuscode":"413"');

  if (tooBig) {
    return (
      `Storage refused ${file.name} (${megabytes(file.size)} MB) as too large, after the whole file `
      + 'had been sent. This app is configured to allow more than the bucket accepts. Raise the '
      + "bucket's file_size_limit in a seed, then STORAGE_UPLOAD_CAP_BYTES in "
      + 'lib/storage/uploads.ts — in that order — and prove it with '
      + '`node scripts/check-upload-ceiling.mjs --bucket <name> --expect <MB>`.'
    );
  }

  if (status === 0) {
    return 'The connection dropped during the upload. Large files need the transfer to hold for its whole duration — try again with a stronger signal.';
  }
  if (status === 401 || status === 403) {
    return 'The upload link expired before the file finished sending. Try again — a fresh link is issued each time.';
  }
  return `Upload failed (${status}).`;
}
