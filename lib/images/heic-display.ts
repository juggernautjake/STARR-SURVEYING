// lib/images/heic-display.ts
//
// Showing HEIC files that are ALREADY in storage. The upload converter stops new ones arriving; this
// is for the ones uploaded before it existed (and any a device uploaded as-is because conversion
// failed on it). Chrome, Edge and Firefox cannot draw a HEIC — only Safari can — so every `<img>`
// pointing at one is a broken-picture icon for most of the office.
//
// Nothing is rewritten in storage here (that is `scripts/convert-heic-in-storage.mjs`, run by hand).
// This converts ON VIEW, in the browser, with the same WebAssembly converter the uploads use, and
// caches the result for the session:
//
//   - `heicDisplayUrl(url)` — fetch, convert, hand back an object URL of the JPEG.
//   - `installHeicImageFallback()` — one capture-phase `error` listener on the window: when ANY
//     `<img>` on the site fails to load, and the bytes behind it turn out to be HEIC, it is swapped
//     for the converted JPEG. No viewer has to know about HEIC for this to work in it.
//
// The fallback costs nothing for images that load. For one that fails, it costs one fetch of that
// URL (once per URL per session) to find out whether it was a HEIC or simply missing.

import { convertHeicToJpeg } from './heic';
import { hasHeicExtension, isHeicBytes, isHeicMime, toJpegFileName } from './heic-detect';

/** Enough converted photos to cover a folder of tiles without holding a whole job's worth of JPEGs. */
const CACHE_LIMIT = 60;

const cache = new Map<string, Promise<string>>();

/** Signed URLs carry a fresh token in the query every time; the object path before it is stable. */
export function heicCacheKey(url: string): string {
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost');
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split('?')[0]!;
  }
}

function remember(key: string, value: Promise<string>): void {
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string;
    const evicted = cache.get(oldest);
    cache.delete(oldest);
    void evicted?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  }
}

export class NotHeicError extends Error {
  constructor() {
    super('Not a HEIC image.');
    this.name = 'NotHeicError';
  }
}

/**
 * Fetch `url`, convert the HEIC behind it to JPEG and return an object URL for it. Cached per object
 * path. Rejects with `NotHeicError` when the bytes are not HEIC (the caller should leave that image
 * alone), or a `HeicConversionError` when they are and could not be converted.
 */
export function heicDisplayUrl(url: string, opts: { cacheKey?: string; name?: string } = {}): Promise<string> {
  const key = opts.cacheKey ?? heicCacheKey(url);
  const hit = cache.get(key);
  if (hit) return hit;
  const work = (async () => {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Could not load the image (HTTP ${res.status}).`);
    const blob = await res.blob();
    const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    if (!isHeicBytes(head)) throw new NotHeicError();
    const name = opts.name ?? decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() ?? 'photo.heic');
    const jpeg = await convertHeicToJpeg(new File([blob], name, { type: 'image/heic' }));
    return URL.createObjectURL(jpeg);
  })();
  remember(key, work);
  // A failure is remembered too — that is what stops a broken image being fetched on every render —
  // but a transient network failure should not poison the session, so those are forgotten.
  work.catch((err) => {
    if (!(err instanceof NotHeicError) && /HTTP|fetch|network/i.test(String(err?.message))) cache.delete(key);
  });
  return work;
}

/** Might this stored file be a HEIC, going by its name or declared type? (No fetch.) */
export function looksLikeHeic(name: string | null | undefined, mime?: string | null): boolean {
  return hasHeicExtension(name) || isHeicMime(mime);
}

/** The name a converted download should carry. */
export { toJpegFileName };

// ── The site-wide <img> fallback ───────────────────────────────────────────────────────────────

const attempted = new WeakSet<HTMLImageElement>();

function candidateSrc(img: HTMLImageElement): string | null {
  const src = img.currentSrc || img.src;
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return null;
  if (img.closest('[data-heic-convert="off"]')) return null;
  try {
    const u = new URL(src, location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return src;
}

function onImageError(e: Event): void {
  const img = e.target as HTMLImageElement | null;
  if (!img || img.tagName !== 'IMG' || attempted.has(img)) return;
  const src = candidateSrc(img);
  if (!src) return;
  attempted.add(img);
  img.setAttribute('data-heic-state', 'converting');
  heicDisplayUrl(src)
    .then((objectUrl) => {
      // The element may have been pointed somewhere else while we worked; only swap if it has not.
      if ((img.currentSrc || img.src) !== src) return;
      if (img.srcset) img.removeAttribute('srcset');
      img.src = objectUrl;
      img.setAttribute('data-heic-state', 'converted');
    })
    .catch(() => {
      img.removeAttribute('data-heic-state');
    });
}

let fallbackInstalls = 0;
/** Install the `<img>` fallback on `window`. Reference-counted; returns the uninstaller. */
export function installHeicImageFallback(win: Window = window): () => void {
  fallbackInstalls += 1;
  if (fallbackInstalls === 1) win.addEventListener('error', onImageError, true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fallbackInstalls -= 1;
    if (fallbackInstalls === 0) win.removeEventListener('error', onImageError, true);
  };
}
