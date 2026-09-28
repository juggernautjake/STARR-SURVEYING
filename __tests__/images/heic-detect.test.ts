// __tests__/images/heic-detect.test.ts
//
// Detection is the part that decides whether anything happens at all, and HEIC is the format whose
// MIME type and file name are most often wrong. So each of the three witnesses is tested on its own,
// and then the case that matters most: when they disagree, the BYTES win.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isHeicMime, hasHeicExtension, isHeicBytes, readFtypBrands, heicHint, isHeicFile,
  toJpegFileName, acceptIsImageOnly, HEIC_SNIFF_BYTES,
} from '@/lib/images/heic-detect';

const FIX = path.join(process.cwd(), '__tests__', 'fixtures', 'heic');
const REAL_HEIC = new Uint8Array(fs.readFileSync(path.join(FIX, 'plain.heic')));

/** An ISO-BMFF `ftyp` box with the given major and compatible brands. */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + 4 * compatible.length;
  const b = new Uint8Array(Math.max(size, 32));
  new DataView(b.buffer).setUint32(0, size);
  const put = (off: number, s: string) => { for (let i = 0; i < 4; i++) b[off + i] = s.charCodeAt(i); };
  put(4, 'ftyp');
  put(8, major);
  compatible.forEach((c, i) => put(16 + 4 * i, c));
  return b;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

describe('MIME type', () => {
  it.each(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence', 'IMAGE/HEIC', 'image/heic; charset=binary'])(
    'recognises %s', (t) => expect(isHeicMime(t)).toBe(true));
  it.each(['', null, undefined, 'image/jpeg', 'application/octet-stream', 'image/avif'])(
    'does not claim %s', (t) => expect(isHeicMime(t as string)).toBe(false));
});

describe('extension', () => {
  it.each(['IMG_5782.HEIC', 'photo.heic', 'x.HEIF', 'burst.hif', 'a.b.c.heic'])('recognises %s', (n) =>
    expect(hasHeicExtension(n)).toBe(true));
  it.each(['IMG_5782.jpg', 'heic', 'heic.pdf', '', null, 'folder.heic/file.png'])('does not claim %s', (n) =>
    expect(hasHeicExtension(n as string)).toBe(false));
});

describe('magic bytes (the ftyp box)', () => {
  it('reads the brands out of a real iPhone-style file', () => {
    expect(readFtypBrands(REAL_HEIC)).toMatchObject({ major: 'heic' });
    expect(isHeicBytes(REAL_HEIC)).toBe(true);
  });

  it.each(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])('knows the %s brand', (brand) => {
    expect(isHeicBytes(ftyp(brand))).toBe(true);
  });

  it('does not mistake an AVIF that declares mif1 for a HEIC', () => {
    // AVIF is HEIF-family too, commonly `mif1` major + `avif` compatible. Browsers display AVIF
    // natively, and an HEVC decoder cannot read it — it must be left alone.
    expect(isHeicBytes(ftyp('mif1', ['mif1', 'miaf', 'avif']))).toBe(false);
    expect(isHeicBytes(ftyp('avif', ['mif1']))).toBe(false);
  });

  it('takes a mif1 file with a heic compatible brand as HEIC', () => {
    expect(isHeicBytes(ftyp('mif1', ['mif1', 'heic']))).toBe(true);
  });

  it('does not claim MP4, QuickTime, JPEG, PNG or garbage', () => {
    expect(isHeicBytes(ftyp('isom', ['isom', 'mp41']))).toBe(false);
    expect(isHeicBytes(ftyp('qt  '))).toBe(false);
    expect(isHeicBytes(JPEG)).toBe(false);
    expect(isHeicBytes(PNG)).toBe(false);
    expect(isHeicBytes(new Uint8Array(3))).toBe(false);
  });

  it('needs no more than the sniff window', () => {
    expect(isHeicBytes(REAL_HEIC.slice(0, HEIC_SNIFF_BYTES))).toBe(true);
  });
});

describe('heicHint — the synchronous first look', () => {
  it('says heic when the name or type says so', () => {
    expect(heicHint({ name: 'IMG_1.HEIC', type: '' })).toBe('heic');
    expect(heicHint({ name: 'x', type: 'image/heif' })).toBe('heic');
  });
  it('says maybe for any image, and for files the browser could not type', () => {
    expect(heicHint({ name: 'IMG_1.JPG', type: 'image/jpeg' })).toBe('maybe');
    expect(heicHint({ name: 'IMG_1', type: '' })).toBe('maybe');
    expect(heicHint({ name: 'x.bin', type: 'application/octet-stream' })).toBe('maybe');
  });
  it('says no for files that are plainly not photos — those are never touched', () => {
    expect(heicHint({ name: 'deed.pdf', type: 'application/pdf' })).toBe('no');
    expect(heicHint({ name: 'points.csv', type: 'text/csv' })).toBe('no');
    expect(heicHint({ name: 'clip.mov', type: 'video/quicktime' })).toBe('no');
  });
});

describe('isHeicFile — all three witnesses, bytes decide', () => {
  const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes], name, { type });

  it('a normal HEIC', async () => {
    expect(await isHeicFile(file(REAL_HEIC, 'IMG_5782.HEIC', 'image/heic'))).toBe(true);
  });

  it('THE WRONG-MIME CASE: HEIC bytes under a .JPG name and an image/jpeg type', async () => {
    expect(await isHeicFile(file(REAL_HEIC, 'IMG_5782.JPG', 'image/jpeg'))).toBe(true);
  });

  it('HEIC bytes with no type at all (Chrome on Windows) and no extension', async () => {
    expect(await isHeicFile(file(REAL_HEIC, 'IMG_5782', ''))).toBe(true);
    expect(await isHeicFile(file(REAL_HEIC, 'upload.bin', 'application/octet-stream'))).toBe(true);
  });

  it('a JPEG merely NAMED .heic is not converted — there is nothing to convert', async () => {
    expect(await isHeicFile(file(JPEG, 'IMG_5782.HEIC', 'image/heic'))).toBe(false);
  });

  it('a PDF is never read at all', async () => {
    expect(await isHeicFile(file(REAL_HEIC, 'deed.pdf', 'application/pdf'))).toBe(false);
  });

  it('falls back to the declared type when the bytes cannot be read', async () => {
    const unreadable = { name: 'IMG.HEIC', type: 'image/heic', slice: () => ({ arrayBuffer: () => Promise.reject(new Error('gone')) }) };
    expect(await isHeicFile(unreadable)).toBe(true);
  });
});

describe('renaming', () => {
  it.each([
    ['IMG_5782.HEIC', 'IMG_5782.jpg'],
    ['IMG_5782.heic', 'IMG_5782.jpg'],
    ['holiday.photo.heif', 'holiday.photo.jpg'],
    ['IMG_5782', 'IMG_5782.jpg'],
    ['', 'photo.jpg'],
    [null, 'photo.jpg'],
    ['.heic', 'photo.jpg'],
    ['C:\\fakepath\\IMG_1.HEIC', 'IMG_1.jpg'],
  ])('%s → %s', (from, to) => expect(toJpegFileName(from as string)).toBe(to));
});

describe('acceptIsImageOnly — decides what a failed conversion does', () => {
  it.each(['image/*', 'image/png,image/jpeg', 'image/jpeg, .heic', '.jpg,.png'])('%s is image-only', (a) =>
    expect(acceptIsImageOnly(a)).toBe(true));
  it.each(['', null, 'image/*,.pdf', 'image/*,video/*', 'application/pdf'])('%s accepts other files', (a) =>
    expect(acceptIsImageOnly(a as string)).toBe(false));
});
