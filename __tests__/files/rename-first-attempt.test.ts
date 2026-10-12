// __tests__/files/rename-first-attempt.test.ts — a rename takes effect the first time (2026-10-11).
//
// Owner: *"whenever I click on the file name and type something and hit enter or click off of it,
// it reverts back to the original. But then if I do the exact same thing a second time, the name
// change does take effect."* The mount adapter reloaded the folder and then read the file back
// through hooks captured BEFORE the reload — so it handed the viewer the old name.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mountCapabilities } from '@/lib/files/adapters/mount';
import type { MountNode } from '@/lib/files/mount-node';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const staleNode = {
  id: 'mnt:file:1', name: 'IMG_5932.jpg', node_type: 'file', mime_type: 'image/jpeg', size_bytes: 10,
  updated_at: '2026-10-11T00:00:00Z', original_name: 'IMG_5932.jpg',
  source: { table: 'job_files', id: 'f1', job_id: 'j1', project_id: 'p1', section: 'photos' },
} as unknown as MountNode;

afterEach(() => vi.unstubAllGlobals());

describe('mount adapter', () => {
  it('returns the NEW name even when the list it reads back is still the old one', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ file: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const caps = mountCapabilities({ nodeFor: () => staleNode, onChanged: async () => {}, url: () => null });
    const saved = await caps.rename!({ id: staleNode.id, name: staleNode.name, mime: null, size: null, url: null }, 'Front corner pin.jpg');
    expect(saved.name).toBe('Front corner pin.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/jobs/files/f1');
    expect(JSON.parse(String(init.body))).toEqual({ label: 'Front corner pin.jpg' });
  });

  it('notes and tags come back as saved, not as the stale list had them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const caps = mountCapabilities({ nodeFor: () => staleNode, onChanged: async () => {}, url: () => null });
    const file = { id: staleNode.id, name: staleNode.name, mime: null, size: null, url: null };
    expect((await caps.updateNotes!(file, '  NE corner  ')).notes).toBe('NE corner');
    expect((await caps.updateTags!(file, ['pin'])).tags).toEqual(['pin']);
  });
});

describe('the viewer and the list show the rename at once', () => {
  const viewer = read('app/admin/components/files/FileViewer.tsx');
  const explorer = read('app/admin/components/files/FolderExplorer.tsx');
  it('the viewer applies the name before the save returns, and undoes it on a refusal', () => {
    expect(viewer).toMatch(/pendingNames\.current\.set\(before\.id, next\)/);
    expect(viewer).toMatch(/patchLocal\(\{ \.\.\.before, name: next \}\)/);
    expect(viewer).toMatch(/patchLocal\(before\)/);
  });
  it('Enter and the blur that follows commit once', () => {
    expect(viewer).toMatch(/if \(renameCommitted\.current\) return;/);
  });
  it('the explorer reads nodes through a ref, never the pre-reload map', () => {
    expect(explorer).toMatch(/nodeFor: \(id\) => fileByIdRef\.current\.get\(id\)/);
    expect(explorer).toMatch(/renameLocally\(n\.id, next\)/);
  });
});
