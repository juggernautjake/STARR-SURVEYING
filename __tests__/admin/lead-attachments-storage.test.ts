// __tests__/admin/lead-attachments-storage.test.ts
//
// lead-attachments-storage-2026-06-18 — second phase of the lead
// attachments work. Seed 318 creates a private `lead-attachments`
// Supabase Storage bucket; the contact route uploads each
// customer-attached file to {leadId}/{uuid}-{name}, persists the
// storage_path on the lead row, and the admin lead-detail GET
// converts that path into a short-lived signed URL the page can
// hit directly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAttachmentStoragePath,
  LEAD_ATTACHMENTS_BUCKET,
  sanitizeAttachmentFilename,
  signLeadAttachmentUrls,
  uploadLeadAttachments,
} from '@/lib/leads/intake';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('sanitizeAttachmentFilename (pure)', () => {
  it('keeps a tidy ASCII filename + its extension', () => {
    expect(sanitizeAttachmentFilename('plat.pdf')).toBe('plat.pdf');
    expect(sanitizeAttachmentFilename('deed_v2.PDF')).toBe('deed_v2.PDF');
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeAttachmentFilename('My Photo (1).jpg')).toBe('My_Photo_1_.jpg');
    expect(sanitizeAttachmentFilename('résumé.pdf')).toBe('r_sum_.pdf');
  });

  it("strips directory traversal + collapses doubled dots", () => {
    // `../../etc/passwd` → first the `/` chars get replaced with `_`
    // (`.._.._etc_passwd`), then `..` collapses to `.`
    // (`._._etc_passwd`). Anchors verify the dangerous `..` traversal
    // can't survive sanitisation.
    const out = sanitizeAttachmentFilename('../../etc/passwd');
    expect(out).toBe('._._etc_passwd');
    expect(out).not.toContain('..');
    expect(out).not.toContain('/');
    expect(sanitizeAttachmentFilename('foo/bar/baz.txt')).toBe('foo_bar_baz.txt');
  });

  it("falls back to 'attachment' for empty / whitespace / unparseable input", () => {
    expect(sanitizeAttachmentFilename('')).toBe('attachment');
    expect(sanitizeAttachmentFilename('   ')).toBe('attachment');
    expect(sanitizeAttachmentFilename(undefined)).toBe('attachment');
    expect(sanitizeAttachmentFilename('!!!')).toBe('attachment');
  });
});

describe('buildAttachmentStoragePath (pure)', () => {
  it('joins leadId / uuid / sanitised filename with hyphen separator', () => {
    expect(buildAttachmentStoragePath('lead-1', 'uuid-2', 'plat.pdf'))
      .toBe('lead-1/uuid-2-plat.pdf');
  });

  it('sanitises the filename portion', () => {
    expect(buildAttachmentStoragePath('lead-1', 'uuid-2', 'My Photo (1).jpg'))
      .toBe('lead-1/uuid-2-My_Photo_1_.jpg');
  });
});

describe('uploadLeadAttachments', () => {
  function makeStorage(uploadImpls: Array<{ data: unknown; error: { message: string } | null }>) {
    let i = 0;
    const calls: Array<{ bucket: string; path: string; opts?: Record<string, unknown> }> = [];
    const storage = {
      from(bucket: string) {
        return {
          async upload(p: string, _bytes: unknown, opts?: Record<string, unknown>) {
            calls.push({ bucket, path: p, opts });
            return uploadImpls[i++] ?? { data: null, error: null };
          },
          async createSignedUrl() {
            throw new Error('not used in upload spec');
          },
        };
      },
    };
    return { storage, calls };
  }

  it("uploads every file to the lead-attachments bucket + returns storage_path on success", async () => {
    const { storage, calls } = makeStorage([
      { data: { path: 'x' }, error: null },
      { data: { path: 'y' }, error: null },
    ]);
    const out = await uploadLeadAttachments(
      storage,
      'lead-1',
      [
        { name: 'plat.pdf', size: 100, bytes: Buffer.from('a') },
        { name: 'deed.pdf', size: 200, bytes: Buffer.from('b') },
      ],
      () => 'fixed-uuid',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].bucket).toBe(LEAD_ATTACHMENTS_BUCKET);
    expect(calls[0].path).toBe('lead-1/fixed-uuid-plat.pdf');
    expect(out).toEqual([
      { name: 'plat.pdf', size: 100, storage_path: 'lead-1/fixed-uuid-plat.pdf' },
      { name: 'deed.pdf', size: 200, storage_path: 'lead-1/fixed-uuid-deed.pdf' },
    ]);
  });

  it("drops the storage_path silently when an upload fails per-file", async () => {
    const { storage } = makeStorage([
      { data: null, error: { message: 'kaboom' } },
      { data: { path: 'y' }, error: null },
    ]);
    const out = await uploadLeadAttachments(
      storage,
      'lead-1',
      [
        { name: 'broken.pdf', size: 1, bytes: Buffer.from('x') },
        { name: 'ok.pdf', size: 2, bytes: Buffer.from('y') },
      ],
      () => 'u',
    );
    expect(out[0]).toEqual({ name: 'broken.pdf', size: 1 });
    expect(out[1]).toEqual({ name: 'ok.pdf', size: 2, storage_path: 'lead-1/u-ok.pdf' });
  });

  it("short-circuits when there are no files", async () => {
    const { storage, calls } = makeStorage([]);
    const out = await uploadLeadAttachments(storage, 'lead-1', [], () => 'u');
    expect(out).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('signLeadAttachmentUrls', () => {
  function makeStorage(signImpls: Array<{ data: { signedUrl: string } | null; error: { message: string } | null }>) {
    let i = 0;
    const calls: Array<{ bucket: string; path: string; expires: number }> = [];
    const storage = {
      from(bucket: string) {
        return {
          async upload() { throw new Error('not used in sign spec'); },
          async createSignedUrl(p: string, expires: number) {
            calls.push({ bucket, path: p, expires });
            return signImpls[i++] ?? { data: null, error: null };
          },
        };
      },
    };
    return { storage, calls };
  }

  it("signs each storage_path with the configured expiry", async () => {
    const { storage, calls } = makeStorage([
      { data: { signedUrl: 'https://signed/a' }, error: null },
      { data: { signedUrl: 'https://signed/b' }, error: null },
    ]);
    const out = await signLeadAttachmentUrls(
      storage,
      [
        { name: 'plat.pdf', size: 100, storage_path: 'lead-1/u-plat.pdf' },
        { name: 'deed.pdf', size: 200, storage_path: 'lead-1/u-deed.pdf' },
      ],
      1800,
    );
    expect(calls.map((c) => c.expires)).toEqual([1800, 1800]);
    expect(out).toEqual([
      { name: 'plat.pdf', size: 100, storage_path: 'https://signed/a' },
      { name: 'deed.pdf', size: 200, storage_path: 'https://signed/b' },
    ]);
  });

  it("preserves metadata-only attachments (no storage_path) untouched", async () => {
    const { storage } = makeStorage([]);
    const out = await signLeadAttachmentUrls(storage, [
      { name: 'emailed.pdf', size: 100 },
    ]);
    expect(out).toEqual([{ name: 'emailed.pdf', size: 100 }]);
  });

  it("drops the storage_path when signing fails per-file", async () => {
    const { storage } = makeStorage([{ data: null, error: { message: 'expired' } }]);
    const out = await signLeadAttachmentUrls(storage, [
      { name: 'plat.pdf', size: 100, storage_path: 'lead-1/u-plat.pdf' },
    ]);
    expect(out).toEqual([{ name: 'plat.pdf', size: 100 }]);
  });
});

describe('contact route wires the upload + update', () => {
  const SRC = read('app/api/contact/route.ts');

  it('imports uploadLeadAttachments + updateLeadAttachments', () => {
    expect(SRC).toMatch(/uploadLeadAttachments,/);
    expect(SRC).toMatch(/updateLeadAttachments,/);
    expect(SRC).toMatch(/from '@\/lib\/leads\/intake'/);
  });

  it('parseRequest now carries the file bytes via the uploadable array', () => {
    expect(SRC).toMatch(/uploadable: UploadableFile\[\]/);
    expect(SRC).toMatch(/bytes: buf,/);
  });

  it('post-insert path uploads then updates the row attachments', () => {
    expect(SRC).toMatch(/uploadLeadAttachments\(\s*supabaseAdmin\.storage,\s*insertedLead\.id,\s*uploadable,\s*\)/);
    expect(SRC).toMatch(/updateLeadAttachments\(\s*supabaseAdmin,\s*insertedLead\.id,\s*uploaded,\s*\)/);
  });
});

describe('admin lead-detail GET signs URLs before returning', () => {
  const SRC = read('app/api/admin/leads/[id]/route.ts');

  it('imports signLeadAttachmentUrls', () => {
    expect(SRC).toMatch(/import \{ signLeadAttachmentUrls \} from '@\/lib\/leads\/intake'/);
  });

  it('replaces attachments with the signed list in the response', () => {
    expect(SRC).toMatch(/const signed = await signLeadAttachmentUrls\(/);
    expect(SRC).toMatch(/const lead = \{ \.\.\.raw, attachments: signed \}/);
  });
});

describe('seed 318 — lead-attachments storage bucket', () => {
  const SRC = read('seeds/318_lead_attachments_bucket.sql');

  it('creates the bucket as private (public=false)', () => {
    expect(SRC).toMatch(/'lead-attachments',[\s\S]{0,80}FALSE/);
  });

  it('caps file size at 50 MB matching the contact form limit', () => {
    expect(SRC).toMatch(/52428800/);
  });

  it("documents the required dashboard policy for storage.objects", () => {
    // seeds 290 + 295 follow the same pattern: storage.objects RLS
    // policies can't be added via the web SQL editor because
    // storage.objects is owned by supabase_admin. The seed has to
    // explain how to add the policy via the dashboard.
    expect(SRC).toMatch(/dashboard/i);
    expect(SRC).toMatch(/Storage/);
    expect(SRC).toMatch(/service_role/);
    expect(SRC).toMatch(/bucket_id = 'lead-attachments'/);
  });
});
