// __tests__/admin/lead-reply-attachments-archive.test.ts
//
// LR2 of lead-reply-expansion-2026-06-18.md — reply attachments now
// flow into the `lead-attachments` bucket alongside intake files so
// the office has a single archive, and the history GET signs them
// for download. Locks:
//   - uploadLeadAttachments grew a `pathPrefix` arg so the reply
//     route can store under `replies/<reply_id>/...`.
//   - The reply POST collects raw bytes, then uploads + backfills
//     the row's attachments column after the insert returns the id.
//   - The reply GET signs URLs across every row before returning.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAttachmentStoragePath,
  uploadLeadAttachments,
} from '@/lib/leads/intake';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('uploadLeadAttachments — pathPrefix override (LR2)', () => {
  function makeStorage(impl: { data: unknown; error: { message: string } | null }) {
    const calls: Array<{ path: string }> = [];
    const storage = {
      from() {
        return {
          async upload(p: string) { calls.push({ path: p }); return impl; },
          async createSignedUrl() { throw new Error('not used'); },
        };
      },
    };
    return { storage, calls };
  }

  it('defaults to the leadId-based prefix when pathPrefix is omitted', async () => {
    const { storage, calls } = makeStorage({ data: { path: 'x' }, error: null });
    await uploadLeadAttachments(
      storage,
      'lead-1',
      [{ name: 'plat.pdf', size: 100, bytes: Buffer.from('x') }],
      () => 'u1',
    );
    expect(calls[0].path).toBe('lead-1/u1-plat.pdf');
  });

  it('uses pathPrefix when supplied (reply route path)', async () => {
    const { storage, calls } = makeStorage({ data: { path: 'x' }, error: null });
    await uploadLeadAttachments(
      storage,
      'lead-1',
      [{ name: 'deed.pdf', size: 200, bytes: Buffer.from('y') }],
      () => 'u2',
      'replies/reply-abc',
    );
    expect(calls[0].path).toBe('replies/reply-abc/u2-deed.pdf');
  });
});

describe('buildAttachmentStoragePath still respects the prefix arg name', () => {
  it('keeps the prefix/uuid-name pattern', () => {
    expect(buildAttachmentStoragePath('replies/reply-1', 'u', 'My File.pdf'))
      .toBe('replies/reply-1/u-My_File.pdf');
  });
});

describe('reply route POST archives attachments to the bucket', () => {
  const SRC = read('app/api/admin/leads/[id]/reply/route.ts');

  it('imports the upload + sign helpers from the intake module', () => {
    expect(SRC).toMatch(/import \{[\s\S]{1,200}?signLeadAttachmentUrls[\s\S]{1,200}?\} from '@\/lib\/leads\/intake'/);
    expect(SRC).toMatch(/uploadLeadAttachments/);
  });

  it('parses raw bytes into the uploadable array alongside Resend base64', () => {
    expect(SRC).toMatch(/const uploadable: Array<\{\s*\n\s*name: string;\s*\n\s*size: number;\s*\n\s*bytes: Buffer;/);
    expect(SRC).toMatch(/uploadable\.push\(\{[\s\S]{0,200}bytes: buf,/);
  });

  it("uploads under replies/<reply_id> after the row insert returns", () => {
    expect(SRC).toMatch(/`replies\/\$\{inserted\.id\}`/);
    expect(SRC).toMatch(/uploadLeadAttachments\(\s*supabaseAdmin\.storage,\s*leadId,\s*uploadable,/);
  });

  it("backfills the row's attachments column with the upload result", () => {
    expect(SRC).toMatch(/\.from\('lead_replies'\)[\s\S]{0,200}?\.update\(\{ attachments: uploaded \}\)[\s\S]{0,200}?\.eq\('id', inserted\.id\)/);
  });

  it("falls through silently on upload / update failures (Resend is the legal record)", () => {
    expect(SRC).toMatch(/console\.error\('\[lead-reply\] attachment backfill failed/);
    expect(SRC).toMatch(/console\.error\('\[lead-reply\] attachment upload threw/);
  });
});

describe('reply route GET signs attachment URLs across every row', () => {
  const SRC = read('app/api/admin/leads/[id]/reply/route.ts');

  it("Promise.alls signLeadAttachmentUrls across the result rows", () => {
    expect(SRC).toMatch(/Promise\.all\([\s\S]{0,400}signLeadAttachmentUrls\(/);
  });

  it("returns the signed shape under { replies } (not raw data)", () => {
    expect(SRC).toMatch(/return NextResponse\.json\(\{ replies \}\);/);
  });
});
