// lib/media/image-format.ts
//
// Owner ask, 2026-08-08: *"whenever we take pictures on the app… the images are always saved as png or
// jpeg… I do not want HEIC. Please make sure… we cannot even take HEIC."*
//
// ── WHY THIS SNIFFS BYTES AND IGNORES THE FILENAME ─────────────────────────────────────────────
//
// A file's extension and its `Content-Type` are both claims made by whoever sent it, and on this
// particular problem they are claims that are routinely wrong:
//
//   - iOS hands a HEIC to a web form with the name `IMG_0001.JPG` when "Most Compatible" is half
//     configured, so the extension says JPEG and the bytes say HEIC.
//   - Browsers frequently label a HEIC as `application/octet-stream` because they do not recognise it.
//   - Anything that has passed through a chat app or a rename has lost whatever truth it had.
//
// Trusting either would mean storing a HEIC under a `.jpg` name, which is worse than storing an honest
// HEIC: the file now lies, and the failure surfaces months later in whatever tool cannot open it.
//
// Magic bytes cannot be renamed.

export type ImageFormat = 'jpeg' | 'png' | 'heic' | 'webp' | 'gif' | 'tiff' | 'bmp' | 'unknown';
export type VideoContainer = 'mp4' | 'mov' | 'unknown';

/** Bytes needed before a verdict is possible. HEIC's brand sits at offset 8..12. */
export const SNIFF_BYTES = 32;

function has(b: Uint8Array, offset: number, sig: number[]): boolean {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false;
  return true;
}

function ascii(b: Uint8Array, offset: number, len: number): string {
  if (b.length < offset + len) return '';
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[offset + i]);
  return s;
}

/**
 * What these bytes actually are.
 *
 * ISO base-media files (HEIC, MP4, MOV) all begin `....ftyp` with a four-character BRAND at offset 8,
 * and the brand is the only thing separating a photo from a video in that family. `heic`, `heix`,
 * `hevc`, `hevx`, `mif1` and `msf1` are the HEIF brands Apple emits; `qt  ` is QuickTime.
 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length < 4) return 'unknown';

  // JPEG — FF D8 FF
  if (has(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  // PNG — 89 50 4E 47 0D 0A 1A 0A
  if (has(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // GIF87a / GIF89a
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif';
  // RIFF ....WEBP
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  // TIFF — II*\0 (little endian) or MM\0* (big endian). Some scanners produce these.
  if (has(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || has(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  // BMP
  if (ascii(bytes, 0, 2) === 'BM') return 'bmp';

  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'heic';
  }

  return 'unknown';
}

/** Which container a video is really in — so a `.mov` is never stored under an `.mp4` name. */
export function sniffVideoContainer(bytes: Uint8Array): VideoContainer {
  if (bytes.length < 12) return 'unknown';
  if (ascii(bytes, 4, 4) !== 'ftyp') return 'unknown';
  const brand = ascii(bytes, 8, 4).toLowerCase();
  if (brand === 'qt  ' || brand.startsWith('qt')) return 'mov';
  // isom / iso2 / mp41 / mp42 / avc1 / mmp4 / dash — all MP4-family brands.
  if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'mmp4', 'dash', 'm4v '].includes(brand)) {
    return 'mp4';
  }
  return 'unknown';
}

/** The formats allowed to reach storage as-is. Everything else is converted or refused. */
export const ALLOWED_IMAGE_FORMATS: ReadonlySet<ImageFormat> = new Set<ImageFormat>(['jpeg', 'png']);

/** Formats we can convert into an allowed one rather than turning the user away. */
export const CONVERTIBLE_IMAGE_FORMATS: ReadonlySet<ImageFormat> = new Set<ImageFormat>([
  'heic', 'webp', 'gif', 'tiff', 'bmp',
]);

export interface FormatDecision {
  format: ImageFormat;
  /** Store the bytes unchanged. */
  accept: boolean;
  /** Run it through the converter first. */
  convert: boolean;
  /** Neither — say why, in words the person uploading can act on. */
  reason?: string;
}

/**
 * What to do with an upload.
 *
 * HEIC is CONVERTED, not refused, and that is the owner's explicit instruction — *"we need a way to
 * easily upload and convert HEIC"*. Refusing it would be less code and would push the problem onto
 * somebody standing in a field holding a phone.
 */
export function decideImage(bytes: Uint8Array): FormatDecision {
  const format = sniffImageFormat(bytes);
  if (ALLOWED_IMAGE_FORMATS.has(format)) return { format, accept: true, convert: false };
  if (CONVERTIBLE_IMAGE_FORMATS.has(format)) return { format, accept: false, convert: true };
  return {
    format,
    accept: false,
    convert: false,
    reason:
      'This file does not look like an image we recognise. Photos should be JPEG, PNG or HEIC ' +
      '(iPhone photos are HEIC and will be converted automatically).',
  };
}

/** The extension a format should be stored under. Never guessed from the original filename. */
export function extensionFor(format: ImageFormat): string {
  switch (format) {
    case 'png': return '.png';
    case 'jpeg': return '.jpg';
    default: return '.jpg'; // everything convertible lands as JPEG
  }
}
