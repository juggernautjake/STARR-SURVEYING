// __tests__/media/mobile-capture-is-jpeg.test.ts
//
// Owner ask, 2026-08-08: *"whenever we take pictures on the app, whether on android or iphone, the
// images are always saved as png or jpeg… I do not want HEIC."*
//
// ── THIS WAS ALREADY CORRECT, AND ENTIRELY UNDEFENDED ──────────────────────────────────────────
//
// The audit found `mobile/lib/storage/mediaUpload.ts` already passing every captured photo through
// `ImageManipulator` with `SaveFormat.JPEG`, which is exactly right: iOS hands back HEIC from the
// picker, and re-encoding is what makes the format guarantee true rather than hopeful.
//
// Nothing protected it. Removing that one line — during a refactor, or while chasing a quality
// setting — would silently restore HEIC on every iPhone in the field, with no error, no failing test,
// and no visible symptom until somebody opened a receipt on a Windows machine months later.
//
// A guarantee nobody guards is a coincidence.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const MEDIA_UPLOAD = read('mobile/lib/storage/mediaUpload.ts');
const FIELD_MEDIA = read('mobile/lib/fieldMedia.ts');

/** Source with comments stripped — the headers discuss HEIC at length and would satisfy a naive match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const UPLOAD_CODE = strip(MEDIA_UPLOAD);
const FIELD_CODE = strip(FIELD_MEDIA);

describe('every photo the phone captures is re-encoded as JPEG', () => {
  it('runs captures through ImageManipulator', () => {
    expect(UPLOAD_CODE).toMatch(/ImageManipulator\.manipulateAsync/);
  });

  it('asks for JPEG explicitly', () => {
    // The line that makes the promise true. iOS returns HEIC from the picker regardless of what was
    // requested; re-encoding is the only thing that actually settles the format.
    expect(UPLOAD_CODE).toMatch(/format:\s*ImageManipulator\.SaveFormat\.JPEG/);
  });

  it('never asks for any other output format', () => {
    const formats = [...UPLOAD_CODE.matchAll(/SaveFormat\.([A-Z]+)/g)].map((m) => m[1]);
    expect(formats.length).toBeGreaterThan(0);
    expect([...new Set(formats)]).toEqual(['JPEG']);
  });

  it('stores photos under a .jpg path', () => {
    // The stored name must agree with the bytes. A `.heic` path here would mean the re-encode
    // happened and the filename still lied about it.
    expect(FIELD_CODE).toMatch(/\.jpg`/);
    expect(FIELD_CODE).not.toMatch(/\.heic/i);
  });
});

describe('video extensions describe the actual container', () => {
  it('recognises QuickTime rather than relabelling it mp4', () => {
    // iOS records .mov. Renaming it .mp4 produces a file whose name disagrees with its bytes, and
    // every downstream tool trusts the name.
    expect(FIELD_CODE).toMatch(/video\/quicktime/);
    expect(FIELD_CODE).toMatch(/'\.mov'/);
  });

  it('recognises 3gp rather than swallowing it', () => {
    // The old default returned '.mp4' for anything unrecognised, which is how an Android 3gp became
    // a file called .mp4 that would not play.
    expect(FIELD_CODE).toMatch(/'\.3gp'/);
  });
});
