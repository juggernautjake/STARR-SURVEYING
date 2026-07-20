// lib/dnd/media-storage.ts — storage helpers for D&D media rows.
//
// This lives OUTSIDE the route file on purpose. A Next.js route module may only export
// recognised handlers (GET/POST/DELETE/…); exporting a helper alongside them fails the
// generated route type-check at BUILD time with "Property 'x' is incompatible with index
// signature… not assignable to type 'never'". `tsc --noEmit` does not catch it, because the
// check lives in Next's generated .next/types — so it only appears in `next build`.

/** The storage bucket D&D media is uploaded to. */
export const DND_MEDIA_BUCKET = 'dnd-media';

/** The in-bucket path from a public storage URL, or null if it isn't one of ours.
 *  Public URLs look like …/storage/v1/object/public/<bucket>/<key>. */
export function storageKeyFromUrl(url: string | null, bucket: string = DND_MEDIA_BUCKET): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const key = url.slice(i + marker.length).split('?')[0];
  return key ? decodeURIComponent(key) : null;
}
