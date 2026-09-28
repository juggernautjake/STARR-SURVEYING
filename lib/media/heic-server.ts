// lib/media/heic-server.ts
//
// Server-side HEIC → JPEG, the safety net under the browser converter. It catches every HEIC that
// reaches an API route without passing through a browser that converted it: the mobile app, a
// script, an old cached page, a browser without DataTransfer, or a conversion that failed on the
// device and fell back to uploading the original.
//
// ── WHY NOT JUST sharp ─────────────────────────────────────────────────────────────────────────
//
// See lib/images/heic-decode-core.ts. The prebuilt sharp cannot decode HEVC, so an iPhone photo
// fails in sharp with "compression format has not been built in". Decoding is done by libheif-js
// (WebAssembly — no native binary, nothing to compile on Vercel) and sharp only ENCODES the JPEG,
// which it does well.
//
// ── VERCEL ─────────────────────────────────────────────────────────────────────────────────────
//
// libheif-js's wasm bundle is ~2 MB on disk, loaded on first use only (a lazy `require`), and listed
// in `serverComponentsExternalPackages` so webpack does not re-bundle it into every route. Measured
// 2026-09-27 on a 12 MP (4032×3024) HEIC: ~0.9 s and ~220 MB peak RSS for decode + JPEG encode,
// comfortably inside the 1024 MB / 10 s defaults. Request bodies on Vercel are capped at 4.5 MB,
// which bounds what can arrive here in the first place.

import sharp from 'sharp';
import { decodeHeicPrimary, HeicDecodeError, type LibheifLike } from '@/lib/images/heic-decode-core';
import { isHeicBytes, isHeicMime, hasHeicExtension, toJpegFileName } from '@/lib/images/heic-detect';

/** 90 to match the browser converter; mozjpeg keeps the file around the size of the HEIC's
 *  JPEG equivalent rather than 2× it. */
export const SERVER_JPEG_QUALITY = 90;

let libheif: LibheifLike | null = null;
function loadLibheif(): LibheifLike {
  if (!libheif) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    libheif = require('libheif-js/wasm-bundle') as LibheifLike;
  }
  return libheif;
}

/** Decode a HEIC and re-encode it as an upright, full-resolution JPEG. Throws `HeicDecodeError`. */
export async function heicToJpeg(bytes: Uint8Array | Buffer, quality = SERVER_JPEG_QUALITY): Promise<Buffer> {
  const decoded = await decodeHeicPrimary(loadLibheif(), bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return sharp(Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), {
    raw: { width: decoded.width, height: decoded.height, channels: 4 },
  })
    .removeAlpha()
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

export { HeicDecodeError };

export interface HeicUploadResult {
  bytes: Buffer;
  name: string;
  contentType: string;
  /** True when a HEIC arrived and a JPEG is what should be stored. */
  converted: boolean;
}

/** Message for the 415 an image-only route returns when a HEIC cannot be converted. */
export const HEIC_415_MESSAGE =
  'This looks like an iPhone HEIC photo, and it could not be converted to JPEG on the server. ' +
  'Upload it through the website (which converts HEIC automatically), or on the iPhone ' +
  'set Settings → Camera → Formats → "Most Compatible", or Share the photo → "Save as JPEG", and try again.';

/**
 * The one call an upload route makes. Given the bytes and the claimed name/type of an upload:
 *
 *  - a HEIC (by BYTES — the name and type are not trusted) comes back as a JPEG with a `.jpg` name;
 *  - anything else comes back unchanged, `converted: false`.
 *
 * Throws `HeicDecodeError` only when the file IS a HEIC and conversion failed; the route decides
 * whether that is a 415 (image-only destinations) or "store the original" (document stores) —
 * see `normaliseHeicOrKeep`.
 */
export async function normaliseHeicUpload(input: {
  bytes: Uint8Array | Buffer;
  name?: string | null;
  type?: string | null;
}): Promise<HeicUploadResult> {
  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
  const name = input.name || 'upload';
  const type = input.type || 'application/octet-stream';
  if (!isHeicBytes(bytes)) {
    // A file that CLAIMS to be HEIC but is not (a JPEG renamed .heic) is stored as what it is.
    return { bytes, name, contentType: type, converted: false };
  }
  const jpeg = await heicToJpeg(bytes);
  return { bytes: jpeg, name: toJpegFileName(name), contentType: 'image/jpeg', converted: true };
}

/** For document stores: convert a HEIC if possible, otherwise keep the original untouched. */
export async function normaliseHeicOrKeep(input: {
  bytes: Uint8Array | Buffer;
  name?: string | null;
  type?: string | null;
}): Promise<HeicUploadResult & { conversionError?: string }> {
  try {
    return await normaliseHeicUpload(input);
  } catch (err) {
    const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
    return {
      bytes,
      name: input.name || 'upload',
      contentType: input.type || 'image/heic',
      converted: false,
      conversionError: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ImageRouteHeicResult =
  | ({ ok: true } & HeicUploadResult)
  | { ok: false; status: 415; error: string };

/**
 * For IMAGE-ONLY routes (avatars, equipment/vehicle photos, …): a HEIC becomes a JPEG; if it cannot
 * be converted the route must answer 415 with `error`, never store a HEIC nobody can display.
 */
export async function convertHeicForImageRoute(input: {
  bytes: Uint8Array | Buffer;
  name?: string | null;
  type?: string | null;
}): Promise<ImageRouteHeicResult> {
  try {
    return { ok: true, ...(await normaliseHeicUpload(input)) };
  } catch (err) {
    console.warn('[heic] server-side conversion failed', {
      name: input.name ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 415, error: HEIC_415_MESSAGE };
  }
}

/** Convenience for route handlers holding a `File` from `FormData`. */
export async function normaliseHeicFile(file: File): Promise<HeicUploadResult> {
  return normaliseHeicUpload({ bytes: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type });
}

/** Cheap pre-check without reading the body: does the upload DECLARE itself HEIC? */
export function declaresHeic(file: { name?: string | null; type?: string | null }): boolean {
  return isHeicMime(file.type) || hasHeicExtension(file.name);
}
