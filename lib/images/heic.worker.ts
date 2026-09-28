// lib/images/heic.worker.ts
//
// Decodes a HEIC off the main thread. A 12 MP iPhone photo takes roughly a second to decode; on the
// main thread that second is a frozen page with a frozen "Converting photo…" indicator, which reads
// as a crash. In a worker the page stays live.
//
// The ~2 MB libheif WebAssembly bundle is imported DYNAMICALLY here, so it becomes its own chunk that
// is fetched the first time somebody actually uploads a HEIC — never on page load, never in the
// main bundle.
//
// Encoding: with OffscreenCanvas (every current browser, Safari since 16.4) the worker encodes the
// JPEG itself and posts back a Blob. Without it, the worker posts the RGBA back and the page encodes
// with an ordinary canvas.

import { decodeHeicPrimary, type LibheifLike } from './heic-decode-core';

interface Request { id: number; buffer: ArrayBuffer; quality: number; maxPixels?: number }

type WorkerScope = {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const scope = self as unknown as WorkerScope;

let libheif: Promise<LibheifLike> | null = null;
function loadLibheif(): Promise<LibheifLike> {
  if (!libheif) {
    libheif = import('libheif-js/libheif-wasm/libheif-bundle.mjs').then((m) => m.default());
  }
  return libheif;
}

scope.onmessage = async (e) => {
  const { id, buffer, quality } = e.data;
  try {
    const decoded = await decodeHeicPrimary(await loadLibheif(), new Uint8Array(buffer));
    const { width, height, data, imageCount } = decoded;
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(new ImageData(data, width, height), 0, 0);
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
          scope.postMessage({ id, blob, width, height, imageCount });
          return;
        }
      } catch {
        /* canvas too large for this browser, or no 2d context — let the page try */
      }
    }
    scope.postMessage({ id, rgba: data.buffer, width, height, imageCount }, [data.buffer as ArrayBuffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
