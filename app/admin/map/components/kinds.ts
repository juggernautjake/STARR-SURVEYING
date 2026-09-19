// app/admin/map/components/kinds.ts — what a file IS, said once.
//
// Lifted from the image-based map on 2026-09-19, when that page was retired for Google satellite
// imagery. None of this was ever about the picture underneath: a photograph is a photograph whether
// it hangs on a pin over an aerial or over a parcel.
import { Camera, FileText, Music, Video, type LucideIcon } from 'lucide-react';
import type { MediaKind } from '@/lib/jobs/property-map';
import type { LibraryFile } from '@/lib/jobs/property-map-server';

export const KIND_ICON: Record<MediaKind, LucideIcon> = {
  image: Camera,
  video: Video,
  audio: Music,
  document: FileText,
};

/** Singular, because it labels one tile. "Photo · 2.4 MB", not "Photos · 2.4 MB". */
export const KIND_ONE: Record<MediaKind, string> = {
  image: 'Photo', video: 'Video', audio: 'Audio', document: 'Document',
};

/**
 * What the "On 4" chip says.
 *
 * A file can hang on several points since 2026-09-18, so this lists them: "On 2, 7". A file held by
 * a point on ANOTHER map of the same job comes back with an ordinal of 0 — the numbering is per-map
 * — and "On 0" is a lie, so that case says so plainly instead.
 *
 * Capped at three numbers: the chip sits under a 6.5rem tile, and a photograph of a whole fence line
 * can legitimately be on eight points. "On 2, 7, 9 +5" still answers "where did this end up?"
 * without the tile growing a second row.
 */
export function assignedChip(file: LibraryFile): string {
  const ords = file.assignedTo.map((a) => a.ordinal).filter((n) => n > 0).sort((a, b) => a - b);
  if (!ords.length) return file.assignedTo.length ? 'Assigned' : '';
  const shown = ords.slice(0, 3).join(', ');
  return ords.length > 3 ? `On ${shown} +${ords.length - 3}` : `On ${shown}`;
}

/** Unplaced first, then newest first — the panel is a to-do list, and the thing most likely to be
 *  wanted next is the photograph that came off the camera last. */
export function sortLibrary(files: LibraryFile[]): LibraryFile[] {
  return [...files].sort((a, b) => {
    const placed = Number(a.assignedTo.length > 0) - Number(b.assignedTo.length > 0);
    if (placed !== 0) return placed;
    return String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? ''));
  });
}
