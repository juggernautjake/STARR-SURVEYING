// lib/jobs/briefings.ts — the rules the briefing routes share, kept pure so they can be tested
// without a database. Slice B3 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// ── WHY THE STORAGE PATH IS A FUNCTION ──────────────────────────────────────────────────────────
//
// A file name arrives from a browser. It may contain a slash, a `..`, a non-ASCII character, or be
// 400 characters long — none of which are attacks in this product's threat model, and all of which
// break an object key. The upload URL and the completion call must derive the SAME path from the
// same inputs, so it is computed once here rather than agreed twice.

/** Buckets, by what the item is. `starr-field-videos` already allows 500 MB, which is the reason a
 *  screen recording has somewhere to go without provisioning anything. */
export const BRIEFING_BUCKETS = {
  video: 'starr-field-videos',
  photo: 'starr-field-photos',
  file: 'starr-field-files',
} as const;

export type BriefingItemKind = keyof typeof BRIEFING_BUCKETS | 'note';

/** Bucket ceilings, mirrored from Supabase so the API can refuse a file the storage layer would
 *  reject anyway — a 413 from the CDN mid-upload is a worse error than a sentence up front. */
export const BUCKET_LIMIT_BYTES: Record<string, number> = {
  'starr-field-videos': 500 * 1024 * 1024,
  'starr-field-photos': 25 * 1024 * 1024,
  'starr-field-files': 100 * 1024 * 1024,
};

/**
 * A safe object key for a briefing item.
 *
 * Shape: `briefings/<briefingId>/<uuid>-<slug><ext>`. The uuid is what makes two uploads of
 * `Screen Recording.webm` two files rather than one silently overwriting the other — which is the
 * ordinary case here, because that is what every OS calls the second recording.
 */
export function briefingObjectPath(briefingId: string, fileName: string, uniqueId: string): string {
  const dot = fileName.lastIndexOf('.');
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : '';
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? `.${rawExt.toLowerCase()}` : '';
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
  return `briefings/${briefingId}/${uniqueId}-${base || 'file'}${ext}`;
}

/** Which bucket an item of this kind belongs in, or null when the kind stores no bytes. */
export function bucketForKind(kind: string): string | null {
  if (kind === 'note') return null;
  return (BRIEFING_BUCKETS as Record<string, string>)[kind] ?? null;
}

export interface UploadRequest {
  kind: string;
  fileName: string;
  sizeBytes?: number | null;
}

export interface UploadRejection { error: string }

/**
 * Validate an upload before a signed URL is minted.
 *
 * Returns the bucket, or a sentence explaining the refusal. Every message names the actual limit —
 * "too large" without a number is a message somebody has to guess their way past.
 */
export function validateUpload(req: UploadRequest): { bucket: string } | UploadRejection {
  const name = (req.fileName ?? '').trim();
  if (!name) return { error: 'A file name is required.' };
  if (req.kind === 'note') return { error: 'A note has no file to upload — post it as text instead.' };

  const bucket = bucketForKind(req.kind);
  if (!bucket) return { error: `Unknown item kind “${req.kind}”. Expected video, photo or file.` };

  const limit = BUCKET_LIMIT_BYTES[bucket];
  if (limit && typeof req.sizeBytes === 'number' && req.sizeBytes > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    const gotMb = Math.round(req.sizeBytes / (1024 * 1024));
    return {
      error: `That ${req.kind} is ${gotMb} MB and the limit is ${mb} MB. `
        + (req.kind === 'video' ? 'Record it in shorter parts, or drop the capture resolution.' : 'Try a smaller copy.'),
    };
  }
  return { bucket };
}

/** True when this rejection shape came back rather than a bucket. */
export function isRejection(v: { bucket: string } | UploadRejection): v is UploadRejection {
  return (v as UploadRejection).error !== undefined;
}
