// __tests__/images/heic-prepare.test.ts
//
// `prepareFilesForUpload` is the step every upload on the site now passes through (via the global
// guard, or called directly). What it must guarantee:
//
//   - HEICs out, JPEGs in — same place in the list, renamed, typed image/jpeg;
//   - everything else untouched, including the file object itself;
//   - the failure policy: a document store keeps the original, an image-only spot refuses it — and
//     either way the person is told, in words they can act on.
//
// The browser's Web Worker is swapped for a stand-in here (Node has no Worker or canvas). One suite
// plugs in the REAL decoder (libheif + sharp) as the stand-in, so the whole path is exercised on a
// real HEIC too.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  prepareFilesForUpload, setHeicConverterForTests, subscribeHeicStatus, convertHeicToJpeg,
  HeicConversionError, type HeicStatusEvent,
} from '@/lib/images/heic';
import { heicToJpeg } from '@/lib/media/heic-server';

const FIX = path.join(process.cwd(), '__tests__', 'fixtures', 'heic');
const HEIC = fs.readFileSync(path.join(FIX, 'plain.heic'));
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

const heicFile = (name = 'IMG_5782.HEIC', type = 'image/heic') => new File([HEIC], name, { type, lastModified: 1_700_000_000_000 });
const pdf = () => new File(['%PDF-1.4'], 'deed.pdf', { type: 'application/pdf' });
const jpg = () => new File([JPEG_BYTES], 'site.jpg', { type: 'image/jpeg' });

/** A stand-in converter that returns a tiny JPEG and records what it was asked to convert. */
function fakeConverter() {
  const calls: string[] = [];
  setHeicConverterForTests(async (blob) => {
    calls.push((blob as File).name);
    return new Blob([JPEG_BYTES], { type: 'image/jpeg' });
  });
  return calls;
}

function recordEvents() {
  const events: HeicStatusEvent[] = [];
  const stop = subscribeHeicStatus((e) => events.push(e));
  return { events, stop };
}

afterEach(() => setHeicConverterForTests(null));

describe('conversion', () => {
  it('replaces a HEIC with a JPEG named IMG_5782.jpg and typed image/jpeg, keeping its date', async () => {
    fakeConverter();
    const r = await prepareFilesForUpload([heicFile()]);
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.name).toBe('IMG_5782.jpg');
    expect(r.files[0]!.type).toBe('image/jpeg');
    expect(r.files[0]!.lastModified).toBe(1_700_000_000_000);
    expect(r.converted).toEqual([{ from: 'IMG_5782.HEIC', to: 'IMG_5782.jpg' }]);
    expect(r.changed).toBe(true);
  });

  it('keeps the order, and hands every non-HEIC back as the very same object', async () => {
    const calls = fakeConverter();
    const a = pdf();
    const b = jpg();
    const r = await prepareFilesForUpload([a, heicFile('one.heic'), b, heicFile('two.HEIF', '')]);
    expect(r.files.map((f) => f.name)).toEqual(['deed.pdf', 'one.jpg', 'site.jpg', 'two.jpg']);
    expect(r.files[0]).toBe(a);
    expect(r.files[2]).toBe(b);
    expect(calls).toEqual(['one.heic', 'two.HEIF']);
  });

  it('catches the wrong-MIME HEIC (named .JPG, typed image/jpeg) by its bytes', async () => {
    const calls = fakeConverter();
    const r = await prepareFilesForUpload([heicFile('IMG_0001.JPG', 'image/jpeg')]);
    expect(calls).toEqual(['IMG_0001.JPG']);
    expect(r.files[0]!.name).toBe('IMG_0001.jpg');
  });

  it('does nothing — not even a status event — when there is no HEIC', async () => {
    const calls = fakeConverter();
    const { events, stop } = recordEvents();
    const input = [pdf(), jpg()];
    const r = await prepareFilesForUpload(input);
    stop();
    expect(r.changed).toBe(false);
    expect(r.files).toEqual(input);
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('reports progress for the "Converting photo…" indicator, then goes idle and says what it did', async () => {
    fakeConverter();
    const { events, stop } = recordEvents();
    await prepareFilesForUpload([heicFile('a.heic'), heicFile('b.heic')]);
    stop();
    expect(events.filter((e) => e.type === 'progress')).toEqual([
      { type: 'progress', done: 0, total: 2 },
      { type: 'progress', done: 1, total: 2 },
      { type: 'progress', done: 2, total: 2 },
    ]);
    expect(events.some((e) => e.type === 'idle')).toBe(true);
    expect(events.find((e) => e.type === 'notice')).toMatchObject({ level: 'info', message: expect.stringMatching(/Converted 2/) });
  });
});

describe('when conversion fails', () => {
  const failing = () => setHeicConverterForTests(async () => { throw new HeicConversionError('decoder said no'); });

  it('a document store (any-file) uploads the original and warns', async () => {
    failing();
    const { events, stop } = recordEvents();
    const original = heicFile();
    const r = await prepareFilesForUpload([original, pdf()], { destination: 'any-file' });
    stop();
    expect(r.files[0]).toBe(original);
    expect(r.files).toHaveLength(2);
    expect(r.keptOriginal).toEqual([{ name: 'IMG_5782.HEIC', reason: 'decoder said no' }]);
    expect(r.rejected).toEqual([]);
    expect(events.find((e) => e.type === 'notice')).toMatchObject({ level: 'warning', message: expect.stringMatching(/original HEIC was uploaded/) });
  });

  it('an image-only spot leaves it out and explains what to do instead', async () => {
    failing();
    const { events, stop } = recordEvents();
    const r = await prepareFilesForUpload([heicFile(), jpg()], { destination: 'image-only' });
    stop();
    expect(r.files.map((f) => f.name)).toEqual(['site.jpg']);
    expect(r.rejected).toEqual([{ name: 'IMG_5782.HEIC', reason: 'decoder said no' }]);
    expect(r.changed).toBe(true);
    const notice = events.find((e) => e.type === 'notice');
    expect(notice).toMatchObject({ level: 'error' });
    expect((notice as { message: string }).message).toMatch(/only accepts JPEG or PNG/);
    expect((notice as { message: string }).message).toMatch(/Most Compatible/);
  });

  it('an empty result from the converter is a failure, not a 0-byte JPEG', async () => {
    setHeicConverterForTests(async () => new Blob([]));
    await expect(convertHeicToJpeg(heicFile())).rejects.toBeInstanceOf(HeicConversionError);
  });

  it('silent: true suppresses the site-wide notices for callers that show their own', async () => {
    failing();
    const { events, stop } = recordEvents();
    await prepareFilesForUpload([heicFile()], { destination: 'image-only', silent: true });
    stop();
    expect(events).toEqual([]);
  });
});

describe('end to end with the real decoder in place of the browser worker', () => {
  it('a real HEIC comes out as a real, decodable JPEG of the same size', async () => {
    setHeicConverterForTests(async (blob) =>
      new Blob([new Uint8Array(await heicToJpeg(new Uint8Array(await blob.arrayBuffer())))], { type: 'image/jpeg' }));
    const r = await prepareFilesForUpload([heicFile()]);
    const out = Buffer.from(await r.files[0]!.arrayBuffer());
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 48, 32]);
  });
});
