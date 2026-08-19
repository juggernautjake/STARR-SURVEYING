// __tests__/jobs/file-storage.test.ts
//
// The rules that decide where a job file's bytes are and how to reach them. Every case here was a
// real row shape found in the live database or written by live code, not an invented one.

import { describe, it, expect } from 'vitest';
import {
  shapeOf,
  downloadHref,
  displayName,
  mimeOf,
  sizeOf,
  jobFileStoragePath,
  checkJobUpload,
  wantsBackupRow,
  MAX_JOB_FILE_BYTES,
  JOB_FILES_BUCKET,
} from '@/lib/jobs/file-storage';

describe('which shape a row is', () => {
  it('a storage object is the shape everything now writes', () => {
    expect(shapeOf({ storage_path: 'jacob/web-abc-plat.pdf' })).toBe('storage');
  });

  it('the live legacy row — a data: URI with upload_state pending — is recognised, not dropped', () => {
    // Measured 2026-08-19: the only job_files row in production.
    expect(shapeOf({
      file_name: 'qa-note.txt',
      file_url: 'data:text/plain;base64,UUEgdGVzdA==',
      storage_path: null,
      upload_state: 'pending',
    })).toBe('legacy-inline');
  });

  it('an ordinary URL is its own shape', () => {
    expect(shapeOf({ file_url: 'https://example.com/deed.pdf' })).toBe('legacy-remote');
  });

  it('a linked File Explorer document has no bytes of its own', () => {
    expect(shapeOf({ file_node_id: 'node-1', file_url: 'data:text/plain;base64,AAA' })).toBe('linked');
  });

  it('a row with nowhere to get bytes says so instead of pretending', () => {
    expect(shapeOf({ file_name: 'ghost.pdf' })).toBe('missing');
    expect(shapeOf({ file_url: '   ' })).toBe('missing');
  });

  it('a legacy row that was later re-uploaded serves the object, not the base64 fossil', () => {
    // Order matters here and nowhere else: both columns are populated, and the durable one wins.
    expect(shapeOf({ file_url: 'data:text/plain;base64,AAA', storage_path: 'jacob/web-1-note.txt' }))
      .toBe('storage');
  });
});

describe('where the browser is pointed', () => {
  it('a storage row goes through the job download route', () => {
    expect(downloadHref({ id: 'f1', storage_path: 'jacob/web-f1-plat.pdf' }))
      .toBe('/api/admin/jobs/files/f1/download');
  });

  it('a linked document goes through the FILE EXPLORER route, so its permissions are re-checked', () => {
    // The point of not serving it ourselves: a job must not become a side door around file
    // permissions, and the module that owns them is the one that should answer.
    expect(downloadHref({ id: 'f2', file_node_id: 'node-9' }))
      .toBe('/api/admin/files/node-9/download');
  });

  it('a legacy row is its own href — the data URI works in an img or an anchor unchanged', () => {
    const uri = 'data:text/plain;base64,UUEgdGVzdA==';
    expect(downloadHref({ id: 'f3', file_url: uri })).toBe(uri);
  });

  it('a storage row with no id yet cannot be linked to', () => {
    // Guards the moment between choosing a file and the row existing.
    expect(downloadHref({ storage_path: 'jacob/web-x-a.pdf' })).toBeNull();
  });

  it('a missing row gets null, never a dead link', () => {
    expect(downloadHref({ id: 'f4' })).toBeNull();
  });
});

describe('reading a row whichever writer made it', () => {
  it('takes the name from either column', () => {
    expect(displayName({ file_name: 'plat.pdf' })).toBe('plat.pdf');
    expect(displayName({ name: 'from-mobile.jpg' })).toBe('from-mobile.jpg');
    expect(displayName({})).toBe('File');
  });

  it('takes the mime from either column', () => {
    expect(mimeOf({ mime_type: 'application/pdf' })).toBe('application/pdf');
    expect(mimeOf({ content_type: 'image/jpeg' })).toBe('image/jpeg');
    expect(mimeOf({})).toBeNull();
  });

  it('takes the size from either column, and 0 is a real answer', () => {
    expect(sizeOf({ file_size: 1024 })).toBe(1024);
    expect(sizeOf({ file_size_bytes: 2048 })).toBe(2048);
    expect(sizeOf({ file_size: 0 })).toBe(0);
    expect(sizeOf({})).toBeNull();
  });
});

describe('the storage key', () => {
  it('is the same three-part shape the mobile app writes', () => {
    expect(jobFileStoragePath('jacob@starr-surveying.com', 'abc123', 'Plat Map.pdf'))
      .toBe('jacob@starr-surveying.com/web-abc123-Plat_Map.pdf');
  });

  it('strips anything that would make a key nobody can find again', () => {
    const p = jobFileStoragePath('a/../b', 'id1', '../../etc/passwd');
    expect(p.includes('..')).toBe(false);
    expect(p.startsWith('a_._b/')).toBe(true);
    expect(p.includes('/etc/')).toBe(false);
  });

  it('survives an empty owner and an empty name rather than producing a bare slash', () => {
    expect(jobFileStoragePath('', 'id2', '')).toBe('unknown/web-id2-file');
  });

  it('names the bucket the mobile app and the mount already use', () => {
    // A second bucket would split job files in half again, which is the defect this file fixes.
    expect(JOB_FILES_BUCKET).toBe('starr-field-files');
  });
});

describe('what is refused before a signed URL is handed out', () => {
  it('accepts an ordinary file', () => {
    expect(checkJobUpload({ name: 'plat.pdf', sizeBytes: 1024 }).ok).toBe(true);
  });

  it('refuses a nameless one — the key would be unfindable', () => {
    expect(checkJobUpload({ name: '   ', sizeBytes: 10 }).ok).toBe(false);
  });

  it('refuses an empty file, which is almost always a failed read rather than an intent', () => {
    expect(checkJobUpload({ name: 'a.pdf', sizeBytes: 0 }).ok).toBe(false);
  });

  // ── THE CAP WAS FICTION UNTIL IT WAS MEASURED (2026-08-19) ────────────────────────────────────
  //
  // This asserted "100 MB" — a number storage never honoured. Supabase caps every upload at the
  // PROJECT level, which overrides any bucket setting, and it was probed at exactly 50 MB:
  // 52,428,800 bytes accepted, one byte more refused. So a 375 MB video transferred all 375 MB and
  // failed at 100%, which is precisely what a client cap larger than the server's produces.
  //
  // Asserted against the constant rather than a literal now, so raising the project ceiling and
  // setting NEXT_PUBLIC_MAX_UPLOAD_BYTES cannot leave this test pinning a third wrong number.
  it('refuses over the REAL cap, before the bytes are sent', () => {
    const v = checkJobUpload({ name: 'huge.zip', sizeBytes: MAX_JOB_FILE_BYTES + 1 });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(new RegExp(`${Math.round(MAX_JOB_FILE_BYTES / 1024 / 1024)} MB`));
  });

  it('refuses a missing size rather than defaulting it to zero', () => {
    expect(checkJobUpload({ name: 'a.pdf' }).ok).toBe(false);
  });
});

describe('the automatic backup twin', () => {
  it('is still made for a legacy inline upload, where file_url is the only copy', () => {
    expect(wantsBackupRow({ file_url: 'data:text/plain;base64,AAA' }, true)).toBe(true);
  });

  it('is NOT made for a storage upload — a twin pointing at the same key backs up nothing', () => {
    expect(wantsBackupRow({ storage_path: 'jacob/web-1-a.pdf' }, true)).toBe(false);
  });

  it('is NOT made for a linked document — the File Explorer owns its history', () => {
    expect(wantsBackupRow({ file_node_id: 'n1' }, true)).toBe(false);
  });

  it('is never made when the caller said not to', () => {
    expect(wantsBackupRow({ file_url: 'data:text/plain;base64,AAA' }, false)).toBe(false);
  });
});
