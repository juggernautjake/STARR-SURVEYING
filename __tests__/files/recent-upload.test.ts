// The "New" tag on files uploaded in the last 24 hours (owner, 2026-09-29).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isRecentUpload, uploadedAgo, RECENT_UPLOAD_MS } from '@/lib/files/recent';

const NOW = Date.parse('2026-09-29T18:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 60 * 60 * 1000;

describe('isRecentUpload', () => {
  it('is true inside 24 hours and false from 24 hours on', () => {
    expect(isRecentUpload(ago(0), NOW)).toBe(true);
    expect(isRecentUpload(ago(23 * H), NOW)).toBe(true);
    expect(isRecentUpload(ago(RECENT_UPLOAD_MS - 1000), NOW)).toBe(true);
    expect(isRecentUpload(ago(RECENT_UPLOAD_MS), NOW)).toBe(false);
    expect(isRecentUpload(ago(3 * 24 * H), NOW)).toBe(false);
  });

  it('is never true for a missing or unreadable date', () => {
    expect(isRecentUpload(null, NOW)).toBe(false);
    expect(isRecentUpload(undefined, NOW)).toBe(false);
    expect(isRecentUpload('', NOW)).toBe(false);
    expect(isRecentUpload('not a date', NOW)).toBe(false);
  });

  it('tolerates a clock a little ahead, but not a date far in the future', () => {
    expect(isRecentUpload(ago(-5 * 60 * 1000), NOW)).toBe(true);
    expect(isRecentUpload(ago(-3 * 24 * H), NOW)).toBe(false);
  });

  it('accepts a Date', () => {
    expect(isRecentUpload(new Date(NOW - H), NOW)).toBe(true);
  });
});

describe('uploadedAgo', () => {
  it('reads naturally', () => {
    expect(uploadedAgo(ago(10 * 1000), NOW)).toBe('Uploaded just now');
    expect(uploadedAgo(ago(60 * 1000), NOW)).toBe('Uploaded 1 minute ago');
    expect(uploadedAgo(ago(45 * 60 * 1000), NOW)).toBe('Uploaded 45 minutes ago');
    expect(uploadedAgo(ago(H), NOW)).toBe('Uploaded 1 hour ago');
    expect(uploadedAgo(ago(5 * H + 20 * 60 * 1000), NOW)).toBe('Uploaded 5 hours ago');
  });
});

describe('where the tag is shown', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('the job / project explorer tags rows and tiles by upload time, not last change', () => {
    const fe = read('app/admin/components/files/FolderExplorer.tsx');
    expect(fe.match(/<RecentBadge uploadedAt=\{n\.uploaded_at\}/g)?.length).toBe(2);
  });

  it('every mounted file source with an upload moment carries it; field photos use created_at, not captured_at', () => {
    const m = read('lib/files/mounts.ts');
    expect(m.match(/uploaded_at: r\.uploaded_at \?\? r\.created_at \?\? null/g)?.length).toBe(2); // job files, both listings
    expect(m).toMatch(/updated_at: when,\s*uploaded_at: r\.created_at,\s*source: \{ table: 'field_media'/);
    expect(m).toMatch(/uploaded_at: r\.created_at,\s*source: \{ table: 'receipts'/);
    // CAD drawings have no upload moment — an edit must never make one "New"
    expect(m).not.toMatch(/uploaded_at:[^\n]*\n[^\n]*cad_drawings/);
  });

  it('the File Explorer, My Files and research documents show it too', () => {
    expect(read('app/admin/files/page.tsx')).toMatch(/isMountId\(n\.id\) \? n\.uploaded_at : \(n\.uploaded_at \?\? n\.created_at\)/);
    expect(read('app/admin/my-files/MyFilesPanel.tsx')).toContain('<RecentBadge uploadedAt={file.uploaded_at}');
    expect(read('app/admin/research/[projectId]/documents/page.tsx')).toContain('<RecentBadge uploadedAt={doc.uploadedAt} />');
    expect(read('app/api/admin/files/tree/route.ts')).toContain('uploaded_at: n.uploaded_at ?? n.created_at ?? null');
  });
});
