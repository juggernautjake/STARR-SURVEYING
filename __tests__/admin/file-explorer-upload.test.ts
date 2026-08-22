// F3 — source-lock for the explorer upload/download helpers.
import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  buildStoragePath,
  isImageMime,
  isPdfMime,
  isPreviewable,
  isVideoMime,
  contentTypeForUpload,
  MAX_UPLOAD_BYTES,
} from '@/lib/files/upload';
import { MAX_JOB_FILE_BYTES } from '@/lib/jobs/file-storage';

describe('files/upload: validateUpload', () => {
  it('accepts a normal file', () => {
    expect(validateUpload({ name: 'report.pdf', sizeBytes: 1024 })).toEqual({ ok: true });
  });
  it('rejects empty name, bad size, and oversize', () => {
    expect(validateUpload({ name: '  ', sizeBytes: 10 }).ok).toBe(false);
    expect(validateUpload({ name: 'x', sizeBytes: -1 }).ok).toBe(false);
    expect(validateUpload({ name: 'x', sizeBytes: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
    expect(validateUpload({ name: 'x', sizeBytes: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });
});

// ── THE CAP MAY NEVER EXCEED THE BUCKET (2026-08-22) ──────────────────────────────────────────
//
// This file's cap was 100 MB and the `file-explorer` bucket did not exist — `ensureStorageBucket`
// would have created it at its 50 MB default, so a 60 MB video would have transferred in full and
// been refused at 100%. Seed 608 creates the bucket at 500 MB and the number comes from
// `lib/storage/uploads.ts` now. 500 MB was proven by transferring real bytes, not read from config.
const BUCKET_LIMIT_BYTES = 500 * 1024 * 1024;

describe('the Files area accepts what the bucket accepts', () => {
  it('never allows more than the bucket does', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(BUCKET_LIMIT_BYTES);
  });

  it('actually allows a 500 MB video — the thing the owner asked for', () => {
    // The bound alone is satisfied by a cap of 1 byte, which would fail every real upload.
    expect(validateUpload({ name: 'walkthrough.mp4', sizeBytes: BUCKET_LIMIT_BYTES }).ok).toBe(true);
  });

  it('agrees with the job page, because one number serves both', () => {
    // A Files cap below the job page's is not a safety margin, it is a surprise: the same recording
    // uploads on one screen and is refused on the other.
    expect(MAX_UPLOAD_BYTES).toBe(MAX_JOB_FILE_BYTES);
  });

  it('says the real number when it refuses', () => {
    const v = validateUpload({ name: 'huge.mkv', sizeBytes: MAX_UPLOAD_BYTES + 1 });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(new RegExp(`${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`));
  });
});

describe('a video kept in the Files area is watchable there', () => {
  it('previews video rather than only offering a download', () => {
    expect(isVideoMime('video/mp4')).toBe(true);
    expect(isPreviewable('video/quicktime')).toBe(true);
    expect(isPreviewable('application/zip')).toBe(false);
  });

  it('derives a type when the phone hands over an empty one', () => {
    // Some Android camera apps report '' for their own recordings. Storing that leaves the viewer
    // holding `application/octet-stream` and unable to tell a walkthrough from a blob.
    expect(contentTypeForUpload('clip.mov', '')).toBe('video/quicktime');
    expect(contentTypeForUpload('clip.MP4', null)).toBe('video/mp4');
    // A type the browser DID give is authoritative — guessing over it is how a .bin becomes a video.
    expect(contentTypeForUpload('drawing.pdf', 'application/pdf')).toBe('application/pdf');
    expect(contentTypeForUpload('points.csv', '')).toBe('application/octet-stream');
  });
});

describe('files/upload: buildStoragePath', () => {
  it('namespaces under a unique id + sanitizes the name', () => {
    expect(buildStoragePath('abc', 'My Report (final).pdf')).toBe('explorer/abc/My_Report_final_.pdf');
    expect(buildStoragePath('id', '')).toBe('explorer/id/file');
  });
});

describe('files/upload: mime helpers', () => {
  it('classifies images/pdf/previewable', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isPdfMime('application/pdf')).toBe(true);
    expect(isPreviewable('image/jpeg')).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('application/zip')).toBe(false);
    expect(isPreviewable(null)).toBe(false);
  });
});
