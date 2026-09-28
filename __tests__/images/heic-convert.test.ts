// __tests__/images/heic-convert.test.ts
//
// The converter against REAL HEVC-coded HEIC files (x265-encoded, the way an iPhone writes them —
// see __tests__/fixtures/heic/generate.py; synthetic, CC0, nobody's photos). No mocks: this runs
// the actual libheif WebAssembly decoder that the browser worker and the server both use, and sharp
// for the server's JPEG encode.
//
// The three things that go visibly wrong with HEIC converters are each pinned here:
//   1. sideways portrait photos (orientation not applied),
//   2. the wrong frame of a burst (first image instead of the primary),
//   3. "conversion" that silently hands the HEIC back — which is what sharp alone did.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { decodeHeicPrimary, type LibheifLike } from '@/lib/images/heic-decode-core';
import {
  heicToJpeg, normaliseHeicUpload, normaliseHeicOrKeep, convertHeicForImageRoute, HEIC_415_MESSAGE,
} from '@/lib/media/heic-server';
import { normaliseImage } from '@/lib/media/normalise-image';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const libheif = require('libheif-js/wasm-bundle') as LibheifLike;

const FIX = path.join(process.cwd(), '__tests__', 'fixtures', 'heic');
const read = (n: string) => new Uint8Array(fs.readFileSync(path.join(FIX, n)));

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** RGB at (x, y) of a decoded JPEG. */
async function pixel(jpeg: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}
const reddish = ([r, g, b]: number[]) => r! > 150 && g! < 90 && b! < 90;
const blueish = ([r, g, b]: number[]) => b! > 150 && r! < 90 && g! < 90;
const greenish = ([r, g, b]: number[]) => g! > 150 && r! < 90 && b! < 110;

describe('why this exists: the prebuilt sharp cannot decode an iPhone HEIC', () => {
  it('fails on a real HEVC HEIC (so normaliseImage must not rely on it)', async () => {
    await expect(sharp(Buffer.from(read('plain.heic'))).jpeg().toBuffer()).rejects.toThrow();
  });
});

describe('decodeHeicPrimary (shared by the browser worker and the server)', () => {
  it('decodes a plain photo at full resolution', async () => {
    const d = await decodeHeicPrimary(libheif, read('plain.heic'));
    expect([d.width, d.height, d.imageCount]).toEqual([48, 32, 1]);
    expect(d.data.length).toBe(48 * 32 * 4);
  });

  it('applies the orientation: a portrait photo comes out upright, not sideways', async () => {
    // Stored 64×32 (red left, blue right) with a 90° rotation recorded. Upright it is 32×64 with
    // red at the TOP. A converter that ignores the rotation produces 64×32 — a sideways photo.
    const d = await decodeHeicPrimary(libheif, read('orientation-6.heic'));
    expect([d.width, d.height]).toEqual([32, 64]);
    const at = (x: number, y: number) => Array.from(d.data.slice((y * d.width + x) * 4, (y * d.width + x) * 4 + 3));
    expect(reddish(at(16, 4))).toBe(true);
    expect(blueish(at(16, 59))).toBe(true);
  });

  it('takes the PRIMARY image of a burst, not the first one in the file', async () => {
    const d = await decodeHeicPrimary(libheif, read('burst.heic'));
    expect(d.imageCount).toBe(2);
    expect([d.width, d.height]).toEqual([40, 24]); // the primary; the first image is 24×40 red
    expect(greenish(Array.from(d.data.slice(0, 3)))).toBe(true);
  });

  it('refuses bytes that are not a HEIF file', async () => {
    await expect(decodeHeicPrimary(libheif, new Uint8Array(200))).rejects.toMatchObject({ name: 'HeicDecodeError' });
  });
});

describe('heicToJpeg (server)', () => {
  it('produces an upright, full-size JPEG with no orientation tag left to double-apply', async () => {
    const jpeg = await heicToJpeg(read('orientation-6.heic'));
    expect(isJpeg(jpeg)).toBe(true);
    const meta = await sharp(jpeg).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([32, 64, 'jpeg']);
    expect(meta.orientation ?? 1).toBe(1);
    expect(reddish(await pixel(jpeg, 16, 4))).toBe(true);
    expect(blueish(await pixel(jpeg, 16, 59))).toBe(true);
  });
});

describe('normaliseHeicUpload — the one call a route makes', () => {
  it('converts a HEIC and renames it', async () => {
    const r = await normaliseHeicUpload({ bytes: read('plain.heic'), name: 'IMG_5782.HEIC', type: 'image/heic' });
    expect(r).toMatchObject({ converted: true, name: 'IMG_5782.jpg', contentType: 'image/jpeg' });
    expect(isJpeg(r.bytes)).toBe(true);
  });

  it('converts by the BYTES even when the upload claims to be a JPEG', async () => {
    const r = await normaliseHeicUpload({ bytes: read('plain.heic'), name: 'IMG_5782.JPG', type: 'image/jpeg' });
    expect(r.converted).toBe(true);
    expect(isJpeg(r.bytes)).toBe(true);
  });

  it('passes everything else through untouched', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 not an image');
    const r = await normaliseHeicUpload({ bytes: pdf, name: 'deed.pdf', type: 'application/pdf' });
    expect(r).toMatchObject({ converted: false, name: 'deed.pdf', contentType: 'application/pdf' });
    expect(Buffer.compare(r.bytes, Buffer.from(pdf))).toBe(0);
  });
});

describe('when a HEIC cannot be converted', () => {
  // A valid HEIC header over a body that is not a real HEIF: detected as HEIC, fails to decode.
  const broken = (() => {
    const b = read('plain.heic').slice(0, 40);
    const out = new Uint8Array(400);
    out.set(b);
    return out;
  })();

  it('an image-only route answers 415 with instructions, and stores nothing', async () => {
    const r = await convertHeicForImageRoute({ bytes: broken, name: 'IMG_1.HEIC', type: 'image/heic' });
    expect(r).toEqual({ ok: false, status: 415, error: HEIC_415_MESSAGE });
    expect(HEIC_415_MESSAGE).toMatch(/Most Compatible/);
  });

  it('a document store keeps the original and says why', async () => {
    const r = await normaliseHeicOrKeep({ bytes: broken, name: 'IMG_1.HEIC', type: 'image/heic' });
    expect(r.converted).toBe(false);
    expect(r.name).toBe('IMG_1.HEIC');
    expect(r.bytes.length).toBe(broken.length);
    expect(r.conversionError).toBeTruthy();
  });
});

describe('normaliseImage (the receipts route) now really converts an iPhone photo', () => {
  it('HEIC in, JPEG out — this threw before 2026-09-27', async () => {
    const r = await normaliseImage(read('plain.heic'));
    expect(r).toMatchObject({ converted: true, format: 'jpeg', extension: '.jpg', originalFormat: 'heic' });
    expect(isJpeg(r.bytes)).toBe(true);
  });
});
