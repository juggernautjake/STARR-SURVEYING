// __tests__/recon/document-service.test.ts
// Unit tests for lib/research/document.service.ts — pure-logic helpers only.
// No live network calls, no Supabase, no AI API.
//
// Tests cover:
//   1.  validateUploadFile — accepts all supported extensions
//   2.  validateUploadFile — rejects unsupported extensions
//   3.  validateUploadFile — rejects files that are too large
//   4.  validateUploadFile — accepts files at exact size limit
//   5.  validateUploadFile — accepts files just under size limit
//   6.  validateUploadFile — handles filenames with no extension
//   7.  validateUploadFile — handles filenames with uppercase extension
//   8.  validateUploadFile — handles filenames with multiple dots
//   9.  formatFileSize — bytes
//  10.  formatFileSize — kilobytes
//  11.  formatFileSize — megabytes
//  12.  formatFileSize — exactly 1 KB boundary
//  13.  formatFileSize — exactly 1 MB boundary
//  14.  ACCEPTED_FILE_TYPES includes pdf
//  15.  ACCEPTED_FILE_TYPES includes image types (png, jpg, jpeg, tiff, tif, webp, bmp, gif)
//  16.  ACCEPTED_FILE_TYPES includes heic/heif (mobile photos)
//  17.  ACCEPTED_FILE_TYPES includes docx, txt, rtf
//  18.  validateUploadFile — rejects empty filename
//  19.  validateUploadFile — rtf accepted (new file type)
//  20.  validateUploadFile — bmp accepted (new file type)
//  21.  validateUploadFile — gif accepted (new file type)
//  22.  validateUploadFile — heic accepted (new file type)
//  23.  validateUploadFile — heif accepted (new file type)

import { describe, it, expect } from 'vitest';
import {
  validateUploadFile,
  formatFileSize,
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_MB,
} from '../../lib/research/document.service';

// ── 1–8: validateUploadFile ───────────────────────────────────────────────────

describe('validateUploadFile — accepted extensions', () => {
  const SIZE_1MB = 1024 * 1024;

  it('accepts .pdf', () => {
    expect(validateUploadFile('deed.pdf', SIZE_1MB)).toBeNull();
  });

  it('accepts .png', () => {
    expect(validateUploadFile('scan.png', SIZE_1MB)).toBeNull();
  });

  it('accepts .jpg', () => {
    expect(validateUploadFile('photo.jpg', SIZE_1MB)).toBeNull();
  });

  it('accepts .jpeg', () => {
    expect(validateUploadFile('photo.jpeg', SIZE_1MB)).toBeNull();
  });

  it('accepts .tiff', () => {
    expect(validateUploadFile('plat.tiff', SIZE_1MB)).toBeNull();
  });

  it('accepts .tif', () => {
    expect(validateUploadFile('plat.tif', SIZE_1MB)).toBeNull();
  });

  it('accepts .webp', () => {
    expect(validateUploadFile('doc.webp', SIZE_1MB)).toBeNull();
  });

  it('accepts .bmp', () => {
    expect(validateUploadFile('scan.bmp', SIZE_1MB)).toBeNull();
  });

  it('accepts .gif', () => {
    expect(validateUploadFile('anim.gif', SIZE_1MB)).toBeNull();
  });

  it('accepts .heic', () => {
    expect(validateUploadFile('iphone.heic', SIZE_1MB)).toBeNull();
  });

  it('accepts .heif', () => {
    expect(validateUploadFile('iphone.heif', SIZE_1MB)).toBeNull();
  });

  it('accepts .docx', () => {
    expect(validateUploadFile('deed.docx', SIZE_1MB)).toBeNull();
  });

  it('accepts .txt', () => {
    expect(validateUploadFile('notes.txt', SIZE_1MB)).toBeNull();
  });

  it('accepts .rtf', () => {
    expect(validateUploadFile('deed.rtf', SIZE_1MB)).toBeNull();
  });
});

describe('validateUploadFile — rejected extensions', () => {
  const SIZE_1MB = 1024 * 1024;

  it('rejects .exe', () => {
    expect(validateUploadFile('virus.exe', SIZE_1MB)).toMatch(/unsupported file type/i);
  });

  it('rejects .zip', () => {
    expect(validateUploadFile('archive.zip', SIZE_1MB)).toMatch(/unsupported file type/i);
  });

  it('rejects .xlsx', () => {
    expect(validateUploadFile('sheet.xlsx', SIZE_1MB)).toMatch(/unsupported file type/i);
  });

  it('rejects .mp4', () => {
    expect(validateUploadFile('video.mp4', SIZE_1MB)).toMatch(/unsupported file type/i);
  });

  it('error message includes the extension that was rejected', () => {
    const result = validateUploadFile('bad.xyz', SIZE_1MB);
    expect(result).toContain('.xyz');
  });

  it('error message lists accepted types', () => {
    const result = validateUploadFile('bad.xyz', SIZE_1MB);
    expect(result).toContain('pdf');
  });
});

describe('validateUploadFile — size validation', () => {
  const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  it('accepts a file at exactly the size limit', () => {
    expect(validateUploadFile('big.pdf', MAX_BYTES)).toBeNull();
  });

  it('accepts a file 1 byte under the size limit', () => {
    expect(validateUploadFile('big.pdf', MAX_BYTES - 1)).toBeNull();
  });

  it('rejects a file 1 byte over the size limit', () => {
    expect(validateUploadFile('huge.pdf', MAX_BYTES + 1)).toMatch(/too large/i);
  });

  it('rejects a very large file', () => {
    expect(validateUploadFile('giant.pdf', 500 * 1024 * 1024)).toMatch(/too large/i);
  });

  it('accepts a zero-byte file (size check only — empty check is done by the UI)', () => {
    // validateUploadFile does NOT reject zero-size files — that's a UI concern
    expect(validateUploadFile('empty.pdf', 0)).toBeNull();
  });
});

describe('validateUploadFile — edge cases', () => {
  const SIZE_1MB = 1024 * 1024;

  it('handles filenames with no extension as unsupported', () => {
    const result = validateUploadFile('README', SIZE_1MB);
    expect(result).toMatch(/unsupported file type/i);
  });

  it('normalises uppercase extension to lowercase', () => {
    expect(validateUploadFile('DEED.PDF', SIZE_1MB)).toBeNull();
    expect(validateUploadFile('SCAN.PNG', SIZE_1MB)).toBeNull();
  });

  it('uses the last dot extension for multi-dot filenames', () => {
    // e.g. "deed.from.county.pdf" → extension is "pdf" → accepted
    expect(validateUploadFile('deed.from.county.pdf', SIZE_1MB)).toBeNull();
    // "archive.tar.gz" → extension is "gz" → rejected
    expect(validateUploadFile('archive.tar.gz', SIZE_1MB)).toMatch(/unsupported file type/i);
  });
});

// ── 9–13: formatFileSize ───────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats exactly 1 KB as KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats values between 1 KB and 1 MB as KB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1023 * 1024)).toMatch(/KB/);
  });

  it('formats exactly 1 MB as MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats values ≥ 1 MB as MB', () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50.0 MB');
  });
});

// ── 14–17: ACCEPTED_FILE_TYPES completeness ────────────────────────────────────

describe('ACCEPTED_FILE_TYPES', () => {
  it('is an array', () => {
    expect(Array.isArray(ACCEPTED_FILE_TYPES)).toBe(true);
  });

  it('includes pdf', () => {
    expect(ACCEPTED_FILE_TYPES).toContain('pdf');
  });

  it('includes all standard image types', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'webp']) {
      expect(ACCEPTED_FILE_TYPES).toContain(ext);
    }
  });

  it('includes bmp and gif (new raster formats)', () => {
    expect(ACCEPTED_FILE_TYPES).toContain('bmp');
    expect(ACCEPTED_FILE_TYPES).toContain('gif');
  });

  it('includes heic and heif (mobile photo formats)', () => {
    expect(ACCEPTED_FILE_TYPES).toContain('heic');
    expect(ACCEPTED_FILE_TYPES).toContain('heif');
  });

  it('includes docx, txt, and rtf', () => {
    expect(ACCEPTED_FILE_TYPES).toContain('docx');
    expect(ACCEPTED_FILE_TYPES).toContain('txt');
    expect(ACCEPTED_FILE_TYPES).toContain('rtf');
  });

  it('has at least 15 entries', () => {
    // pdf(1) + image(9: png jpg jpeg tiff tif webp bmp gif + heic) + mobile(1: heif) + document(3: docx txt rtf) = 15
    expect(ACCEPTED_FILE_TYPES.length).toBeGreaterThanOrEqual(15);
  });

  it('contains no duplicates', () => {
    const unique = new Set(ACCEPTED_FILE_TYPES);
    expect(unique.size).toBe(ACCEPTED_FILE_TYPES.length);
  });

  it('all entries are lowercase', () => {
    for (const ext of ACCEPTED_FILE_TYPES) {
      expect(ext).toBe(ext.toLowerCase());
    }
  });
});
