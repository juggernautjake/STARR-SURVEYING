// lib/images/shrink-for-upload.ts — make a photo fit a route that takes the file in its request
// (2026-10-01).
//
// The receipt form promised 12 MB, and its route said 12 MB, but the route runs as a Vercel function
// whose request body is capped at 4.5 MB. A receipt photo picked from the gallery of a modern phone
// (5–9 MB) was refused by the platform before the route ever ran, with a 413 the page showed as
// "Upload failed (413)". A receipt needs to be legible, not 48 megapixels: re-encoding it at a
// 2560 px long edge keeps every printed digit and lands well under 2 MB.

import { FUNCTION_BODY_LIMIT_BYTES, fitsThroughFunction } from '@/lib/files/upload-resilience';

/** Pure — the size to draw an image at so its long edge is at most `maxEdge`. Never enlarges. */
export function shrinkPlan(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > 0) || long <= maxEdge) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The passes tried in order until one fits: long edge, JPEG quality. */
export const SHRINK_PASSES: ReadonlyArray<{ maxEdge: number; quality: number }> = [
  { maxEdge: 2560, quality: 0.85 },
  { maxEdge: 2048, quality: 0.8 },
  { maxEdge: 1600, quality: 0.75 },
];

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('decode')); img.src = url; });
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

/**
 * The file as-is when it already fits through a function; otherwise a re-encoded JPEG that does.
 * Throws a plain-words Error for a file that cannot be made to fit (a large PDF, an image the
 * browser cannot decode).
 */
export async function fitImageForFunction(file: File): Promise<File> {
  if (fitsThroughFunction(file.size)) return file;
  const limitMb = FUNCTION_BODY_LIMIT_BYTES / 1024 / 1024;
  if (!file.type.startsWith('image/')) {
    throw new Error(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — this form takes up to ${limitMb} MB. Take a photo of the receipt instead, or save the PDF smaller.`);
  }
  let img: Awaited<ReturnType<typeof decode>>;
  try {
    img = await decode(file);
  } catch {
    throw new Error(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB and this browser could not shrink it. Take the photo again from this page, or pick a smaller one.`);
  }
  try {
    for (const pass of SHRINK_PASSES) {
      const size = shrinkPlan(img.width, img.height, pass.maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(img.source, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', pass.quality));
      canvas.width = 1; canvas.height = 1;
      if (blob && fitsThroughFunction(blob.size)) {
        const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
  } finally {
    img.close();
  }
  throw new Error(`“${file.name}” is too large to send from this form even after shrinking. Take the photo again from this page.`);
}

/** Passes for an arbitrary limit, largest first: keep as much of the photo as the limit allows. */
export const FIT_PASSES: ReadonlyArray<{ maxEdge: number; quality: number }> = [
  { maxEdge: 8192, quality: 0.9 },
  { maxEdge: 4096, quality: 0.88 },
  ...SHRINK_PASSES,
  { maxEdge: 1280, quality: 0.7 },
  { maxEdge: 1024, quality: 0.65 },
];

/**
 * Shrink a photo until it is under `capBytes` (owner, 2026-10-06: "If we have a MOV or HEIC file
 * type that exceeds the limit, we need to be able to either reduce the quality or break it into
 * parts until it will all upload nicely"). The first pass that fits wins, so the photo loses only
 * as much as it has to. HEIC has already become JPEG by the time it gets here (heic-upload-guard).
 */
export async function fitImageToLimit(file: File, capBytes: number): Promise<File> {
  if (file.size <= capBytes) return file;
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” is not a photo, so it cannot be shrunk.`);
  let img: Awaited<ReturnType<typeof decode>>;
  try {
    img = await decode(file);
  } catch {
    throw new Error(`This browser could not open “${file.name}” to shrink it.`);
  }
  try {
    for (const pass of FIT_PASSES) {
      const size = shrinkPlan(img.width, img.height, pass.maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(img.source, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', pass.quality));
      canvas.width = 1; canvas.height = 1;
      if (blob && blob.size <= capBytes) {
        const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
  } finally {
    img.close();
  }
  throw new Error(`“${file.name}” is still over the limit at the smallest useful size.`);
}
