// lib/images/heic-detect.ts
//
// Owner, 2026-09-27: *"Can we create a built in converter on starr surveying so it can automatically
// convert HEIC files into jpg files? if it is possible to build in the converter tool on upload,
// then please do that."*
//
// Pure detection — no DOM, no Node, no dependencies — so the SAME rules run in the browser upload
// guard, the Web Worker, the server safety net and the one-off storage script, and are unit-tested
// once.
//
// ── THREE WITNESSES, AND WHICH ONE WINS ────────────────────────────────────────────────────────
//
// A file can say it is HEIC three ways: its MIME type, its extension, and its bytes. The first two
// are claims made by whoever handed us the file and are routinely wrong for HEIC in particular:
//
//   - Chrome and Edge on Windows report a `.heic` as `""` unless the HEIF extension is installed;
//     other browsers send `application/octet-stream`.
//   - A HEIC that has been renamed, emailed or passed through a chat app can carry any name at all.
//
// So the bytes win whenever we can read them. MIME and extension are only used (a) synchronously,
// to decide whether a file is worth sniffing at all, and (b) as the fallback when bytes are
// unavailable.

/** HEIF brands that mean "HEVC-coded still image(s)" — what an iPhone camera writes. `mif1`/`msf1`
 *  are the generic HEIF brands; they are HEIC unless the compatible-brand list says AVIF instead. */
export const HEIC_BRANDS: ReadonlySet<string> = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1',
]);

/** Brands that are HEIF-family but AV1-coded (AVIF). Browsers display these natively — they are NOT
 *  the problem this module exists for, and libheif-js cannot decode them anyway. */
const AVIF_BRANDS: ReadonlySet<string> = new Set(['avif', 'avis']);

/** Brands that are unambiguously HEVC regardless of what else is listed. */
const HEVC_BRANDS: ReadonlySet<string> = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);

export const HEIC_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
]);

export const HEIC_EXTENSIONS: ReadonlySet<string> = new Set(['heic', 'heif', 'hif']);

/** Bytes to read before deciding. The `ftyp` box is first in every HEIF file; 64 bytes holds the
 *  major brand plus the first dozen compatible brands, which is where `heic` / `avif` always sit. */
export const HEIC_SNIFF_BYTES = 64;

/** What an `<input accept>` should include so a desktop file picker lets people CHOOSE a HEIC. Many
 *  pickers only list extensions they recognise for `image/*`, and Windows does not recognise .heic
 *  without the paid HEVC extension — so an image-only picker would hide the photo entirely. */
export const HEIC_ACCEPT = 'image/heic,image/heif,.heic,.heif';

export function isHeicMime(type: string | null | undefined): boolean {
  if (!type) return false;
  return HEIC_MIME_TYPES.has(type.toLowerCase().split(';')[0]!.trim());
}

export function extensionOf(name: string | null | undefined): string {
  const m = /\.([^./\\]+)$/.exec(name ?? '');
  return m ? m[1]!.toLowerCase() : '';
}

export function hasHeicExtension(name: string | null | undefined): boolean {
  return HEIC_EXTENSIONS.has(extensionOf(name));
}

function ascii(b: Uint8Array, offset: number, len: number): string {
  if (b.length < offset + len) return '';
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[offset + i]!);
  return s;
}

export interface FtypBrands {
  major: string;
  compatible: string[];
}

/** Parse the ISO-BMFF `ftyp` box: `[size:u32][ 'ftyp' ][major:4][minor:u32][compatible:4 × n]`.
 *  Returns null when the bytes are not an ISO base-media file at all. */
export function readFtypBrands(bytes: Uint8Array): FtypBrands | null {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const size = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  const major = ascii(bytes, 8, 4).toLowerCase();
  const end = Math.min(bytes.length, size >= 16 ? size : bytes.length);
  const compatible: string[] = [];
  for (let off = 16; off + 4 <= end; off += 4) compatible.push(ascii(bytes, off, 4).toLowerCase());
  return { major, compatible };
}

/** Do these bytes begin a HEVC-coded HEIF file (i.e. an iPhone-style HEIC)? */
export function isHeicBytes(bytes: Uint8Array): boolean {
  const ftyp = readFtypBrands(bytes);
  if (!ftyp) return false;
  if (HEVC_BRANDS.has(ftyp.major)) return true;
  if (!HEIC_BRANDS.has(ftyp.major)) return false;
  // `mif1` / `msf1`: generic HEIF. Decide by the compatible brands — an AVIF often declares
  // `mif1` as its major brand and `avif` as compatible, and must not be sent to an HEVC decoder.
  if (ftyp.compatible.some((b) => HEVC_BRANDS.has(b))) return true;
  if (ftyp.compatible.some((b) => AVIF_BRANDS.has(b))) return false;
  return true; // bare mif1 with nothing more specific: HEVC is by far the common case.
}

/** Bytes that are definitely something else (JPEG/PNG/GIF/WebP/PDF/…) — used so a JPEG merely
 *  NAMED `.heic` is not "converted". */
function isKnownNonHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return true;
  if (ascii(bytes, 0, 3) === 'GIF') return true;
  if (ascii(bytes, 0, 4) === 'RIFF') return true; // WebP / AVI / WAV
  if (ascii(bytes, 0, 4) === '%PDF') return true;
  if (readFtypBrands(bytes) && !isHeicBytes(bytes)) return true; // MP4 / MOV / AVIF
  return false;
}

export type HeicHint = 'heic' | 'maybe' | 'no';

/**
 * Synchronous first look, for places that must decide inside an event handler.
 *
 *  - `heic`  — the MIME type or extension says HEIC/HEIF.
 *  - `maybe` — could be a mislabelled HEIC and is worth reading the first bytes of: an image of any
 *              declared type, or a file whose type the browser did not know.
 *  - `no`    — declared as something that is plainly not a photo (PDF, CSV, DOCX, video…).
 */
export function heicHint(file: { name?: string | null; type?: string | null }): HeicHint {
  if (isHeicMime(file.type) || hasHeicExtension(file.name)) return 'heic';
  const type = (file.type ?? '').toLowerCase();
  if (!type || type === 'application/octet-stream' || type.startsWith('image/')) return 'maybe';
  return 'no';
}

interface BlobLike {
  name?: string;
  type?: string;
  size?: number;
  slice?: (start?: number, end?: number) => { arrayBuffer(): Promise<ArrayBuffer> };
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

async function headBytes(file: BlobLike): Promise<Uint8Array | null> {
  try {
    if (typeof file.slice === 'function') {
      return new Uint8Array(await file.slice(0, HEIC_SNIFF_BYTES).arrayBuffer());
    }
    if (typeof file.arrayBuffer === 'function') {
      return new Uint8Array((await file.arrayBuffer()).slice(0, HEIC_SNIFF_BYTES));
    }
  } catch {
    /* unreadable — fall back to the declared type below */
  }
  return null;
}

/**
 * Is this file a HEIC? MIME, extension and magic bytes — the bytes decide when they can be read.
 *
 *  - HEIC bytes under ANY name or type → true (the wrong-MIME case: `IMG_0001.JPG`, `""`, octet-stream).
 *  - JPEG/PNG/PDF/… bytes under a `.heic` name → false (nothing to convert; it would only fail).
 *  - Bytes unreadable → trust the MIME type / extension.
 */
export async function isHeicFile(file: BlobLike): Promise<boolean> {
  const hint = heicHint(file);
  if (hint === 'no') return false;
  const head = await headBytes(file);
  if (head && head.length >= 12) {
    if (isHeicBytes(head)) return true;
    if (isKnownNonHeic(head)) return false;
  }
  return hint === 'heic';
}

/** `IMG_5782.HEIC` → `IMG_5782.jpg`. Only the LAST extension is replaced; a name with no extension
 *  gains one; an empty name becomes `photo.jpg`. */
export function toJpegFileName(name: string | null | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]*$/, '').trim();
  return `${stem || 'photo'}.jpg`;
}

/** Is an `<input accept>` value image-only? Empty means "any file". */
export function acceptIsImageOnly(accept: string | null | undefined): boolean {
  const tokens = (accept ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return false;
  const IMAGE_EXT = /^\.(jpe?g|png|gif|webp|heic|heif|hif|avif|bmp|tiff?|svg)$/;
  return tokens.every((t) => t.startsWith('image/') || IMAGE_EXT.test(t));
}
