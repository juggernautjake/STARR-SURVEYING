// __tests__/media/image-format.test.ts
//
// Owner ask, 2026-08-08: *"the images are always saved as png or jpeg… I do not want HEIC… make sure
// we cannot even take HEIC."*
//
// ── THE FILENAME IS NOT EVIDENCE ───────────────────────────────────────────────────────────────
//
// The reason this sniffs bytes is that on this exact problem the extension and the MIME type are
// routinely wrong. iOS hands a HEIC to a web form named `IMG_0001.JPG` when "Most Compatible" is half
// configured; browsers label HEIC as `application/octet-stream` because they do not know it; anything
// that has been through a chat app or a rename has lost whatever truth it had.
//
// Believing the name would store a HEIC under a `.jpg`, which is worse than storing an honest HEIC —
// the file now lies, and it surfaces months later in whatever tool cannot open it.

import { describe, it, expect } from 'vitest';
import {
  sniffImageFormat,
  sniffVideoContainer,
  decideImage,
  extensionFor,
} from '@/lib/media/image-format';

/** Build a header: `size` then `ftyp` then a brand — the ISO base-media shape HEIC/MP4/MOV share. */
function ftyp(brand: string): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x00, 0x00, 0x00, 0x20], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4); // 'ftyp'
  for (let i = 0; i < 4; i++) b[8 + i] = brand.charCodeAt(i);
  return b;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('recognising what a file actually is', () => {
  it('knows a JPEG', () => expect(sniffImageFormat(JPEG)).toBe('jpeg'));
  it('knows a PNG', () => expect(sniffImageFormat(PNG)).toBe('png'));

  it.each(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])('knows the %s HEIF brand', (brand) => {
    // Apple emits several. Recognising only 'heic' would let the others through as 'unknown' and
    // straight into storage — the exact outcome this feature exists to prevent.
    expect(sniffImageFormat(ftyp(brand))).toBe('heic');
  });

  it('knows WebP, GIF, TIFF and BMP', () => {
    const webp = new Uint8Array(16);
    'RIFF'.split('').forEach((c, i) => (webp[i] = c.charCodeAt(0)));
    'WEBP'.split('').forEach((c, i) => (webp[8 + i] = c.charCodeAt(0)));
    expect(sniffImageFormat(webp)).toBe('webp');

    const gif = new Uint8Array(8);
    'GIF89a'.split('').forEach((c, i) => (gif[i] = c.charCodeAt(0)));
    expect(sniffImageFormat(gif)).toBe('gif');

    expect(sniffImageFormat(new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]))).toBe('tiff');
    expect(sniffImageFormat(new Uint8Array([0x42, 0x4d, 0, 0, 0, 0, 0, 0]))).toBe('bmp');
  });

  it('does not mistake an MP4 for a photo', () => {
    // MP4 and HEIC share the `ftyp` header and differ ONLY in the brand. Getting this wrong would
    // send a video into the image converter.
    expect(sniffImageFormat(ftyp('isom'))).toBe('unknown');
    expect(sniffImageFormat(ftyp('mp42'))).toBe('unknown');
  });

  it('says unknown rather than guessing', () => {
    expect(sniffImageFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe('unknown');
    expect(sniffImageFormat(new Uint8Array([]))).toBe('unknown');
    expect(sniffImageFormat(new Uint8Array([0xff]))).toBe('unknown');
  });
});

describe('what happens to an upload', () => {
  it('lets a JPEG and a PNG through untouched', () => {
    expect(decideImage(JPEG)).toMatchObject({ accept: true, convert: false });
    expect(decideImage(PNG)).toMatchObject({ accept: true, convert: false });
  });

  it('CONVERTS a HEIC rather than refusing it', () => {
    // The owner asked for conversion, not a wall: "we need a way to easily upload and convert HEIC".
    // Refusing would be less code and would push the problem onto somebody standing in a field
    // holding a phone.
    const d = decideImage(ftyp('heic'));
    expect(d).toMatchObject({ format: 'heic', accept: false, convert: true });
    expect(d.reason).toBeUndefined();
  });

  it('never accepts a HEIC as-is', () => {
    // The literal ask: "make sure we cannot even take HEIC".
    for (const brand of ['heic', 'heix', 'hevc', 'mif1']) {
      expect(decideImage(ftyp(brand)).accept).toBe(false);
    }
  });

  it('refuses something that is not an image, with a usable reason', () => {
    const d = decideImage(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(d.accept).toBe(false);
    expect(d.convert).toBe(false);
    expect(d.reason).toContain('HEIC');
  });
});

describe('the extension a file is stored under', () => {
  it('only ever yields .jpg or .png', () => {
    // Derived from the BYTES, never from the uploaded filename — the filename is the part that lies.
    for (const f of ['jpeg', 'png', 'heic', 'webp', 'gif', 'tiff', 'bmp', 'unknown'] as const) {
      expect(['.jpg', '.png']).toContain(extensionFor(f));
    }
    expect(extensionFor('png')).toBe('.png');
    expect(extensionFor('heic')).toBe('.jpg');
  });
});

describe('video containers', () => {
  it('tells QuickTime from MP4', () => {
    // iOS records .mov. Storing that under a .mp4 name produces a file whose name lies about its
    // bytes, which is worse than an honest .mov.
    expect(sniffVideoContainer(ftyp('qt  '))).toBe('mov');
    expect(sniffVideoContainer(ftyp('isom'))).toBe('mp4');
    expect(sniffVideoContainer(ftyp('mp42'))).toBe('mp4');
    expect(sniffVideoContainer(ftyp('avc1'))).toBe('mp4');
  });

  it('says unknown for anything else', () => {
    expect(sniffVideoContainer(JPEG)).toBe('unknown');
    expect(sniffVideoContainer(new Uint8Array(4))).toBe('unknown');
  });
});
