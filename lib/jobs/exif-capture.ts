// lib/jobs/exif-capture.ts — getting a position out of a photograph.
//
// Owner, 2026-09-21, choosing between reading EXIF and relying on the mobile app alone: "Yes, read
// EXIF on upload."
//
// ── WHY THIS DID NOT EXIST ──────────────────────────────────────────────────────────────────────
//
// Nothing in this repository has ever read GPS out of a file. Every `exif` hit before today was
// orientation-only — `sharp().rotate()` in `lib/media/normalise-image.ts` and `lib/receipts/render.ts`
// both call it specifically to APPLY and then STRIP the orientation tag.
//
// The mobile app goes further and disables EXIF on purpose. `mobile/lib/storage/mediaUpload.ts`
// sets `exif: false` on both the camera and the library picker, and `mobile/lib/fieldMedia.ts`
// explains why: reading a PHAsset's metadata is a slow round trip, so it reads the phone's GPS and
// compass from the sensors instead and writes them to columns.
//
// That is a good decision for the app and it leaves a real hole everywhere else. A photograph taken
// on somebody's own phone and airdropped, a scan from a client, anything uploaded through the web
// admin — none of them go near the mobile capture path, and none of them had coordinates.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// It does not overwrite a position a person placed by hand. `job_file_captures.source` distinguishes
// 'exif' from 'manual' precisely so that re-reading a file cannot undo somebody's correction — the
// camera was wrong about where it was, the surveyor was not.
//
// It does not guess at a missing position. A photograph with no GPS is extremely common (every
// screenshot, every scan, every image stripped by a messaging app) and is not an error.

import type { TrackSample } from './capture-track';

/** What a file's own metadata claims about where and when it was taken. */
export interface ExifCapture {
  lat: number;
  lng: number;
  /** Metres. EXIF rarely carries one; null is the usual case. */
  accuracyM: number | null;
  altitudeM: number | null;
  /** 0-360, from GPSImgDirection. Which way the camera was pointing. */
  headingDeg: number | null;
  capturedAt: string | null;
  /** `Make Model`, when the file says. */
  device: string | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Is this a position we should believe?
 *
 * Null Island is refused for the reason recorded in seeds/653: it is a real coordinate in the Gulf
 * of Guinea and it is also what a zeroed struct looks like, so every mapping system on earth
 * accumulates a pile of points there. A camera with no fix writes zeros far more often than
 * anybody photographs that particular patch of ocean.
 */
export function plausibleFix(lat: unknown, lng: unknown): boolean {
  if (!finite(lat) || !finite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** 0-360, or null. A camera that writes 359.9 is fine; one that writes -1 or 400 is not. */
export function normaliseHeading(raw: unknown): number | null {
  if (!finite(raw)) return null;
  const h = ((raw % 360) + 360) % 360;
  return Number.isFinite(h) ? h : null;
}

/**
 * Turn whatever `exifr` handed back into our shape, or null.
 *
 * Separated from the parsing so it can be tested against the awkward tag sets real cameras produce
 * without needing a JPEG. `exifr` already resolves `GPSLatitude` + `GPSLatitudeRef` into a signed
 * `latitude`, which is the conversion most hand-rolled readers get wrong in the southern and
 * western hemispheres — and Texas is west, so a sign error here would put every photograph in
 * China rather than somewhere obviously broken.
 */
export function readExifTags(tags: Record<string, unknown> | null | undefined): ExifCapture | null {
  if (!tags) return null;

  const lat = tags.latitude ?? tags.GPSLatitude;
  const lng = tags.longitude ?? tags.GPSLongitude;
  if (!plausibleFix(lat, lng)) return null;

  // GPSDateStamp/TimeStamp is UTC and authoritative; DateTimeOriginal is local with no zone, which
  // is why it is the fallback rather than the first choice. Both beat the file's mtime, which is
  // when it was copied rather than when it was taken.
  const when = tags.GPSDateTime ?? tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
  let capturedAt: string | null = null;
  if (when instanceof Date && !Number.isNaN(when.getTime())) capturedAt = when.toISOString();
  else if (typeof when === 'string') {
    const d = new Date(when);
    if (!Number.isNaN(d.getTime())) capturedAt = d.toISOString();
  }

  const make = typeof tags.Make === 'string' ? tags.Make.trim() : '';
  const model = typeof tags.Model === 'string' ? tags.Model.trim() : '';
  const device = [make, model].filter(Boolean).join(' ') || null;

  // `GPSHPositioningError` is the only accuracy EXIF defines, and almost nothing writes it.
  const acc = tags.GPSHPositioningError;

  return {
    lat: lat as number,
    lng: lng as number,
    accuracyM: finite(acc) && acc >= 0 ? acc : null,
    altitudeM: finite(tags.altitude) ? (tags.altitude as number)
      : finite(tags.GPSAltitude) ? (tags.GPSAltitude as number) : null,
    headingDeg: normaliseHeading(tags.GPSImgDirection),
    capturedAt,
    device,
  };
}

/** Kinds worth opening. Reading a 400MB video looking for a tag it will not have is not free. */
const READABLE = /^image\/(jpeg|png|heic|heif|tiff|webp)$/i;

export function mightCarryExif(contentType: string | null | undefined, name?: string | null): boolean {
  if (contentType && READABLE.test(contentType)) return true;
  // A HEIC from an iPhone is frequently served as application/octet-stream.
  if (!contentType || contentType === 'application/octet-stream') {
    return /\.(jpe?g|png|heic|heif|tiff?|webp)$/i.test(name ?? '');
  }
  return false;
}

/**
 * Read a file's GPS.
 *
 * `exifr` is imported lazily so that a route which never touches an image does not pay to load it,
 * and so that a parse failure is contained: a corrupt or truncated file throws inside the library,
 * and a photograph that cannot be parsed must not fail the upload it arrived on.
 */
export async function readCapture(bytes: Buffer | Uint8Array): Promise<ExifCapture | null> {
  try {
    const exifr = await import('exifr');
    const parse = (exifr as unknown as { parse: (b: unknown, o?: unknown) => Promise<Record<string, unknown> | null> }).parse
      ?? (exifr as unknown as { default: { parse: (b: unknown, o?: unknown) => Promise<Record<string, unknown> | null> } }).default.parse;

    const tags = await parse(bytes, {
      // Only what we use. The default pulls every IFD, including thumbnails, which is slow and
      // allocates a second copy of an image we already have in memory.
      gps: true,
      tiff: true,
      ifd0: true,
      exif: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
    });
    return readExifTags(tags);
  } catch {
    // Not an error worth surfacing. Screenshots, scans, anything a messaging app has stripped, and
    // anything truncated all land here, and all of them are ordinary files.
    return null;
  }
}

/**
 * A single fix as a one-sample track.
 *
 * So a still photograph and a video take the same path through the placement code: `trackShape`
 * turns a one-sample track into a `point`, which is exactly what a photograph should become.
 */
export function asTrack(capture: ExifCapture): TrackSample[] {
  return [{ t: 0, lat: capture.lat, lng: capture.lng, acc: capture.accuracyM }];
}
