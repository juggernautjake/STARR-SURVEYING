// lib/jobs/hub.ts — pure display derivations for the Work Mode field hub (B2/A3).
//
// Kept off the component so they're unit-testable and shared (the job picker and the Job-tab header
// showed the same label two different ways before this). No React / no I/O.

/** A job's short label: "job_number · name", dropping whichever is blank, falling back to `fallbackId`
 *  (then '') so the picker never renders an empty option. */
export function jobLabel(job: { job_number?: string | null; name?: string | null }, fallbackId?: string): string {
  return [job.job_number, job.name].filter(Boolean).join(' · ') || fallbackId || '';
}

/** Group a job's files by section for the A3 documents/research panel — section title-cased ('general'
 *  when blank), files kept in first-seen order, and the sections themselves in first-seen order. Generic
 *  so any file-shaped row with a `section` works.
 *
 *  Grouping is case-INSENSITIVE so the same section arriving in different casing from different sources
 *  (file_nodes vs the read-only `mnt:` mounts) doesn't fragment — "general", "General" and "GENERAL" are
 *  one group. The DISPLAY label is the first-seen casing, title-cased, which preserves acronyms a blanket
 *  lowercase would mangle ("USGS Data", not "Usgs Data"). */
export function groupFilesBySection<T extends { section?: string | null }>(files: T[]): [string, T[]][] {
  const byKey = new Map<string, { label: string; items: T[] }>();
  for (const f of files) {
    const raw = f.section || 'general';
    const key = raw.toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = { label: raw.replace(/\b\w/g, (c) => c.toUpperCase()), items: [] };
      byKey.set(key, group);
    }
    group.items.push(f);
  }
  return [...byKey.values()].map((g) => [g.label, g.items]);
}

export interface MediaItemLike {
  media_type?: string | null;
  storage_signed_url?: string | null;
  thumbnail_signed_url?: string | null;
  original_signed_url?: string | null;
}
export interface MediaDisplay {
  /** Thumbnail source: the thumbnail URL, falling back to the full-res storage URL. */
  thumbUrl: string | undefined;
  /** Where the tile links: the original URL, falling back to the storage URL. */
  openUrl: string | undefined;
  /** Render the thumbnail <img> (photos with a thumb) vs the kind glyph. */
  showImage: boolean;
  /** Glyph for non-photo / thumbless media. */
  icon: string;
}

/** Derive the review-tile display for one captured `field_media` item (B4 review side): which URL to
 *  show, which to open, and whether it's an image thumbnail or a kind icon. Pure so the fallback order
 *  (thumbnail→storage for the thumb, original→storage for the link) is testable and can't silently flip. */
export function mediaDisplay(m: MediaItemLike): MediaDisplay {
  const thumbUrl = m.thumbnail_signed_url || m.storage_signed_url || undefined;
  const openUrl = m.original_signed_url || m.storage_signed_url || undefined;
  const isPhoto = m.media_type === 'photo' || !m.media_type;
  return {
    thumbUrl,
    openUrl,
    showImage: !!thumbUrl && isPhoto,
    icon: m.media_type === 'video' ? '🎬' : m.media_type === 'voice' ? '🎙' : '📄',
  };
}
