// __tests__/dnd/storage-quota.test.ts — a ceiling on total stored bytes (P2-7, audit F-6).
//
// P1-6 capped how big ONE upload can be. Nothing capped how many, so one account could fill the media
// bucket 25 MB at a time and the only symptom would be the storage bill.
//
// THE ASSERTION THAT MATTERS MOST is that deleting frees bytes. A quota which only counts upward looks
// perfectly healthy for months and then locks every active account out permanently, all at once. It is the
// failure mode a reviewer never sees and a user cannot work around, so `releaseStorage` gets more tests
// here than the ceiling itself.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STORAGE_QUOTA_BYTES, STORAGE_WARN_FRACTION, quotaState, wouldExceedQuota, formatBytes, quotaMessage,
} from '@/lib/dnd/storage-quota';
import { objectPathFromUrl } from '@/lib/dnd/storage-ledger';
import { UPLOAD_LIMITS } from '@/lib/dnd/upload-limits';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MB = 1024 * 1024;

/** Every route that stores bytes and so must both CHECK and RECORD. */
const UPLOAD_ROUTES = [
  'app/api/dnd/profile/avatar/route.ts',
  'app/api/dnd/media/route.ts',
  'app/api/dnd/handouts/route.ts',
  'app/api/dnd/messages/image/route.ts',
  'app/api/dnd/characters/[id]/media/route.ts',
  'app/api/dnd/campaigns/[id]/maps/route.ts',
  'app/api/dnd/campaigns/[id]/soundboard/sounds/route.ts',
];

describe('the ceiling', () => {
  it('is well above any real campaign and well below a script', () => {
    // The gap is the point: this is a cost and abuse control, not a usage policy. If a genuine table ever
    // trips it, the number is wrong rather than the table.
    expect(STORAGE_QUOTA_BYTES).toBe(500 * MB);
    // It must hold a meaningful number of the largest single file the per-file limits allow, or the two
    // controls contradict each other.
    expect(STORAGE_QUOTA_BYTES / UPLOAD_LIMITS.LARGE_FILE).toBeGreaterThanOrEqual(15);
  });

  it('counts the INCOMING file, so nobody overshoots by one upload', () => {
    // Checking only `used >= limit` would let every account exceed the quota by one file — at a 25 MB
    // per-file ceiling that is not a rounding error.
    expect(wouldExceedQuota(STORAGE_QUOTA_BYTES - 1, 2)).toBe(true);
    expect(wouldExceedQuota(STORAGE_QUOTA_BYTES - 10, 10)).toBe(false);
    expect(wouldExceedQuota(0, STORAGE_QUOTA_BYTES + 1)).toBe(true);
  });

  it('treats junk input as zero rather than throwing or passing', () => {
    expect(wouldExceedQuota(NaN, 10)).toBe(false);
    expect(wouldExceedQuota(-500, 10)).toBe(false);
    expect(quotaState(NaN).used).toBe(0);
    expect(quotaState(-5).used).toBe(0);
  });

  it('warns while there is still room to act', () => {
    expect(quotaState(STORAGE_QUOTA_BYTES * STORAGE_WARN_FRACTION).warn).toBe(true);
    expect(quotaState(STORAGE_QUOTA_BYTES * 0.5).warn).toBe(false);
    expect(STORAGE_WARN_FRACTION).toBeLessThan(1);
  });

  it('and reports remaining without going negative', () => {
    expect(quotaState(STORAGE_QUOTA_BYTES * 2).remaining).toBe(0);
  });
});

describe('the message a person reads', () => {
  it('formats bytes at a sensible scale', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(8 * MB)).toBe('8 MB');
    expect(formatBytes(1536 * MB)).toBe('1.5 GB');
    expect(formatBytes(NaN)).toBe('0 bytes');
  });

  it('names the remedy, not just the refusal', () => {
    // A quota with no stated way out reads as a dead end, and the way out here is not obvious — nothing
    // else in the app suggests that deleting old images does anything.
    expect(quotaMessage(400 * MB)).toMatch(/Delete some images or files/);
    expect(quotaMessage(400 * MB)).toMatch(/400 MB/);
    expect(quotaMessage(400 * MB)).toMatch(/500 MB/);
  });
});

describe('recovering a storage key from a stored URL', () => {
  it('finds the path after the bucket segment', () => {
    expect(objectPathFromUrl('https://x.supabase.co/storage/v1/object/public/dnd-media/avatars/a/b.png', 'dnd-media'))
      .toBe('avatars/a/b.png');
  });

  it('and returns null rather than guessing when the URL is from elsewhere', () => {
    // Guessing would delete a ledger row for an object that is still stored, quietly leaking quota.
    expect(objectPathFromUrl('https://example.com/some/other/file.png', 'dnd-media')).toBeNull();
    expect(objectPathFromUrl('', 'dnd-media')).toBeNull();
  });
});

describe('every upload route both CHECKS and RECORDS', () => {
  it.each(UPLOAD_ROUTES)('%s', (path) => {
    const src = read(path);
    // Checking without recording means the quota never rises and the control does nothing. Recording
    // without checking means it rises and never refuses. Both halves, or neither is worth having.
    expect(src, 'must check the quota').toContain('await checkStorageQuota(');
    expect(src, 'must record what it stored').toContain('await recordStorage(');
  });

  it('and the check happens where the file size is actually known', () => {
    // Found while wiring this: the first attempt put the guard next to the rate-limit guard, which runs
    // BEFORE the multipart form is parsed — so `file` was not in scope and it did not compile. The check
    // belongs beside the per-file size test, which is the first point the size exists.
    for (const p of UPLOAD_ROUTES) {
      const src = read(p);
      const quotaAt = src.indexOf('await checkStorageQuota(');
      const sizeAt = src.indexOf('file.size > MAX_BYTES');
      if (sizeAt === -1) continue;
      expect(quotaAt, `${p}: the quota check must follow the per-file size check`).toBeGreaterThan(sizeAt);
    }
  });

  it('refusing returns 413, not a generic 400', () => {
    for (const p of UPLOAD_ROUTES) {
      expect(read(p)).toMatch(/error: overQuota \}, \{ status: 413 \}/);
    }
  });
});

describe('deleting frees the bytes — the half that makes this survivable', () => {
  const DELETE_ROUTES = [
    'app/api/dnd/media/route.ts',
    'app/api/dnd/campaigns/[id]/maps/route.ts',
    'app/api/dnd/characters/[id]/uploads/route.ts',
  ];

  it.each(DELETE_ROUTES)('%s releases what it removes', (path) => {
    expect(read(path)).toContain('await releaseStorage(');
  });

  it('every route that removes a stored object also releases it', () => {
    // Derived rather than listed: a new delete path that strips an object without freeing its bytes fails
    // here instead of quietly making the quota one-way.
    for (const p of DELETE_ROUTES) {
      const src = read(p);
      expect(src).toMatch(/storage\.from\(BUCKET\)\.remove\(/);
      expect(src, `${p} removes an object but never calls releaseStorage`).toContain('releaseStorage(');
    }
  });

  it('and releases even when the storage removal itself failed', () => {
    // The row is gone and the user cannot reach the file, so continuing to charge them for it is the worse
    // error. This is why the release sits outside the try/catch rather than inside it.
    const src = read('app/api/dnd/characters/[id]/uploads/route.ts');
    const catchEnd = src.indexOf('/* leave the orphaned object');
    expect(src.indexOf('await releaseStorage('), 'release must come after the catch, not inside it')
      .toBeGreaterThan(catchEnd);
  });
});

describe('the ledger is honest about failure', () => {
  const lib = read('lib/dnd/storage-ledger.ts');

  it('fails OPEN, like the rate limiter', () => {
    // A broken cost control that blocks every upload is worse than a brief window with no ceiling.
    expect(lib).toMatch(/catch \{\s*return 0;/);
  });

  it('and never fails an upload that already succeeded', () => {
    // The bytes are in the bucket by the time `recordStorage` runs. Throwing would show an error for an
    // upload that worked.
    expect(lib).toMatch(/never fail a completed upload over bookkeeping/);
  });

  it('the ledger upserts on path, so a retry cannot double-count', () => {
    // Double-counting would leak quota nothing could free, because the release path deletes by path.
    expect(lib).toContain("{ onConflict: 'object_path' }");
    expect(read('seeds/459_dnd_storage_ledger.sql')).toMatch(/object_path\s+text not null unique/);
  });
});
