// lib/images/heic.ts
//
// The browser half of HEIC → JPEG on upload. Owner, 2026-09-27: *"Can we create a built in converter
// on starr surveying so it can automatically convert HEIC files into jpg files? if it is possible to
// build in the converter tool on upload, then please do that."*
//
// Two ways in:
//
//   - `prepareFilesForUpload(files, { destination })` — call it on a FileList before uploading.
//   - The global upload guard (`heic-upload-guard.ts`, mounted once in the root layout) calls it for
//     EVERY `<input type="file">`, drop and paste on the site, before any page's own handler runs.
//     That is what makes this automatic, including for upload spots added in the future.
//
// Converted files are full resolution, JPEG quality 0.9, upright (see heic-decode-core.ts on
// orientation), renamed `IMG_5782.HEIC` → `IMG_5782.jpg`, with `type: 'image/jpeg'`.
//
// ── WHEN CONVERSION FAILS ──────────────────────────────────────────────────────────────────────
//
// It depends on where the file is going:
//
//   - `any-file` (a document store — job folders, the file manager, research documents, message
//     attachments): the ORIGINAL is uploaded and the person is told. Refusing a file a folder would
//     happily hold is worse than storing an honest HEIC; the server and the viewer both convert
//     HEIC as well, so it is still viewable later.
//   - `image-only` (an avatar, an equipment photo, a vehicle photo): the file is left out and the
//     person is told why and what to do instead. Those destinations cannot use a HEIC at all.

import { isHeicFile, toJpegFileName } from './heic-detect';

export const HEIC_JPEG_QUALITY = 0.9;
/** A single photo that has not converted in this long has hung, not slowed down. */
const CONVERT_TIMEOUT_MS = 90_000;

export type UploadDestination = 'image-only' | 'any-file';

export class HeicConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeicConversionError';
  }
}

// ── Status channel — drives the "Converting photo…" indicator ─────────────────────────────────

export type HeicNoticeLevel = 'info' | 'warning' | 'error';
export type HeicStatusEvent =
  | { type: 'progress'; done: number; total: number }
  | { type: 'idle' }
  | { type: 'notice'; level: HeicNoticeLevel; message: string };

const listeners = new Set<(e: HeicStatusEvent) => void>();
export function subscribeHeicStatus(listener: (e: HeicStatusEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit(e: HeicStatusEvent): void {
  for (const l of Array.from(listeners)) {
    try { l(e); } catch { /* a broken listener must not break an upload */ }
  }
}

// ── The converter ──────────────────────────────────────────────────────────────────────────────

export type HeicConverter = (file: Blob, opts: { quality: number }) => Promise<Blob>;

let converterOverride: HeicConverter | null = null;
/** Tests (and only tests) swap the WebAssembly worker for a stand-in. */
export function setHeicConverterForTests(fn: HeicConverter | null): void {
  converterOverride = fn;
}

interface WorkerReply {
  id: number;
  error?: string;
  blob?: Blob;
  rgba?: ArrayBuffer;
  width?: number;
  height?: number;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void }>();

function failAll(message: string): void {
  for (const p of Array.from(pending.values())) p.reject(new HeicConversionError(message));
  pending.clear();
}

function getWorker(): Worker {
  if (typeof Worker === 'undefined') throw new HeicConversionError('This browser cannot convert HEIC photos.');
  if (!worker) {
    // The `new URL(…, import.meta.url)` form is what tells webpack to emit the worker as its own
    // chunk; the libheif WebAssembly it imports is a further lazy chunk inside that.
    worker = new Worker(new URL('./heic.worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      failAll('The photo converter stopped unexpectedly.');
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

async function encodeRgbaOnPage(rgba: ArrayBuffer, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new HeicConversionError('This photo is too large for this browser to convert.');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob) throw new HeicConversionError('This photo is too large for this browser to convert.');
  return blob;
}

const workerConverter: HeicConverter = async (file, { quality }) => {
  const w = getWorker();
  const buffer = await file.arrayBuffer();
  const id = ++seq;
  const reply = await new Promise<WorkerReply>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      // A hung decode holds the worker; start a fresh one for the next photo.
      worker?.terminate();
      worker = null;
      failAll('The photo converter timed out.');
      reject(new HeicConversionError('Converting this photo took too long.'));
    }, CONVERT_TIMEOUT_MS);
    pending.set(id, {
      resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    w.postMessage({ id, buffer, quality }, [buffer]);
  });
  if (reply.error) throw new HeicConversionError(reply.error);
  if (reply.blob) return reply.blob;
  if (reply.rgba && reply.width && reply.height) return encodeRgbaOnPage(reply.rgba, reply.width, reply.height, quality);
  throw new HeicConversionError('The photo converter returned nothing.');
};

/** Convert one HEIC to a JPEG `File`. Throws `HeicConversionError` on failure. */
export async function convertHeicToJpeg(file: File, opts: { quality?: number } = {}): Promise<File> {
  const quality = opts.quality ?? HEIC_JPEG_QUALITY;
  let blob: Blob;
  try {
    blob = await (converterOverride ?? workerConverter)(file, { quality });
  } catch (err) {
    throw err instanceof HeicConversionError ? err : new HeicConversionError(err instanceof Error ? err.message : String(err));
  }
  if (!blob || blob.size === 0) throw new HeicConversionError('The converted photo was empty.');
  return new File([blob], toJpegFileName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
}

// ── The upload step ────────────────────────────────────────────────────────────────────────────

export interface PreparedUpload {
  /** What to upload, in the original order: converted JPEGs in place of HEICs, failures per policy. */
  files: File[];
  converted: Array<{ from: string; to: string }>;
  /** Could not convert, and uploaded as-is (any-file destinations). */
  keptOriginal: Array<{ name: string; reason: string }>;
  /** Could not convert, and left out (image-only destinations). */
  rejected: Array<{ name: string; reason: string }>;
  /** True when `files` differs from the input in any way. */
  changed: boolean;
}

export interface PrepareOptions {
  destination?: UploadDestination;
  quality?: number;
  /** Suppress the global status/notices (for callers that render their own). */
  silent?: boolean;
}

export const HEIC_HELP =
  'On the iPhone you can avoid HEIC entirely: Settings → Camera → Formats → "Most Compatible". ' +
  'Or open the photo, tap Share → "Save as JPEG"/"Export", and upload that copy.';

/**
 * Convert every HEIC in `files` to JPEG. Non-HEIC files pass through untouched and in place.
 * Photos are converted one at a time: a 12 MP decode needs ~50 MB of RGBA, and ten in parallel on a
 * phone is how a tab gets killed.
 */
export async function prepareFilesForUpload(
  input: FileList | Iterable<File> | ArrayLike<File> | null | undefined,
  opts: PrepareOptions = {},
): Promise<PreparedUpload> {
  const destination = opts.destination ?? 'any-file';
  const list = input ? Array.from(input as ArrayLike<File>) : [];
  const flags = await Promise.all(list.map((f) => isHeicFile(f).catch(() => false)));
  const total = flags.filter(Boolean).length;
  const result: PreparedUpload = { files: [], converted: [], keptOriginal: [], rejected: [], changed: false };
  if (total === 0) {
    result.files = list;
    return result;
  }

  const say = (e: HeicStatusEvent) => { if (!opts.silent) emit(e); };
  let done = 0;
  say({ type: 'progress', done, total });
  try {
    for (let i = 0; i < list.length; i++) {
      const file = list[i]!;
      if (!flags[i]) { result.files.push(file); continue; }
      try {
        const jpeg = await convertHeicToJpeg(file, { quality: opts.quality });
        result.files.push(jpeg);
        result.converted.push({ from: file.name, to: jpeg.name });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (destination === 'any-file') {
          result.files.push(file);
          result.keptOriginal.push({ name: file.name, reason });
        } else {
          result.rejected.push({ name: file.name, reason });
        }
      }
      done += 1;
      say({ type: 'progress', done, total });
    }
  } finally {
    say({ type: 'idle' });
  }

  result.changed = result.converted.length > 0 || result.rejected.length > 0;

  if (result.converted.length > 0) {
    const n = result.converted.length;
    say({
      type: 'notice',
      level: 'info',
      message: n === 1
        ? `Converted "${result.converted[0]!.from}" to JPEG (${result.converted[0]!.to}).`
        : `Converted ${n} iPhone photos (HEIC) to JPEG.`,
    });
  }
  for (const k of result.keptOriginal) {
    say({
      type: 'notice',
      level: 'warning',
      message: `Couldn't convert "${k.name}" to JPEG (${k.reason}), so the original HEIC was uploaded instead. It may not preview on every computer.`,
    });
  }
  for (const r of result.rejected) {
    say({
      type: 'notice',
      level: 'error',
      message: `Couldn't convert "${r.name}" to JPEG (${r.reason}), and this spot only accepts JPEG or PNG photos, so it was not added. ${HEIC_HELP}`,
    });
  }
  return result;
}
