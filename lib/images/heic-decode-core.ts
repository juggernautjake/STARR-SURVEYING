// lib/images/heic-decode-core.ts
//
// The one decode routine, shared by the browser Web Worker (`heic.worker.ts`) and the server safety
// net (`lib/media/heic-server.ts`). It takes a libheif-js instance as an argument rather than
// importing one, because the two sides load DIFFERENT builds of the same library — the ESM bundle
// in a worker, the CommonJS bundle in Node — and neither must be pulled into the other's graph.
//
// ── WHY libheif-js AND NOT sharp ───────────────────────────────────────────────────────────────
//
// The prebuilt `sharp` binaries ship libheif with the AV1 decoder only. `sharp.format.heif.input`
// reports `true`, which is how the 2026-08-08 audit concluded HEIC was handled — but that flag means
// AVIF. Handing sharp a real iPhone photo fails with "Support for this compression format has not
// been built in" (verified 2026-09-27 against sharp 0.34.5 and an x265-encoded fixture). HEVC is
// left out of the prebuilt binaries for patent reasons, so no sharp upgrade changes this.
//
// libheif-js is libheif + libde265 compiled to WebAssembly: no native binary, identical behaviour
// in every browser and in a Vercel function.
//
// ── ORIENTATION ────────────────────────────────────────────────────────────────────────────────
//
// An iPhone does not rotate the pixels of a portrait photo; it stores them sideways and records the
// turn. In a HEIC that record is the `irot` / `imir` transform properties (the EXIF Orientation tag
// is a copy, and the HEIF spec says to ignore it in favour of the transforms). libheif applies the
// transforms while decoding, so the RGBA this returns is already upright. The JPEG encoders on both
// sides write NO EXIF orientation, so nothing downstream can apply the turn a second time.
//
// ── BURSTS AND LIVE PHOTOS ─────────────────────────────────────────────────────────────────────
//
// A HEIF file can hold several top-level images. The one the camera meant is flagged PRIMARY, and it
// is not necessarily the first in the file. We take the primary; `images[0]` is only the fallback
// for a file that flags none.

/** Hard ceiling on decoded size. 48 MP iPhone "HEIF Max" photos are 8064×6048 ≈ 48.8 MP; this
 *  leaves headroom while refusing a crafted 30000×30000 header that would ask for 3.6 GB of RGBA. */
export const MAX_HEIC_PIXELS = 120_000_000;

export interface HeifImageLike {
  get_width(): number;
  get_height(): number;
  is_primary?(): boolean;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, cb: (out: unknown) => void): void;
  free(): void;
}

export interface LibheifLike {
  HeifDecoder: new () => { decoder: unknown; decode(buffer: ArrayBuffer | Uint8Array): HeifImageLike[] };
  heif_context_free?(ctx: unknown): void;
}

export interface DecodedHeic {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray;
  /** How many top-level images the file held (> 1 for bursts / multi-image HEIF). */
  imageCount: number;
}

export class HeicDecodeError extends Error {
  readonly code: 'not-heif' | 'no-image' | 'too-large' | 'decode-failed';
  constructor(code: HeicDecodeError['code'], message: string) {
    super(message);
    this.name = 'HeicDecodeError';
    this.code = code;
  }
}

/** Decode the primary image of a HEIC/HEIF to upright RGBA. */
export async function decodeHeicPrimary(libheif: LibheifLike, bytes: Uint8Array): Promise<DecodedHeic> {
  const decoder = new libheif.HeifDecoder();
  let images: HeifImageLike[] = [];
  try {
    images = decoder.decode(bytes);
    if (!images || images.length === 0) {
      throw new HeicDecodeError('no-image', 'This HEIC file contains no image libheif could read.');
    }
    const image = images.find((i) => (typeof i.is_primary === 'function' ? i.is_primary() : false)) ?? images[0]!;
    const width = image.get_width();
    const height = image.get_height();
    if (!(width > 0 && height > 0)) {
      throw new HeicDecodeError('no-image', 'This HEIC file has an image with no size.');
    }
    if (width * height > MAX_HEIC_PIXELS) {
      throw new HeicDecodeError('too-large', `This photo is ${width}×${height}, which is larger than we can convert.`);
    }
    const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const out = await new Promise<unknown>((resolve) => image.display(target, resolve));
    if (!out) throw new HeicDecodeError('decode-failed', 'The HEIC image could not be decoded.');
    return { width, height, data: target.data, imageCount: images.length };
  } catch (err) {
    if (err instanceof HeicDecodeError) throw err;
    throw new HeicDecodeError('decode-failed', `The HEIC image could not be decoded (${String((err as Error)?.message ?? err)}).`);
  } finally {
    for (const img of images) {
      try { img.free(); } catch { /* already released */ }
    }
    try {
      if (decoder.decoder && libheif.heif_context_free) libheif.heif_context_free(decoder.decoder);
    } catch { /* already released */ }
  }
}
