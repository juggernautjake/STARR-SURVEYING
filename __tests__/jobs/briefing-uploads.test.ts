// __tests__/jobs/briefing-uploads.test.ts — slice B3 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// The two rules that decide whether a 120 MB screen recording arrives intact, both of which fail
// quietly when they are wrong:
//
//   · the object PATH is derived, not agreed. The upload endpoint mints a signed URL for a key and
//     the completion endpoint has to name the same key. Two independent constructions is how a file
//     uploads successfully and then cannot be found;
//   · the SIZE is checked before a URL is minted, because a 413 from the CDN halfway through a
//     ten-minute upload is a worse error than a sentence beforehand.

import { describe, it, expect } from 'vitest';
import {
  briefingObjectPath, validateUpload, isRejection, bucketForKind, BUCKET_LIMIT_BYTES,
} from '@/lib/jobs/briefings';

const BID = '8be5a0f2-59d0-424b-9604-7bf1794459a8';

describe('the object path', () => {
  it('files the item under its briefing', () => {
    expect(briefingObjectPath(BID, 'walkthrough.webm', 'u1')).toBe(`briefings/${BID}/u1-walkthrough.webm`);
  });

  it('keeps two recordings of the same name apart', () => {
    // The ordinary case, not an edge one: every OS calls the second capture "Screen Recording" too,
    // and without the unique part the second upload silently replaces the first.
    const a = briefingObjectPath(BID, 'Screen Recording.webm', 'u1');
    const b = briefingObjectPath(BID, 'Screen Recording.webm', 'u2');
    expect(a).not.toBe(b);
  });

  it('flattens anything that would break an object key', () => {
    // The property that matters is the shape, not the exact slug: exactly three segments, and no
    // `..` that could climb out of the briefing's folder. (This one collapses to `u1-file` because
    // every character before the last dot is punctuation — safe, and not worth pinning literally.)
    for (const nasty of ['../../etc/passwd', 'a/b/c.webm', '..\\..\\win.ini', 'nul.webm']) {
      const p = briefingObjectPath(BID, nasty, 'u1');
      expect(p.split('/').length, `${nasty} → ${p}`).toBe(3);
      expect(p).not.toContain('..');
      expect(p.startsWith(`briefings/${BID}/`)).toBe(true);
    }
  });

  it('survives a name that is entirely punctuation', () => {
    expect(briefingObjectPath(BID, '***.webm', 'u1')).toBe(`briefings/${BID}/u1-file.webm`);
  });

  it('keeps a sane extension and drops a silly one', () => {
    expect(briefingObjectPath(BID, 'clip.WEBM', 'u1')).toMatch(/\.webm$/);
    // A 40-character "extension" is not an extension; carrying it into the key helps nobody.
    expect(briefingObjectPath(BID, `clip.${'x'.repeat(40)}`, 'u1')).toBe(`briefings/${BID}/u1-clip`);
  });

  it('bounds the length of a very long name', () => {
    const p = briefingObjectPath(BID, `${'a'.repeat(400)}.webm`, 'u1');
    expect(p.length).toBeLessThan(140);
  });
});

describe('which bucket', () => {
  it('sends a video where 500 MB is allowed', () => {
    // The reason a screen recording has somewhere to go without provisioning anything.
    expect(bucketForKind('video')).toBe('starr-field-videos');
    expect(BUCKET_LIMIT_BYTES['starr-field-videos']).toBe(500 * 1024 * 1024);
  });

  it('has no bucket for a note, which stores no bytes', () => {
    expect(bucketForKind('note')).toBeNull();
  });

  it('refuses a kind it does not know rather than guessing one', () => {
    expect(bucketForKind('hologram')).toBeNull();
  });
});

describe('validating an upload before minting a URL', () => {
  const ok = (v: ReturnType<typeof validateUpload>) => !isRejection(v);

  it('accepts an ordinary recording', () => {
    const v = validateUpload({ kind: 'video', fileName: 'walkthrough.webm', sizeBytes: 90 * 1024 * 1024 });
    expect(ok(v)).toBe(true);
  });

  it('refuses a video over the bucket ceiling, and says both numbers', () => {
    const v = validateUpload({ kind: 'video', fileName: 'long.webm', sizeBytes: 700 * 1024 * 1024 });
    expect(isRejection(v)).toBe(true);
    if (isRejection(v)) {
      expect(v.error).toContain('700 MB');
      expect(v.error).toContain('500 MB');
      // A limit with no way past it is a dead end; the message says what to do.
      expect(v.error).toMatch(/shorter parts|resolution/i);
    }
  });

  it('refuses a note, which has no file', () => {
    const v = validateUpload({ kind: 'note', fileName: 'x.txt' });
    expect(isRejection(v)).toBe(true);
  });

  it('refuses an unknown kind by name', () => {
    const v = validateUpload({ kind: 'hologram', fileName: 'x.bin' });
    expect(isRejection(v)).toBe(true);
    if (isRejection(v)) expect(v.error).toContain('hologram');
  });

  it('refuses a nameless file', () => {
    expect(isRejection(validateUpload({ kind: 'video', fileName: '   ' }))).toBe(true);
  });

  it('allows an upload whose size is unknown', () => {
    // The recorder does not always know the byte count before it finishes. An unknown size is not a
    // reason to refuse — storage still enforces its own ceiling.
    expect(ok(validateUpload({ kind: 'video', fileName: 'a.webm', sizeBytes: null }))).toBe(true);
  });

  it('holds a photo to the photo ceiling, not the video one', () => {
    const v = validateUpload({ kind: 'photo', fileName: 'corner.jpg', sizeBytes: 30 * 1024 * 1024 });
    expect(isRejection(v)).toBe(true);
    if (isRejection(v)) expect(v.error).toContain('25 MB');
  });
});
