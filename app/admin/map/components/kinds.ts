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
 * What the chip under a placed file says.
 *
 * Owner, 2026-09-19: "I want to get rid of point numbers altogether and just have names for the
 * points." It used to read "On 2, 7". A name is much longer than a numeral and the chip sits under a
 * 6.5rem tile, so one point is NAMED and several are COUNTED — "On NE corner rod" or "On 3 points".
 * The full list is still in the tile's tooltip and in the viewer's details, where there is room.
 *
 * A file held by a point on another map of the same job comes back with no usable title, which is
 * why the single-point case falls back to a bare word rather than an empty chip.
 */
export function assignedChip(file: LibraryFile): string {
  const on = file.assignedTo;
  if (!on.length) return '';
  if (on.length === 1) return on[0]!.title ? `On ${on[0]!.title}` : 'Assigned';
  return `On ${on.length} points`;
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
