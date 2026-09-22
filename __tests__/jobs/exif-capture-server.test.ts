// __tests__/jobs/exif-capture-server.test.ts — filing a photograph's own position.
//
// `exif-capture.test.ts` covers the reading. This covers the three decisions the server half makes,
// each of which costs something or destroys something when it goes wrong:
//
//   1. not downloading a file that cannot carry EXIF (a 500 MB video, read for a tag it has not got);
//   2. not overwriting a position a person placed by hand;
//   3. not failing the upload when any of it does not work.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { captureFromExif } from '@/lib/jobs/exif-capture-server';

/** A Supabase double that records what was asked of it. */
function client(opts: {
  existing?: { source: string } | null;
  blob?: Blob | null;
  downloadError?: boolean;
} = {}) {
  const calls = { downloads: 0, selects: 0, upserts: [] as Record<string, unknown>[] };
  const api = {
    calls,
    from(table: string) {
      expect(table).toBe('job_file_captures');
      return {
        select: () => { calls.selects++; return {
          eq: () => ({ maybeSingle: async () => ({ data: opts.existing ?? null }) }),
        }; },
        upsert: async (row: Record<string, unknown>) => { calls.upserts.push(row); return { error: null }; },
      };
    },
    storage: {
      from: () => ({
        download: async () => {
          calls.downloads++;
          if (opts.downloadError) return { data: null, error: new Error('no such object') };
          return { data: opts.blob ?? null, error: null };
        },
      }),
    },
  };
  return api as unknown as Parameters<typeof captureFromExif>[0] & typeof api;
}

const FILE = { jobFileId: 'jf-1', bucket: 'starr-job-files', storagePath: 'j/1/photo.jpg' };

describe('captureFromExif', () => {
  it('never downloads a kind that cannot carry a position', async () => {
    const c = client();
    const out = await captureFromExif(c, { ...FILE, mimeType: 'video/mp4', fileName: 'walk.mp4' });
    expect(out).toBeNull();
    // The point of the check. A 500 MB video downloaded to look for a tag it has not got is the
    // whole cost of this feature spent on nothing.
    expect(c.calls.downloads).toBe(0);
    expect(c.calls.selects).toBe(0);
  });

  it('opens a HEIC served as octet-stream, because iPhones do that', async () => {
    const c = client({ downloadError: true });
    await captureFromExif(c, { ...FILE, mimeType: 'application/octet-stream', fileName: 'IMG_0421.HEIC' });
    expect(c.calls.downloads).toBe(1);
  });

  // ── THE ONE THAT DESTROYS SOMETHING ───────────────────────────────────────────────────────────
  // seeds/653 keeps `source` so that re-filing a photograph cannot undo a correction: the camera
  // was wrong about where it was, the surveyor was not. Without this the second upload of the same
  // photo silently moves the pin back to where the phone thought it was.
  it('leaves a hand-placed position alone, and does not even download to check', async () => {
    const c = client({ existing: { source: 'manual' } });
    const out = await captureFromExif(c, { ...FILE, mimeType: 'image/jpeg', fileName: 'corner.jpg' });
    expect(out).toBeNull();
    expect(c.calls.upserts).toEqual([]);
    expect(c.calls.downloads).toBe(0);
  });

  it('re-reads over a previous EXIF row, which is not somebody\'s correction', async () => {
    const c = client({ existing: { source: 'exif' }, downloadError: true });
    await captureFromExif(c, { ...FILE, mimeType: 'image/jpeg', fileName: 'corner.jpg' });
    expect(c.calls.downloads).toBe(1);
  });

  it('writes nothing and throws nothing when the object cannot be read', async () => {
    const c = client({ downloadError: true });
    await expect(captureFromExif(c, { ...FILE, mimeType: 'image/jpeg', fileName: 'a.jpg' })).resolves.toBeNull();
    expect(c.calls.upserts).toEqual([]);
  });

  it('writes nothing for an image with no GPS, which is an ordinary file and not an error', async () => {
    // A one-pixel PNG: real bytes, real parse, no GPS.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const c = client({ blob: new Blob([png], { type: 'image/png' }) });
    const out = await captureFromExif(c, { ...FILE, mimeType: 'image/png', fileName: 'shot.png' });
    expect(out).toBeNull();
    expect(c.calls.upserts).toEqual([]);
  });

  it('refuses a file too large to be a photograph rather than pulling it into memory', async () => {
    const huge = { size: 200 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
    const c = client({ blob: huge as unknown as Blob });
    const out = await captureFromExif(c, { ...FILE, mimeType: 'image/jpeg', fileName: 'scan.jpg' });
    expect(out).toBeNull();
    expect(c.calls.upserts).toEqual([]);
  });
});

// ── WIRED, NOT JUST BUILT ───────────────────────────────────────────────────────────────────────
//
// This module and `exif-capture.ts` sat in the tree for a day with a full test suite and no
// production importer: the orphan ratchet caught it, not this file. The upload route is the only
// door, so the assertion is about the door.
describe('the upload route actually calls it', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/jobs/files/route.ts'), 'utf8',
  ).replace(/\r\n/g, '\n');

  it('reads EXIF on a storage upload, without letting it fail the upload', () => {
    expect(src).toContain("import { captureFromExif } from '@/lib/jobs/exif-capture-server'");
    expect(src).toContain('fireAndForget(captureFromExif(');
    // Only for a storage upload: a linked file has no bytes of ours to read.
    const at = src.indexOf('captureFromExif(');
    const guard = src.lastIndexOf('if (isStorage && file) {', at);
    expect(guard).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(guard);
  });
});
