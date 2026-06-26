// F3 — source-lock for the explorer upload/download helpers.
import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  buildStoragePath,
  isImageMime,
  isPdfMime,
  isPreviewable,
  MAX_UPLOAD_BYTES,
} from '@/lib/files/upload';

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
