// __tests__/storage/upload-cap.test.ts — the one number, and the ordering rule that protects it.
//
// ── WHY A TEST AND NOT A COMMENT ────────────────────────────────────────────────────────────────
//
// This platform has now had the same defect twice, in two places, eleven weeks apart: a CLIENT cap
// larger than what the bucket accepts. The symptom is the cruellest one available — the upload
// works, the bar reaches 100%, and then it fails, having spent every byte of somebody's 375 MB
// video and, in the field, somebody's cellular data.
//
// The rule that prevents it is an ORDER: raise the buckets in a seed FIRST, then the constant. An
// order cannot be enforced by a comment. So the seeds are read here, and the constant is checked
// against what they set. If somebody raises `STORAGE_UPLOAD_CAP_BYTES` alone, this goes red before
// a person ever waits through a doomed transfer.
//
// It deliberately does NOT check live storage: a test that needs the network is a test that gets
// skipped. Proving the buckets really accept the number is `scripts/check-upload-ceiling.mjs`,
// which transfers real bytes, and was last run on 2026-08-22 (500 MB accepted on all three).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STORAGE_UPLOAD_CAP_BYTES, uploadCapBytes } from '@/lib/storage/uploads';
import { MAX_JOB_FILE_BYTES, MAX_JOB_VIDEO_BYTES } from '@/lib/jobs/file-storage';
import { MAX_UPLOAD_BYTES as FILE_EXPLORER_MAX_BYTES } from '@/lib/files/upload';

/** Every `file_size_limit = <n>` a seed sets, in bytes. */
function bucketLimitsIn(seedFile: string): number[] {
  const sql = readFileSync(join(process.cwd(), 'seeds', seedFile), 'utf8');
  // Only real statements — a limit mentioned in a comment line is prose, not a setting.
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .flatMap((line) => [...line.matchAll(/file_size_limit\s*=\s*(\d+)/gi)].map((m) => Number(m[1])))
    .concat(
      // Seed 608 sets it positionally in an INSERT ... VALUES rather than by name.
      sql.includes("'file-explorer'") ? [...sql.matchAll(/^\s{2}(\d{6,}),/gm)].map((m) => Number(m[1])) : [],
    );
}

describe('one cap, shared by every upload surface', () => {
  it('is 500 MB, the number proven by transfer on 2026-08-22', () => {
    expect(STORAGE_UPLOAD_CAP_BYTES).toBe(500 * 1024 * 1024);
  });

  it('is what the job page, project files and the File Explorer all use', () => {
    // Three surfaces once held three different numbers — 100 MB, 500 MB and 50 MB — and the one a
    // person hit depended on which page they were standing on.
    expect(MAX_JOB_FILE_BYTES).toBe(STORAGE_UPLOAD_CAP_BYTES);
    expect(MAX_JOB_VIDEO_BYTES).toBe(STORAGE_UPLOAD_CAP_BYTES);
    expect(FILE_EXPLORER_MAX_BYTES).toBe(STORAGE_UPLOAD_CAP_BYTES);
  });

  it('can still be overridden per environment, without the override becoming the configuration', () => {
    const before = process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES;
    try {
      process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES = String(64 * 1024 * 1024);
      expect(uploadCapBytes()).toBe(64 * 1024 * 1024);
      // Nonsense is ignored rather than taken literally: a cap of NaN or 0 would refuse everything.
      process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES = 'five hundred';
      expect(uploadCapBytes()).toBe(STORAGE_UPLOAD_CAP_BYTES);
      process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES = '0';
      expect(uploadCapBytes()).toBe(STORAGE_UPLOAD_CAP_BYTES);
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES;
      else process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES = before;
    }
  });
});

describe('the buckets are raised before the constant, never after', () => {
  it('starr-field-files (seed 607) accepts at least the cap', () => {
    const limits = bucketLimitsIn('607_file_labels_tags_comments.sql');
    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(limit).toBeGreaterThanOrEqual(STORAGE_UPLOAD_CAP_BYTES);
  });

  it('file-explorer (seed 608) accepts at least the cap', () => {
    // The bucket this seed creates did not exist at all until 2026-08-22. Left to runtime
    // auto-creation it would have been 50 MB, under a client that had been told it could send 100.
    const limits = bucketLimitsIn('608_file_explorer_bucket_500mb.sql');
    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(limit).toBeGreaterThanOrEqual(STORAGE_UPLOAD_CAP_BYTES);
  });

  it('the mobile app refuses no earlier than the web does', () => {
    // Separate app, separate build, so it cannot import the constant — it carries its own copy, and
    // a copy that drifts DOWN is a surveyor being refused in the field for a file the office can
    // upload. Read as text rather than imported: the mobile tree is Expo, not Next.
    const src = readFileSync(join(process.cwd(), 'mobile', 'lib', 'jobFiles.ts'), 'utf8');
    const m = /const MAX_FILE_BYTES = (\d+) \* 1024 \* 1024;/.exec(src);
    expect(m).not.toBeNull();
    expect(Number(m?.[1]) * 1024 * 1024).toBe(STORAGE_UPLOAD_CAP_BYTES);
  });
});
