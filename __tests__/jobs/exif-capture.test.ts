// __tests__/jobs/exif-capture.test.ts — reading a position out of a photograph.
//
// The tag-shaped tests here run against plain objects rather than real JPEGs on purpose: what needs
// asserting is how the awkward tag sets real cameras produce are interpreted, and a fixture image
// would test `exifr` rather than this module. The one thing that genuinely needs a file — that a
// corrupt buffer does not throw — is tested with a buffer.

import { describe, it, expect } from 'vitest';
import {
  readExifTags, plausibleFix, normaliseHeading, mightCarryExif, readCapture, asTrack,
} from '@/lib/jobs/exif-capture';
import { trackShape } from '@/lib/jobs/capture-track';

/** What exifr returns for an iPhone photo taken in Temple, Texas. */
const IPHONE = {
  latitude: 31.0982,
  longitude: -97.3428,
  GPSImgDirection: 274.5,
  GPSAltitude: 201.3,
  DateTimeOriginal: new Date('2026-09-14T14:42:11.000Z'),
  Make: 'Apple',
  Model: 'iPhone 15 Pro',
};

describe('the ordinary photograph', () => {
  const c = readExifTags(IPHONE)!;

  it('reads the position', () => {
    expect(c.lat).toBeCloseTo(31.0982, 6);
    expect(c.lng).toBeCloseTo(-97.3428, 6);
  });

  it('keeps the WEST longitude negative', () => {
    // The conversion most hand-rolled readers get wrong. Texas is west; a dropped sign puts every
    // photograph in China rather than somewhere obviously broken, so it would not be noticed.
    expect(c.lng).toBeLessThan(0);
  });

  it('reads heading, altitude, time and device', () => {
    expect(c.headingDeg).toBeCloseTo(274.5, 3);
    expect(c.altitudeM).toBeCloseTo(201.3, 3);
    expect(c.capturedAt).toBe('2026-09-14T14:42:11.000Z');
    expect(c.device).toBe('Apple iPhone 15 Pro');
  });

  it('has no accuracy, because EXIF almost never carries one', () => {
    expect(c.accuracyM).toBeNull();
  });
});

describe('a photograph with no GPS is ordinary, not an error', () => {
  it.each([
    ['nothing at all', {}],
    ['null', null],
    ['undefined', undefined],
    ['a scan with a date but no fix', { DateTimeOriginal: new Date(), Make: 'Canon' }],
  ])('%s → null', (_l, tags) => {
    expect(readExifTags(tags as Record<string, unknown> | null)).toBeNull();
  });
});

describe('Null Island is refused', () => {
  it('rejects exactly 0,0', () => {
    // A real coordinate in the Gulf of Guinea and what a zeroed struct looks like. A camera with no
    // fix writes zeros far more often than anybody photographs that patch of ocean. seeds/653
    // refuses it at the column too, so this is the same rule stated twice on purpose.
    expect(readExifTags({ latitude: 0, longitude: 0 })).toBeNull();
    expect(plausibleFix(0, 0)).toBe(false);
  });

  it('accepts a real coordinate that merely contains a zero', () => {
    expect(plausibleFix(0, -97.3428)).toBe(true);
    expect(plausibleFix(31.0982, 0)).toBe(true);
  });
});

describe('plausibleFix', () => {
  it.each([
    ['NaN', NaN, -97],
    ['strings', '31.09', '-97.34'],
    ['latitude past the pole', 91, -97],
    ['longitude past the line', 31, 181],
    ['null', null, null],
    ['undefined', undefined, undefined],
  ])('rejects %s', (_l, lat, lng) => {
    expect(plausibleFix(lat, lng)).toBe(false);
  });

  it('accepts the extremes exactly', () => {
    expect(plausibleFix(90, 180)).toBe(true);
    expect(plausibleFix(-90, -180)).toBe(true);
  });
});

describe('normaliseHeading', () => {
  it.each([
    ['in range', 274.5, 274.5],
    ['exactly north', 0, 0],
    ['359.9', 359.9, 359.9],
    ['wraps 360 to 0', 360, 0],
    ['wraps past a full turn', 400, 40],
    ['wraps a negative', -90, 270],
  ])('%s', (_l, raw, want) => {
    expect(normaliseHeading(raw)).toBeCloseTo(want, 6);
  });

  it.each([['missing', undefined], ['null', null], ['NaN', NaN], ['text', 'NW']])(
    '%s is null', (_l, raw) => { expect(normaliseHeading(raw)).toBeNull(); },
  );
});

describe('which files are worth opening', () => {
  it.each([
    ['jpeg', 'image/jpeg', 'a.jpg'],
    ['heic', 'image/heic', 'a.heic'],
    ['png', 'image/png', 'a.png'],
    ['tiff', 'image/tiff', 'a.tif'],
  ])('%s yes', (_l, mime, name) => {
    expect(mightCarryExif(mime, name)).toBe(true);
  });

  it('an iPhone HEIC served as octet-stream is still opened', () => {
    // Extremely common, and skipping it would silently lose the coordinates on exactly the files
    // most likely to have them.
    expect(mightCarryExif('application/octet-stream', 'IMG_4471.HEIC')).toBe(true);
    expect(mightCarryExif(null, 'IMG_4471.heic')).toBe(true);
  });

  it('does not open a 400MB video looking for a tag it will not have', () => {
    expect(mightCarryExif('video/mp4', 'walk.mp4')).toBe(false);
    expect(mightCarryExif('application/pdf', 'deed.pdf')).toBe(false);
  });

  it('an octet-stream that is not an image is left alone', () => {
    expect(mightCarryExif('application/octet-stream', 'points.rw5')).toBe(false);
  });
});

describe('a file that cannot be parsed does not fail the upload', () => {
  it('returns null for rubbish instead of throwing', async () => {
    // A truncated or corrupt image must not take down the request it arrived on.
    await expect(readCapture(Buffer.from('not an image at all'))).resolves.toBeNull();
  });

  it('returns null for an empty buffer', async () => {
    await expect(readCapture(Buffer.alloc(0))).resolves.toBeNull();
  });
});

describe('a photograph and a video take the same path', () => {
  it('a still becomes a one-sample track, and that becomes a point', () => {
    // So placement code does not need two branches. trackShape already turns a single sample into
    // a `point`, which is exactly what a photograph should be.
    const c = readExifTags(IPHONE)!;
    const shape = trackShape(asTrack(c));
    expect(shape.kind).toBe('point');
    if (shape.kind !== 'point') throw new Error('expected a point');
    expect(shape.at.lat).toBeCloseTo(c.lat, 6);
    expect(shape.at.lng).toBeCloseTo(c.lng, 6);
  });
});

describe('time', () => {
  it('prefers the GPS clock, which is UTC and unambiguous', () => {
    // DateTimeOriginal is local with no zone. When both exist the GPS one is the one to trust.
    const c = readExifTags({
      ...IPHONE,
      GPSDateTime: new Date('2026-09-14T14:42:11.000Z'),
      DateTimeOriginal: new Date('2026-09-14T09:42:11.000Z'),
    })!;
    expect(c.capturedAt).toBe('2026-09-14T14:42:11.000Z');
  });

  it('accepts a string date', () => {
    const c = readExifTags({ ...IPHONE, DateTimeOriginal: '2026-09-14T14:42:11Z', GPSDateTime: undefined })!;
    expect(c.capturedAt).toBe('2026-09-14T14:42:11.000Z');
  });

  it('is null rather than Invalid Date when the tag is nonsense', () => {
    const c = readExifTags({ ...IPHONE, DateTimeOriginal: 'not a date', GPSDateTime: undefined })!;
    expect(c.capturedAt).toBeNull();
  });
});

describe('device', () => {
  it('is null when the file does not say', () => {
    const { Make, Model, ...rest } = IPHONE;
    void Make; void Model;
    expect(readExifTags(rest)!.device).toBeNull();
  });

  it('copes with only one of the two', () => {
    expect(readExifTags({ ...IPHONE, Model: undefined })!.device).toBe('Apple');
    expect(readExifTags({ ...IPHONE, Make: undefined })!.device).toBe('iPhone 15 Pro');
  });
});
