// lib/cad/persistence/heal-inline-images.ts
//
// One-time migration that converts legacy / fallback INLINE images
// (`ProjectImage.dataUrl` with no bucket `url`) into bucket-backed images
// (`url` + `storagePath`, with the heavy base64 `dataUrl` dropped).
//
// Why: inline base64 bloats the document JSON. Every autosave, cloud-save,
// and crash-recovery snapshot then has to serialize multi-MB strings, which
// is the main-thread jank + memory pressure behind the image-heavy-drawing
// crashes. Moving the bytes to the bucket makes the working document (and
// every save derived from it) small, and the renderer already prefers
// `url ?? dataUrl`, so nothing visual changes.
//
// New images already upload via `uploadProjectImage()`; this heals drawings
// authored before that path existed, or whose upload fell back to inline
// after a network failure.

import type { ProjectImage } from '../types';

/** True when an image carries inline base64 but no bucket URL — i.e. it's a
 *  candidate for healing. */
export function isInlineImage(img: ProjectImage): boolean {
  return !!img.dataUrl && !img.url;
}

/** Upload one inline image's base64 to the bucket. Returns the healed
 *  ProjectImage (`url` + `storagePath`, no `dataUrl`) on success, or `null`
 *  when there's nothing to do or the upload failed — in which case the caller
 *  keeps the original so the image is never lost. */
export async function healInlineImage(img: ProjectImage): Promise<ProjectImage | null> {
  if (!isInlineImage(img)) return null;
  try {
    const res = await fetch('/api/admin/cad/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: img.dataUrl, name: img.name }),
    });
    if (!res.ok) return null;
    const { url, storagePath } = (await res.json()) as { url: string; storagePath: string };
    if (!url) return null;
    const healed: ProjectImage = { ...img, url, storagePath };
    delete healed.dataUrl; // the bytes now live in the bucket
    return healed;
  } catch {
    // Network / endpoint failure — leave the inline image untouched.
    return null;
  }
}

/** Heal every inline image in `images`, one at a time (sequential to avoid
 *  holding many multi-MB payloads in flight at once). Calls `onHealed` for
 *  each image successfully moved to the bucket so the caller can update its
 *  store incrementally. Resolves to the number of images healed. */
export async function healInlineImages(
  images: ProjectImage[],
  onHealed: (healed: ProjectImage) => void,
): Promise<number> {
  let count = 0;
  for (const img of images) {
    if (!isInlineImage(img)) continue;
    const healed = await healInlineImage(img);
    if (healed) {
      onHealed(healed);
      count += 1;
    }
  }
  return count;
}
