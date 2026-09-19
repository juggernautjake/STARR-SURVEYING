'use client';

// app/admin/map/components/thumbnails.ts — the previews that do not exist yet, made here.
//
// Lifted from the image map on 2026-09-19. It is the half of the file panel that was left behind
// in the move to Google: the tiles came across and the thing that MAKES their pictures did not, so
// every PDF and every video showed an icon forever. Owner, 2026-09-19: "We need to make sure their
// preview thumbnails load even after searches and stuff."
//
// Pulled out into its own module rather than pasted back in, because it is 240 lines of decoding
// that has nothing to do with maps.
import {
  THUMB_MIME, THUMB_QUALITY, needsThumb, posterTime, thumbSize, type ThumbState,
} from '@/lib/jobs/file-thumbnails';
import type { MediaKind } from '@/lib/jobs/property-map';

export { needsThumb, type ThumbState };

// ── THE PREVIEWS ARE MADE HERE, IN THIS BROWSER ─────────────────────────────────────────────────
//
// Owner, 2026-09-16: "we need to make it so that we can see the first page thumbnail and poster
// frames for videos."
//
// The deployment has no PDF renderer and no video decoder. Every browser that opens this panel has
// both. So the panel makes the previews that do not exist yet and posts them to
// `POST …/property-map/thumbnail`, which keeps them for everybody else — the work happens once per
// file for the whole company rather than once per person per visit.
//
// WHAT A PREVIEW IS ALLOWED TO BE is not decided here. `lib/jobs/file-thumbnails.ts` owns every
// number — which kinds can have one, how big it may be, what format and quality, and where in a
// clip the frame is grabbed from — and is tested without a browser. Not one of those values is
// repeated in this file; they are imported.
//
// ── THE THREE RULES THE QUEUE IS BUILT AROUND ──────────────────────────────────────────────────
//
// 1. IT NEVER BLOCKS THE PANEL, AND NEVER BLOCKS A DRAG. A tile renders its icon immediately and
//    swaps the picture in when it arrives. Two files at a time: a job with two hundred photographs
//    must not open two hundred sockets, and rendering PDFs back to back on the main thread is how
//    a panel becomes unusable to drag out of.
//
// 2. ONE ATTEMPT PER FILE, PER SESSION, EVER. A file that fails posts `failed`, which is what stops
//    this panel — and every other person's — spending fifteen seconds on the same unopenable scan
//    forever. Within a session `thumbTriedRef` is the second half of that promise: a library
//    refresh after every assignment must not re-queue what is already in flight.
//
// 3. IT STOPS DEAD ON UNMOUNT. One AbortController for the whole queue: leaving the page rejects
//    the in-flight decode, cancels the POST, and the workers exit at their next check.

/** Two at a time. */
export const THUMB_WORKERS = 2;

/** A PDF pdf.js cannot make sense of and a codec the browser will not decode both tend to HANG
 *  rather than fail, so every attempt carries its own deadline. Past it the file is reported as
 *  failed, which is the honest answer: this browser could not do it. */
export const THUMB_TIMEOUT_MS = 15_000;

/** One file to make a preview of. Captured at the moment it is queued, so a worker never reads back
 *  into React state that has moved on under it. */
export interface ThumbJob {
  id: string;
  url: string;
  kind: MediaKind;
  isPdf: boolean;
}

// ── pdf.js, loaded on first use ─────────────────────────────────────────────────────────────────
// Copied deliberately, line for line, from `app/admin/components/files/FileViewer.tsx`: the
// minified build, the worker served from /pdfjs/, the wasm and standard-font paths beside it. The
// comment there explains why each of those is not negotiable; duplicating the loader rather than
// exporting it keeps the viewer — which is the thing people actually read PDFs in — free of any
// dependency on this panel.

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport(o: { scale: number; rotation?: number }): PdfViewport;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void>; cancel(): void };
};
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfLib = {
  getDocument(src: { url: string; withCredentials?: boolean; wasmUrl?: string; standardFontDataUrl?: string }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

const PDFJS_ASSETS = '/pdfjs/';
let pdfLibPromise: Promise<PdfLib> | null = null;
function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    // The MINIFIED build on purpose. pdf.mjs is itself a webpack bundle with its own
    // __webpack_require__; under next dev (eval-wrapped modules) that name collides with Next's and
    // module evaluation dies in __webpack_require__.r with 'Object.defineProperty called on
    // non-object' — while next build, which mangles names, passes. pdf.min.mjs has them mangled
    // already, so it evaluates the same way in both (2026-09-10).
    pdfLibPromise = import('pdfjs-dist/build/pdf.min.mjs').then((mod) => {
      const lib = mod as unknown as PdfLib;
      // The worker is a static file copied from node_modules by scripts/copy-pdfjs-assets.mjs
      // (prebuild/predev). Bundling it by URL worked in dev and failed the production build.
      lib.GlobalWorkerOptions.workerSrc = PDFJS_ASSETS + 'pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfLibPromise;
}

/** Documents here are PDFs; a .docx or a .dwg has no renderer in this browser either, which is why
 *  the shared rules decide by MIME and extension rather than by kind. */
export function isPdfFile(file: { mimeType: string | null; name: string }): boolean {
  return (file.mimeType ?? '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** `crossOrigin` when — and only when — the bytes come from somewhere else. An <img> or <video>
 *  WITHOUT it taints the canvas and `toDataURL` throws a SecurityError; one WITH it against a
 *  server that answers no CORS headers refuses to load at all. Same origin needs neither. */
function crossOriginFor(url: string): 'anonymous' | undefined {
  if (url.startsWith('/')) return undefined;
  try {
    return new URL(url, window.location.href).origin === window.location.origin ? undefined : 'anonymous';
  } catch {
    return undefined;
  }
}

/** Paint a loaded image or a seeked video onto a canvas at the size the shared rules ask for, and
 *  hand back the data URL. `thumbSize` fits the long edge and never scales anything UP. */
function drawToThumb(source: CanvasImageSource, width: number, height: number): string {
  if (!width || !height) throw new Error('That file reported no dimensions.');
  const want = thumbSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = want.width;
  canvas.height = want.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');
  ctx.drawImage(source, 0, 0, want.width, want.height);
  return canvas.toDataURL(THUMB_MIME, THUMB_QUALITY);
}

/** Page one of a PDF, rendered at the scale `thumbSize` asks for rather than at a scale invented
 *  here — which is also what stops a small page being blown up into a blurrier file. */
export async function pdfThumb(url: string, signal: AbortSignal): Promise<string> {
  const lib = await loadPdfLib();
  if (signal.aborted) throw new Error('The page was left.');
  const doc = await lib.getDocument({
    url,
    withCredentials: url.startsWith('/'),
    wasmUrl: PDFJS_ASSETS + 'wasm/',
    standardFontDataUrl: PDFJS_ASSETS + 'standard_fonts/',
  }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const want = thumbSize(base.width, base.height);
    const viewport = page.getViewport({ scale: want.width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser gave no 2D canvas.');
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (signal.aborted) throw new Error('The page was left.');
    return canvas.toDataURL(THUMB_MIME, THUMB_QUALITY);
  } finally {
    void doc.destroy();
  }
}

/** A poster frame: a detached <video> that loads its metadata only, seeks to where `posterTime`
 *  says the picture actually starts — never frame zero, which on a phone is a black frame or
 *  somebody's boot — and is painted onto a canvas once the seek lands. */
export function videoThumb(url: string, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cross = crossOriginFor(url);
    if (cross) video.crossOrigin = cross;

    let settled = false;
    const finish = (act: () => void) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      // Let go of the bytes: a queue of 4K clips left attached is a hundred megabytes of nothing.
      video.removeAttribute('src');
      video.load();
      act();
    };
    const onMeta = () => {
      try {
        video.currentTime = posterTime(video.duration);
      } catch {
        finish(() => reject(new Error('That video would not seek.')));
      }
    };
    const onSeeked = () => {
      try {
        const shot = drawToThumb(video, video.videoWidth, video.videoHeight);
        finish(() => resolve(shot));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };
    const onError = () => finish(() => reject(new Error('That video would not decode here.')));
    const onAbort = () => finish(() => reject(new Error('The page was left.')));

    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    video.src = url;
    video.load();
  });
}

/** Only ever reached for an image whose `thumbUrl` came back empty — normally an image falls back
 *  to itself and there is nothing to make. */
export function imageThumb(url: string, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new window.Image();
    const cross = crossOriginFor(url);
    if (cross) img.crossOrigin = cross;
    let settled = false;
    const finish = (act: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      act();
    };
    const onAbort = () => finish(() => reject(new Error('The page was left.')));
    img.onload = () => {
      try {
        const shot = drawToThumb(img, img.naturalWidth, img.naturalHeight);
        finish(() => resolve(shot));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };
    img.onerror = () => finish(() => reject(new Error('That image would not load.')));
    signal.addEventListener('abort', onAbort, { once: true });
    img.src = url;
  });
}

/** Give a decode a deadline, and a way out when the page is left. */
export function withDeadline<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('That preview took too long.')), ms);
    const onAbort = () => reject(new Error('The page was left.'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    });
  });
}
