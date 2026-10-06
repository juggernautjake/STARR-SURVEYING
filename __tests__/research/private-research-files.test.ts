// __tests__/research/private-research-files.test.ts
//
// The research-documents bucket became private on 2026-10-06 (seeds/669). Stored links are the app
// route `/api/admin/research/file/<key>`; old rows and an undeployed worker can still hold the
// public form. Both must resolve to the same storage key, and nothing else may.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { researchStorageKey, researchFileRoute, toResearchFileRoute } from '@/lib/research/research-file-url';

const PUB = 'https://abc.supabase.co/storage/v1/object/public/research-documents/library/bell/plats/MKC_ADDITION.pdf';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('research file links', () => {
  it('the public form and the route form name the same file', () => {
    expect(researchStorageKey(PUB)).toBe('library/bell/plats/MKC_ADDITION.pdf');
    expect(researchStorageKey('/api/admin/research/file/library/bell/plats/MKC_ADDITION.pdf')).toBe('library/bell/plats/MKC_ADDITION.pdf');
    expect(researchStorageKey('https://www.example.com/api/admin/research/file/a/b.png?download=1')).toBe('a/b.png');
  });

  it('anything else is not a research file', () => {
    expect(researchStorageKey('https://abc.supabase.co/storage/v1/object/public/cad-images/x.png')).toBeNull();
    expect(researchStorageKey('https://county.example.gov/deed.pdf')).toBeNull();
    expect(researchStorageKey(null)).toBeNull();
  });

  it('cannot climb out of the bucket', () => {
    expect(researchStorageKey('/api/admin/research/file/../other-bucket/x')).toBeNull();
    expect(researchStorageKey('/api/admin/research/file/a/%2E%2E/b')).toBeNull();
  });

  it('round-trips a key through the route, with odd characters encoded', () => {
    const key = 'proj/My Deed #2.pdf';
    expect(researchFileRoute(key)).toBe('/api/admin/research/file/proj/My%20Deed%20%232.pdf');
    expect(researchStorageKey(researchFileRoute(key))).toBe(key);
    expect(toResearchFileRoute(PUB)).toBe('/api/admin/research/file/library/bell/plats/MKC_ADDITION.pdf');
    expect(toResearchFileRoute('https://county.example.gov/deed.pdf')).toBe('https://county.example.gov/deed.pdf');
  });
});

describe('the bucket is private and every reader copes', () => {
  it('the migration rewrites stored links, keeps doing so on write, and flips the bucket', () => {
    const s = read('seeds/669_private_research_documents.sql');
    expect(s).toMatch(/UPDATE storage\.buckets SET public = false WHERE id = 'research-documents'/);
    expect(s).toMatch(/BEFORE INSERT OR UPDATE OF storage_url, pages_pdf_url, ocr_regions ON public\.research_documents/);
  });

  it('the route requires a staff session', () => {
    const r = read('app/api/admin/research/file/[...path]/route.ts');
    expect(r).toMatch(/status: 401/);
    expect(r).toMatch(/STAFF_ROLES/);
    expect(r).toMatch(/createSignedUrl\(key, SIGNED_SECONDS/);
  });

  it('server code reads stored links through the signing helper, never bare fetch', () => {
    for (const f of [
      'lib/research/image-loader.ts',
      'lib/research/analysis.service.ts',
      'lib/research/document.service.ts',
      'app/api/admin/research/[projectId]/documents/[docId]/deep-analyze/route.ts',
      'app/api/admin/research/[projectId]/documents/[docId]/full-extract/route.ts',
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/await fetch\(doc\.storage_url/);
      expect(src, f).toMatch(/fetchStoredFile\(/);
    }
  });
});
