// lib/media/normalise-image.ts
//
// Server-side half of the no-HEIC guarantee: whatever arrives, what LANDS in storage is JPEG or PNG.
//
// Separate from `image-format.ts` on purpose. That file is pure byte-sniffing and runs anywhere —
// including in tests and, if ever needed, in a browser. This one imports `sharp`, which is a native
// binary and cannot. Keeping them apart means the detection logic stays trivially testable.
//
// ── WHY THE SERVER IS THE PLACE THIS IS GUARANTEED ─────────────────────────────────────────────
//
// The mobile app already forces JPEG (`ImageManipulator` with `SaveFormat.JPEG`), and that is the
// right thing for it to do. But it is not a guarantee, because it only covers photos taken through
// the app. A HEIC can still arrive by:
//
//   - somebody dragging one onto an admin upload form from their desktop;
//   - AirDrop to a laptop and then a browser upload;
//   - a future screen that adds a file input and forgets the rule.
//
// A rule enforced at every entrance is a rule enforced nowhere in particular. This is the one place
// every uploaded image passes, so this is where the promise is kept.

import sharp from 'sharp';
import { decideImage, extensionFor, type ImageFormat } from './image-format';

export interface NormalisedImage {
  bytes: Buffer;
  /** What it ended up as — always 'jpeg' or 'png'. */
  format: 'jpeg' | 'png';
  extension: string;
  contentType: string;
  /** What it arrived as, so the UI can say "converted your iPhone photo". */
  originalFormat: ImageFormat;
  converted: boolean;
}

export class UnsupportedImageError extends Error {
  readonly format: ImageFormat;
  constructor(message: string, format: ImageFormat) {
    super(message);
    this.name = 'UnsupportedImageError';
    this.format = format;
  }
}

/** JPEG quality for converted images. 88 is visually lossless for photographs of paper and jobsites
 *  while roughly halving a HEIC's size — HEIC is a more efficient codec, so a straight conversion at
 *  100 would produce a FILE LARGER THAN THE ORIGINAL, which is a surprising way to fill a bucket. */
const JPEG_QUALITY = 88;

export async function normaliseImage(input: Buffer | Uint8Array): Promise<NormalisedImage> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const decision = decideImage(bytes);

  if (decision.accept) {
    const format = decision.format as 'jpeg' | 'png';
    return {
      bytes,
      format,
      extension: extensionFor(format),
      contentType: format === 'png' ? 'image/png' : 'image/jpeg',
      originalFormat: format,
      converted: false,
    };
  }

  if (!decision.convert) {
    throw new UnsupportedImageError(
      decision.reason ?? 'Unsupported image format.',
      decision.format,
    );
  }

  // `rotate()` with no argument applies the EXIF orientation and then DROPS the tag. Without it a
  // portrait iPhone photo converts to a sideways JPEG — the EXIF said "rotate me" and the new file
  // no longer carries the instruction. This is the single most common way a HEIC conversion goes
  // visibly wrong, and it looks like a bug in the camera rather than in the converter.
  const out = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    bytes: out,
    format: 'jpeg',
    extension: '.jpg',
    contentType: 'image/jpeg',
    originalFormat: decision.format,
    converted: true,
  };
}

/**
 * Convenience for route handlers holding a `File` from `FormData`.
 *
 * Returns the normalised bytes and a filename with the RIGHT extension — the original name is used
 * only for its stem, never its extension, because the extension is exactly the part that lies.
 */
export async function normaliseUploadedImage(
  file: { name?: string; arrayBuffer(): Promise<ArrayBuffer> },
): Promise<NormalisedImage & { filename: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await normaliseImage(buf);
  const stem = (file.name ?? 'photo').replace(/\.[^./\\]+$/, '') || 'photo';
  return { ...result, filename: `${stem}${result.extension}` };
}
