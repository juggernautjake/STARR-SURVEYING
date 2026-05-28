// __tests__/lib/quote-attachments.test.ts
//
// Coverage for the public quote-form attachment validator. The same
// function runs in the browser before the form POST and on the server
// inside /api/contact (so a hand-crafted multipart can't bypass the
// extension allowlist or the 25 MB cap).

import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  validateQuoteAttachments,
  QUOTE_ATTACHMENT_MAX_FILES,
  QUOTE_ATTACHMENT_MAX_TOTAL_BYTES,
} from '@/lib/quote-attachments';

describe('formatBytes', () => {
  it('shows MB for >= 1 MiB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('shows KB for >= 1 KiB and < 1 MiB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(50 * 1024)).toBe('50 KB');
  });

  it('shows raw bytes for < 1 KiB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('validateQuoteAttachments — happy path', () => {
  it('returns null for an empty file list', () => {
    expect(validateQuoteAttachments([])).toBeNull();
  });

  it('returns null for a single allowed file under the cap', () => {
    expect(
      validateQuoteAttachments([{ name: 'plat.pdf', size: 1_000_000 }])
    ).toBeNull();
  });

  it('returns null at exactly the max-files boundary', () => {
    const files = Array.from({ length: QUOTE_ATTACHMENT_MAX_FILES }, (_, i) => ({
      name: `photo${i}.jpg`,
      size: 100,
    }));
    expect(validateQuoteAttachments(files)).toBeNull();
  });

  it('returns null at exactly the total-bytes boundary', () => {
    expect(
      validateQuoteAttachments([{ name: 'big.pdf', size: QUOTE_ATTACHMENT_MAX_TOTAL_BYTES }])
    ).toBeNull();
  });

  it('accepts CAD/mapping formats (DWG, DXF, KML, KMZ)', () => {
    expect(
      validateQuoteAttachments([
        { name: 'parcel.dwg', size: 1 },
        { name: 'survey.dxf', size: 1 },
        { name: 'site.kml', size: 1 },
        { name: 'flights.kmz', size: 1 },
      ])
    ).toBeNull();
  });
});

describe('validateQuoteAttachments — rejections', () => {
  it('rejects too many files', () => {
    const files = Array.from(
      { length: QUOTE_ATTACHMENT_MAX_FILES + 1 },
      (_, i) => ({ name: `photo${i}.jpg`, size: 100 })
    );
    expect(validateQuoteAttachments(files)).toEqual({
      code: 'too-many-files',
      message: expect.stringContaining(String(QUOTE_ATTACHMENT_MAX_FILES)),
    });
  });

  it('rejects bad extensions (no allowlist hit)', () => {
    const out = validateQuoteAttachments([{ name: 'malware.exe', size: 1 }]);
    expect(out?.code).toBe('bad-type');
    expect(out?.message).toContain('malware.exe');
  });

  it('rejects files with no extension', () => {
    expect(validateQuoteAttachments([{ name: 'README', size: 1 }])?.code).toBe('bad-type');
  });

  it('is case-insensitive on the extension', () => {
    // .PDF in shouting case should pass.
    expect(validateQuoteAttachments([{ name: 'doc.PDF', size: 1 }])).toBeNull();
  });

  it('rejects when the total size exceeds the cap', () => {
    const out = validateQuoteAttachments([
      { name: 'half.pdf', size: QUOTE_ATTACHMENT_MAX_TOTAL_BYTES / 2 + 1 },
      { name: 'half2.pdf', size: QUOTE_ATTACHMENT_MAX_TOTAL_BYTES / 2 + 1 },
    ]);
    expect(out?.code).toBe('too-large');
    expect(out?.message).toContain('MB');
  });

  it('checks bad-type BEFORE total-size (more actionable error)', () => {
    // 30 MB .exe → bad-type wins over too-large.
    const out = validateQuoteAttachments([
      { name: 'huge.exe', size: 30 * 1024 * 1024 },
    ]);
    expect(out?.code).toBe('bad-type');
  });
});
