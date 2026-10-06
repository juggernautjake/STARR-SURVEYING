// Previews fetch signed storage links WITHOUT cookies (2026-10-01): Supabase answers CORS with
// `Access-Control-Allow-Origin: *`, which a browser refuses for a credentialed request, so a TRV,
// spreadsheet or text preview of a job file failed with "Failed to fetch".
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { credentialsFor, fetchFileForPreview } from '@/lib/files/fetch-file';

const SITE = 'https://www.starr-surveying.com';

describe('credentialsFor', () => {
  it('sends cookies to our own routes only — and not across their redirect to storage', () => {
    // 'same-origin': the session reaches our route; the 302 to a signed storage URL carries none.
    expect(credentialsFor('/api/admin/files/x/download', SITE)).toBe('same-origin');
    expect(credentialsFor(`${SITE}/api/x`, SITE)).toBe('same-origin');
    expect(credentialsFor('/api/admin/research/file/p/a.pdf', SITE)).toBe('same-origin');
  });
  it('never to a signed storage link or any other origin', () => {
    expect(credentialsFor('https://abc.supabase.co/storage/v1/object/sign/job-files/a.trv?token=t', SITE)).toBe('omit');
    expect(credentialsFor('https://starr-surveying.com/x', SITE)).toBe('omit');
  });
});

describe('fetchFileForPreview', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
    const f = vi.fn(impl);
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('fetches a signed link with credentials omitted', async () => {
    const f = stub(async () => new Response('abc'));
    const buf = await fetchFileForPreview('https://abc.supabase.co/storage/v1/object/sign/x?token=t');
    expect(new TextDecoder().decode(buf)).toBe('abc');
    expect(f.mock.calls[0][1]).toEqual({ credentials: 'omit' });
  });
  it('turns failures into sentences', async () => {
    stub(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchFileForPreview('https://s.supabase.co/x')).rejects.toThrow(/could not be reached/);
    stub(async () => new Response('', { status: 400 }));
    await expect(fetchFileForPreview('https://s.supabase.co/x')).rejects.toThrow(/expired/);
    stub(async () => new Response('', { status: 404 }));
    await expect(fetchFileForPreview('https://s.supabase.co/x')).rejects.toThrow(/missing/);
  });
  it('refuses a file over the preview limit', async () => {
    stub(async () => new Response('x'.repeat(20)));
    await expect(fetchFileForPreview('https://s.supabase.co/x', { maxBytes: 10 })).rejects.toThrow(/too large/);
  });
});

describe('no preview sends cookies to storage', () => {
  it('every preview fetch goes through the helper', () => {
    for (const f of ['app/admin/components/files/TrvPreview.tsx', 'app/admin/components/files/SheetPreview.tsx', 'app/admin/components/files/FileViewer.tsx', 'app/admin/cad/CADLayout.tsx']) {
      const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(src, f).toContain('fetchFileForPreview(');
      expect(src, f).not.toMatch(/fetch\((file\.url|url|pending\.url),\s*\{\s*credentials:\s*'include'/);
    }
  });
});
