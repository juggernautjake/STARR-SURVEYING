// lib/cad/persistence/project-image.ts
//
// Persist an image to the project: upload it to the cloud image bucket
// (so it survives reloads and is shared) and return a ProjectImage ready
// for drawingStore.addProjectImage(). Falls back to an inline data URL if
// the upload endpoint is unavailable, so the image is never lost.
import type { ProjectImage } from '../types';

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read image file.'));
    r.readAsDataURL(file);
  });
}

export function imageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve({ width: 0, height: 0 }); return; }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

/** Upload `file` to the project image bucket and return its ProjectImage. */
export async function uploadProjectImage(file: File, name: string): Promise<ProjectImage> {
  const dataUrl = await fileToDataUrl(file);
  const { width, height } = await imageDimensions(dataUrl);
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const addedAt = new Date().toISOString();
  try {
    const res = await fetch('/api/admin/cad/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, name }),
    });
    if (res.ok) {
      const { url, storagePath } = (await res.json()) as { url: string; storagePath: string };
      return { id, name, url, storagePath, originalWidth: width, originalHeight: height, addedAt };
    }
  } catch {
    /* network/endpoint failure — fall back to inline data URL */
  }
  return { id, name, dataUrl, originalWidth: width, originalHeight: height, addedAt };
}
